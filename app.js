"use strict";
(async function(){
  try{
    const urls=['/b64.0.txt', '/b64.1.txt', '/b64.2.txt', '/b64.3.txt', '/b64.4.txt', '/b64.5.txt', '/b64.6.txt', '/b64.7.txt'];
    const parts=await Promise.all(urls.map(u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u);return r.text()})));
    const code=atob(parts.join(""));
    (0,eval)(code);
  }catch(e){
    document.body.innerHTML='<pre style="color:#ef8d8d;padding:20px">Failed to load app: '+e+'</pre>';
    console.error(e);
  }
})();
