export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim();
  const exchange = String(req.query.exchange || "NSE").toUpperCase();
  if (!symbol) return res.status(400).json({ error: "symbol is required" });

  try {
    if (exchange === "AMFI") {
      const r = await fetch("https://www.amfiindia.com/spages/NAVAll.txt", {
        headers: { "User-Agent": "InvestmentTracker/1.0" }
      });
      const text = await r.text();
      const row = text.split(/\r?\n/).find(x => x.split(";")[0] === symbol);
      if (!row) return res.status(404).json({ error: "AMFI scheme not found" });
      const parts = row.split(";");
      return res.status(200).json({ symbol, exchange, price: Number(parts[4]), source: "AMFI" });
    }

    if (exchange === "BSE") {
      const r = await fetch("https://api.bseindia.com/BseIndiaAPI/api/ComHeader/w?quotetype=EQ&scripcode=" + encodeURIComponent(symbol) + "&seriesid=1&flag=0", {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
      });
      const data = await r.json();
      const price = Number(data?.CurrRate || data?.currentRate || data?.LTP || data?.ltp);
      if (!price) return res.status(502).json({ error: "BSE price unavailable" });
      return res.status(200).json({ symbol, exchange, price, source: "BSE" });
    }

    const r = await fetch("https://www.nseindia.com/api/quote-equity?symbol=" + encodeURIComponent(symbol), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://www.nseindia.com/"
      }
    });
    const data = await r.json();
    const price = Number(data?.priceInfo?.lastPrice);
    if (!price) return res.status(502).json({ error: "NSE price unavailable" });
    return res.status(200).json({ symbol, exchange: "NSE", price, source: "NSE" });
  } catch (e) {
    return res.status(502).json({ error: "Quote provider error", detail: e.message });
  }
}