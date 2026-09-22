# Investment Tracker — India

A responsive personal investment tracker built around the requirements discussed in ChatGPT.

## Included
- Dashboard: invested cost, current value, overall P/L, return %, realised P/L and allocation.
- Indian stocks with NSE/BSE fields.
- Mutual funds/SIPs with AMFI/source fields.
- ETFs, FD, bonds, SGB, PPF, NPS, gold, cash and other assets.
- Separate transaction ledger; repeated purchases of the same script remain separate transactions but are consolidated into one holding with an average price.
- Buy, sell, SIP, dividend, bonus, split, rights and redemption transaction types.
- Transaction date, quantity, price/NAV, charges and notes.
- FIFO realised gain/loss and unrealised P/L.
- Goals with target amount/date and progress.
- Search/filter, edit/delete, CSV import and JSON backup.
- Responsive mobile UI.
- Local browser persistence.

## Market-data architecture
The UI currently includes clearly identifiable demo quote values so the tracker works immediately without credentials. The `price()` function in `index.html` is the quote-provider integration point.

For production real-time NSE/BSE/AMFI prices, use a server-side market-data proxy/provider. Direct browser calls to exchange sites can be restricted by CORS, cookies, anti-bot controls and rate limits. Portfolio calculations are independent of the quote provider, so the live-data layer can be replaced without changing the transaction model.

## Run
Open `index.html` directly or serve the repository with a static web server.