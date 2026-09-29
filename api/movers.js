export default async function handler(req, res) {
  const minMove = Math.max(2, Math.min(20, Number(req.query.minMove) || 5));
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  const UNIVERSE = [
    ["RELIANCE","Nifty 50"],["TCS","Nifty 50"],["HDFCBANK","Nifty 50"],["ICICIBANK","Nifty 50"],
    ["INFY","Nifty 50"],["SBIN","Nifty 50"],["BHARTIARTL","Nifty 50"],["ITC","Nifty 50"],
    ["LT","Nifty 50"],["HINDUNILVR","Nifty 50"],["BAJFINANCE","Nifty 50"],["KOTAKBANK","Nifty 50"],
    ["AXISBANK","Nifty 50"],["ASIANPAINT","Nifty 50"],["MARUTI","Nifty 50"],["SUNPHARMA","Nifty 50"],
    ["TITAN","Nifty 50"],["NTPC","Nifty 50"],["POWERGRID","Nifty 50"],["ULTRACEMCO","Nifty 50"],
    ["TATASTEEL","Nifty 50"],["JSWSTEEL","Nifty 50"],["WIPRO","Nifty 50"],["TECHM","Nifty 50"],
    ["HCLTECH","Nifty 50"],["ADANIENT","Nifty 50"],["ADANIPORTS","Nifty 50"],["ONGC","Nifty 50"],
    ["COALINDIA","Nifty 50"],["BPCL","Nifty 50"],["INDUSINDBK","Nifty 50"],["NESTLEIND","Nifty 50"],
    ["TATACONSUM","Nifty 50"],["BAJAJFINSV","Nifty 50"],["M&M","Nifty 50"],["HEROMOTOCO","Nifty 50"],
    ["EICHERMOT","Nifty 50"],["DRREDDY","Nifty 50"],["CIPLA","Nifty 50"],["APOLLOHOSP","Nifty 50"],
    ["HDFCLIFE","Nifty 50"],["SBILIFE","Nifty 50"],["GRASIM","Nifty 50"],["DIVISLAB","Nifty 50"],
    ["BRITANNIA","Nifty 50"],["HINDALCO","Nifty 50"],["TATAMOTORS","Nifty 50"],["BEL","Nifty 50"],
    ["TRENT","Nifty 50"],["JIOFIN","Nifty 50"],
    ["INDIGO","Nifty Next 50"],["ZOMATO","Nifty Next 50"],["PAYTM","Mid/Large"],["PFC","Nifty Next 50"],
    ["RECLTD","Nifty Next 50"],["IRFC","Nifty Next 50"],["BANKBARODA","Nifty Next 50"],["PNB","Nifty Next 50"],
    ["CANBK","Nifty Next 50"],["UNIONBANK","Mid/Large"],["YESBANK","Mid/Large"],["IDEA","Mid/Large"],
    ["DLF","Nifty Next 50"],["GODREJPROP","Mid/Large"],["LODHA","Mid/Large"],["SIEMENS","Nifty Next 50"],
    ["ABB","Nifty Next 50"],["CGPOWER","Mid/Large"],["HAVELLS","Nifty Next 50"],["VOLTAS","Mid/Large"],
    ["DIXON","Mid/Large"],["POLYCAB","Mid/Large"],["KPITTECH","Mid/Large"],["PERSISTENT","Nifty Next 50"],
    ["COFORGE","Nifty Next 50"],["MPHASIS","Mid/Large"],["LTTS","Nifty Next 50"],["OFSS","Mid/Large"],
    ["NAUKRI","Nifty Next 50"],["NYKAA","Mid/Large"],["POLICYBZR","Mid/Large"],["DMART","Nifty Next 50"],
    ["PIDILITIND","Nifty Next 50"],["DABUR","Nifty Next 50"],["MARICO","Nifty Next 50"],["COLPAL","Nifty Next 50"],
    ["BERGEPAINT","Nifty Next 50"],["PAGEIND","Nifty Next 50"],["BATAINDIA","Mid/Large"],["TVSMOTOR","Nifty Next 50"],
    ["BAJAJ-AUTO","Nifty 50"],["AMBUJACEM","Nifty Next 50"],["SHREECEM","Nifty Next 50"],["DALBHARAT","Mid/Large"],
    ["VEDL","Nifty Next 50"],["HINDZINC","Mid/Large"],["NMDC","Nifty Next 50"],["SAIL","Mid/Large"],
    ["IOC","Nifty Next 50"],["GAIL","Nifty Next 50"],["PETRONET","Mid/Large"],["ATGL","Mid/Large"]
  ];

  async function yahooOne(symbol, universe) {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol + ".NS") +
      "?range=1mo&interval=1d";
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) throw new Error("no data");
    const meta = result.meta || {};
    const q = result.indicators?.quote?.[0] || {};
    const closes = (q.close || []).filter(x => typeof x === "number" && isFinite(x));
    const volumes = (q.volume || []).filter(x => typeof x === "number" && isFinite(x));
    const price = Number(meta.regularMarketPrice);
    const prev =
      closes.length >= 2
        ? closes[closes.length - 2]
        : Number(meta.chartPreviousClose);
    if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0) {
      throw new Error("bad price");
    }
    const changePct = ((price - prev) / prev) * 100;
    const volume = volumes.length ? volumes[volumes.length - 1] : null;
    let avgVol = null;
    if (volumes.length >= 6) {
      const slice = volumes.slice(-21, -1);
      if (slice.length) avgVol = slice.reduce((a, b) => a + b, 0) / slice.length;
    }
    const volumeRatio =
      volume && avgVol && avgVol > 0 ? volume / avgVol : null;
    return {
      symbol,
      name: meta.shortName || meta.longName || symbol,
      price,
      changePct,
      volume,
      volumeRatio,
      universe,
      source: "Yahoo Finance"
    };
  }

  async function chartinkHot() {
    const hBase = {
      ...headers,
      Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
      Referer: "https://chartink.com/screener"
    };
    const sessionRes = await fetch("https://chartink.com/screener", { headers: hBase });
    if (!sessionRes.ok) throw new Error("session");
    const html = await sessionRes.text();
    const m = html.match(
      /<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i
    );
    const csrf = m?.[1] || "";
    const raw = sessionRes.headers.get("set-cookie") || "";
    const cookie = raw
      .split(/,(?=[A-Z0-9_]+=)/)
      .map(x => x.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    const h = {
      ...headers,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://chartink.com/screener",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-TOKEN": csrf } : {})
    };
    const clause =
      "( {33489} ( abs( ( latest close - 1 day ago close ) / 1 day ago close * 100 ) >= " +
      minMove +
      " and latest volume > latest sma( volume , 20 ) * 1.5 and latest close > 10 ) )";
    const r = await fetch("https://chartink.com/screener/process", {
      method: "POST",
      headers: h,
      body: new URLSearchParams({ scan_clause: clause })
    });
    if (!r.ok) throw new Error("scan");
    const d = await r.json();
    if (!Array.isArray(d.data)) return [];
    return d.data
      .map(x => {
        const vol = Number(String(x.volume || "").replace(/,/g, ""));
        const avg = Number(
          String(x.sma_volume_20 || x.sma_volume || "").replace(/,/g, "")
        );
        const changePct = Number(String(x.per_chg || "").replace(/,/g, ""));
        return {
          symbol: String(x.nsecode || x.symbol || "").toUpperCase(),
          name: x.name || x.nsecode || "",
          price: Number(String(x.close || "").replace(/,/g, "")),
          changePct: Number.isFinite(changePct) ? changePct : null,
          volume: Number.isFinite(vol) ? vol : null,
          volumeRatio: vol && avg ? vol / avg : null,
          universe: "Nifty 500",
          source: "Chartink"
        };
      })
      .filter(x => x.symbol && x.changePct != null);
  }

  try {
    const yahooAll = [];
    for (let i = 0; i < UNIVERSE.length; i += 8) {
      const batch = UNIVERSE.slice(i, i + 8);
      const part = await Promise.all(
        batch.map(async ([sym, uni]) => {
          try {
            return await yahooOne(sym, uni);
          } catch (_) {
            return null;
          }
        })
      );
      yahooAll.push(...part.filter(Boolean));
    }

    let chartink = [];
    try {
      chartink = await chartinkHot();
    } catch (_) {}

    const map = new Map();
    for (const s of [...yahooAll, ...chartink]) {
      const prev = map.get(s.symbol);
      if (!prev) map.set(s.symbol, s);
      else {
        map.set(s.symbol, {
          ...prev,
          ...s,
          volumeRatio: s.volumeRatio ?? prev.volumeRatio,
          volume: s.volume ?? prev.volume,
          universe: prev.universe || s.universe
        });
      }
    }
    const all = [...map.values()].sort(
      (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)
    );

    const hot = all.filter(x => {
      const moveOk = Math.abs(x.changePct) >= minMove;
      const volOk = x.volumeRatio == null || x.volumeRatio >= 1.5;
      return moveOk && volOk;
    });

    const volMoves = all.filter(
      x =>
        x.volumeRatio != null &&
        x.volumeRatio >= 1.5 &&
        Math.abs(x.changePct) >= 2
    );

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180");
    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      minMove,
      criteria: {
        price: "Hot list: day move ≥ " + minMove + "% (10%+ tagged)",
        volume: "Volume ≥ 1.5× recent average when available",
        universe: "Nifty 50, Next 50, liquid mid/large caps (+ Nifty 500 via Chartink when available)"
      },
      counts: {
        scanned: all.length,
        hot: hot.length,
        move10: hot.filter(x => Math.abs(x.changePct) >= 10).length,
        move5: hot.filter(
          x => Math.abs(x.changePct) >= minMove && Math.abs(x.changePct) < 10
        ).length,
        volumeMoves: volMoves.length
      },
      movers: (hot.length ? hot : volMoves).slice(0, 40),
      topMovers: all.slice(0, 25)
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to load movers",
      detail: e?.message || "Provider error"
    });
  }
}
