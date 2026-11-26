const { test, assert, session, go } = require("./browser.cjs");
test("discount priority, manual override, allocation and VAT modes preserve every paisa", async (t) => {
  const page = await session(t);
  const data = await page.evaluate(() => {
    retail.rate = 10;
    const [a, b, c] = products;
    a.price = 110;
    b.price = 100;
    c.price = 100;
    a.vat = "included";
    b.vat = "excluded";
    c.vat = "exempt";
    const offer = {
      active: true,
      branch: 1,
      start: "2000",
      end: "2099",
      scope: "all",
      type: "flat",
      value: 5,
      name: "General",
    };
    retail.offers.push(
      offer,
      {
        ...offer,
        scope: "category",
        target: a.categoryId,
        value: 10,
        name: "Category",
      },
      { ...offer, scope: "product", target: a.id, value: 20, name: "Product" },
      { ...offer, value: 90, end: "2001" },
      { ...offer, value: 95, branch: 2 },
    );
    const q = quoteCart(
      [
        { id: a.id, qty: 2 },
        { id: b.id, qty: 1, manual: 15, manualType: "percent" },
        { id: c.id, qty: 1, manual: 0, manualType: "flat" },
      ],
      1,
      10,
      "percent",
    );
    return {
      discount: q.discount,
      total: q.total,
      tax: q.tax,
      lines: q.lines.map((l) => [
        l.itemDiscount,
        l.invoiceDiscount,
        l.net,
        l.tax,
        l.offer,
      ]),
      category: quoteCart([{ id: a.id, qty: 1 }], 1).lines[0].offer,
      other: quoteCart([{ id: a.id, qty: 1 }], 2).lines[0].offer,
    };
  });
  assert.deepEqual(data.lines, [
    [4000, 1800, 14727, 1473, "Product"],
    [1500, 850, 7650, 765, "Manual"],
    [0, 1000, 9000, 0, "Manual"],
  ]);
  assert.equal(data.total, 33615);
  assert.equal(data.discount, 9150);
  assert.equal(data.tax, 2238);
  assert.equal(data.other, "General");
});
test("partial returns, defect stock, exchange offsets, due collections and immutable sale snapshots", async (t) => {
  const page = await session(t);
  const data = await page.evaluate(() => {
    state.branch = "1";
    const [a, b] = products;
    a.price = 110;
    b.price = 220;
    retail.rate = 10;
    const start = a.b1,
      other = a.b2;
    const input = {
      token: "original",
      branch: 1,
      cart: [{ id: a.id, qty: 3 }],
      phone: "0123",
      tenders: [
        { account: "Cash Box", value: 10000 },
        { account: "Card", value: 10000 },
      ],
      allowDue: true,
    };
    const s = postRetailSale(input),
      snap = JSON.stringify(s),
      balance = dueOn(s),
      count = ledger.length;
    let duplicate = false;
    try {
      postRetailSale(input);
    } catch {
      duplicate = true;
    }
    collectDue(s, 3000, "Mobile");
    const stable = count === ledger.length;
    const supplyBasis = s.lines[0].basis;
    retail.rate = 15;
    a.price = 190;
    a.buyingPrice = 999;
    const submit = (id, n, disposition, replacement = []) =>
      postReturn({
        token: id,
        s,
        choices: [{ id: a.id, qty: n, disposition }],
        reason: "Client request",
        replacement,
        account: "Cash Box",
      });
    const first = submit("one", 1, "defective");
    const exchange = submit("two", 1, "resellable", [{ id: b.id, qty: 1 }]);
    const replacement = retail.sales.find((i) => i.id === exchange.replacement);
    const final = submit("three", 1, "resellable");
    let over = false;
    try {
      submit("four", 1, "resellable");
    } catch {
      over = true;
    }
    return {
      balance,
      duplicate,
      stable,
      over,
      original: JSON.stringify(s) === snap,
      due: dueOn(s),
      replacementDue: dueOn(replacement),
      replacementCost: replacement.lines[0].basis,
      expectedReplacement: b.cost * 100,
      originalReversed:
        -sumBy(
          retail.returns.flatMap((r) => r.lines),
          (l) => l.basis,
        ) === supplyBasis,
      tax: -sumBy(
        retail.returns.flatMap((r) => r.lines),
        (l) => l.tax,
      ),
      defects: retail.defects[0].qty,
      stock: start - a.b1,
      other: a.b2 === other,
      refund: first.credit,
      exchange: paidOn(replacement),
      refunds: retail.payments
        .filter((p) => p.kind === "Customer refund")
        .map((p) => p.value),
    };
  });
  assert.deepEqual(data, {
    balance: 13000,
    duplicate: true,
    stable: true,
    over: true,
    original: true,
    due: 0,
    replacementDue: 0,
    replacementCost: data.expectedReplacement,
    expectedReplacement: data.expectedReplacement,
    originalReversed: true,
    tax: 3000,
    defects: 1,
    stock: 1,
    other: true,
    refund: 11000,
    exchange: 22000,
    refunds: [-1000, -11000],
  });
});
for (const width of [1440, 1024, 390, 360])
  test(
    "scanner checkout, holds, history, collections and receipt layouts at " +
      width,
    async (t) => {
      const p = await session(t, { width, height: 850 });
      await p.locator("#branch").selectOption("1");
      await go(p, "pos");
      for (let i = 0; i < 2; i++) {
        await p.locator("#pos-search").fill("100001001");
        await p.locator("#pos-search").press("Enter");
      }
      await p.locator("#held-carts").click();
      await p.locator("#hold-current").click();
      assert.equal(await p.locator(".cart-line").count(), 0);
      await p.locator("#held-carts").click();
      await p.locator("[data-resume]").click();
      await p.locator("#customer").fill("0190001");
      await p.locator("[data-action=checkout]").click();
      await p.locator("[data-payment]").fill("100");
      await p.locator("#pay-later").check();
      await p.locator("[data-save=checkout]").click();
      for (const format of ["58mm", "80mm", "A4"]) {
        await p.locator("#receipt-layout").selectOption(format);
        await p.evaluate(()=>{window.print=()=>{window.printRule=document.querySelector("#receipt-page-size").textContent;};});
        await p.locator("#print-sale").click();
        assert.ok((await p.evaluate(()=>window.printRule)).includes("size:"+format));
        await p.emulateMedia({ media: "print" });
        assert.ok(await p.locator("#demo-receipt").isVisible());
        await p.emulateMedia({ media: "screen" });
      }
      await p.keyboard.press("Escape");
      await p.locator("#sales-history").click();
      await p.locator("[data-collect]").click();
      await p.getByRole("button", { name: "Record collection" }).click();
      await p.locator("[data-receipt]").click();
      assert.match(await p.locator("#demo-receipt").innerText(), /Due ৳0/);
      await p.keyboard.press("Escape");
      await p.locator("#sales-history").click();
      await p.locator("[data-return]").click();
      await p.locator("#rq-0").fill("1");
      await p.locator("#rd-0").selectOption("defective");
      await p.locator("#return-reason").fill("Seam");
      await p
        .getByRole("button", { name: "Confirm return / exchange" })
        .click();
      assert.match(await p.locator("#demo-receipt").innerText(), /Seam/);
      await p.keyboard.press("Escape");
      await p.locator("#branch").selectOption("2");
      await p.locator("#sales-history").click();
      assert.equal(await p.locator("[data-receipt]").count(), 0);
      await p.keyboard.press("Escape");
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    },
  );
test("Manager offer scope, size/color exchange, invoice linkage and CSV history", async (t) => {
  const p = await session(t);
  await p.locator("#role").selectOption("manager");
  await go(p, "pos");
  await p.locator("#sales-offers").click();
  assert.equal(await p.locator("#promo-branch option").count(), 1);
  await p.locator("#promo-name").fill("Branch launch");
  await p.locator("#promo-value").fill("10");
  await p.getByRole("button", { name: "Create offer" }).click();
  assert.match(await p.locator("[role=dialog]").innerText(), /Branch launch/);
  await p.keyboard.press("Escape");
  const data = await p.evaluate(() => {
    const a = products[0],
      others = products.filter(
        (x) => x.groupId === a.groupId && x.id !== a.id && x.b1 > 0,
      );
    const variants = [
      others.find((x) => x.size !== a.size && x.color === a.color),
      others.find((x) => x.color !== a.color),
    ];
    const cart = [{ id: a.id, qty: 2 }],
      branch = 1,
      q = quoteCart(cart, branch);
    const s = postRetailSale({
      token: "size-color",
      branch,
      cart,
      tenders: [{ account: "Cash Box", value: q.total }],
    });
    const stock = variants.map((x) => x.b1);
    for (const [i, v] of variants.entries())
      postReturn({
        token: "ex" + i,
        s,
        reason: "Fit",
        account: "Card",
        choices: [{ id: a.id, qty: 1, disposition: "resellable" }],
        replacement: [{ id: v.id, qty: 1 }],
      });
    return {
      stock: variants.map((x, i) => stock[i] - x.b1),
      discount: s.discount,
      ids: retail.returns.map((r) => r.replacement),
      dues: retail.sales.map(dueOn),
    };
  });
  assert.deepEqual(data.stock, [1, 1]);
  assert.deepEqual(data.dues, [0, 0, 0]);
  assert.equal(data.discount, 29800);
  await p.locator("#sales-history").click();
  await p.locator("#sales-query").fill(data.ids[0]);
  await p.locator("#filter-sales").click();
  assert.equal(await p.locator("[data-receipt]").count(), 1);
  const download = p.waitForEvent("download");
  await p.locator("#sales-csv").click();
  const csv = require("node:fs").readFileSync(
    await (await download).path(),
    "utf8",
  );
  assert.ok(
    csv.includes(data.ids[0]) &&
      !csv.includes(data.ids[1]) &&
      !csv.includes("Dakbangla"),
  );
});
