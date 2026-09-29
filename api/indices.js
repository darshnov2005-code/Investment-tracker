export default async function handler(req, res) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  const map = [
    { key: "nifty", label: "Nifty 50", yahoo: "^NSEI" },
    { key: "sensex", label: "Sensex", yahoo: "^BSESN" },
    { key: "banknifty", label: "Bank Nifty", yahoo: "^NSEBANK" }
  ];

  async function fetchOne(item) {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(item.yahoo) +
      "?range=5d&interval=1d";
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) throw new Error("No data");
    const meta = result.meta || {};
    const closes = result.indicators?.quote?.[0]?.close || [];
    const price = Number(meta.regularMarketPrice);
    let prev = Number(meta.chartPreviousClose);
    if (!isFinite(prev) || prev <= 0) {
      const valid = closes.filter(x => typeof x === "number" && isFinite(x));
      prev = valid.length >= 2 ? valid[valid.length - 2] : valid[0];
    }
    const change = isFinite(price) && isFinite(prev) ? price - prev : null;
    const changePct = change != null && prev ? (change / prev) * 100 : null;
    return {
      key: item.key,
      label: item.label,
      symbol: item.yahoo,
      price: isFinite(price) ? price : null,
      previousClose: isFinite(prev) ? prev : null,
      change,
      changePct,
      currency: meta.currency || "INR",
      asOf: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString()
    };
  }

  try {
    const results = await Promise.all(
      map.map(async item => {
        try {
          return await fetchOne(item);
        } catch (e) {
          return {
            key: item.key,
            label: item.label,
            symbol: item.yahoo,
            price: null,
            previousClose: null,
            change: null,
            changePct: null,
            error: e?.message || "Unavailable"
          };
        }
      })
    );
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({
      source: "Yahoo Finance",
      fetchedAt: new Date().toISOString(),
      indices: results
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to fetch indices",
      detail: e?.message || "Provider error"
    });
  }
}
