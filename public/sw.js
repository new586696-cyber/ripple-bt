/* Ripple service worker — Web Push receiver. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Ripple", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Ripple";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/chats" },
    renotify: Boolean(payload.tag),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/chats";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.focus().then(() => client.navigate(target));
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
