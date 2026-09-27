"use strict";
(async function(){
  try{
    const urls=['/chunk0.js', '/chunk1.js', '/chunk2.js', '/chunk3.js', '/chunk4.js', '/chunk5.js', '/chunk6.js', '/chunk7.js', '/chunk8.js', '/chunk9.js', '/chunk10.js', '/chunk11.js', '/chunk12.js'];
    const parts=await Promise.all(urls.map(u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u);return r.text()})));
    (0,eval)(parts.join(""));
  }catch(e){
    document.body.innerHTML='<pre style="color:#ef8d8d;padding:20px;font:14px system-ui">Failed to load app: '+e+
      '\n\nQuick fix: open GitHub → app.js → restore from commit e588f66</pre>';
    console.error(e);
  }
})();
