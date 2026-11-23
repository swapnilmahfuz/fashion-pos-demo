# THREAD / Retail OS — Advanced Fashion POS client demo

An interactive, sample-data-only browser prototype for a two-branch menswear POS. **Not production software**.

## Preview locally

Open `index.html` in a web browser (no build step). The demo also works via any static HTTP server.

## Demo features

- Owner profile: both branches and consolidated dashboards.
- Manager profile: one selected branch at a time, with identical operational modules scoped to that branch.
- Sample dashboards, product variants, unique example barcodes, stock, purchasing, transfers, expenses, profitability, customers and settings.
- Sample checkout: add products, scan example barcodes via typing/keyboard, change quantities, discount flat or %, preview a non-tax sample receipt and use browser print.
- Sample expenses and transfer/purchasing requests, local only until refresh.
- Sample report CSV export.

## Important limitations

This is an **illustrative static demo**, not a live POS. All data is invented. Owner/Manager role switching is a UX simulation, not secure authentication. No server, persistent database, actual inventory costing, transactional stock movements, invoice processing, real barcode encoding, payments, customer marketing, or VAT compliance is implemented. Production requires a server-enforced permission model, validated VAT rules, weighted-average cost, immutable stock ledger, and reconciliation.

## Create a GitHub repository and publish

1. In GitHub, create a **new public repository** named `fashion-pos-demo` (or another name).
2. Upload the contents of this folder to the repository's `main` branch, preserving `.github/workflows/pages.yml`.
3. In **Settings → Pages**, set **Build and deployment → Source: GitHub Actions**.
4. Open **Actions**, run **Deploy client demo to GitHub Pages** if a deployment did not automatically start.
5. After deployment succeeds, the preview will be at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

Do not share a guessed URL as verified until GitHub Actions confirms successful deployment.


## Live product after client approval

Planned production stack: PHP/Laravel, MySQL/MariaDB and a Vue-powered browser UI, subject to cPanel compatibility tests. The client's domain and hosting are not needed for this client demo.
