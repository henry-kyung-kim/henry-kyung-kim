/* 하루한장 서비스 워커 — 푸시 알림 수신 전용.
   오프라인 캐싱은 하지 않음 (fetch 이벤트를 가로채지 않음). */
"use strict";

self.addEventListener("install", function(){
  self.skipWaiting();
});

self.addEventListener("activate", function(e){
  e.waitUntil(self.clients.claim());
});

self.addEventListener("push", function(e){
  var payload = {};
  try{
    payload = e.data ? e.data.json() : {};
  }catch(err){
    payload = { title:"하루한장", body: e.data ? e.data.text() : "" };
  }
  var title = payload.title || "하루한장";
  var options = {
    body: payload.body || "",
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
    data: { url: payload.url || "./index.html" },
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%23F5F6F3'/%3E%3Ctext x='50' y='68' font-size='60' text-anchor='middle'%3E%F0%9F%93%86%3C/text%3E%3C/svg%3E"
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./index.html";
  e.waitUntil(
    self.clients.matchAll({ type:"window", includeUncontrolled:true }).then(function(list){
      for(var i=0;i<list.length;i++){
        if("focus" in list[i]) return list[i].focus();
      }
      if(self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
