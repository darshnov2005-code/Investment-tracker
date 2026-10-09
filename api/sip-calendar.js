"use strict";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "en-IN,en;q=0.9"
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=7200, max-age=900, stale-while-revalidate=43200"
  );
}

function num(x) {
  if (x == null || x === "") return null;
  const n = Number(String(x).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function extractNextData(html) {
  const m = String(html || "").match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (_) {
    return null;
  }
}

async function fetchMcPage(path) {
  const url = "https://www.moneycontrol.com/markets/fii-dii-data/" + path;
  const r = await fetch(url, {
    headers: { ...headers, Referer: "https://www.moneycontrol.com/" }
  });
  if (!r.ok) throw new Error("Moneycontrol HTTP " + r.status + " " + path);
  return extractNextData(await r.text());
}

function parseCashRows(next) {
  const rows =
    next?.props?.pageProps?.FiiDiiData?.fiiDiiData ||
    next?.props?.pageProps?.FiiDiiChartData?.fiiDiiChartData ||
    [];
  return (rows || [])
    .map((r) => ({
      date: r.date,
      fiiBuy: num(r.fiiPurchase),
      fiiSell: num(r.fiiSales),
      fiiNet: num(r.fiiNet),
      diiBuy: num(r.diiPurchase),
      diiSell: num(r.diiSale),
      diiNet: num(r.diiNet),
      niftyClose: num(r.niftyClose),
      niftyChangePer: num(r.niftyChangePer)
    }))
    .filter((r) => r.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function parseFnoRows(next) {
  const rows =
    next?.props?.pageProps?.FiiDiiData?.fiiDiiData ||
    next?.props?.pageProps?.FiiDiiChartData?.fiiDiiChartData ||
    [];
  return (rows || [])
    .map((r) => ({
      date: r.date,
      futBuy: num(r.futPurchase),
      futSell: num(r.futSales),
      futNet: num(r.futNet),
      optBuy: num(r.optPurchase),
      optSell: num(r.optSale),
      optNet: num(r.optNet),
      indexClose: num(r.indexClose),
      indexChangePer: num(r.indexChangePer)
    }))
    .filter((r) => r.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

async function nseLatestCash() {
  try {
    const r = await fetch("https://www.nseindia.com/api/fiidiiTradeReact", {
      headers: {
        ...headers,
        Accept: "application/json",
        Referer: "https://www.nseindia.com/report-detail/fii-dii"
      }
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    const out = { date: null, fii: null, dii: null };
    rows.forEach((row) => {
      const cat = String(row.category || "").toUpperCase();
      out.date = row.date || out.date;
      const payload = {
        buy: num(row.buyValue),
        sell: num(row.sellValue),
        net: num(row.netValue)
      };
      if (cat.includes("FII")) out.fii = payload;
      if (cat.includes("DII")) out.dii = payload;
    });
    return out;
  } catch (_) {
    return null;
  }
}

function monthKey(iso) {
  return String(iso || "").slice(0, 7);
}

function aggregateMonthly(dailyCash, dailyFno) {
  const map = {};
  dailyCash.forEach((d) => {
    if (!d.date || d.date < "2026-01-01") return;
    const k = monthKey(d.date);
    if (!map[k]) {
      map[k] = {
        month: k,
        sessions: 0,
        fiiNet: 0,
        diiNet: 0,
        fiiBuy: 0,
        fiiSell: 0,
        diiBuy: 0,
        diiSell: 0,
        futNet: 0,
        optNet: 0
      };
    }
    const m = map[k];
    m.sessions += 1;
    if (d.fiiNet != null) m.fiiNet += d.fiiNet;
    if (d.diiNet != null) m.diiNet += d.diiNet;
    if (d.fiiBuy != null) m.fiiBuy += d.fiiBuy;
    if (d.fiiSell != null) m.fiiSell += d.fiiSell;
    if (d.diiBuy != null) m.diiBuy += d.diiBuy;
    if (d.diiSell != null) m.diiSell += d.diiSell;
  });
  dailyFno.forEach((d) => {
    if (!d.date || d.date < "2026-01-01") return;
    const k = monthKey(d.date);
    if (!map[k]) {
      map[k] = {
        month: k,
        sessions: 0,
        fiiNet: 0,
        diiNet: 0,
        fiiBuy: 0,
        fiiSell: 0,
        diiBuy: 0,
        diiSell: 0,
        futNet: 0,
        optNet: 0
      };
    }
    if (d.futNet != null) map[k].futNet += d.futNet;
    if (d.optNet != null) map[k].optNet += d.optNet;
  });
  return Object.keys(map)
    .sort()
    .map((k) => {
      const m = map[k];
      ["fiiNet", "diiNet", "fiiBuy", "fiiSell", "diiBuy", "diiSell", "futNet", "optNet"].forEach(
        (f) => {
          m[f] = Math.round(m[f] * 100) / 100;
        }
      );
      return m;
    });
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
    bars.push({
      t: ts[i],
      y: dt.getUTCFullYear(),
      m: dt.getUTCMonth() + 1,
      day: dt.getUTCDate(),
      dow: dt.getUTCDay(),
      close: c
    });
  }
  return bars;
}

function buildSeasonality(bars) {
  const rets = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (!prev || prev <= 0) continue;
    rets.push({
      day: bars[i].day,
      dow: bars[i].dow,
      pct: ((cur - prev) / prev) * 100
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
  return {
    byDayOfMonth: byDom,
    byWeekday: byDow,
    softDays: ranked.slice(0, 5).map((x) => x.key),
    strongDays: ranked.slice().reverse().slice(0, 5).map((x) => x.key),
    samples: rets.length,
    years: bars.length ? bars[bars.length - 1].y - bars[0].y + 1 : 0
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res);
    return res.status(204).end();
  }
  try {
    cors(res);
    const [cashNext, fnoNext, bars, nse] = await Promise.all([
      fetchMcPage("cash/").catch((e) => ({ __error: e.message })),
      fetchMcPage("futures-and-options/").catch((e) => ({ __error: e.message })),
      niftyBars().catch(() => []),
      nseLatestCash()
    ]);

    let dailyCash = [];
    let dailyFno = [];
    let mcErrors = [];
    if (cashNext && !cashNext.__error) dailyCash = parseCashRows(cashNext);
    else mcErrors.push("cash: " + (cashNext?.__error || "parse fail"));
    if (fnoNext && !fnoNext.__error) dailyFno = parseFnoRows(fnoNext);
    else mcErrors.push("fno: " + (fnoNext?.__error || "parse fail"));

    dailyCash = dailyCash.filter((d) => d.date >= "2026-01-01");
    dailyFno = dailyFno.filter((d) => d.date >= "2026-01-01");

    const monthly = aggregateMonthly(dailyCash, dailyFno);
    const seasonality = bars.length ? buildSeasonality(bars) : null;
    const last = bars.length ? bars[bars.length - 1] : null;
    const latestCash = dailyCash.length ? dailyCash[dailyCash.length - 1] : null;

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
      fiiDii: {
        source: "Moneycontrol (cash + F&O pages) + NSE latest cross-check",
        note:
          "Moneycontrol free table is typically the last ~30 sessions. Monthly view sums those days. Client stores history from Jan 2026 as you visit.",
        from: "2026-01-01",
        dailyCash,
        dailyFno,
        monthly,
        nseLatest: nse,
        latestCash,
        errors: mcErrors
      },
      tip: "Historically softer calendar days are candidates for SIP debit dates — past patterns are not guarantees.",
      source: "Yahoo ^NSEI + Moneycontrol FII/DII + NSE"
    });
  } catch (e) {
    cors(res);
    return res.status(500).json({ error: e.message || "sip-calendar failed" });
  }
}
