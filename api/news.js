export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const exchange = String(req.query.exchange || "NSE").trim().toUpperCase();
  const requestedName = String(req.query.name || "").trim();
  if (!symbol) return res.status(400).json({ error: "symbol is required" });

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
    "Accept": "application/rss+xml,application/xml,text/xml,*/*",
    "Accept-Language": "en-IN,en;q=0.9"
  };

  function decode(s) {
    return String(s || "")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/'/g, "'")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseRss(xml) {
    const items = [];
    const blocks = xml.split(/<item>/i).slice(1);
    for (const block of blocks) {
      const title = decode((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
      const link = decode((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
      const pub = decode((block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]);
      const source = decode((block.match(/<source[^>]*>([\s\S]*?)<\/source>/i) || [])[1]) || "Google News";
      if (!title) continue;
      let published = "";
      try {
        published = pub ? new Date(pub).toLocaleString("en-IN") : "";
      } catch (_) {
        published = pub || "";
      }
      items.push({ title, link, publisher: source, published });
      if (items.length >= 12) break;
    }
    return items;
  }

  function companyQuery(name, sym) {
    const base = (name || sym || "").replace(/\b(ltd|limited|india|the|and|co|company)\b/gi, " ").replace(/\s+/g, " ").trim();
    return (base + " " + sym + " stock").trim();
  }

  try {
    const companyName = requestedName || symbol;
    const q1 = companyQuery(companyName, symbol);
    const q2 = symbol + " share price";
    const urls = [
      "https://news.google.com/rss/search?q=" + encodeURIComponent(q1) + "&hl=en-IN&gl=IN&ceid=IN:en",
      "https://news.google.com/rss/search?q=" + encodeURIComponent(q2) + "&hl=en-IN&gl=IN&ceid=IN:en"
    ];

    let items = [];
    for (const url of urls) {
      try {
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const xml = await r.text();
        const parsed = parseRss(xml);
        items = items.concat(parsed);
        if (items.length >= 8) break;
      } catch (_) {}
    }

    const seen = new Set();
    items = items.filter(x => {
      const k = (x.title || "").toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 12);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return res.status(200).json({
      symbol,
      exchange,
      name: companyName,
      source: "Google News",
      fetchedAt: new Date().toISOString(),
      items
    });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to fetch news",
      symbol,
      detail: e?.message || "Provider error"
    });
  }
}
