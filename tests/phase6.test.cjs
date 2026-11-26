const { test, assert, session, go, fs } = require("./browser.cjs");
async function branchSession(t, width = 1440) {
  const p = await session(t, { width, height: 900 });
  await p.locator("#branch").selectOption("1");
  return p;
}
test("split ৳2,000 invoice, later collection, duplicate rejection and internal transfer", async (t) => {
  const page = await branchSession(t);
  const r = await page.evaluate(() => {
    const b = openFund(1, "bKash Personal", "Wallet", 0),
      bank = openFund(1, "City Bank", "Bank", 0),
      cash = fundAccount(1, "Cash Box");
    const p = products[0];
    p.price = 2000;
    retail.rate = 0;
    const before = ledger.length,
      cart = [{ id: p.id, qty: 1 }],
      s = postRetailSale({
        token: "critical",
        branch: 1,
        cart,
        phone: "01700000001",
        allowDue: true,
        tenders: [
          { account: cash.name, value: 100000 },
          { account: b.name, value: 50000 },
        ],
      });
    const initial = [
      s.lines[0].revenue,
      dueOn(s),
      fundBalance(cash),
      fundBalance(b),
      fundBalance(bank),
    ];
    const earned = profitFigures().profit;
    collectDue(s, 50000, bank.name, "receipt");
    let duplicated = false;
    try {
      collectDue(s, 50000, bank.name, "receipt");
    } catch {
      duplicated = true;
    }
    const beforeTransfer = fundRange("all");
    movement(
      "transfer",
      cash,
      "Transfer",
      100000,
      "Internal transfer",
      "Deposit cash",
      bank,
    );
    const after = fundRange("all");
    return {
      initial,
      duplicate: duplicated,
      final: [dueOn(s), fundBalance(cash), fundBalance(b), fundBalance(bank)],
      collected: beforeTransfer.rows
        .filter((e) => e.kind === "Due collection")
        .map((e) => e.value),
      profitChange: profitFigures().profit - earned,
      before: beforeTransfer.closing,
      after: after.closing,
      flows: cashSummary(after).map((x) => x[1]),
      sales: ledger.length - before,
      profit: otherIncome(today, "all"),
    };
  });
  assert.deepEqual(r, {
    initial: [2000, 50000, 100000, 50000, 0],
    duplicate: true,
    final: [0, 0, 50000, 150000],
    collected: [50000],
    profitChange: 0,
    before: 200000,
    after: 200000,
    flows: [0, 200000, 0, 0, 0, 200000],
    sales: 1,
    profit: 0,
  });
});
test("custom accounts, stable IDs, scoped authorization, transfers, correction, reversal and duplicate prevention", async (t) => {
  const p = await branchSession(t);
  const r = await p.evaluate(() => {
    const a = openFund(1, "Vault", "Savings", 500),
      dest = fundAccount(2, "Cash Box");
    for (let i = 0; i < 70; i++) openFund(1, "Wallet " + i, "", 0);
    movement("CAP", a, "Deposit", 100000, "Owner capital", "Initial funding");
    movement("DRAW", a, "Withdrawal", 20000, "Owner drawing", "");
    movement("MOVE", a, "Transfer", 40000, "Internal transfer", "", dest);
    movement("FIX", a, "Correction", -100, "Balance correction", "Count error");
    const before = [fundBalance(a), fundBalance(dest)];
    const move = fundBook.entries.find((e) => e.ref === "MOVE");
    reverseMovement(move, "REV1", "Wrong branch");
    const fails = (fn) => {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    };
    const duplicate = fails(() => reverseMovement(move, "REV2", "Again"));
    editFund(a, "Shop vault", "Savings");
    changeFund(a);
    const blocked = fails(() => fundAccount(1, a.name));
    state.role = "manager";
    return [
      before,
      [fundBalance(a), fundBalance(dest)],
      fundRange("1").closing,
      duplicate,
      blocked,
      fails(() => openFund(1, "New", "", 0)),
      fails(() =>
        movement("M", a, "Transfer", 100, "Internal transfer", "", dest),
      ),
      fails(() => fundRange("all")),
      fundBook.audit.filter((e) => e.ref === a.id).length,
      cashSummary(fundRange("1")).map((x) => x[1]),
      fundBook.accounts.length,
    ];
  });
  assert.deepEqual(r, [
    [89900, 40000],
    [129900, 0],
    129900,
    true,
    true,
    true,
    true,
    true,
    3,
    [50000, 100000, 20000, 0, -100, 129900],
    79,
  ]);
});
test("supplier settlements, credit, refund and reversible partial payments preserve inventory and P&L", async (t) => {
  const page = await branchSession(t);
  const result = await page.evaluate(() => {
    const a = openFund(1, "City Bank", "Bank", 5000),
      p = products[0],
      expenses = expenseAmount(today),
      sold = ledger.length;
    const i = saveInvoice(
      {
        id: "PO-TEST",
        branch: 1,
        supplier: suppliers[0].id,
        external: "SUP-123",
        discount: 0,
        tax: 0,
        landing: 0,
        paid: 100,
        account: a.name,
        lines: [{ productId: p.id, qty: 4, unit: 100, discount: 0 }],
      },
      false,
    );
    payment(i, 10000, a.name, "partial");
    let repeat = false;
    try {
      payment(i, 10000, a.name, "partial");
    } catch {
      repeat = true;
    }
    const entry = fundBook.entries.find((e) => e.ref === "partial");
    reverseSettlement(entry, "reverse", "Incorrect payment");
    const reopened = balance(i);
    payment(i, 30000, a.name, "settle");
    returnGoods(i, [2]);
    const due = balance(i);
    payment(i, due, a.name, "refund");
    return [
      reopened,
      due,
      balance(i),
      fundBalance(a),
      repeat,
      expenseAmount(today) - expenses,
      ledger.length - sold,
      fundBook.entries.at(-1).origin,
      fundBook.entries.at(-1).document,
    ];
  });
  assert.deepEqual(result, [
    30000,
    -20000,
    0,
    480000,
    true,
    0,
    0,
    "PR-1",
    "PO-TEST",
  ]);
});
test("expense recognition, settlement, receipt correction, reversal and repair proceeds reconcile", async (t) => {
  const page = await branchSession(t);
  const r = await page.evaluate(() => {
    const cash = fundAccount(1, "Cash Box"),
      base = expenseAmount(today),
      data = {
        branch: 1,
        date: today,
        cat: "Other",
        title: "Delivery",
        total: 10000,
        account: cash.name,
      };
    const d = writeExpense({ ...data, ref: "E1", paid: 0 });
    const unpaid = [
      fundBalance(cash),
      expenseDue(d),
      expenseAmount(today) - base,
    ];
    payExpense(d, 4000, cash.name, "P1");
    let duplicate = false;
    try {
      payExpense(d, 4000, cash.name, "P1");
    } catch {
      duplicate = true;
    }
    const partial = [
      fundBalance(cash),
      expenseDue(d),
      expenseAmount(today) - base,
    ];
    correctExpense(d, "E2", "Correct receipt", {
      ...data,
      total: 9000,
      paid: 4000,
    });
    const next = state.expenses.find((x) => x.ref === "E2-NEW");
    payExpense(next, 5000, cash.name, "P2");
    const paid = [
      fundBalance(cash),
      expenseDue(next),
      expenseAmount(today) - base,
    ];
    correctExpense(next, "E3", "Void duplicate invoice");
    const voided = [fundBalance(cash), expenseAmount(today) - base];
    const product = products[0];
    quarantine({
      token: "lot",
      branch: 1,
      id: product.id,
      qty: 1,
      reason: "Damaged",
      notes: "",
    });
    resolveDefect(retail.defects.at(-1), {
      token: "fix",
      kind: "Restore",
      qty: 1,
      repair: 15,
      recovery: 5,
    });
    return [
      unpaid,
      partial,
      paid,
      voided,
      duplicate,
      [fundBalance(cash), expenseAmount(today) - base, stockResult(today, "1")],
    ];
  });
  assert.deepEqual(r, [
    [0, 10000, 100],
    [-4000, 6000, 100],
    [-9000, 0, 90],
    [0, 0],
    true,
    [-1000, 15, 5],
  ]);
});
for (const width of [1440, 1024, 390, 360])
  test(
    "fund accounts, expense receipt and statement controls at " + width + "px",
    async (t) => {
      const p = await branchSession(t, width);
      await go(p, "funds");
      await p.locator("[data-fund-action=create]").click();
      await p.locator("#fund-name").fill("City Bank");
      await p.locator("#fund-opening").fill("125");
      await p
        .getByRole("button", { name: "Create account", exact: true })
        .last()
        .click();
      for (const tab of [
        "Transactions",
        "Cash Flow",
        "Customer Dues",
        "Supplier Dues",
        "Accounts",
      ]) {
        await p.locator('[data-fund-tab="' + tab + '"]').click();
        assert.ok(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
      }
      await p.locator("[data-fund-action=Deposit]").click();
      await p.locator("#fund-source").selectOption("City Bank");
      await p.locator("#fund-amount").fill("75");
      await p.getByRole("button", { name: "Post deposit" }).click();
      await go(p, "pos");
      await p.locator("#pos-search").fill("100001001");
      await p.locator("#pos-search").press("Enter");
      await p.locator("[data-action=checkout]").click();
      assert.equal(await p.locator("[data-account]").inputValue(), "Cash Box");
      await p.locator("[data-account]").selectOption("City Bank");
      await p.locator("[data-save=checkout]").click();
      await p.keyboard.press("Escape");
      await go(p, "expenses");
      await p.locator("[data-action=expense]").click();
      await p.locator("#ex-title").fill("Alterations");
      await p.locator("#ex-amount").fill("60");
      await p.locator("#ex-cat").selectOption("Other");
      await p.locator("#ex-status").selectOption("Partial");
      await p.locator("#ex-part").fill("20");
      await p.locator("#ex-file").setInputFiles({
        name: "receipt.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-sample"),
      });
      await p.locator("[data-save=expense]").click();
      await p.locator("#ex-period").selectOption("Today");
      await p.locator("#ex-filter-cat").selectOption("Other");
      await p.locator("#ex-query").fill("Alterations");
      await p.getByRole("button", { name: "Apply", exact: true }).click();
      assert.match(await p.locator("tbody").innerText(), /Partial/);
      assert.ok(await p.getByText("Download receipt").isVisible());
      const next = p.waitForEvent("download");
      await p.locator("[data-action=report]").click();
      const csv = fs.readFileSync(await (await next).path(), "utf8");
      assert.match(csv, /Alterations/);
      assert.doesNotMatch(csv, /Store rent/);
      await p.locator("#role").selectOption("manager");
      await go(p, "funds");
      assert.equal(await p.locator("[data-fund-action=create]").count(), 0);
      assert.doesNotMatch(await p.locator("#content").innerText(), /Dakbangla/);
    },
  );

test("linked refund and exchange credits move only the actual cash difference", async (t) => {
  const page = await branchSession(t);
  const result = await page.evaluate(() => {
    const a = products[0],
      b = products.find((p) => p.id !== a.id && p.b1 > 0);
    a.price = 1000;
    b.price = 1500;
    const cash = fundAccount(1, "Cash Box"),
      s = postRetailSale({
        token: "sale",
        branch: 1,
        cart: [{ id: a.id, qty: 2 }],
        tenders: [{ account: "Cash Box", value: 200000 }],
      });
    const refund = postReturn({
      token: "refund",
      s,
      choices: [{ id: a.id, qty: 1, disposition: "resellable" }],
      reason: "Size",
      account: "Cash Box",
    });
    const exchange = postReturn({
      token: "exchange",
      s,
      choices: [{ id: a.id, qty: 1, disposition: "resellable" }],
      reason: "Fit",
      account: "Cash Box",
      replacement: [{ id: b.id, qty: 1 }],
    });
    return [
      fundBalance(cash),
      fundBook.entries.map((e) => e.value),
      fundBook.entries.some((e) => e.origin === refund.id),
      fundBook.entries.some((e) => e.origin === exchange.id),
      dueOn(s),
      dueOn(retail.sales[0]),
    ];
  });
  assert.deepEqual(result, [
    150000,
    [200000, -100000, 50000],
    true,
    true,
    0,
    0,
  ]);
});

test("Manager collects through Customer Dues, sees history and cannot settle another branch", async (t) => {
  const page = await branchSession(t);
  await page.evaluate(() => {
    const p = products[0];
    p.price = 100;
    for (const branch of [1, 2]) {
      state.branch = String(branch);
      postRetailSale({
        token: "due-" + branch,
        branch,
        phone: "0170000" + branch,
        cart: [{ id: p.id, qty: 1 }],
        allowDue: true,
        tenders: [],
      });
    }
    state.branch = "1";
  });
  await page.locator("#role").selectOption("manager");
  await go(page, "funds");
  await page.locator('[data-fund-tab="Customer Dues"]').click();
  assert.doesNotMatch(await page.locator("#content").innerText(), /01700002/);
  await page.locator("[data-fund-action=collect]").click();
  await page.locator("#settle-amount").fill("40");
  await page.getByRole("button", { name: "Record settlement" }).click();
  assert.match(await page.locator("#content").innerText(), /Partial/);
  await page.locator("[data-fund-action=customer-history]").click();
  assert.match(await page.locator(".modal").innerText(), /Due collection/);
  assert.ok(
    await page.evaluate(() => {
      try {
        collectDue(
          retail.sales.find((s) => s.branch === 2),
          100,
          "Cash Box",
        );
        return false;
      } catch {
        return true;
      }
    }),
  );
});

test("statement range, search and CSV reconcile branch opening and closing balances", async (t) => {
  const p = await branchSession(t);
  const date = await p.evaluate(() => {
    const bank = openFund(1, "Bank branch statement", "", 50),
      cash = fundAccount(1, "Cash Box");
    movement("Capital-7", bank, "Deposit", 10000, "Owner capital", "Funding");
    movement(
      "Transfer-8",
      bank,
      "Transfer",
      3000,
      "Internal transfer",
      "To till",
      cash,
    );
    return today;
  });
  await go(p, "funds");
  await p.locator('[data-fund-tab="Cash Flow"]').click();
  await p.locator("#fund-start").fill(date);
  await p.locator("#fund-end").fill(date);
  await p.locator("#fund-query").fill("Capital-7");
  await p.getByRole("button", { name: "Apply", exact: true }).click();
  const download = p.waitForEvent("download");
  await p.locator('[data-fund-action="fund-export"]').click();
  const csv = fs.readFileSync(await (await download).path(), "utf8");
  assert.match(csv, /Capital-7/);
  assert.doesNotMatch(csv, /Transfer-8/);
  assert.match(csv, /"Closing balance","150"/);
  assert.deepEqual(
    await p.evaluate(() => {
      const next = new Date(Date.parse(today) + 86400000)
        .toISOString()
        .slice(0, 10);
      const r = fundRange("1", next, next);
      return [r.opening, r.rows.length, r.closing];
    }),
    [15000, 0, 15000],
  );
});
