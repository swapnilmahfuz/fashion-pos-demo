# QAHAF — Advanced Fashion POS · Phase 7 demo

An interactive, sample-data-only browser prototype for a two-branch menswear POS. **Not production software**.

## Phase 7 client walkthrough

Open **Reports & Analytics** as Owner. Select a report, branch and date range. In Profit & Loss, switch between Products, Categories, Invoice, Date, Customer and Day. Select **Linked session activity only** to analyze your own demo postings. Select a linked row to inspect its source. The supporting balances show purchasing and inventory separately from earned profit.

Use **Download Report** for a numeric Excel workbook, CSV, PDF or full-table printout. Downloads include all rows matching the search and filters. Managers have an Operational Reports workspace for their assigned branch. The report formulas and data limits are in [the implementation status](docs/IMPLEMENTATION_STATUS.md).

## Phase 6 client walkthrough

Select New Market and open Funds & Accounts. Create **bKash Personal** and **City Bank** with zero opening balances. Each branch already has a Cash Box. At checkout, split a payment between Cash Box and bKash Personal and select **Allow unpaid balance**. Enter the customer’s phone. Under **Customer Dues**, collect the remaining balance into City Bank. Open the account statements to see the linked invoice and collection.

Use **Expenses** to record a paid, partial or unpaid branch expense and attach a receipt. An unpaid expense appears in operating expenses immediately. Paying it later reduces the payable and the selected account. **Cash Flow** shows external receipts and payments separately from transfers between accounts. Unlinked historical samples contribute no cash entries.

## Phase 5 client walkthrough

Select New Market and open Stock Transfers. Add variants by SKU or barcode, then save a draft or dispatch. Switch to Dakbangla to receive the shipment and print the challan. The Stock Report shows carrying value through dispatch and receipt.

Use Damage & Defects to quarantine an item or manage a defective customer return. Under Products & Inventory, Stock Adjustments reconciles a physical count and Dead Stock shows variants at the selected inactivity threshold. The Owner can configure the threshold separately for each branch.

## Phase 4 client walkthrough

Select a selling branch, open POS & Sales and scan a variant. Use Edit item to change quantity or its manual discount. Discounts & Offers manages scheduled branch campaigns. Hold / resume carts keeps multiple in-progress sales. Receipt & VAT settings lets the Owner set the illustrative tax rate and footer.

Checkout defaults to a full Cash Box payment. Add a second payment row for split tender, or enter a phone number and allow an unpaid balance. Open Sales History to collect dues, reprint a receipt, return a partial quantity or exchange a variant. Return credits reduce unpaid balances first. Resellable and defective returns retain separate quantities and cost values. Refresh resets the demo.

## Preview locally

Open `index.html` in a web browser (no build step). The demo also works via any static HTTP server.

## Phase 1 app shell

The grouped sidebar preserves the existing operational screens. Products & Inventory has All Products, Stock Report, Low Stock, Dead Stock and Defective Stock tabs, with a separate Categories management screen. Marketing exposes the existing offer-text copy workflow. Funds & Accounts supports branch account statements, cash movements and settlement of invoice dues. Monthly Overview, Reports and financial CSV exports belong to the Owner preview. Operational catalog/stock exports follow branch scope, with aggregate values limited to Owner. Managers retain operational access in their assigned branch.

The header identifies browser-only role simulation. Every page title shows its branch scope. `config.js` centralizes identity, branch names, assignment and navigation. Design tokens remain in `style.css`.

Dialogs support focus trapping, keyboard dismissal, focus restoration and confirmation before discarding edited forms. A role/branch change asks before clearing a populated cart.

## Run automated checks

Use Node.js 20 or later and Poppler’s `pdftotext` for the PDF contents test.

```sh
npm ci
npx playwright install chromium
npm test
```

The tests start a local static server and check desktop 1440/1024 and mobile 390/360 layouts. Set `CHROMIUM_PATH` to an installed Chromium executable when needed. `QAHAF_BASE_URL` can target an existing server. Browser checks create sample transactions in their own contexts.

The application still opens as a static site. Node.js is used for development tests. Hardware scanner/printer acceptance and production authentication remain scheduled for the later approved phases.

## Current client review

- Owner branch selection persists in this browser. Combined, New Market, and Dakbangla apply across screens and CSV reports.
- The demo Manager is assigned permanently to New Market. The role selector simulates access for client review.
- Daily Overview defaults to today in Asia/Dhaka. Monthly Overview and Profit analytics share the selected month. Expenses and customer reports use that month too.
- A deterministic 90-day sample sales ledger supplies invoices, discounts, refunds, payment methods, item/category performance and gross profit. Revenue and profit include refund reversals. Average invoice is net revenue divided by sales invoice count.
- Operating profit equals gross profit less expenses. Every expense belongs to one branch. Combined reports sum the two branches without allocating or splitting expenses. Inventory value always reflects current stock at catalog cost.
- Add Product and Edit Product support shared category/subcategory, description, pattern/design, up to six photos, size/color combinations, per-variant buying/selling prices and inclusive-by-default VAT metadata. Auto SKUs use stable category codes and sequential product numbers, follow new-variant attribute changes and resolve abbreviation collisions. Manual and historical SKUs stay unchanged unless explicitly edited. Manual SKU edits retain aliases and stable IDs. Duplicate SKUs, historical aliases and barcode identities are reserved company-wide.
- Save Product creates catalog data only. Save & Receive Stock opens an invoice with the new variants. Save draft reserves a reference. Confirm receipt posts stock, costs and supplier balances to the selected branch.
- Owner manages taxonomy, status, safe deletion and bulk category/price/status changes. Both roles retain inline taxonomy creation and branch-scoped availability management. Bulk changes require validation and preview. Existing stock/history prevents deletion, while deactivation preserves references.
- All Products, Stock Report and Low Stock support category filters and name/SKU/barcode lookup, exact variant details and size/color matrices. The low-stock threshold is 5 in `config.js`. Owner sees current stock buying and marked selling values. Catalog buying-price suggestions are separate from the branch carrying costs.
- Availability is branch-specific and never moves quantities. Stock or unresolved transfers prevent removal of availability. Manager creation, availability, preparations and imports are restricted to New Market. Product definitions remain company-wide.
- CSV import supports validation and preview with all-or-nothing, new-variant creation. Catalog and stock exports follow active filters and branch scope. See the format below.
- POS accepts barcode plus Enter in the scan field. F2 focuses it. Fast HID scans also work when focus is outside editable fields. Other input fields retain normal typing. Repeated scans respect branch stock limits.
- Sample checkout records branch carrying cost at sale. Receipts and openings update moving-average cost. Transfers carry their dispatch value into the receiving branch.
- Code 128 labels use locally bundled JsBarcode 3.12.1 under its MIT license. Preview and print 1–100 individual/bulk labels, width 40–100 mm and minimum height 25–100 mm, with optional selling price. Reprints retain the same barcode. Use 100% print scale and validate a physical print with the demonstration scanner.

## Demo features

- Owner profile: both branches and consolidated dashboards.
- Manager profile: one assigned branch, with identical operational modules scoped to that branch.
- Sample dashboards, product variants, unique example barcodes, stock, purchasing, transfers, expenses, profitability, customers and settings.
- Sample checkout: add products, scan example barcodes via typing/keyboard, change quantities, discount flat or %, preview a non-tax sample receipt and use browser print.
- Sample expenses, transfers and receiving preparations, local only until refresh.
- Owner report CSV export. Expense and contact exports follow their visible branch/month datasets.

Physical USB scanner and printer validation requires the demonstration hardware. Keyboard scan simulation and browser print layouts can be tested in Chromium. New invoices use the configured demo VAT rate and preserve VAT separately from sales revenue. Only the Owner branch preference persists locally.

## Catalog CSV format

Use **Import CSV → Download template**, or paste CSV text and choose **Validate & Preview**. Nothing changes until every row is valid and **Import catalog only** is selected. Editing the file invalidates the preview. Maximum 500 variants and 2 MB per uploaded file. Quoted commas, quotes and multiline descriptions are supported.

Columns are:

```text
product_key,name,category_code,subcategory,description,size,color,pattern,design,sku,barcode,buying_price,selling_price,vat_mode,branch,available,active
```

Required columns are `product_key`, `name`, `category_code`, `size`, `color`, `buying_price` and `selling_price`. Rows with the same `product_key` form one new style and must share name/category/subcategory/description/pattern/design, with unique size/color combinations. Category codes must already exist. Subcategories must match their category. Blank SKU/barcode cells receive unique generated identities. Explicit barcodes must contain 6–24 digits. VAT accepts included/inclusive, excluded/exclusive or exempt, defaulting to included.

Branch accepts the selected branch name/ID, or Combined for Owner in Combined scope. `available` and `active` default to true and accept true/false, yes/no or 1/0. Manager imports must use the assigned branch. Prices must be finite, buying nonnegative and selling at least 0.01. Imports create new zero-stock variants. Existing SKUs/barcodes are rejected, so exports are reference files rather than an overwrite/update mechanism. Use Edit Product to update existing identities. Use Purchases → Import opening stock for the separate branch,sku,quantity,buying_cost format.

## Phase boundary

Phase 3 covers supplier purchases, payments, returns, opening stock and branch moving-average costing. Phase 4 covers sales invoicing, tax, tenders and linked customer returns.

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
