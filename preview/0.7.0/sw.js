const CACHE='lr-preview-0.7.0-v1';
const FILES=['./','./index.html','./data.js','./progression.js','./avatar.css','./avatar-component.js','./avatar-demo.html','./history.css','./history.js','./manifest.webmanifest','./icon.svg'];
function fetchWithDeadline(request){
 const controller=new AbortController();let timer;
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Network timeout'))},2500)});
 return Promise.race([fetch(request,{signal:controller.signal}),deadline]).finally(()=>clearTimeout(timer));
}
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lr-preview-0.7.0-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetchWithDeadline(event.request).then(response=>{
  if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}
  return response;
 }).catch(()=>matchOwn(event.request).then(cached=>cached|| (event.request.mode==='navigate'?matchOwn('./index.html'):Response.error()))));
});

function matchOwn(request){return caches.open(CACHE).then(cache=>cache.match(request))}
