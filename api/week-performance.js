"use strict";

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  Accept: "application/json,text/plain,*/*"
};

async function yahooWeek(symbol) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol + ".NS") +
    "?range=5d&interval=1d";
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  const result = d?.chart?.result?.[0];
  if (!result) throw new Error("no data");
  const meta = result.meta || {};
  const q = result.indicators?.quote?.[0] || {};
  const closes = (q.close || []).filter(x => typeof x === "number" && isFinite(x));
  const price = Number(meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : NaN));
  const weekStart = closes.length ? closes[0] : Number(meta.chartPreviousClose);
  if (!Number.isFinite(price) || !Number.isFinite(weekStart) || weekStart <= 0) {
    throw new Error("bad price");
  }
  const changePct = ((price - weekStart) / weekStart) * 100;
  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price,
    weekStartPrice: weekStart,
    changePct,
    change: price - weekStart,
    bars: closes.length
  };
}

export default async function handler(req, res) {
  try {
    const raw = String(req.query.symbols || req.query.symbol || "").trim();
    if (!raw) return res.status(400).json({ error: "symbols required" });
    let list = raw
      .split(/[,|\s]+/)
      .map(x => x.trim().toUpperCase())
      .filter(Boolean);
    list = [...new Set(list)].slice(0, 25);

    const results = [];
    for (let i = 0; i < list.length; i += 5) {
      const batch = list.slice(i, i + 5);
      const part = await Promise.all(
        batch.map(async sym => {
          try {
            return await yahooWeek(sym);
          } catch (e) {
            return { symbol: sym, price: null, changePct: null, error: e.message || "fail" };
          }
        })
      );
      results.push(...part);
    }

    results.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));

    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=120, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      asOf: new Date().toISOString(),
      count: results.length,
      items: results,
      source: "Yahoo Finance 5d bars (.NS)"
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "week performance unavailable" });
  }
}
