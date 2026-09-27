"use strict";
(async function(){
  try{
    const urls = ["/app.part0.txt","/app.part1.txt","/app.part2.txt","/app.part3.txt"];
    const parts = await Promise.all(urls.map(u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u);return r.text()})));
    (0,eval)(parts.join(""));
  }catch(e){
    document.body.innerHTML='<pre style="color:#ef8d8d;padding:20px">Failed to load app: '+e+'\nHard-refresh or restore app.js from git history e588f66.</pre>';
    console.error(e);
  }
})();
