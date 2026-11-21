# POS Invoice Manager — notes for Claude

Restaurant staff app (orders, invoices, card/QR/Zelle payments, Event Sales register,
catering calculator, shopping lists, SMS broadcast). React 18 + Vite + Tailwind front end,
Vercel serverless functions in `api/`, data in a Google Sheet through SheetDB.
Pushing to `main` deploys to production on Vercel.

This repo is public: never commit keys, passwords, email addresses, phone numbers or
private addresses. Real secrets live in `.env.local` (not in git) and in Vercel env vars.

## Commands
- `npm test` (vitest), `npm run lint`, `npm run build` — run tests + build before pushing.
- `npm run dev` (front end), `npm run dev:api` (local API, needs `.env.local`).
- Cloud sessions have no `.env.local`, so live SheetDB/Stripe/Twilio/Resend calls won't work
  there. Use demo mode or tests to check changes.
- Commands that prompt for a secret (`wrangler secret put`, `vercel env add`, logins) must be
  run by the owner in a real Terminal, never through `!` (it saves an empty value).

## Working with the owner
- The owner writes casually and often tests on a real iPhone. Explain things in plain words.
- Commit style: `Area: what changed, in plain words` + a short plain-language body.
- When a feature ships, add an entry at the top of `UPDATES` in `src/pages/UpdatesPage.jsx`.
- Every new feature needs its own made-up demo data (see Demo mode below).

## Security / access (don't weaken)
- The whole app and every `/api` endpoint are behind staff login (`api/_lib/auth.js`,
  HMAC-signed HttpOnly cookie). New endpoints must call `requireStaff()` (or
  `requireAccess(...)` for employee sections). New pages are gated by `StaffGate` in `App.jsx`.
- Only public links: server-signed `/invoice?share=1&token=…` and `/catering?share=1&token=…`.
- Employees log in with phone + 4-digit PIN, stored as scrypt hashes in the sheet's
  "Employees" tab (always keep employee credentials in the sheet). Per-section permissions
  live in its "Access" column — server map `api/_lib/permissions.js`, client mirror
  `src/lib/permissions.js`. Employees see and change only their own rows (orders by TakenBy,
  sales/payments by SoldBy), filtered server-side in `api/sheets.js`. Any new read of
  orders/sales must apply the same filter.
- No self sign-up ("Create an Account" only says to ask the manager).
- Demo mode is browser-only and must never get server access.

## Demo mode is fictional only
`src/lib/demo.js` — "Demo Café", `DEMO_CATERING_MENU`, demo store "Demo Wholesale Club" /
"Corner Produce". Never show the real restaurant's name, menu, products, photos, store names
or Zelle QR in demo. Add a test in `test/demo.test.js` that no real names leak.

## SheetDB request limit
The plan has a monthly request cap (hit it once, 429s stop everything). Avoid extra
full-list reads: client reads reuse `sharedRead` in `src/api/sheetdb.js` (15 s), server
reads go through `sheetdbFetch` (one retry on timeouts, never on 429). Keep the 1.5 s
debounce on quote saves. SheetDB's single-row PATCH endpoint doesn't work on this account.

Sheet tabs the owner creates by hand (code can't): Quotes, EventSales, Employees, Shopping,
Products. If a save fails because a tab or column is missing, tell the owner what to add.

## Data conventions
- Order `Items` is free text with mixed formats (comma-separated or one per line, maybe `•`
  bullets / trailing commas). Always parse with `splitItems()` in `src/lib/format.js`.
- A leading `Nx` means quantity: "2x Ensalada de frutas" = 2 of that item. Event Sales saves
  dish notes like `2x Taco de Chivo (no onion) ($10.00)`.
- Old Orders rows only have Date (no DueDate).
- Orders `Id` is an ARRAYFORMULA in A2 (row number for every row with a Date): never write
  column A. Deleting an order is a soft delete: the `Deleted` column gets "MM/DD/YYYY h:mm AM
  by Name" and every read hides it; `restoreOrder` clears it. Never DELETE order rows (later
  Ids would shift).

## UI / mobile rules learned on real phones
- Avoid `position: fixed` on mobile views; it caused iOS scroll snap-back twice.
  If a scroll-bounce bug comes back, suspect `position: fixed` first.
- Keep `overflow-x: hidden` on BOTH `html` and `body` — removing the html one broke iPhone.
- Native date/time inputs: give them their own full-width row on phones; don't put them side by side.
- Native controls need `color-scheme` set per theme or their text is invisible.
- Invoice: one `<tr>` per item (keeps Qty/Description aligned); card is `max-w-3xl` so the
  header doesn't wrap; html2canvas capture width is 900.
- Print CSS turns off all animations (otherwise the invoice prints blank). New entrance
  animations that start hidden must stay covered by that `@media print` rule.
- Themes: blue (default), green, red, black, white, gray, plus developer themes terminal,
  code, logo (picked from a menu) — CSS vars + classes on `<html>`,
  `src/lib/theme.js`, saved in localStorage `pim-theme`. Use the `brand.*`/`surface` Tailwind
  tokens, never new hex values. The invoice paper (`.paper-card`) always stays light.
  Every theme class must be in `safelist` in `tailwind.config.js`, or the build drops its colours.
- PWA icon = invoice + card on the login blue; never the restaurant logo.
- Login screen: mobile must not scroll; the owner dislikes bold taglines; only use the owner's
  own images, never substitutes.

## Features worth knowing
- Event Sales (`/event`, `MenuPicker variant="pos"`): tap adds one per tap (keep it that way),
  small pencil for dish notes, Columns/Rows switch only on touch tablets, don't change the
  phone layout unless asked. Pay options include card, QR pay (Stripe checkout on the
  customer's phone) and Zelle (real QR from `REAL_BRAND` in `src/lib/brand.js`; hidden in demo).
- Zelle auto-confirm: the bank's (Spanish) Zelle emails are forwarded to a Resend receiving
  address; `/api/zelle-alerts` + `api/_lib/zelle.js` match them to sales. If it doesn't
  confirm, look at the received emails in Resend before changing code.
- Catering quotes sync through the "Quotes" tab (`api/quotes.js`); the employee link can only
  save. An employee deleting a quote removes only their phone's copy.
- Shopping (`/shopping`): boss + manager make lists; employee access via "shopping" / "prices"
  permissions. Receipt photos in a private Vercel Blob store, served only through
  `/api/shopping`, read by Claude to prefill totals and update catalog prices
  (`priceUpdatesFromReceipt` in `api/_lib/products.js`). Regular stores in `REGULAR_STORES`
  (`src/lib/shopping.js`). Barcode scanning via `@zxing/browser`.
- Web Design & MultiMedia (`/webdesign`): a second business's leads list. Own login
  (`WEB_ACCOUNTS` env, role "web", sees only that page, never restaurant data), own sheet
  (`WEB_SHEETDB_ID`), served by `api/_lib/leads.js` through `/api/sheets` (no new function
  file; the project already has 12). Hand-typed headers are matched loosely; editing needs an
  "Id" column. Delete only marks the "Deleted" column (Undo / Restore,
  like orders). Leads has its own tabs: Leads, Answered + website, Deleted. Each lead has an AI website prompt
  (sheet column "AI Prompt", up to 45,000 characters; saved from the card or the form). Projects tab: GitHub repos via `api/_lib/projects.js` (GET ?action=projects on
  /api/sheets; optional `GITHUB_USERNAME` / `GITHUB_TOKEN`; optional `VERCEL_TOKEN` adds live
  sites + Vercel-only projects; cached 10 min). Demo leads and
  projects in `src/lib/demoLeads.js`.
- Adding catalog products: the owner pastes Restaurant Depot listings; add rows to the
  Products tab. Check Item # for duplicates first; recompute per-oz/per-count prices.
  Don't download RD photos without asking.
