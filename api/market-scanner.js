export default async function handler(req, res) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer": "https://www.nseindia.com/market-data/live-equity-market"
  };
  const base = "https://www.nseindia.com";
  async function nse(path) {
    const r = await fetch(base + path, {headers});
    if (!r.ok) throw new Error("NSE HTTP " + r.status);
    return r.json();
  }
  function flatten(d) {
    const out = [];
    if (!d || typeof d !== "object") return out;
    if (Array.isArray(d.data)) out.push(...d.data);
    for (const v of Object.values(d)) {
      if (v && typeof v === "object" && Array.isArray(v.data)) out.push(...v.data);
    }
    return out;
  }
  function normalize(x) {
    const symbol = x.symbol || x.Symbol || x.symbolCode;
    const price = Number(x.ltp ?? x.lastPrice ?? x.LTP ?? x.closePrice);
    const volume = Number(x.totalTradedVolume ?? x.volume ?? x.VOLUME);
    const high = Number(x.yearHigh ?? x["52WeekHigh"] ?? x.week52High ?? x.high52);
    const low = Number(x.yearLow ?? x["52WeekLow"] ?? x.week52Low ?? x.low52);
    const change = Number(x.pChange ?? x.percentChange ?? x.changePercent);
    const volChange = Number(x.perChange ?? x.volumeChange ?? x.volumeChangePercent);
    return {symbol, price, volume, high52:high, low52:low, change, volumeChange:volChange, name:x.meta?.companyName || x.companyName || x.company || symbol};
  }
  try {
    const [volume, high, low, gainers] = await Promise.all([
      nse("/api/live-analysis-volume-gainers"),
      nse("/api/data-52weekhighstock"),
      nse("/api/data-52weeklowstock"),
      nse("/api/live-analysis-variations?index=gainers")
    ]);
    const vol = flatten(volume).map(normalize).filter(x=>x.symbol);
    const highs = flatten(high).map(normalize).filter(x=>x.symbol);
    const lows = flatten(low).map(normalize).filter(x=>x.symbol);
    const g = flatten(gainers).map(normalize).filter(x=>x.symbol);
    const merge = (a) => {
      const m = new Map();
      a.forEach(x => {
        const old=m.get(x.symbol)||{};
        m.set(x.symbol,{...old,...Object.fromEntries(Object.entries(x).filter(([,v])=>v!==undefined&&v!==null&&!Number.isNaN(v)))});
      });
      return [...m.values()];
    };
    const volumeStocks=merge(vol).sort((a,b)=>(b.volumeChange||0)-(a.volumeChange||0)).slice(0,100);
    const highStocks=merge(highs).slice(0,100);
    const lowStocks=merge(lows).slice(0,100);
    const active=merge([...g,...vol]).sort((a,b)=>(b.volume||0)-(a.volume||0)).slice(0,100);
    return res.status(200).json({
      source:"NSE market scanners",
      fetchedAt:new Date().toISOString(),
      volumeSurge:volumeStocks,
      near52High:highStocks,
      near52Low:lowStocks,
      active:active
    });
  } catch (e) {
    return res.status(502).json({error:"Unable to load market scanner",detail:e?.message||"NSE provider error"});
  }
}