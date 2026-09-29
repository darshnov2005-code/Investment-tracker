export default async function handler(req, res) {
  const minMove = Math.max(3, Math.min(20, Number(req.query.minMove) || 5));
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

  async function nseIndexMovers(indexName, universe) {
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
      const volume = num(row.totalTradedVolume ?? row.volume ?? row.totalTradedValue);
      if (changePct == null || Math.abs(changePct) < minMove) continue;
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

  async function chartinkMovers() {
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

    const clause =
      "( {33489} ( ( abs( ( latest close - 1 day ago close ) / 1 day ago close * 100 ) >= " +
      minMove +
      " ) and latest volume > latest sma( volume , 20 ) * 1.5 and latest close > 10 ) )";

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
          universe: "Nifty 500",
          source: "Chartink"
        };
      })
      .filter(x => x.symbol && x.changePct != null && Math.abs(x.changePct) >= minMove);
  }

  function mergeRank(lists) {
    const map = new Map();
    for (const list of lists) {
      for (const s of list) {
        const key = s.symbol;
        if (!key) continue;
        const prev = map.get(key);
        if (!prev || Math.abs(s.changePct) > Math.abs(prev.changePct)) {
          map.set(key, s);
        } else if (prev && s.volumeRatio && !prev.volumeRatio) {
          map.set(key, { ...prev, volumeRatio: s.volumeRatio, volume: s.volume || prev.volume });
        }
      }
    }
    return [...map.values()].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  }

  try {
    const nseResults = await Promise.allSettled([
      nseIndexMovers("NIFTY 50", "Nifty 50"),
      nseIndexMovers("NIFTY NEXT 50", "Nifty Next 50"),
      nseIndexMovers("NIFTY MIDCAP 150", "Nifty Midcap 150"),
      nseIndexMovers("NIFTY 500", "Nifty 500")
    ]);
    const fromNse = nseResults
      .filter(x => x.status === "fulfilled")
      .flatMap(x => x.value);

    let fromChartink = [];
    try {
      fromChartink = await chartinkMovers();
    } catch (_) {
      fromChartink = [];
    }

    const merged = mergeRank([fromNse, fromChartink]);
    const withVol = merged.filter(
      x => x.volumeRatio == null || x.volumeRatio >= 1.5
    );

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=180");
    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      minMove,
      criteria: {
        price: "Absolute day move ≥ " + minMove + "% (10%+ highlighted)",
        volume: "Volume ≥ 1.5× 20-day average when Chartink data available",
        universe: "Nifty 50, Next 50, Midcap 150, Nifty 500"
      },
      counts: {
        total: merged.length,
        move10: merged.filter(x => Math.abs(x.changePct) >= 10).length,
        move5: merged.filter(x => Math.abs(x.changePct) >= minMove && Math.abs(x.changePct) < 10).length
      },
      movers: withVol.length ? withVol.slice(0, 40) : merged.slice(0, 40)
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to load movers",
      detail: e?.message || "Provider error"
    });
  }
}
