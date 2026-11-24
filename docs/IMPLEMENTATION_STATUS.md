# QAHAF Advanced Fashion POS implementation status

Audited and updated on 24 November 2026 in Asia/Dhaka. Phase 1 app-shell work is complete for the public sample demo.

## Audit scope and baseline

This document records the Phase 0 baseline and Phase 1 delivery against the complete uploaded **QAHAF_POS_MASTER_PHASED_INSTRUCTIONS.txt**, planning baseline 1.0 dated 24 November 2026. The source file contains 21,655 bytes and has SHA-256 `2c86b4b5e3b29f6e694abeca2eb6be17341e2ac86f60c2b5142e7a1ca64835e7`.

The audit baseline covers V1.2, including inherited V1.1 functionality and the neutral palette. Phase 1 builds on the Phase 0 documentation commit `5c83a4218010d70e394f1c804241d103e418e5ad`. The inspected application commit is `3bbf38f42a2d0a23b1bf78424ff885e047c9377e`. The repository is [swapnilmahfuz/fashion-pos-demo](https://github.com/swapnilmahfuz/fashion-pos-demo). The live application is [QAHAF Fashion POS](https://swapnilmahfuz.github.io/fashion-pos-demo/).

Phase 0 documented the baseline. Phase 1 updates branding configuration, the shell, grouped navigation, branch context, browser-role controls, dialog accessibility and existing export scope. Product/stock/sales/expense calculations and sample quantities retain their established behavior. Phase 2 and later business workflows require a further user instruction.

## Phase 1 delivery

- Shared `config.js` defines branding, branches, Manager assignment, currency/timezone context and navigation. `style.css` holds design tokens.
- The sidebar groups Dashboard, Monthly Overview, POS & Sales, Products & Inventory, Purchases, Stock Transfers, Expenses, Contacts, Reports, Marketing and Settings. Inventory, Products and Categories use contextual tabs with keyboard navigation.
- Damage & Dead Stock and Funds & Accounts are passive planned labels for Phases 5 and 6. Financial navigation is filtered for Manager.
- The persistent top header shows browser role simulation and branch scope. Each page title displays the active branch.
- Owner retains Combined and both branches. Manager is assigned to New Market through configuration. Product-entry stock targets follow a specific global scope; Owner can explicitly choose a target while in Combined.
- Monthly financial analytics, financial dashboard columns, inventory aggregate cost and report exports are Owner-preview-only. Operational buying-cost fields remain available where needed for existing product/receiving workflows. Role simulation uses public sample data.
- Role/branch changes ask before clearing a populated cart, then reset its checkout fields. Navigation between operational screens preserves the cart.
- Dialogs have accessible names, branch context, focus trapping/restoration, background inertness, Escape/overlay handling and dirty-form discard confirmation. Edited forms also request browser unload confirmation.
- Owner expense and contact CSVs now contain the selected branch/month rows. Existing sales and financial exports retain their scoped sample calculations.
- Reproducible browser tests are tracked in `tests/phase1.test.cjs`, with a pinned development dependency and lockfile. Run instructions are in README.

The current product Save behavior, purchase accounting, weighted-average costing, VAT engine, funds/dues, returns and stock-class gaps remain assigned to their later phases.

### Status definitions

- **Completed** means the described behavior works within the browser-only sample demo and was inspected or exercised.
- **Partial** means useful existing behavior covers some requirements, with the remaining work stated explicitly.
- **Pending** means the required workflow or deliverable is absent.
- A working demonstration component does not establish production readiness or completion of its entire master phase.

## Architecture and execution model

| Area | Current implementation and evidence |
| --- | --- |
| Entry point | `index.html` loads shared `config.js`, `app.js`, the bundled JsBarcode library, `v11.js` and `shell.js`. Styles load from `style.css`. |
| Original shell | `app.js` contains navigation, state, sample products, POS/cart, common modal helpers and original screen implementations. |
| Active enhancements | `v11.js` adds V1.1/V1.2 functionality by replacing several global functions. The filename continues to cover the active V1.2 application. |
| Rendering | Direct DOM rendering with HTML strings and event handlers. Navigation is in-memory, with grouped module entries and contextual product tabs. Owner Monthly Overview and Reports reuse the established monthly report calculations. Marketing reuses the offer-copy action. |
| Product identity | Stable numeric variant `id` and product `groupId`; company-wide SKUs, historical SKU aliases and immutable generated barcodes. Quantities are `b1` and `b2`. |
| Operational data | Mutable JavaScript arrays for products, sales/refunds, expenses, purchases, transfers and stock movements. Each browser session starts from generated sample data. |
| Persistence | Owner branch preference uses localStorage, including migration from the earlier preference key. Operational changes, uploaded images, edited SKUs and transactions reset on refresh. |
| Reporting | `rowsFor()`, `figures()`, `expenseAmount()` and `inventoryValue()` supply active reports. A rolling 90-day sample sales dataset is generated using the Dhaka date. |
| Styling | Charcoal, cream, cocoa, sand and taupe tokens; responsive sidebar/top header; scrollable tables, large product modal and print styles. Fonts are loaded from Google Fonts with fallbacks. |
| Barcode dependency | JsBarcode 3.12.1 is bundled locally with its MIT license. Code 128 generation runs in the browser. |
| Backend and deployment | Static GitHub Pages. The repository contains no PHP/API implementation, database, server authentication, payment integration, service worker or durable transaction store. |
| Test packaging | A native Node test runner plus pinned Playwright dependency is tracked in `package.json`, `package-lock.json` and `tests/phase1.test.cjs`. No custom Actions workflow is introduced. |

The global-function replacement approach makes load order significant. Some older implementations and placeholder copy remain in `app.js` while active behavior comes from `v11.js`. Source searches alone can therefore overstate functionality. Identity, branch names and shell configuration now come from `config.js`. Existing business implementations remain in the original scripts.

### Reproducible sample baseline

A fresh browser on the audit date contained 9 product styles, 22 variants, 9 categories, 4 sample customers and 746 sale/refund records. Current available stock totaled 334 units, with a catalog-cost valuation of BDT 307,510. The selected November sample expense total was BDT 144,000, comprising New Market BDT 82,000 and Dakbangla BDT 62,000.

These values describe invented data generated by the application. The date distribution changes as the rolling dataset advances. Stock valuation uses the current catalog cost rather than receipt-derived average cost.

## Phase-by-phase requirements checklist

| Master phase | Status | Completed components already present | Partial or pending requirements |
| --- | --- | --- | --- |
| **0 — Baseline / audit / safety** | **Completed audit** | Full specification read, repository and live assets inspected, architecture mapped, existing harnesses run, four viewport sizes checked, deployment/authentication inspected, findings documented here. | This documentation is the sole repository change. Publication evidence for its commit is reported in the phase completion response and GitHub Pages run history. |
| **1 — Branding, design system, shell and navigation** | **Completed demo scope** | Central identity/design tokens, grouped navigation, product tabs, four viewport sizes, persistent header scope and title badges, assigned Manager operations, Owner-only financial routes/exports, accessible dialogs and repository tests. | Production authorization, account-management UI and a comprehensive independent accessibility audit remain later-phase work. |
| **2 — Product master, categories, variants, SKU and barcode** | **Partial** | Owner category create/rename/archive/reorder; both roles can add categories inline. Product name/description, one optional image, sizes/colors, costs/prices and VAT metadata. Multi-variant auto/manual SKUs, duplicate checks, historical SKU aliases, stable IDs, barcode lookup, matrices, print/reprint and all three current save actions. | Catalog-only Save conflicts with current initial-stock creation. Save & Receive hook, subcategories, patterns, multiple images, full product editing/status, branch availability management, bulk price/branch actions, safe deletion and product import/export. Barcode values are generated internally; manual barcode entry is absent. |
| **3 — Supplier purchases, receiving and cost basis** | **Partial** | Single-variant receiving increases only the selected branch, records a quantity movement and adds an aggregate supplier receipt row. Product creation can record initial stock movements. | Item-linked multi-product purchase invoices, actual per-line purchase costs, discounts/VAT/landing costs, supplier master, unique supplier invoice checks, payments/dues, returns, cost-bearing opening imports and branch-specific moving weighted-average cost. |
| **4 — Fast POS, invoices, discounts and returns** | **Partial** | Barcode plus Enter, repeated scans, scanner focus protection, stock limits, search, cart quantities, invoice flat/percentage discount, allocated line discount rounding, single payment-method selection, stock reduction, sample receipt and browser printing. | Tax calculation, line discounts, campaigns/priority rules, Cash Box/custom accounts, split tender, credit/dues, customer linkage, invoice history/reprint, linked returns/exchanges, defective disposition, audit simulation and explicit thermal/A4 templates. Optional holds/imports are absent. |
| **5 — Transfers, dead stock, defects and adjustments** | **Partial** | Newly created single-variant transfers dispatch units from source, hold an in-transit record and allow destination receipt. Transfers create no sales revenue. | Complete seeded-transfer linkage, cost-basis transfer, freight/challan, multiple items, discrepancy handling, dead-stock thresholds/ages, sellable versus quarantine stock, repair/recovery/write-off and auditable adjustments. |
| **6 — Expenses, funds, cash flow and dues** | **Partial** | Monthly expense list and Add popup, positive-amount validation, mandatory branch assignment, branch totals and Combined summation. | Today/custom ranges and category filters, expense editing, managed categories, receipt attachment, account/payment status, lock/reversal policies, Cash Box per branch, named accounts, deposits/withdrawals/transfers, statements, collections, dues and financial-position/cash-flow reconciliation. |
| **7 — Financial analytics, reports and exports** | **Partial** | Date-specific seven-KPI overview, hourly chart, item/category/payment breakdowns; separate monthly tab, daily revenue/profit chart, product/category performance, branch comparison, gross profit less expenses, current buying-value estimate and generic CSV export. | Full Home KPI depth, inventory selling value/potential profit, historical opening/closing valuation, advanced P&L adjustments, six profit subviews, all report types below, consistent view-specific exports, custom date ranges, Excel/PDF and report print layouts. Allocated contribution estimation is absent from the active screen. |
| **8 — Contacts, marketing, settings and demo hardening** | **Partial** | Four sample customers, branch/month activity and consent flags; offer-text copy modal; role-preview settings and demo notices. Optional product image is supported. | Editable customer/supplier masters, groups/birthdays, consented recipient export and WhatsApp sharing, SMS template/group/history UI, comprehensive settings and the complete client journey through purchases, returns, funds and P&L. |
| **9 — Client sign-off and production technical design** | **Pending** | README mentions a possible PHP/Laravel, MySQL/MariaDB and Vue direction. | Written sign-off, confirmed cPanel capabilities and approved schemas, security, ledger, hosting, backup, provider and rollout design. The README direction is preliminary. |
| **10 — Production backend foundations** | **Pending** | No production backend components are implemented. | Approved PHP 8.2+/database foundation, secure sessions, Owner/Manager authorization, APIs, migrations, audit and backups. |
| **11 — Production operations and accounting** | **Pending** | Browser simulations provide interaction examples. | Atomic receiving/sales/returns/funds, average-cost accounting, server calculations, idempotency, concurrency and staging reconciliation/security tests. |
| **12 — Go live and stabilization** | **Pending** | The public sample demo is deployed. | Approved opening-data migration, cPanel/DNS/SSL rollout, hardware acceptance, training, monitoring, backups and operational sign-off. |
| **13 — Public e-commerce** | **Pending** | No public shopping or online ordering workflow exists. | Separate approval followed by catalog, stock reservations, checkout/payment/delivery rules, fulfilment, refunds and POS reconciliation. |

## Business and finance policy comparison

| Master requirement | Current finding | Status / relevant phase |
| --- | --- | --- |
| Exactly Owner and Manager | Two preview profiles exist. Manager assignment is configured as New Market; Owner selects Combined or either branch. Account creation/assignment is absent. | Partial, 1 / 8 / 10 |
| Branch context on every surface | Header scope is persistent and active lists/aggregations generally follow it. Product/category definitions are shared company data. Page titles now display their branch scope. | Completed demo rule, 1 |
| Owner-only financial/security defaults | Manager financial routes, analytic columns and report exports are guarded in the UI. The header explicitly identifies the publicly switchable role simulation. Production authorization remains pending. | Completed demo rule, 1; backend pending, 10 |
| Branch-only expense ownership | Every active sample expense has branch 1 or 2. Combined equals the two branches added together. No overhead split is applied. | Completed demo rule, retain in 6 / 7 |
| Catalog-only Save; linked Save & Receive | Saving a product with initial quantity creates stock and a movement without creating a purchase document. The current buttons are Save, Save & Add Another and Save & Print Barcode. | Conflict, 2 / 3 |
| Supplier quantities and costs tied to purchases | Receiving rows contain `id`, `supplier`, `branch`, `items` and `total`. They lack variant lines, invoice references, payment state and cost snapshots. Stock movements contain a variant but no receipt ID. | Gap, 3 |
| Per-variant, per-branch moving-average cost | One `product.cost` supplies both branches. Receiving accepts quantity and supplier, with no actual unit-cost input or average-cost update. Transfers carry quantity only. | Pending, 3 / 5 |
| Sales/discount/expense treatment | Sale lines capture price, cost, SKU/barcode and discount. Net revenue and gross profit reverse seeded refunds; invoice discount is allocated once. Operating profit equals sample gross profit less branch expenses. Receiving totals are excluded from this P&L calculation. | Partial working baseline, 4 / 7 |
| VAT separation | Inclusive, Exclusive and Exempt are catalog metadata. There are no configurable rates, tax-line calculations or separate tax-inclusive/exclusive invoice amounts. Reports explicitly assume net-of-VAT sample prices. | Pending financial behavior, 4 / 7 / 8 |
| Buying value, selling value and potential profit | Current quantity multiplied by catalog cost is displayed. Selling value, potential profit, defective value and historical opening/closing valuation are absent. | Partial, 5 / 7 |
| Return/exchange snapshots | Seeded negative refund records exist, with no original-invoice link or executable return/exchange/disposition workflow. Their presence does not verify a return engine. | Partial data illustration, 4 / 5 |
| Funds/payables/receivables | Payment-method names label sales. Actual receipts/outflows, balances, supplier/customer dues, internal fund transfers and Cash Box accounts are absent. | Pending, 3 / 4 / 6 |
| Stock classes | Available branch quantities and a transfer list exist. No explicit defective, written-off or cost-valued in-transit ledger exists. | Partial, 5 |
| Allocation of branch overhead to products | Expense summation works. A period/revenue-based allocated-contribution report is absent. An older illustrative contribution panel in `app.js` is replaced by the active monthly screen. | Pending, 7 |
| Currency, timezone and rounding | BDT formatting and Asia/Dhaka default date/hour work. Report and checkout rounding use JavaScript numbers with a two-decimal helper and invoice remainder allocation. | Completed demo convention; production decimal storage remains pending |
| Audit, reversals and locked periods | No general mutation audit trail, transaction lock, financial closure or completed-document reversal framework exists. | Pending, 3–11 |
| Durable security and integrity | All state and authorization checks run in the browser. There is no server enforcement, transaction isolation, persistent accounting or multi-user protection. | Pending, 9–12 |

These gaps are recorded for later phases. This audit preserves the branch expense correction and current financial behavior.

## Required report inventory

Owner sales/financial exports produce the selected-period summary and sales lines. Expense and contact exports now use their corresponding visible datasets. Dedicated advanced report views require further implementation.

| Required report | Current coverage | Status |
| --- | --- | --- |
| Profit/Loss | Monthly revenue, gross profit, expenses and operating profit; no complete opening/closing stock or adjustment statement. | Partial |
| Product Sell | Daily/monthly item and product tables. | Partial |
| Sales Representative | No agent role or representative report. Master marks this optional/inactive where inapplicable. | Pending |
| Register | No operational register or money-account register. | Pending |
| Expense | Monthly list, total and scoped expense-line CSV. | Partial |
| Due Payment | No payable settlement workflow/report. | Pending |
| Due Collection | No customer collection workflow/report. | Pending |
| Sell Payment | Daily payment-method revenue breakdown, without received-payment or fund ledger. | Partial |
| Purchase Payment | No purchase payment ledger. | Pending |
| Discount | Aggregate sales discount KPI and sale-line discount values in CSV. | Partial |
| Product Purchase | Aggregate receiving rows lack product-linked purchase lines. | Pending |
| Purchase & Sale | No reconciled combined purchase/sales report. | Pending |
| Items | Catalog, inventory and sold-variant tables provide building blocks. | Partial |
| Trending Products | Monthly best-selling products; no trend comparison or custom-period report. | Partial |
| Stock Adjustment | In-memory movement data exists; no adjustment screen/report. | Pending |
| Stock Alert | Active inventory lacks configurable alert thresholds and a dedicated alert report. | Pending |
| Stock | Available quantity, matrices and current catalog-cost value; no full stock-class/cost ledger report. | Partial |
| Customer Groups | No groups or group reporting. | Pending |
| Supplier & Customer | Sample customer activity and supplier names in receiving; no combined balance/master report. | Partial |
| Tax | No calculated tax report. | Pending |
| Activity Log | No general audit-log screen/report. | Pending |

Required profit subviews by Product and Category have table building blocks. Invoice, Date, Customer and Day-of-Week profit subviews are pending. The daily/monthly charts provide some date aggregation. CSV scope is branch/date filtered for its underlying dataset. Financial, expense and contact exports are Owner-preview-only. Native Excel, generated PDF, dedicated report printing and pagination are pending. Browser receipt printing and barcode printing are working separate flows.

## Confirmed unfinished interactions and acceptance gaps

1. **Save creates stock without a supplier purchase.** A one-variant product saved with two initial units added two branch units and zero purchase documents. Reproduced through the UI.
2. **Resolved in Phase 1 — existing expense/contact export scope.** CSVs now contain the visible branch/month expense or contact rows. Advanced report exports remain Phase 7.
3. **Resolved in Phase 1 — financial preview permission.** Manager cannot enter monthly financial analytics or Reports, see their analytic columns or use report exports. This remains browser-only simulation.
4. **Seeded transfer cannot complete receiving.** Seeded in-transit transfer `TR-018` lacks `productId`; the inbound receiving action filters for that field. Newly created transfers passed dispatch/receive tests.
5. **Resolved in Phase 1 — affected dialog drafts.** Escape, overlay, Cancel and guarded dialog navigation ask before discarding edited fields. Keep editing preserves the draft. Focus traps, dialog names, inert background and focus restoration are tested.
6. **Checkout does not link a real customer record.** The optional phone input exists, while newly generated sales use `customerId: null` and clear the typed value. Seeded customer activity does not establish a working customer-assignment flow.
7. **Operational records have different completeness levels.** Seeded purchase totals and transfers are illustrative aggregate rows. Initial stock, receipts and transfers cannot be reconciled into supplier balances or a complete cost ledger.
8. **Date defaults are session-bound.** The Dhaka date is computed once when the page loads. An open tab does not automatically roll to the next business date at midnight.
9. **Settings are previews.** Role preview buttons work. Manager assignments, company/branch editing, VAT/receipt/printer/account/financial-year/threshold settings and audit controls remain pending.
10. **Marketing is a copy-only interaction.** The offer modal does not select consented recipients, create a WhatsApp share, send SMS or maintain delivery history.

## Tests and usability verification

### Existing tests run

Phase 0 reran six workspace harnesses. Phase 1 now adds the reproducible repository suite described below. The historical harness results are retained as baseline evidence.

| Check | Result | Coverage and limit |
| --- | --- | --- |
| `node --check app.js` and `node --check v11.js` | PASS | Both application scripts parse. |
| `test-v12-regression.cjs` | PASS | All screens, branch persistence, Manager scope, dataset reconciliation, scan errors/repeats/limits, discount checkout, receipt, expense/receiving entries, category actions, labels, CSV and mobile POS. |
| `v12-test-extra.cjs` | PASS | Transfer dispatch/receive, keyboard HID stream outside editable fields, month changes, CSV branch scope and Code 128 start/stop encoding. |
| `v12-test-expenses.cjs` | PASS | Each expense belongs to a branch, amounts retained, Combined summation, CSV totals and Manager isolation. |
| `test-v12.cjs` | PASS | Owner/Manager/mobile creation, inline categories, multiple variants, auto/manual SKU uniqueness, initial stock, image/description, save actions, labels, historical SKU edits, brand/CSV and sticky header. |
| `test-v12-isolation.cjs` | PASS | Same SKU at two branches with independent stock, category rename/reorder stability, duplicate combinations and creation from filtered inventory. |
| `test-palette.cjs` | PASS | Palette tokens, all screen routes, charts, forms, barcode-cart smoke test and responsive rendering. |
| Additional audit probes | PASS as observations | Captured the reproducible gaps above, including Save stock creation, missing receipt fields, export mismatch, Manager financial access and unsaved-draft loss. Their observed behavior fails the corresponding future acceptance requirements. |
| Live assets | PASS | HTTP 200 for the live page, scripts, CSS and barcode library. JavaScript/CSS/library bytes matched the inspected baseline. |
| Phase 0 repository scope | Documentation only | Preserved in its audit commit. Phase 1 changes are listed above. |

### Phase 1 automated results

`npm test` passes **11 tests** with Node, Playwright and Chromium.

- Four viewport cases cover 1440×1000, 1024×768, 390×844 and 360×800. All working routes and contextual tabs open without page overflow or browser exceptions. The mobile drawer supports keyboard dismissal and restores focus.
- Owner branch/date filters, Combined reconciliation and financial, expense and contact CSVs match their selected scope.
- Manager routes and exports are checked through both visible controls and attempted direct shell calls. Assigned-branch scope is restored. Operational forms and labels remain accessible.
- Dirty drafts, confirmation focus, Tab/Shift+Tab, Escape, overlay dismissal, focus restoration and navigation protection pass.
- Barcode repeat/unknown/quantity-limit behavior, typing in checkout fields, scope-change cart confirmation, discount checkout and receipt print media pass.
- Existing product variations, company-wide SKU duplication checks, Manager creation, receiving, transfer receipt, expense isolation and barcode print media pass.
- Central configuration checks and text contrast checks pass. Tests use the existing sample finance model and preserve its baseline quantities.

Run `npm ci`, `npx playwright install chromium` and `npm test`. `CHROMIUM_PATH` can select an installed browser. The test server starts automatically under a project subpath. No application build step is required. Physical hardware and production security remain outside these browser checks.

### Desktop and mobile

At **1440×1000**, **1024×768**, **390×844** and **360×800**, all twelve navigation entries opened, product entry was usable and no page-wide horizontal overflow or JavaScript page errors occurred. Tables/charts use their internal horizontal scrolling. Separate existing tests exercised mobile product creation and POS barcode entry.

These checks establish the tested demo paths. They do not establish a full accessibility audit, large-dataset performance, every browser/device, persistent data safety or later-phase acceptance. Physical USB scanners, receipt printers and label printers were unavailable. Keyboard simulation, SVG encoding, browser print media and PDF label output were exercised by existing tests. Actual hardware acceptance remains pending.

### Financial regression scope

The harnesses reconciled Combined revenue, profit, discounts, refunds, invoice counts and sold units to the sum of both branches. Expense totals reconciled by branch. Opening quantities plus movements less sample net sold units reconciled to current variant stock. Checkout line rounding matched the invoice total. Repeated barcode scans respected available branch quantity, and checkout updated stock once in the exercised flow.

These tests verify the current simplified sample model. Average-cost calculations, original-invoice returns, VAT, funds, dues and general accounting reconciliation remain unimplemented.

## GitHub Pages and publication

- Repository default working branch is `main`.
- Pages configuration is **Deploy from a branch → main → /(root)**. GitHub API reports `build_type: legacy`.
- GitHub's managed `pages build and deployment` run builds with Jekyll and publishes the static files. No custom `.github/workflows/pages.yml` is tracked.
- The inspected baseline build succeeded for `3bbf38f42a2d0a23b1bf78424ff885e047c9377e`, run `45156494426`.
- GitHub authenticated as `swapnilmahfuz`. The selected ChatGPT/Codex App installation reported contents, actions and workflows write permissions.
- Authorized publishing uses the previously successful command `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin main`. Credential values are kept out of output.
- Phase 0 published its documentation commit. Phase 1 publishes shell/configuration, existing screen integration, tests and documentation through the same branch-based Pages setup. The final Phase 1 commit, managed build result and live-asset comparison are reported in the phase completion response.

## Phase boundary and decisions for subsequent work

Phase 0 established the baseline. Phase 1 completes the authorized app-shell scope. Existing later-phase business building blocks remain part of V1.2.

The master document already resolves the important business rules for later implementation. Product Save becomes catalog-only, receiving links supplier purchases, costs use per-branch moving weighted averages, expenses remain wholly branch-owned and VAT is separated from revenue. Their implementation belongs to the designated later phases.

Approval to execute Phase 2 is the next required instruction. Tax rates/statutory formats, optional sales-representative applicability and production hosting/providers/sign-off remain business decisions for their scheduled phases.

**STOP after Phase 1. Phase 2 requires explicit user authorization.**
