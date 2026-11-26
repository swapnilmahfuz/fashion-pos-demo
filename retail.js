// Invoice arithmetic and signed settlement movements use integer paisa.
const retail = {
  offers: [],
  holds: [],
  sales: [],
  returns: [],
  payments: [],
  defects: [],
  used: new Set(),
  rate: 0,
  footer: "Please bring this receipt for returns.",
  layout: "80mm",
  sequence: 0,
  from: today,
  to: today,
  query: "",
};
const retailId = (prefix) => prefix + "-" + ++retail.sequence;
const amount = (n) => money(n / 100);
const sumBy = (rows, fn) => rows.reduce((a, row) => a + fn(row), 0);
const branchSales = () => retail.sales.filter((s) => scoped(s.branch));
function retailTime() {
  return new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 16);
}
function discountAmount(base, type, value) {
  const val = Number(value);
  insist(Number.isFinite(val) && val >= 0, "Enter a valid discount.");
  return Math.min(
    base,
    type === "percent"
      ? Math.round((base * Math.min(100, val)) / 100)
      : cents(val),
  );
}
function quoteCart(cart, branch, invoiceDiscount = 0, type = "flat") {
  const seen = new Set(),
    time = retailTime();
  const lines = cart.map((item) => {
    const p = products.find((p) => p.id === item.id);
    insist(p && !seen.has(p.id), "Choose distinct product variants.");
    seen.add(p.id);
    const qty = units(item.qty),
      unit = cents(p.price),
      gross = qty * unit;
    const matching = retail.offers.filter(
      (o) =>
        o.active &&
        String(o.branch) === String(branch) &&
        o.start <= time &&
        time <= o.end &&
        (o.scope === "all" ||
          o.target ===
            (o.scope === "category"
              ? p.categoryId
              : o.scope === "style"
                ? p.groupId
                : p.id)),
    );
    // Largest benefit wins. The earlier campaign wins a tie. Manual overrides it.
    let perUnit = 0,
      offer = "";
    for (const o of matching) {
      const d = discountAmount(unit, o.type, o.value);
      if (d > perUnit) {
        perUnit = d;
        offer = o.name;
      }
    }
    if (item.manual != null) {
      perUnit = discountAmount(unit, item.manualType, item.manual);
      offer = "Manual";
    }
    const itemDiscount = perUnit * qty;
    return {
      ...snapshotProduct(p),
      productId: p.id,
      sku: p.sku,
      barcode: p.barcode,
      qty,
      unitPrice: p.price,
      gross,
      itemDiscount,
      offer,
      base: gross - itemDiscount,
      rate: p.vat === "exempt" ? 0 : retail.rate,
    };
  });
  const base = sumBy(lines, (l) => l.base),
    invoice = discountAmount(base, type, invoiceDiscount);
  let running = 0,
    allocated = 0;
  for (const l of lines) {
    running += l.base;
    const share = base ? Math.round(invoice * (running / base)) : 0;
    l.invoiceDiscount = share - allocated;
    allocated = share;
    const discounted = l.base - l.invoiceDiscount;
    l.tax =
      l.vat === "included"
        ? discounted - Math.round(discounted / (1 + l.rate / 100))
        : Math.round((discounted * l.rate) / 100);
    l.net = discounted - (l.vat === "included" ? l.tax : 0);
    l.payable = l.net + l.tax;
    l.discount = (l.invoiceDiscount + l.itemDiscount) / 100;
    l.revenue = l.net / 100;
    l.refund = false;
  }
  return {
    lines,
    total: sumBy(lines, (l) => l.payable),
    tax: sumBy(lines, (l) => l.tax),
    discount: sumBy(lines, (l) => l.itemDiscount + l.invoiceDiscount),
    gross: sumBy(lines, (l) => l.gross),
  };
}
function liveQuote() {
  return quoteCart(state.cart, curBranch(), state.discount, state.discountType);
}
totals = function () {
  const q = liveQuote();
  return {
    sub: q.gross / 100,
    total: q.total / 100,
    discount: q.discount / 100,
  };
};
function stockCheck(cart, branch) {
  branchCheck(branch);
  insist(curBranch() !== "all", "Select a specific selling branch.");
  insist(cart.length, "Add an item before checkout.");
  cart.forEach(({ id, qty }) => {
    const p = products.find((p) => p.id === id);
    insist(
      p &&
        p.active &&
        !p.deleted &&
        availableAt(p, branch) &&
        qty <= p["b" + branch],
      "Insufficient available branch stock.",
    );
  });
}
function accountName(name) {
  insist(
    typeof name === "string" && name.trim() && name.length <= 80,
    "Enter a payment account.",
  );
  return name.trim();
}
function recordTender(s, account, value, kind, ref) {
  retail.payments.push({
    id: retailId("MOV"),
    invoice: s.id,
    branch: s.branch,
    date: today,
    account,
    value,
    kind,
    ref,
  });
}
function paidOn(s) {
  return sumBy(
    retail.payments.filter((p) => p.invoice === s.id),
    (p) => p.value,
  );
}
function creditsOn(s) {
  return sumBy(
    retail.returns.filter((r) => r.original === s.id),
    (r) => r.credit,
  );
}
function dueOn(s) {
  return s.total - creditsOn(s) - paidOn(s);
}
function assertSale(s) {
  insist(
    retail.sales.includes(s) && scoped(s.branch),
    "Choose an invoice in the current scope.",
  );
}
function postRetailSale({
  token,
  branch,
  cart,
  phone = "",
  discount = 0,
  type = "flat",
  tenders,
  allowDue = false,
  link = null,
}) {
  insist(!retail.used.has(token), "Invoice already confirmed.");
  stockCheck(cart, branch);
  const q = quoteCart(cart, branch, discount, type),
    paid = sumBy(tenders, (t) => t.value);
  tenders.forEach((t) => {
    accountName(t.account);
    insist(
      Number.isSafeInteger(t.value) && t.value >= 0,
      "Enter valid payment amounts.",
    );
  });
  insist(
    paid <= q.total && (allowDue || paid === q.total),
    "Payments must reconcile with the invoice total.",
  );
  insist(
    paid === q.total || phone.trim(),
    "Enter a customer phone for an outstanding balance.",
  );
  const s = {
    ...q,
    id: retailId("INV"),
    branch: Number(branch),
    date: today,
    time: retailTime(),
    hour: Number(retailTime().slice(11, 13)),
    customerId: null,
    phone: phone.trim(),
    link,
    footer: retail.footer,
    method: tenders.map((t) => t.account).join(" + ") || "Pay later",
  };
  s.lines.forEach((l) => {
    const p = products.find((p) => p.id === l.productId),
      basis = issueValue(p, branch, l.qty);
    l.basis = basis;
    l.cogs = basis / 100;
    l.unitCost = l.cogs / l.qty;
    l.profit = round(l.revenue - l.cogs);
    moveStock(p, branch, -l.qty, -basis, "Sale", s.id, false);
  });
  retail.used.add(token);
  ledger.push(s);
  retail.sales.unshift(s);
  state.demoTransactions.push(s);
  tenders
    .filter((t) => t.value)
    .forEach((t) =>
      recordTender(
        s,
        t.account,
        t.value,
        t.kind || "Sale payment",
        link || s.id,
      ),
    );
  return s;
}
function collectDue(s, value, account) {
  assertSale(s);
  insist(
    curBranch() === String(s.branch),
    "Select the invoice branch to collect payment.",
  );
  accountName(account);
  insist(
    Number.isSafeInteger(value) && value > 0 && value <= dueOn(s),
    "Collection exceeds the invoice due.",
  );
  recordTender(s, account, value, "Due collection", s.id);
}
function returnedUnits(s, id) {
  return sumBy(
    retail.returns
      .filter((r) => r.original === s.id)
      .flatMap((r) => r.lines)
      .filter((l) => l.productId === id),
    (l) => l.qty,
  );
}
function previewReturn(s, choices) {
  assertSale(s);
  const seen = new Set();
  const lines = choices.map((choice) => {
    const l = s.lines.find((l) => l.productId === choice.id),
      qty = units(choice.qty);
    insist(
      l &&
        !seen.has(l.productId) &&
        ["resellable", "defective"].includes(choice.disposition),
      "Choose distinct original items and their disposition.",
    );
    seen.add(l.productId);
    const prior = returnedUnits(s, l.productId);
    insist(prior + qty <= l.qty, "Return exceeds remaining eligible quantity.");
    const part = (value) =>
      Math.round((value * (prior + qty)) / l.qty) -
      Math.round((value * prior) / l.qty);
    const net = part(l.net),
      tax = part(l.tax),
      basis = part(l.basis),
      itemDiscount = part(l.itemDiscount),
      invoiceDiscount = part(l.invoiceDiscount);
    return {
      ...l,
      qty,
      net: -net,
      tax: -tax,
      basis: -basis,
      payable: -net - tax,
      gross: -part(l.gross),
      itemDiscount: -itemDiscount,
      invoiceDiscount: -invoiceDiscount,
      discount: -(itemDiscount + invoiceDiscount) / 100,
      revenue: -net / 100,
      cogs: -basis / 100,
      profit: (basis - net) / 100,
      refund: true,
      disposition: choice.disposition,
    };
  });
  insist(lines.length, "Choose at least one return quantity.");
  return lines;
}
function postReturn({ token, s, choices, reason, replacement = [], account }) {
  insist(
    curBranch() === String(s.branch),
    "Select the invoice branch to post a return.",
  );
  insist(!retail.used.has(token), "Return already confirmed.");
  insist(reason.trim(), "Enter the return reason.");
  accountName(account);
  const lines = previewReturn(s, choices),
    credit = -sumBy(lines, (l) => l.payable),
    excess = Math.max(0, credit - dueOn(s));
  let replacementTotal = 0;
  if (replacement.length) {
    stockCheck(replacement, s.branch);
    replacementTotal = quoteCart(replacement, s.branch).total;
  }
  const applied = Math.min(excess, replacementTotal),
    r = {
      id: retailId("RET"),
      date: today,
      time: retailTime(),
      hour: Number(retailTime().slice(11, 13)),
      branch: s.branch,
      customerId: null,
      method: account,
      original: s.id,
      credit,
      reason: reason.trim(),
      lines,
    };
  // Validate the replacement before committing either side. Both legs are synchronous.
  if (replacement.length) {
    const newer = postRetailSale({
      token: token + "-replacement",
      cart: replacement,
      branch: s.branch,
      phone: s.phone,
      link: r.id,
      tenders: [
        { account: "Exchange credit", value: applied, kind: "Exchange offset" },
        { account, value: replacementTotal - applied },
      ],
    });
    r.replacement = newer.id;
  }
  for (const l of lines) {
    const p = products.find((p) => p.id === l.productId);
    if (l.disposition === "resellable")
      moveStock(p, s.branch, l.qty, -l.basis, "Customer return", r.id, false);
    else
      retail.defects.push({
        ref: r.id,
        original: s.id,
        productId: p.id,
        branch: s.branch,
        qty: l.qty,
        basis: -l.basis,
      });
  }
  retail.used.add(token);
  retail.returns.push(r);
  ledger.push(r);
  if (applied)
    recordTender(s, "Exchange credit", -applied, "Exchange offset", r.id);
  if (excess > applied)
    recordTender(s, account, -(excess - applied), "Customer refund", r.id);
  return r;
}
function paymentBreakdown(rows) {
  const sums = new Map(),
    add = (name, value) => sums.set(name, (sums.get(name) || 0) + value);
  for (const s of rows) {
    if (!retail.sales.includes(s) && !retail.returns.includes(s))
      add(s.method, Math.round(figures([s]).revenue * 100));
  }
  retail.payments
    .filter(
      (p) =>
        scoped(p.branch) &&
        p.date === state.date &&
        p.kind !== "Exchange offset",
    )
    .forEach((p) => add(p.account, p.value));
  return table(
    ["Account", "Net received"],
    [...sums].map(([name, value]) => [slug(name), amount(value)]),
  );
}
function retailModal(title, html) {
  purchaseModal(title, html);
}
function opts(values) {
  return values.map((v) => "<option>" + slug(v) + "</option>").join("");
}
const accounts = ["Cash Box", "Card", "Mobile banking"];
function tenderField(id) {
  return (
    '<label>Payment account<input class="input" id="' +
    id +
    '" value="Cash Box" list="retail-accounts"></label>'
  );
}
function accountList() {
  return (
    '<datalist id="retail-accounts">' +
    opts([
      ...new Set([
        ...accounts,
        ...retail.payments
          .filter((p) => scoped(p.branch) && p.kind !== "Exchange offset")
          .map((p) => p.account),
      ]),
    ]) +
    "</datalist>"
  );
}
function retailCheckout() {
  if (!requireBranch() || !state.cart.length) return;
  const q = liveQuote();
  retailModal(
    "Checkout",
    '<form id="retail-checkout"><p>' +
      slug(state.customer || "Walk-in") +
      " · " +
      branchLabel(curBranch()) +
      "</p><p>Discount " +
      amount(q.discount) +
      " · VAT " +
      amount(q.tax) +
      " · <strong>Total " +
      amount(q.total) +
      "</strong></p>" +
      field("Customer phone (optional for full payment)", "checkout-phone", "tel", state.customer) +
      accountList() +
      '<div id="tender-rows"></div>' +
      btn("Add split payment", 'id="add-tender"') +
      '<label><input type="checkbox" id="pay-later"> Allow unpaid balance</label><output id="checkout-due"></output><p role="alert"></p><div class="modal-foot">' +
      btn("Cancel", "data-close") +
      '<button class="btn primary" type="submit" data-save="checkout">Confirm sale</button></div></form>',
  );
  const form = $("#retail-checkout");
  form.dataset.token = retailId("CONF");
  function update() {
    const paid = sumBy(
      [...form.querySelectorAll("[data-payment]")],
      (i) => Number(i.value) || 0,
    );
    $("#checkout-due").textContent = "Balance " + money(q.total / 100 - paid);
  }
  function add(value) {
    const row = document.createElement("div");
    row.className = "form-row";
    row.innerHTML =
      '<label>Account<input class="input" list="retail-accounts" data-account value="Cash Box"></label><label>Amount<input class="input" type="number" step=".01" min="0" data-payment value="' +
      value +
      '"></label>' +
      btn("Remove", "data-remove");
    $("#tender-rows").append(row);
    row.querySelector("button").onclick = () => {
      row.remove();
      update();
    };
    update();
  }
  add(q.total / 100);
  $("#add-tender").onclick = () => add(0);
  form.oninput = update;
  form.onsubmit = (e) => {
    e.preventDefault();
    confirmRetailCheckout();
  };
}
function confirmRetailCheckout() {
  const form = $("#retail-checkout");
  if (!form) return;
  try {
    const tenders = [...form.querySelectorAll("[data-payment]")].map((i) => ({
      account: i
        .closest(".form-row")
        .querySelector("[data-account]")
        .value.trim(),
      value: cents(i.value),
    }));
    const s = postRetailSale({
      token: form.dataset.token,
      branch: curBranch(),
      cart: state.cart,
      phone: $("#checkout-phone").value,
      discount: state.discount,
      type: state.discountType,
      tenders,
      allowDue: $("#pay-later").checked,
    });
    state.cart = [];
    state.customer = "";
    state.discount = 0;
    closeModal();
    render();
    saleReceipt(s);
  } catch (e) {
    form.querySelector("[role=alert]").textContent = e.message;
  }
}
function saleReceipt(s) {
  assertSale(s);
  const payments = retail.payments.filter((p) => p.invoice === s.id),
    returns = retail.returns.filter((r) => r.original === s.id);
  retailModal(
    "Sales invoice",
    '<article id="demo-receipt" class="retail-receipt"><h3>QAHAF</h3><p>' +
      branchLabel(s.branch) +
      " · " +
      slug(s.id) +
      "<br>" +
      s.time.replace("T", " ") +
      " (Dhaka)<br>" +
      slug(s.phone || "Walk-in") +
      "</p>" +
      s.lines
        .map(
          (l) =>
            '<div class="receipt-item"><b>' +
            slug(l.productName) +
            "</b><div>" +
            slug(l.size + " / " + l.color + " · " + l.sku) +
            "</div><div>" +
            l.qty +
            " × " +
            money(l.unitPrice) +
            " · Discount " +
            money(l.discount) +
            "</div><div>VAT " +
            l.rate +
            "% (" +
            slug(l.vat) +
            ") " +
            amount(l.tax) +
            " · " +
            amount(l.payable) +
            "</div></div>",
        )
        .join("") +
      "<p>Discount " +
      amount(s.discount) +
      "<br>Net sales " +
      amount(s.total - s.tax) +
      "<br>VAT " +
      amount(s.tax) +
      "<br><b>Total " +
      amount(s.total) +
      "</b></p>" +
      payments
        .map(
          (p) =>
            "<div>" +
            slug(p.kind + " · " + p.account) +
            " " +
            amount(p.value) +
            "</div>",
        )
        .join("") +
      "<p>Net paid " +
      amount(paidOn(s)) +
      " · Due " +
      amount(dueOn(s)) +
      "</p>" +
      returns
        .map(
          (r) =>
            "<p>" +
            r.id +
            " · " +
            slug(r.reason) +
            " · Credit " +
            amount(r.credit) +
            "<br>" +
            r.lines
              .map(
                (l) =>
                  slug(l.sku + " × " + l.qty + " · " + l.disposition) +
                  " · VAT reversed " +
                  amount(-l.tax),
              )
              .join("<br>") +
            (r.replacement ? " · Replacement " + r.replacement : "") +
            "</p>",
        )
        .join("") +
      (s.link ? "<p>Exchange " + s.link + "</p>" : "") +
      "<p>" +
      slug(s.footer) +
      "</p><small>Sample invoice</small></article>" +
      '<div class="modal-foot"><label>Print size<select id="receipt-layout">' +
      opts(["58mm", "80mm", "A4"]) +
      "</select></label>" +
      btn("Print receipt", 'id="print-sale"') +
      btn("Close", "data-close") +
      "</div>",
  );
  const apply = () => {
    const size = retail.layout;
    $("#demo-receipt").dataset.layout = size;
    let css = $("#receipt-page-size");
    if (!css) {
      css = document.createElement("style");
      css.id = "receipt-page-size";
      document.head.append(css);
    }
    css.textContent =
      "@media print {@page {margin:" +
      (size === "A4" ? "12mm;size:A4" : "0;size:"+size+" "+Math.ceil($("#demo-receipt").scrollHeight*25.4/96+12)+"mm") +
      "}}";
  };
  $("#receipt-layout").value = retail.layout;
  $("#receipt-layout").onchange = (e) => {
    retail.layout = e.target.value;
    $("#demo-receipt").dataset.layout = retail.layout;
  };
  $("#demo-receipt").dataset.layout = retail.layout;
  $("#print-sale").onclick = () => {
    apply();
    try {
      window.print();
    } finally {
      $("#receipt-page-size")?.remove();
    }
  };
}
function returnForm(s) {
  assertSale(s);
  const token = retailId("CONF"),
    choices = s.lines.map((l) => ({
      id: l.productId,
      qty: 0,
      disposition: "resellable",
    }));
  const variants = catalogProducts().filter(
    (p) => p.active && availableAt(p, s.branch) && p["b" + s.branch] > 0,
  );
  retailModal(
    "Return or exchange · " + s.id,
    '<form id="customer-return">' +
      s.lines
        .map(
          (l, n) =>
            "<fieldset><legend>" +
            slug(l.productName + " · " + l.sku) +
            "</legend>" +
            field(
              "Return quantity (eligible " +
                (l.qty - returnedUnits(s, l.productId)) +
                ")",
              "rq-" + n,
              "number",
              0,
            ) +
            '<label>Disposition<select class="field" id="rd-' +
            n +
            '">' +
            opts(["resellable", "defective"]) +
            "</select></label></fieldset>",
        )
        .join("") +
      field("Reason", "return-reason") +
      '<label>Resolution<select class="field" id="resolution">' +
      opts(["Refund / reduce due", "Exchange"]) +
      '</select></label><div id="replacement" hidden><label>Replacement variant<select id="replacement-id" class="field">' +
      variants
        .map(
          (p) =>
            '<option value="' +
            p.id +
            '">' +
            slug(p.name + " · " + p.size + " / " + p.color + " · " + p.sku) +
            "</option>",
        )
        .join("") +
      "</select></label>" +
      field("Replacement quantity", "replacement-qty", "number", 1) +
      "</div>" +
      accountList() +
      tenderField("return-account") +
      '<p id="return-estimate"></p><p role="alert"></p><button class="btn primary">Confirm return / exchange</button></form>',
  );
  function read() {
    choices.forEach((c, n) => {
      c.qty = Number($("#rq-" + n).value);
      c.disposition = $("#rd-" + n).value;
    });
    return {
      choices: choices.filter((c) => c.qty !== 0),
      replacement: $("#resolution").selectedIndex
        ? [
            {
              id: Number($("#replacement-id").value),
              qty: Number($("#replacement-qty").value),
            },
          ]
        : [],
    };
  }
  function show() {
    $("#replacement").hidden = !$("#resolution").selectedIndex;
    try {
      const data = read(),
        credit = -sumBy(previewReturn(s, data.choices), (l) => l.payable),
        extra = Math.max(0, credit - dueOn(s)),
        diff = quoteCart(data.replacement, s.branch).total - extra;
      $("#return-estimate").textContent =
        "Credit " +
        amount(credit) +
        " · Reduce due " +
        amount(Math.min(credit, dueOn(s))) +
        " · " +
        (diff < 0 ? "Refund " : "Collect ") +
        amount(Math.abs(diff));
    } catch {
      $("#return-estimate").textContent =
        "Choose eligible quantities to preview the settlement.";
    }
  }
  $("#customer-return").oninput = show;
  show();
  safeSubmit($("#customer-return"), () => {
    postReturn({
      token,
      s,
      ...read(),
      reason: $("#return-reason").value,
      account: $("#return-account").value,
    });
    closeModal();
    render();
    saleReceipt(s);
  });
}
function historyPanel() {
  const archive = ledger.filter(
    (s) =>
      !retail.sales.includes(s) &&
      !retail.returns.includes(s) &&
      scoped(s.branch) &&
      s.date >= retail.from &&
      s.date <= retail.to &&
      (
        s.id +
        " " +
        (customersData.find((c) => c.id === s.customerId)?.name || "Walk-in")
      )
        .toLowerCase()
        .includes(retail.query.toLowerCase()),
  );
  const archiveCells = (s) => {
    const net = figures([s]).revenue;
    return [
      s.id,
      s.date,
      branchLabel(s.branch),
      customersData.find((c) => c.id === s.customerId)?.name || "Walk-in",
      sumBy(s.lines, (l) => (l.refund ? -l.qty : l.qty)),
      net,
      net,
      0,
      "Historical sample",
    ];
  };
  const rows = branchSales().filter(
    (s) =>
      s.date >= retail.from &&
      s.date <= retail.to &&
      (s.id + " " + (s.phone || "Walk-in"))
        .toLowerCase()
        .includes(retail.query.toLowerCase()),
  );
  const headers = [
    "Invoice",
    "Date",
    "Branch",
    "Customer",
    "Items",
    "Total",
    "Net paid",
    "Due",
    "Status",
  ];
  const cells = (s) => [
    s.id,
    s.date,
    branchLabel(s.branch),
    s.phone || "Walk-in",
    sumBy(s.lines, (l) => l.qty),
    s.total / 100,
    paidOn(s) / 100,
    dueOn(s) / 100,
    dueOn(s) === 0 ? "Settled" : paidOn(s) ? "Partial" : "Unpaid",
  ];
  retailModal(
    "Sales History",
    '<div class="toolbar">' +
      field("From", "sales-from", "date", retail.from) +
      field("Through", "sales-to", "date", retail.to) +
      field("Invoice or customer", "sales-query", "search", retail.query) +
      btn("Apply", 'id="filter-sales"') +
      btn("Export CSV", 'id="sales-csv"') +
      "</div>" +
      table(
        [...headers, "Actions"],
        rows.map((s) => [
          ...cells(s).map(slug),
          btn("Details / reprint", 'data-receipt="' + s.id + '"') +
            btn("Return / exchange", 'data-return="' + s.id + '"') +
            (dueOn(s) > 0
              ? btn("Collect due", 'data-collect="' + s.id + '"')
              : ""),
        ]),
      ) +
      "<details><summary>Earlier sample transactions (" +
      archive.length +
      ")</summary><p>Historical sample refunds have no original invoice link. Returns and exchanges are available for invoices issued by this checkout.</p>" +
      table(
        headers,
        archive.map((s) => archiveCells(s).map(slug)),
      ) +
      "</details>" +
      btn("Close", "data-close"),
  );
  $("#filter-sales").onclick = () => {
    retail.from = $("#sales-from").value || "0000";
    retail.to = $("#sales-to").value || "9999";
    retail.query = $("#sales-query").value.trim();
    historyPanel();
  };
  $("#sales-csv").onclick = () =>
    downloadCatalogCsv("sales-history", [
      headers,
      ...rows.map(cells),
      ...archive.map(archiveCells),
    ]);
  for (const s of rows) {
    if (curBranch() === "all") {
      for (const b of document.querySelectorAll(
        '[data-return="' + s.id + '"],[data-collect="' + s.id + '"]',
      )) {
        b.disabled = true;
        b.title = "Select the invoice branch";
      }
    }
    $('[data-receipt="' + s.id + '"]').onclick = () => saleReceipt(s);
    $('[data-return="' + s.id + '"]').onclick = () => returnForm(s);
    if (dueOn(s) > 0)
      $('[data-collect="' + s.id + '"]').onclick = () => {
        retailModal(
          "Collect due · " + s.id,
          '<form id="collection"><p>' +
            slug(s.phone) +
            " · Customer outstanding in scope " +
            amount(
              sumBy(
                branchSales().filter((i) => i.phone === s.phone),
                dueOn,
              ),
            ) +
            "</p>" +
            field(
              "Invoice collection",
              "collection-amount",
              "number",
              dueOn(s) / 100,
            ) +
            accountList() +
            tenderField("collection-account") +
            '<p role="alert"></p><button class="btn primary">Record collection</button></form>',
        );
        $("#collection-amount").step = ".01";
        safeSubmit($("#collection"), () => {
          collectDue(
            s,
            cents($("#collection-amount").value),
            $("#collection-account").value,
          );
          historyPanel();
        });
      };
  }
}
function campaignPanel() {
  const offers = retail.offers.filter((o) => scoped(o.branch));
  retailModal(
    "Discounts &amp; Offers",
    "<p>The largest eligible unit discount applies. Earlier offers win ties. A manual item discount replaces the offer. The invoice discount applies to the remaining amount.</p>" +
      table(
        ["Offer", "Branch", "Target", "Unit discount", "Dhaka time", "Status"],
        offers.map((o) => [
          slug(o.name),
          branchLabel(o.branch),
          slug(o.label),
          o.type === "percent" ? o.value + "%" : money(o.value),
          slug(o.start + " – " + o.end),
          btn(
            o.active ? "Deactivate" : "Activate",
            'data-toggle-offer="' + o.id + '"',
          ),
        ]),
      ) +
      '<form id="offer-form">' +
      field("Offer name", "promo-name") +
      '<label>Branch<select id="promo-branch" class="field">' +
      scopedBranches()
        .map(
          (b) => '<option value="' + b.id + '">' + slug(b.name) + "</option>",
        )
        .join("") +
      '</select></label><label>Applies to<select class="field" id="promo-target"><option value="all:0">All products</option>' +
      categories
        .filter((c) => !c.archived)
        .map(
          (c) =>
            '<option value="category:' +
            c.id +
            '">' +
            slug(c.name) +
            "</option>",
        )
        .join("") +
      [...new Map(catalogProducts().map((p) => [p.groupId, p])).values()]
        .map(
          (p) =>
            '<option value="style:' +
            p.groupId +
            '">' +
            slug(p.name + " · all variants") +
            "</option>",
        )
        .join("") +
      catalogProducts()
        .map(
          (p) =>
            '<option value="product:' +
            p.id +
            '">' +
            slug(p.name + " · " + p.sku) +
            "</option>",
        )
        .join("") +
      '</select></label><div class="form-row"><label>Discount type<select id="promo-type">' +
      opts(["percent", "flat"]) +
      "</select></label>" +
      field("Unit discount", "promo-value", "number", 0) +
      "</div>" +
      field(
        "Starts (Dhaka)",
        "promo-start",
        "datetime-local",
        today + "T00:00",
      ) +
      field(
        "Expires (Dhaka)",
        "promo-end",
        "datetime-local",
        today + "T23:59",
      ) +
      '<p role="alert"></p><button class="btn primary">Create offer</button></form>',
  );
  $("#promo-value").step = ".01";
  safeSubmit($("#offer-form"), () => {
    const name = $("#promo-name").value.trim(),
      type = $("#promo-type").value,
      value = Number($("#promo-value").value),
      start = $("#promo-start").value,
      end = $("#promo-end").value,
      branch = Number($("#promo-branch").value);
    branchCheck(branch);
    insist(
      name &&
        start &&
        end >= start &&
        value > 0 &&
        (type !== "percent" || value <= 100),
      "Enter a name, valid discount and time range.",
    );
    cents(value);
    const [scope, id] = $("#promo-target").value.split(":");
    retail.offers.push({
      id: retailId("OFFER"),
      name,
      start,
      end,
      type,
      value,
      branch,
      scope,
      target: Number(id),
      label: $("#promo-target").selectedOptions[0].textContent,
      active: true,
    });
    closeModal();
    render();
    campaignPanel();
  });
  document.querySelectorAll("[data-toggle-offer]").forEach(
    (b) =>
      (b.onclick = () => {
        const o = offers.find((o) => o.id === b.dataset.toggleOffer);
        o.active = !o.active;
        closeModal();
        render();
        campaignPanel();
      }),
  );
}
function heldPanel() {
  if (!requireBranch()) return;
  const branch = Number(curBranch()),
    held = retail.holds.filter((h) => h.branch === branch);
  retailModal(
    "Held carts",
    "<p>" +
      state.cart.length +
      " variants in current cart.</p>" +
      btn("Hold current cart", 'id="hold-current"') +
      table(
        ["Cart", "Customer", "Items", ""],
        held.map((h) => [
          h.id,
          slug(h.customer || "Walk-in"),
          sumBy(h.cart, (l) => l.qty),
          btn("Resume", 'data-resume="' + h.id + '"'),
        ]),
      ) +
      btn("Close", "data-close"),
  );
  function storeCart() {
    retail.holds.push({
      id: retailId("HOLD"),
      branch,
      ...structuredClone({
        cart: state.cart,
        customer: state.customer,
        discount: state.discount,
        discountType: state.discountType,
      }),
    });
  }
  $("#hold-current").disabled = !state.cart.length;
  $("#hold-current").onclick = () => {
    storeCart();
    state.cart = [];
    state.customer = "";
    state.discount = 0;
    finish("Cart held");
  };
  document.querySelectorAll("[data-resume]").forEach(
    (b) =>
      (b.onclick = () => {
        const h = held.find((h) => h.id === b.dataset.resume);
        try {
          stockCheck(h.cart, branch);
        } catch (e) {
          notify(e.message);
          return;
        }
        if (state.cart.length) storeCart();
        Object.assign(state, {
          cart: h.cart,
          customer: h.customer,
          discount: h.discount,
          discountType: h.discountType,
        });
        retail.holds.splice(retail.holds.indexOf(h), 1);
        finish("Cart resumed");
      }),
  );
}
function editItem(item) {
  const p = products.find((p) => p.id === item.id);
  retailModal(
    "Edit " + slug(p.sku),
    '<form id="retail-item">' +
      field("Quantity", "item-qty", "number", item.qty) +
      '<label>Item discount<select id="item-type" class="field">' +
      opts(["Automatic offer", "flat", "percent"]) +
      "</select></label>" +
      field(
        "Manual discount per unit",
        "item-discount",
        "number",
        item.manual || 0,
      ) +
      '<p role="alert"></p>' +
      btn("Remove item", 'id="remove-item"') +
      '<button class="btn primary">Apply</button></form>',
  );
  $("#item-type").value =
    item.manual != null ? item.manualType : "Automatic offer";
  $("#item-discount").step = ".01";
  $("#remove-item").onclick = () => {
    state.cart = state.cart.filter((l) => l !== item);
    finish("Item removed");
  };
  safeSubmit($("#retail-item"), () => {
    const qty = units($("#item-qty").value),
      type = $("#item-type").value,
      value = Number($("#item-discount").value);
    insist(qty <= stock(p), "Quantity exceeds branch stock.");
    if (type !== "Automatic offer") {
      cents(value);
      insist(type !== "percent" || value <= 100, "Percentage exceeds 100.");
    }
    Object.assign(item, {
      qty,
      manual: type === "Automatic offer" ? null : value,
      manualType: type,
    });
    closeModal();
    render();
  });
}
function retailSettings() {
  if (state.role !== "owner") return;
  retailModal(
    "Receipt &amp; VAT settings",
    '<form id="sale-settings">' +
      field("Demo VAT rate (%)", "demo-rate", "number", retail.rate) +
      field(
        "Return policy on new invoices",
        "receipt-footer",
        "text",
        retail.footer,
      ) +
      '<p>Demo rate for taxable products. Exempt variants use zero.</p><p role="alert"></p><button class="btn primary">Save</button></form>',
  );
  $("#demo-rate").step = ".01";
  safeSubmit($("#sale-settings"), () => {
    const rate = Number($("#demo-rate").value);
    insist(rate >= 0 && rate <= 100, "Use a rate between 0 and 100.");
    retail.rate = rate;
    retail.footer = $("#receipt-footer").value.trim();
    finish("Receipt settings saved");
  });
}
const classicPOS = pos;
pos = function () {
  return classicPOS().replace(
    '<div class="pos-layout">',
    '<div class="toolbar">' +
      btn("Sales History", 'id="sales-history"') +
      btn("Discounts & Offers", 'id="sales-offers"') +
      btn("Hold / resume carts", 'id="held-carts"') +
      (state.role === "owner"
        ? btn("Receipt & VAT settings", 'id="retail-settings"')
        : "") +
      '</div><div class="pos-layout">',
  );
};
const beforeRetailBind = bind;
bind = function () {
  beforeRetailBind();
  if (state.page !== "pos") return;
  $("#sales-history").onclick = historyPanel;
  $("#sales-offers").onclick = campaignPanel;
  $("#held-carts").onclick = heldPanel;
  if ($("#retail-settings")) $("#retail-settings").onclick = retailSettings;
  $('[data-action="checkout"]').onclick = retailCheckout;
  const quote = liveQuote();
  document.querySelectorAll(".cart-line").forEach((row, i) => {
    const l = quote.lines[i];
    row.firstElementChild.insertAdjacentHTML(
      "beforeend",
      "<small>" +
        slug(l.offer || "Item discount") +
        " " +
        amount(l.itemDiscount) +
        "</small>" +
        btn("Edit item", "data-edit-cart"),
    );
    row.querySelector("[data-edit-cart]").onclick = () =>
      editItem(state.cart[i]);
  });
  const refresh = () => {
    const q = liveQuote();
    $("#cart-total").textContent = amount(q.total);
    $("#cart-discount").textContent = "−" + amount(q.discount);
  };
  $("#discount").oninput = (e) => {
    state.discount = Math.min(
      100000000,
      Math.max(0, round(Number(e.target.value) || 0)),
    );
    refresh();
  };
  $("#discount-type").onchange = (e) => {
    state.discountType = e.target.value;
    refresh();
  };
};
