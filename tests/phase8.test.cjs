const { test, assert, session, go, fs } = require("./browser.cjs");
async function newPage(t, width = 1440) {
  const page = await session(t, { width, height: 900 });
  await page.locator("#branch").selectOption("1");
  return page;
}
function tab(p, area, name) {
  return p.locator("[data-" + area + '-tab="' + name + '"]').click();
}
async function saveSettings(p, key, fields) {
  await p.locator('[data-settings="' + key + '"]').click();
  for (const [name, value] of Object.entries(fields)) {
    const control = p.locator("#setting-" + name),
      tag = await control.evaluate((el) => el.tagName);
    if (tag === "SELECT") await control.selectOption(String(value));
    else await control.fill(String(value));
  }
  await p.getByRole("button", { name: "Save settings", exact: true }).click();
}
test("master contacts link earlier invoices, preserve phone snapshots and validate consent-safe CSV", async (t) => {
  const p = await newPage(t);
  const id = await p.evaluate(() => {
    const product = products[0];
    return postRetailSale({
      token: "legacy-link",
      branch: 1,
      cart: [{ id: product.id, qty: 1 }],
      phone: "01711111111",
      tenders: [{ account: "Cash Box", value: paisa(product.price) }],
    }).id;
  });
  await go(p, "customers");
  await p.locator("[data-contact=new]").click();
  await p.locator("#customer-name").fill("Sample client");
  await p.locator("#customer-phone").fill("01711111111");
  await p.locator("#customer-sms").check();
  await p.getByRole("button", { name: "Save customer" }).click();
  const row = p.locator("tbody tr").filter({ hasText: "Sample client" });
  await row.locator("[data-contact=edit]").click();
  await p.locator("#customer-phone").fill("01822222222");
  await p.locator("#customer-active").uncheck();
  await p.getByRole("button", { name: "Save customer" }).click();
  assert.match(await row.innerText(), /Inactive/);
  await row.locator("[data-contact=history]").click();
  assert.match(await p.locator(".modal").innerText(), new RegExp(id));
  await p.keyboard.press("Escape");
  const r = await p.evaluate((id) => {
    const c = customersData.at(-1),
      s = retail.sales.find((i) => i.id === id);
    const errors = previewContacts(
      "Name,Phone\nFirst,+8801822222222\nNew,01922224444\nAgain,01922224444",
    ).map((r) => r.error);
    return [
      s.customerId === c.id,
      s.phone,
      c.phone,
      errors,
      contactAudit.filter((e) => e.action === "Consent updated").length,
      linkedCustomer(c.phone, 1) === undefined,
    ];
  }, id);
  assert.deepEqual(r, [
    true,
    "01711111111",
    "01822222222",
    ["Duplicate customer phone.", "", "Duplicate customer phone."],
    1,
    true,
  ]);
  await p.locator("[data-contact=import]").click();
  await p
    .locator("#contact-csv")
    .fill("Name,Phone,SMS\nCSV contact,01933333333,true");
  await p.getByRole("button", { name: "Validate & preview" }).click();
  await p.locator("#contact-apply").click();
  assert.ok(await p.evaluate(() => customersData.at(-1).sms === false));
});
test("group rules, historical group reports, age filters and consent-aware WhatsApp/SMS simulation", async (t) => {
  const p = await newPage(t);
  const r = await p.evaluate(() => {
    saveGroup(null, { name: "VIP", rate: 20, price: null });
    const c = saveCustomer({
      name: "Demo Member",
      phone: "01744444444",
      branch: 1,
      terms: 0,
      birthday: today,
      sms: true,
      whatsapp: true,
      active: true,
      groupId: 1,
    });
    const product = products[0];
    product.price = 1000;
    retail.offers.push({
      active: true,
      branch: 1,
      start: today + "T00:00",
      end: today + "T23:59",
      name: "Offer",
      scope: "all",
      type: "percent",
      value: 10,
    });
    const cart = [{ id: product.id, qty: 1 }];
    const q = quoteCart(cart, 1, 50, "flat", c);
    const manual = quoteCart(
      [{ ...cart[0], manual: 5, manualType: "percent" }],
      1,
      0,
      "flat",
      c,
    );
    const s = postRetailSale({
      token: "group",
      branch: 1,
      customerId: c.id,
      cart,
      discount: 50,
      tenders: [{ account: "Cash Box", value: 75000 }],
    });
    saveGroup(customerGroups[0], { name: "VIP New", rate: 30, price: null });
    const f = {
      ...reportState,
      report: "Customer Groups",
      from: today,
      to: today,
    };
    return [
      q.total,
      manual.total,
      s.total,
      s.groupSnapshot,
      buildReport(f).rows.find((r) => r.v[0] === "VIP").v,
      birthdayRows("Today").length,
      smsSize("^".repeat(81)).segments,
      smsSize("ক".repeat(71)).segments,
    ];
  });
  assert.deepEqual(r, [
    75000,
    95000,
    75000,
    "VIP",
    ["VIP", 0, 1, 75000, 0],
    1,
    2,
    2,
  ]);
  await go(p, "customers");
  await tab(p, "contacts", "Birthdays");
  await p.locator("#birthday-period").selectOption("Today");
  assert.match(
    await p
      .getByRole("link", { name: "Open birthday wish" })
      .getAttribute("href"),
    /^https:\/\/wa\.me\/8801744444444\?text=/,
  );
  await go(p, "marketing");
  await p
    .locator("#market-person")
    .selectOption({ label: "Demo Member · New Market" });
  await p.locator("#market-body").fill("Sample offer");
  assert.match(
    await p.locator("#market-wa a").getAttribute("href"),
    /Sample%20offer/,
  );
  await p.locator("[data-market=simulate]").click();
  assert.match(await p.locator("tbody").innerText(), /Simulated.*Not sent/s);
  await tab(p, "marketing", "Compose");
  await p.evaluate(() => {
    customersData.at(-1).sms = false;
    customersData.at(-1).whatsapp = false;
    render();
  });
  assert.equal(await p.locator("#market-wa a").count(), 0);
  await p.locator("[data-market=simulate]").click();
  assert.match(await p.locator("#toast").innerText(), /opted in/);
});
for (const width of [1440, 1024, 390, 360])
  test(
    "contacts, SMS and operational settings at " + width + "px",
    async (t) => {
      const p = await newPage(t, width);
      for (const [route, names] of [
        [
          "customers",
          ["Suppliers", "Customer Groups", "Birthdays", "Customers"],
        ],
        [
          "marketing",
          [
            "Customer Segments",
            "Templates",
            "SMS History",
            "SMS Settings",
            "Compose",
          ],
        ],
        [
          "settings",
          [
            "Business",
            "Branches",
            "Products & Inventory",
            "Sales & VAT",
            "Invoices & Receipts",
            "Barcode & Printers",
            "Accounts & Payments",
            "Notifications",
            "Security",
          ],
        ],
      ]) {
        await go(p, route);
        const area = route === "customers" ? "contacts" : route;
        for (const name of names) {
          await tab(p, area, name);
          assert.ok(
            await p.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
            name,
          );
        }
      }
      await saveSettings(p, "security", { managerBranch: "2" });
      await p.locator("#role").selectOption("manager");
      assert.equal(await p.locator("#branch").inputValue(), "2");
      assert.equal(await p.locator("[data-settings-tab]").count(), 1);
      await go(p, "customers");
      assert.doesNotMatch(
        await p.locator("tbody").innerText(),
        /Demo Customer A/,
      );
    },
  );
test("branch receipt and printer defaults apply to new transactions and survive navigation", async (t) => {
  const p = await newPage(t);
  const before = await p.evaluate(() => {
    const product = products[0];
    return postRetailSale({
      token: "before",
      branch: 1,
      cart: [{ id: product.id, qty: 1 }],
      tenders: [{ account: "Cash Box", value: paisa(product.price) }],
    }).id;
  });
  await go(p, "settings");
  await tab(p, "settings", "Invoices & Receipts");
  await saveSettings(p, "receipt", {
    prefix: "NM",
    header: "New Market preview",
    footer: "Branch footer",
    layout: "80mm",
  });
  await p.locator("[data-settings=receipt-preview]").click();
  assert.equal(
    await p.locator("#demo-receipt").getAttribute("data-layout"),
    "80mm",
  );
  assert.match(await p.locator("#demo-receipt").innerText(), /Branch footer/);
  await p.keyboard.press("Escape");
  await tab(p, "settings", "Barcode & Printers");
  await saveSettings(p, "barcode", {
    labelWidth: 60,
    labelHeight: 45,
    labelCount: 2,
    labelLayout: "Single column",
  });
  await p.locator("[data-settings=barcode-preview]").click();
  assert.equal(await p.locator("#label-width").inputValue(), "60");
  await p.evaluate(() => {
    window.print = () => {
      window.labelResult = [
        document.querySelector("#print-root").dataset.labelLayout,
        document.querySelectorAll("#print-root .barcode-label").length,
      ];
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await p.locator("#print-labels").click();
  assert.deepEqual(await p.evaluate(() => window.labelResult), [
    "Single column",
    2,
  ]);
  await p.keyboard.press("Escape");
  if (await p.locator("#discard-changes").count())
    await p.locator("#discard-changes").click();
  const r = await p.evaluate((before) => {
    const old = retail.sales.find((s) => s.id === before),
      product = products[0];
    const now = postRetailSale({
      token: "after",
      branch: 1,
      cart: [{ id: product.id, qty: 1 }],
      tenders: [{ account: "Cash Box", value: paisa(product.price) }],
    });
    return [
      old.receipt.header,
      now.receipt.header,
      now.id.startsWith("NM-1-"),
      receiptSnapshot(2).header,
      settingsAudit.length,
    ];
  }, before);
  assert.deepEqual(r, ["", "New Market preview", true, "", 2]);
});

test("client journey reconciles multi-variant purchase, linked POS return, transfer, expense and downloads", async (t) => {
  const p = await newPage(t);
  await go(p, "customers");
  await tab(p, "contacts", "Suppliers");
  await p.locator("[data-contact=supplier-new]").click();
  await p.locator("#supplier-name").fill("Demo garment supplier");
  await p.getByText("Save supplier", { exact: true }).click();
  await tab(p, "contacts", "Customer Groups");
  await p.locator("[data-contact=group-new]").click();
  await p.locator("#group-name").fill("Regular");
  await p.locator("#group-rate").fill("10");
  await p.getByText("Save group", { exact: true }).click();
  await tab(p, "contacts", "Customers");
  await p.locator("[data-contact=new]").click();
  await p.locator("#customer-name").fill("Client walkthrough");
  await p.locator("#customer-phone").fill("01755555555");
  await p.locator("#customer-group").selectOption({ label: "Regular" });
  await p.locator("#customer-sms").check();
  await p.getByRole("button", { name: "Save customer" }).click();
  await p.locator("#branch").selectOption("all");
  await go(p, "products");
  await p.locator('[data-action="product-form"]').click();
  await p.locator("#p-name").fill("Walkthrough linen");
  await p.locator("#p-sizes").fill("M,L");
  await p.locator("#p-colors").fill("Black,Navy");
  await p.locator("#p-cost").fill("400");
  await p.locator("#p-price").fill("1000");
  await p.locator("#generate-variants").click();
  await p.getByRole("button", { name: "Save Product", exact: true }).click();
  await p.locator("#branch").selectOption("1");
  const info = await p.evaluate(() => {
    const variants = products.filter((x) => x.name === "Walkthrough linen"),
      a = variants.find((p) => p.color === "Black" && p.size === "M"),
      b = variants.find((p) => p.color === "Navy" && p.size === "L");
    const supplier = suppliers.find((s) => s.name === "Demo garment supplier"),
      i = saveInvoice(
        {
          id: "JOURNEY-PO",
          branch: 1,
          supplier: supplier.id,
          external: "SAMPLE-01",
          lines: [
            { productId: a.id, qty: 6, unit: 400, discount: 0 },
            { productId: b.id, qty: 2, unit: 400, discount: 0 },
          ],
          discount: 0,
          landing: 0,
          tax: 0,
          paid: 600,
        },
        false,
      );
    return {
      count: variants.length,
      id: a.id,
      barcode: a.barcode,
      b: b.id,
      invoice: i.id,
    };
  });
  assert.equal(info.count, 4);
  await p
    .locator('[data-label="' + info.id + '"]')
    .first()
    .click();
  assert.equal(await p.locator("#label-preview svg").count(), 1);
  await p.evaluate(() => {
    window.print = () => {
      window.didPrint = true;
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await p.locator("#print-labels").click();
  assert.ok(await p.evaluate(() => window.didPrint));
  await p.keyboard.press("Escape");
  await go(p, "pos");
  for (let i = 0; i < 2; i++) {
    await p.locator("#pos-search").fill(info.barcode);
    await p.locator("#pos-search").press("Enter");
  }
  await p.locator("#discount").fill("100");
  await p.locator("#discount-type").selectOption("flat");
  await p.locator("[data-action=checkout]").click();
  await p
    .locator("#checkout-customer")
    .selectOption({ label: "Client walkthrough · 01755555555" });
  assert.match(await p.locator("#checkout-summary").innerText(), /1,700/);
  await p.locator("[data-save=checkout]").click();
  assert.match(
    await p.locator("#demo-receipt").innerText(),
    /Client walkthrough/,
  );
  await p.keyboard.press("Escape");
  await p.evaluate((info) => {
    const i = findInvoice(info.invoice),
      supplier = suppliers.find((x) => x.id === i.supplier);
    supplier.phone = "01866666666";
    supplier.name = "Garment contact updated";
    const sale = retail.sales[0];
    postReturn({
      token: "JOURNEY-RETURN",
      s: sale,
      choices: [{ id: info.id, qty: 1, disposition: "resellable" }],
      reason: "Fit",
      account: "Cash Box",
    });
    const expense = writeExpense({
      ref: "JOURNEY-EX",
      branch: 1,
      date: today,
      cat: "Other",
      title: "Delivery",
      total: 10000,
      paid: 0,
      account: "Cash Box",
    });
    payExpense(expense, 10000, "Cash Box", "JOURNEY-SET");
    createTransfer(
      {
        id: "JOURNEY-TR",
        from: 1,
        notes: "Other branch",
        lines: [{ id: info.id, qty: 2 }],
      },
      true,
    );
  }, info);
  await p.locator("#branch").selectOption("2");
  await p.evaluate(() =>
    settleTransfer(
      stockOps.transfers.find((t) => t.id === "JOURNEY-TR"),
      [2],
      "JOURNEY-TR-RECEIPT",
      "Receive",
    ),
  );
  await p.locator("#branch").selectOption("all");
  const values = await p.evaluate((info) => {
    Object.assign(reportState, {
      report: "Profit/Loss",
      tab: "Products",
      linked: true,
      from: today,
      to: today,
      preset: "Today",
    });
    const c = reportingContext(reportState),
      a = variant(info.id),
      i = findInvoice(info.invoice),
      s = retail.sales[0];
    return [
      a.b1,
      a.b2,
      position(a, 1).total + position(a, 2).total,
      variant(info.b).b1,
      fundRange("all").closing,
      balance(i),
      i.supplierName,
      s.total,
      periodResult(c).net,
      periodResult(c).cost,
      periodResult(c).operating,
      customerTotals(customersData.at(-1)).due,
      transferStatus(stockOps.transfers[0]),
    ];
  }, info);
  assert.deepEqual(values, [
    3,
    2,
    200000,
    2,
    15000,
    260000,
    "Demo garment supplier",
    170000,
    85000,
    40000,
    35000,
    0,
    "Received",
  ]);
  await go(p, "finance");
  assert.match(await p.locator(".report-metrics").first().innerText(), /৳350/);
  await p.locator(".report-download summary").click();
  for (const type of ["xlsx", "csv", "pdf"]) {
    const file = p.waitForEvent("download");
    await p.locator('[data-format="' + type + '"]').click();
    const d = await file;
    assert.match(d.suggestedFilename(), new RegExp(type + "$"));
    assert.ok(fs.statSync(await d.path()).size > 100);
  }
  await p.locator("#branch").selectOption("1");
  await go(p, "marketing");
  await p
    .locator("#market-person")
    .selectOption({ label: "Client walkthrough · New Market" });
  await p.locator("#market-body").fill("Your sample QAHAF offer");
  await p.locator("[data-market=draft]").click();
  assert.match(await p.locator("tbody").innerText(), /Pending simulation/);
  await go(p, "settings");
  await tab(p, "settings", "Invoices & Receipts");
  await saveSettings(p, "receipt", {
    prefix: "NM",
    header: "Client demo header",
    layout: "80mm",
  });
  await p.locator("[data-settings=receipt-preview]").click();
  await p.evaluate(() => {
    window.print = () => {
      window.demoReceiptLayout =
        document.querySelector("#receipt-page-size").textContent;
    };
  });
  await p.locator("#test-receipt").click();
  assert.match(await p.evaluate(() => window.demoReceiptLayout), /80mm/);
});

test("financial year, catalog, VAT, credit and payment defaults drive operational controls", async (t) => {
  const p = await newPage(t);
  await go(p, "settings");
  await saveSettings(p, "business", {
    yearStart: 7,
    email: "demo@example.com",
  });
  assert.deepEqual(
    await p.evaluate(() => reportDates("This Financial Year", "2026-06-15")),
    ["2025-07-01", "2026-06-15"],
  );
  await tab(p, "settings", "Products & Inventory");
  await p.locator("[data-settings=inventory]").click();
  await p.locator("#setting-category").selectOption("2");
  await p.locator("#setting-skuDigits").fill("6");
  await p.locator("#setting-lowStock").fill("7");
  await p.locator("#setting-active").uncheck();
  await p.getByRole("button", { name: "Save settings", exact: true }).click();
  await tab(p, "settings", "Sales & VAT");
  await p.locator("[data-settings=sales]").click();
  await p.locator("#setting-vat").fill("5");
  await p.locator("#setting-vatMode").selectOption("excluded");
  await p.locator("#setting-invoiceDiscount").uncheck();
  await p.locator("#setting-credit").uncheck();
  await p.getByRole("button", { name: "Save settings", exact: true }).click();
  await tab(p, "settings", "Accounts & Payments");
  await saveSettings(p, "payments", { checkoutAccount: "Card" });
  await go(p, "products");
  await p.locator("[data-action=product-form]").click();
  assert.equal(await p.locator("#p-category").inputValue(), "2");
  assert.equal(await p.locator("#p-vat").inputValue(), "excluded");
  await p.locator("#generate-variants").click();
  assert.match(
    await p.locator("[data-variant-field=sku]").inputValue(),
    /HSH-\d{6}-/,
  );
  assert.equal(
    await p.locator("[data-variant-field=active]").isChecked(),
    false,
  );
  await p.keyboard.press("Escape");
  if (await p.locator("#discard-changes").count())
    await p.locator("#discard-changes").click();
  await go(p, "pos");
  await p.locator("#pos-search").fill("100001001");
  await p.locator("#pos-search").press("Enter");
  assert.ok(await p.locator("#discount").isDisabled());
  await p.locator("[data-action=checkout]").click();
  assert.equal(await p.locator("[data-account]").inputValue(), "Card");
  assert.ok(await p.locator("#pay-later").isDisabled());
});

test("shared customer keeps one identity and branch-specific financial history", async (t) => {
  const p = await newPage(t);
  const totals = await p.evaluate(() => {
    const customer = saveCustomer({
      name: "Shared sample",
      phone: "01733333333",
      branch: 1,
      shared: true,
      terms: 15,
      active: true,
      sms: true,
      whatsapp: false,
      groupId: null,
    });
    const example = products.find((p) => p.b1 > 0 && p.b2 > 0);
    example.price = 100;
    const rows = [];
    for (const branch of [1, 2]) {
      state.branch = String(branch);
      const invoice = postRetailSale({
        token: "shared-" + branch,
        branch,
        customerId: customer.id,
        cart: [{ id: example.id, qty: 1 }],
        tenders: [{ account: "Cash Box", value: 5000 }],
        allowDue: true,
      });
      rows.push([
        invoice.customerId,
        invoice.dueDate,
        customerTotals(customer).due,
        marketAudience().length,
      ]);
    }
    state.branch = "all";
    const report = buildReport({
      ...reportState,
      report: "Profit/Loss",
      tab: "Customer",
      linked: true,
      from: today,
      to: today,
    });
    return {
      rows,
      expectedDate: dayShift(today, 15),
      all: customerTotals(customer).due,
      report: report.rows.find((r) => r.v[0] === "Shared sample").v,
    };
  });
  assert.deepEqual(totals.rows, [
    [5, totals.expectedDate, 5000, 1],
    [5, totals.expectedDate, 5000, 0],
  ]);
  assert.equal(totals.all, 10000);
  assert.equal(totals.report[1], 2);
  assert.equal(totals.report[2], 20000);
  assert.equal(totals.report.at(-1), 10000);
});
