const SURUM = "arac-v2";
// Yollar sw.js'in klasörüne göre (GitHub Pages'te /araclarimiz/)
const KOK = self.registration.scope;
const KABUK = ["./", "app.js", "hesap.js", "style.css", "manifest.webmanifest", "ikon/192.png", "ikon/rozet.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a.startsWith("arac-") && a !== SURUM).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

// Önce internetten (güncel kalsın), internet yoksa önbellekten. Veri isteği (Netlify) karışmaz.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.href.startsWith(KOK)) return;
  e.respondWith(
    fetch(e.request)
      .then((cevap) => {
        if (cevap.ok) {
          const kopya = cevap.clone();
          caches.open(SURUM).then((c) => c.put(e.request, kopya));
        }
        return cevap;
      })
      .catch(() => caches.match(e.request).then((c) => c || caches.match(KOK)))
  );
});

self.addEventListener("push", (e) => {
  let veri = {};
  try { veri = e.data ? e.data.json() : {}; } catch { veri = { govde: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(veri.baslik || "Araçlarımız", {
      body: veri.govde || "",
      icon: KOK + "ikon/192.png",
      badge: KOK + "ikon/rozet.png",
      tag: veri.etiket || "arac",
      renotify: true,
      data: { url: KOK },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((pencereler) => {
      for (const p of pencereler) if (p.url.startsWith(KOK) && "focus" in p) return p.focus();
      return self.clients.openWindow(KOK);
    })
  );
});
