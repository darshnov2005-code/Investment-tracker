"use strict";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  Accept: "application/json,text/plain,*/*"
};

const UNIVERSE = [
  "RELIANCE", "TCS", "HDFCBANK", "BHARTIARTL", "ICICIBANK", "SBIN", "INFY", "ITC",
  "LT", "HINDUNILVR", "BAJFINANCE", "HCLTECH", "KOTAKBANK", "SUNPHARMA", "AXISBANK",
  "MARUTI", "TITAN", "ASIANPAINT", "ULTRACEMCO", "NTPC", "POWERGRID", "ONGC", "M&M",
  "TATASTEEL", "WIPRO", "ADANIENT", "ADANIPORTS", "JSWSTEEL", "COALINDIA", "BAJAJFINSV",
  "NESTLEIND", "TECHM", "CIPLA", "GRASIM", "HINDALCO", "DRREDDY", "INDUSINDBK",
  "TATAMOTORS", "BPCL", "EICHERMOT", "APOLLOHOSP", "DIVISLAB", "BRITANNIA", "HEROMOTOCO",
  "BAJAJ-AUTO", "TATACONSUM", "SBILIFE", "HDFCLIFE", "TRENT", "BEL",
  "PIDILITIND", "DIXON", "POLYCAB", "PERSISTENT", "CUMMINSIND", "HAVELLS", "SIEMENS",
  "ABB", "GODREJCP", "DABUR", "COLPAL", "MARICO", "AMBUJACEM", "SHREECEM", "DLF",
  "LODHA", "IRFC", "PFC", "RECLTD", "BANKBARODA", "PNB", "CANBK", "FEDERALBNK",
  "AUROPHARMA", "LUPIN", "BIOCON", "ZYDUSLIFE", "TVSMOTOR", "BOSCHLTD", "MOTHERSON",
  "ASHOKLEY", "VEDL", "NMDC", "SAIL", "IOC", "GAIL", "PETRONET", "IGL"
];

async function yahooBars(symbol) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol + ".NS") +
    "?range=1y&interval=1d";
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  const result = d?.chart?.result?.[0];
  const meta = result?.meta || {};
  const q = result?.indicators?.quote?.[0] || {};
  const closes = (q.close || []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  const highs = (q.high || []).map(Number);
  const lows = (q.low || []).map(Number);
  const volumes = (q.volume || []).map((v) => Number(v) || 0);
  if (closes.length < 40) throw new Error("short history");
  const n = Math.min(closes.length, volumes.length || closes.length);
  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    closes: closes.slice(-n),
    highs: highs.slice(-n).map((h, i) => (Number.isFinite(h) ? h : closes[closes.length - n + i])),
    lows: lows.slice(-n).map((l, i) => (Number.isFinite(l) ? l : closes[closes.length - n + i])),
    volumes: volumes.slice(-n)
  };
}

function avg(a) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}
function sma(arr, n) {
  if (arr.length < n) return null;
  return avg(arr.slice(-n));
}
function rsi14(closes) {
  if (closes.length < 16) return null;
  const gains = [], losses = [];
  for (let i = closes.length - 14; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const ag = avg(gains), al = avg(losses);
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function analyze(bar) {
  const closes = bar.closes, highs = bar.highs, lows = bar.lows, volumes = bar.volumes;
  const price = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = closes.length >= 200 ? sma(closes, 200) : null;
  const high20 = Math.max(...highs.slice(-20));
  const high52 = Math.max(...closes);
  const low52 = Math.min(...closes);
  const avgVol20 = avg(volumes.slice(-20));
  const vol = volumes[volumes.length - 1];
  const volRatio = avgVol20 > 0 ? vol / avgVol20 : null;
  const rsi = rsi14(closes);
  const nearHighPct = ((high52 - price) / high52) * 100;
  const nearLowPct = ((price - low52) / low52) * 100;
  const distHigh20 = ((high20 - price) / high20) * 100;
  const bounceFromLow = ((price - low52) / low52) * 100;
  const lagFromHigh = nearHighPct;
  const recent = closes.slice(-5);
  const prior = closes.slice(-10, -5);
  const recentRet =
    recent.length && prior.length ? ((avg(recent) - avg(prior)) / avg(prior)) * 100 : 0;

  const base = {
    symbol: bar.symbol,
    name: bar.name,
    price: Math.round(price * 100) / 100,
    rsi: rsi != null ? Math.round(rsi * 10) / 10 : null,
    sma20, sma50, sma200,
    volRatio: volRatio != null ? Math.round(volRatio * 100) / 100 : null,
    nearHighPct: Math.round(nearHighPct * 10) / 10,
    nearLowPct: Math.round(nearLowPct * 10) / 10,
    avgVol20: avgVol20 != null ? Math.round(avgVol20) : null
  };

  const opportunities = [];

  {
    let score = 0;
    const why = [];
    if (nearHighPct <= 5) { score += 35; why.push("Within " + nearHighPct.toFixed(1) + "% of 52W high"); }
    else if (nearHighPct <= 8) { score += 20; why.push(nearHighPct.toFixed(1) + "% below 52W high"); }
    if (distHigh20 <= 2) { score += 25; why.push("Pressing 20-day high"); }
    else if (distHigh20 <= 4) { score += 12; why.push("Near 20-day high"); }
    if (sma20 && price > sma20) { score += 15; why.push("Above 20DMA"); }
    if (volRatio >= 1.3) { score += 15; why.push("Volume " + volRatio.toFixed(1) + "x avg"); }
    if (rsi != null && rsi >= 55 && rsi <= 72) { score += 10; why.push("RSI " + rsi.toFixed(0) + " (momentum)"); }
    if (score >= 40) opportunities.push({ type: "breakout", label: "Nearing breakout", score: Math.min(100, score), why });
  }

  {
    let score = 0;
    const why = [];
    if (rsi != null && rsi <= 30) { score += 40; why.push("RSI oversold " + rsi.toFixed(0)); }
    else if (rsi != null && rsi <= 38) { score += 25; why.push("RSI weak " + rsi.toFixed(0)); }
    if (nearLowPct <= 8) { score += 30; why.push("Near 52W low (+" + nearLowPct.toFixed(1) + "%)"); }
    else if (nearLowPct <= 15) { score += 15; why.push("Lower half of range"); }
    if (sma50 && price < sma50) { score += 15; why.push("Below 50DMA"); }
    if (sma200 && price < sma200) { score += 10; why.push("Below 200DMA"); }
    if (score >= 40) opportunities.push({ type: "value", label: "Value / oversold zone", score: Math.min(100, score), why });
  }

  {
    let score = 0;
    const why = [];
    if (bounceFromLow >= 5 && bounceFromLow <= 25 && lagFromHigh >= 8) {
      score += 25;
      why.push("Bounce +" + bounceFromLow.toFixed(0) + "% off 52W low, still " + lagFromHigh.toFixed(0) + "% off high");
    }
    if (rsi != null && rsi >= 40 && rsi <= 55) { score += 20; why.push("RSI recovering " + rsi.toFixed(0)); }
    if (sma20 && price > sma20) { score += 20; why.push("Reclaimed 20DMA"); }
    if (sma50 && price < sma50) { score += 15; why.push("Still under 50DMA (early)"); }
    if (recentRet > 1) { score += 15; why.push("Short-term strength +" + recentRet.toFixed(1) + "%"); }
    if (score >= 45) opportunities.push({ type: "rs_recovery", label: "RS recovery", score: Math.min(100, score), why });
  }

  {
    let score = 0;
    const why = [];
    const liquid = avgVol20 != null && avgVol20 >= 200000;
    if (liquid) {
      if (volRatio >= 2) { score += 40; why.push("Volume surge " + volRatio.toFixed(1) + "x"); }
      else if (volRatio >= 1.5) { score += 25; why.push("Elevated volume " + volRatio.toFixed(1) + "x"); }
      if (nearHighPct <= 6 || distHigh20 <= 2) { score += 25; why.push("Breakout area"); }
      if (sma20 && price > sma20) { score += 15; why.push("Above 20DMA"); }
      score += 15; why.push("Liquid (avg vol OK)");
      if (score >= 50) opportunities.push({ type: "volume_breakout", label: "Volume breakout", score: Math.min(100, score), why });
    }
  }

  {
    let score = 0;
    const why = [];
    if (bounceFromLow >= 8 && lagFromHigh >= 12 && lagFromHigh <= 35) {
      score += 30;
      why.push("Recovering but " + lagFromHigh.toFixed(0) + "% below 52W high");
    }
    if (rsi != null && rsi >= 45 && rsi <= 60) { score += 15; why.push("Neutral-positive RSI"); }
    if (sma50 && sma200 && price > sma50 && price < sma200) {
      score += 25; why.push("Above 50DMA, still under 200DMA");
    } else if (sma50 && price > sma50 && lagFromHigh >= 10) {
      score += 15; why.push("Trend improving, price lag remains");
    }
    if (volRatio >= 1.2 && volRatio < 2) { score += 10; why.push("Quiet accumulation volume"); }
    if (score >= 45) opportunities.push({ type: "price_lag", label: "Price lag / incomplete recovery", score: Math.min(100, score), why });
  }

  return { ...base, opportunities };
}

export default async function handler(req, res) {
  try {
    const limit = Math.min(90, Math.max(20, Number(req.query.limit) || 80));
    const list = UNIVERSE.slice(0, limit);
    const results = [];
    for (let i = 0; i < list.length; i += 6) {
      const batch = list.slice(i, i + 6);
      const part = await Promise.all(
        batch.map(async (sym) => {
          try {
            return analyze(await yahooBars(sym));
          } catch (e) {
            return null;
          }
        })
      );
      results.push(...part.filter(Boolean));
    }

    const byType = {
      breakout: [], value: [], rs_recovery: [], volume_breakout: [], price_lag: []
    };
    for (const row of results) {
      for (const op of row.opportunities || []) {
        byType[op.type]?.push({
          symbol: row.symbol, name: row.name, price: row.price, rsi: row.rsi,
          volRatio: row.volRatio, nearHighPct: row.nearHighPct,
          score: op.score, label: op.label, why: op.why
        });
      }
    }
    for (const k of Object.keys(byType)) {
      byType[k].sort((a, b) => b.score - a.score);
      byType[k] = byType[k].slice(0, 15);
    }

    res.setHeader("Cache-Control", "public, s-maxage=1800, max-age=600, stale-while-revalidate=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      asOf: new Date().toISOString(),
      universe: list.length,
      scanned: results.length,
      categories: {
        breakout: { title: "Nearing breakout", items: byType.breakout },
        value: { title: "Value / oversold zone", items: byType.value },
        rs_recovery: { title: "RS recovery after correction", items: byType.rs_recovery },
        volume_breakout: { title: "High-volume breakouts", items: byType.volume_breakout },
        price_lag: { title: "Price lag / incomplete recovery", items: byType.price_lag }
      },
      note:
        "Universe = liquid NSE names (~Nifty + midcaps), not the full market. Value zone uses RSI/range as a proxy (not PE). Not investment advice."
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "opportunities scan failed" });
  }
}
