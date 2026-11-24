# QAHAF — Fashion POS client demo V1.2

An interactive, sample-data-only browser prototype for a two-branch menswear POS. **Not production software**.

## Preview locally

Open `index.html` in a web browser (no build step). The demo also works via any static HTTP server.

## Phase 1 app shell

The grouped sidebar preserves the existing operational screens. Products & Inventory has Inventory, Products and Categories tabs. Marketing exposes the existing offer-text copy workflow. Damage & Dead Stock and Funds & Accounts have planned labels. Monthly Overview, Reports and CSV exports belong to the Owner preview. Managers retain operational access in their assigned branch.

The header identifies browser-only role simulation. Every page title shows its branch scope. `config.js` centralizes identity, branch names, assignment and navigation. Design tokens remain in `style.css`.

Dialogs support focus trapping, keyboard dismissal, focus restoration and confirmation before discarding edited forms. A role/branch change asks before clearing a populated cart.

## Run automated checks

Use Node.js 20 or later.

```sh
npm ci
npx playwright install chromium
npm test
```

The tests start a local static server and check desktop 1440/1024 and mobile 390/360 layouts. Set `CHROMIUM_PATH` to an installed Chromium executable when needed. `QAHAF_BASE_URL` can target an existing server. Browser checks create sample transactions in their own contexts.

The application still opens as a static site. Node.js is used for development tests. Hardware scanner/printer acceptance and production authentication remain scheduled for the later approved phases.

## V1.2 client review

- Owner branch selection persists in this browser. Combined, New Market, and Dakbangla apply across screens and CSV reports.
- The demo Manager is assigned permanently to New Market. The role selector simulates access for client review.
- Daily Overview defaults to today in Asia/Dhaka. Monthly Overview and Profit analytics share the selected month. Expenses and customer reports use that month too.
- A deterministic 90-day sample sales ledger supplies invoices, discounts, refunds, payment methods, item/category performance and gross profit. Revenue and profit include refund reversals. Average invoice is net revenue divided by sales invoice count.
- Operating profit equals gross profit less expenses. Every expense belongs to one branch. Combined reports sum the two branches without allocating or splitting expenses. Inventory value always reflects current stock at catalog cost.
- Owner manages shared categories. Both roles can add a category inside product entry. Add New Product creates size/color variants, unique company-wide SKUs and immutable barcodes, descriptions, price/cost, inclusive-by-default VAT metadata, optional images and initial stock in a selected branch. Save, Save & Add Another, and Save & Print Barcode actions are available. Auto SKUs use stable category codes and sequential product numbers. Manual SKU changes retain prior references and stable variant IDs. Archive keeps historical category references.
- Inventory supports barcode/SKU lookup, size/color matrices, sample receiving, transfer dispatch/receipt, and label printing from rows and details.
- POS accepts barcode plus Enter in the scan field. F2 focuses it. Fast HID scans also work when focus is outside editable fields. Other input fields retain normal typing. Repeated scans respect branch stock limits.
- Sample checkout updates the in-memory sales ledger and branch stock. Receiving and transfers update sample on-hand stock. Combined requires a specific branch for operational transactions.
- Code 128 labels use locally bundled JsBarcode 3.12.1 under its MIT license. Print 1–100 labels at 58 or 80 mm. Reprints retain the same barcode. Use 100% print scale and validate a physical print with the demonstration scanner.

## Demo features

- Owner profile: both branches and consolidated dashboards.
- Manager profile: one assigned branch, with identical operational modules scoped to that branch.
- Sample dashboards, product variants, unique example barcodes, stock, purchasing, transfers, expenses, profitability, customers and settings.
- Sample checkout: add products, scan example barcodes via typing/keyboard, change quantities, discount flat or %, preview a non-tax sample receipt and use browser print.
- Sample expenses and transfer/purchasing requests, local only until refresh.
- Owner report CSV export. Expense and contact exports follow their visible branch/month datasets.

Physical USB scanner and printer validation requires the demonstration hardware. Keyboard scan simulation and browser print layouts can be tested in Chromium. VAT mode is catalog metadata. Report prices are illustrative net-of-VAT amounts. Only the Owner branch preference persists locally.

## Important limitations

This is an **illustrative static demo**, not a live POS. All data is invented. Owner/Manager role switching is a UX simulation, not secure authentication. No server, persistent database, production inventory costing, durable transaction processing, payments, customer marketing, or VAT compliance is implemented. Production requires a server-enforced permission model, validated VAT rules, weighted-average cost, immutable stock ledger, and reconciliation.

## Publish this repository

1. Push to the existing repository's `main` branch.
2. Keep **Settings → Pages → Build and deployment → Source** set to **Deploy from a branch**, using **main** and **/(root)**.
3. GitHub runs its branch-based Pages build after a push. Check the Pages build and deployment status.
4. After deployment succeeds, verify `https://swapnilmahfuz.github.io/fashion-pos-demo/`.

Do not share a guessed URL as verified until the Pages build confirms successful deployment.


## Live product after client approval

Planned production stack: PHP/Laravel, MySQL/MariaDB and a Vue-powered browser UI, subject to cPanel compatibility tests. The client's domain and hosting are not needed for this client demo.
