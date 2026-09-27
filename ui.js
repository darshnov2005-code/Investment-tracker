"use strict";
/* InvestTrack quick UI layer — loads after core app */
(function(){
  function $(id){return document.getElementById(id)}
  function toast(msg,ms){
    ms=ms||2200;
    var t=$("toast");
    if(!t){t=document.createElement("div");t.id="toast";t.className="toast";document.body.appendChild(t)}
    t.textContent=msg;t.classList.add("show");
    clearTimeout(t._timer);t._timer=setTimeout(function(){t.classList.remove("show")},ms);
  }
  window.investToast=toast;

  // Bottom-nav Add button
  document.addEventListener("click",function(e){
    var add=e.target.closest("[data-add]");
    if(add){
      var btn=$("add");
      if(btn)btn.click();
      else if(typeof openTx==="function")openTx();
    }
  });

  // Highlight bottom nav when page changes
  var obs=new MutationObserver(function(){
    var title=($("title")&&$("title").textContent)||"";
    var map={Dashboard:"dashboard",Holdings:"holdings","Mutual Fund SIPs":"sips","Settings / Data":"settings"};
    var page=null;
    Object.keys(map).forEach(function(k){if(title.indexOf(k)===0)page=map[k]});
    document.querySelectorAll(".bottomnav [data-page]").forEach(function(b){
      b.classList.toggle("active",b.dataset.page===page);
    });
  });
  if($("title"))obs.observe($("title"),{childList:true,characterData:true,subtree:true});

  // Soft onboarding (once)
  setTimeout(function(){
    try{
      if(localStorage.getItem("investtrack-onboarded"))return;
      if(document.getElementById("onboard"))return;
      var el=document.createElement("div");
      el.id="onboard";el.className="onboard";
      el.innerHTML='<div class="onboard-card"><h2>Welcome to InvestTrack</h2><p class="muted">Track Indian stocks, mutual funds & SIPs. Data stays in this browser.</p><ol class="onboard-steps"><li><b>Add investment</b> — stocks or mutual funds</li><li><b>SIPs</b> — log each installment with units & NAV</li><li><b>Refresh quotes</b> — keep prices up to date</li></ol><div class="modalfoot"><button class="btn" id="onboardDismiss">Got it</button><button class="btn primary" id="onboardAdd">＋ Add investment</button></div></div>';
      document.body.appendChild(el);
      $("onboardDismiss").onclick=function(){localStorage.setItem("investtrack-onboarded","1");el.remove()};
      $("onboardAdd").onclick=function(){localStorage.setItem("investtrack-onboarded","1");el.remove();var b=$("add");if(b)b.click()};
    }catch(_){}
  },600);

  // Friendlier empty cards
  function polishEmpty(){
    document.querySelectorAll(".card.empty,.empty").forEach(function(el){
      if(el.dataset.polished)return;
      var t=(el.textContent||"").trim();
      if(/No active holdings/i.test(t)){
        el.dataset.polished="1";
        el.innerHTML='<div style="font-size:16px;font-weight:700;margin-bottom:8px">No holdings yet</div><p class="muted">Add a stock, mutual fund or SIP to start tracking.</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px"><button class="btn primary" id="add2">＋ Add investment</button><button class="btn" data-page="sips">Set up SIP</button></div>';
      }else if(/No SIPs yet/i.test(t)){
        el.dataset.polished="1";
        el.innerHTML='<div style="font-size:16px;font-weight:700;margin-bottom:8px">No SIPs yet</div><p class="muted">Create a SIP plan, then record each installment with units and NAV.</p><button class="btn primary" id="addSip" style="margin-top:10px">＋ Add your first SIP</button>';
      }
    });
  }
  setInterval(polishEmpty,800);
  polishEmpty();

  // Escape closes modal
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){
      var mb=$("mb");
      if(mb&&!mb.classList.contains("hidden")){
        var close=$("close");
        if(close)close.click();
        else mb.classList.add("hidden");
      }
    }
  });

  // Toast on refresh
  document.addEventListener("click",function(e){
    if(e.target&&e.target.id==="refresh"){
      setTimeout(function(){toast("Refreshing quotes…")},50);
    }
  });
})();
