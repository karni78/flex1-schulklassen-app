const CACHE="flex1-v3";
const CORE=["/","/login","/style.css","/app.js","/manifest.webmanifest","/icons/icon-192.svg","/icons/icon-512.svg"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{ if(e.request.method!=="GET" || e.request.url.includes("/api/") || e.request.url.includes("/uploads/")) return; e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const copy=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,copy)); return r}).catch(()=>caches.match("/login")))); });
