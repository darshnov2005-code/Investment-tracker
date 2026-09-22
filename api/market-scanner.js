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

  async function scan(session, clause) {
    const h = {
      ...headers,
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    };
    if (session.cookie) h.Cookie = session.cookie;
    if (session.csrf) h["X-CSRF-TOKEN"] = session.csrf;

    const r = await fetch("https://chartink.com/screener/process", {
      method: "POST",
      headers: h,
      body: new URLSearchParams({scan_clause: clause})
    });
    const text = await r.text();
    if (!r.ok) throw new Error("Chartink scan HTTP " + r.status);
    let d;
    try { d = JSON.parse(text); } catch (_) { throw new Error("Chartink returned non-JSON data"); }
    if (!Array.isArray(d.data)) throw new Error(d.message || "No scanner data");
    return d.data.map(x => ({
      symbol: x.nsecode || x.symbol || "",
      name: x.name || x.nsecode || x.symbol || "",
      price: num(x.close),
      change: num(x.per_chg),
      volume: num(x.volume),
      high52: num(x.high52),
      low52: num(x.low52)
    })).filter(x => x.symbol);
  }

  try {
    const session = await getSession();

    const scans = {
      volume: "( {cash} ( latest volume > latest sma( volume , 20 ) * 2 and latest close >= 10 ) )",
      high: "( {cash} ( latest close >= latest max( 252 , latest high ) * 0.97 and latest close >= 10 ) )",
      low: "( {cash} ( latest close <= latest min( 252 , latest low ) * 1.03 and latest close >= 10 ) )",
      breakout: "( {cash} ( latest close > latest max( 20 , latest high ) and latest volume > latest sma( volume , 20 ) * 1.5 and latest close >= 10 ) )",
      trend: "( {cash} ( latest close > latest sma( latest close , 20 ) and latest sma( latest close , 20 ) > latest sma( latest close , 50 ) and latest sma( latest close , 50 ) > latest sma( latest close , 200 ) and latest close >= 10 ) )"
    };

    const pairs = await Promise.all(Object.entries(scans).map(async ([key, clause]) => {
      try { return [key, await scan(session, clause)]; }
      catch (_) { return [key, []]; }
    }));
    const d = Object.fromEntries(pairs);

    if (!Object.values(d).some(x => x.length)) {
      throw new Error("Chartink did not return scanner results.");
    }

    return res.status(200).json({
      source: "Chartink scanner API",
      dataMode: "latest-available-daily-data",
      fetchedAt: new Date().toISOString(),
      volumeSurge: d.volume.slice(0,100),
      near52High: d.high.slice(0,100),
      near52Low: d.low.slice(0,100),
      breakout: d.breakout.slice(0,100),
      strongTrend: d.trend.slice(0,100),
      active: d.volume.slice(0,100)
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to load market scanner",
      detail: e?.message || "Chartink provider error"
    });
  }
}