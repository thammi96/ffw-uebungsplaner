const express = require('express');
const msal = require('@azure/msal-node');
const { logAudit } = require('../db');

const router = express.Router();

// MSAL Confidential Client Configuration
let pca = null;

function getMsalClient() {
  if (pca) return pca;

  const clientId = process.env.ENTRA_CLIENT_ID;
  const clientSecret = process.env.ENTRA_CLIENT_SECRET;
  const tenantId = process.env.ENTRA_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    return null;
  }

  const config = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    }
  };

  pca = new msal.ConfidentialClientApplication(config);
  return pca;
}

// Redirect to Microsoft Login
router.get('/login', (req, res) => {
  const msalClient = getMsalClient();
  const localDebugEnabled = process.env.LOCAL_DEBUG_ADMIN === 'true';

  if (!msalClient) {
    if (localDebugEnabled) {
      return res.redirect('/auth/debug');
    }
    return res.status(500).send('Microsoft Entra ID ist nicht konfiguriert und der lokale Debug-Modus ist deaktiviert.');
  }

  const authCodeUrlParameters = {
    scopes: ["user.read", "Directory.Read.All"], // Directory.Read.All or GroupMember.Read.All to query groups if not in claims
    redirectUri: process.env.ENTRA_REDIRECT_URI,
  };

  msalClient.getAuthCodeUrl(authCodeUrlParameters)
    .then((response) => {
      res.redirect(response);
    })
    .catch((error) => {
      console.error('Error generating auth URL:', error);
      res.status(500).send('Fehler beim Starten des Login-Prozesses.');
    });
});

// Callback from Microsoft login
router.get('/callback', async (req, res) => {
  const msalClient = getMsalClient();
  if (!msalClient) {
    return res.status(500).send('Microsoft Entra ID Client nicht initialisiert.');
  }

  const tokenRequest = {
    code: req.query.code,
    scopes: ["user.read"],
    redirectUri: process.env.ENTRA_REDIRECT_URI,
  };

  try {
    const response = await msalClient.acquireTokenByCode(tokenRequest);
    const account = response.account;
    const claims = response.idTokenClaims || {};
    const groups = claims.groups || [];
    
    const adminGroupId = process.env.ENTRA_ADMIN_GROUP_ID;
    let isAuthorized = false;

    // Method 1: Check groups claim in token
    if (adminGroupId && groups.includes(adminGroupId)) {
      isAuthorized = true;
    }

    // Method 2: If group not in claim, query Microsoft Graph API using the access token
    if (!isAuthorized && adminGroupId && response.accessToken) {
      try {
        // Fallback check if we can query memberOf endpoint using global fetch
        const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me/transitiveMemberOf?$select=id', {
          headers: {
            'Authorization': `Bearer ${response.accessToken}`
          }
        });
        if (graphResponse.ok) {
          const data = await graphResponse.json();
          const memberGroups = data.value || [];
          isAuthorized = memberGroups.some(g => g.id === adminGroupId);
        }
      } catch (err) {
        console.error('Error verifying group via Microsoft Graph API:', err);
      }
    }

    // If no admin group ID is configured, we warn but let them in (for simple setup)
    if (!adminGroupId) {
      console.warn('ENTRA_ADMIN_GROUP_ID ist nicht gesetzt. Zugriff wird allen authentifizierten Entra ID Benutzern gewährt.');
      isAuthorized = true;
    }

    if (!isAuthorized) {
      logAudit(
        null,
        account.username,
        'LOGIN_FAILURE',
        `Entra ID Benutzer gehört nicht der Admin-Gruppe an (Gruppe: ${adminGroupId})`,
        req.ip
      );
      return res.status(403).send('Zugriff verweigert: Du bist kein Mitglied der erforderlichen Administrator-Gruppe.');
    }

    // Login successful
    req.session.admin = {
      name: account.name,
      email: account.username,
      provider: 'entra'
    };

    logAudit(
      null,
      account.username,
      'LOGIN_SUCCESS',
      'Erfolgreiche Anmeldung über Microsoft Entra ID',
      req.ip
    );

    res.redirect('/admin');
  } catch (error) {
    console.error('Error acquiring token:', error);
    res.status(500).send('Fehler bei der Authentifizierung mit Entra ID.');
  }
});

// Local Debug Login Bypass
router.get('/debug', (req, res) => {
  if (process.env.LOCAL_DEBUG_ADMIN !== 'true') {
    return res.status(403).send('Lokaler Debug-Modus ist deaktiviert.');
  }

  const debugName = process.env.LOCAL_DEBUG_ADMIN_NAME || 'Test Admin (Lokal)';
  req.session.admin = {
    name: debugName,
    email: 'debug@local',
    provider: 'local'
  };

  logAudit(
    null,
    debugName,
    'LOGIN_SUCCESS_DEBUG',
    'Erfolgreiche Anmeldung über lokalen Debug-Modus (Bypass)',
    req.ip
  );

  res.redirect('/admin');
});

// Logout
router.get('/logout', (req, res) => {
  const admin = req.session.admin;
  if (admin) {
    logAudit(
      null,
      admin.name,
      'LOGOUT',
      `Abmeldung von Administrator (${admin.provider})`,
      req.ip
    );
  }
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login-view');
  });
});

// Login Page UI Redirect helper
router.get('/login-view', (req, res) => {
  res.render('login', {
    localDebug: process.env.LOCAL_DEBUG_ADMIN === 'true',
    entraConfigured: !!(process.env.ENTRA_CLIENT_ID && process.env.ENTRA_CLIENT_SECRET && process.env.ENTRA_TENANT_ID)
  });
});

module.exports = router;
