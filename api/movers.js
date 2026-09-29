export default async function handler(req, res) {
  const minMove = Math.max(2, Math.min(20, Number(req.query.minMove) || 5));
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  const num = v => {
    const x = Number(String(v ?? "").replace(/,/g, "").replace(/%/g, "").trim());
    return Number.isFinite(x) ? x : null;
  };

  async function nseSession() {
    const home = await fetch("https://www.nseindia.com/", {
      headers: {
        ...headers,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://www.nseindia.com/"
      },
      redirect: "follow"
    });
    const setCookie = home.headers.getSetCookie ? home.headers.getSetCookie() : [];
    const raw = home.headers.get("set-cookie") || "";
    const parts = setCookie.length
      ? setCookie.map(c => c.split(";")[0])
      : raw.split(/,(?=[A-Za-z0-9_]+=)/).map(c => c.split(";")[0].trim());
    return parts.filter(Boolean).join("; ");
  }

  async function nseIndexAll(indexName, universe) {
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
    if (!r.ok) throw new Error("NSE " + indexName + " HTTP " + r.status);
    const d = await r.json();
    const rows = Array.isArray(d?.data) ? d.data : [];
    const out = [];
    for (const row of rows) {
      const symbol = String(row.symbol || row.identifier || "").toUpperCase();
      if (!symbol || symbol.includes("NIFTY") || symbol.includes("SENSEX")) continue;
      const changePct = num(row.pChange ?? row.percentChange ?? row.perChange);
      const price = num(row.last ?? row.lastPrice ?? row.close);
      const volume = num(row.totalTradedVolume ?? row.volume);
      if (changePct == null || price == null) continue;
      out.push({
        symbol,
        name: row.meta?.companyName || row.symbol || symbol,
        price,
        changePct,
        volume,
        volumeRatio: null,
        universe,
        source: "NSE India"
      });
    }
    return out;
  }

  async function chartinkScan(clause, universe) {
    const hBase = {
      ...headers,
      Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
      Referer: "https://chartink.com/screener"
    };
    const sessionRes = await fetch("https://chartink.com/screener", { headers: hBase });
    if (!sessionRes.ok) throw new Error("Chartink session HTTP " + sessionRes.status);
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
    const r = await fetch("https://chartink.com/screener/process", {
      method: "POST",
      headers: h,
      body: new URLSearchParams({ scan_clause: clause })
    });
    const text = await r.text();
    if (!r.ok) throw new Error("Chartink HTTP " + r.status);
    let d;
    try {
      d = JSON.parse(text);
    } catch (_) {
      throw new Error("Chartink non-JSON");
    }
    if (!Array.isArray(d.data)) throw new Error(d.message || "Chartink no data");
    return d.data
      .map(x => {
        const changePct = num(x.per_chg);
        const vol = num(x.volume);
        const avg = num(x.sma_volume_20 || x.sma_volume || x.avg_volume);
        return {
          symbol: String(x.nsecode || x.symbol || "").toUpperCase(),
          name: x.name || x.nsecode || x.symbol || "",
          price: num(x.close),
          changePct,
          volume: vol,
          volumeRatio: vol && avg ? vol / avg : null,
          universe,
          source: "Chartink"
        };
      })
      .filter(x => x.symbol && x.changePct != null);
  }

  function merge(lists) {
    const map = new Map();
    for (const list of lists) {
      for (const s of list) {
        if (!s.symbol) continue;
        const prev = map.get(s.symbol);
        if (!prev) {
          map.set(s.symbol, s);
          continue;
        }
        const prefer =
          Math.abs(s.changePct || 0) > Math.abs(prev.changePct || 0) ? s : prev;
        const other = prefer === s ? prev : s;
        map.set(s.symbol, {
          ...prefer,
          volumeRatio: prefer.volumeRatio ?? other.volumeRatio,
          volume: prefer.volume ?? other.volume,
          universe: prefer.universe || other.universe
        });
      }
    }
    return [...map.values()];
  }

  try {
    const nseSettled = await Promise.allSettled([
      nseIndexAll("NIFTY 50", "Nifty 50"),
      nseIndexAll("NIFTY NEXT 50", "Nifty Next 50"),
      nseIndexAll("NIFTY MIDCAP 150", "Nifty Midcap 150"),
      nseIndexAll("NIFTY 500", "Nifty 500")
    ]);
    const fromNse = nseSettled
      .filter(x => x.status === "fulfilled")
      .flatMap(x => x.value);

    let fromChartink = [];
    try {
      const clause =
        "( {33489} ( abs( ( latest close - 1 day ago close ) / 1 day ago close * 100 ) >= " +
        minMove +
        " and latest volume > latest sma( volume , 20 ) * 1.5 and latest close > 10 ) )";
      fromChartink = await chartinkScan(clause, "Nifty 500");
    } catch (_) {
      fromChartink = [];
    }

    let volSpikes = [];
    try {
      const clause2 =
        "( {33489} ( latest volume > latest sma( volume , 20 ) * 2 and abs( ( latest close - 1 day ago close ) / 1 day ago close * 100 ) >= 2 and latest close > 10 ) )";
      volSpikes = await chartinkScan(clause2, "Nifty 500");
    } catch (_) {}

    const all = merge([fromNse, fromChartink, volSpikes]);
    all.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

    const hot = all.filter(x => {
      const big = Math.abs(x.changePct) >= minMove;
      const volOk = x.volumeRatio == null || x.volumeRatio >= 1.5;
      return big && volOk;
    });

    res.setHeader("Cache-Control", "s-maxage=45, stale-while-revalidate=120");
    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      minMove,
      criteria: {
        price: "Highlight ≥" + minMove + "% day move; 10%+ tagged",
        volume: "Prefer volume ≥ 1.5× 20DMA when available",
        universe: "Nifty 50, Next 50, Midcap 150, Nifty 500"
      },
      counts: {
        scanned: all.length,
        hot: hot.length,
        move10: hot.filter(x => Math.abs(x.changePct) >= 10).length,
        move5: hot.filter(x => Math.abs(x.changePct) >= minMove && Math.abs(x.changePct) < 10).length
      },
      movers: hot.slice(0, 40),
      topMovers: all.slice(0, 20)
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to load movers",
      detail: e?.message || "Provider error"
    });
  }
}
