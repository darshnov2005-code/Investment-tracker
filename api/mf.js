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
    const rows = [];
    let currentAMC = "Other / Unclassified";

    function clean(v) {
      return String(v || "").replace(/\s+/g, " ").trim();
    }

    function classify(name) {
      let plan = "Unknown";
      let option = "Unknown";
      if (/\b(direct|direct plan)\b/i.test(name)) plan = "Direct";
      else if (/\b(regular|regular plan)\b/i.test(name)) plan = "Regular";
      if (/\b(growth|growth option|growth plan)\b/i.test(name)) option = "Growth";
      else if (/\b(dividend|idcw|income distribution cum capital withdrawal|payout|payout option)\b/i.test(name)) option = "IDCW / Dividend";
      else if (/\b(reinvestment|re-investment|reinvestment option)\b/i.test(name)) option = "IDCW Reinvestment";
      return { plan, option };
    }

    for (const raw of text.split(/\r?\n/)) {
      const line = clean(raw);
      if (!line) continue;
      const c = raw.split(";").map(v => clean(v));
      const isScheme = c.length >= 6 && /^\d+$/.test(c[0]) && c[3];
      if (!isScheme) {
        if (!line.includes(";") && /(?:mutual fund|asset management|mf$)/i.test(line)) {
          currentAMC = line.replace(/\s*[-:]+\s*$/, "").trim();
        }
        continue;
      }
      const nav = Number(c[4]);
      if (!Number.isFinite(nav) || nav <= 0) continue;
      const name = c[3];
      const cls = classify(name);
      rows.push({
        code: c[0],
        isin: c[1] || "",
        isinReinvest: c[2] || "",
        name,
        nav,
        date: c[5] || "",
        amc: currentAMC,
        plan: cls.plan,
        option: cls.option
      });
    }

    rows.sort((a, b) => a.amc.localeCompare(b.amc) || a.name.localeCompare(b.name));
    const amcs = [...new Set(rows.map(x => x.amc))].sort((a,b) => a.localeCompare(b));

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({ schemes: rows, amcs, count: rows.length, source: "AMFI" });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to load AMFI schemes",
      detail: e?.message || "Provider error"
    });
  }
}