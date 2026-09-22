export default async function handler(req, res) {
  try {
    const r = await fetch("https://www.amfiindia.com/spages/NAVAll.txt", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/plain,*/*",
        "Accept-Language": "en-IN,en;q=0.9"
      }
    });
    if (!r.ok) throw new Error("AMFI HTTP " + r.status);
    const text = await r.text();
    const schemes = [];
    for (const line of text.split(/\r?\n/)) {
      const c = line.split(";").map(v => v.trim());
      if (c.length < 6 || !/^\d+$/.test(c[0])) continue;
      const nav = Number(c[4]);
      if (!Number.isFinite(nav) || nav <= 0 || !c[3]) continue;
      schemes.push({ code: c[0], isin: c[1] || "", isinReinvest: c[2] || "", name: c[3], nav, date: c[5] || "" });
    }
    schemes.sort((x,y) => x.name.localeCompare(y.name));
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({ schemes, count: schemes.length, source: "AMFI" });
  } catch (e) {
    return res.status(502).json({ error: "Unable to load AMFI schemes", detail: e?.message || "Provider error" });
  }
}