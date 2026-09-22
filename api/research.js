export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const exchange = String(req.query.exchange || "NSE").trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol is required" });
  if (exchange !== "NSE" && exchange !== "BSE") return res.status(400).json({ error: "Use NSE or BSE for stock research." });

  const suffix = exchange === "BSE" ? ".BO" : ".NS";
  const ticker = symbol + suffix;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  function val(x) {
    return x && typeof x === "object" && "raw" in x ? x.raw : x;
  }

  try {
    const modules = [
      "price",
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData"
    ].join(",");

    const url = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/" +
      encodeURIComponent(ticker) + "?modules=" + modules;

    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error("Yahoo research HTTP " + r.status);

    const body = await r.json();
    const result = body?.quoteSummary?.result?.[0];
    if (!result) throw new Error("No research data found for " + symbol);

    const p = result.price || {};
    const s = result.summaryDetail || {};
    const k = result.defaultKeyStatistics || {};
    const f = result.financialData || {};

    const price = {};
    Object.keys(p).forEach(key => {
      const v = val(p[key]);
      if (v !== undefined && v !== null) price[key] = v;
    });

    const summaryDetail = {};
    Object.keys(s).forEach(key => {
      const v = val(s[key]);
      if (v !== undefined && v !== null) summaryDetail[key] = v;
    });

    const keyStats = {};
    Object.keys(k).forEach(key => {
      const v = val(k[key]);
      if (v !== undefined && v !== null) keyStats[key] = v;
    });

    const financialData = {};
    Object.keys(f).forEach(key => {
      const v = val(f[key]);
      if (v !== undefined && v !== null) financialData[key] = v;
    });

    return res.status(200).json({
      symbol,
      exchange,
      name: price.longName || price.shortName || symbol,
      source: "Yahoo Finance",
      fetchedAt: new Date().toISOString(),
      price,
      summaryDetail,
      keyStats,
      financialData
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to load stock research",
      symbol,
      exchange,
      detail: e?.message || "Provider error"
    });
  }
}