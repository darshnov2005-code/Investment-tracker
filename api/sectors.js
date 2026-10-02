"use strict";

/**
 * NSE sector / thematic day-move heatmap.
 * Designed for low load: long cache after market close; client also day-caches.
 */

const SECTORS = [
  { id: "NIFTY50", name: "Nifty 50", symbol: "^NSEI", group: "Benchmark" },
  { id: "BANK", name: "Bank", symbol: "^NSEBANK", group: "Financials" },
  { id: "PVTBANK", name: "Private Bank", symbol: "NIFTY_PVT_BANK.NS", group: "Financials" },
  { id: "PSUBANK", name: "PSU Bank", symbol: "^CNXPSUBANK", group: "Financials" },
  { id: "FIN", name: "Financial Services", symbol: "NIFTY_FIN_SERVICE.NS", group: "Financials" },
  { id: "IT", name: "IT", symbol: "^CNXIT", group: "Technology" },
  { id: "AUTO", name: "Auto", symbol: "^CNXAUTO", group: "Cyclical" },
  { id: "METAL", name: "Metal", symbol: "^CNXMETAL", group: "Cyclical" },
  { id: "REALTY", name: "Realty", symbol: "^CNXREALTY", group: "Cyclical" },
  { id: "ENERGY", name: "Energy", symbol: "^CNXENERGY", group: "Energy" },
  { id: "OILGAS", name: "Oil & Gas", symbol: "NIFTY_OIL_AND_GAS.NS", group: "Energy" },
  { id: "PHARMA", name: "Pharma", symbol: "^CNXPHARMA", group: "Healthcare" },
  { id: "HEALTH", name: "Healthcare", symbol: "NIFTY_HEALTHCARE.NS", group: "Healthcare" },
  { id: "FMCG", name: "FMCG", symbol: "^CNXFMCG", group: "Defensive" },
  { id: "CONSUM", name: "Consumption", symbol: "^CNXCONSUM", group: "Defensive" },
  { id: "DURABLE", name: "Consumer Durables", symbol: "NIFTY_CONSR_DURBL.NS", group: "Defensive" },
  { id: "MEDIA", name: "Media", symbol: "^CNXMEDIA", group: "Others" },
  { id: "INFRA", name: "Infrastructure", symbol: "^CNXINFRA", group: "Others" },
  { id: "SERVICE", name: "Services", symbol: "^CNXSERVICE", group: "Others" }
];

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-IN,en;q=0.9"
};

let memCache = null;

function istNow() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const mins = hour * 60 + minute;
  const weekday = parts.weekday;
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const marketOpen = !isWeekend && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekday,
    marketOpen,
    isWeekend
  };
}

async function fetchOne(sector) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(sector.symbol) +
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
  const prev =
    closes.length >= 2
      ? closes[closes.length - 2]
      : Number(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0) {
    throw new Error("bad price");
  }
  const changePct = ((price - prev) / prev) * 100;
  return {
    id: sector.id,
    name: sector.name,
    group: sector.group,
    symbol: sector.symbol,
    price,
    previousClose: prev,
    changePct,
    change: price - prev
  };
}

async function loadAll() {
  const ist = istNow();
  if (
    memCache &&
    memCache.tradeDate === ist.date &&
    !ist.marketOpen &&
    Array.isArray(memCache.sectors) &&
    memCache.sectors.length
  ) {
    return { ...memCache, marketOpen: false, fromMemCache: true };
  }
  if (
    memCache &&
    memCache.tradeDate === ist.date &&
    ist.marketOpen &&
    Date.now() - (memCache.fetchedAt || 0) < 5 * 60 * 1000
  ) {
    return { ...memCache, marketOpen: true, fromMemCache: true };
  }

  const results = await Promise.all(
    SECTORS.map(async s => {
      try {
        return await fetchOne(s);
      } catch (e) {
        return {
          id: s.id,
          name: s.name,
          group: s.group,
          symbol: s.symbol,
          price: null,
          previousClose: null,
          changePct: null,
          change: null,
          error: e.message || "unavailable"
        };
      }
    })
  );

  const payload = {
    tradeDate: ist.date,
    asOfTimeIST: ist.time,
    weekday: ist.weekday,
    marketOpen: ist.marketOpen,
    isWeekend: ist.isWeekend,
    fetchedAt: Date.now(),
    source: "Yahoo Finance (NSE sector indices)",
    sectors: results,
    note: ist.marketOpen
      ? "Live session — data may update every few minutes."
      : "Market closed — showing last available session levels. No continuous refresh needed."
  };
  memCache = payload;
  return payload;
}

export default async function handler(req, res) {
  try {
    const force = String(req.query.force || "") === "1";
    if (force) memCache = null;
    const data = await loadAll();
    const maxAge = data.marketOpen ? 120 : 3600;
    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${maxAge}, max-age=${maxAge}, stale-while-revalidate=600`
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Sector heatmap unavailable" });
  }
}
