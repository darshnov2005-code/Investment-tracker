"use strict";
(async function(){
  try{
    const [a,b] = await Promise.all([
      fetch("/app.p1.txt").then(r=>{if(!r.ok)throw new Error("p1");return r.text()}),
      fetch("/app.p2.txt").then(r=>{if(!r.ok)throw new Error("p2");return r.text()})
    ]);
    (0,eval)(a+b);
  }catch(e){
    document.body.innerHTML='<pre style="color:#ef8d8d;padding:20px">Failed to load app: '+e+'</pre>';
    console.error(e);
  }
})();
