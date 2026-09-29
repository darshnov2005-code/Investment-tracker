export default async function handler(req, res) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  // Same style as api/quote.js: prefer exchange feeds, Yahoo as fallback.
  async function nseSession() {
    const home = await fetch("https://www.nseindia.com/", {
      headers: {
        ...headers,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://www.nseindia.com/"
      },
      redirect: "follow"
    });
    const setCookie = home.headers.getSetCookie
      ? home.headers.getSetCookie()
      : [];
    const raw = home.headers.get("set-cookie") || "";
    const parts = setCookie.length
      ? setCookie.map(c => c.split(";")[0])
      : raw.split(/,(?=[A-Za-z0-9_]+=)/).map(c => c.split(";")[0].trim());
    return parts.filter(Boolean).join("; ");
  }

  async function nseIndex(indexName) {
    let cookie = "";
    try {
      cookie = await nseSession();
    } catch (_) {}
    const url =
      "https://www.nseindia.com/api/equity-stockIndices?index=" +
      encodeURIComponent(indexName);
    const r = await fetch(url, {
      headers: {
        ...headers,
        Referer: "https://www.nseindia.com/",
        ...(cookie ? { Cookie: cookie } : {})
      }
    });
    if (!r.ok) throw new Error("NSE HTTP " + r.status);
    const d = await r.json();
    const rows = Array.isArray(d?.data) ? d.data : [];
    const row =
      rows.find(
        x =>
          String(x.index || x.meta?.indexName || "")
            .toUpperCase()
            .replace(/\s+/g, " ") === indexName.toUpperCase()
      ) || rows[0];
    if (!row) throw new Error("NSE index row missing");
    const price = Number(row.last ?? row.lastPrice ?? row.indexValue);
    const previousClose = Number(
      row.previousClose ?? row.prevClose ?? row.previousCloseValue
    );
    const change = Number(
      row.variation ??
        (isFinite(price) && isFinite(previousClose)
          ? price - previousClose
          : NaN)
    );
    const changePct = Number(
      row.percentChange ??
        (isFinite(change) && previousClose ? (change / previousClose) * 100 : NaN)
    );
    if (!Number.isFinite(price) || price <= 0) throw new Error("No NSE index price");
    return {
      price,
      previousClose: Number.isFinite(previousClose) ? previousClose : null,
      change: Number.isFinite(change) ? change : null,
      changePct: Number.isFinite(changePct) ? changePct : null,
      source: "NSE India",
      asOf: d.timestamp || new Date().toISOString()
    };
  }

  async function nseAllIndicesPick(names) {
    let cookie = "";
    try {
      cookie = await nseSession();
    } catch (_) {}
    const r = await fetch("https://www.nseindia.com/api/allIndices", {
      headers: {
        ...headers,
        Referer: "https://www.nseindia.com/",
        ...(cookie ? { Cookie: cookie } : {})
      }
    });
    if (!r.ok) throw new Error("NSE allIndices HTTP " + r.status);
    const d = await r.json();
    const rows = Array.isArray(d?.data) ? d.data : [];
    const out = {};
    for (const want of names) {
      const row = rows.find(x => {
        const n = String(x.index || x.indexSymbol || "").toUpperCase();
        return n === want.toUpperCase() || n.replace(/\s+/g, " ") === want.toUpperCase();
      });
      if (!row) continue;
      const price = Number(row.last ?? row.indexValue);
      const previousClose = Number(row.previousClose);
      const change = Number(
        row.variation ??
          (isFinite(price) && isFinite(previousClose)
            ? price - previousClose
            : NaN)
      );
      const changePct = Number(
        row.percentChange ??
          (isFinite(change) && previousClose
            ? (change / previousClose) * 100
            : NaN)
      );
      if (!Number.isFinite(price) || price <= 0) continue;
      out[want] = {
        price,
        previousClose: Number.isFinite(previousClose) ? previousClose : null,
        change: Number.isFinite(change) ? change : null,
        changePct: Number.isFinite(changePct) ? changePct : null,
        source: "NSE India",
        asOf: new Date().toISOString()
      };
    }
    return out;
  }

  async function bseSensex() {
    const urls = [
      "https://api.bseindia.com/BseIndiaAPI/api/Sensex/w",
      "https://api.bseindia.com/BseIndiaAPI/api/GetQuotes/w?strQoute=SENSEX"
    ];
    let lastErr;
    for (const url of urls) {
      try {
        const r = await fetch(url, {
          headers: {
            ...headers,
            Referer: "https://www.bseindia.com/",
            Origin: "https://www.bseindia.com"
          }
        });
        if (!r.ok) throw new Error("BSE HTTP " + r.status);
        const d = await r.json();
        const row = Array.isArray(d) ? d[0] : d?.Table?.[0] || d;
        const price = Number(
          row?.Curvalue ?? row?.currValue ?? row?.LTP ?? row?.lastValue ?? row?.Value
        );
        const previousClose = Number(
          row?.PrevClose ?? row?.prevClose ?? row?.PreviousClose
        );
        const change = Number(
          row?.Change ??
            row?.NetChange ??
            (isFinite(price) && isFinite(previousClose)
              ? price - previousClose
              : NaN)
        );
        const changePct = Number(
          row?.PerChange ??
            row?.PercentChange ??
            (isFinite(change) && previousClose
              ? (change / previousClose) * 100
              : NaN)
        );
        if (!Number.isFinite(price) || price <= 0) throw new Error("No BSE Sensex price");
        return {
          price,
          previousClose: Number.isFinite(previousClose) ? previousClose : null,
          change: Number.isFinite(change) ? change : null,
          changePct: Number.isFinite(changePct) ? changePct : null,
          source: "BSE India",
          asOf: new Date().toISOString()
        };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("BSE Sensex unavailable");
  }

  async function yahoo(symbol, label) {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?range=5d&interval=1d";
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error("Yahoo HTTP " + r.status);
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) throw new Error("No Yahoo data for " + label);
    const meta = result.meta || {};
    const closes = result.indicators?.quote?.[0]?.close || [];
    const price = Number(meta.regularMarketPrice);
    let prev = Number(meta.chartPreviousClose);
    if (!Number.isFinite(prev) || prev <= 0) {
      const valid = closes.filter(x => typeof x === "number" && isFinite(x));
      prev = valid.length >= 2 ? valid[valid.length - 2] : valid[0];
    }
    const change =
      Number.isFinite(price) && Number.isFinite(prev) ? price - prev : null;
    const changePct =
      change != null && prev ? (change / prev) * 100 : null;
    if (!Number.isFinite(price) || price <= 0) throw new Error("No Yahoo price");
    return {
      price,
      previousClose: Number.isFinite(prev) ? prev : null,
      change,
      changePct,
      source: "Yahoo Finance",
      asOf: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString()
    };
  }

  const wanted = [
    { key: "nifty", label: "Nifty 50", nseName: "NIFTY 50", yahoo: "^NSEI" },
    { key: "sensex", label: "Sensex", bse: true, yahoo: "^BSESN" },
    { key: "banknifty", label: "Bank Nifty", nseName: "NIFTY BANK", yahoo: "^NSEBANK" }
  ];

  try {
    let nseBulk = {};
    try {
      nseBulk = await nseAllIndicesPick(["NIFTY 50", "NIFTY BANK"]);
    } catch (_) {
      nseBulk = {};
    }

    const indices = await Promise.all(
      wanted.map(async item => {
        if (item.nseName) {
          try {
            if (nseBulk[item.nseName]) {
              return { key: item.key, label: item.label, symbol: item.nseName, ...nseBulk[item.nseName] };
            }
            const nse = await nseIndex(item.nseName);
            return { key: item.key, label: item.label, symbol: item.nseName, ...nse };
          } catch (_) {}
        }
        if (item.bse) {
          try {
            const bse = await bseSensex();
            return { key: item.key, label: item.label, symbol: "SENSEX", ...bse };
          } catch (_) {}
        }
        try {
          const y = await yahoo(item.yahoo, item.label);
          return { key: item.key, label: item.label, symbol: item.yahoo, ...y };
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

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      indices
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to fetch indices",
      detail: e?.message || "Provider error"
    });
  }
}
