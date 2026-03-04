// EXAMORA Service Worker — v4 · examora.com.ng
const CACHE = "examora-v4";
const SHELL = [
  "/index.html","/login.html","/exam.html","/result.html",
  "/analytics.html","/history.html","/leaderboard.html","/profile.html",
  "/bookmarks.html","/daily-challenge.html","/upgrade.html",
  "/onboarding.html","/admin.html","/chat.html","/mock.html",
  "/offline.html","/school.html","/flashcards.html","/notes.html",
  "/notifications.html","/planner.html","/share-result.html",
  "/style.css","/ai-engine.js","/manifest.json","/logo.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u,{cache:"reload"})))).catch(()=>{})
    .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const {request} = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const networkOnly = ["firestore.googleapis.com","firebase","gstatic.com","googleapis.com","paystack","openrouter","fonts.googleapis","cdnjs.cloudflare","html2canvas"];
  if (networkOnly.some(s => url.hostname.includes(s) || url.href.includes(s))) return;

  e.respondWith(
    fetch(request).then(res => {
      if (res.ok && res.status === 200) {
        const ext = url.pathname.split(".").pop().toLowerCase();
        if (["html","css","js","png","jpg","webp","json","svg"].includes(ext)) {
          caches.open(CACHE).then(c => c.put(request, res.clone()));
        }
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.headers.get("accept")?.includes("text/html"))
        return caches.match("/index.html");
    })
  );
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener("push", e => {
  const data = e.data?.json() || {};
  const options = {
    body:    data.body  || "You have a new update from EXAMORA!",
    icon:    "/logo.png",
    badge:   "/logo.png",
    tag:     data.tag   || "examora-notif",
    data:    { url: data.url || "/index.html" },
    vibrate: [200, 100, 200, 100, 200],
    actions: [
      { action: "open",    title: "Open App" },
      { action: "dismiss", title: "Dismiss"  }
    ],
    requireInteraction: data.requireInteraction || false
  };
  e.waitUntil(
    self.registration.showNotification(data.title || "EXAMORA ⚡", options)
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "dismiss") return;
  const url = e.notification.data?.url || "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin) && "focus" in c);
      if (existing) { existing.focus(); existing.navigate && existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// ── Background Sync (offline task completion) ─────────────────
self.addEventListener("sync", e => {
  if (e.tag === "sync-results") {
    e.waitUntil(syncPendingResults());
  }
});

async function syncPendingResults() {
  // Handled by the main app when it comes back online
  const allClients = await clients.matchAll();
  allClients.forEach(c => c.postMessage({ type: "SYNC_RESULTS" }));
}

// ── Periodic Background Sync (study reminders) ────────────────
self.addEventListener("periodicsync", e => {
  if (e.tag === "daily-reminder") {
    e.waitUntil(sendStudyReminder());
  }
});

async function sendStudyReminder() {
  const hour = new Date().getHours();
  if (hour >= 18 && hour <= 21) {
    await self.registration.showNotification("📚 Study Time!", {
      body: "Don't break your streak! Complete today's practice.",
      icon: "/logo.png", badge: "/logo.png",
      tag: "daily-reminder",
      data: { url: "/daily-challenge.html" },
      actions: [{ action: "open", title: "Start Now" }]
    });
  }
}

// ── Message handler (from main thread) ────────────────────────
self.addEventListener("message", e => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data?.type === "SEND_NOTIF") {
    self.registration.showNotification(e.data.title || "EXAMORA", {
      body: e.data.body || "",
      icon: "/logo.png", badge: "/logo.png",
      tag: e.data.tag || "examora-msg",
      data: { url: e.data.url || "/index.html" }
    });
  }
});
