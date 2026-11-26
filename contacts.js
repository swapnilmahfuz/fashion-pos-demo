const contactsState = { tab: "Customers", query: "", birthday: "Upcoming" };
const customerGroups = [],
  contactAudit = [];
customersData.forEach((c) =>
  Object.assign(c, {
    active: true,
    email: "",
    address: "",
    birthday: "",
    terms: 0,
    notes: "",
    groupId: null,
    sms: false,
    whatsapp: false,
  }),
);
const phoneKey = (phone) =>
  String(phone || "")
    .replace(/[^\d]/g, "")
    .replace(/^880(?=1\d{9}$)/, "0");
const reachablePhone = (phone) =>
  /^[+\d().\s-]+$/.test(phone) && /^\d{7,15}$/.test(phoneKey(phone));
const customerAt = (c, branch) => c.branch === Number(branch) || c.shared;
function scopedCustomer(id) {
  return customersData.find(
    (c) => c.id === Number(id) && (scoped(c.branch) || c.shared),
  );
}
function linkedCustomer(phone, branch) {
  const key = phoneKey(phone);
  return key
    ? customersData.find(
        (c) => c.active && customerAt(c, branch) && phoneKey(c.phone) === key,
      )
    : undefined;
}
const customerIdFor = (s) => s?.customerId || null;
function customerAudit(c, action, detail = "") {
  contactAudit.push({
    ref: "CUS-" + c.id,
    branch: c.branch,
    date: today,
    actor: state.role,
    action,
    detail,
  });
}
function validateCustomer(data, old, peers = customersData) {
  branchCheck(data.branch);
  insist(
    old ? old.branch === Number(data.branch) : true,
    "Customer branch is fixed.",
  );
  insist(
    data.name.trim() && (!data.phone || reachablePhone(data.phone)),
    "Enter a customer name and supply a valid phone if provided.",
  );
  insist(
    !data.phone ||
      !peers.some(
        (c) => c !== old && phoneKey(c.phone) === phoneKey(data.phone),
      ),
    "Duplicate customer phone.",
  );
  insist(
    !data.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email),
    "Enter a valid email address.",
  );
  if (data.birthday) fundDate(data.birthday);
  insist(
    Number.isInteger(data.terms) && data.terms >= 0 && data.terms <= 365,
    "Credit terms must be 0–365 days.",
  );
  if (state.role !== "owner")
    insist(
      (old?.shared || false) === Boolean(data.shared),
      "Owner access required to share customer records.",
    );
  insist(
    !data.groupId || customerGroups.some((g) => g.id === data.groupId),
    "Choose a valid group.",
  );
  if (state.role !== "owner")
    insist(
      (old?.groupId || null) === data.groupId,
      "Owner access required to assign groups.",
    );
}
function saveCustomer(data, old = null) {
  validateCustomer(data, old);
  const c = old || { id: Math.max(0, ...customersData.map((c) => c.id)) + 1 };
  const phoneSet = new Set(
    [phoneKey(c.phone), phoneKey(data.phone)].filter(Boolean),
  );
  if (!old) customersData.push(c);
  if (!old || c.sms !== data.sms || c.whatsapp !== data.whatsapp)
    customerAudit(
      { ...c, branch: Number(data.branch) },
      "Consent updated",
      "SMS " +
        (data.sms ? "allowed" : "off") +
        " · WhatsApp " +
        (data.whatsapp ? "allowed" : "off"),
    );
  Object.assign(c, data, { branch: Number(data.branch) });
  // Attach unassigned historical invoices by branch and known phone, without changing their snapshots.
  for (const s of retail.sales)
    if (
      !s.customerId &&
      customerAt(c, s.branch) &&
      phoneSet.has(phoneKey(s.phone))
    )
      s.customerId = c.id;
  customerAudit(c, old ? "Customer edited" : "Customer created");
  return c;
}
function customerTotals(c) {
  const docs = retail.sales.filter(
    (s) => s.customerId === c.id && scoped(s.branch),
  );
  const history = ledger.filter(
    (s) =>
      scoped(s.branch) &&
      (s.customerId === c.id || docs.some((i) => i.id === s.original)),
  );
  return {
    docs,
    history,
    sales: sumBy(
      history.filter((s) => s.lines.some((l) => !l.refund)),
      (s) => s.total ?? paisa(sumBy(s.lines, (l) => l.revenue)),
    ),
    returns: -sumBy(
      history.filter((s) => s.lines.every((l) => l.refund)),
      (s) =>
        s.credit != null ? -s.credit : paisa(sumBy(s.lines, (l) => l.revenue)),
    ),
    paid: sumBy(
      retail.payments.filter(
        (p) =>
          p.kind !== "Exchange offset" && docs.some((d) => d.id === p.invoice),
      ),
      (p) => p.value,
    ),
    due: sumBy(docs, dueOn),
  };
}
function contactTabs(names, active, key) {
  return (
    '<nav class="context-tabs" aria-label="' +
    key +
    ' views">' +
    names
      .map((name) =>
        btn(
          name,
          "data-" +
            key +
            '-tab="' +
            slug(name) +
            '" aria-pressed="' +
            (name === active) +
            '"',
        ),
      )
      .join("") +
    "</nav>"
  );
}
function contactButton(label, action, id = "") {
  return btn(label, 'data-contact="' + action + '" data-id="' + slug(id) + '"');
}
function groupSelect(id) {
  return stockSelect(
    id,
    [["", "No group"], ...customerGroups.map((g) => [g.id, g.name])],
    "Customer group",
  );
}
function customerForm(c) {
  const b = c?.branch || curBranch();
  requireStockBranch(b);
  const fields = [
    "name",
    "phone",
    "email",
    "address",
    "birthday",
    "terms",
    "notes",
  ];
  stockForm(
    c ? "Edit customer" : "Add customer",
    fields
      .map((k) =>
        field(
          {
            terms: "Credit terms (days)",
            name: "Name",
            phone: "Phone",
            email: "Email",
            address: "Address",
            birthday: "Birthday",
            notes: "Notes",
          }[k],
          "customer-" + k,
          { email: "email", phone: "tel", terms: "number", birthday: "date" }[
            k
          ] || "text",
          c?.[k] ?? (k === "terms" ? 0 : ""),
        ),
      )
      .join("") +
      (state.role === "owner"
        ? groupSelect("customer-group") +
          settingsCheck(
            "Available at both branches",
            "customer-shared",
            c?.shared,
          )
        : "") +
      ["active", "sms", "whatsapp"]
        .map(
          (k) =>
            '<label><input type="checkbox" id="customer-' +
            k +
            '" ' +
            ((c ? c[k] : k === "active") ? "checked" : "") +
            "> " +
            {
              active: "Active customer",
              sms: "Allow promotional SMS",
              whatsapp: "Allow WhatsApp offers and birthday wishes",
            }[k] +
            "</label>",
        )
        .join(""),
    "Save customer",
    () => {
      const data = Object.fromEntries(
        fields.map((k) => [k, $("#customer-" + k).value.trim()]),
      );
      data.terms = Number(data.terms);
      Object.assign(
        data,
        {
          branch: Number(b),
          shared: $("#setting-customer-shared")?.checked ?? c?.shared ?? false,
          groupId: $("#customer-group")
            ? Number($("#customer-group").value) || null
            : c?.groupId || null,
        },
        Object.fromEntries(
          ["active", "sms", "whatsapp"].map((k) => [
            k,
            $("#customer-" + k).checked,
          ]),
        ),
      );
      saveCustomer(data, c);
      finish("Customer saved");
    },
  );
  if ($("#customer-group")) $("#customer-group").value = c?.groupId || "";
}
function saveGroup(g, data) {
  ownerFinance();
  insist(
    data.name.trim() &&
      !customerGroups.some(
        (c) => c !== g && c.name.toLowerCase() === data.name.toLowerCase(),
      ),
    "Enter a unique group name.",
  );
  insist(
    Number.isFinite(data.rate) && data.rate >= 0 && data.rate <= 100,
    "Enter a discount from 0 to 100 percent.",
  );
  const item = g || { id: customerGroups.length + 1 };
  Object.assign(item, data);
  if (!g) customerGroups.push(item);
  contactAudit.push({
    ref: "GROUP-" + item.id,
    branch: curBranch() === "all" ? null : Number(curBranch()),
    date: today,
    actor: state.role,
    action: g ? "Customer group edited" : "Customer group created",
    detail: item.name + " · " + item.rate + "%",
  });
}
function groupForm(g) {
  ownerFinance();
  stockForm(
    g ? "Edit customer group" : "Add customer group",
    field("Group name", "group-name", "text", g?.name || "") +
      field("Discount (%)", "group-rate", "number", g?.rate || 0) +
      field(
        "Maximum unit price (BDT, optional)",
        "group-price",
        "number",
        g?.price == null ? "" : g.price / 100,
      ) +
      "<p>The stronger group or promotional offer applies. Manual item discounts override both. Invoice discounts apply afterward.</p>",
    "Save group",
    () => {
      saveGroup(g, {
        name: $("#group-name").value.trim(),
        rate: Number($("#group-rate").value),
        price:
          $("#group-price").value === ""
            ? null
            : cents($("#group-price").value),
      });
      finish("Group saved");
    },
  );
  $("#group-rate").step = $("#group-price").step = ".01";
}
function contactHistory(c) {
  const { docs, history } = customerTotals(c);
  const rows = history.map((s) => [
    slug(s.id),
    s.date,
    branchLabel(s.branch),
    money(sumBy(s.lines, (l) => l.revenue)),
    docs.includes(s) ? amount(dueOn(s)) : "—",
    docs.includes(s)
      ? btn("Invoice", 'data-contact-receipt="' + slug(s.id) + '"')
      : "",
  ]);
  purchaseModal(
    "Customer · " + slug(c.name),
    "<p>" +
      slug([c.phone, c.email, c.address, c.notes].filter(Boolean).join(" · ")) +
      "</p>" +
      table(["Document", "Date", "Branch", "Net sales", "Due", ""], rows) +
      table(
        ["Date", "Consent / action", "Details"],
        contactAudit
          .filter((e) => e.ref === "CUS-" + c.id)
          .map((e) => [e.date, slug(e.action), slug(e.detail)]),
      ) +
      btn("Close", "data-close"),
  );
  document
    .querySelectorAll("[data-contact-receipt]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          saleReceipt(docs.find((s) => s.id === b.dataset.contactReceipt))),
    );
}
function supplierHistory(s) {
  const docs = invoices.filter(
    (i) => !i.draft && i.supplier === s.id && scoped(i.branch),
  );
  purchaseModal(
    "Supplier · " + slug(s.name),
    "<p>" +
      slug([s.phone, s.address, s.notes].filter(Boolean).join(" · ")) +
      "</p>" +
      table(
        [
          "Purchase",
          "Date",
          "Branch",
          "Total",
          "Credits",
          "Payments net of refunds",
          "Balance",
          "",
        ],
        docs.map((i) => [
          slug(i.id),
          i.date,
          branchLabel(i.branch),
          amount(i.total),
          amount(i.total - netInvoice(i)),
          amount(cashPaid(i)),
          amount(balance(i)),
          btn("Open purchase", 'data-contact-purchase="' + slug(i.id) + '"'),
        ]),
      ) +
      table(
        ["Date", "Branch", "Reference", "Purchase", "Movement", "Amount"],
        [
          ...supplierReturns
            .filter((r) => docs.some((i) => i.id === r.invoice))
            .map((r) => [
              r.date,
              branchLabel(r.branch),
              r.ref,
              r.invoice,
              "Purchase return",
              amount(r.credit),
            ]),
          ...settlements
            .filter((r) => docs.some((i) => i.id === r.invoice))
            .map((r) => [
              r.date,
              branchLabel(r.branch),
              r.ref,
              r.invoice,
              r.amount < 0 ? "Supplier refund" : "Payment",
              amount(Math.abs(r.amount)),
            ]),
        ].map((r) => r.map(slug)),
      ) +
      btn("Close", "data-close"),
  );
  document
    .querySelectorAll("[data-contact-purchase]")
    .forEach(
      (b) => (b.onclick = () => invoiceDetail(b.dataset.contactPurchase)),
    );
}
function birthdayDate(birthday, date) {
  const y = Number(date.slice(0, 4));
  if (!birthday) return "";
  const at = (year) =>
    birthday.endsWith("-02-29") &&
    new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1
      ? year + "-02-28"
      : year + birthday.slice(4);
  return at(y) < date ? at(y + 1) : at(y);
}
function birthdayRows(period, day = today) {
  let from = day,
    to = day;
  if (period === "This Week") {
    from = dayShift(day, -((new Date(day).getUTCDay() + 6) % 7));
    to = dayShift(from, 6);
  }
  if (period === "This Month") {
    from = day.slice(0, 7) + "-01";
    const [y, m] = day.split("-").map(Number);
    to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
  if (period === "Upcoming") to = dayShift(day, 30);
  return customersData
    .filter((c) => canMarket(c, "whatsapp"))
    .map((c) => ({ c, date: birthdayDate(c.birthday, from) }))
    .filter((r) => r.date >= from && r.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}
const contactCsvHeaders = [
  "Name",
  "Phone",
  "Branch",
  "Email",
  "Address",
  "Birthday",
  "Credit terms",
  "Notes",
  "Group",
  "Active",
  "Shared",
  "SMS",
  "WhatsApp",
];
function exportContacts() {
  downloadCatalogCsv("contacts", [
    contactCsvHeaders,
    ...visibleCustomers().map((c) => [
      c.name,
      c.phone,
      branchLabel(c.branch),
      c.email,
      c.address,
      c.birthday,
      c.terms,
      c.notes,
      customerGroups.find((g) => g.id === c.groupId)?.name || "",
      c.active,
      Boolean(c.shared),
      c.sms,
      c.whatsapp,
    ]),
  ]);
}
function previewContacts(text) {
  const rows = parseCatalogCsv(text);
  insist(rows.length, "Enter a CSV header.");
  const headers = rows.shift().map((x) =>
    x
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase(),
  );
  insist(
    ["name", "phone"].every((k) => headers.includes(k)),
    "CSV requires Name and Phone columns.",
  );
  const staged = [];
  return rows
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const v = Object.fromEntries(
        headers.map((h, i) => [h, (row[i] || "").trim()]),
      );
      const branch = v.branch
        ? APP_CONFIG.branches.find(
            (b) =>
              b.name.toLowerCase() === v.branch.toLowerCase() ||
              b.id === v.branch,
          )?.id
        : curBranch();
      const data = {
        name: v.name,
        phone: v.phone,
        branch: Number(branch),
        email: v.email || "",
        address: v.address || "",
        birthday: v.birthday || "",
        terms: Number(v["credit terms"] || 0),
        notes: v.notes || "",
        groupId:
          customerGroups.find(
            (g) => g.name.toLowerCase() === v.group?.toLowerCase(),
          )?.id || null,
        active: v.active?.toLowerCase() !== "false",
        shared: v.shared?.toLowerCase() === "true",
        sms: false,
        whatsapp: false,
      };
      let error = "";
      try {
        insist(
          ["active", "shared"].every(
            (k) => !v[k] || ["true", "false"].includes(v[k].toLowerCase()),
          ),
          "Active and Shared must be true or false.",
        );
        insist(!v.group || data.groupId, "Unknown customer group.");
        validateCustomer(data, null, [...customersData, ...staged]);
        staged.push(data);
      } catch (e) {
        error = e.message;
      }
      return { data, error };
    });
}
function importContacts() {
  purchaseModal(
    "Import customers",
    '<form id="contact-import"><label>CSV with Name and Phone (optional Branch, Email, Address, Birthday, Credit terms, Notes, Group, Active, Shared)<textarea class="input" id="contact-csv" rows="8"></textarea></label><p>Review consent separately after import.</p><p role="alert"></p><div id="contact-preview"></div><div class="modal-foot"><button class="btn" value="preview">Validate &amp; preview</button><button class="btn primary" value="apply" id="contact-apply" disabled>Import customers</button></div></form>',
  );
  let reviewed = "";
  $("#contact-csv").oninput = () => {
    reviewed = "";
    $("#contact-apply").disabled = true;
    $("#contact-preview").innerHTML = "";
  };
  safeSubmit($("#contact-import"), (e) => {
    const input = $("#contact-csv").value,
      rows = previewContacts(input);
    insist(rows.length, "Enter at least one customer.");
    if (e.submitter.value === "apply") {
      insist(
        input === reviewed && rows.every((r) => !r.error),
        "Validate the current CSV before importing.",
      );
      rows.forEach((r) => saveCustomer(r.data));
      return finish("Customers imported");
    }
    $("#contact-preview").innerHTML = table(
      ["Customer", "Branch", "Validation"],
      rows.map((r) => [
        slug(r.data.name),
        branchLabel(r.data.branch),
        slug(r.error || "Ready"),
      ]),
    );
    reviewed = input;
    $("#contact-apply").disabled = rows.some((r) => r.error);
  });
}
const contactMatch = (...values) =>
  values.join(" ").toLowerCase().includes(contactsState.query.toLowerCase());
function visibleCustomers() {
  return customersData.filter(
    (c) =>
      (scoped(c.branch) || c.shared) && contactMatch(c.name, c.phone, c.email),
  );
}
function contactsPage() {
  const tab = contactsState.tab,
    actions =
      tab === "Customers"
        ? (curBranch() === "all" ? "" : contactButton("Add customer", "new")) +
          contactButton("Import CSV", "import") +
          contactButton("Export CSV", "export") +
          exportButton()
        : tab === "Suppliers"
          ? contactButton("Add supplier", "supplier-new")
          : tab === "Customer Groups" && state.role === "owner"
            ? contactButton("Add group", "group-new")
            : "";
  let results;
  if (tab === "Customers")
    results = table(
      [
        "Customer",
        "Phone",
        "Branch",
        "Group",
        "Status",
        "Purchases",
        "Returns",
        "Cash paid (net)",
        "Due",
        "",
      ],
      visibleCustomers().map((c) => {
        const t = customerTotals(c);
        return [
          slug(c.name),
          slug(c.phone),
          branchLabel(c.branch),
          slug(customerGroups.find((g) => g.id === c.groupId)?.name || "—"),
          c.active ? "Active" : "Inactive",
          amount(t.sales),
          amount(t.returns),
          amount(t.paid),
          amount(t.due),
          contactButton("History", "history", c.id) +
            (String(c.branch) === curBranch()
              ? contactButton("Edit", "edit", c.id)
              : ""),
        ];
      }),
    );
  if (tab === "Suppliers")
    results = table(
      [
        "Supplier",
        "Phone",
        "Status",
        "Branch-scoped purchases",
        "Due",
        "Refund due",
        "",
      ],
      suppliers
        .filter((s) => contactMatch(s.name, s.phone, s.address))
        .map((s) => {
          const d = invoices.filter(
            (i) => i.supplier === s.id && !i.draft && scoped(i.branch),
          );
          return [
            slug(s.name),
            slug(s.phone),
            s.active ? "Active" : "Inactive",
            amount(sumBy(d, netInvoice)),
            amount(sumBy(d, (i) => Math.max(0, balance(i)))),
            amount(sumBy(d, (i) => Math.max(0, -balance(i)))),
            contactButton("History", "supplier-history", s.id) +
              contactButton("Edit", "supplier-edit", s.id),
          ];
        }),
    );
  if (tab === "Customer Groups")
    results = table(
      ["Group", "Discount", "Unit price cap", "Members in scope", ""],
      customerGroups.map((g) => [
        slug(g.name),
        g.rate + "%",
        g.price == null ? "—" : amount(g.price),
        customersData.filter((c) => scoped(c.branch) && c.groupId === g.id)
          .length,
        state.role === "owner" ? contactButton("Edit", "group-edit", g.id) : "",
      ]),
    );
  if (tab === "Birthdays")
    results =
      labelSelect(
        "birthday-period",
        ["Today", "This Week", "This Month", "Upcoming"],
        "Period",
      ) +
      table(
        ["Customer", "Phone", "Branch", "Birthday", ""],
        birthdayRows(contactsState.birthday).map(({ c, date }) => [
          slug(c.name),
          slug(c.phone),
          branchLabel(c.branch),
          date,
          whatsappLink(
            c,
            "Happy birthday, " + c.name + "! Best wishes from QAHAF.",
            "Open birthday wish",
          ),
        ]),
      );
  return (
    title("Contacts", "Customers, suppliers and relationship history.") +
    contactTabs(
      ["Customers", "Suppliers", "Customer Groups", "Birthdays"],
      tab,
      "contacts",
    ) +
    (["Customers", "Suppliers"].includes(tab)
      ? '<form id="contact-search" class="toolbar">' +
        field(
          "Search contacts",
          "contact-query",
          "search",
          contactsState.query,
        ) +
        '<button class="btn">Search</button></form>'
      : "") +
    '<div class="toolbar">' +
    actions +
    "</div>" +
    section(tab, results) +
    noReal
  );
}
function bindContacts() {
  document.querySelectorAll("[data-contacts-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        contactsState.tab = b.dataset.contactsTab;
        contactsState.query = "";
        render();
      }),
  );
  if ($("#contact-search"))
    $("#contact-search").onsubmit = (e) => {
      e.preventDefault();
      contactsState.query = $("#contact-query").value.trim();
      render();
    };
  if ($("#birthday-period")) {
    $("#birthday-period").value = contactsState.birthday;
    $("#birthday-period").onchange = (e) => {
      contactsState.birthday = e.target.value;
      render();
    };
  }
  document.querySelectorAll("[data-contact]").forEach(
    (b) =>
      (b.onclick = () => {
        const id = Number(b.dataset.id),
          c = scopedCustomer(id),
          s = suppliers.find((s) => s.id === id),
          g = customerGroups.find((g) => g.id === id);
        try {
          switch (b.dataset.contact) {
            case "new":
              return customerForm();
            case "edit":
              if (c) return customerForm(c);
              break;
            case "history":
              if (c) return contactHistory(c);
              break;
            case "supplier-history":
              return supplierHistory(s);
            case "supplier-new":
              return supplierForm();
            case "supplier-edit":
              return supplierForm(s);
            case "group-new":
              return groupForm();
            case "group-edit":
              return groupForm(g);
            case "import":
              return importContacts();
            case "export":
              return exportContacts();
          }
        } catch (e) {
          notify(e.message);
        }
      }),
  );
}
