"use strict";

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  Accept: "application/json,text/plain,*/*"
};

let amfiMap = null;
let amfiAt = 0;

function parseAmfi(text) {
  const byIsin = {};
  const byCode = {};
  for (const raw of text.split(/\r?\n/)) {
    const c = raw.split(";").map(x => String(x || "").trim());
    if (!/^\d+$/.test(c[0] || "")) continue;
    let name, nav, date, isin, isin2;
    if (c.length >= 8) {
      isin = c[1]; isin2 = c[2]; name = c[3]; nav = Number(c[6]); date = c[7];
    } else if (c.length >= 6) {
      isin = c[1]; isin2 = c[2]; name = c[3]; nav = Number(c[4]); date = c[5];
    } else continue;
    if (!name || !Number.isFinite(nav) || nav <= 0) continue;
    const row = { code: c[0], name, nav, date, isin: isin || "" };
    byCode[c[0]] = row;
    if (isin) byIsin[isin.toUpperCase()] = row;
    if (isin2) byIsin[isin2.toUpperCase()] = row;
  }
  return { byIsin, byCode };
}

async function loadAmfi() {
  if (amfiMap && Date.now() - amfiAt < 6 * 60 * 60 * 1000) return amfiMap;
  const r = await fetch("https://www.amfiindia.com/spages/NAVAll.txt", { headers });
  if (!r.ok) throw new Error("AMFI HTTP " + r.status);
  amfiMap = parseAmfi(await r.text());
  amfiAt = Date.now();
  return amfiMap;
}

function parseNavDate(s) {
  const m = String(s || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

async function weekForCode(code, hintName) {
  const r = await fetch("https://api.mfapi.in/mf/" + encodeURIComponent(code), { headers });
  if (!r.ok) throw new Error("mfapi HTTP " + r.status);
  const d = await r.json();
  const series = Array.isArray(d.data) ? d.data : [];
  if (!series.length) throw new Error("no nav history");
  const latest = series[0];
  const price = Number(latest.nav);
  const latestDate = parseNavDate(latest.date);
  let weekStart = null;
  let weekStartDate = null;
  if (latestDate) {
    const target = new Date(latestDate);
    target.setDate(target.getDate() - 7);
    for (let i = 0; i < Math.min(series.length, 20); i++) {
      const dt = parseNavDate(series[i].date);
      const nav = Number(series[i].nav);
      if (!dt || !Number.isFinite(nav)) continue;
      weekStart = nav;
      weekStartDate = series[i].date;
      if (dt <= target) break;
    }
  }
  if (!Number.isFinite(price) || !Number.isFinite(weekStart) || weekStart <= 0) {
    throw new Error("bad nav");
  }
  const changePct = ((price - weekStart) / weekStart) * 100;
  return {
    schemeCode: String(code),
    name: d.meta?.scheme_name || hintName || String(code),
    price,
    weekStartPrice: weekStart,
    changePct,
    change: price - weekStart,
    navDate: latest.date,
    weekStartDate,
    source: "mfapi.in"
  };
}

export default async function handler(req, res) {
  try {
    const raw = String(req.query.symbols || "").trim();
    if (!raw) return res.status(400).json({ error: "symbols required (AMFI codes or ISINs)" });
    let list = raw.split(/[,|\s]+/).map(x => x.trim()).filter(Boolean);
    list = [...new Set(list)].slice(0, 20);

    const amfi = await loadAmfi();
    const results = [];

    for (const token of list) {
      try {
        const upper = token.toUpperCase();
        let code = null;
        let hint = null;
        if (/^\d+$/.test(token)) {
          code = token;
          hint = amfi.byCode[token]?.name;
        } else if (amfi.byIsin[upper]) {
          code = amfi.byIsin[upper].code;
          hint = amfi.byIsin[upper].name;
        } else if (amfi.byCode[token]) {
          code = token;
          hint = amfi.byCode[token].name;
        }
        if (!code) {
          results.push({ symbol: token, price: null, changePct: null, error: "scheme not found" });
          continue;
        }
        const row = await weekForCode(code, hint);
        row.symbol = token;
        row.matchedCode = code;
        results.push(row);
      } catch (e) {
        results.push({ symbol: token, price: null, changePct: null, error: e.message || "fail" });
      }
    }

    results.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
    res.setHeader("Cache-Control", "public, s-maxage=600, max-age=300, stale-while-revalidate=1800");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      asOf: new Date().toISOString(),
      count: results.length,
      items: results,
      source: "AMFI + mfapi.in"
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "MF week performance unavailable" });
  }
}
