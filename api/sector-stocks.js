"use strict";

const MEMBERS = {
  NIFTY50: ["RELIANCE","TCS","HDFCBANK","ICICIBANK","INFY","ITC","BHARTIARTL","SBIN","LT","AXISBANK","KOTAKBANK","BAJFINANCE","HINDUNILVR","ASIANPAINT","MARUTI","SUNPHARMA","TITAN","ULTRACEMCO","NTPC","POWERGRID","M&M","TATASTEEL","ONGC","NESTLEIND","WIPRO","HCLTECH","BAJAJFINSV","ADANIENT","ADANIPORTS","TECHM"],
  BANK: ["HDFCBANK","ICICIBANK","SBIN","AXISBANK","KOTAKBANK","INDUSINDBK","BANKBARODA","PNB","IDFCFIRSTB","FEDERALBNK","AUBANK"],
  PVTBANK: ["HDFCBANK","ICICIBANK","AXISBANK","KOTAKBANK","INDUSINDBK","FEDERALBNK","IDFCFIRSTB","AUBANK","BANDHANBNK","RBLBANK"],
  PSUBANK: ["SBIN","BANKBARODA","PNB","CANBK","UNIONBANK","INDIANB","BANKINDIA","MAHABANK"],
  FIN: ["BAJFINANCE","BAJAJFINSV","HDFCBANK","ICICIBANK","SBIN","AXISBANK","KOTAKBANK","HDFCLIFE","SBILIFE","PFC","RECLTD","CHOLAFIN"],
  IT: ["TCS","INFY","HCLTECH","WIPRO","TECHM","LTIM","PERSISTENT","COFORGE","MPHASIS","LTTS"],
  AUTO: ["MARUTI","M&M","TATAMOTORS","BAJAJ-AUTO","EICHERMOT","HEROMOTOCO","TVSMOTOR","BOSCHLTD","MOTHERSON","ASHOKLEY"],
  METAL: ["TATASTEEL","JSWSTEEL","HINDALCO","VEDL","COALINDIA","NMDC","SAIL","JINDALSTEL","NATIONALUM","HINDZINC"],
  REALTY: ["DLF","GODREJPROP","OBEROIRLTY","PHOENIXLTD","PRESTIGE","BRIGADE","SOBHA","LODHA"],
  ENERGY: ["NTPC","POWERGRID","ONGC","RELIANCE","TATAPOWER","ADANIGREEN","ADANIENSOL","NHPC","SJVN"],
  OILGAS: ["RELIANCE","ONGC","IOC","BPCL","GAIL","PETRONET","HINDPETRO","OIL"],
  PHARMA: ["SUNPHARMA","DRREDDY","CIPLA","DIVISLAB","MANKIND","TORNTPHARM","LUPIN","AUROPHARMA","ALKEM","BIOCON"],
  HEALTH: ["SUNPHARMA","DRREDDY","CIPLA","APOLLOHOSP","DIVISLAB","MAXHEALTH","FORTIS","LALPATHLAB"],
  FMCG: ["HINDUNILVR","ITC","NESTLEIND","BRITANNIA","DABUR","GODREJCP","MARICO","COLPAL","TATACONSUM","VBL"],
  CONSUM: ["TITAN","ASIANPAINT","HAVELLS","TRENT","PAGEIND","DMART","JUBLFOOD","INDIGO"],
  DURABLE: ["HAVELLS","VOLTAS","BLUESTARCO","WHIRLPOOL","CROMPTON","DIXON","AMBER"],
  MEDIA: ["ZEEL","SUNTV","PVRINOX","NETWORK18","TVTODAY"],
  INFRA: ["LT","ADANIPORTS","IRCTC","IRFC","NBCC","GMRINFRA"],
  SERVICE: ["TCS","INFY","HDFCBANK","ICICIBANK","BHARTIARTL","SBIN","LT"]
};

const NAME_HINT = {
  "M&M": "Mahindra & Mahindra",
  "BAJAJ-AUTO": "Bajaj Auto",
  LTIM: "LTIMindtree",
  VBL: "Varun Beverages",
  DMART: "Avenue Supermarts"
};

const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  Accept: "application/json,text/plain,*/*"
};

let mem = {};

function istDate() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  const mins = Number(parts.hour) * 60 + Number(parts.minute);
  const isWeekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const marketOpen = !isWeekend && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    marketOpen
  };
}

async function yahooDay(symbol) {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol + ".NS") +
    "?range=5d&interval=1d";
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const d = await r.json();
  const result = d?.chart?.result?.[0];
  if (!result) throw new Error("no data");
  const meta = result.meta || {};
  const q = result.indicators?.quote?.[0] || {};
  const closes = (q.close || []).filter(x => typeof x === "number" && isFinite(x));
  const price = Number(meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : NaN));
  const prev =
    closes.length >= 2
      ? closes[closes.length - 2]
      : Number(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(price) || !Number.isFinite(prev) || prev <= 0) throw new Error("bad");
  return {
    symbol,
    name: NAME_HINT[symbol] || meta.shortName || meta.longName || symbol,
    price,
    previousClose: prev,
    changePct: ((price - prev) / prev) * 100,
    change: price - prev
  };
}

async function loadSector(sectorId) {
  const id = String(sectorId || "").toUpperCase();
  const list = MEMBERS[id];
  if (!list) throw new Error("Unknown sector: " + sectorId);

  const ist = istDate();
  const cacheKey = ist.date + "|" + id;
  if (mem[cacheKey] && (!ist.marketOpen || Date.now() - mem[cacheKey].fetchedAt < 5 * 60 * 1000)) {
    return mem[cacheKey];
  }

  const stocks = [];
  for (let i = 0; i < list.length; i += 5) {
    const batch = list.slice(i, i + 5);
    const part = await Promise.all(
      batch.map(async sym => {
        try {
          return await yahooDay(sym);
        } catch (e) {
          return { symbol: sym, name: NAME_HINT[sym] || sym, price: null, changePct: null, error: e.message };
        }
      })
    );
    stocks.push(...part);
  }

  stocks.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
  const payload = {
    sector: id,
    tradeDate: ist.date,
    marketOpen: ist.marketOpen,
    fetchedAt: Date.now(),
    count: stocks.length,
    stocks,
    source: "Yahoo Finance (.NS)"
  };
  mem[cacheKey] = payload;
  return payload;
}

export default async function handler(req, res) {
  try {
    const sector = String(req.query.sector || "").trim();
    if (!sector) return res.status(400).json({ error: "sector is required", known: Object.keys(MEMBERS) });
    const force = String(req.query.force || "") === "1";
    if (force) {
      const ist = istDate();
      delete mem[ist.date + "|" + sector.toUpperCase()];
    }
    const data = await loadSector(sector);
    const maxAge = data.marketOpen ? 120 : 3600;
    res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, max-age=${maxAge}, stale-while-revalidate=600`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || "Sector stocks unavailable" });
  }
}
