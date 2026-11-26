// Monetary values on account documents and postings are integer paisa.
const fundBook = {
  accounts: [],
  entries: [],
  audit: [],
  claims: new Set(),
  categories: [],
  sequence: 0,
};
const fundRef = (prefix) =>
  prefix + "-" + String(++fundBook.sequence).padStart(5, "0");
const ownerFinance = () =>
  insist(state.role === "owner", "Owner access required.");
function fundAudit(ref, action, details) {
  fundBook.audit.push(
    Object.freeze({ ref, action, details, date: today, actor: state.role }),
  );
}
function fundClaim(token) {
  insist(
    token && !fundBook.claims.has(token),
    "This transaction has already been posted.",
  );
  fundBook.claims.add(token);
}
function branchAccounts(branch) {
  return fundBook.accounts.filter(
    (a) => a.branch === Number(branch) && a.active,
  );
}
function fundAccount(branch, name) {
  const a = branchAccounts(branch).find((a) => a.name === name);
  insist(a, "Choose an active account in the transaction branch.");
  return a;
}
function fundDate(date) {
  insist(
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      date <= today &&
      !isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date,
    "Choose a valid posting date up to today.",
  );
  return date;
}
function openFund(branch, name, type, opening) {
  branchCheck(branch);
  ownerFinance();
  name = name.trim();
  insist(
    name &&
      name.length <= 80 &&
      !fundBook.accounts.some(
        (a) =>
          a.branch === Number(branch) &&
          a.name.toLowerCase() === name.toLowerCase(),
      ),
    "Enter a unique branch account name (up to 80 characters).",
  );
  const a = {
    id: fundRef("ACC"),
    branch: Number(branch),
    name,
    type: type.trim(),
    opening: cents(opening),
    date: today,
    active: true,
  };
  fundBook.accounts.push(a);
  fundAudit(a.id, "Created", name + " · opening " + amount(a.opening));
  return a;
}
for (const b of APP_CONFIG.branches) {
  for (const name of ["Cash Box", "Card", "Mobile", "Mobile banking"]) {
    const a = {
      id: fundRef("ACC"),
      branch: +b.id,
      name,
      type: name === "Cash Box" ? "Cash" : "Payment account",
      opening: 0,
      date: today,
      active: true,
    };
    fundBook.accounts.push(a);
    fundAudit(a.id, "Demo opening", name);
  }
  fundBook.categories.push(
    ...[
      ...new Set([
        ...state.expenses.filter((e) => e.branch === +b.id).map((e) => e.cat),
        "Repair",
        "Other",
      ]),
    ].map((name) => ({ branch: +b.id, name, active: true })),
  );
}
function editFund(a, name, type) {
  ownerFinance();
  requireStockBranch(a.branch);
  name = name.trim();
  insist(
    name &&
      name.length <= 80 &&
      (a.name !== "Cash Box" || name === a.name) &&
      !fundBook.accounts.some(
        (x) =>
          x !== a &&
          x.branch === a.branch &&
          x.name.toLowerCase() === name.toLowerCase(),
      ),
    "Choose a unique name and preserve the default Cash Box.",
  );
  fundAudit(
    a.id,
    "Account edited",
    a.name + " / " + a.type + " → " + name + " / " + type,
  );
  a.name = name;
  a.type = type.trim();
}
function changeFund(a) {
  ownerFinance();
  requireStockBranch(a.branch);
  insist(a.name !== "Cash Box", "The default Cash Box stays active.");
  a.active = !a.active;
  fundAudit(a.id, a.active ? "Reactivated" : "Deactivated", a.name);
}
function fundEntry(a, value, kind, ref, classification, source, options = {}) {
  const row = Object.freeze({
    id: fundRef("TX"),
    branch: a.branch,
    accountId: a.id,
    accountName: a.name,
    value,
    kind,
    ref,
    classification,
    source,
    date: today,
    actor: state.role,
    ...options,
  });
  fundBook.entries.push(row);
  return row;
}
function fundBalance(a) {
  return (
    a.opening +
    sumBy(
      fundBook.entries.filter((e) => e.accountId === a.id),
      (e) => e.value,
    )
  );
}
const fundClasses = {
  Deposit: ["Owner capital", "Loan proceeds", "Asset disposal", "Other income"],
  Withdrawal: ["Owner drawing", "Loan principal", "Asset purchase"],
  Correction: ["Balance correction"],
  Transfer: ["Internal transfer"],
};
function movement(token, a, kind, value, reason, notes, dest = null) {
  ownerFinance();
  requireStockBranch(a.branch);
  insist(a.active, "Source account is inactive.");
  insist(
    Number.isSafeInteger(value) &&
      value !== 0 &&
      (kind === "Correction" || value > 0) &&
      fundClasses[kind]?.includes(reason),
    "Enter a valid amount and classification.",
  );
  insist(
    kind !== "Correction" || notes.trim(),
    "Explain the balance correction.",
  );
  if (kind === "Transfer")
    insist(
      dest?.active && dest !== a,
      "Choose a different active destination account.",
    );
  fundClaim(token);
  const classification =
    kind === "Transfer"
      ? "Internal"
      : reason === "Other income"
        ? "Operating"
        : ["Asset disposal", "Asset purchase"].includes(reason)
          ? "Investing"
          : kind === "Correction"
            ? "Correction"
            : "Financing";
  fundEntry(
    a,
    ["Withdrawal", "Transfer"].includes(kind) ? -value : value,
    kind,
    token,
    classification,
    "Manual",
    { notes, reason, profit: reason === "Other income" ? value : 0 },
  );
  if (dest && kind === "Transfer")
    fundEntry(dest, value, kind, token, "Internal", "Manual", {
      notes,
      reason,
    });
}
function reverseMovement(row, token, why) {
  ownerFinance();
  requireStockBranch(row.branch);
  const legs = fundBook.entries.filter(
    (e) => e.ref === row.ref && e.source === "Manual",
  );
  insist(
    legs.length &&
      row.source === "Manual" &&
      why.trim() &&
      !fundBook.entries.some((e) => e.reverses === row.ref),
    "Choose an unreversed manual posting and enter the reason.",
  );
  fundClaim(token);
  for (const e of legs)
    fundEntry(
      fundBook.accounts.find((a) => a.id === e.accountId),
      -e.value,
      "Reversal",
      token,
      e.classification,
      "Reversal",
      {
        notes: why,
        reverses: e.ref,
        reason: e.reason,
        profit: -(e.profit || 0),
      },
    );
}
function otherIncome(period, b = curBranch()) {
  return (
    sumBy(
      fundBook.entries.filter(
        (e) =>
          e.date.startsWith(period) && (b === "all" || e.branch === Number(b)),
      ),
      (e) => e.profit || 0,
    ) / 100
  );
}
function writeExpense({
  ref,
  branch,
  date,
  cat,
  title,
  total,
  paid,
  account,
  attachment = null,
  source = "Expense",
  original = null,
}) {
  branchCheck(branch);
  fundDate(date);
  insist(
    title.trim() &&
      fundBook.categories.some(
        (c) => c.branch === +branch && c.name === cat && c.active,
      ),
    "Enter a description and choose a branch category.",
  );
  insist(
    Number.isSafeInteger(total) &&
      total > 0 &&
      Number.isSafeInteger(paid) &&
      paid >= 0 &&
      paid <= total,
    "Check expense and payment amounts.",
  );
  const a = paid ? fundAccount(branch, account) : null;
  fundClaim(ref);
  const doc = {
    ref,
    branch: +branch,
    date,
    cat,
    title: title.trim(),
    amount: total / 100,
    total,
    source,
    attachment,
    original,
  };
  state.expenses.unshift(doc);
  fundAudit(ref, "Expense recorded", original || doc.title);
  if (paid)
    fundEntry(a, -paid, "Expense payment", ref, "Operating", "Expense", {
      document: ref, timing:"At expense entry",
    });
  return doc;
}
function expensePaid(d) {
  return -sumBy(
    fundBook.entries.filter(
      (e) => e.document === d.ref && e.source === "Expense",
    ),
    (e) => e.value,
  );
}
function expenseDue(d) {
  return d.reversed || d.source === "Reversal" ? 0 : d.total - expensePaid(d);
}
function payExpense(d, value, account, token) {
  requireStockBranch(d.branch);
  insist(
    Number.isSafeInteger(value) && value > 0 && value <= expenseDue(d),
    "Payment exceeds the expense due.",
  );
  const a = fundAccount(d.branch, account);
  fundClaim(token);
  fundEntry(a, -value, "Expense payment", token, "Operating", "Expense", {
    document: d.ref,timing:"Payable settlement",
  });
}
function correctExpense(d, token, reason, replacement = null) {
  requireStockBranch(d.branch);
  insist(
    d.source === "Expense" && !d.reversed && reason.trim(),
    "Choose an active expense and explain the correction.",
  );
  insist(!fundBook.claims.has(token), "Correction already posted.");
  // Validate and record a replacement first. All subsequent operations use known original postings.
  if (replacement)
    writeExpense({
      ...replacement,
      source: "Expense",
      branch: d.branch,
      original: d.ref,
      ref: token + "-NEW",
    });
  fundClaim(token);
  d.reversed = token;
  state.expenses.unshift({
    ref: token,
    date: today,
    branch: d.branch,
    title: reason,
    cat: d.cat,
    total: -d.total,
    amount: -d.amount,
    original: d.ref,
    source: "Reversal",
  });
  for (const e of fundBook.entries.filter(
    (e) =>
      e.document === d.ref &&
      e.source === "Expense" &&
      e.kind === "Expense payment" &&
      !fundBook.entries.some((x) => x.reverses === e.id),
  ))
    fundEntry(
      fundBook.accounts.find((a) => a.id === e.accountId),
      -e.value,
      "Expense payment reversal",
      token,
      "Operating",
      "Expense",
      { document: d.ref, reverses: e.id, timing:e.timing, notes: reason },
    );
  fundAudit(d.ref, "Reversed by " + token, reason);
}
function fundRange(scope, start = "", end = "", accountId = "", query = "") {
  insist(
    state.role === "owner" || String(scope) === curBranch(),
    "Choose the assigned branch.",
  );
  const accounts = fundBook.accounts.filter(
    (a) =>
      (scope === "all" || a.branch === Number(scope)) &&
      (!accountId || a.id === accountId),
  );
  const ids = new Set(accounts.map((a) => a.id)),
    rows = fundBook.entries.filter((e) => ids.has(e.accountId));
  const inPeriod = rows.filter(
    (e) => (!start || e.date >= start) && (!end || e.date <= end),
  );
  const opening =
    sumBy(
      accounts.filter((a) => !end || a.date <= end),
      (a) => a.opening,
    ) +
    sumBy(
      rows.filter((e) => start && e.date < start),
      (e) => e.value,
    );
  const inflow = sumBy(
      inPeriod.filter((e) => e.value > 0),
      (e) => e.value,
    ),
    outflow = -sumBy(
      inPeriod.filter((e) => e.value < 0),
      (e) => e.value,
    );
  return {
    opening,
    inflow,
    outflow,
    closing: opening + inflow - outflow,
    period: inPeriod,
    rows: inPeriod.filter((e) =>
      [
        e.id,
        e.ref,
        e.document,
        e.origin,
        e.accountName,
        e.classification,
        e.kind,
        e.reason,
        e.notes,
        e.reverses,
        fundBook.accounts.find((a) => a.id === e.accountId)?.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  };
}

const financialUI = {
  tab: "Accounts",
  start: "",
  end: "",
  query: "",
  account: "",
  scope: "",
  expensePeriod: "This Month",
  expenseBranch: "",
  category: "",
  expenseSearch: "",
  sort: "Newest",
  exStart: "",
  exEnd: "",
};
function accountPicker(id, branch) {
  return stockSelect(
    id,
    branchAccounts(branch).map((a) => [a.name, a.name]),
    "Payment account",
  );
}
function labelSelect(id, labels, label) {
  return stockSelect(
    id,
    labels.map((s) => [s, s]),
    label,
  );
}
function fundButton(label, action, id = "") {
  return btn(
    label,
    'data-fund-action="' + action + '" data-id="' + slug(id) + '"',
  );
}
function financeScope() {
  const scope = state.role + "|" + curBranch();
  if (financialUI.scope !== scope) {
    Object.assign(financialUI, {
      scope,
      account: "",
      expenseBranch: "",
      category: "",
      query: "",
      expenseSearch: "",
    });
  }
}
function expenseRows() {
  const f = financialUI;
  const previous = new Date(today.slice(0, 7) + "-01T12:00:00Z");
  previous.setUTCDate(0);
  return state.expenses
    .filter(
      (e) =>
        scoped(e.branch) &&
        (!f.expenseBranch || e.branch === +f.expenseBranch) &&
        (!f.category || e.cat === f.category) &&
        (f.expensePeriod === "Today"
          ? e.date === today
          : f.expensePeriod === "This Month"
            ? e.date.startsWith(today.slice(0, 7))
            : f.expensePeriod === "Last Month"
              ? e.date.startsWith(previous.toISOString().slice(0, 7))
              : (!f.exStart || e.date >= f.exStart) &&
                (!f.exEnd || e.date <= f.exEnd)) &&
        [e.ref, e.original, e.title, e.cat]
          .join(" ")
          .toLowerCase()
          .includes(f.expenseSearch.toLowerCase()),
    )
    .sort((a, b) =>
      f.sort === "Amount"
        ? b.amount - a.amount
        : f.sort === "Oldest"
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date),
    );
}
function expenseStatus(e) {
  return !e.ref
    ? "Historical sample"
    : e.reversed
      ? "Reversed"
      : e.source === "Reversal"
        ? "Reversal"
        : expenseDue(e) === 0
          ? "Paid"
          : expensePaid(e)
            ? "Partial"
            : "Unpaid";
}
const expenseHeaders = [
  "Date",
  "Description",
  "Category",
  "Branch",
  "Amount",
  "Reference",
  "Status",
  "Paid",
  "Due",
  "Account",
];
function expenseCells(e) {
  const names = [
    ...new Set(
      fundBook.entries
        .filter((x) => e.ref && x.document === e.ref && x.source === "Expense")
        .map((x) => fundBook.accounts.find((a) => a.id === x.accountId).name),
    ),
  ];
  return [
    e.date,
    e.title,
    e.cat,
    branchLabel(e.branch),
    e.amount,
    e.ref || "—",
    expenseStatus(e),
    e.ref ? expensePaid(e) / 100 : "",
    e.ref ? expenseDue(e) / 100 : "",
    names.join(", "),
  ];
}
function exportExpenses() {
  downloadCatalogCsv("expenses", [
    expenseHeaders,
    ...expenseRows().map(expenseCells),
  ]);
}
expenses = function () {
  financeScope();
  const f = financialUI,
    rows = expenseRows();
  return (
    title(
      "Expenses",
      curBranch() === "all"
        ? "Combined expense register. Select a branch to record an expense."
        : "Branch expenses, payment status and receipts.",
      curBranch() === "all" ? "" : btn("Add Expense", 'data-action="expense"'),
    ) +
    '<form id="expense-filter" class="toolbar">' +
    labelSelect(
      "ex-period",
      ["Today", "This Month", "Last Month", "Custom"],
      "Period",
    ) +
    field("From", "ex-start", "date", f.exStart) +
    field("Through", "ex-end", "date", f.exEnd) +
    (curBranch() === "all"
      ? stockSelect(
          "ex-branch",
          [
            ["", "Both branches"],
            ...APP_CONFIG.branches.map((b) => [b.id, b.name]),
          ],
          "Branch",
        )
      : "") +
    stockSelect(
      "ex-filter-cat",
      [
        ["", "All categories"],
        ...[
          ...new Set(
            fundBook.categories
              .filter((c) => scoped(c.branch))
              .map((c) => c.name),
          ),
        ].map((s) => [s, s]),
      ],
      "Category",
    ) +
    field("Search", "ex-query", "search", f.expenseSearch) +
    labelSelect("ex-sort", ["Newest", "Oldest", "Amount"], "Sort") +
    '<button class="btn">Apply</button></form>' +
    '<div class="toolbar">' +
    (state.role === "owner"
      ? exportButton()
      : fundButton("Export branch CSV", "ex-export")) +
    (curBranch() !== "all" && state.role === "owner"
      ? fundButton("Manage categories", "categories")
      : "") +
    "</div>" +
    section(
      "Expenses · " + money(sumBy(rows, (e) => e.amount)),
      table(
        [...expenseHeaders, "Receipt", "Actions"],
        rows.map((e) => [
          ...expenseCells(e).map(slug),
          e.attachment
            ? '<a download="' +
              slug(e.attachment.name) +
              '" href="' +
              slug(e.attachment.url) +
              '">Download receipt</a>'
            : "—",
          (e.ref ? fundButton("Details", "ex-detail", e.ref) : "") +
            (e.ref &&
            String(e.branch) === curBranch() &&
            !e.reversed &&
            e.source === "Expense"
              ? fundButton("Edit", "edit-ex", e.ref) +
                fundButton("Reverse", "undo-ex", e.ref) +
                (expenseDue(e) > 0 ? fundButton("Pay", "pay-ex", e.ref) : "")
              : e.original
                ? slug(e.original)
                : ""),
        ]),
      ),
    ) +
    '<p class="note">Historical sample expenses have no linked cash or payable record.</p>' +
    noReal
  );
};
function expenseForm(doc = null) {
  const b = +curBranch();
  requireStockBranch(b);
  const token = fundRef("EXP"),
    cats = fundBook.categories.filter((c) => c.branch === b && c.active);
  stockForm(
    doc ? "Correct expense · " + doc.ref : "Add Expense",
    field("Date", "ex-date", "date", today) +
      stockSelect(
        "ex-cat",
        cats.map((c) => [c.name, c.name]),
        "Category",
      ) +
      field("Description / notes", "ex-title", "text", doc?.title || "") +
      field("Amount", "ex-amount", "number", doc?.amount || "") +
      labelSelect(
        "ex-status",
        ["Paid", "Partial", "Unpaid"],
        "Payment status",
      ) +
      accountPicker("ex-account", b) +
      field(
        "Partial payment",
        "ex-part",
        "number",
        doc ? expensePaid(doc) / 100 : "",
      ) +
      '<label>Receipt (image or PDF)<input class="input" id="ex-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label>' +
      (doc
        ? field("Reason for correction", "ex-why") +
          "<p>The original expense and its payments will be reversed. Confirm the replacement amount and account.</p>"
        : ""),
    "Save expense",
    () => {
      const file = $("#ex-file").files[0];
      if (file)
        insist(
          ["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(
            file.type,
          ),
          "Choose a PNG, JPEG, WebP or PDF receipt.",
        );
      const total = cents($("#ex-amount").value),
        status = $("#ex-status").value,
        paid =
          status === "Paid"
            ? total
            : status === "Unpaid"
              ? 0
              : cents($("#ex-part").value);
      insist(
        status !== "Partial" || (paid > 0 && paid < total),
        "Enter a partial amount below the total.",
      );
      const input = {
        ref: token,
        branch: b,
        date: $("#ex-date").value,
        cat: $("#ex-cat").value,
        title: $("#ex-title").value,
        total,
        paid,
        account: $("#ex-account").value,
        attachment: file
          ? { name: file.name, url: URL.createObjectURL(file) }
          : doc?.attachment,
      };
      if (doc) correctExpense(doc, token, $("#ex-why").value, input);
      else writeExpense(input);
      finish("Expense recorded");
    },
    'data-save="expense"',
  );
  if (doc) {
    $("#ex-cat").value = doc.cat;
    $("#ex-status").value = expenseStatus(doc);
    const last = fundBook.entries.findLast((e) => e.document === doc.ref);
    if (last) {
      const a = fundBook.accounts.find((a) => a.id === last.accountId);
      if (a.active) $("#ex-account").value = a.name;
    }
  }
  const update = () => {
    $("#ex-part").disabled = $("#ex-status").value !== "Partial";
    $("#ex-account").disabled = $("#ex-status").value === "Unpaid";
  };
  $("#ex-status").onchange = update;
  update();
  $("#ex-amount").step = $("#ex-part").step = ".01";
}
function categoryForm() {
  ownerFinance();
  const b = +curBranch();
  requireStockBranch(b);
  const cats = fundBook.categories.filter((c) => c.branch === b);
  stockForm(
    "Expense categories",
    stockSelect(
      "category-op",
      [
        ["add", "Add category"],
        ...cats
          .filter((c) => c.name !== "Repair")
          .map((c) => [
            c.name,
            (c.active ? "Archive " : "Reactivate ") + c.name,
          ]),
      ],
      "Action",
    ) + field("New category name", "category-name"),
    "Save category",
    () => {
      const op = $("#category-op").value,
        name = $("#category-name").value.trim();
      if (op === "add") {
        insist(
          name &&
            !cats.some((c) => c.name.toLowerCase() === name.toLowerCase()),
          "Enter a new category name.",
        );
        fundBook.categories.push({ branch: b, name, active: true });
      } else {
        const c = cats.find((c) => c.name === op);
        c.active = !c.active;
      }
      fundAudit("CAT-" + b, "Category updated", op === "add" ? name : op);
      finish("Category saved");
    },
  );
}
function externalCash(e) {
  return e.classification !== "Internal" && e.classification !== "Correction";
}
function fundOverview() {
  const scope = curBranch(),
    accounts = fundBook.accounts.filter((a) => scoped(a.branch)),
    entries = fundBook.entries.filter(
      (e) => scoped(e.branch) && externalCash(e),
    );
  const metrics = [
    ["Account balances", sumBy(accounts, fundBalance)],
    [
      "Cash received",
      sumBy(
        entries.filter((e) => e.value > 0),
        (e) => e.value,
      ),
    ],
    [
      "Cash paid",
      -sumBy(
        entries.filter((e) => e.value < 0),
        (e) => e.value,
      ),
    ],
    [
      "Customer dues",
      sumBy(
        retail.sales.filter((s) => scoped(s.branch)),
        dueOn,
      ),
    ],
    [
      "Supplier dues",
      sumBy(
        invoices.filter((i) => scoped(i.branch)),
        (i) => Math.max(0, balance(i)),
      ),
    ],
    [
      "Unpaid expenses",
      sumBy(
        state.expenses.filter((e) => e.ref && scoped(e.branch)),
        expenseDue,
      ),
    ],
    ["Inventory buying value", Math.round(inventoryValue(scope) * 100)],
    [
      "Operating expenses · this month",
      Math.round(expenseAmount(today.slice(0, 7), scope) * 100),
    ],
  ];
  return (
    '<div class="grid metrics">' +
    metrics
      .map(([k, v]) => metric(k, amount(v), "Selected branch scope"))
      .join("") +
    "</div>"
  );
}
const fundTabs = [
  "Accounts",
  "Transactions",
  "Cash Flow",
  "Customer Dues",
  "Supplier Dues",
];
function accountsPage() {
  const scope = curBranch(),
    owner = state.role === "owner",
    accounts = fundBook.accounts.filter((a) => scoped(a.branch));
  return (
    (owner ? fundOverview() : "") +
    (scope === "all"
      ? section(
          "Balances by branch",
          table(
            ["Branch", "Current balance"],
            APP_CONFIG.branches.map((b) => [
              b.name,
              amount(
                sumBy(
                  accounts.filter((a) => a.branch === +b.id),
                  fundBalance,
                ),
              ),
            ]),
          ),
        )
      : "") +
    section(
      "Branch accounts",
      table(
        [
          "Account",
          "Branch",
          "Type",
          "Opening",
          "Balance",
          "Status",
          "Actions",
        ],
        accounts.map((a) => [
          slug(a.name),
          branchLabel(a.branch),
          slug(a.type),
          amount(a.opening),
          amount(fundBalance(a)),
          a.active ? "Active" : "Inactive",
          fundButton("Statement", "statement", a.id) +
            (owner && String(a.branch) === scope && a.name !== "Cash Box"
              ? fundButton(a.active ? "Deactivate" : "Activate", "toggle", a.id)
              : "") +
            (owner && String(a.branch) === scope
              ? fundButton("Edit", "account-edit", a.id)
              : "") +
            fundButton("Audit", "audit", a.id),
        ]),
      ),
    ) +
    '<p class="note">Cash Box is the branch default. Negative balances flag an overdraft in this demo. Historical samples without payment links are excluded.</p>'
  );
}
function fundToolbar() {
  const f = financialUI;
  return (
    '<form id="fund-filter" class="toolbar">' +
    field("From", "fund-start", "date", f.start) +
    field("Through", "fund-end", "date", f.end) +
    stockSelect(
      "fund-account",
      [
        ["", "All accounts"],
        ...fundBook.accounts
          .filter((a) => scoped(a.branch))
          .map((a) => [a.id, branchLabel(a.branch) + " · " + a.name]),
      ],
      "Account",
    ) +
    field("Find transactions", "fund-query", "search", f.query) +
    '<button class="btn">Apply</button>' +
    fundButton("Export CSV", "fund-export") +
    "</form>"
  );
}
function fundView() {
  const f = financialUI;
  return fundRange(curBranch(), f.start, f.end, f.account, f.query);
}
const statementHeads = [
  "Date",
  "Reference",
  "Document",
  "Account",
  "Branch",
  "Action",
  "Class",
  "Reason / notes",
  "In",
  "Out",
  "Actor",
];
function statementCells(e) {
  return [
    e.date,
    e.ref,
    [e.document, e.origin !== e.document ? e.origin : "", e.reverses]
      .filter(Boolean)
      .join(" / "),
    e.accountName,
    branchLabel(e.branch),
    e.kind,
    e.classification,
    [e.reason, e.notes].filter(Boolean).join(" · "),
    Math.max(0, e.value) / 100,
    Math.max(0, -e.value) / 100,
    e.actor,
  ];
}
function cashSummary(r) {
  const external = r.period.filter(externalCash);
  return [
    ["Opening balance", r.opening],
    [
      "External inflows",
      sumBy(
        external.filter((e) => e.value > 0),
        (e) => e.value,
      ),
    ],
    [
      "External outflows",
      sumBy(
        external.filter((e) => e.value < 0),
        (e) => -e.value,
      ),
    ],
    [
      "Net internal transfers",
      sumBy(
        r.period.filter((e) => e.classification === "Internal"),
        (e) => e.value,
      ),
    ],
    [
      "Balance corrections",
      sumBy(
        r.period.filter((e) => e.classification === "Correction"),
        (e) => e.value,
      ),
    ],
    ["Closing balance", r.closing],
  ];
}
function reversibleEntry(e) {
  if (
    !e ||
    state.role !== "owner" ||
    String(e.branch) !== curBranch() ||
    fundBook.entries.some((x) => x.reverses === e.ref || x.reverses === e.id)
  )
    return false;
  if (e.source === "Manual") return true;
  if (e.source === "Expense")
    return (
      e.kind === "Expense payment" &&
      state.expenses.some(
        (d) => d.ref === e.document && d.source === "Expense" && !d.reversed,
      )
    );
  return (
    e.source === "Supplier" ||
    (e.source === "Retail" && e.kind === "Due collection")
  );
}
function reverseSettlement(e, token, why) {
  ownerFinance();
  requireStockBranch(e.branch);
  insist(
    reversibleEntry(e) && why.trim(),
    "Select an eligible posting and explain the reversal.",
  );
  fundClaim(token);
  const a = fundBook.accounts.find((a) => a.id === e.accountId),
    kind = e.kind + " reversal";
  fundEntry(
    a,
    -e.value,
    kind,
    token,
    e.classification,
    e.source === "Expense" ? "Expense" : "Settlement reversal",
    { document: e.document, reverses: e.id, timing:e.timing, notes: why },
  );
  if (e.source === "Supplier")
    settlements.push({
      invoice: e.document,
      branch: e.branch,
      amount: e.value,
      date: today,
      ref: token,
      account: a.name,
    });
  if (e.source === "Retail")
    retail.payments.push({
      id: token,
      invoice: e.document,
      branch: e.branch,
      date: today,
      account: a.name,
      value: -e.value,
      kind,
      ref: e.id,
    });
}
function classifiedFlows(r) {
  return ["Operating", "Investing", "Financing", "Correction"].map((c) => {
    const rows = r.period.filter((e) => e.classification === c);
    return [
      c,
      sumBy(
        rows.filter((e) => e.value > 0),
        (e) => e.value,
      ),
      sumBy(
        rows.filter((e) => e.value < 0),
        (e) => -e.value,
      ),
    ];
  });
}
function accountStatements() {
  const f = financialUI;
  return fundBook.accounts
    .filter((a) => scoped(a.branch) && (!f.account || a.id === f.account))
    .map((a) => {
      const r = fundRange(String(a.branch), f.start, f.end, a.id);
      return [
        branchLabel(a.branch),
        a.name,
        r.opening,
        r.inflow,
        r.outflow,
        r.closing,
      ];
    });
}
const statementTotalsHeaders = [
  "Branch",
  "Account",
  "Opening",
  "Inflows",
  "Outflows",
  "Closing",
];
function transactionsPage(cash) {
  const r = fundView();
  return (
    fundToolbar() +
    (cash
      ? section(
          "Operational cash-flow summary",
          table(
            ["Measure", "Amount"],
            cashSummary(r).map(([k, v]) => [k, amount(v)]),
          ) +
            table(
              ["Classification", "In", "Out"],
              classifiedFlows(r).map(([c, i, o]) => [c, amount(i), amount(o)]),
            ),
        )
      : section(
          "Account statement",
          table(
            ["Opening", "Inflows", "Outflows", "Closing"],
            [[r.opening, r.inflow, r.outflow, r.closing].map(amount)],
          ),
        )) +
    section(
      "Account totals",
      table(
        statementTotalsHeaders,
        accountStatements().map(([b, n, ...v]) => [
          slug(b),
          slug(n),
          ...v.map(amount),
        ]),
      ),
    ) +
    section(
      "Matching transactions",
      table(
        [...statementHeads, "Action"],
        r.rows
          .slice()
          .reverse()
          .map((e) => [
            ...statementCells(e).map(slug),
            reversibleEntry(e) ? fundButton("Reverse", "reverse", e.id) : "",
          ]),
      ),
    ) +
    '<p class="note">Balances cover the selected accounts and dates. Search filters the transaction list.</p>'
  );
}
function duesPage(customer) {
  const rows = customer
    ? retail.sales.filter((s) => scoped(s.branch))
    : invoices.filter((i) => !i.draft && scoped(i.branch));
  return (
    section(
      customer ? "Customer receivables" : "Supplier payables",
      table(
        customer
          ? [
              "Customer",
              "Phone",
              "Branch",
              "Invoice",
              "Total",
              "Credits",
              "Paid",
              "Due",
              "Due date",
              "Status",
              "Actions",
            ]
          : [
              "Supplier",
              "Branch",
              "Purchase",
              "Original payable",
              "Returns / credits",
              "Paid",
              "Due",
              "Status",
              "Actions",
            ],
        rows.map((d) => {
          const due = customer ? dueOn(d) : balance(d);
          const actions =
            fundButton(
              "History",
              customer ? "customer-history" : "supplier-history",
              d.id,
            ) +
            (due && String(d.branch) === curBranch()
              ? fundButton(
                  customer ? "Collect" : due < 0 ? "Receive refund" : "Pay",
                  customer ? "collect" : "pay-supplier",
                  d.id,
                )
              : "");
          return customer
            ? [
                slug(
                  d.customerName ||
                    customersData.find((c) => c.phone === d.phone)?.name ||
                    (d.phone ? "Customer" : "Walk-in"),
                ),
                slug(d.phone),
                branchLabel(d.branch),
                slug(d.id),
                amount(d.total),
                amount(creditsOn(d)),
                amount(paidOn(d)),
                amount(due),
                slug(d.dueDate || "—"),
                due ? (paidOn(d) ? "Partial" : "Unpaid") : "Settled",
                actions,
              ]
            : [
                slug(d.supplierName),
                branchLabel(d.branch),
                slug(d.id),
                amount(d.total),
                amount(d.total - netInvoice(d)),
                amount(cashPaid(d)),
                amount(due),
                invoiceStatus(d),
                actions,
              ];
        }),
      ),
    ) +
    '<p class="note">Only linked session invoices appear in this register.</p>'
  );
}
function fundsPage() {
  financeScope();
  const tab = financialUI.tab,
    owner = state.role === "owner" && curBranch() !== "all";
  return (
    title(
      "Funds & Accounts",
      curBranch() === "all"
        ? "Combined balances. Select a branch to create an account or post a transaction."
        : "Branch money movements and open balances.",
      owner && tab === "Accounts" ? fundButton("Create account", "create") : "",
    ) +
    '<div class="toolbar">' +
    fundTabs
      .map((t) =>
        btn(t, 'data-fund-tab="' + t + '" aria-pressed="' + (t === tab) + '"'),
      )
      .join("") +
    "</div>" +
    (owner && ["Accounts", "Transactions"].includes(tab)
      ? '<div class="toolbar">' +
        Object.keys(fundClasses)
          .map((k) => fundButton(k, k))
          .join("") +
        "</div>"
      : "") +
    (tab === "Accounts"
      ? accountsPage()
      : tab === "Transactions" || tab === "Cash Flow"
        ? transactionsPage(tab === "Cash Flow")
        : duesPage(tab === "Customer Dues")) +
    noReal
  );
}

function movementForm(kind) {
  const b = +curBranch();
  ownerFinance();
  requireStockBranch(b);
  const token = fundRef("FUND");
  stockForm(
    kind,
    accountPicker("fund-source", b) +
      (kind === "Transfer"
        ? stockSelect(
            "fund-to",
            fundBook.accounts
              .filter((a) => a.active)
              .map((a) => [a.id, branchLabel(a.branch) + " · " + a.name]),
            "Destination",
          )
        : "") +
      labelSelect("fund-class", fundClasses[kind], "Classification") +
      (kind === "Correction"
        ? labelSelect("fund-sign", ["Increase", "Decrease"], "Direction")
        : "") +
      field("Amount", "fund-amount", "number", "") +
      field(kind === "Correction" ? "Justification" : "Notes", "fund-note"),
    "Post " + kind.toLowerCase(),
    () => {
      const a = fundAccount(b, $("#fund-source").value),
        v =
          cents($("#fund-amount").value) *
          ($("#fund-sign")?.value === "Decrease" ? -1 : 1);
      movement(
        token,
        a,
        kind,
        v,
        $("#fund-class").value,
        $("#fund-note").value,
        fundBook.accounts.find((a) => a.id === $("#fund-to")?.value),
      );
      finish(
        "Posted " + token + (fundBalance(a) < 0 ? " · account overdrawn" : ""),
      );
    },
  );
  $("#fund-amount").step = ".01";
}
function fundSettlement(action, d) {
  const customer = action === "collect",
    expense = action === "pay-ex",
    due = expense ? expenseDue(d) : customer ? dueOn(d) : balance(d),
    token = fundRef("SET");
  requireStockBranch(d.branch);
  stockForm(
    customer
      ? "Collect customer due"
      : due < 0
        ? "Receive supplier refund"
        : "Settle payable",
    "<p>" +
      slug(d.ref || d.id) +
      " · outstanding " +
      amount(due) +
      "</p>" +
      accountPicker("settle-account", d.branch) +
      field("Amount", "settle-amount", "number", Math.abs(due) / 100),
    "Record settlement",
    () => {
      const value = cents($("#settle-amount").value),
        account = $("#settle-account").value;
      if (customer) collectDue(d, value, account, token);
      else if (expense) payExpense(d, value, account, token);
      else payment(d, Math.sign(due) * value, account, token);
      finish("Settlement recorded");
    },
  );
  $("#settle-amount").step = ".01";
}
function moneyHistory(ref, rows) {
  purchaseModal(
    "History · " + slug(ref),
    table(
      statementHeads,
      rows.map((e) => statementCells(e).map(slug)),
    ) + btn("Close", "data-close"),
  );
}
function financialAction(action, id) {
  if (Object.hasOwn(fundClasses, action)) return movementForm(action);
  const a = fundBook.accounts.find((a) => a.id === id && scoped(a.branch)),
    d = state.expenses.find((e) => e.ref === id && scoped(e.branch)),
    sale = retail.sales.find((s) => s.id === id && scoped(s.branch)),
    supplier = invoices.find((i) => i.id === id && scoped(i.branch));
  switch (action) {
    case "create": {
      const b = +curBranch();
      requireStockBranch(b);
      ownerFinance();
      stockForm(
        "Create fund account",
        field("Account name", "fund-name") +
          field("Type (optional)", "fund-type") +
          field("Opening balance", "fund-opening", "number", 0),
        "Create account",
        () => {
          openFund(
            b,
            $("#fund-name").value,
            $("#fund-type").value,
            $("#fund-opening").value,
          );
          finish("Account created");
        },
      );
      $("#fund-opening").step = ".01";
      return;
    }
    case "account-edit":
      stockForm(
        "Edit account",
        field("Account name", "fund-name", "text", a.name) +
          field("Account type", "fund-type", "text", a.type),
        "Save account",
        () => {
          editFund(a, $("#fund-name").value, $("#fund-type").value);
          finish("Account saved");
        },
      );
      if (a.name === "Cash Box") $("#fund-name").readOnly = true;
      return;
    case "toggle":
      changeFund(a);
      return finish("Account updated");
    case "statement":
      financialUI.account = a.id;
      financialUI.tab = "Transactions";
      financialUI.query = "";
      return render();
    case "audit":
      return purchaseModal(
        "Account audit · " + slug(a.name),
        table(
          ["Date", "Action", "Actor", "Details"],
          fundBook.audit
            .filter((e) => e.ref === a.id)
            .map((e) => [e.date, e.action, e.actor, slug(e.details)]),
        ) + btn("Close", "data-close"),
      );
    case "reverse": {
      const e = fundBook.entries.find((e) => e.id === id && scoped(e.branch)),
        token = fundRef("REV");
      return stockForm(
        "Reverse posting · " + e.ref,
        field("Reason", "reverse-note"),
        "Confirm reversal",
        () => {
          if (e.source === "Manual")
            reverseMovement(e, token, $("#reverse-note").value);
          else reverseSettlement(e, token, $("#reverse-note").value);
          finish("Reversal posted");
        },
      );
    }
    case "ex-detail":
      return purchaseModal(
        "Expense · " + slug(d.ref),
        "<p>" +
          slug(d.title) +
          " · " +
          slug(d.original || d.ref) +
          " · " +
          expenseStatus(d) +
          "</p>" +
          table(
            statementHeads,
            fundBook.entries
              .filter(
                (e) =>
                  e.document === (d.original || d.ref) || e.document === d.ref,
              )
              .map((e) => statementCells(e).map(slug)),
          ) +
          table(
            ["Reference", "Action", "Actor", "Notes"],
            fundBook.audit
              .filter((e) => e.ref === d.ref || e.ref === d.original)
              .map((e) => [
                slug(e.ref),
                slug(e.action),
                slug(e.actor),
                slug(e.details),
              ]),
          ) +
          btn("Close", "data-close"),
      );
    case "edit-ex":
      return expenseForm(d);
    case "undo-ex": {
      const token = fundRef("EXP-REV");
      return stockForm(
        "Reverse expense · " + d.ref,
        "<p>Reverse the expense and its linked payments.</p>" +
          field("Reason", "reverse-note"),
        "Confirm reversal",
        () => {
          correctExpense(d, token, $("#reverse-note").value);
          finish("Expense reversed");
        },
      );
    }
    case "collect":
      return fundSettlement(action, sale);
    case "pay-ex":
      return fundSettlement(action, d);
    case "pay-supplier":
      return fundSettlement(action, supplier);
    case "customer-history":
    case "supplier-history":
      return moneyHistory(
        id,
        fundBook.entries.filter((e) => e.document === id && scoped(e.branch)),
      );
    case "categories":
      return categoryForm();
    case "ex-export":
      return exportExpenses();
    case "fund-export": {
      const r = fundView();
      return downloadCatalogCsv("account-statement", [
        ...(financialUI.tab === "Cash Flow"
          ? [
              ["Operational cash-flow summary", "Amount"],
              ...cashSummary(r).map(([k, v]) => [k, v / 100]),
              [],
              ["Classification", "In", "Out"],
              ...classifiedFlows(r).map(([c, i, o]) => [c, i / 100, o / 100]),
            ]
          : [
              ["Opening", "In", "Out", "Closing"],
              [r.opening, r.inflow, r.outflow, r.closing].map((v) => v / 100),
            ]),
        [],
        statementTotalsHeaders,
        ...accountStatements().map(([b, n, ...v]) => [
          b,
          n,
          ...v.map((p) => p / 100),
        ]),
        [],
        statementHeads,
        ...r.rows.map(statementCells),
      ]);
    }
  }
}
const bindStockAndRetail = bind;
bind = function () {
  bindStockAndRetail();
  const f = financialUI;
  for (const button of document.querySelectorAll("[data-fund-tab]"))
    button.onclick = () => {
      f.tab = button.dataset.fundTab;
      render();
    };
  for (const button of document.querySelectorAll("[data-fund-action]"))
    button.onclick = () => {
      try {
        financialAction(button.dataset.fundAction, button.dataset.id);
      } catch (e) {
        notify(e.message);
      }
    };
  if ($("#fund-filter")) {
    $("#fund-account").value = f.account;
    $("#fund-filter").onsubmit = (e) => {
      e.preventDefault();
      const start = $("#fund-start").value,
        end = $("#fund-end").value;
      if (start && end && start > end) return notify("Check date range.");
      Object.assign(f, {
        start,
        end,
        query: $("#fund-query").value.trim(),
        account: $("#fund-account").value,
      });
      render();
    };
  }
  if ($("#expense-filter")) {
    $("#ex-period").value = f.expensePeriod;
    $("#ex-filter-cat").value = f.category;
    $("#ex-sort").value = f.sort;
    if ($("#ex-branch")) $("#ex-branch").value = f.expenseBranch;
    const adjust = () =>
      ($("#ex-start").disabled = $("#ex-end").disabled =
        $("#ex-period").value !== "Custom");
    $("#ex-period").onchange = adjust;
    adjust();
    $("#expense-filter").onsubmit = (e) => {
      e.preventDefault();
      const exStart = $("#ex-start").value,
        exEnd = $("#ex-end").value;
      if (
        $("#ex-period").value === "Custom" &&
        exStart &&
        exEnd &&
        exStart > exEnd
      )
        return notify("Check date range.");
      Object.assign(f, {
        expensePeriod: $("#ex-period").value,
        exStart,
        exEnd,
        expenseBranch: $("#ex-branch")?.value || "",
        category: $("#ex-filter-cat").value,
        expenseSearch: $("#ex-query").value.trim(),
        sort: $("#ex-sort").value,
      });
      render();
    };
  }
};
