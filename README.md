# Investment Tracker — India

A responsive personal investment tracker designed for Indian stocks, mutual funds/SIPs and other assets.

## Architecture
- Static frontend shell in `index.html` with the application logic separated into `app.js`.
- Portfolio data remains browser-local: `localStorage` is the primary store, with automatic IndexedDB snapshots for local backup/restore.
- No Supabase, login system or hosted portfolio database is required.
- Market data is isolated behind server-side Vercel API routes so the UI can change providers without changing the portfolio model.
- State is versioned (`investtrack-v4`) and legacy `investtrack-v3` data is migrated automatically.
- Quote caching, request timeouts and stale-value preservation improve reliability.

## Included
- Dashboard with portfolio value, invested cost, unrealised/realised P/L, XIRR, allocation, top movers and portfolio insights.
- Holdings across stocks, mutual funds, ETFs, FD, bonds, SGB, PPF, NPS, gold, cash and other assets.
- Transaction ledger with BUY, SELL, SIP, dividend, bonus, split, rights and redemption actions.
- Detailed transaction charges: brokerage, STT, GST and other charges.
- FIFO realised P/L with holding-period buckets.
- Financial goals with target date, progress source and monthly contribution planning.
- Stock research with valuation, profitability, growth, leverage, liquidity, cash flow and trend metrics.
- Transparent rule-based screening signal with visible scoring inputs.
- News & Events page for recent stock news.
- AMFI mutual-fund selection with AMC → scheme → plan → option.
- CSV import and JSON export/import.
- Local PIN lock with optional auto-lock.
- Automatic local backup snapshots and restore.
- Data-source transparency and quote-cache status.
- Mobile-first responsive navigation and tables.
- No portfolio data is sent to a shared database.

## Data sources
- NSE/BSE stock and ETF quotes: Yahoo Finance with an NSE fallback where available.
- Mutual fund NAVs and scheme catalogue: AMFI.
- Stock research and news: Yahoo Finance.
- Provider failures do not overwrite the last known good quote.

## Privacy note
The local PIN is a convenience/privacy lock for the browser UI. It is not equivalent to encryption and should not be treated as protection against someone with access to the browser's developer tools or local profile.

## Backup note
Automatic snapshots are stored in IndexedDB on the same browser/device. For stronger disaster recovery, use **Export JSON** periodically and keep the downloaded backup somewhere separate.

## Run
Deploy through Vercel or serve the repository with a static web server. The API routes require a serverless deployment for live market data, AMFI and news.
