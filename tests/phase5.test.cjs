const { test, assert, session, go } = require("./browser.cjs");

async function fixture(t, width = 1440) {
  const page = await session(t, { width, height: 900 });
  await page.locator("#branch").selectOption("1");
  await page.evaluate(() => {
    const p = {
      ...products[0],
      id: nextVariantId(),
      sku: "TEST-SHIRT",
      barcode: "9990000501",
      b1: 0,
      b2: 0,
      values: { 1: 0, 2: 0 },
    };
    products.push(p);
    moveStock(p, 1, 20, 600000, "Opening stock", "TEST-OPEN");
  });
  return page;
}

test("two-variant transfer conserves units and cost through partial receiving and blends destination cost", async (t) => {
  const page = await fixture(t);
  const r = await page.evaluate(() => {
    const p = products.at(-1),
      q = products[0],
      initial = q.b2,
      destination = branchValue(q, 2),
      basis = issueValue(q, 1, 2),
      total = inventoryValue("all");
    const before = [
      ledger.length,
      invoices.length,
      state.expenses.length,
      stockResult(today, "all"),
    ];
    state.role = "manager";
    const tr = createTransfer({
      id: "test-tr",
      from: 1,
      lines: [
        { id: p.id, qty: 5 },
        { id: q.id, qty: 2 },
      ],
    });
    const draft = p.b1;
    dispatchTransfer(tr);
    const snapshot = () => [
      p.b1,
      position(p, 1).transit,
      p.b2,
      inventoryValue("all") === total,
    ];
    const dispatched = snapshot();
    let denied = false;
    try {
      settleTransfer(tr, [5, 2], "wrong", "Receive");
    } catch {
      denied = true;
    }
    state.role = "owner";
    state.branch = "2";
    settleTransfer(
      tr,
      [2, 1],
      "partial",
      "Report shortage",
      "Remaining carton missing",
    );
    const partial = snapshot(),
      status = transferStatus(tr);
    let duplicate = false;
    try {
      settleTransfer(tr, [2, 1], "partial", "Receive");
    } catch {
      duplicate = true;
    }
    settleTransfer(tr, [3, 1], "final", "Receive");
    return {
      before,
      after: [
        ledger.length,
        invoices.length,
        state.expenses.length,
        stockResult(today, "all"),
      ],
      denied,
      duplicate,
      draft,
      dispatched,
      partial,
      status,
      final: snapshot(),
      received: transferStatus(tr),
      weighted:
        branchValue(q, 2) / (initial + 2) === (destination + basis) / q.b2,
    };
  });
  assert.deepEqual(r, {
    before: r.before,
    after: r.before,
    denied: true,
    duplicate: true,
    draft: 20,
    dispatched: [15, 5, 0, true],
    partial: [15, 3, 2, true],
    status: "Discrepancy",
    final: [15, 0, 5, true],
    received: "Received",
    weighted: true,
  });
});

test("destination Manager receives; Owner resolves a shortage at original cost", async (t) => {
  const page = await fixture(t);
  const r = await page.evaluate(() => {
    const p = products.at(-1);
    state.branch = "2";
    moveStock(p, 2, 3, 90001, "Opening stock", "OPEN2");
    const tr = createTransfer(
      { id: "reverse", from: 2, lines: [{ id: p.id, qty: 3 }] },
      true,
    );
    state.role = "manager";
    settleTransfer(tr, [1], "recv", "Report shortage", "Two missing");
    state.role = "owner";
    settleTransfer(tr, [1], "restore", "Return to source", "Located at source");
    settleTransfer(tr, [1], "loss", "Missing/Lost", "Approved loss");
    return [
      p.b1,
      p.b2,
      branchValue(p, 1),
      branchValue(p, 2),
      position(p, 2).transit,
      stockResult(today, "2"),
      transferStatus(tr),
    ];
  });
  assert.deepEqual(r, [21, 1, 630000, 30001, 0, -300, "Discrepancy resolved"]);
});

test("defective sale return, repair, restoration and write-off reconcile once at original cost", async (t) => {
  const page = await fixture(t);
  const r = await page.evaluate(() => {
    const p = products.at(-1),
      cart = [{ id: p.id, qty: 2 }],
      sale = postRetailSale({
        token: "sale",
        branch: 1,
        cart,
        tenders: [{ account: "Cash Box", value: quoteCart(cart, 1).total }],
      });
    const historical = JSON.stringify(sale);
    postReturn({
      token: "return",
      s: sale,
      choices: [{ id: p.id, qty: 2, disposition: "defective" }],
      reason: "Faulty seam",
      account: "Cash Box",
    });
    const d = retail.defects.at(-1),
      afterReturn = position(p, 1);
    state.role = "manager";
    resolveDefect(d, { kind: "Under Repair", token: "repair" });
    resolveDefect(d, { kind: "Restore", qty: 1, token: "fixed", repair: 25 });
    let denied = false;
    try {
      resolveDefect(d, { kind: "Write off", qty: 1, token: "dispose" });
    } catch {
      denied = true;
    }
    state.role = "owner";
    resolveDefect(d, {
      kind: "Write off",
      qty: 1,
      token: "dispose",
      recovery: 45,
    });
    let duplicate = false;
    try {
      resolveDefect(d, {
        kind: "Write off",
        qty: 1,
        token: "dispose",
        recovery: 45,
      });
    } catch {
      duplicate = true;
    }
    return [
      afterReturn.qty,
      afterReturn.defects,
      afterReturn.total,
      denied,
      duplicate,
      p.b1,
      defectState(d).qty,
      stockResult(today, "1"),
      state.expenses[0].amount,
      state.expenses[0].branch,
      historical === JSON.stringify(sale),
    ];
  });
  assert.deepEqual(r, [18, 2, 600000, true, true, 19, 0, -255, 25, 1, true]);
});

test("physical counts, stale confirmations, dead-stock threshold and quarantined barcode", async (t) => {
  const page = await fixture(t);
  const r = await page.evaluate(() => {
    const p = products.at(-1);
    const future = (n) =>
      new Date(Date.parse(today) + n * 86400000).toISOString().slice(0, 10);
    const dates = [
      availabilityAge(p, 1, future(59)).dead,
      availabilityAge(p, 1, future(60)).dead,
      availabilityAge(p, 2, future(60)).dead,
    ];
    const count = {
      token: "count",
      branch: 1,
      id: p.id,
      previous: 20,
      corrected: 18,
      reason: "Physical count",
      notes: "Recounted shelf",
    };
    postCount(count);
    let duplicate = false,
      stale = false;
    try {
      postCount(count);
    } catch {
      duplicate = true;
    }
    try {
      postCount({ ...count, token: "stale" });
    } catch {
      stale = true;
    }
    postCount({
      ...count,
      token: "found",
      previous: 18,
      corrected: 19,
      reason: "Stock excess",
    });
    quarantine({
      token: "defect",
      branch: 1,
      id: p.id,
      qty: 19,
      reason: "Stained",
      notes: "Warehouse inspection",
    });
    return [
      dates,
      duplicate,
      stale,
      stockResult(today, "1"),
      position(p, 1).quarantined,
      p.b1,
      p.barcode,
    ];
  });
  assert.deepEqual(r.slice(0, -1), [
    [false, true, false],
    true,
    true,
    -300,
    570000,
    0,
  ]);
  await go(page, "pos");
  await page.locator("#pos-search").fill(r.at(-1));
  await page.locator("#pos-search").press("Enter");
  assert.match(await page.locator("#toast").innerText(), /out of stock/i);
  assert.equal(await page.locator(".cart-line").count(), 0);
});

for (const width of [1440, 1024, 390, 360])
  test("stock screens and draft challan at " + width + "px", async (t) => {
    const page = await fixture(t, width);
    for (const route of ["damage", "adjustments", "deadstock", "transfers"]) {
      await go(page, route);
      assert.ok(await page.locator("h1").isVisible());
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
    }
    await page.locator('[data-stock-action="transfer"]').click();
    await page.locator("#transfer-notes").fill("Check carton");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.locator('[data-stock-action="edit"]').click();
    await page.locator("#transfer-qty-0").fill("1");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.locator('[data-stock-action="challan"]').click();
    assert.match(
      await page.locator("#demo-receipt").innerText(),
      /Draft revised/,
    );
    await page.emulateMedia({ media: "print" });
    assert.ok(await page.locator("#demo-receipt").isVisible());
    await page.emulateMedia({ media: "screen" });
    await page
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await page.locator('[data-stock-action="cancel"]').click();
    assert.match(await page.locator("#content").innerText(), /Cancelled/);
  });

test("branch thresholds, filtered CSV and a new availability period after stockout", async (t) => {
  const page = await fixture(t);
  const ids = await page.evaluate(() => {
    const p = products.at(-1);
    costAudit.at(-1).date = new Date(Date.parse(today) - 42 * 86400000)
      .toISOString()
      .slice(0, 10);
    return { sku: p.sku, id: p.id };
  });
  await go(page, "deadstock");
  await page.locator('[data-stock-action="threshold"]').click();
  await page.locator("#preset-1").selectOption("custom");
  await page.locator("#days-1").fill("42");
  await page.getByRole("button", { name: "Save thresholds" }).click();
  await page.locator("#dead-search").fill(ids.sku);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.locator('[data-stock-action="dead-export"]').click();
  const csv = require("node:fs").readFileSync(
    await (await pending).path(),
    "utf8",
  );
  assert.match(csv, /TEST-SHIRT/);
  assert.match(csv, /New Market/);
  assert.doesNotMatch(csv, /Dakbangla/);
  const result = await page.evaluate((id) => {
    const p = variant(id);
    const aged = availabilityAge(p, 1);
    moveStock(p, 1, -20, -600000, "Count · Stock shortage", "RECOUNT");
    moveStock(p, 1, 1, 30000, "Opening stock", "FOUND");
    return [
      aged.age,
      aged.dead,
      availabilityAge(p, 1).age,
      availabilityAge(p, 1).dead,
      stockOps.threshold[2],
    ];
  }, ids.id);
  assert.deepEqual(result, [42, true, 0, false, 60]);
});

test("stock operator posts damage, a repair and a physical count through the register", async (t) => {
  const page = await fixture(t, 390);
  const id = await page.evaluate(() => String(products.at(-1).id));
  await go(page, "damage");
  await page.locator('[data-stock-action="damage"]').click();
  await page.locator("#stock-variant").selectOption(id);
  await page.locator("#damage-note").fill("Loose seam");
  await page.getByRole("button", { name: "Move to quarantine" }).click();
  assert.match(await page.locator("#content").innerText(), /Loose seam/);
  await page.locator('[data-stock-action="lot"]').click();
  await page.getByRole("button", { name: "Confirm disposition" }).click();
  await page.locator('[data-stock-action="lot"]').click();
  await page.locator("#repair-cost").fill("10");
  await page.getByRole("button", { name: "Confirm disposition" }).click();
  await go(page, "adjustments");
  await page.locator('[data-stock-action="count"]').click();
  await page.locator("#stock-variant").selectOption(id);
  await page.locator("#corrected").fill("19");
  await page.locator("#count-notes").fill("Shelf recount");
  await page.getByRole("button", { name: "Post adjustment" }).click();
  assert.match(await page.locator("#content").innerText(), /Shelf recount/);
  assert.deepEqual(
    await page.evaluate(() => [
      products.at(-1).b1,
      state.expenses[0].amount,
      stockResult(today, "1"),
    ]),
    [19, 10, -300],
  );
});
