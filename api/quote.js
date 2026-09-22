export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const exchange = String(req.query.exchange || "NSE").trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol is required" });

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  async function yahoo() {
    const suffix = exchange === "BSE" ? ".BO" : ".NS";
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol + suffix) + "?range=1d&interval=1m&events=div%2Csplits";
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error("Yahoo HTTP " + r.status);
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    const meta = result?.meta;
    const price = Number(meta?.regularMarketPrice ?? meta?.previousClose);
    if (!Number.isFinite(price) || price <= 0) throw new Error("No Yahoo price");
    return {
      symbol,
      exchange,
      price,
      previousClose: Number(meta?.previousClose ?? 0) || null,
      currency: meta?.currency || "INR",
      marketState: meta?.marketState || null,
      source: "Yahoo Finance"
    };
  }

  async function nse() {
    const url = "https://www.nseindia.com/api/quote-equity?symbol=" + encodeURIComponent(symbol);
    const r = await fetch(url, { headers: { ...headers, Referer: "https://www.nseindia.com/" } });
    if (!r.ok) throw new Error("NSE HTTP " + r.status);
    const d = await r.json();
    const p = Number(d?.priceInfo?.lastPrice);
    if (!Number.isFinite(p) || p <= 0) throw new Error("No NSE price");
    return {
      symbol,
      exchange: "NSE",
      price: p,
      previousClose: Number(d?.priceInfo?.previousClose ?? 0) || null,
      currency: "INR",
      marketState: "OPEN_OR_CLOSED",
      source: "NSE India"
    };
  }

  try {
    // Yahoo is used first because the public NSE website endpoint can reject
    // serverless requests without an NSE session/cookie.
    if (exchange === "NSE" || exchange === "BSE") {
      try { return res.status(200).json(await yahoo()); }
      catch (_) {
        if (exchange === "NSE") return res.status(200).json(await nse());
        throw _;
      }
    }

    if (exchange === "AMFI") {
      const r = await fetch("https://www.amfiindia.com/spages/NAVAll.txt", { headers });
      if (!r.ok) throw new Error("AMFI HTTP " + r.status);
      const text = await r.text();
      const row = text.split(/\r?\n/).find(x => { const c=x.split(";").map(v=>v.trim()); return c[0]===symbol || c[1]===symbol || c[2]===symbol; });
      if (!row) return res.status(404).json({ error: "AMFI scheme code not found", symbol });
      const cols = row.split(";").map(v => v.trim());
      const p = Number(cols[4]);
      if (!Number.isFinite(p)) throw new Error("Invalid AMFI NAV");
      return res.status(200).json({ symbol, exchange: "AMFI", price: p, currency: "INR", source: "AMFI" });
    }

    return res.status(400).json({ error: "Unsupported exchange. Use NSE, BSE or AMFI." });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to fetch live quote",
      symbol,
      exchange,
      detail: e?.message || "Provider error"
    });
  }
}