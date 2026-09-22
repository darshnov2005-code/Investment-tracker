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

    function classify(name, explicitPlan, explicitOption) {
      let plan = explicitPlan || "Unknown";
      let option = explicitOption || "Unknown";
      if (/\b(direct)\b/i.test(plan) || /\b(direct plan)\b/i.test(name)) plan = "Direct";
      else if (/\b(regular)\b/i.test(plan) || /\b(regular plan)\b/i.test(name)) plan = "Regular";
      if (/growth/i.test(option) || /growth/i.test(name)) option = "Growth";
      else if (/idcw|dividend|payout/i.test(option) || /idcw|dividend|payout/i.test(name)) option = "IDCW / Dividend";
      else if (/reinvest/i.test(option) || /reinvest/i.test(name)) option = "IDCW Reinvestment";
      return { plan, option };
    }

    for (const raw of text.split(/\r?\n/)) {
      const line = clean(raw);
      if (!line) continue;

      const c = raw.split(";").map(clean);
      if (!/^\d+$/.test(c[0] || "")) {
        if (!line.includes(";")) currentAMC = line.replace(/\s*[-:]+\s*$/, "").trim();
        continue;
      }

      // AMFI feeds can appear in both legacy 6-column and newer 8-column form.
      // 6-col: code, ISIN payout/growth, ISIN reinvestment, name, NAV, date
      // 8-col: code, ISIN payout/growth, ISIN reinvestment, name, plan, option, NAV, date
      let name, plan = "", option = "", nav, date;
      if (c.length >= 8) {
        name = c[3];
        plan = c[4];
        option = c[5];
        nav = Number(c[6]);
        date = c[7];
      } else if (c.length >= 6) {
        name = c[3];
        nav = Number(c[4]);
        date = c[5];
      } else {
        continue;
      }

      if (!name || !Number.isFinite(nav) || nav <= 0) continue;

      const cls = classify(name, plan, option);
      rows.push({
        code: c[0],
        isin: c[1] || "",
        isinReinvest: c[2] || "",
        name,
        nav,
        date: date || "",
        amc: currentAMC || "Other / Unclassified",
        plan: cls.plan,
        option: cls.option
      });
    }

    rows.sort((a, b) =>
      a.amc.localeCompare(b.amc) ||
      a.name.localeCompare(b.name) ||
      a.plan.localeCompare(b.plan) ||
      a.option.localeCompare(b.option)
    );

    const amcs = [...new Set(rows.map(x => x.amc))].sort((a, b) => a.localeCompare(b));

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json({ schemes: rows, amcs, count: rows.length, source: "AMFI" });
  } catch (e) {
    return res.status(502).json({
      error: "Unable to load AMFI schemes",
      detail: e?.message || "Provider error"
    });
  }
}