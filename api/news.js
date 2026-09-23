export default async function handler(req,res){
  const symbol=String(req.query.symbol||"").trim().toUpperCase();
  const exchange=String(req.query.exchange||"NSE").trim().toUpperCase();
  const requestedName=String(req.query.name||"").trim();
  if(!symbol)return res.status(400).json({error:"symbol is required"});
  const ticker=symbol+(exchange==="BSE"?".BO":".NS");
  const headers={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36","Accept":"application/json,text/plain,*/*","Accept-Language":"en-IN,en;q=0.9"};
  try{
    // First resolve the exact listed security, then request news using the
    // provider's canonical company name. Yahoo's symbol-only search can return
    // generic Indian-market stories for many different tickers.
    const qr=await fetch("https://query1.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(ticker)+"&newsCount=0&quotesCount=6",{headers});
    if(!qr.ok)throw new Error("Yahoo quote search HTTP "+qr.status);
    const qd=await qr.json();
    const quotes=qd?.quotes||[];
    const exact=quotes.find(x=>String(x.symbol||"").toUpperCase()===ticker) || quotes[0] || {};
    const companyName=requestedName||exact.longname||exact.shortname||symbol;
    const query=companyName+" "+symbol;
    const nr=await fetch("https://query1.finance.yahoo.com/v1/finance/search?q="+encodeURIComponent(query)+"&newsCount=30&quotesCount=0",{headers});
    if(!nr.ok)throw new Error("Yahoo news HTTP "+nr.status);
    const nd=await nr.json();

    const stop=new Set(["ltd","limited","india","the","and","co","company","industries","corporation","corp"]);
    const tokens=(companyName+" "+symbol).toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(x=>x.length>=3&&!stop.has(x));
    const strong=tokens.filter(x=>x.length>=4);
    const relevant=(nd?.news||[]).filter(x=>{
      const hay=((x.title||"")+" "+(x.summary||"")).toLowerCase();
      return hay.includes(symbol.toLowerCase()) || strong.some(t=>hay.includes(t));
    });
    const seen=new Set();
    const items=relevant.filter(x=>{const k=(x.title||"").trim().toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true}).slice(0,12).map(x=>({
      title:x.title||"",
      publisher:x.publisher||"Yahoo Finance",
      published:x.providerPublishTime?new Date(x.providerPublishTime*1000).toLocaleString("en-IN"):"",
      link:x.link||""
    }));
    res.setHeader("Cache-Control","s-maxage=180, stale-while-revalidate=600");
    return res.status(200).json({symbol,exchange,name:companyName,source:"Yahoo Finance",fetchedAt:new Date().toISOString(),items});
  }catch(e){
    return res.status(502).json({error:"Unable to fetch news",symbol,detail:e?.message||"Provider error"})
  }
}