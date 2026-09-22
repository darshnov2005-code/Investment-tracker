export default async function handler(req, res) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "Accept": "text/html,application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  function cleanText(s) {
    return String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  }

  function num(s) {
    const x = String(s || "").replace(/,/g, "").replace(/%/g, "").trim();
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  // Chartink's public screener pages continue to expose the latest completed
  // scan results after market close. We use public scan pages rather than
  // requiring the user to search for a symbol.
  async function chartink(slug) {
    const r = await fetch("https://chartink.com/screener/" + encodeURIComponent(slug), {headers});
    if (!r.ok) throw new Error("Chartink HTTP " + r.status);
    return await r.text();
  }

  function parseStocks(html) {
    const out = [];
    // Chartink renders matched stocks in table rows. This parser is deliberately
    // tolerant because the public page markup changes occasionally.
    const rows = html.match(/<tr[\\s\\S]*?<\\/tr>/gi) || [];
    for (const row of rows) {
      const cells = (row.match(/<t[dh][^>]*>[\\s\\S]*?<\\/t[dh]>/gi) || []).map(cleanText);
      if (cells.length < 3) continue;
      const symbol = cells.find(x => /^[A-Z0-9&._-]{2,30}$/.test(x) && !/^Sr\\.?$/i.test(x));
      if (!symbol || /^(SYMBOL|STOCK|CLOSE|VOLUME|MARKETCAP)$/i.test(symbol)) continue;
      const nums = cells.map(num).filter(x => x !== null);
      const price = nums.length ? nums[0] : null;
      const change = cells.map(x => num(x)).find(x => x !== null && Math.abs(x) <= 100);
      const volume = nums.length > 1 ? nums[nums.length - 1] : null;
      const name = cells.find(x => x.length > 2 && !/^[A-Z0-9&._-]+$/.test(x) && !/^[-+]?\\d/.test(x)) || symbol;
      out.push({symbol, name, price, change, volume});
    }
    const seen = new Set();
    return out.filter(x => {
      if (seen.has(x.symbol)) return false;
      seen.add(x.symbol);
      return true;
    }).slice(0, 100);
  }

  try {
    // Public Chartink scans used as market-wide technical screens. These are
    // snapshots of the latest available completed candles, so they remain
    // useful after market close.
    const scans = [
      ["volume", "volume-surge"],
      ["high", "stocks-at-52-week-high"],
      ["low", "stocks-at-52-week-low"]
    ];

    const results = {};
    await Promise.all(scans.map(async ([key, slug]) => {
      try {
        results[key] = parseStocks(await chartink(slug));
      } catch (_) {
        results[key] = [];
      }
    }));

    const hasChartink = Object.values(results).some(x => x.length);
    if (hasChartink) {
      return res.status(200).json({
        source: "Chartink public market scans",
        fetchedAt: new Date().toISOString(),
        dataMode: "latest-available",
        volumeSurge: results.volume,
        near52High: results.high,
        near52Low: results.low,
        active: results.volume
      });
    }

    // Fallback to the existing NSE scanner so the app still works if Chartink
    // changes its public page structure or is temporarily unavailable.
    const nseHeaders = {...headers, "Accept":"application/json,text/plain,*/*", "Referer":"https://www.nseindia.com/market-data/live-equity-market"};
    async function nse(path) {
      const r = await fetch("https://www.nseindia.com" + path, {headers:nseHeaders});
      if (!r.ok) throw new Error("NSE HTTP " + r.status);
      return r.json();
    }
    function flatten(d) {
      const out = [];
      if (!d || typeof d !== "object") return out;
      if (Array.isArray(d.data)) out.push(...d.data);
      for (const v of Object.values(d)) if (v && typeof v === "object" && Array.isArray(v.data)) out.push(...v.data);
      return out;
    }
    function normalize(x) {
      const symbol=x.symbol||x.Symbol||x.symbolCode;
      return {
        symbol,
        name:x.meta?.companyName||x.companyName||x.company||symbol,
        price:Number(x.ltp??x.lastPrice??x.LTP??x.closePrice)||null,
        volume:Number(x.totalTradedVolume??x.volume??x.VOLUME)||null,
        high52:Number(x.yearHigh??x["52WeekHigh"]??x.week52High??x.high52)||null,
        low52:Number(x.yearLow??x["52WeekLow"]??x.week52Low??x.low52)||null,
        change:Number(x.pChange??x.percentChange??x.changePercent)||null
      };
    }
    const [volume,high,low,gainers]=await Promise.all([
      nse("/api/live-analysis-volume-gainers"),
      nse("/api/data-52weekhighstock"),
      nse("/api/data-52weeklowstock"),
      nse("/api/live-analysis-variations?index=gainers")
    ]);
    const merge=a=>{const m=new Map();a.flatMap(flatten).map(normalize).filter(x=>x.symbol).forEach(x=>m.set(x.symbol,{...(m.get(x.symbol)||{}),...x}));return [...m.values()]};
    return res.status(200).json({
      source:"NSE market scanners (fallback)",
      fetchedAt:new Date().toISOString(),
      dataMode:"live-session",
      volumeSurge:merge([volume]).slice(0,100),
      near52High:merge([high]).slice(0,100),
      near52Low:merge([low]).slice(0,100),
      active:merge([gainers,volume]).slice(0,100)
    });
  } catch (e) {
    return res.status(502).json({error:"Unable to load market scanner",detail:e?.message||"Provider error"});
  }
}