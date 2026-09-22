export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const exchange = String(req.query.exchange || "NSE").trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol is required" });
  if (!["NSE", "BSE"].includes(exchange)) return res.status(400).json({ error: "Use NSE or BSE." });

  const ticker = symbol + (exchange === "BSE" ? ".BO" : ".NS");
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(ticker) + "?range=1y&interval=1d&events=history";
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Accept-Language": "en-IN,en;q=0.9"
      }
    });
    if (!r.ok) throw new Error("Market history HTTP " + r.status);
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    const meta = result?.meta;
    const q = result?.indicators?.quote?.[0];
    if (!meta || !q?.close) throw new Error("Historical data unavailable");

    const rows = q.close.map((c, i) => ({
      close: Number(c),
      volume: Number(q.volume?.[i] || 0),
      high: Number(q.high?.[i] || c),
      low: Number(q.low?.[i] || c)
    })).filter(x => Number.isFinite(x.close) && x.close > 0);

    if (rows.length < 30) throw new Error("Not enough historical data");

    const closes = rows.map(x => x.close);
    const volumes = rows.map(x => x.volume);
    const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
    const sma = n => avg(closes.slice(-n));
    const avgVol20 = avg(volumes.slice(-20));
    const avgVol5 = avg(volumes.slice(-5));
    const latest = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const week52High = Math.max(...closes);
    const week52Low = Math.min(...closes);

    let gains = [], losses = [];
    for (let i = Math.max(1, closes.length - 15); i < closes.length; i++) {
      const diff = closes[i] - closes[i-1];
      gains.push(Math.max(diff,0));
      losses.push(Math.max(-diff,0));
    }
    const ag = avg(gains), al = avg(losses);
    const rsi14 = al === 0 ? 100 : 100 - (100 / (1 + ag / al));

    const volumeRatio = avgVol20 ? volumes[volumes.length - 1] / avgVol20 : null;
    const nearHighPct = ((week52High - latest) / week52High) * 100;
    const nearLowPct = ((latest - week52Low) / week52Low) * 100;

    const flags = [];
    if (volumeRatio >= 2) flags.push("Volume surge");
    else if (volumeRatio >= 1.5) flags.push("High volume");
    if (nearHighPct <= 3) flags.push("Near 52W high");
    if (nearLowPct <= 3) flags.push("Near 52W low");
    if (latest > sma(50)) flags.push("Above 50DMA"); else flags.push("Below 50DMA");
    if (latest > sma(200)) flags.push("Above 200DMA"); else if (rows.length >= 200) flags.push("Below 200DMA");
    if (rsi14 >= 70) flags.push("RSI overbought");
    else if (rsi14 <= 30) flags.push("RSI oversold");

    return res.status(200).json({
      symbol, exchange, name: meta.longName || meta.shortName || symbol,
      price: latest, previousClose: prev,
      volume: volumes[volumes.length - 1],
      avgVolume20: avgVol20, avgVolume5: avgVol5, volumeRatio,
      high52: week52High, low52: week52Low, nearHighPct, nearLowPct,
      sma20: sma(20), sma50: sma(50), sma200: rows.length >= 200 ? sma(200) : null,
      rsi14, flags, fetchedAt: new Date().toISOString()
    });
  } catch (e) {
    return res.status(502).json({ error: "Unable to scan stock", symbol, exchange, detail: e?.message || "Provider error" });
  }
}