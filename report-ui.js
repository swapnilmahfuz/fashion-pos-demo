const reportPeriods = [
  "Today",
  "Yesterday",
  "This Week",
  "This Month",
  "Last Month",
  "This Financial Year",
  "Custom",
];
const reportAllowed = (name) =>
  Object.values(reportGroups).flat().includes(name) &&
  (state.role === "owner" || managerReports.includes(name));
const heading = (h) => h.replace(/^[$~#%]/, "");
const monetary = (h) => h.startsWith("$") || h.startsWith("~");
function reportValue(h, v) {
  if (v == null) return "—";
  if (monetary(h)) return money(v / 100);
  if (h.startsWith("%")) return Number(v).toFixed(2) + "%";
  return String(v);
}
function buildReport(f = reportState, b = curBranch()) {
  insist(reportAllowed(f.report), "Report outside current permissions.");
  const c = reportingContext(
    { ...f, linked: f.report === "Profit/Loss" && f.linked },
    b,
  );
  const m =
    f.report === "Profit/Loss"
      ? profitReport(c, f.tab)
      : otherReport(c, f.report);
  const q = f.query.trim().toLowerCase();
  if (q)
    m.rows = m.rows.filter((r) =>
      r.v.some((v, i) =>
        reportValue(m.headers[i], v).toLowerCase().includes(q),
      ),
    );
  if (f.sort >= 0 && f.sort < m.headers.length)
    m.rows.sort((a, b) => {
      const x = a.v[f.sort] ?? "",
        y = b.v[f.sort] ?? "";
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "en", { numeric: true })) *
        (f.desc ? -1 : 1)
      );
    });
  m.totals = m.headers.map((h, i) =>
    h[0] === "#" || h[0] === "$" ? sumBy(m.rows, (r) => r.v[i] || 0) : null,
  );
  const balanceColumn = m.headers.indexOf("$Invoice balance");
  if (balanceColumn >= 0)
    m.totals[balanceColumn] = [
      ...new Map(m.rows.map((r) => [r.ref, r.v[balanceColumn]])).values(),
    ].reduce((a, b) => a + b, 0);
  const margin = m.headers.indexOf("%Gross margin");
  if (margin >= 0)
    m.totals[margin] = ratio(
      m.totals[m.headers.indexOf("$Gross profit")],
      m.totals[m.headers.indexOf("$Net sales")],
    );
  m.meta = [
    ["Brand", APP_CONFIG.brand],
    ["Report", m.title],
    ["Branch", branchLabel(b)],
    ["Period", f.from + " — " + f.to],
    ["Generated (Asia/Dhaka)", retailTime().replace("T", " ")],
    ["Currency", "BDT"],
    ["Search", f.query || "All rows"],
    [
      "Source",
      c.f.linked
        ? "Linked session documents"
        : "Recorded sample and linked data where applicable",
    ],
  ];
  if (q) {
    m.summary = [];
    m.support = [];
  }
  return m;
}
let visibleReport = null;
function reportChart(m) {
  const isExpense = m.title === "Expense";
  if (!isExpense && m.title !== "Profit & Loss · Date") return "";
  const days = new Map();
  for (const r of m.rows) {
    const y = isExpense ? r.v[5] : r.v[6];
    days.set(r.v[0], (days.get(r.v[0]) || 0) + y);
  }
  if (!days.size) return "";
  const v = [...days].sort(([a], [b]) => a.localeCompare(b)),
    max = Math.max(1, ...v.map((x) => Math.abs(x[1])));
  const xy = v.map(([d, n], i) => [
    5 + (v.length === 1 ? 300 : (i * 590) / (v.length - 1)),
    55 - (n * 48) / max,
  ]);
  return section(
    isExpense ? "Daily expense trend" : "Daily operating profit",
    '<svg viewBox="0 0 600 110" role="img" aria-label="Daily trend in BDT"><path d="M5 55H595" stroke="var(--line)"/><polyline fill="none" stroke="var(--accent)" stroke-width="2" points="' +
      xy.map((p) => p.join(",")).join(" ") +
      '"/>' +
      xy
        .map(
          ([x, y], i) =>
            '<circle cx="' +
            x +
            '" cy="' +
            y +
            '" r="2.5" fill="var(--accent)"><title>' +
            v[i][0] +
            " · " +
            money(v[i][1] / 100) +
            "</title></circle>",
        )
        .join("") +
      "</svg><small>" +
      v[0][0] +
      " — " +
      v.at(-1)[0] +
      " · range ±" +
      money(max / 100) +
      "</small>",
  );
}
function metricList(list) {
  return (
    '<dl class="report-metrics">' +
    list
      .map(
        ([h, v]) =>
          "<div><dt>" +
          slug(heading(h)) +
          "</dt><dd>" +
          slug(reportValue(h, v)) +
          "</dd></div>",
      )
      .join("") +
    "</dl>"
  );
}
function analyticsPage() {
  const f = reportState;
  if (!reportAllowed(f.report)) {
    Object.assign(f, {
      report: "Items",
      tab: "Products",
      query: "",
      sort: -1,
      page: 0,
      linked: false,
    });
  }
  const m = buildReport();
  visibleReport = m;
  const pages = Math.max(1, Math.ceil(m.rows.length / 30));
  f.page = Math.min(f.page, pages - 1);
  const picks = Object.entries(reportGroups)
    .map(([g, names]) => {
      const allowed = names.filter(reportAllowed);
      return allowed.length
        ? '<optgroup label="' +
            g +
            '">' +
            allowed
              .map(
                (n) =>
                  "<option " +
                  (n === f.report ? "selected" : "") +
                  ">" +
                  n +
                  "</option>",
              )
              .join("") +
            "</optgroup>"
        : "";
    })
    .join("");
  const download =
    '<details class="report-download"><summary class="btn primary">Download Report</summary><div>' +
    ["Excel (.xlsx)", "CSV (.csv)", "PDF (.pdf)", "Print"]
      .map((s, i) =>
        btn(s, 'data-format="' + ["xlsx", "csv", "pdf", "print"][i] + '"'),
      )
      .join("") +
    "</div></details>";
  const list = m.rows.slice(f.page * 30, (f.page + 1) * 30);
  return (
    title(
      "Reports & Analytics",
      "Sales, profitability and operational records.",
      download,
    ) +
    '<div class="report-controls"><label>Report<select id="report-choice" class="field">' +
    picks +
    "</select></label>" +
    labelSelect("report-preset", reportPeriods, "Period") +
    '<form id="report-range">' +
    field("From", "report-from", "date", f.from) +
    field("Through", "report-to", "date", f.to) +
    '<button class="btn">Apply dates</button></form></div>' +
    (f.report === "Profit/Loss"
      ? '<nav aria-label="Profit breakdown" class="toolbar">' +
        profitTabs
          .map((t) =>
            btn(
              t,
              'data-profit-tab="' +
                t +
                '" aria-pressed="' +
                (t === f.tab) +
                '"',
            ),
          )
          .join("") +
        '</nav><label><input type="checkbox" id="report-linked" ' +
        (f.linked ? "checked" : "") +
        "> Linked session activity only</label>"
      : "") +
    (m.summary.length
      ? section(
          f.report === "Profit/Loss"
            ? "Recognized profit"
            : "Cash reconciliation",
          metricList(m.summary),
        )
      : "") +
    (m.support.length
      ? '<details class="card"><summary>Purchases, balances and inventory projections</summary>' +
        metricList(m.support) +
        "</details>"
      : "") +
    reportChart(m) +
    section(
      m.title,
      '<form class="toolbar" id="report-search">' +
        field("Search rows", "analytics-query", "search", f.query) +
        '<button class="btn">Search</button></form>' +
        '<div class="tablewrap"><table class="tbl"><thead><tr>' +
        m.headers
          .map(
            (h, i) =>
              '<th><button data-sort="' +
              i +
              '">' +
              slug(heading(h)) +
              (f.sort === i ? (f.desc ? " ↓" : " ↑") : "") +
              "</button></th>",
          )
          .join("") +
        "</tr></thead><tbody>" +
        list
          .map(
            (r, j) =>
              "<tr>" +
              r.v
                .map(
                  (v, i) =>
                    "<td>" +
                    (i === 0 && (r.ref || r.sources)
                      ? btn(
                          slug(reportValue(m.headers[i], v)),
                          'data-drill="' + (f.page * 30 + j) + '"',
                        )
                      : slug(reportValue(m.headers[i], v))) +
                    "</td>",
                )
                .join("") +
              "</tr>",
          )
          .join("") +
        "</tbody><tfoot><tr>" +
        m.totals
          .map(
            (v, i) =>
              "<th>" +
              (i === 0
                ? "Total"
                : v == null
                  ? ""
                  : slug(reportValue(m.headers[i], v))) +
              "</th>",
          )
          .join("") +
        "</tr></tfoot></table></div>" +
        (!m.rows.length ? "<p>No matching records.</p>" : "") +
        '<div class="toolbar">' +
        btn("Previous", 'id="report-prev" ' + (!f.page ? "disabled" : "")) +
        "<span>" +
        m.rows.length +
        " rows · page " +
        (f.page + 1) +
        " of " +
        pages +
        "</span>" +
        btn(
          "Next",
          'id="report-next" ' + (f.page + 1 >= pages ? "disabled" : ""),
        ) +
        "</div><p>" +
        slug(m.notes) +
        "</p>",
    ) +
    '<p class="note">Historical sales and expenses are illustrations. Cash, VAT and due reports use linked records. Inventory and dues are balances at the end date.</p>' +
    noReal
  );
}
function reportDrill(row) {
  if (row.sources) {
    const docs = row.sources
      .map((id) => ledger.find((s) => s.id === id && scoped(s.branch)))
      .filter(Boolean);
    function show(start) {
      const list = docs.slice(start, start + 30);
      purchaseModal(
        "Source transactions",
        table(
          ["Document", "Date", "Branch", "Net sales"],
          list.map((s, i) => [
            btn(slug(s.id), 'data-source-index="' + (start + i) + '"'),
            s.date,
            branchLabel(s.branch),
            money(sumBy(s.lines, (l) => l.revenue)),
          ]),
        ) +
          '<div class="modal-foot">' +
          (start ? btn("Previous", 'id="prior-sources"') : "") +
          (start + 30 < docs.length ? btn("Next", 'id="more-sources"') : "") +
          btn("Close", "data-close") +
          "</div>",
      );
      document
        .querySelectorAll("[data-source-index]")
        .forEach(
          (el) =>
            (el.onclick = () =>
              reportDrill({ ref: docs[+el.dataset.sourceIndex].id })),
        );
      if ($("#prior-sources"))
        $("#prior-sources").onclick = () => show(start - 30);
      if ($("#more-sources"))
        $("#more-sources").onclick = () => show(start + 30);
    }
    return show(0);
  }
  const ref = row.ref,
    s = ledger.find((s) => s.id === ref && scoped(s.branch)),
    purchase = invoices.find((i) => i.id === ref && scoped(i.branch)),
    a = fundBook.accounts.find((a) => a.id === ref && scoped(a.branch));
  if (s && retail.sales.includes(s)) return saleReceipt(s);
  if (purchase) return invoiceDetail(ref);
  if (s) {
    purchaseModal(
      "Source transaction · " + slug(s.id),
      "<p>" +
        s.date +
        " · " +
        branchLabel(s.branch) +
        (s.original
          ? " · Original " + slug(s.original)
          : " · Historical sample") +
        "</p>" +
        table(
          ["Variant", "SKU", "Quantity", "Net sales", "Gross profit"],
          s.lines.map((l) => [
            slug(l.productName),
            slug(l.sku),
            l.qty,
            money(l.revenue),
            money(l.profit),
          ]),
        ) +
        (s.original
          ? btn("Open original invoice", 'id="report-original"')
          : "") +
        btn("Close", "data-close"),
    );
    if ($("#report-original"))
      $("#report-original").onclick = () =>
        saleReceipt(retail.sales.find((i) => i.id === s.original));
    return;
  }
  if (a)
    return moneyHistory(
      a.name,
      fundBook.entries.filter(
        (e) =>
          e.accountId === a.id &&
          e.date >= reportState.from &&
          e.date <= reportState.to,
      ),
    );
  const e = state.expenses.find((e) => e.ref === ref && scoped(e.branch));
  if (e) return financialAction("ex-detail", ref);
  purchaseModal(
    "Recorded source · " + slug(ref),
    table(
      ["Field", "Recorded value"],
      visibleReport.headers.map((h, i) => [
        slug(heading(h)),
        slug(reportValue(h, row.v[i])),
      ]),
    ) + btn("Close", "data-close"),
  );
}
const bindBeforeReports = bind;
bind = function () {
  bindBeforeReports();
  if (!$("#report-choice")) return;
  const f = reportState;
  const reset = () => {
    f.page = 0;
    render();
  };
  $("#report-choice").onchange = (e) => {
    Object.assign(f, { report: e.target.value, query: "", sort: -1 });
    reset();
  };
  $("#report-preset").value = f.preset;
  $("#report-preset").onchange = (e) => {
    f.preset = e.target.value;
    if (f.preset !== "Custom") [f.from, f.to] = reportDates(f.preset);
    reset();
  };
  $("#report-range").onsubmit = (e) => {
    e.preventDefault();
    const a = $("#report-from").value,
      b = $("#report-to").value;
    if (!a || !b || a > b || b > today)
      return notify("Choose valid dates through today.");
    Object.assign(f, { from: a, to: b, preset: "Custom" });
    reset();
  };
  $("#report-search").onsubmit = (e) => {
    e.preventDefault();
    f.query = $("#analytics-query").value.trim();
    reset();
  };
  if ($("#report-linked"))
    $("#report-linked").onchange = (e) => {
      f.linked = e.target.checked;
      reset();
    };
  document.querySelectorAll("[data-profit-tab]").forEach(
    (el) =>
      (el.onclick = () => {
        Object.assign(f, { tab: el.dataset.profitTab, sort: -1, query: "" });
        reset();
      }),
  );
  document.querySelectorAll("[data-sort]").forEach(
    (el) =>
      (el.onclick = () => {
        const i = +el.dataset.sort;
        f.desc =
          f.sort === i
            ? !f.desc
            : ["#", "$", "~", "%"].includes(visibleReport.headers[i][0]);
        f.sort = i;
        reset();
      }),
  );
  $("#report-prev").onclick = () => {
    f.page--;
    render();
  };
  $("#report-next").onclick = () => {
    f.page++;
    render();
  };
  document
    .querySelectorAll("[data-drill]")
    .forEach(
      (el) =>
        (el.onclick = () => reportDrill(visibleReport.rows[+el.dataset.drill])),
    );
  document.querySelectorAll("[data-format]").forEach(
    (el) =>
      (el.onclick = async () => {
        try {
          el.disabled = true;
          await downloadAnalytics(el.dataset.format);
        } catch (err) {
          notify("Download failed: " + err.message);
        } finally {
          el.disabled = false;
        }
      }),
  );
};
const overviewBeforeReports = overview;
overview = function () {
  const html = overviewBeforeReports();
  if (state.role !== "owner") return html;
  const c = reportingContext({ from: state.date, to: state.date }, curBranch()),
    p = periodResult(c),
    b = reportBalances(c);
  return (
    html +
    section(
      "Operations and financial position",
      metricList([
        ["$Net operating profit", p.operating],
        ["$Expenses", p.expense],
        ["$Purchases", b.purchases],
        ["$Purchase returns", b.purchaseReturns],
        ["$Customer dues", b.customer],
        ["$Supplier dues", b.supplier],
        [
          "$Due collections",
          rptSum(
            c.funds.filter((e) => /Due collection/i.test(e.kind)),
            "value",
          ),
        ],
        ["$Due payments", -rptSum(c.funds.filter(isDuePayment), "value")],
        ["#Sellable units", b.qty],
        ["$Stock buying value", b.closing],
        ["$Stock selling value", b.selling],
        [
          "#Customers",
          new Set([
            ...customersData.filter(c.branch).map((x) => x.id),
            ...retail.sales
              .filter(c.asOf)
              .map((s) => s.phone)
              .filter(Boolean),
          ]).size,
        ],
        [
          "#Suppliers",
          new Set([
            ...invoices
              .filter((i) => !i.draft && c.asOf(i))
              .map((i) => i.supplier),
            ...state.purchases
              .filter(c.branch)
              .filter((i) => !i.date || i.date <= c.f.to)
              .map((i) => suppliers.find((s) => s.name === i.supplier)?.id)
              .filter(Boolean),
          ]).size,
        ],
      ]) + btn("Open date report", "data-dashboard-report"),
    )
  );
};
const analyticsBindings = bind;
bind = function () {
  analyticsBindings();
  if ($("#content [data-dashboard-report]"))
    $("#content [data-dashboard-report]").onclick = () => {
      Object.assign(reportState, {
        report: "Profit/Loss",
        tab: "Date",
        from: state.date,
        to: state.date,
        preset: "Custom",
        query: "",
        page: 0,
        sort: -1,
        linked: false,
      });
      navigate("finance");
    };
};
