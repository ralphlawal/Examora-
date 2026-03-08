// EXAMORA Service Worker — v6 · examora.com.ng
// Bump this version string every deployment to force cache refresh
const CACHE_VERSION = "examora-v6";
const CACHE = CACHE_VERSION;

const SHELL = [
  "/index.html","/login.html","/exam.html","/result.html",
  "/analytics.html","/history.html","/leaderboard.html","/profile.html",
  "/bookmarks.html","/daily-challenge.html","/upgrade.html",
  "/onboarding.html","/chat.html","/mock.html",
  "/offline.html","/school.html","/flashcards.html","/notes.html",
  "/notifications.html","/planner.html","/share-result.html",
  "/vocabulary.html","/summariser.html","/solver.html",
  "/wrong-drill.html","/model-answer.html","/essay-check.html",
  "/topic-practice.html","/formula-sheet.html","/calculator.html",
  "/countdown.html","/streak.html","/syllabus.html",
  "/certificate.html","/scholarship.html","/group-study.html",
  "/mindset.html","/parent.html",
  "/nova.html","/daily-brief.html","/study-timer.html",
  "/gpa-calculator.html","/discover.html","/dictionary.html",
  "/books.html","/trivia.html","/university.html",
  "/settings.html","/help.html","/news.html","/terms.html",
  "/privacy.html","/404.html","/notifications-setup.html",
  "/style.css","/ai-engine.js","/security.js","/click-guard.js",
  "/questions.js","/manifest.json","/logo.png"
];

// ── Install: cache shell ──────────────────────────────────────
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" }))))
      .catch(() => {}) // non-fatal if some files missing
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete ALL old caches ──────────────────────────
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log("[SW] Deleting old cache:", k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
      // Tell all open tabs to reload so they get fresh files
      .then(() => self.clients.matchAll({ type: "window" }))
      .then(clients => clients.forEach(c => c.postMessage({ type: "SW_UPDATED" })))
  );
});

// ── Fetch: network-first for HTML, cache-first for assets ────
self.addEventListener("fetch", e => {
  const { request } = e;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Always go to network for Firebase/API calls
  const networkOnly = [
    "firestore.googleapis.com", "firebase", "gstatic.com",
    "googleapis.com", "paystack", "openrouter", "fonts.googleapis",
    "cdnjs.cloudflare", "html2canvas", "quotable.io", "numbersapi.com",
    "opentdb.com", "dictionaryapi.dev", "api.adviceslip.com"
  ];
  if (networkOnly.some(s => url.hostname.includes(s) || url.href.includes(s))) return;

  // HTML pages: network-first (always get latest code)
  if (request.headers.get("accept")?.includes("text/html") ||
      url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/offline.html");
        })
    );
    return;
  }

  // JS/CSS/images: network-first, cache fallback
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok && res.status === 200) {
          const ext = url.pathname.split(".").pop().toLowerCase();
          if (["css","js","png","jpg","webp","json","svg","ico"].includes(ext)) {
            caches.open(CACHE).then(c => c.put(request, res.clone()));
          }
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.headers.get("accept")?.includes("text/html"))
          return caches.match("/offline.html");
      })
  );
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener("push", e => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || "EXAMORA", {
      body:    data.body  || "You have a new update!",
      icon:    "/logo.png",
      badge:   "/logo.png",
      tag:     data.tag   || "examora-notif",
      data:    { url: data.url || "/index.html" },
      vibrate: [200, 100, 200],
      actions: [
        { action: "open",    title: "Open App" },
        { action: "dismiss", title: "Dismiss"  }
      ]
    })
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if (e.action === "dismiss") return;
  const url = e.notification.data?.url || "/index.html";
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clients => {
      const existing = clients.find(c => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
