"use strict";

const KEY="investtrack-v4", LEGACY_KEY="investtrack-v3", STATE_VERSION=4;
const DEMO=[
{id:"1",type:"STOCK",name:"Reliance Industries",symbol:"RELIANCE",exchange:"NSE",date:"2026-06-12",action:"BUY",qty:10,price:1420,charges:40,brokerage:0,stt:0,gst:0,otherCharges:40,notes:"Core holding"},
{id:"2",type:"STOCK",name:"HDFC Bank",symbol:"HDFCBANK",exchange:"NSE",date:"2026-07-04",action:"BUY",qty:18,price:1910,charges:35,brokerage:0,stt:0,gst:0,otherCharges:35,notes:""},
{id:"3",type:"STOCK",name:"TCS",symbol:"TCS",exchange:"NSE",date:"2026-05-22",action:"BUY",qty:5,price:3180,charges:25,brokerage:0,stt:0,gst:0,otherCharges:25,notes:""},
{id:"4",type:"MUTUAL_FUND",name:"Parag Parikh Flexi Cap Fund",symbol:"INF966L01216",exchange:"AMFI",date:"2026-06-05",action:"SIP",qty:75,price:82.4,charges:0,brokerage:0,stt:0,gst:0,otherCharges:0,notes:"Monthly SIP"},
{id:"5",type:"ETF",name:"Nippon India ETF Nifty BeES",symbol:"NIFTYBEES",exchange:"NSE",date:"2026-08-02",action:"BUY",qty:20,price:285,charges:8,brokerage:0,stt:0,gst:0,otherCharges:8,notes:""}
];

let q=JSON.parse(localStorage.getItem("investtrack-quotes")||"{}");
let saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(LEGACY_KEY)||"null");
let s=saved||{version:STATE_VERSION,transactions:DEMO,goals:[],settings:{privacy:{pinHash:"",autoLockMinutes:30},backup:{enabled:true,lastBackupAt:0,savesSinceBackup:0},market:{refreshTtl:60000}},meta:{lastSavedAt:0,lastQuoteRefreshAt:0}};
function normalizeState(){
  s.version=STATE_VERSION;
  if(!Array.isArray(s.transactions))s.transactions=[];
  if(!Array.isArray(s.goals))s.goals=[];
  s.settings=s.settings||{};
  s.settings.privacy=s.settings.privacy||{pinHash:"",autoLockMinutes:30};
  s.settings.backup=s.settings.backup||{enabled:true,lastBackupAt:0,savesSinceBackup:0};
  s.settings.market=s.settings.market||{refreshTtl:60000};
  s.meta=s.meta||{lastSavedAt:0,lastQuoteRefreshAt:0};
  s.transactions.forEach(t=>{t.charges=Number(t.charges)||0;t.brokerage=Number(t.brokerage)||0;t.stt=Number(t.stt)||0;t.gst=Number(t.gst)||0;t.otherCharges=Number(t.otherCharges)||Math.max(0,(Number(t.charges)||0)-t.brokerage-t.stt-t.gst)});
}
normalizeState();

let page="dashboard", mfCache=null, saveTimer=null, lastActivity=Date.now(), locked=false;

const $=id=>document.getElementById(id);
function esc(x){return String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function money(n){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(n)||0)}
function num(n){return new Intl.NumberFormat("en-IN",{maximumFractionDigits:3}).format(Number(n)||0)}
function pct(n){return (Number(n)>=0?"+":"")+Number(n||0).toFixed(2)+"%"}
function totalCharges(t){return Number(t.charges)||((Number(t.brokerage)||0)+(Number(t.stt)||0)+(Number(t.gst)||0)+(Number(t.otherCharges)||0))}
function price(t){return Number(q[t.symbol])>0?Number(q[t.symbol]):Number(t.price)||0}

function save(){s.version=STATE_VERSION;s.meta.lastSavedAt=Date.now();localStorage.setItem(KEY,JSON.stringify(s));clearTimeout(saveTimer);saveTimer=setTimeout(autoBackup,1000)}
function saveQuotes(){localStorage.setItem("investtrack-quotes",JSON.stringify(q))}
function autoBackup(){
  if(!s.settings.backup.enabled)return;
  const b=s.settings.backup;b.savesSinceBackup=(b.savesSinceBackup||0)+1;
  if(!b.lastBackupAt||Date.now()-b.lastBackupAt>86400000||b.savesSinceBackup>=10){
    backupToIndexedDB();b.lastBackupAt=Date.now();b.savesSinceBackup=0;localStorage.setItem(KEY,JSON.stringify(s));
  }
}
function backupToIndexedDB(){
  try{
    const r=indexedDB.open("InvestTrackBackups",1);
    r.onupgradeneeded=()=>r.result.createObjectStore("snapshots",{keyPath:"id",autoIncrement:true});
    r.onsuccess=()=>{const db=r.result,tx=db.transaction("snapshots","readwrite");tx.objectStore("snapshots").add({at:Date.now(),state:JSON.parse(JSON.stringify(s))});tx.oncomplete=()=>db.close()};
  }catch(e){console.warn("Automatic backup unavailable",e)}
}
function latestBackup(){
  return new Promise((resolve,reject)=>{
    try{
      const r=indexedDB.open("InvestTrackBackups",1);
      r.onupgradeneeded=()=>r.result.createObjectStore("snapshots",{keyPath:"id",autoIncrement:true});
      r.onsuccess=()=>{const db=r.result,req=db.transaction("snapshots","readonly").objectStore("snapshots").getAll();req.onsuccess=()=>{const a=req.result||[];db.close();a.sort((x,y)=>y.at-x.at);resolve(a[0]?.state||null)};req.onerror=()=>reject(req.error)};
      r.onerror=()=>reject(r.error);
    }catch(e){reject(e)}
  })
}
function downloadBackup(){
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:"application/json"}));a.download="investment-tracker-backup-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}

async function hashPin(pin){
  if(!crypto?.subtle)return btoa(pin);
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")
}
async function lock(){
  if(!s.settings.privacy.pinHash){alert("Set a PIN first in Settings / Data.");return}
  locked=true;$("lockscreen").classList.remove("hidden");$("unlockPin").value="";$("unlockMsg").textContent=""
}
async function unlock(){
  const ok=(await hashPin($("unlockPin").value))===s.settings.privacy.pinHash;
  if(ok){locked=false;$("lockscreen").classList.add("hidden");lastActivity=Date.now()}else $("unlockMsg").textContent="Incorrect PIN."
}
document.addEventListener("mousemove",()=>lastActivity=Date.now());
document.addEventListener("keydown",()=>lastActivity=Date.now());
setInterval(()=>{const m=Number(s.settings.privacy.autoLockMinutes)||0;if(m&&s.settings.privacy.pinHash&&!locked&&Date.now()-lastActivity>m*60000)lock()},30000);

async function fetchQuote(symbol,exchange,force=false){
  const ttl=Number(s.settings.market.refreshTtl)||60000;
  if(!force&&q[symbol]&&q[symbol+"_at"]&&Date.now()-q[symbol+"_at"]<ttl)return {price:q[symbol],source:q[symbol+"_source"]};
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
  try{
    const r=await fetch("/api/quote?symbol="+encodeURIComponent(symbol)+"&exchange="+encodeURIComponent(exchange),{signal:ctl.signal});
    const d=await r.json();if(!r.ok||!d.price)throw new Error(d.error||"Quote unavailable");
    q[symbol+"_prev"]=q[symbol]||d.previousClose||q[symbol+"_prev"]||null;q[symbol]=Number(d.price);q[symbol+"_at"]=Date.now();q[symbol+"_source"]=d.source||"Provider";saveQuotes();return d;
  }finally{clearTimeout(timer)}
}

function holdings(){
  const m={};
  s.transactions.forEach(t=>{
    const k=t.type+"|"+t.symbol;if(!m[k])m[k]={type:t.type,name:t.name,symbol:t.symbol,exchange:t.exchange,qty:0,cost:0};
    const h=m[k],n=Number(t.qty)||0,gross=n*(Number(t.price)||0),c=totalCharges(t);
    if(["BUY","SIP","BONUS","RIGHTS"].includes(t.action)){h.qty+=n;h.cost+=gross+c}
    if(["SELL","REDEMPTION"].includes(t.action)){const avg=h.qty?h.cost/h.qty:Number(t.price)||0;h.qty-=n;h.cost-=n*avg}
  });
  return Object.values(m).filter(h=>h.qty>0).map(h=>{h.avg=h.cost/h.qty;h.current=price(h);h.value=h.qty*h.current;h.pnl=h.value-h.cost;return h})
}
function realizedLots(){
  const lots={},out=[];
  s.transactions.slice().sort((a,b)=>a.date.localeCompare(b.date)||String(a.id).localeCompare(String(b.id))).forEach(t=>{
    if(["BUY","SIP","BONUS","RIGHTS"].includes(t.action))(lots[t.symbol]||(lots[t.symbol]=[])).push({qty:Number(t.qty),price:Number(t.price),date:t.date});
    if(["SELL","REDEMPTION"].includes(t.action)){
      let left=Number(t.qty)||0,cost=0,z=lots[t.symbol]||[],firstDate=t.date;
      while(left>0&&z.length){const l=z[0],take=Math.min(left,l.qty);cost+=take*l.price;if(firstDate===t.date)firstDate=l.date;l.qty-=take;left-=take;if(l.qty<=0)z.shift()}
      const proceeds=(Number(t.qty)||0)*(Number(t.price)||0)-totalCharges(t),days=Math.max(0,(new Date(t.date)-new Date(firstDate))/86400000);
      out.push({date:t.date,buyDate:firstDate,name:t.name,symbol:t.symbol,qty:Number(t.qty)||0,cost,proceeds,pnl:proceeds-cost,holdingDays:days})
    }
  });return out
}
function xnpv(rate,cfs){const d0=cfs[0][0];return cfs.reduce((s,x)=>s+x[1]/Math.pow(1+rate,(x[0]-d0)/365),0)}
function xirr(cfs){
  if(cfs.length<2)return null;let rate=.1;
  for(let i=0;i<80;i++){const f=xnpv(rate,cfs),e=1e-5,df=(xnpv(rate+e,cfs)-xnpv(rate-e,cfs))/(2*e);if(!isFinite(df)||Math.abs(df)<1e-12)break;let next=rate-f/df;if(next<=-.9999||!isFinite(next))next=(rate-.99)/2;if(Math.abs(next-rate)<1e-8)return next;rate=next}
  return isFinite(rate)?rate:null
}
function totals(){
  const h=holdings(),cost=h.reduce((a,x)=>a+x.cost,0),value=h.reduce((a,x)=>a+x.value,0),r=realizedLots().reduce((a,x)=>a+x.pnl,0),cfs=[];
  s.transactions.forEach(t=>{if(["BUY","SIP","BONUS","RIGHTS"].includes(t.action))cfs.push([new Date(t.date),-(Number(t.qty)*Number(t.price)+totalCharges(t))]);else if(["SELL","REDEMPTION"].includes(t.action))cfs.push([new Date(t.date),Number(t.qty)*Number(t.price)-totalCharges(t)])});
  if(value>0)cfs.push([new Date(),value]);
  return{h,cost,value,pnl:value-cost,ret:cost?(value-cost)/cost*100:0,realized:r,xirr:cfs.some(x=>x[1]<0)&&cfs.some(x=>x[1]>0)?xirr(cfs):null}
}
function allocation(h,total){if(!total)return'<div class="empty">Add investments to see allocation.</div>';return'<div class="allocation">'+h.map((x,i)=>'<i style="width:'+(x.value/total*100)+'%;background:hsl('+(145+i*37)+' 45% 55%)"></i>').join("")+'</div>'+h.slice().sort((a,b)=>b.value-a.value).map(x=>'<div class="row muted" style="margin-top:8px"><span>'+esc(x.name)+'</span><b>'+((x.value/total)*100).toFixed(1)+'%</b></div>').join("")}
function table(h){
  if(!h.length)return'<div class="card empty">No active holdings. Add your first investment.</div>';
  return'<div class="tablewrap"><table class="table"><thead><tr><th>Asset</th><th>Qty</th><th>Avg</th><th>Current</th><th>Value</th><th>Unrealised P/L</th><th></th></tr></thead><tbody>'+h.map(x=>'<tr><td><div class="asset">'+esc(x.name)+'</div><div class="sub">'+esc(x.symbol)+" · "+esc(x.exchange)+'</div></td><td>'+num(x.qty)+'</td><td>'+money(x.avg)+'</td><td>'+money(x.current)+'</td><td>'+money(x.value)+'</td><td class="'+(x.pnl>=0?"green":"red")+'">'+money(x.pnl)+'<div class="sub">'+pct(x.cost?x.pnl/x.cost*100:0)+'</div></td><td><button class="btn" data-edit="'+esc(x.symbol)+'">Edit</button></td></tr>').join("")+"</tbody></table></div>"
}
function insights(t){
  const a=[];if(!t.h.length)a.push("Add investments to start portfolio insights.");
  else{
    const top=t.h.slice().sort((a,b)=>b.value-a.value)[0],weight=top.value/t.value*100;
    if(weight>25)a.push(top.name+" is "+weight.toFixed(1)+"% of portfolio value.");
    if(t.h.length>=3){const top3=t.h.slice().sort((a,b)=>b.value-a.value).slice(0,3).reduce((x,y)=>x+y.value,0);if(top3/t.value>.7)a.push("Your top 3 holdings are "+(top3/t.value*100).toFixed(1)+"% of portfolio value.")}
    const gain=t.h.slice().sort((a,b)=>b.pnl-a.pnl)[0],loss=t.h.slice().sort((a,b)=>a.pnl-b.pnl)[0];if(gain)a.push("Largest unrealised gain: "+gain.name+" ("+money(gain.pnl)+").");if(loss&&loss.pnl<0)a.push("Largest unrealised loss: "+loss.name+" ("+money(loss.pnl)+").");
    if(t.xirr!==null)a.push("Portfolio XIRR: "+pct(t.xirr*100)+".")
  }return a.map(x=>'<div class="insight">💡 '+esc(x)+'</div>').join("")
}
function sources(){const last=s.meta.lastQuoteRefreshAt,age=last?Math.round((Date.now()-last)/60000):null;return'<div class="sourcebar"><span class="status"><i class="dot"></i> Quotes: '+(age===null?"Not refreshed":age+" min ago")+'</span><span class="status"><i class="dot"></i> Stocks/ETFs: Yahoo Finance → NSE/BSE fallback</span><span class="status"><i class="dot"></i> Mutual funds: AMFI</span></div>'}

function dashboard(){
  const t=totals(),gain=t.h.slice().sort((a,b)=>b.pnl-a.pnl).slice(0,3),loss=t.h.slice().sort((a,b)=>a.pnl-b.pnl).slice(0,3);
  return'<div class="grid stats"><div class="card"><div class="label">Portfolio value</div><div class="big">'+money(t.value)+'</div><div class="muted">'+t.h.length+' active holdings</div></div><div class="card"><div class="label">Invested cost</div><div class="big">'+money(t.cost)+'</div><div class="muted">Net cost basis</div></div><div class="card"><div class="label">Overall P/L</div><div class="big '+(t.pnl>=0?"green":"red")+'">'+money(t.pnl)+'</div><div class="muted">'+pct(t.ret)+'</div></div><div class="card"><div class="label">Portfolio XIRR</div><div class="big">'+(t.xirr==null?"—":pct(t.xirr*100))+'</div><div class="muted">Cash-flow adjusted return</div></div></div><div class="grid three" style="margin-top:12px"><div class="card"><div class="label">Realised P/L</div><div class="big '+(t.realized>=0?"green":"red")+'">'+money(t.realized)+'</div><div class="muted">FIFO</div></div><div class="card"><div class="label">Active holdings</div><div class="big">'+t.h.length+'</div><div class="muted">Across stocks, MFs & other assets</div></div><div class="card"><div class="label">Last quote refresh</div><div class="big">'+(s.meta.lastQuoteRefreshAt?new Date(s.meta.lastQuoteRefreshAt).toLocaleTimeString("en-IN"):"—")+'</div><div class="muted">Use Refresh quotes for a new snapshot</div></div></div><div class="card" style="margin-top:12px"><div class="head" style="margin:0 0 10px"><h2>Portfolio Insights</h2></div><div class="insights">'+insights(t)+'</div></div><div class="grid two" style="margin-top:12px"><div class="card"><div class="head" style="margin:0 0 10px"><h2>Allocation</h2></div>'+allocation(t.h,t.value)+'</div><div class="card"><div class="head" style="margin:0 0 10px"><h2>Top movers</h2></div><b>Largest gains</b>'+gain.map(x=>'<div class="row muted" style="margin-top:8px"><span>'+esc(x.name)+'</span><span class="green">'+money(x.pnl)+'</span></div>').join("")+'<div style="height:10px"></div><b>Largest losses</b>'+loss.map(x=>'<div class="row muted" style="margin-top:8px"><span>'+esc(x.name)+'</span><span class="red">'+money(x.pnl)+'</span></div>').join("")+'</div></div><div class="head"><h2>Top holdings</h2><button class="btn" data-page="holdings">View all</button></div>'+table(t.h.slice().sort((a,b)=>b.value-a.value).slice(0,8))+'<div class="card" style="margin-top:12px"><div class="label">Data-source transparency</div>'+sources()+'<div class="muted" style="margin-top:8px">Last saved: '+(s.meta.lastSavedAt?new Date(s.meta.lastSavedAt).toLocaleString("en-IN"):"—")+'</div></div>'
}

function holdingsPage(){return'<div class="search"><input class="input" id="search" placeholder="Search holdings..."><select class="select" id="filter"><option value="">All types</option><option>STOCK</option><option>MUTUAL_FUND</option><option>ETF</option><option>FD</option><option>BOND</option><option>SGB</option><option>PPF</option><option>NPS</option><option>GOLD</option><option>CASH</option><option>OTHER</option></select></div><div id="hm">'+table(holdings())+'</div>'}

function transactionsPage(){
  const a=s.transactions.slice().sort((x,y)=>y.date.localeCompare(x.date));
  return'<div class="head"><h2>Transaction ledger</h2><button class="btn primary" id="add2">＋ Add transaction</button></div><div class="notice">Transaction costs are stored separately. This keeps cost basis and realised P/L auditable and makes it easy to reconcile broker statements.</div><div class="tablewrap" style="margin-top:10px"><table class="table"><thead><tr><th>Date</th><th>Action</th><th>Asset</th><th>Qty</th><th>Price/NAV</th><th>Charges</th><th>Cash flow</th><th>Notes</th><th></th></tr></thead><tbody>'+a.map(x=>{const gross=(Number(x.qty)||0)*(Number(x.price)||0),cash=["BUY","SIP","BONUS","RIGHTS"].includes(x.action)?gross+totalCharges(x):gross-totalCharges(x);return'<tr><td>'+esc(x.date)+'</td><td><span class="pill">'+esc(x.action)+'</span></td><td><div class="asset">'+esc(x.name)+'</div><div class="sub">'+esc(x.symbol)+'</div></td><td>'+num(x.qty)+'</td><td>'+money(x.price)+'</td><td>'+money(totalCharges(x))+'</td><td>'+money(cash)+'</td><td class="muted">'+esc(x.notes)+'</td><td><button class="btn danger" data-del="'+esc(x.id)+'">Delete</button></td></tr>}).join("")+"</tbody></table></div>"
}

function realizedPage(){
  const a=realizedLots(),v=a.reduce((x,y)=>x+y.pnl,0),st=a.filter(x=>x.holdingDays<=365).reduce((x,y)=>x+y.pnl,0),lt=a.filter(x=>x.holdingDays>365).reduce((x,y)=>x+y.pnl,0);
  return'<div class="grid stats"><div class="card"><div class="label">Realised P/L</div><div class="big '+(v>=0?"green":"red")+'">'+money(v)+'</div></div><div class="card"><div class="label">Short-term bucket</div><div class="big '+(st>=0?"green":"red")+'">'+money(st)+'</div><div class="muted">Holding period ≤ 365 days</div></div><div class="card"><div class="label">Long-term bucket</div><div class="big '+(lt>=0?"green":"red")+'">'+money(lt)+'</div><div class="muted">Holding period > 365 days</div></div><div class="card"><div class="label">Realised trades</div><div class="big">'+a.length+'</div></div></div><div class="head"><h2>Realised transactions</h2></div><div class="tablewrap"><table class="table"><thead><tr><th>Sale date</th><th>Asset</th><th>Qty</th><th>Buy date</th><th>Holding</th><th>Cost basis</th><th>Proceeds</th><th>P/L</th></tr></thead><tbody>'+(a.length?a.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.name)+'<div class="sub">'+esc(x.symbol)+'</div></td><td>'+num(x.qty)+'</td><td>'+esc(x.buyDate)+'</td><td>'+Math.round(x.holdingDays)+' days</td><td>'+money(x.cost)+'</td><td>'+money(x.proceeds)+'</td><td class="'+(x.pnl>=0?"green":"red")+'">'+money(x.pnl)+'</td></tr>').join(""):'<tr><td colspan="8" class="empty">No realised transactions yet.</td></tr>')+'</tbody></table></div><div class="notice" style="margin-top:10px">The short-term/long-term split is an informational holding-period bucket, not a tax calculation. Indian tax treatment can vary by asset and applicable law.</div>'
}

function researchPage(){return'<div class="grid two"><div class="card"><div class="head" style="margin:0 0 12px"><h2>Stock Research</h2><span class="muted">Fundamentals + valuation + trend</span></div><div class="search"><input class="input" id="researchSymbol" placeholder="NSE symbol e.g. RELIANCE"><select class="select" id="researchExchange"><option>NSE</option><option>BSE</option></select><button class="btn primary" id="researchRun">Research</button></div><div class="notice">Metrics are reported provider data plus transparent screening rules. The signal is not a personalised recommendation.</div></div><div class="card"><div class="label">Research workflow</div><p class="muted">Review valuation, profitability, growth, leverage, cash flow and moving-average trend together. Use the News & Events page for recent developments.</p></div></div><div id="researchResult" style="margin-top:12px"><div class="card empty">Enter a stock symbol to start research.</div></div>'}

function fmt(v,kind){if(v==null||v==="")return"—";const n=Number(v);if(!isFinite(n))return"—";if(kind==="pct")return (Math.abs(n)<=1?n*100:n).toFixed(2)+"%";if(kind==="money")return money(n);return n.toFixed(2)}
function signal(d){
  const p=d.price||{},f=d.financialData||{},s=d.summaryDetail||{},k=d.keyStats||{};let score=0,reasons=[];
  const add=(cond,pts,txt)=>{if(cond){score+=pts;reasons.push(txt)}};
  const roe=Number(f.returnOnEquity),margin=Number(f.profitMargins),rev=Number(f.revenueGrowth),earn=Number(f.earningsGrowth),de=Number(f.debtToEquity),cr=Number(f.currentRatio),fc=Number(f.freeCashflow),pe=Number(s.trailingPE||k.trailingPE),px=Number(p.regularMarketPrice),m50=Number(p.fiftyDayAverage),m200=Number(p.twoHundredDayAverage);
  if(isFinite(roe))add(roe>=.15,1,"ROE ≥ 15%"),add(roe<.08,-1,"ROE < 8%");
  if(isFinite(margin))add(margin>=.10,1,"Profit margin ≥ 10%"),add(margin<.05,-1,"Profit margin < 5%");
  if(isFinite(rev))add(rev>=.10,1,"Revenue growth ≥ 10%"),add(rev<0,-1,"Revenue growth is negative");
  if(isFinite(earn))add(earn>=.10,1,"Earnings growth ≥ 10%"),add(earn<0,-1,"Earnings growth is negative");
  if(isFinite(de))add(de<=75,1,"Debt/equity ≤ 75%"),add(de>150,-1,"Debt/equity > 150%");
  if(isFinite(cr))add(cr>=1,1,"Current ratio ≥ 1"),add(cr<.75,-1,"Current ratio < 0.75");
  if(isFinite(fc))add(fc>0,1,"Free cash flow positive"),add(fc<0,-1,"Free cash flow negative");
  if(isFinite(pe))add(pe>0&&pe<=25,1,"P/E ≤ 25"),add(pe>40,-1,"P/E > 40");
  if(isFinite(px)&&isFinite(m50)&&isFinite(m200))add(px>m50&&px>m200,1,"Price above 50D and 200D"),add(px<m50&&px<m200,-1,"Price below 50D and 200D");
  return{score,signal:score>=5?"BUY":score<=1?"SELL":"HOLD",reasons:reasons.slice(0,8)}
}
function metric(label,value,sub){return'<div class="card"><div class="label">'+esc(label)+'</div><div class="big">'+esc(value)+'</div><div class="muted">'+esc(sub||"")+'</div></div>'}
function researchHTML(d){
  const p=d.price||{},f=d.financialData||{},sd=d.summaryDetail||{},k=d.keyStats||{},sg=signal(d);
  const rows=[["Market Cap",p.marketCap?money(p.marketCap):"—","Provider"],["P/E",fmt(sd.trailingPE||k.trailingPE),"Trailing"],["Forward P/E",fmt(sd.forwardPE||k.forwardPE),"Forward"],["P/B",fmt(k.priceToBook),"Price/book"],["EPS",p.epsTrailingTwelveMonths!=null?money(p.epsTrailingTwelveMonths):"—","TTM"],["ROE",fmt(f.returnOnEquity,"pct"),"Return on equity"],["ROA",fmt(f.returnOnAssets,"pct"),"Return on assets"],["Operating Margin",fmt(f.operatingMargins,"pct"),"TTM"],["Profit Margin",fmt(f.profitMargins,"pct"),"TTM"],["Revenue Growth",fmt(f.revenueGrowth,"pct"),"YoY"],["Earnings Growth",fmt(f.earningsGrowth,"pct"),"YoY"],["Debt / Equity",fmt(f.debtToEquity),"Leverage"],["Current Ratio",fmt(f.currentRatio),"Liquidity"],["Free Cash Flow",f.freeCashflow!=null?money(f.freeCashflow):"—","TTM"],["Dividend Yield",fmt(sd.dividendYield,"pct"),"Current"],["52W High",p.fiftyTwoWeekHigh!=null?money(p.fiftyTwoWeekHigh):"—","Price range"],["52W Low",p.fiftyTwoWeekLow!=null?money(p.fiftyTwoWeekLow):"—","Price range"],["50D Average",p.fiftyDayAverage!=null?money(p.fiftyDayAverage):"—","Trend"],["200D Average",p.twoHundredDayAverage!=null?money(p.twoHundredDayAverage):"—","Trend"]];
  return'<div class="head"><h2>'+esc(d.name||d.symbol)+' <span class="muted">'+esc(d.symbol)+' · '+esc(d.exchange)+'</span></h2><span class="muted">Fetched '+new Date(d.fetchedAt||Date.now()).toLocaleString("en-IN")+' · '+esc(d.source||"Provider")+'</span></div><div class="card" style="margin-bottom:12px"><div class="label">Transparent screening signal</div><div class="big '+(sg.signal==="BUY"?"green":sg.signal==="SELL"?"red":"amber")+'">'+sg.signal+'</div><div class="muted">Score '+sg.score+' · thresholds are visible and rule-based.</div><div style="margin-top:8px">'+sg.reasons.map(x=>'<span class="pill" style="margin:3px">'+esc(x)+'</span>').join("")+'</div><div class="modalfoot"><button class="btn" data-news-symbol="'+esc(d.symbol)+'">View News & Events</button></div></div><div class="grid three">'+rows.map(x=>metric(x[0],x[1],x[2])).join("")+'</div><div class="card" style="margin-top:12px"><h2>Company profile</h2><p class="muted">'+esc((d.profile||{}).longBusinessSummary||"Business description unavailable from provider.")+'</p></div><div class="grid two" style="margin-top:12px"><div class="card"><h2>How the signal works</h2><p class="muted">Positive points are assigned for stronger profitability, growth, liquidity, cash flow, manageable leverage, reasonable P/E and price above both moving averages. Negative points apply to weak readings.</p></div><div class="card"><h2>Data source</h2><p class="muted">Research data is fetched server-side from Yahoo Finance. If the provider cannot return a metric, it is shown as unavailable rather than estimated.</p></div></div>'
}
async function runResearch(){
  const symbol=($("researchSymbol")?.value||"").trim().toUpperCase(),ex=$("researchExchange")?.value||"NSE",out=$("researchResult");if(!symbol)return out.innerHTML='<div class="card empty">Enter an NSE/BSE stock symbol.</div>';
  out.innerHTML='<div class="card empty">Loading research…</div>';
  try{const r=await fetch("/api/research?symbol="+encodeURIComponent(symbol)+"&exchange="+encodeURIComponent(ex));const d=await r.json();if(!r.ok)throw new Error(d.error||"Research unavailable");out.innerHTML=researchHTML(d)}catch(e){out.innerHTML='<div class="card empty">Could not load research: '+esc(e.message||"Provider error")+'</div>'}
}

function newsPage(){return'<div class="grid two"><div class="card"><h2>News & Events</h2><p class="muted">Recent company news from the external market-data provider. This section is informational.</p><div class="search"><input class="input" id="newsSymbol" placeholder="NSE symbol e.g. RELIANCE"><button class="btn primary" id="newsRun">Load news</button></div></div><div class="card"><div class="label">Portfolio shortcut</div><p class="muted">You can open news from a stock in Stock Research.</p></div></div><div id="newsResult" style="margin-top:12px"><div class="card empty">Enter a symbol to load news.</div></div>'}
async function runNews(symbol){
  symbol=(symbol||$("newsSymbol")?.value||"").trim().toUpperCase();const out=$("newsResult");if(!symbol)return out.innerHTML='<div class="card empty">Enter a symbol.</div>';
  out.innerHTML='<div class="card empty">Loading news…</div>';
  try{const r=await fetch("/api/news?symbol="+encodeURIComponent(symbol));const d=await r.json();if(!r.ok)throw new Error(d.error||"News unavailable");const items=d.items||[];out.innerHTML='<div class="card"><div class="head" style="margin:0 0 8px"><h2>'+esc(d.name||symbol)+'</h2><span class="muted">Source: '+esc(d.source||"Yahoo Finance")+'</span></div>'+(items.length?items.map(n=>'<div class="newsitem"><a href="'+esc(n.link||"#")+'" target="_blank" rel="noopener">'+esc(n.title||"Untitled")+'</a><div class="newsmeta">'+esc(n.publisher||"Provider")+' · '+esc(n.published||"")+'</div></div>').join(""):'<div class="empty">No recent news found.</div>')+'</div>'}catch(e){out.innerHTML='<div class="card empty">Could not load news: '+esc(e.message||"Provider error")+'</div>'}
}

function goalsPage(){
  const pv=totals().value;
  return'<div class="head"><h2>Financial goals</h2><button class="btn primary" id="goal">Add goal</button></div><div class="grid three">'+(s.goals.length?s.goals.map(g=>{const current=g.linkPortfolio===false?Number(g.current)||0:pv,p=g.target?Math.min(100,current/g.target*100):0,months=g.date?Math.max(1,Math.ceil((new Date(g.date)-new Date())/(30.44*86400000))):1,need=Math.max(0,(Number(g.target)||0-current)/months);return'<div class="card"><div class="row"><b>'+esc(g.name)+'</b><span class="muted">'+esc(g.date||"No date")+'</span></div><div class="big">'+money(current)+'</div><div class="muted">of '+money(g.target)+'</div><div class="progress"><i style="width:'+p+'%"></i></div><div class="row muted" style="margin-top:7px"><span>'+p.toFixed(1)+'%</span><span>'+money(Math.max(0,g.target-current))+' remaining</span></div><div class="notice" style="margin-top:10px">Required monthly: <b>'+money(need)+'</b><br>Planned monthly: <b>'+money(g.monthlyContribution||0)+'</b></div></div>'}).join(""):'<div class="card empty">Create a goal such as a ₹10 lakh portfolio, car fund or emergency fund.</div>')+'</div>'
}

function importPage(){return'<div class="card"><h2>CSV import</h2><p class="muted">Columns: date,type,name,symbol,exchange,action,qty,price,charges,notes</p><textarea id="csv" class="wide" rows="10" placeholder="2026-09-01,STOCK,Infosys,INFY,NSE,BUY,5,1500,10,"></textarea><div class="modalfoot"><button class="btn primary" id="import">Import</button></div></div>'}

function settingsPage(){
  const p=!!s.settings.privacy.pinHash,b=s.settings.backup;
  return'<div class="grid two"><div class="card"><h2>Privacy & local lock</h2><p class="muted">The PIN locks the app UI in this browser. It is not encryption and does not protect data from developer-tools access.</p><div class="form"><div class="field"><label>New PIN</label><input class="input wide" id="pin1" type="password" maxlength="8" inputmode="numeric" placeholder="4–8 digits"></div><div class="field"><label>Confirm PIN</label><input class="input wide" id="pin2" type="password" maxlength="8" inputmode="numeric"></div></div><div class="modalfoot"><button class="btn" id="setpin">'+(p?"Change PIN":"Set PIN")+'</button><button class="btn" id="lockNow">Lock now</button></div><div class="muted">Auto-lock <select class="select" id="autolock"><option value="0">Never</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">60 min</option></select></div></div><div class="card"><h2>Automatic backup / restore</h2><p class="muted">Automatic snapshots are stored locally in IndexedDB. The app also keeps the primary portfolio in localStorage.</p><div class="sourcebar"><span class="status"><i class="dot"></i> Auto backup: On</span><span class="status">Last snapshot: '+(b.lastBackupAt?new Date(b.lastBackupAt).toLocaleString("en-IN"):"Not yet")+'</span></div><div class="modalfoot"><button class="btn" id="backupNow">Backup now</button><button class="btn" id="restoreBackup">Restore latest</button><button class="btn" id="export">Export JSON</button><label class="btn">Import JSON<input id="importJson" type="file" accept=".json" hidden></label></div></div></div><div class="grid two" style="margin-top:12px"><div class="card"><h2>Market data & reliability</h2><p class="muted">Stocks/ETFs use Yahoo Finance with NSE fallback where available. Mutual funds use AMFI. Research and news use Yahoo Finance. Failed refreshes do not overwrite the last known good quote.</p><label class="muted">Quote cache TTL (seconds)<input class="input" id="ttl" type="number" min="10" value="'+(Number(s.settings.market.refreshTtl)/1000)+'"></label>'+sources()+'</div><div class="card"><h2>Danger zone</h2><p class="muted">Resetting deletes this browser's portfolio state and restores demo data.</p><button class="btn danger" id="reset">Reset demo</button></div></div>'
}

function openModal(html){$("modal").innerHTML=html;$("mb").classList.remove("hidden")}
function closeModal(){$("mb").classList.add("hidden")}

async function loadMF(){
  if(mfCache)return mfCache;const r=await fetch("/api/mf");const d=await r.json();if(!r.ok)throw new Error(d.error||"AMFI unavailable");mfCache=d;return d
}
function fill(select,items,placeholder,disabled=false){select.innerHTML='<option value="">'+esc(placeholder)+'</option>'+items.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join("");select.disabled=disabled}
async function setupMF(form){
  const box=$("mfbox"),amc=$("mfamc"),scheme=$("mfscheme"),plan=$("mfplan"),option=$("mfoption"),meta=$("mfmeta");
  try{const d=await loadMF();fill(amc,d.amcs||[],"Select AMC...");amc.onchange=()=>{const names=[...new Set((d.schemes||[]).filter(x=>x.amc===amc.value).map(x=>x.name))].sort();fill(scheme,names,"Select scheme...");fill(plan,[],"Select scheme first...",true);fill(option,[],"Select plan first...",true)};scheme.onchange=()=>{const rows=d.schemes.filter(x=>x.amc===amc.value&&x.name===scheme.value);fill(plan,[...new Set(rows.map(x=>x.plan))],"Select plan...");fill(option,[],"Select plan first...",true)};plan.onchange=()=>{const rows=d.schemes.filter(x=>x.amc===amc.value&&x.name===scheme.value&&x.plan===plan.value);fill(option,[...new Set(rows.map(x=>x.option))],"Select option...")};option.onchange=()=>{const row=d.schemes.find(x=>x.amc===amc.value&&x.name===scheme.value&&x.plan===plan.value&&x.option===option.value);if(!row)return;form.elements.symbol.value=row.code;form.elements.name.value=row.name+" — "+row.plan+" — "+row.option;form.elements.price.value=row.nav;form.elements.exchange.value="AMFI";meta.innerHTML="<b>Selected:</b> "+esc(row.name)+" · "+esc(row.plan)+" · "+esc(row.option)+" · NAV ₹"+Number(row.nav).toFixed(4)+" · "+esc(row.date||"")}}
  catch(e){meta.textContent="AMFI list unavailable. Enter the scheme code manually."}
}
function openTx(symbol=null,forcedAction=null){
  const old=symbol?s.transactions.find(x=>x.symbol===symbol):null,existing=symbol?holdings().find(x=>x.symbol===symbol):null;
  openModal('<h2>'+(old?"Edit transaction":"Add investment")+'</h2><form id="txf"><div class="form"><div class="field"><label>Type</label><select class="select wide" name="type"><option>STOCK</option><option>MUTUAL_FUND</option><option>ETF</option><option>FD</option><option>BOND</option><option>SGB</option><option>PPF</option><option>NPS</option><option>GOLD</option><option>CASH</option><option>OTHER</option></select></div><div class="field"><label>Action</label><select class="select wide" name="action"><option>BUY</option><option>SELL</option><option>SIP</option><option>DIVIDEND</option><option>BONUS</option><option>SPLIT</option><option>RIGHTS</option><option>REDEMPTION</option></select></div><div class="field full hidden" id="mfbox"><label>Mutual fund selection — AMFI</label><div class="form"><div class="field"><label>AMC</label><select class="select wide" id="mfamc"></select></div><div class="field"><label>Scheme</label><select class="select wide" id="mfscheme" disabled></select></div><div class="field"><label>Plan</label><select class="select wide" id="mfplan" disabled></select></div><div class="field"><label>Option</label><select class="select wide" id="mfoption" disabled></select></div></div><div class="notice" id="mfmeta" style="margin-top:10px">Select AMC → Scheme → Plan → Option.</div></div><div class="field full"><label>Name</label><input class="input wide" name="name" required></div><div class="field"><label>Symbol / scheme code</label><input class="input wide" name="symbol" required></div><div class="field"><label>Exchange / source</label><select class="select wide" name="exchange"><option>NSE</option><option>BSE</option><option>AMFI</option><option>OTHER</option></select></div><div class="field"><label>Date</label><input class="input wide" type="date" name="date" required value="'+new Date().toISOString().slice(0,10)+'"></div><div class="field"><label>Quantity / units</label><input class="input wide" type="number" step="any" name="qty" required></div><div class="field"><label>Price / NAV</label><input class="input wide" type="number" step="any" name="price" required></div><div class="field"><label>Brokerage</label><input class="input wide" type="number" step="any" name="brokerage" value="0"></div><div class="field"><label>STT</label><input class="input wide" type="number" step="any" name="stt" value="0"></div><div class="field"><label>GST</label><input class="input wide" type="number" step="any" name="gst" value="0"></div><div class="field"><label>Other charges</label><input class="input wide" type="number" step="any" name="otherCharges" value="0"></div><div class="field full"><label>Notes</label><input class="input wide" name="notes"></div></div><div class="modalfoot"><button type="button" class="btn" id="close">Cancel</button><button class="btn primary">Save transaction</button></div></form>');
  const f=$("txf"),type=f.elements.type,box=$("mfbox");
  type.onchange=()=>{box.classList.toggle("hidden",type.value!=="MUTUAL_FUND");if(type.value==="MUTUAL_FUND")setupMF(f)};
  if(old){Object.keys(old).forEach(k=>{if(f.elements[k])f.elements[k].value=old[k]});if(old.type==="MUTUAL_FUND"){type.dispatchEvent(new Event("change"))}}
  if(forcedAction&&!old)f.elements.action.value=forcedAction;
  if(existing&&!old&&forcedAction==="SELL"){f.elements.name.value=existing.name;f.elements.symbol.value=existing.symbol;f.elements.exchange.value=existing.exchange;f.elements.price.value=existing.current;f.elements.qty.max=existing.qty;f.elements.name.readOnly=true;f.elements.symbol.readOnly=true;f.elements.exchange.disabled=true}
  $("close").onclick=closeModal;
  f.onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(f));o.id=old?old.id:String(Date.now());o.qty=Number(o.qty);o.price=Number(o.price);o.brokerage=Number(o.brokerage)||0;o.stt=Number(o.stt)||0;o.gst=Number(o.gst)||0;o.otherCharges=Number(o.otherCharges)||0;o.charges=o.brokerage+o.stt+o.gst+o.otherCharges;if(["SELL","REDEMPTION"].includes(o.action)){const h=holdings().find(x=>x.symbol===o.symbol);if(!h||o.qty<=0||o.qty>h.qty+1e-9)return alert("Quantity exceeds your current holding.")}if(o.exchange==="AMFI"&&o.symbol)try{await fetchQuote(o.symbol,"AMFI",true)}catch(_){}if(old)s.transactions=s.transactions.map(x=>x.id===old.id?o:x);else s.transactions.push(o);save();closeModal();render()}
}
function openGoal(){
  openModal('<h2>Add financial goal</h2><form id="gf"><div class="form"><div class="field full"><label>Goal name</label><input class="input wide" name="name" required placeholder="₹10 lakh portfolio"></div><div class="field"><label>Target amount</label><input class="input wide" type="number" name="target" required></div><div class="field"><label>Target date</label><input class="input wide" type="date" name="date"></div><div class="field"><label>Planned monthly contribution</label><input class="input wide" type="number" name="monthlyContribution" value="0"></div><div class="field"><label>Current amount</label><input class="input wide" type="number" name="current" value="0"></div><div class="field"><label>Progress source</label><select class="select wide" name="linkPortfolio"><option value="true">Link to total portfolio</option><option value="false">Use manual current amount</option></select></div></div><div class="modalfoot"><button type="button" class="btn" id="close">Cancel</button><button class="btn primary">Create</button></div></form>');
  $("close").onclick=closeModal;$("gf").onsubmit=e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));o.id=String(Date.now());o.target=Number(o.target);o.current=Number(o.current)||0;o.monthlyContribution=Number(o.monthlyContribution)||0;o.linkPortfolio=o.linkPortfolio==="true";s.goals.push(o);save();closeModal();render()}
}

function render(){
  const pages={dashboard:dashboard,holdings:holdingsPage,transactions:transactionsPage,realized:realizedPage,research:researchPage,news:newsPage,goals:goalsPage,import:importPage,settings:settingsPage};
  const titles={dashboard:"Dashboard",holdings:"Holdings",transactions:"Transactions",realized:"Realised P/L",research:"Stock Research",news:"News & Events",goals:"Goals",import:"CSV Import",settings:"Settings / Data"};
  $("title").textContent=titles[page];document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("view").innerHTML=pages[page]();
  if($("autolock"))$("autolock").value=String(s.settings.privacy.autoLockMinutes||30);
}
document.addEventListener("click",e=>{
  const nav=e.target.closest("[data-page]");if(nav){page=nav.dataset.page;render();return}
  if(e.target.id==="add"||e.target.id==="add2")openTx();
  if(e.target.dataset.edit)openTx(e.target.dataset.edit);
  if(e.target.id==="goal")openGoal();
  if(e.target.id==="researchRun")runResearch();
  if(e.target.id==="newsRun")runNews();
  if(e.target.dataset.newsSymbol){page="news";render();runNews(e.target.dataset.newsSymbol)}
  if(e.target.id==="close")closeModal();
  if(e.target.id==="unlockBtn")unlock();
  if(e.target.id==="lockNow")lock();
  if(e.target.id==="backupNow"){backupToIndexedDB();s.settings.backup.lastBackupAt=Date.now();s.settings.backup.savesSinceBackup=0;save();render();alert("Automatic backup snapshot saved.")}
  if(e.target.id==="restoreBackup")latestBackup().then(x=>{if(!x)return alert("No automatic backup found.");if(confirm("Restore the latest backup? Current state will be replaced.")){s=x;normalizeState();save();render();alert("Backup restored.")}})
  if(e.target.id==="export")downloadBackup();
  if(e.target.id==="setpin"){const a=$("pin1").value,b=$("pin2").value;if(!/^\\d{4,8}$/.test(a)||a!==b)return alert("PIN must be 4–8 digits and both fields must match.");hashPin(a).then(h=>{s.settings.privacy.pinHash=h;save();alert("PIN saved.")})}
  if(e.target.id==="reset"&&confirm("Reset demo data?")){localStorage.removeItem(KEY);s={version:STATE_VERSION,transactions:JSON.parse(JSON.stringify(DEMO)),goals:[],settings:{privacy:{pinHash:"",autoLockMinutes:30},backup:{enabled:true,lastBackupAt:0,savesSinceBackup:0},market:{refreshTtl:60000}},meta:{lastSavedAt:0,lastQuoteRefreshAt:0}};save();render()}
  if(e.target.id==="import"){const lines=($("csv").value||"").trim().split(/\\r?\\n/).filter(Boolean);lines.forEach((line,i)=>{const c=line.split(",");if(c.length>=8)s.transactions.push({id:String(Date.now()+i),date:c[0],type:c[1],name:c[2],symbol:c[3],exchange:c[4],action:c[5],qty:Number(c[6]),price:Number(c[7]),charges:Number(c[8])||0,brokerage:0,stt:0,gst:0,otherCharges:Number(c[8])||0,notes:c[9]||""})});save();render();alert(lines.length+" row(s) imported.")}
  if(e.target.id==="refresh")refreshQuotes();
  if(e.target.id==="del"||e.target.dataset.del){if(e.target.dataset.del&&confirm("Delete transaction?")){s.transactions=s.transactions.filter(x=>x.id!==e.target.dataset.del);save();render()}}
});
document.addEventListener("input",e=>{
  if(e.target.id==="search"||e.target.id==="filter"){const qv=($("search").value||"").toLowerCase(),fv=$("filter").value;$("hm").innerHTML=table(holdings().filter(x=>(!fv||x.type===fv)&&(!qv||x.name.toLowerCase().includes(qv)||x.symbol.toLowerCase().includes(qv))))}
});
document.addEventListener("change",e=>{
  if(e.target.id==="autolock"){s.settings.privacy.autoLockMinutes=Number(e.target.value);save()}
  if(e.target.id==="ttl"){s.settings.market.refreshTtl=Math.max(10000,Number(e.target.value||60)*1000);save()}
  if(e.target.id==="importJson"){const file=e.target.files?.[0];if(file){const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!Array.isArray(x.transactions))throw new Error("Invalid backup");s=x;normalizeState();save();render();alert("Backup imported.")}catch(err){alert("Import failed: "+err.message)}};r.readAsText(file)}}
});
$("mb").onclick=e=>{if(e.target===$("mb"))closeModal()};
$("unlockPin").addEventListener("keydown",e=>{if(e.key==="Enter")unlock()});
async function refreshQuotes(){
  const hs=holdings(),before={};hs.forEach(h=>before[h.symbol]=q[h.symbol]||null);
  let ok=0;await Promise.all(hs.map(async h=>{try{await fetchQuote(h.symbol,h.exchange,true);ok++}catch(_){} }));Object.keys(before).forEach(k=>{if(before[k]!=null)q[k+"_prev"]=before[k]});saveQuotes();s.meta.lastQuoteRefreshAt=Date.now();save();render();alert(ok+" quote(s) refreshed.")}
render();
if(s.settings.privacy.pinHash)lock();
