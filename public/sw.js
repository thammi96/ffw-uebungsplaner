// Service Worker for Feuerwehr Übungsplaner PWA

self.addEventListener('push', function(event) {
  if (!event.data) {
    console.log('Push event received but contains no data.');
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (err) {
    console.warn('Push data is not JSON. Using text fallback:', event.data.text());
    data = {
      title: 'Neue Nachricht',
      body: event.data.text()
    };
  }

  const title = data.title || 'Terminerinnerung';
  const options = {
    body: data.body || 'Es gibt eine neue Übung. Bitte gib Rückmeldung!',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const targetUrl = event.notification.data ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If we find an open window under the same origin, navigate and focus it
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'navigate' in client) {
          client.focus();
          return client.navigate(targetUrl);
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
