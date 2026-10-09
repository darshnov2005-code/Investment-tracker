"use strict";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  Accept: "application/json,text/plain,*/*"
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=14400, max-age=1800, stale-while-revalidate=86400"
  );
}

async function niftyBars() {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=10y&interval=1d";
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("Yahoo HTTP " + r.status);
  const d = await r.json();
  const result = d?.chart?.result?.[0];
  if (!result) throw new Error("no Nifty data");
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c !== "number" || !isFinite(c)) continue;
    const dt = new Date(ts[i] * 1000);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();
    const dow = dt.getUTCDay();
    bars.push({ t: ts[i], y, m, day, dow, close: c });
  }
  return bars;
}

function buildSeasonality(bars) {
  const rets = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (!prev || prev <= 0) continue;
    const pct = ((cur - prev) / prev) * 100;
    rets.push({
      day: bars[i].day,
      dow: bars[i].dow,
      m: bars[i].m,
      y: bars[i].y,
      pct
    });
  }

  function agg(keyFn, keys) {
    const bucket = {};
    keys.forEach((k) => {
      bucket[k] = { sum: 0, n: 0, up: 0, down: 0 };
    });
    rets.forEach((r) => {
      const k = keyFn(r);
      if (!(k in bucket)) return;
      const b = bucket[k];
      b.sum += r.pct;
      b.n += 1;
      if (r.pct > 0) b.up += 1;
      else if (r.pct < 0) b.down += 1;
    });
    return keys.map((k) => {
      const b = bucket[k];
      const avg = b.n ? b.sum / b.n : null;
      const upPct = b.n ? (b.up / b.n) * 100 : null;
      return {
        key: k,
        avgReturn: avg != null ? Math.round(avg * 1000) / 1000 : null,
        upPct: upPct != null ? Math.round(upPct * 10) / 10 : null,
        samples: b.n,
        up: b.up,
        down: b.down
      };
    });
  }

  const byDom = agg((r) => r.day, Array.from({ length: 31 }, (_, i) => i + 1));
  const byDow = agg((r) => r.dow, [1, 2, 3, 4, 5]).map((x) => ({
    ...x,
    label: ["", "Mon", "Tue", "Wed", "Thu", "Fri"][x.key]
  }));

  const ranked = byDom
    .filter((x) => x.samples >= 40 && x.avgReturn != null)
    .slice()
    .sort((a, b) => a.avgReturn - b.avgReturn);

  const softDays = ranked.slice(0, 5).map((x) => x.key);
  const strongDays = ranked.slice().reverse().slice(0, 5).map((x) => x.key);

  return {
    byDayOfMonth: byDom,
    byWeekday: byDow,
    softDays,
    strongDays,
    samples: rets.length,
    years: bars.length ? bars[bars.length - 1].y - bars[0].y + 1 : 0
  };
}

async function fiiDiiCash() {
  try {
    const r = await fetch("https://www.nseindia.com/api/fiidiiTradeReact", {
      headers: {
        ...headers,
        Referer: "https://www.nseindia.com/report-detail/fii-dii"
      }
    });
    if (!r.ok) throw new Error("NSE HTTP " + r.status);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error("bad FII shape");
    const byCat = {};
    let date = null;
    rows.forEach((row) => {
      const cat = String(row.category || "").toUpperCase();
      date = row.date || date;
      byCat[cat] = {
        buy: Number(row.buyValue),
        sell: Number(row.sellValue),
        net: Number(row.netValue)
      };
    });
    const fii = byCat["FII/FPI"] || byCat["FII"] || null;
    const dii = byCat["DII"] || null;
    return { date, fii, dii, segment: "CASH", source: "NSE fiidiiTradeReact" };
  } catch (e) {
    return { error: e.message || "FII/DII cash unavailable", segment: "CASH" };
  }
}

async function fiiDiiFno() {
  return {
    segment: "FNO",
    available: false,
    note:
      "F&O FII/DII (index/stock futures & options) is published by NSE after close; free JSON is session-locked. Cash FII/DII is live below. We can wire F&O when a stable free source is available.",
    fii: null,
    dii: null
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  try {
    cors(res);
    const [bars, cash, fno] = await Promise.all([
      niftyBars(),
      fiiDiiCash(),
      fiiDiiFno()
    ]);
    const seasonality = buildSeasonality(bars);
    const last = bars[bars.length - 1];
    return res.status(200).json({
      asOf: new Date().toISOString(),
      index: "NIFTY 50",
      lastClose: last
        ? {
            date:
              last.y +
              "-" +
              String(last.m).padStart(2, "0") +
              "-" +
              String(last.day).padStart(2, "0"),
            close: last.close
          }
        : null,
      seasonality,
      fiiDii: { cash, fno },
      tip: "Historically softer calendar days are candidates for SIP debit dates — past patterns are not guarantees.",
      source: "Yahoo Finance ^NSEI (10y) + NSE FII/DII cash"
    });
  } catch (e) {
    cors(res);
    return res.status(500).json({ error: e.message || "sip-calendar failed" });
  }
}
