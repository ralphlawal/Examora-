// EXAMORA Service Worker — v2
const CACHE = "examora-v2";
const SHELL = [
  "/index.html","/login.html","/exam.html","/result.html",
  "/analytics.html","/history.html","/leaderboard.html","/profile.html",
  "/bookmarks.html","/daily-challenge.html","/upgrade.html",
  "/onboarding.html","/admin.html","/404.html","/offline.html",
  "/style.css","/manifest.json","/logo.png","/sw.js"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const {request} = e;
  if(request.method !== "GET") return;
  const url = new URL(request.url);
  const networkOnly = ["firestore.googleapis.com","firebase","gstatic.com","googleapis.com","paystack"];
  if(networkOnly.some(s=>url.hostname.includes(s))) return;

  e.respondWith(
    fetch(request).then(res=>{
      if(res.ok){
        const ext = url.pathname.split(".").pop().toLowerCase();
        if(["html","css","js","png","jpg","webp","json"].includes(ext)){
          caches.open(CACHE).then(c=>c.put(request,res.clone()));
        }
      }
      return res;
    }).catch(async()=>{
      const cached = await caches.match(request);
      if(cached) return cached;
      if(request.headers.get("accept")?.includes("text/html"))
        return caches.match("/offline.html") || caches.match("/index.html");
    })
  );
});

self.addEventListener("push", e => {
  const data = e.data?.json()||{};
  e.waitUntil(self.registration.showNotification(data.title||"EXAMORA ⚡",{
    body:  data.body||"Your daily challenge is waiting!",
    icon:  "/logo.png", badge:"/logo.png",
    tag:   data.tag||"examora-notif",
    data:  {url:data.url||"/daily-challenge.html"},
    vibrate:[200,100,200],
    actions:[{action:"open",title:"Open App"},{action:"dismiss",title:"Dismiss"}]
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  if(e.action==="dismiss") return;
  const url = e.notification.data?.url||"/";
  e.waitUntil(
    clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
      const ex = list.find(c=>c.url.includes(self.location.origin));
      if(ex){ex.focus();ex.navigate(url);}
      else clients.openWindow(url);
    })
  );
});
