export default async function handler(req,res){
  const symbol=String(req.query.symbol||"").trim().toUpperCase();
  const exchange=String(req.query.exchange||"NSE").trim().toUpperCase();
  if(!symbol)return res.status(400).json({error:"symbol is required"});
  const ticker=symbol+(exchange==="BSE"?".BO":".NS");
  const headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36","Accept":"application/json,text/plain,*/*","Accept-Language":"en-IN,en;q=0.9"};
  try{
    const url="https://query1.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(ticker)+"&newsCount=12&quotesCount=1";
    const r=await fetch(url,{headers});
    if(!r.ok)throw new Error("Yahoo news HTTP "+r.status);
    const d=await r.json();
    const quote=d?.quotes?.[0];
    const items=(d?.news||[]).slice(0,12).map(x=>({title:x.title||"",publisher:x.publisher||"Yahoo Finance",published:x.providerPublishTime?new Date(x.providerPublishTime*1000).toLocaleString("en-IN"):"",link:x.link||""}));
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=1800");
    return res.status(200).json({symbol,exchange,name:quote?.longname||quote?.shortname||symbol,source:"Yahoo Finance",fetchedAt:new Date().toISOString(),items});
  }catch(e){return res.status(502).json({error:"Unable to fetch news",symbol,detail:e?.message||"Provider error"})}
}