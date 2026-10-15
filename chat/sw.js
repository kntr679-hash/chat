self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// プッシュ通知を受け取ったら表示する(見ているときは音なし)
self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const seeing = wins.some((c) => c.visibilityState === "visible");
    await self.registration.showNotification(d.title || "新着メッセージ", {
      body: d.body || "", tag: d.tag,
      silent: seeing, data: { url: d.url || "./" },
    });
  })());
});

// 通知をタップしたら、開いているタブを前に出す(なければ開く)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.length) return wins[0].focus();
    return self.clients.openWindow(url);
  })());
});
