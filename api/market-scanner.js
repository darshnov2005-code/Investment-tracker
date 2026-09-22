export default async function handler(req, res) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer": "https://chartink.com/screener"
  };

  const num = v => {
    const x = Number(String(v ?? "").replace(/,/g, "").replace(/%/g, "").trim());
    return Number.isFinite(x) ? x : null;
  };

  const getCookie = r => {
    const raw = r.headers.get("set-cookie") || "";
    return raw.split(/,(?=[A-Z0-9_]+=)/).map(x => x.split(";")[0].trim()).filter(Boolean).join("; ");
  };

  async function getSession() {
    const r = await fetch("https://chartink.com/screener", {headers});
    if (!r.ok) throw new Error("Chartink session HTTP " + r.status);
    const html = await r.text();
    const m = html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
    return {csrf: m?.[1] || "", cookie: getCookie(r)};
  }

  async function scan(session) {
    const h = {
      ...headers,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    };
    if (session.cookie) h.Cookie = session.cookie;
    if (session.csrf) h["X-CSRF-TOKEN"] = session.csrf;

    const clause = "( {cash} ( latest volume > latest sma( volume , 20 ) * 2 and latest sma( close , 20 ) > latest sma( close , 50 ) and latest sma( close , 50 ) > latest sma( close , 200 ) and latest close > latest sma( close , 20 ) and latest close >= 10 ) )";

    const r = await fetch("https://chartink.com/screener/process", {
      method: "POST",
      headers: h,
      body: new URLSearchParams({scan_clause: clause})
    });
    const text = await r.text();
    if (!r.ok) throw new Error("Chartink scan HTTP " + r.status);
    let d;
    try { d = JSON.parse(text); } catch (_) { throw new Error("Chartink returned non-JSON data"); }
    if (!Array.isArray(d.data)) throw new Error(d.message || "Chartink returned no data");

    return d.data.map(x => ({
      symbol: x.nsecode || x.symbol || "",
      name: x.name || x.nsecode || x.symbol || "",
      price: num(x.close),
      change: num(x.per_chg),
      volume: num(x.volume),
      avgVolume20: num(x.sma_volume_20 || x.sma_volume || x.avg_volume),
      high52: num(x.high52),
      low52: num(x.low52),
      volumeSpike: num(x.volume_spike || x.volume_ratio)
    })).filter(x => x.symbol);
  }

  try {
    const session = await getSession();
    const stocks = await scan(session);

    return res.status(200).json({
      source: "Chartink scanner API",
      dataMode: "latest-available-daily-data",
      fetchedAt: new Date().toISOString(),
      criteria: {
        volume: "Volume > 2x 20-day average volume",
        trend: "20 DMA > 50 DMA > 200 DMA",
        price: "Close > 20 DMA"
      },
      stocks: stocks.slice(0, 200)
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to load technical scanner",
      detail: e?.message || "Chartink provider error"
    });
  }
}