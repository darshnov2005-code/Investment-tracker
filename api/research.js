export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const exchange = String(req.query.exchange || "NSE").trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol is required" });
  if (!["NSE","BSE"].includes(exchange)) return res.status(400).json({ error: "Use NSE or BSE." });

  const ticker = symbol + (exchange === "BSE" ? ".BO" : ".NS");
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  const raw = v => v && typeof v === "object" && "raw" in v ? v.raw : v;

  function normalize(obj) {
    const out = {};
    for (const [k,v] of Object.entries(obj || {})) {
      const x = raw(v);
      if (x !== undefined && x !== null) out[k] = x;
    }
    return out;
  }

  async function yahooQuote() {
    const u = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" + encodeURIComponent(ticker);
    const r = await fetch(u, { headers });
    if (!r.ok) throw new Error("Yahoo quote HTTP " + r.status);
    const d = await r.json();
    const q = d?.quoteResponse?.result?.[0];
    if (!q) throw new Error("Stock symbol not found");
    return q;
  }

  async function yahooSummary() {
    // quoteSummary requires a Yahoo session crumb; v8 chart does not.
    const session = await fetch("https://fc.yahoo.com", { headers, redirect: "manual" });
    const cookies = session.headers.get("set-cookie") || "";
    const cookie = cookies.split(",").map(x => x.trim()).filter(x => /^A1=|^A3=|^GUC=/.test(x)).map(x => x.split(";")[0]).join("; ");
    const crumbResp = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) }
    });
    if (!crumbResp.ok) throw new Error("Yahoo crumb HTTP " + crumbResp.status);
    const crumb = (await crumbResp.text()).trim();
    if (!crumb || crumb.toLowerCase().includes("unauthorized")) throw new Error("Yahoo session unavailable");

    const modules = "assetProfile,financialData,defaultKeyStatistics,summaryDetail";
    const u = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/" +
      encodeURIComponent(ticker) + "?modules=" + modules + "&crumb=" + encodeURIComponent(crumb);
    const r = await fetch(u, { headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) } });
    if (!r.ok) throw new Error("Yahoo fundamentals HTTP " + r.status);
    const d = await r.json();
    return d?.quoteSummary?.result?.[0] || {};
  }

  try {
    const q = await yahooQuote();
    let summary = {};
    try { summary = await yahooSummary(); } catch (_) {}

    return res.status(200).json({
      symbol,
      exchange,
      name: q.longName || q.shortName || symbol,
      source: Object.keys(summary).length ? "Yahoo Finance" : "Yahoo Finance quote data",
      fetchedAt: new Date().toISOString(),
      price: normalize(q),
      summaryDetail: normalize(summary.summaryDetail),
      keyStats: normalize(summary.defaultKeyStatistics),
      financialData: normalize(summary.financialData),
      profile: normalize(summary.assetProfile)
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to research stock",
      symbol,
      exchange,
      detail: e?.message || "Provider error"
    });
  }
}