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

## Private multi-user mode

The tracker now supports account-based private portfolios using Supabase Auth + Row Level Security.

### One-time setup

1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase-schema.sql`.
3. In Supabase Authentication, configure email/password sign-in. If email confirmation is enabled, users must verify their email before signing in.
4. In Vercel → Project → Settings → Environment Variables, add:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = your Supabase publishable/anon key
5. Redeploy the Vercel project.

Each signed-in user gets a separate row in `public.portfolios`. Row Level Security allows a user to read/write only their own row, so sharing the website URL does not expose your investment data.

The Supabase anon/publishable key is intended for browser use; the database security comes from the RLS policies. Do not put a Supabase service-role key in the browser or commit it to GitHub.

### Developer rights

Keep your **Vercel account/team ownership** separate from normal app users. App users do not need Vercel access.

For a developer who needs to work on the deployment, add them to the Vercel team with the **Developer** role, and give project-level access as required. Keep Owner/Admin access only for people who need billing/team/security control.
