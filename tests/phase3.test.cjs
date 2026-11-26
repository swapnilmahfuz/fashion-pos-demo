const { test, assert, session, go } = require("./browser.cjs");

test("purchase subledger reconciles receipts, sale cost, credit, refund and remaining inventory", async (t) => {
  const page = await session(t);
  await page.locator("#branch").selectOption("1");
  const result = await page.evaluate(() => {
    const p = products[0],
      other = products[1],
      base = stockValue(p, 2);
    // Explicitly start a new style with the worked example's opening balance.
    const item = {
      ...p,
      id: nextVariantId(),
      sku: "COST-EXAMPLE",
      barcode: barcodeAllocator()(),
      b1: 0,
      b2: 0,
      values: { 1: 0, 2: 0 },
    };
    products.push(item);
    moveStock(item, 1, 10, 300000, "Opening import", "EXAMPLE");
    const input = {
      id: "PO-COST",
      branch: 1,
      supplier: suppliers[0].id,
      external: "SUP-A",
      lines: [
        { productId: item.id, qty: 10, unit: 400, discount: 0 },
        { productId: other.id, qty: 1, unit: 15, discount: 5 },
      ],
      discount: 10,
      tax: 5,
      landing: 5,
      paid: 2500,
    };
    saveInvoice(input, true);
    const draftQty = item.b1;
    const i = saveInvoice(input, false);
    const duplicate = [input, { ...input, id: "PO-COPY" }].map((x) => {
      try {
        saveInvoice(x, false);
        return false;
      } catch {
        return true;
      }
    });
    return {
      id: item.id,
      barcode: item.barcode,
      draftQty,
      average: stockValue(item, 1) / item.b1,
      duplicate,
      paid: cashPaid(i),
      due: balance(i),
      total: i.total,
      otherBranch: stockValue(p, 2) === base,
    };
  });
  assert.deepEqual(
    { ...result, id: 0, barcode: "" },
    {
      id: 0,
      barcode: "",
      draftQty: 10,
      average: 350,
      duplicate: [true, true],
      paid: 250000,
      due: 151000,
      total: 401000,
      otherBranch: true,
    },
  );
  await go(page, "pos");
  await page.locator("#pos-search").fill(result.barcode);
  await page.locator("#pos-search").press("Enter");
  await page.locator("[data-action=checkout]").click();
  await page.locator("[data-save=checkout]").click();
  const after = await page.evaluate((id) => {
    const p = products.find((p) => p.id === id),
      line = ledger.at(-1).lines[0],
      i = findInvoice("PO-COST");
    const saved = JSON.stringify(line);
    payment(i, 151000);
    const qty = [10, 0];
    returnGoods(i, qty);
    const negative = balance(i);
    payment(i, negative);
    let rejected = false;
    try {
      returnGoods(i, [1, 0]);
    } catch {
      rejected = true;
    }
    const audit = costAudit.filter((row) => row.productId === id);
    return {
      cogs: line.cogs,
      unchanged: saved === JSON.stringify(line),
      refundable: negative,
      balance: balance(i),
      stock: p.b1,
      value: stockValue(p, 1),
      combined: stockValue(p),
      variance: returnVariance(today),
      auditValue: audit.reduce((a, r) => a + r.value, 0),
      auditQty: audit.reduce((a, r) => a + r.qty, 0),
      rejected,
    };
  }, result.id);
  assert.deepEqual(after, {
    cogs: 350,
    unchanged: true,
    refundable: -400000,
    balance: 0,
    stock: 9,
    value: 3150,
    combined: 3150,
    variance: 500,
    auditValue: 315000,
    auditQty: 9,
    rejected: true,
  });
});

for (const width of [1440, 1024, 390, 360])
  test("supplier, invoice, opening import and print at " + width, async (t) => {
    const page = await session(t, { width, height: 850 });
    await go(page, "purchases");
    await page.locator("#suppliers").click();
    await page.locator("#new-supplier").click();
    await page.locator("#supplier-name").fill("Test supplier");
    await page.locator("#supplier-phone").fill("012345");
    await page.getByText("Save supplier", { exact: true }).click();
    await page.locator("#supplier-search").fill("Test supplier");
    assert.equal(await page.locator("[data-supplier]").count(), 1);
    await page.keyboard.press("Escape");
    if (await page.locator("#discard-changes").count())
      await page.locator("#discard-changes").click();
    await page.locator("[data-action=purchase]").click();
    await page.locator("#receive-branch").selectOption("2");
    await page.locator("#psupplier").selectOption({ label: "Test supplier" });
    await page.locator("#external").fill("External-01");
    await page.locator("#purchase-line").click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole("button", { name: "Confirm receipt" }).click();
    await page.locator("[data-invoice]").click();
    assert.match(
      await page.locator("#demo-receipt").innerText(),
      /Test supplier/,
    );
    await page.emulateMedia({ media: "print" });
    assert.ok(await page.locator("#demo-receipt").isVisible());
    await page.emulateMedia({ media: "screen" });
    await page.keyboard.press("Escape");
    await page.locator("#role").selectOption("manager");
    assert.equal(await page.locator("[data-invoice]").count(), 0);
    await page.locator("#opening").click();
    const header = "branch,sku,quantity,buying_cost\n";
    const sku = await page.evaluate(() => products[0].sku);
    const entry = "1," + sku + ",3,320";
    await page
      .locator("#opening-text")
      .fill(header + entry + "\n2," + sku + ",1,100");
    await page.locator("#opening-preview").click();
    assert.match(
      await page.locator("#opening-form [role=alert]").innerText(),
      /scope/,
    );
    assert.ok(await page.locator("#post-opening").isDisabled());
    await page.locator("#opening-text").fill(header + entry);
    await page.locator("#opening-preview").click();
    await page.locator("#post-opening").click();
    await page.locator("#opening").click();
    await page.locator("#opening-text").fill(header + entry);
    await page.locator("#opening-preview").click();
    assert.match(
      await page.locator("#opening-form [role=alert]").innerText(),
      /Duplicate/,
    );
  });

test("discount and landing allocation, later receipt, historical sale and branch CSV filters", async (t) => {
  const page = await session(t);
  await page.locator("#branch").selectOption("1");
  const check = await page.evaluate(() => {
    const [a, b] = products;
    const input = {
      id: "PO-ALLOCATION",
      branch: 1,
      supplier: suppliers[0].id,
      external: "allocation",
      lines: [
        { productId: a.id, qty: 2, unit: 101, discount: 2 },
        { productId: b.id, qty: 1, unit: 100, discount: 0 },
      ],
      discount: 25,
      tax: 3.39,
      landing: 5,
      paid: 0,
    };
    const prior = JSON.stringify(ledger),
      base = stockValue(a, 1),
      other = inventoryValue("2");
    const doc = saveInvoice(input, false);
    const difference = round(stockValue(a, 1) - base);
    const next = saveInvoice(
      {
        ...input,
        id: "PO-NEXT",
        external: "next",
        lines: [{ productId: a.id, qty: 1, unit: 4000, discount: 0 }],
        tax: 0,
        landing: 0,
        discount: 0,
      },
      false,
    );
    return {
      allocated: doc.lines.map((l) => l.value),
      difference,
      next: next.total,
      history: prior === JSON.stringify(ledger),
      combined:
        inventoryValue("all") ===
        round(inventoryValue("1") + inventoryValue("2")),
      unchanged: inventoryValue("2") === other,
    };
  });
  assert.deepEqual(check, {
    allocated: [18893, 9446],
    difference: 188.93,
    next: 400000,
    history: true,
    combined: true,
    unchanged: true,
  });
  await go(page, "purchases");
  await page.locator("#pur-search").fill("PO-NEXT");
  await page.locator("#purchase-filters button").click();
  assert.equal(await page.locator("[data-invoice]").count(), 1);
  const download = page.waitForEvent("download");
  await page.locator("#purchase-csv").click();
  const content = require("node:fs").readFileSync(
    await (await download).path(),
    "utf8",
  );
  assert.match(content, /PO-NEXT/);
  assert.doesNotMatch(content, /PO-ALLOCATION/);
  await page.locator("#pur-period").selectOption("custom");
  await page.locator("#pur-end").fill("2000-01-01");
  await page.locator("#purchase-filters button").click();
  assert.equal(await page.locator("[data-invoice]").count(), 0);
});
