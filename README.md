# Customer Details (Orders + Invoices)

A lightweight web app to capture customer orders, generate printable invoices, and (optionally) sync to Google Sheets via SheetDB.

## Demo
- Live: https://customer-details-iota.vercel.app/

## Features
- Customer order form (delivery/pickup, payment type, items/qty, deposits)
- Search customers and past orders by phone, name, address, date, or month
- Printable invoice view (clean print CSS, always fits one page) with a read-only shareable link
- Optional Google Sheets sync (SheetDB)
- Mobile responsive, built as a single-page app

## Tech
React, React Router, Tailwind CSS, Vite

## Getting Started
```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # preview the production build locally
```

## Deployment
Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the app and publishes `dist/` to GitHub Pages. In the repo's Settings → Pages, the source must be set to "GitHub Actions".
