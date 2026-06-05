// PWA Client script for FFW Übungsplaner

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(registration) {
        console.log('FFW Übungsplaner Service Worker erfolgreich registriert mit Scope:', registration.scope);
      })
      .catch(function(err) {
        console.error('FFW Übungsplaner Service Worker Registrierung fehlgeschlagen:', err);
      });
  });
}
