// Monetary amounts inside the purchase ledger are integer paisa.
const invoices = [],
  settlements = [],
  supplierReturns = [],
  openingBalances = [],
  costAudit = [];
const suppliers = [...new Set(state.purchases.map((row) => row.supplier))].map(
  (name, i) => ({
    id: i + 1,
    name,
    active: true,
    phone: "",
    address: "",
    notes: "",
  }),
);
const purchaseFilters = {
  period: "month",
  start: today,
  end: today,
  search: "",
};
let invoiceSequence = 0;
function insist(ok, message) {
  if (!ok) throw Error(message);
}
function cents(value) {
  insist(
    /^\d+(\.\d{1,2})?$/.test(String(value)) && Number(value) <= 100000000,
    "Enter a nonnegative BDT amount with up to two decimal places.",
  );
  return Math.round(Number(value) * 100);
}
function units(value) {
  const n = Number(value);
  insist(
    Number.isInteger(n) && n > 0 && n <= 10000,
    "Enter whole quantities from 1 to 10000.",
  );
  return n;
}
function branchCheck(branch) {
  insist(
    [1, 2].includes(Number(branch)) && scoped(Number(branch)),
    "Choose a receiving branch within the selected scope.",
  );
}
function branchValue(p, b) {
  return p.values?.[b] ?? Math.round(p["b" + b] * p.cost * 100);
}
function stockValue(p, b = curBranch()) {
  return (
    (b === "all" ? branchValue(p, 1) + branchValue(p, 2) : branchValue(p, b)) /
    100
  );
}
function issueValue(p, b, qty) {
  insist(qty <= p["b" + b], "Insufficient branch stock.");
  return Math.round((branchValue(p, b) * qty) / p["b" + b]);
}
function moveStock(p, b, qty, value, type, ref, quantityMovement = true) {
  p.values ??= { 1: branchValue(p, 1), 2: branchValue(p, 2) };
  p.values[b] += value;
  p["b" + b] += qty;
  const entry = {
    productId: p.id,
    sku: p.sku,
    branch: Number(b),
    qty,
    value,
    type,
    ref,
    date: today,
  };
  costAudit.push(entry);
  if (quantityMovement) stockMovements.push(entry);
}
products.forEach((p) =>
  [1, 2].forEach((b) =>
    costAudit.push({
      productId: p.id,
      sku: p.sku,
      branch: b,
      qty: p["b" + b],
      value: branchValue(p, b),
      type: "Session baseline",
      date: today,
    }),
  ),
);
function findInvoice(id) {
  const doc = invoices.find((i) => i.id === id);
  insist(doc && scoped(doc.branch), "Purchase outside selected scope.");
  return doc;
}
function cashPaid(i) {
  return settlements
    .filter((s) => s.invoice === i.id)
    .reduce((a, s) => a + s.amount, 0);
}
function netInvoice(i) {
  return (
    i.total -
    supplierReturns
      .filter((r) => r.invoice === i.id)
      .reduce((a, r) => a + r.credit, 0)
  );
}
function balance(i) {
  return i.draft ? 0 : netInvoice(i) - cashPaid(i);
}
function invoiceStatus(i) {
  return i.draft
    ? "Draft"
    : balance(i) < 0
      ? "Refund due"
      : balance(i) === 0
        ? "Settled"
        : cashPaid(i)
          ? "Partial"
          : "Unpaid";
}
function payment(i, amount) {
  findInvoice(i.id);
  insist(
    !i.draft &&
      amount &&
      Number.isSafeInteger(amount) &&
      Math.sign(amount) === Math.sign(balance(i)) &&
      Math.abs(amount) <= Math.abs(balance(i)),
    "Amount exceeds outstanding balance.",
  );
  settlements.push({
    invoice: i.id,
    branch: i.branch,
    amount,
    date: today,
    ref: "PAY-" + (settlements.length + 1),
  });
}
function saveInvoice(input, draft) {
  const branch = Number(input.branch);
  branchCheck(branch);
  const old = invoices.find((i) => i.id === input.id);
  insist(
    !old || (old.draft && scoped(old.branch)),
    "Receipt already posted or outside scope.",
  );
  const supplier = suppliers.find(
    (s) => s.id === Number(input.supplier) && s.active,
  );
  insist(supplier, "Choose an active supplier.");
  const external = input.external.trim();
  insist(
    draft || external,
    "Enter the supplier invoice number before posting.",
  );
  insist(
    !invoices.some(
      (i) =>
        i.id !== input.id &&
        i.supplier === supplier.id &&
        external &&
        i.external.toLowerCase() === external.toLowerCase(),
    ),
    "Duplicate supplier invoice number.",
  );
  const seen = new Set();
  const lines = input.lines.map((l) => {
    const p = products.find((p) => p.id === Number(l.productId));
    insist(
      p && !p.deleted && availableAt(p, branch) && !seen.has(p.id),
      "Choose distinct variants available at this branch.",
    );
    seen.add(p.id);
    const qty = units(l.qty),
      unit = cents(l.unit),
      discount = cents(l.discount),
      base = qty * unit - discount;
    insist(base >= 0, "Line discount exceeds line amount.");
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      size: p.size,
      color: p.color,
      qty,
      unit,
      discount,
      base,
    };
  });
  insist(lines.length, "Add a purchase line.");
  const subtotal = lines.reduce((a, l) => a + l.base, 0),
    discount = cents(input.discount),
    tax = cents(input.tax),
    landing = cents(input.landing);
  insist(discount <= subtotal, "Invoice discount exceeds subtotal.");
  const total = subtotal - discount + tax + landing,
    paid = cents(input.paid);
  insist(
    Number.isSafeInteger(total) && total <= 1e12 && paid <= total,
    "Check invoice total and payment.",
  );
  // Cumulative rounding allocates every paisa, even on a zero-price invoice.
  const weight = subtotal || lines.reduce((a, l) => a + l.qty, 0);
  let running = 0,
    previous = 0;
  for (const l of lines) {
    running += subtotal ? l.base : l.qty;
    const allocated = Math.round(total * (running / weight));
    l.value = allocated - previous;
    previous = allocated;
  }
  const i = {
    id: input.id,
    branch,
    supplier: supplier.id,
    supplierName: supplier.name,
    external,
    date: today,
    lines,
    total,
    discount,
    tax,
    landing,
    draft,
    plannedPaid: paid,
  };
  if (old) invoices[invoices.indexOf(old)] = i;
  else invoices.unshift(i);
  if (!draft) {
    for (const l of lines)
      moveStock(
        products.find((p) => p.id === l.productId),
        branch,
        l.qty,
        l.value,
        "Supplier receipt",
        i.id,
      );
    if (paid) payment(i, paid);
  }
  return i;
}
function returnGoods(i, quantities) {
  findInvoice(i.id);
  insist(!i.draft, "Post receipt first.");
  const lines = [];
  i.lines.forEach((l, index) => {
    if (!Number(quantities[index])) return;
    const qty = units(quantities[index]),
      p = products.find((p) => p.id === l.productId);
    const prior = supplierReturns
      .filter((r) => r.invoice === i.id)
      .flatMap((r) => r.lines)
      .filter((r) => r.productId === p.id)
      .reduce((a, r) => a + r.qty, 0);
    insist(qty + prior <= l.qty, "Return exceeds eligible receipt quantity.");
    const credit =
      Math.round((l.value * (prior + qty)) / l.qty) -
      Math.round((l.value * prior) / l.qty);
    lines.push({
      productId: p.id,
      qty,
      credit,
      basis: issueValue(p, i.branch, qty),
    });
  });
  insist(lines.length, "Enter a return quantity.");
  const r = {
    ref: "PR-" + (supplierReturns.length + 1),
    date: today,
    invoice: i.id,
    branch: i.branch,
    lines,
    credit: lines.reduce((a, l) => a + l.credit, 0),
  };
  lines.forEach((l) =>
    moveStock(
      products.find((p) => p.id === l.productId),
      i.branch,
      -l.qty,
      -l.basis,
      "Supplier return",
      r.ref,
    ),
  );
  supplierReturns.push(r);
}
function purchaseRows() {
  const f = purchaseFilters;
  return invoices.filter(
    (i) =>
      scoped(i.branch) &&
      (f.period === "today"
        ? i.date === today
        : f.period === "month"
          ? i.date.startsWith(today.slice(0, 7))
          : i.date >= f.start && i.date <= f.end) &&
      [i.id, i.external, i.supplierName]
        .join(" ")
        .toLowerCase()
        .includes(f.search.toLowerCase()),
  );
}
const purchaseHeaders = [
  "Date",
  "Reference",
  "Supplier",
  "Branch",
  "Total",
  "Paid",
  "Due",
  "Refund due",
  "Status",
];
function purchaseCells(i) {
  const due = balance(i);
  return [
    i.date,
    i.id,
    i.supplierName,
    branchLabel(i.branch),
    netInvoice(i) / 100,
    cashPaid(i) / 100,
    Math.max(0, due) / 100,
    Math.max(0, -due) / 100,
    invoiceStatus(i),
  ];
}
const btn = (label, attr) =>
  '<button type="button" class="btn" ' + attr + ">" + label + "</button>";
purchases = function () {
  const f = purchaseFilters;
  return (
    title(
      "Purchases",
      "Supplier invoices and branch receiving",
      btn("Add Purchase", 'data-action="purchase"'),
    ) +
    '<form id="purchase-filters" class="toolbar"><select aria-label="Date range" class="field" id="pur-period">' +
    ["today", "month", "custom"]
      .map(
        (k) =>
          "<option " +
          (k === f.period ? "selected" : "") +
          ">" +
          k +
          "</option>",
      )
      .join("") +
    "</select>" +
    field("From", "pur-start", "date", f.start) +
    field("Through", "pur-end", "date", f.end) +
    field("Search supplier or reference", "pur-search", "search", f.search) +
    '<button class="btn">Apply</button></form>' +
    '<div class="toolbar">' +
    btn("Suppliers", 'id="suppliers"') +
    btn("Import opening stock", 'id="opening"') +
    btn("Export purchases CSV", 'id="purchase-csv"') +
    "</div>" +
    section(
      "Purchase invoices",
      table(
        [...purchaseHeaders, ""],
        purchaseRows().map((i) => [
          ...purchaseCells(i).map(slug),
          btn("View", 'data-invoice="' + i.id + '"'),
        ]),
      ),
    ) +
    "<details><summary>Inventory cost history</summary>" +
    table(
      [
        "Date",
        "Event",
        "Reference",
        "Branch",
        "Variant",
        "Units",
        "Value change",
      ],
      costAudit
        .filter((a) => scoped(a.branch))
        .slice()
        .reverse()
        .map((a) => [
          a.date,
          a.type,
          a.ref || "—",
          branchLabel(a.branch),
          slug(a.sku || products.find((p) => p.id === a.productId).sku),
          a.qty,
          money(a.value / 100),
        ]),
    ) +
    "</details>" +
    section(
      "Opening balances",
      table(
        ["Reference", "Date", "Branch", "SKU", "Units", "Unit cost"],
        openingBalances
          .filter((o) => scoped(o.branch))
          .map((o) => [
            o.ref,
            o.date,
            branchLabel(o.branch),
            slug(o.sku),
            o.qty,
            money(o.cost / 100),
          ]),
      ),
    ) +
    "<details><summary>Historical sample receipts · excluded from balances</summary>" +
    table(
      ["Reference", "Supplier", "Branch", "Total"],
      state.purchases
        .filter((p) => scoped(p.branch))
        .map((p) => [
          p.id,
          slug(p.supplier),
          branchLabel(p.branch),
          money(p.total),
        ]),
    ) +
    "</details>" +
    noReal
  );
};
function purchaseModal(name, body) {
  openModal("<h2>" + name + "</h2>" + body);
  $(".modal").classList.add("advanced-product-modal");
}
function safeSubmit(form, action) {
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      action(e);
    } catch (err) {
      form.querySelector("[role=alert]").textContent = err.message;
    }
  };
}
function finish(message) {
  closeModal();
  render();
  notify(message);
}
function receiveForm(ids = [], doc = null) {
  const id = doc?.id || "PO-" + ++invoiceSequence;
  const choices = catalogProducts().filter((p) => availableAt(p));
  if (!choices.length) return notify("No available variants.");
  const lines = doc
    ? doc.lines.map((l) => ({
        ...l,
        unit: l.unit / 100,
        discount: l.discount / 100,
      }))
    : (ids.length ? ids : [choices[0].id]).map((productId) => ({
        productId,
        qty: 1,
        unit: products.find((p) => p.id === productId).buyingPrice,
        discount: 0,
      }));
  const options = choices
    .map(
      (p) =>
        '<option value="' +
        p.id +
        '">' +
        slug(p.sku + " · " + p.name + " · " + p.size + " / " + p.color) +
        "</option>",
    )
    .join("");
  purchaseModal(
    "Add Purchase · " + id,
    '<form id="receive-form"><div class="form-row"><label>Receiving branch<select class="field" id="receive-branch" ' +
      (curBranch() === "all" ? "" : "disabled") +
      '><option value="">Choose branch</option>' +
      branchOptions(doc?.branch || curBranch()) +
      '</select></label><label>Supplier<select class="field" id="psupplier">' +
      suppliers
        .filter((s) => s.active)
        .map(
          (s) => '<option value="' + s.id + '">' + slug(s.name) + "</option>",
        )
        .join("") +
      "</select></label>" +
      field(
        "Supplier invoice number",
        "external",
        "text",
        doc?.external || "",
      ) +
      "</div>" +
      field("Find variant by SKU or barcode", "purchase-scan") +
      btn("Add matching variant", 'id="add-scan"') +
      '<div id="purchase-lines"></div>' +
      btn("Add line", 'id="purchase-line"') +
      '<div class="form-row">' +
      [
        ["Invoice discount", "discount"],
        ["Nonrecoverable tax", "tax"],
        ["Landing charges", "landing"],
        ["Paid amount", "paid"],
      ]
        .map(([label, k]) =>
          field(
            label,
            k,
            "number",
            (doc?.[k === "paid" ? "plannedPaid" : k] || 0) / 100,
          ),
        )
        .join("") +
      '</div><output id="purchase-total"></output><p id="receive-error" role="alert"></p><div class="modal-foot"><button class="btn" value="draft">Save draft</button><button class="btn primary" value="post">Confirm receipt</button></div></form>',
  );
  if (doc) $("#psupplier").value = doc.supplier;
  const draw = () => {
    $("#purchase-lines").innerHTML = lines
      .map(
        (l, n) =>
          "<fieldset><legend>Line " +
          (n + 1) +
          '</legend><label>Variant<select class="field" data-k="productId" ' +
          (!n ? 'id="receive-variant"' : "") +
          ">" +
          options +
          '</select></label><div class="form-row">' +
          [
            ["Quantity", "qty"],
            ["Actual unit cost", "unit"],
            ["Line discount", "discount"],
          ]
            .map(
              ([name, k]) =>
                "<label>" +
                name +
                '<input class="input" type="number" step="' +
                (k === "qty" ? "1" : ".01") +
                '" ' +
                (k === "qty" ? "data-receive-quantity" : "") +
                ' data-k="' +
                k +
                '" value="' +
                l[k] +
                '"></label>',
            )
            .join("") +
          "</div>" +
          btn("Remove", 'data-remove="' + n + '"') +
          "</fieldset>",
      )
      .join("");
    $("#purchase-lines")
      .querySelectorAll("fieldset")
      .forEach((row, n) => {
        row.querySelector("select").value = lines[n].productId;
        row.oninput = (e) => {
          const k = e.target.dataset.k;
          if (!k) return;
          lines[n][k] =
            k === "productId" ? Number(e.target.value) : e.target.value;
          if (k === "productId") {
            lines[n].unit = products.find(
              (p) => p.id === lines[n].productId,
            ).buyingPrice;
            draw();
          }
          total();
        };
        row.querySelector("button").onclick = () => {
          lines.splice(n, 1);
          draw();
        };
      });
    total();
  };
  const total = () => {
    $("#purchase-total").textContent =
      "Invoice total " +
      money(
        lines.reduce((a, l) => a + l.qty * l.unit - l.discount, 0) -
          Number($("#discount").value) +
          Number($("#tax").value) +
          Number($("#landing").value),
      );
  };
  draw();
  $("#receive-form").oninput = total;
  function add(p) {
    if (!p) return notify("Choose a matching available SKU or barcode.");
    const line = lines.find((l) => l.productId === p.id);
    if (line) line.qty = Number(line.qty) + 1;
    else
      lines.push({ productId: p.id, qty: 1, unit: p.buyingPrice, discount: 0 });
    draw();
  }
  $("#purchase-line").onclick = () =>
    add(choices.find((p) => !lines.some((l) => l.productId === p.id)));
  $("#add-scan").onclick = () => {
    add(
      choices.find((p) => matchesVariant(p, $("#purchase-scan").value.trim())),
    );
    $("#purchase-scan").value = "";
  };
  $("#purchase-scan").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#add-scan").click();
    }
  };
  $("#receive-form")
    .querySelectorAll("input[type=number]")
    .forEach(
      (el) =>
        (el.step = el.hasAttribute("data-receive-quantity") ? "1" : ".01"),
    );
  safeSubmit($("#receive-form"), (e) => {
    saveInvoice(
      {
        id,
        branch: $("#receive-branch").value,
        supplier: $("#psupplier").value,
        external: $("#external").value,
        lines,
        ...Object.fromEntries(
          ["discount", "tax", "landing", "paid"].map((k) => [
            k,
            $("#" + k).value,
          ]),
        ),
      },
      e.submitter?.value === "draft",
    );
    finish(
      e.submitter?.value === "draft"
        ? "Purchase draft saved"
        : "Supplier receipt posted",
    );
  });
}
function invoiceDetail(id) {
  const i = findInvoice(id);
  const history = [
    ...settlements
      .filter((s) => s.invoice === id)
      .map((s) => [
        s.ref,
        s.date,
        s.amount < 0 ? "Supplier refund" : "Payment",
        money(Math.abs(s.amount) / 100),
      ]),
    ...supplierReturns
      .filter((r) => r.invoice === id)
      .map((r) => [
        r.ref,
        r.date,
        "Return · " +
          r.lines
            .map(
              (l) =>
                i.lines.find((x) => x.productId === l.productId).sku +
                " × " +
                l.qty,
            )
            .join(", "),
        money(r.credit / 100),
      ]),
  ];
  purchaseModal(
    "Purchase detail",
    '<article id="demo-receipt"><h3>QAHAF · ' +
      id +
      "</h3><p>" +
      slug(i.supplierName) +
      " · " +
      branchLabel(i.branch) +
      " · " +
      i.date +
      " · " +
      slug(i.external) +
      " · " +
      invoiceStatus(i) +
      "</p>" +
      table(
        [
          "Variant",
          "SKU",
          "Units",
          "Actual cost",
          "Line discount",
          "Landed value",
        ],
        i.lines.map((l) => [
          slug(l.name + " · " + l.size + " / " + l.color),
          slug(l.sku),
          l.qty,
          money(l.unit / 100),
          money(l.discount / 100),
          money(l.value / 100),
        ]),
      ) +
      "<p>Discount " +
      money(i.discount / 100) +
      " · Tax " +
      money(i.tax / 100) +
      " · Landing " +
      money(i.landing / 100) +
      " · Original total " +
      money(i.total / 100) +
      "</p><p>Net invoice " +
      money(netInvoice(i) / 100) +
      " · Net paid " +
      money(cashPaid(i) / 100) +
      " · " +
      (balance(i) < 0 ? "Refund due " : "Due ") +
      money(Math.abs(balance(i)) / 100) +
      "</p>" +
      table(
        ["Reference", "Date", "Activity", "Amount"],
        history.map((row) => row.map(slug)),
      ) +
      '</article><div class="toolbar">' +
      btn("Print", 'onclick="window.print()"') +
      (i.draft
        ? btn("Edit / receive draft", 'id="resume"')
        : btn("Return goods", 'id="return-goods"') +
          (balance(i)
            ? btn(
                balance(i) > 0 ? "Record payment" : "Record refund",
                'id="settle"',
              )
            : "")) +
      btn("Close", "data-close") +
      "</div>",
  );
  if (i.draft) {
    $("#resume").onclick = () => receiveForm([], i);
    return;
  }
  if ($("#settle"))
    $("#settle").onclick = () => {
      purchaseModal(
        balance(i) > 0 ? "Supplier payment" : "Supplier refund",
        '<form id="settlement">' +
          field("Amount", "amount", "number", Math.abs(balance(i)) / 100) +
          '<p role="alert"></p><button class="btn primary">Record</button></form>',
      );
      $("#amount").step = ".01";
      safeSubmit($("#settlement"), () => {
        payment(i, Math.sign(balance(i)) * cents($("#amount").value));
        finish("Settlement recorded");
      });
    };
  $("#return-goods").onclick = () => {
    purchaseModal(
      "Return against " + id,
      '<form id="return-form">' +
        i.lines
          .map((l, n) =>
            field(l.sku + " · units to return", "return-" + n, "number", 0),
          )
          .join("") +
        '<p role="alert"></p><button class="btn primary">Post return</button></form>',
    );
    safeSubmit($("#return-form"), () => {
      returnGoods(
        i,
        i.lines.map((_, n) => $("#return-" + n).value),
      );
      finish("Purchase return recorded");
    });
  };
}
function supplierList() {
  purchaseModal(
    "Suppliers",
    field("Search suppliers", "supplier-search") +
      btn("Add supplier", 'id="new-supplier"') +
      '<div id="supplier-list"></div>',
  );
  const draw = () => {
    $("#supplier-list").innerHTML = table(
      [
        "Supplier",
        "Phone",
        "Status",
        "Net purchases",
        "Net paid",
        "Due",
        "Refund due",
        "",
      ],
      suppliers
        .filter((s) =>
          [s.name, s.phone]
            .join(" ")
            .toLowerCase()
            .includes($("#supplier-search").value.toLowerCase()),
        )
        .map((s) => {
          const docs = invoices.filter(
              (i) => !i.draft && i.supplier === s.id && scoped(i.branch),
            ),
            sum = (fn) => money(docs.reduce((a, i) => a + fn(i), 0) / 100);
          return [
            slug(s.name),
            slug(s.phone),
            s.active ? "Active" : "Inactive",
            sum(netInvoice),
            sum(cashPaid),
            sum((i) => Math.max(0, balance(i))),
            sum((i) => Math.max(0, -balance(i))),
            btn("Edit", 'data-supplier="' + s.id + '"'),
          ];
        }),
    );
    document
      .querySelectorAll("[data-supplier]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            supplierForm(
              suppliers.find((s) => s.id === Number(b.dataset.supplier)),
            )),
      );
  };
  draw();
  $("#supplier-search").oninput = draw;
  $("#new-supplier").onclick = () => supplierForm();
}
function supplierForm(s) {
  purchaseModal(
    s ? "Edit supplier" : "Add supplier",
    '<form id="supplier-form">' +
      ["name", "phone", "address", "notes"]
        .map((k) => field(k, "supplier-" + k, "text", s?.[k] || ""))
        .join("") +
      '<label><input id="supplier-active" type="checkbox" ' +
      (!s || s.active ? "checked" : "") +
      '> Active supplier</label><p role="alert"></p><button class="btn primary">Save supplier</button></form>',
  );
  safeSubmit($("#supplier-form"), () => {
    const data = Object.fromEntries(
      ["name", "phone", "address", "notes"].map((k) => [
        k,
        $("#supplier-" + k).value.trim(),
      ]),
    );
    insist(
      data.name &&
        !suppliers.some(
          (x) => x !== s && x.name.toLowerCase() === data.name.toLowerCase(),
        ),
      "Enter a unique supplier name.",
    );
    data.active = $("#supplier-active").checked;
    if (s) Object.assign(s, data);
    else suppliers.push({ ...data, id: suppliers.length + 1 });
    supplierList();
  });
}
function openingPreview(text) {
  const [header, ...rows] = parseCatalogCsv(text);
  insist(
    header &&
      header.join(",") === "branch,sku,quantity,buying_cost" &&
      rows.length,
    "Use header branch,sku,quantity,buying_cost and at least one row.",
  );
  const keys = new Set(
    openingBalances.map((o) => o.branch + "/" + o.productId),
  );
  return rows.map((cells, n) => {
    try {
      insist(cells.length === 4, "Expected four fields.");
      const [branchName, sku, q, c] = cells.map((s) => s.trim()),
        branch = Number(
          APP_CONFIG.branches.find((b) =>
            [b.id, b.name.toLowerCase()].includes(branchName.toLowerCase()),
          )?.id,
        );
      branchCheck(branch);
      const p = catalogProducts().find(
        (p) => p.sku.toUpperCase() === sku.toUpperCase(),
      );
      insist(p && availableAt(p, branch), "Unknown or unavailable SKU.");
      const key = branch + "/" + p.id;
      insist(
        !keys.has(key),
        "Duplicate opening balance for branch and variant.",
      );
      keys.add(key);
      return {
        branch,
        productId: p.id,
        sku: p.sku,
        qty: units(q),
        cost: cents(c),
      };
    } catch (e) {
      throw Error("Row " + (n + 2) + " · " + e.message);
    }
  });
}
function openingForm() {
  purchaseModal(
    "Opening stock import",
    '<form id="opening-form"><label>CSV file<input id="opening-file" type="file" accept=".csv,text/csv"></label><label>Opening balances CSV<textarea class="input" rows="6" id="opening-text">branch,sku,quantity,buying_cost</textarea></label>' +
      btn("Preview", 'id="opening-preview"') +
      '<div id="opening-rows"></div><p role="alert"></p><button class="btn primary" id="post-opening" disabled>Post balances</button></form>',
  );
  let preview = null;
  const invalidate = () => {
    preview = null;
    $("#post-opening").disabled = true;
    $("#opening-rows").innerHTML = "";
  };
  $("#opening-text").oninput = invalidate;
  $("#opening-file").onchange = async (e) => {
    invalidate();
    const target = $("#opening-text");
    if (e.target.files[0]) target.value = await e.target.files[0].text();
  };
  $("#opening-preview").onclick = () => {
    invalidate();
    try {
      const rows = openingPreview($("#opening-text").value);
      preview = JSON.stringify(rows);
      $("#opening-rows").innerHTML = table(
        ["Branch", "SKU", "Quantity", "Cost"],
        rows.map((o) => [
          branchLabel(o.branch),
          slug(o.sku),
          o.qty,
          money(o.cost / 100),
        ]),
      );
      $("#post-opening").disabled = false;
      $("#opening-form [role=alert]").textContent = "";
    } catch (e) {
      $("#opening-form [role=alert]").textContent = e.message;
    }
  };
  safeSubmit($("#opening-form"), () => {
    const rows = openingPreview($("#opening-text").value);
    insist(JSON.stringify(rows) === preview, "Preview the current rows first.");
    for (const row of rows) {
      const ref = "OPEN-" + (openingBalances.length + 1);
      moveStock(
        products.find((p) => p.id === row.productId),
        row.branch,
        row.qty,
        row.qty * row.cost,
        "Opening import",
        ref,
      );
      openingBalances.push({ ...row, ref, date: today });
    }
    finish("Opening balances posted");
  });
}
const beforePurchasingBind = bind;
bind = function () {
  beforePurchasingBind();
  if (state.page !== "purchases") return;
  $('[data-action="purchase"]').onclick = () => receiveForm();
  $("#suppliers").onclick = supplierList;
  $("#opening").onclick = openingForm;
  $("#purchase-csv").onclick = () =>
    downloadCatalogCsv("purchase-list", [
      purchaseHeaders,
      ...purchaseRows().map(purchaseCells),
    ]);
  $("#purchase-filters").onsubmit = (e) => {
    e.preventDefault();
    Object.assign(purchaseFilters, {
      period: $("#pur-period").value,
      start: $("#pur-start").value,
      end: $("#pur-end").value,
      search: $("#pur-search").value,
    });
    render();
  };
  document
    .querySelectorAll("[data-invoice]")
    .forEach((b) => (b.onclick = () => invoiceDetail(b.dataset.invoice)));
};
function returnVariance(period, branch = curBranch()) {
  return (
    supplierReturns
      .filter(
        (r) =>
          r.date.startsWith(period) &&
          (branch === "all" || r.branch === Number(branch)),
      )
      .reduce(
        (sum, r) => sum + r.lines.reduce((v, l) => v + l.credit - l.basis, 0),
        0,
      ) / 100
  );
}
