self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : { titulo: 'La Barrita', msj: 'Nueva notificación' };
    const options = {
        body: data.msj,
        icon: '/imagenes/icono.png', // Asegúrate de tener un icono aquí o dejarlo vacío
        badge: '/imagenes/icono.png',
        vibrate: [200, 100, 200, 100, 200], // Vibración fuerte para que el mesero/cliente lo sienta
        data: { url: data.url || '/' }
    };
    event.waitUntil(self.registration.showNotification(data.titulo, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            if (windowClients.length > 0) {
                windowClients[0].focus();
            } else {
                clients.openWindow(event.notification.data.url);
            }
        })
    );
});