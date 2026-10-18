// No fetch handler or chat cache: the worker only displays notifications requested by the live page.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
  event.notification.close();const account=event.notification.data?.account||'';
  event.waitUntil((async()=>{
    const scope=new URL(self.registration.scope),windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===scope.origin&&new URL(client.url).pathname.startsWith(scope.pathname));
    if(existing){await existing.focus();existing.postMessage({type:'acidum-open-account',account});}
    else await self.clients.openWindow(new URL('./#account='+encodeURIComponent(account),scope).href);
  })());
});
