// Reporting reads existing documents. Monetary fields in report models are integer paisa.
const reportGroups = {
  "Profit & Sales": [
    "Profit/Loss",
    "Product Sell",
    "Sales Representative",
    "Register",
    "Purchase & Sale",
    "Trending Products",
  ],
  "Purchases & Payments": [
    "Product Purchase",
    "Due Payment",
    "Due Collection",
    "Sell Payment",
    "Purchase Payment",
  ],
  "Expenses & Discounts": ["Expense", "Discount"],
  Inventory: ["Items", "Stock Adjustment", "Stock Alert", "Stock"],
  Contacts: ["Customer Groups", "Supplier & Customer"],
  "Compliance & Audit": ["Tax", "Activity Log"],
};
const profitTabs = [
  "Products",
  "Categories",
  "Invoice",
  "Date",
  "Customer",
  "Day",
];
const managerReports = [
  "Items",
  "Stock Alert",
  "Product Purchase",
  "Due Collection",
  "Stock Adjustment",
];
const reportState = {
  report: "Profit/Loss",
  tab: "Products",
  preset: "This Month",
  from: today.slice(0, 7) + "-01",
  to: today,
  query: "",
  sort: -1,
  desc: false,
  page: 0,
  linked: false,
};
const rptSum = (rows, key) => rows.reduce((n, r) => n + (r[key] || 0), 0);
const paisa = (n) => Math.round(n * 100);
const ratio = (n, d) => (d > 0 ? (100 * n) / d : null);
const dayShift = (date, delta) =>
  new Date(Date.parse(date) + delta * 86400000).toISOString().slice(0, 10);
function reportDates(preset, day = today) {
  const start = day.slice(0, 7) + "-01",
    previous = dayShift(start, -1);
  switch (preset) {
    case "Yesterday":
      return [dayShift(day, -1), dayShift(day, -1)];
    case "This Week":
      return [dayShift(day, -((new Date(day).getUTCDay() + 6) % 7)), day];
    case "This Month":
      return [start, day];
    case "Last Month":
      return [previous.slice(0, 7) + "-01", previous];
    default:
      return [day, day];
  }
}
function reportingContext(f = reportState, b = curBranch()) {
  insist(
    state.role === "owner" || String(b) === curBranch(),
    "Assigned branch only.",
  );
  const branch = (r) => b === "all" || r.branch === Number(b),
    within = (r) => branch(r) && r.date >= f.from && r.date <= f.to,
    asOf = (r) => branch(r) && r.date <= f.to;
  const sales = ledger.filter(
      (s) => within(s) && (!f.linked || s.lines[0]?.net != null),
    ),
    expenses = state.expenses.filter((e) => within(e) && (!f.linked || e.ref));
  const purchases = invoices.filter((i) => !i.draft && within(i)),
    credits = supplierReturns.filter(within),
    funds = fundBook.entries.filter(within),
    events = stockOps.events.filter(within);
  const dueSale = (s) =>
    s.total -
    rptSum(
      retail.returns.filter((r) => r.original === s.id && asOf(r)),
      "credit",
    ) -
    rptSum(
      retail.payments.filter((p) => p.invoice === s.id && asOf(p)),
      "value",
    );
  const duePurchase = (i) =>
    i.total -
    rptSum(
      supplierReturns.filter((r) => r.invoice === i.id && asOf(r)),
      "credit",
    ) -
    rptSum(
      settlements.filter((p) => p.invoice === i.id && asOf(p)),
      "amount",
    );
  const lines = sales.flatMap((s) => {
    const parent = s.original
      ? retail.sales.find((i) => i.id === s.original)
      : s;
    const customer =
      parent?.customerName ||
      customersData.find((c) => c.id === s.customerId)?.name ||
      parent?.phone ||
      "Walk-in / unidentified";
    return s.lines.map((l) => {
      const net = l.net ?? paisa(l.revenue),
        cost = l.basis ?? paisa(l.revenue - l.profit),
        discount = l.refund ? 0 : paisa(l.discount),
        embedded = l.vat === "included" && !l.refund ? l.tax || 0 : 0;
      return {
        s,
        l,
        branch: s.branch,
        date: s.date,
        id: s.id,
        customer,
        customerKey: parent?.phone || s.customerId || "walk-in",
        sku: l.sku,
        product: l.productName,
        variant: l.color + " / " + l.size,
        category: l.categoryLabel,
        qty: l.qty * (l.refund ? -1 : 1),
        gross: l.refund ? 0 : net + discount + embedded,
        discount,
        embedded,
        returns: l.refund ? -net : 0,
        net,
        cost,
        profit: net - cost,
      };
    });
  });
  return {
    f,
    b,
    branch,
    within,
    asOf,
    sales,
    lines,
    expenses,
    purchases,
    credits,
    funds,
    events,
    dueSale,
    duePurchase,
    branches: b === "all" ? [1, 2] : [+b],
  };
}
function periodResult(c, day = null) {
  const select = (rows) => (day ? rows.filter((r) => r.date === day) : rows),
    lines = select(c.lines),
    events = select(c.events);
  const net = rptSum(lines, "net"),
    cost = rptSum(lines, "cost"),
    expense = sumBy(select(c.expenses), (e) => paisa(e.amount));
  const income = rptSum(select(c.funds), "profit") + rptSum(events, "recovery");
  const loss = sumBy(events, (e) =>
    e.kind === "Write off"
      ? e.basis
      : e.kind === "Missing/Lost"
        ? -e.result
        : 0,
  );
  const variance = sumBy(select(c.credits), (r) =>
    sumBy(r.lines, (l) => l.credit - l.basis),
  );
  const adjustments =
    variance +
    rptSum(
      events.filter((e) => e.kind === "Count adjustment"),
      "result",
    );
  return {
    gross: rptSum(lines, "gross"),
    discount: rptSum(lines, "discount"),
    embedded: rptSum(lines, "embedded"),
    returns: rptSum(lines, "returns"),
    net,
    cost,
    profit: net - cost,
    expense,
    income,
    loss,
    adjustments,
    variance,
    operating: net - cost - expense + income - loss + adjustments,
  };
}
function stockAt(p, b, date) {
  if (date >= today)
    return { ...position(p, b), ...availabilityAge(p, b, date) };
  const start = costAudit.find(
    (e) =>
      e.branch === b && e.productId === p.id && e.type === "Session baseline",
  );
  let qty = start?.qty || 0,
    value = start?.value || 0;
  if (date < dayShift(firstSeedDay, -1)) return null;
  for (const s of seededSales)
    if (s.branch === b && s.date > date)
      for (const l of s.lines)
        if (l.productId === p.id) {
          qty += l.qty * (l.refund ? -1 : 1);
          value += paisa(l.revenue - l.profit);
        }
  const selling = paisa(qty * p.price);
  return {
    qty,
    value,
    total: value,
    defects: 0,
    quarantined: 0,
    transit: 0,
    travelling: 0,
    selling,
    margin:
      Math.round(selling / (p.vat === "included" ? 1 + retail.rate / 100 : 1)) -
      value,
    ...availabilityAge(p, b, date),
  };
}
function stockAsOf(c, date) {
  return c.branches.flatMap((b) =>
    products.flatMap((p) => {
      const v = stockAt(p, b, date);
      return v &&
        (v.qty ||
          v.total ||
          (!p.deleted &&
            availableAt(p, b) &&
            (date >= today ||
              costAudit.some(
                (e) => e.productId === p.id && e.type === "Session baseline",
              ))))
        ? [{ p, b, ...v }]
        : [];
    }),
  );
}
function reportBalances(c) {
  const rows = stockAsOf(c, c.f.to),
    openingDate = dayShift(c.f.from, -1);
  const expenseLiability =
    sumBy(
      state.expenses.filter((e) => e.ref && c.asOf(e)),
      (e) => e.total,
    ) +
    rptSum(
      fundBook.entries.filter((e) => c.asOf(e) && e.source === "Expense"),
      "value",
    );
  return {
    opening:
      openingDate < dayShift(firstSeedDay, -1)
        ? null
        : rptSum(stockAsOf(c, openingDate), "total"),
    closing: c.f.to < dayShift(firstSeedDay, -1) ? null : rptSum(rows, "total"),
    selling:
      c.f.to < dayShift(firstSeedDay, -1) ? null : rptSum(rows, "selling"),
    potential:
      c.f.to < dayShift(firstSeedDay, -1) ? null : rptSum(rows, "margin"),
    qty: c.f.to < dayShift(firstSeedDay, -1) ? null : rptSum(rows, "qty"),
    purchases: rptSum(c.purchases, "total"),
    purchaseReturns: rptSum(c.credits, "credit"),
    payments: -rptSum(
      c.funds.filter((e) => /Supplier payment/i.test(e.kind)),
      "value",
    ),
    supplier: sumBy(
      invoices.filter((i) => !i.draft && c.asOf(i)),
      (i) => Math.max(0, c.duePurchase(i)),
    ),
    customer: sumBy(retail.sales.filter(c.asOf), c.dueSale),
    expenseLiability,
  };
}
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
function groupedProfit(c, tab) {
  const groups = new Map(),
    byBranch = new Map();
  function group(key, label, extra = []) {
    if (!groups.has(key))
      groups.set(key, {
        key,
        label,
        extra,
        qty: 0,
        gross: 0,
        discount: 0,
        returns: 0,
        net: 0,
        cost: 0,
        profit: 0,
        allocation: 0,
        sold: 0,
        returned: 0,
        docs: new Set(),
        sources: new Set(),
        due: 0,
      });
    return groups.get(key);
  }
  if (tab === "Day") weekdays.forEach((d, i) => group(i, d));
  for (const r of c.lines) {
    let key,
      label,
      extra = [];
    switch (tab) {
      case "Products":
        key = r.l.productId;
        label = r.product;
        extra = [r.sku, r.variant];
        break;
      case "Categories":
        key = r.l.categoryId;
        label = r.category;
        break;
      case "Invoice":
        key = label = r.id;
        extra = [r.date, branchLabel(r.branch), r.customer];
        break;
      case "Date":
        key = label = r.date;
        break;
      case "Customer":
        key = r.customerKey;
        label = r.customer;
        break;
      case "Day":
        key = (new Date(r.date).getUTCDay() + 6) % 7;
        label = weekdays[key];
        break;
    }
    const g = group(key, label, extra);
    g.sources.add(r.id);
    if (r.l.refund) g.returned += r.l.qty;
    else g.sold += r.l.qty;
    for (const k of [
      "qty",
      "gross",
      "discount",
      "returns",
      "net",
      "cost",
      "profit",
    ])
      g[k] += r[k];
    if (!r.l.refund) g.docs.add(r.id);
    if (["Products", "Categories"].includes(tab)) {
      const bucket = byBranch.get(r.branch) || new Map();
      byBranch.set(r.branch, bucket);
      const p = bucket.get(r.l.productId) || { net: 0, key };
      p.net += r.net;
      bucket.set(r.l.productId, p);
    }
  }
  let unallocated = 0;
  for (const b of c.branches) {
    const exp = sumBy(
      c.expenses.filter((e) => e.branch === b),
      (e) => paisa(e.amount),
    );
    const weights = [...(byBranch.get(b)?.values() || [])];
    const total = rptSum(weights, "net");
    if (total <= 0) {
      unallocated += exp;
      continue;
    }
    let running = 0,
      allocated = 0;
    for (const w of weights) {
      running += w.net;
      const share = Math.round((exp * running) / total) - allocated;
      allocated += share;
      groups.get(w.key).allocation += share;
    }
  }
  if (tab === "Date")
    for (const r of [
      ...c.expenses,
      ...c.credits,
      ...c.events,
      ...c.funds.filter((e) => e.profit),
    ])
      group(r.date, r.date);
  if (tab === "Customer")
    for (const s of retail.sales.filter(c.asOf)) {
      const due = c.dueSale(s);
      if (due)
        group(
          s.phone || "walk-in",
          s.customerName || s.phone || "Walk-in / unidentified",
        ).due += due;
    }
  return { groups: [...groups.values()], unallocated };
}
// Column prefixes encode money (integer paisa), additive counts, rates and non-additive unit measures.
function reportTable(title, headers, rows, notes = "") {
  return { title, headers, rows, notes, summary: [], support: [] };
}
const srcRow = (v, ref = null) => ({ v, ref });
function profitReport(c, tab) {
  const p = periodResult(c),
    bal = reportBalances(c),
    { groups, unallocated } = groupedProfit(c, tab);
  let headers, rows;
  if (tab === "Products" || tab === "Categories") {
    headers = [
      ...(tab === "Products" ? ["Product", "SKU", "Variant"] : ["Category"]),
      "#Units sold",
      "#Units returned",
      "#Net units",
      "$Gross sales",
      "$Discounts",
      "$Sales returns",
      "$Net sales",
      "$COGS",
      "$Gross profit",
      "%Gross margin",
      "$Allocated branch expenses",
      "$Allocated contribution",
    ];
    rows = groups.map((g) =>
      srcRow([
        g.label,
        ...g.extra,
        g.sold,
        g.returned,
        g.qty,
        g.gross,
        g.discount,
        g.returns,
        g.net,
        g.cost,
        g.profit,
        ratio(g.profit, g.net),
        g.allocation,
        g.profit - g.allocation,
      ]),
    );
  }
  if (tab === "Invoice") {
    headers = [
      "Invoice / return",
      "Date",
      "Branch",
      "Customer",
      "$Net sales",
      "$COGS",
      "$Gross profit",
      "%Gross margin",
    ];
    rows = groups.map((g) =>
      srcRow(
        [g.label, ...g.extra, g.net, g.cost, g.profit, ratio(g.profit, g.net)],
        g.key,
      ),
    );
  }
  if (tab === "Date") {
    headers = [
      "Date",
      "$Net sales",
      "$Sales returns",
      "$COGS",
      "$Expenses",
      "$Gross profit",
      "$Operating profit",
    ];
    rows = groups
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((g) => {
        const d = periodResult(c, g.key);
        return srcRow([
          g.key,
          g.net,
          g.returns,
          g.cost,
          d.expense,
          g.profit,
          d.operating,
        ]);
      });
  }
  if (tab === "Customer") {
    headers = [
      "Customer",
      "#Purchases",
      "$Net sales",
      "$COGS",
      "$Gross profit",
      "$Sales returns",
      "$Outstanding due",
    ];
    rows = groups.map((g) =>
      srcRow([g.label, g.docs.size, g.net, g.cost, g.profit, g.returns, g.due]),
    );
  }
  if (tab === "Day") {
    headers = [
      "Weekday",
      "#Transactions",
      "$Net sales",
      "$COGS",
      "$Gross profit",
    ];
    rows = groups.map((g) =>
      srcRow([g.label, g.sources.size, g.net, g.cost, g.profit]),
    );
  }
  rows.forEach((row, i) => {
    if (!row.ref && groups[i].sources.size)
      row.sources = [...groups[i].sources];
  });
  const m = reportTable(
    "Profit & Loss · " + tab,
    headers,
    rows,
    "Revenue and COGS use posting-date sale and return snapshots. Margins require positive net sales. Allocation uses signed product revenue within each branch. Branches with zero or negative net sales retain unallocated expenses. Inventory balances include the sample opening stock.",
  );
  m.summary = [
    ["$Gross sales", p.gross],
    ["$Sales discounts", p.discount],
    ["$Embedded VAT on sales", p.embedded],
    ["$Sales returns excluding VAT", p.returns],
    ["$Net sales excluding VAT", p.net],
    ["$Cost of goods sold", p.cost],
    ["$Gross profit", p.profit],
    ["$Operating expenses", p.expense],
    ["$Other income and recoveries", p.income],
    ["$Stock write-off loss", p.loss],
    ["$Other adjustments (signed)", p.adjustments],
    ["$Net operating profit", p.operating],
    ["%Gross profit margin", ratio(p.profit, p.net)],
    ["%Net profit margin", ratio(p.operating, p.net)],
  ];
  m.support = [
    ["$Purchases", bal.purchases],
    ["$Purchase returns", bal.purchaseReturns],
    ["$Supplier payments issued", bal.payments],
    ["$Supplier dues", bal.supplier],
    ["$Customer dues", bal.customer],
    ["$Unpaid expense liabilities", bal.expenseLiability],
    ["$Opening inventory buying value", bal.opening],
    ["$Closing inventory buying value", bal.closing],
    ["$Stock selling value at current prices", bal.selling],
    ["$Potential margin on unsold units", bal.potential],
    ["$Supplier return variance", p.variance],
  ];
  if (["Products", "Categories"].includes(tab))
    m.support.push(["$Unallocated branch expenses", unallocated]);
  return m;
}
function isDuePayment(e) {
  return (
    e.timing === "Payable settlement" &&
    /Supplier payment|Expense payment/i.test(e.kind)
  );
}
function paymentReport(c, name) {
  let rows = c.funds
    .filter((e) => {
      switch (name) {
        case "Due Collection":
          return /Due collection/i.test(e.kind);
        case "Sell Payment":
          return e.source === "Retail" || /Due collection/i.test(e.kind);
        case "Purchase Payment":
          return /Supplier/.test(e.kind);
        default:
          return isDuePayment(e);
      }
    })
    .map((e) =>
      srcRow(
        [
          e.date,
          branchLabel(e.branch),
          e.ref,
          e.document,
          [e.kind, e.timing].filter(Boolean).join(" · "),
          e.accountName,
          Math.max(0, e.value),
          Math.max(0, -e.value),
          0,
        ],
        e.document,
      ),
    );
  if (name === "Purchase Payment")
    rows.push(
      ...c.credits.map((r) =>
        srcRow(
          [
            r.date,
            branchLabel(r.branch),
            r.ref,
            r.invoice,
            "Purchase return credit",
            "—",
            0,
            0,
            r.credit,
          ],
          r.invoice,
        ),
      ),
    );
  return reportTable(
    name,
    [
      "Date",
      "Branch",
      "Reference",
      "Document",
      "Movement",
      "Account",
      "$Received",
      "$Paid",
      "$Noncash credit",
    ],
    rows,
    "Directions follow the branch account. Settlement reversals use their recorded direction.",
  );
}
function historicalExpense(c, e) {
  if (!e.ref) return ["Historical sample", null, null];
  if (
    e.source === "Reversal" ||
    state.expenses.some(
      (x) => x.source === "Reversal" && x.original === e.ref && c.asOf(x),
    )
  )
    return ["Reversal / reversed", 0, 0];
  const paid = -rptSum(
    fundBook.entries.filter(
      (x) => c.asOf(x) && x.source === "Expense" && x.document === e.ref,
    ),
    "value",
  );
  return [
    e.total === paid ? "Paid" : paid ? "Partial" : "Unpaid",
    paid,
    e.total - paid,
  ];
}
function otherReport(c, name) {
  const tableOf = (headers, rows, note = "") =>
    reportTable(name, headers, rows, note);
  if (
    [
      "Due Collection",
      "Sell Payment",
      "Due Payment",
      "Purchase Payment",
    ].includes(name)
  )
    return paymentReport(c, name);
  if (["Sales Representative", "Customer Groups"].includes(name))
    return name === "Sales Representative"
      ? tableOf(
          ["Representative", "#Invoices", "$Net sales"],
          [],
          "No sales-representative attribution is recorded. Owner and Manager are application roles.",
        )
      : tableOf(
          ["Customer group", "#Customers", "$Net sales"],
          [],
          "Customer group assignments await Phase 8.",
        );
  if (name === "Product Sell" || name === "Trending Products") {
    const rows = groupedProfit(c, "Products")
      .groups.sort((a, b) => b.qty - a.qty || b.net - a.net)
      .map((g) => ({
        ...srcRow([
          g.label,
          ...g.extra,
          g.qty,
          g.net,
          g.returns,
          g.cost,
          g.profit,
        ]),
        sources: [...g.sources],
      }));
    return tableOf(
      [
        "Product",
        "SKU",
        "Variant",
        "#Net units",
        "$Net sales",
        "$Returns",
        "$COGS",
        "$Gross profit",
      ],
      rows,
      "Sort the quantity, net sales or gross profit column to compare products.",
    );
  }
  if (name === "Register") {
    const rows = fundBook.accounts
      .filter((a) => c.branch(a) && a.date <= c.f.to)
      .map((a) => {
        const r = fundRange(String(a.branch), c.f.from, c.f.to, a.id);
        return srcRow(
          [
            branchLabel(a.branch),
            a.name,
            r.opening,
            r.inflow,
            r.outflow,
            r.closing,
          ],
          a.id,
        );
      });
    const m = tableOf(
      ["Branch", "Account", "$Opening", "$Received", "$Paid", "$Closing"],
      rows,
      "Account turnover includes internal transfers. External cash flow excludes internal transfers and balance corrections.",
    );
    m.summary = cashSummary(fundRange(c.b, c.f.from, c.f.to)).map(([k, v]) => [
      "$" + k,
      v,
    ]);
    return m;
  }
  if (name === "Purchase & Sale") {
    const map = new Map();
    function add(r, key, amount) {
      const k = r.date + "/" + r.branch;
      const row = map.get(k) || [r.date, branchLabel(r.branch), 0, 0, 0, 0];
      row[key] += amount;
      map.set(k, row);
    }
    c.purchases.forEach((i) => add(i, 2, i.total));
    c.credits.forEach((r) => add(r, 3, r.credit));
    c.lines.forEach((r) => {
      add(r, 4, r.net);
      add(r, 5, r.cost);
    });
    return tableOf(
      [
        "Date",
        "Branch",
        "$Purchases",
        "$Purchase credits",
        "$Net sales",
        "$Sale COGS",
      ],
      [...map.values()].map((v) => srcRow(v)),
    );
  }
  if (name === "Product Purchase") {
    const rows = [];
    function add(doc, date, id, l, credit) {
      const original = doc.lines.find((x) => x.productId === l.productId);
      rows.push(
        srcRow(
          [
            date,
            branchLabel(doc.branch),
            doc.supplierName,
            id,
            doc.id,
            original.name,
            original.sku,
            credit ? -l.qty : l.qty,
            credit ? 0 : l.value,
            credit ? l.credit : 0,
            c.duePurchase(doc),
          ],
          doc.id,
        ),
      );
    }
    c.purchases.forEach((i) =>
      i.lines.forEach((l) => add(i, i.date, i.id, l, false)),
    );
    c.credits.forEach((r) =>
      r.lines.forEach((l) =>
        add(
          invoices.find((i) => i.id === r.invoice),
          r.date,
          r.ref,
          l,
          true,
        ),
      ),
    );
    return tableOf(
      [
        "Date",
        "Branch",
        "Supplier",
        "Reference",
        "Purchase",
        "Product",
        "SKU",
        "#Net units",
        "$Landed cost",
        "$Return credit",
        "$Invoice balance",
      ],
      rows,
      "The total counts each matching invoice balance once. A negative balance is a supplier credit.",
    );
  }
  if (name === "Expense")
    return tableOf(
      [
        "Date",
        "Branch",
        "Category",
        "Description",
        "Reference",
        "$Expense",
        "Status",
        "$Paid",
        "$Payable",
      ],
      c.expenses.map((e) =>
        srcRow(
          [
            e.date,
            branchLabel(e.branch),
            e.cat,
            e.title,
            e.ref || "Historical sample",
            paisa(e.amount),
            ...historicalExpense(c, e),
          ],
          e.ref,
        ),
      ),
    );
  if (name === "Discount")
    return tableOf(
      [
        "Date",
        "Branch",
        "Invoice / return",
        "Product",
        "SKU",
        "Campaign / source",
        "$Item or campaign discount",
        "$Allocated invoice discount",
        "$Net discount",
      ],
      c.lines
        .filter((r) => r.l.discount)
        .map((r) =>
          srcRow(
            [
              r.date,
              branchLabel(r.branch),
              r.id,
              r.product,
              r.sku,
              r.l.offer || "Historical / item",
              r.l.itemDiscount ?? paisa(r.l.discount),
              r.l.invoiceDiscount || 0,
              paisa(r.l.discount),
            ],
            r.id,
          ),
        ),
      "Return postings reverse original discount shares.",
    );
  if (["Items", "Stock", "Stock Alert"].includes(name)) {
    const rows = stockAsOf(c, c.f.to);
    if (name === "Stock Alert")
      return tableOf(
        ["Branch", "Product", "SKU", "Variant", "#Sellable", "Minimum"],
        rows
          .filter(
            (r) =>
              r.qty <= APP_CONFIG.lowStockThreshold &&
              availableAt(r.p, r.b) &&
              r.p.active,
          )
          .map((r) =>
            srcRow([
              branchLabel(r.b),
              r.p.name,
              r.p.sku,
              r.p.size + " / " + r.p.color,
              r.qty,
              APP_CONFIG.lowStockThreshold,
            ]),
          ),
      );
    if (name === "Items")
      return tableOf(
        [
          "Branch",
          "Category",
          "Product",
          "Size",
          "Color",
          "SKU",
          "Barcode",
          "#Sellable",
          "~Suggested cost",
          "~Marked price",
        ],
        rows.map((r) =>
          srcRow([
            branchLabel(r.b),
            categoryName(r.p.categoryId),
            r.p.name,
            r.p.size,
            r.p.color,
            r.p.sku,
            r.p.barcode,
            r.qty,
            paisa(r.p.buyingPrice),
            paisa(r.p.price),
          ]),
        ),
      );
    return tableOf(
      [
        "Branch",
        "SKU",
        "Product",
        "#Sellable",
        "#Quarantine",
        "#Transit",
        "~Avg sellable cost",
        "$Sellable cost",
        "$Quarantine cost",
        "$Transit cost",
        "$Carrying value",
        "$Selling value",
        "$Potential margin",
        "Last sale",
        "Days idle",
        "Age (days)",
        "#Dead units",
        "$Dead value",
      ],
      rows.map((r) =>
        srcRow([
          branchLabel(r.b),
          r.p.sku,
          r.p.name,
          r.qty,
          r.defects,
          r.transit,
          r.qty ? Math.round(r.value / r.qty) : null,
          r.value,
          r.quarantined,
          r.travelling,
          r.total,
          r.selling,
          r.margin,
          r.last || "Never",
          r.idle,
          r.age,
          r.dead ? r.qty : 0,
          r.dead ? r.value : 0,
        ]),
      ),
      "Balances at the end date. Selling value and potential margin use current catalog prices and VAT settings.",
    );
  }
  if (name === "Stock Adjustment")
    return tableOf(
      [
        "Date",
        "Branch",
        "Reference",
        "SKU",
        "Reason",
        "Prior count",
        "Corrected count",
        "#Variance",
        "$Carrying change",
        "Actor",
      ],
      c.events
        .filter((e) => e.kind === "Count adjustment")
        .map((e) =>
          srcRow(
            [
              e.date,
              branchLabel(e.branch),
              e.id,
              e.sku,
              e.reason,
              e.previous,
              e.corrected,
              e.qty,
              e.basis,
              e.actor,
            ],
            e.id,
          ),
        ),
    );
  if (name === "Supplier & Customer") {
    const result = new Map();
    function add(type, branch, id, label) {
      const key = [type, branch, id].join("|");
      if (!result.has(key))
        result.set(key, [type, branchLabel(branch), label, 0, 0, 0, 0, 0]);
      return result.get(key);
    }
    for (const i of invoices.filter((i) => !i.draft && c.asOf(i))) {
      const row = add("Supplier", i.branch, i.supplier, i.supplierName);
      if (c.within(i)) row[3] += i.total;
      row[5] += rptSum(
        c.credits.filter((r) => r.invoice === i.id),
        "credit",
      );
      row[6] += rptSum(
        settlements.filter((e) => c.within(e) && e.invoice === i.id),
        "amount",
      );
      row[7] += c.duePurchase(i);
    }
    for (const r of c.lines) {
      const row = add("Customer", r.branch, r.customerKey, r.customer);
      row[4] += r.net;
      row[5] += r.returns;
    }
    for (const s of retail.sales.filter(c.asOf)) {
      const row = add(
        "Customer",
        s.branch,
        s.phone || "walk-in",
        s.customerName || s.phone || "Walk-in / unidentified",
      );
      row[6] += rptSum(
        c.funds.filter((e) => e.document === s.id),
        "value",
      );
      row[7] += c.dueSale(s);
    }
    return tableOf(
      [
        "Contact type",
        "Branch",
        "Contact",
        "$Purchases",
        "$Net sales",
        "$Returns / credits",
        "$Net paid by customer or to supplier",
        "$Closing due",
      ],
      [...result.values()].map((v) => srcRow(v)),
      "Customer returns are net of VAT. Supplier credits use invoice amounts. Historical samples have no payment links.",
    );
  }
  if (name === "Tax") {
    const rows = c.lines
      .filter((r) => r.l.tax != null)
      .map((r) =>
        srcRow(
          [
            r.date,
            branchLabel(r.branch),
            r.id,
            r.sku,
            r.l.vat,
            r.l.rate,
            r.l.vat === "exempt" ? 0 : r.net,
            r.l.vat === "exempt" ? r.net : 0,
            r.l.tax,
            0,
          ],
          r.id,
        ),
      );
    rows.push(
      ...c.purchases
        .filter((i) => i.tax)
        .map((i) =>
          srcRow(
            [
              i.date,
              branchLabel(i.branch),
              i.id,
              "—",
              "Nonrecoverable purchase tax",
              null,
              0,
              0,
              0,
              i.tax,
            ],
            i.id,
          ),
        ),
    );
    return tableOf(
      [
        "Date",
        "Branch",
        "Document",
        "SKU",
        "Mode",
        "%Rate",
        "$Taxable sales",
        "$Exempt sales",
        "$Output VAT",
        "$Recorded purchase tax",
      ],
      rows,
      "Illustrative tax snapshots only. Earlier sales without recorded tax and purchase credits without separate tax breakdowns are excluded.",
    );
  }
  if (name === "Activity Log") {
    const rows = [
      ...c.events.map((e) =>
        srcRow(
          [
            e.date,
            branchLabel(e.branch),
            e.id,
            e.kind,
            e.actor,
            e.notes || e.reason || e.transfer || "",
          ],
          e.id,
        ),
      ),
      ...c.funds.map((e) =>
        srcRow(
          [
            e.date,
            branchLabel(e.branch),
            e.ref,
            e.kind,
            e.actor,
            e.accountName + " · " + money(e.value / 100),
          ],
          e.document || e.ref,
        ),
      ),
      ...costAudit
        .filter((e) => e.type !== "Session baseline" && c.within(e))
        .map((e) =>
          srcRow(
            [
              e.date,
              branchLabel(e.branch),
              e.ref,
              e.type,
              "Unrecorded",
              e.sku + " · " + e.qty + " units",
            ],
            e.ref,
          ),
        ),
    ];
    for (const e of fundBook.audit) {
      const b =
        fundBook.accounts.find((a) => a.id === e.ref)?.branch ||
        state.expenses.find((x) => x.ref === e.ref)?.branch ||
        Number(e.ref.match(/^CAT-([12])$/)?.[1]);
      if (b && c.within({ ...e, branch: b }))
        rows.push(
          srcRow(
            [e.date, branchLabel(b), e.ref, e.action, e.actor, e.details],
            e.ref,
          ),
        );
    }
    return tableOf(
      ["Date", "Branch", "Reference", "Action", "Recorded by", "Change"],
      rows,
      "Recorded fund, stock and carrying-value events. One document can have multiple audit entries.",
    );
  }
  throw Error("Unknown report.");
}
