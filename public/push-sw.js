// Push notifications worker (not an offline cache).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Courier", body: event.data && event.data.text() }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Skip message pings while the app is open and on screen; calls always show.
    if (d.kind !== "call" && wins.some((w) => w.visibilityState === "visible" && w.focused)) return;
    await self.registration.showNotification(d.title || "Courier", {
      body: d.body || "",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: d.kind === "call" ? "call-" + d.conversationId : "msg-" + d.conversationId,
      renotify: true,
      requireInteraction: d.kind === "call",
      vibrate: d.kind === "call" ? [400, 200, 400, 200, 400] : [150],
      data: { url: d.url || "/chat" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) { if ("focus" in w) { await w.focus(); return; } }
    await self.clients.openWindow(url);
  })());
});
