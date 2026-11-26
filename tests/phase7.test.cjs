const { test, assert, session, go, fs } = require("./browser.cjs");
const { execFileSync } = require("node:child_process");
async function fixture(page) {
  await page.locator("#branch").selectOption("1");
  return page.evaluate(() => {
    retail.rate = 10;
    function add(name, price, vat, b, qty, cost) {
      const p = {
        ...products[0],
        id: nextVariantId(),
        name,
        sku: "QA-" + name,
        barcode: barcodeAllocator()(),
        price,
        vat,
        b1: 0,
        b2: 0,
        values: { 1: 0, 2: 0 },
      };
      products.push(p);
      moveStock(p, b, qty, qty * cost * 100, "Opening stock", "TEST-OPEN");
      return p;
    }
    const a = add("Shirt", 110, "included", 1, 10, 40),
      b = add("Jacket", 60, "exclusive", 1, 5, 20),
      d = add("Polo", 200, "exempt", 1, 1, 100);
    const sale = postRetailSale({
      token: "S1",
      branch: 1,
      cart: [{ id: a.id, qty: 2, manual: 5, manualType: "flat" }],
      discount: 12,
      type: "flat",
      phone: "0123",
      tenders: [
        { account: "Cash Box", value: 10000 },
        { account: "Card", value: 9800 },
      ],
    });
    postReturn({
      token: "R1",
      s: sale,
      choices: [{ id: a.id, qty: 1, disposition: "resellable" }],
      reason: "Exchange",
      account: "Cash Box",
      replacement: [{ id: b.id, qty: 1 }],
    });
    const exp = (ref, branch, total) =>
      writeExpense({
        ref,
        branch,
        date: today,
        cat: "Other",
        title: "Freight",
        total,
        paid: 0,
        account: "Cash Box",
      });
    exp("EX1", 1, 1500);
    correctExpense(exp("VOID", 1, 800), "REV", "Duplicate");
    movement(
      "OI",
      fundAccount(1, "Cash Box"),
      "Deposit",
      700,
      "Other income",
      "Recorded income",
    );
    movement(
      "TR",
      fundAccount(1, "Cash Box"),
      "Transfer",
      3000,
      "Internal transfer",
      "",
      fundAccount(2, "Cash Box"),
    );
    postCount({
      token: "COUNT",
      branch: 1,
      id: a.id,
      previous: a.b1,
      corrected: a.b1 + 1,
      reason: "Stock excess",
      notes: "Recount",
    });
    const i = saveInvoice(
      {
        id: "TEST-PO",
        branch: 1,
        supplier: suppliers[0].id,
        external: "Supplier-7",
        lines: [{ productId: d.id, qty: 1, unit: 200, discount: 0 }],
        discount: 0,
        landing: 0,
        tax: 0,
        paid: 50,
      },
      false,
    );
    returnGoods(i, [1]);
    payment(i, -5000);
    state.branch = "2";
    const c = add("Jeans", 50, "exempt", 2, 5, 30);
    const sale2 = postRetailSale({
      token: "S2",
      branch: 2,
      cart: [{ id: c.id, qty: 1 }],
      phone: "0456",
      tenders: [{ account: "Cash Box", value: 2000 }],
      allowDue: true,
    });
    collectDue(sale2, 1000, "Card");
    exp("EX2", 2, 500);
    quarantine({
      token: "Q",
      branch: 2,
      id: c.id,
      qty: 1,
      reason: "Damaged",
      notes: "",
    });
    resolveDefect(retail.defects.at(-1), {
      token: "LOSS",
      kind: "Write off",
      qty: 1,
      recovery: 5,
    });
    a.buyingPrice = 999;
    a.price = 999;
    state.branch = "all";
    ownerBranch = "all";
    Object.assign(reportState, {
      linked: true,
      from: today,
      to: today,
      preset: "Today",
      tab: "Products",
      report: "Profit/Loss",
    });
    render();
    return sale.id;
  });
}
test("linked snapshots, P&L bridge, overhead, six breakdowns and branch reconciliation", async (t) => {
  const page = await session(t);
  const invoice = await fixture(page);
  const data = await page.evaluate(() => {
    const f = reportState,
      c = reportingContext(f, "all"),
      bal = reportBalances(c);
    return {
      p: periodResult(c),
      branch: [1, 2].map((b) => periodResult(reportingContext(f, String(b)))),
      dues: [bal.customer, bal.supplier, bal.expenseLiability],
      totals: profitTabs.map((tab) => {
        const m = buildReport({ ...f, tab }, "all");
        return [
          m.totals[m.headers.indexOf("$Net sales")],
          m.totals[m.headers.indexOf("$COGS")],
          m.totals[m.headers.indexOf("$Gross profit")],
        ];
      }),
      allocation: groupedProfit(c, "Products")
        .groups.map((g) => [g.label, g.allocation])
        .sort(),
      payments: buildReport({ ...f, report: "Sell Payment" })
        .rows.map((r) => r.v[6] - r.v[7])
        .sort((a, b) => a - b),
      stock: buildReport({ ...f, report: "Stock" })
        .rows.filter(
          (r) => r.v[1] === "QA-Jeans" && r.v[0] === branchLabel(2),
        )[0]
        .v.slice(3, 8),
    };
  });
  assert.deepEqual(data.p, {
    gross: 33000,
    discount: 2200,
    embedded: 1800,
    returns: 9000,
    net: 20000,
    cost: 9000,
    profit: 11000,
    expense: 2000,
    income: 1200,
    loss: 3000,
    adjustments: 9000,
    variance: 5000,
    operating: 16200,
  });
  assert.deepEqual(data.dues, [2000, 0, 2000]);
  for (const [k, v] of Object.entries(data.p))
    assert.equal(data.branch[0][k] + data.branch[1][k], v, k);
  assert.deepEqual(data.totals, Array(6).fill([20000, 9000, 11000]));
  assert.deepEqual(data.allocation, [
    ["Jacket", 600],
    ["Jeans", 500],
    ["Shirt", 900],
  ]);
  assert.deepEqual(data.payments, [-3300, 1000, 2000, 9800, 10000]);
  assert.deepEqual(data.stock, [3, 0, 0, 3000, 9000]);
  await go(page, "finance");
  await page.locator("[data-profit-tab=Invoice]").click();
  const row = page.locator("tbody tr").filter({ hasText: invoice }).first();
  await row.locator("[data-drill]").click();
  assert.match(await page.locator(".modal").innerText(), new RegExp(invoice));
});
test("CSV, XLSX, PDF and print contain the selected view and independently expected amounts", async (t) => {
  const p = await session(t);
  await fixture(p);
  await go(p, "finance");
  assert.match(await p.locator(".report-metrics").first().innerText(), /৳162/);
  for (const fmt of ["csv", "xlsx", "pdf"]) {
    if (!(await p.locator(".report-download").evaluate((el) => el.open)))
      await p.locator(".report-download summary").click();
    const promise = p.waitForEvent("download", { timeout: 30000 });
    await p.locator("[data-format=" + fmt + "]").click();
    const dl = await promise,
      file = await dl.path();
    assert.match(
      dl.suggestedFilename(),
      new RegExp("Products.*\\." + fmt + "$"),
    );
    if (fmt === "csv") {
      const csv = fs.readFileSync(file, "utf8");
      assert.match(csv, /"Net operating profit","162"/);
      assert.match(csv, /"Net sales excluding VAT","200"/);
    }
    if (fmt === "xlsx") {
      const values = await p.evaluate(async (bytes) => {
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(
          Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0)),
        );
        const rows = book.worksheets[0].getSheetValues().filter(Boolean);
        return rows.find((r) => r[1] === "Net operating profit").slice(1, 3);
      }, fs.readFileSync(file).toString("base64"));
      assert.deepEqual(values, ["Net operating profit", 162]);
    }
    if (fmt === "pdf") {
      const text = execFileSync("pdftotext", ["-layout", file, "-"], {
        encoding: "utf8",
      });
      assert.match(text, /Net operating profit\s+BDT 162\.00/);
      assert.match(text, /QA-Shirt/);
    }
  }
  await p.evaluate(() => {
    window.print = () => {
      window.printedReport =
        document.querySelector("#analytics-print").textContent;
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await p.locator("[data-format=print]").click();
  assert.match(
    await p.evaluate(() => window.printedReport),
    /Net operating profitBDT 162.00/,
  );
});
for (const width of [1440, 1024, 390, 360])
  test(
    "21 report entries, date ranges, pagination and scoped access at " + width,
    async (t) => {
      const p = await session(t, { width, height: 900 });
      await go(p, "finance");
      const names = await p.locator("#report-choice option").allTextContents();
      assert.equal(names.length, 21);
      for (const name of names) {
        await p.locator("#report-choice").selectOption({ label: name });
        assert.ok(await p.locator(".report-download").isVisible());
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        assert.ok((await p.locator("[data-drill]").count()) <= 30);
      }
      assert.deepEqual(
        await p.evaluate(() => [
          reportDates("This Week", "2026-01-01"),
          reportDates("Last Month", "2026-01-01"),
          reportDates("Yesterday", "2024-03-01"),
        ]),
        [
          ["2025-12-29", "2026-01-01"],
          ["2025-12-01", "2025-12-31"],
          ["2024-02-29", "2024-02-29"],
        ],
      );
      await p.locator("#report-choice").selectOption("Sales Representative");
      assert.match(
        await p.locator("#content").innerText(),
        /No matching records/,
      );
      await p.locator("#role").selectOption("manager");
      await go(p, "operationalReports");
      const opts = await p.locator("#report-choice option").allTextContents();
      assert.deepEqual(
        opts.sort(),
        [
          "Items",
          "Stock Alert",
          "Product Purchase",
          "Due Collection",
          "Stock Adjustment",
        ].sort(),
      );
      assert.ok(
        await p.evaluate(() => {
          try {
            buildReport({ ...reportState, report: "Profit/Loss" });
            return false;
          } catch {
            return true;
          }
        }),
      );
    },
  );

test("as-of stock, cash, source dates and payable settlement classifications", async (t) => {
  const page = await session(t);
  await fixture(page);
  const r = await page.evaluate(() => {
    const f = { ...reportState, linked: false };
    const report = (name, over = {}) =>
      buildReport({ ...f, report: name, ...over }, "all");
    const register = Object.fromEntries(report("Register").summary),
      stmt = report("Purchase Payment"),
      d = state.expenses.find((e) => e.ref === "EX2");
    state.branch = "2";
    payExpense(d, 200, "Cash Box", "EX-PAY");
    state.branch = "all";
    const due = report("Due Payment");
    const stock = report("Stock"),
      v = stock.rows.filter((r) => r.v[1] === "QA-Polo").map((r) => r.v[10]);
    const y = dayShift(today, -1),
      before = report("Stock", { from: y, to: y });
    return {
      internal: register["$Net internal transfers"],
      payment: stmt.totals.slice(-3),
      due: due.totals.slice(-3),
      qty: rptSum(reportingContext(f, "all").lines, "qty"),
      before: before.rows.some((r) => r.v[1] === "QA-Polo"),
      stock: v.reduce((a, b) => a + b, 0),
      variance: report("Stock Adjustment").totals.at(-2),
      empties: ["Sales Representative", "Customer Groups"].map(
        (n) => report(n).rows.length,
      ),
      tax: report("Tax").totals.slice(-4),
      expense: report("Expense")
        .rows.find((r) => r.v[4] === "EX2")
        .v.slice(-3),
    };
  });
  assert.equal(r.internal, 0);
  assert.deepEqual(r.payment, [5000, 5000, 20000]);
  assert.deepEqual(r.due, [0, 200, 0]);
  assert.equal(r.before, false);
  assert.equal(r.stock, 15000);
  assert.equal(r.variance, 4000);
  assert.deepEqual(r.empties, [0, 0]);
  assert.deepEqual(r.tax, [15000, 5000, 1500, 0]);
  assert.deepEqual(r.expense, ["Partial", 200, 300]);
});
test("negative-only period, unidentified customer, empty range and spreadsheet-safe full export", async (t) => {
  const page = await session(t);
  await fixture(page);
  const r = await page.evaluate(() => {
    const f = { ...reportState, linked: true };
    for (const s of retail.sales) s.date = dayShift(today, -1);
    const ctx = reportingContext(f, "1"),
      m = profitReport(ctx, "Products");
    const original = ledger.find((s) => s.lines[0]?.net == null);
    original.lines[0].productName = "  =sample";
    const all = {
      ...f,
      from: firstSeedDay,
      linked: false,
      report: "Profit/Loss",
      tab: "Invoice",
    };
    const full = buildReport(all, "all");
    return {
      p: periodResult(ctx),
      unallocated: groupedProfit(ctx, "Products").unallocated,
      margin: m.summary.find((x) => x[0] === "%Gross profit margin")[1],
      rows: full.rows.length,
      exported: exportMatrix(full).some(
        (r) => r[0].v === full.rows.at(-1).v[0],
      ),
      csv: safeReportCsv("\t=sample"),
      empty: buildReport(
        { ...all, from: "2000-01-01", to: "2000-01-02" },
        "all",
      ).rows.length,
    };
  });
  assert.equal(r.p.net, -9000);
  assert.equal(r.unallocated, 1500);
  assert.equal(r.margin, null);
  assert.ok(r.rows > 700 && r.exported);
  assert.equal(r.csv, '"\'\t=sample"');
  assert.equal(r.empty, 0);
});

test("paginated invoice download includes the last matching document and empty PDFs retain their report identity", async (t) => {
  const page = await session(t);
  await go(page, "finance");
  await page.locator("[data-profit-tab=Invoice]").click();
  const last = await page.evaluate(() => visibleReport.rows.at(-1).ref);
  assert.ok(await page.evaluate(() => visibleReport.rows.length > 30));
  await page.locator(".report-download summary").click();
  let dl = page.waitForEvent("download");
  await page.locator("[data-format=csv]").click();
  let file = await (await dl).path();
  assert.ok(fs.readFileSync(file, "utf8").includes(last));
  await page.locator("#report-choice").selectOption("Customer Groups");
  await page.locator(".report-download summary").click();
  dl = page.waitForEvent("download");
  await page.locator("[data-format=pdf]").click();
  file = await (await dl).path();
  const text = execFileSync("pdftotext", ["-layout", file, "-"], {
    encoding: "utf8",
  });
  assert.match(text, /Customer Groups/);
  assert.match(text, /Matching rows\s+0/);
});
