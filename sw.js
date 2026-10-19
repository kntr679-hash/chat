// サービスワーカー: アプリを閉じているときのプッシュ通知を受け取って表示する
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// ページを開くたびに、最新の index.html を取りに行く(ホーム画面のアプリが古い版を使い続けないように)
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(
    fetch(e.request.url, { cache: "no-store" })
      .then((r) => (r.redirected ? fetch(e.request) : r))
      .catch(() => fetch(e.request)),
  );
});

self.addEventListener("push", (e) => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil((async () => {
    // (見ているときの通知は、サーバー側で送らないようにしてある)
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const seeing = wins.some((c) => c.visibilityState === "visible");
    await self.registration.showNotification(d.title || "新着メッセージ", {
      body: d.body || "",
      tag: d.tag,
      silent: seeing,
      // 着信は、タップするまで残して、バイブも長めにする
      requireInteraction: !!d.call,
      vibrate: d.call ? [300, 150, 300, 150, 300, 150, 300] : undefined,
      renotify: !!d.call,
      data: { url: d.url || "./" },
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
