// Inventory values are stored in paisa. Transfer lines and stock events retain their posting snapshots.
const stockOps = {
  transfers: [],
  events: [],
  used: new Set(),
  seq: 0,
  threshold: { 1: 60, 2: 60 },
  search: "",
  sort: "days",
  branch: "all",
};
const damageReasons = [
  "Damaged",
  "Torn",
  "Stained",
  "Manufacturing defect",
  "Missing/Lost",
  "Other",
];
const adjustmentTypes = [
  "Physical count",
  "Stock shortage",
  "Stock excess",
  "Correction",
];
const stockRef = (prefix) => prefix + "-" + ++stockOps.seq;
const variant = (id) => products.find((p) => p.id === Number(id));
function requireStockBranch(b) {
  branchCheck(b);
  insist(
    String(b) === curBranch(),
    "Select the operating branch in the header.",
  );
}
function stockEvent(token, data) {
  insist(!stockOps.used.has(token), "Operation already posted.");
  stockOps.used.add(token);
  stockOps.events.push(
    Object.freeze({ id: token, date: today, actor: state.role, ...data }),
  );
}
function fresh(token) {
  insist(token && !stockOps.used.has(token), "Operation already posted.");
}
function authorizedOwner() {
  insist(state.role === "owner", "Owner approval required.");
}
function stockResult(period, b = curBranch()) {
  return (
    sumBy(
      stockOps.events.filter(
        (e) =>
          e.date.startsWith(period) && (b === "all" || e.branch === Number(b)),
      ),
      (e) => e.result || 0,
    ) / 100
  );
}
function transferEvents(t) {
  return stockOps.events.filter((e) => e.transfer === t.id);
}
function sent(t) {
  return !!transferEvents(t).find((e) => e.kind === "Dispatch");
}
function settledUnits(t, l) {
  return sumBy(
    transferEvents(t)
      .flatMap((e) => e.settled || [])
      .filter((s) => s.id === l.id),
    (s) => s.qty,
  );
}
function outstanding(t, l) {
  return sent(t) ? l.qty - settledUnits(t, l) : 0;
}
function dispatchBasis(t, l) {
  return (
    transferEvents(t)
      .find((e) => e.kind === "Dispatch")
      ?.lines.find((x) => x.id === l.id)?.basis || 0
  );
}
function transitBasis(t, l) {
  return sent(t)
    ? dispatchBasis(t, l) -
        sumBy(
          transferEvents(t)
            .flatMap((e) => e.settled || [])
            .filter((s) => s.id === l.id),
          (s) => s.basis,
        )
    : 0;
}
function transferStatus(t) {
  const events = transferEvents(t);
  if (events.some((e) => e.kind === "Cancel")) return "Cancelled";
  if (!sent(t)) return "Draft";
  if (!t.lines.some((l) => outstanding(t, l)))
    return events.some((e) =>
      ["Missing/Lost", "Return to source"].includes(e.kind),
    )
      ? "Discrepancy resolved"
      : "Received";
  return events.some((e) => e.short) ? "Discrepancy" : "Dispatched";
}
function createTransfer(input, dispatch = false, draft = null) {
  const from = Number(input.from),
    to = from === 1 ? 2 : 1;
  requireStockBranch(from);
  if (draft) {
    insist(
      draft.from === from &&
        draft.id === input.id &&
        transferStatus(draft) === "Draft",
      "Only a source draft can be edited.",
    );
  } else fresh(input.id);
  const seen = new Set(),
    lines = input.lines.map((raw) => {
      const p = variant(raw.id),
        qty = units(raw.qty);
      insist(
        p?.active &&
          !p.deleted &&
          availableAt(p, from) &&
          availableAt(p, to) &&
          !seen.has(p.id),
        "Choose distinct active variants available at both branches.",
      );
      seen.add(p.id);
      if (dispatch) insist(p["b" + from] >= qty, "Insufficient source stock.");
      return {
        id: p.id,
        sku: p.sku,
        label: p.name + " · " + p.size + " / " + p.color,
        qty,
      };
    });
  insist(lines.length, "Select at least one variant.");
  const t = {
    id: input.id,
    from,
    to,
    date: today,
    freight: cents(input.freight || 0),
    notes: input.notes || "",
    lines,
  };
  if (draft) {
    stockEvent(stockRef("EDIT"), {
      kind: "Draft revised",
      transfer: t.id,
      branch: from,
      notes: t.notes,
      lines: t.lines,
    });
    Object.assign(draft, t);
  } else {
    stockEvent(t.id, {
      kind: "Draft",
      transfer: t.id,
      branch: from,
      lines: t.lines,
    });
    stockOps.transfers.unshift(t);
  }
  if (dispatch) dispatchTransfer(t);
  return t;
}
function dispatchTransfer(t) {
  requireStockBranch(t.from);
  insist(transferStatus(t) === "Draft", "Only a draft can be dispatched.");
  const lines = t.lines.map((l) => {
    const p = variant(l.id);
    insist(
      p.active && !p.deleted && availableAt(p, t.from) && availableAt(p, t.to),
      "Variant unavailable.",
    );
    return { ...l, basis: issueValue(p, t.from, l.qty) };
  });
  stockEvent(stockRef("DSP"), {
    kind: "Dispatch",
    transfer: t.id,
    branch: t.from,
    lines,
  });
  lines.forEach((l) =>
    moveStock(
      variant(l.id),
      t.from,
      -l.qty,
      -l.basis,
      "Transfer dispatch",
      t.id,
    ),
  );
}
function settleTransfer(t, quantities, token, mode, notes = "") {
  fresh(token);
  insist(
    ["Receive", "Report shortage", "Return to source", "Missing/Lost"].includes(
      mode,
    ),
    "Invalid resolution.",
  );
  const resolution = ["Return to source", "Missing/Lost"].includes(mode);
  requireStockBranch(resolution ? t.from : t.to);
  if (resolution) authorizedOwner();
  insist(
    ["Dispatched", "Discrepancy"].includes(transferStatus(t)),
    "Transfer is closed or awaiting dispatch.",
  );
  insist(
    !resolution || transferStatus(t) === "Discrepancy",
    "Record the discrepancy first.",
  );
  insist(
    mode === "Receive" || notes.trim(),
    "Enter a discrepancy or resolution note.",
  );
  const settled = t.lines
    .map((l, i) => {
      const qty = Number(quantities[i] || 0),
        remaining = outstanding(t, l);
      insist(
        Number.isInteger(qty) && qty >= 0 && qty <= remaining,
        "Quantity exceeds the outstanding transfer.",
      );
      const prior = settledUnits(t, l),
        basis = dispatchBasis(t, l);
      return {
        id: l.id,
        qty,
        basis:
          Math.round((basis * (prior + qty)) / l.qty) -
          Math.round((basis * prior) / l.qty),
      };
    })
    .filter((l) => l.qty);
  const short = mode === "Report shortage";
  insist(settled.length || short, "Enter a quantity.");
  insist(
    !short ||
      sumBy(settled, (l) => l.qty) < sumBy(t.lines, (l) => outstanding(t, l)),
    "A shortage requires outstanding units.",
  );
  const ref = token;
  stockEvent(ref, {
    kind: mode,
    transfer: t.id,
    branch: resolution ? t.from : t.to,
    settled,
    short,
    notes,
    result: mode === "Missing/Lost" ? -sumBy(settled, (l) => l.basis) : 0,
  });
  if (mode !== "Missing/Lost")
    settled.forEach((l) =>
      moveStock(
        variant(l.id),
        resolution ? t.from : t.to,
        l.qty,
        l.basis,
        mode === "Return to source"
          ? "Discrepancy restored"
          : "Transfer receipt",
        ref,
      ),
    );
}
function quarantine({ token, branch, id, qty, reason, notes }) {
  requireStockBranch(branch);
  fresh(token);
  const p = variant(id);
  qty = units(qty);
  insist(
    p && !p.deleted && damageReasons.includes(reason),
    "Choose a variant and reason.",
  );
  const basis = issueValue(p, branch, qty);
  stockEvent(token, {
    branch,
    kind: "Quarantine",
    notes,
    productId: p.id,
    qty,
    basis,
  });
  moveStock(p, branch, -qty, -basis, "Quarantine", token);
  retail.defects.push({
    ref: token,
    branch: Number(branch),
    productId: p.id,
    qty,
    basis,
    date: today,
    actor: state.role,
    reason,
    notes,
  });
}
function defectState(d) {
  const events = stockOps.events.filter(
    (e) => e.defect === d.ref && e.productId === d.productId,
  );
  const resolved = events.filter((e) =>
    ["Restore", "Write off"].includes(e.kind),
  );
  const qty = d.qty - sumBy(resolved, (e) => e.qty),
    basis = d.basis - sumBy(resolved, (e) => e.basis);
  return {
    qty,
    basis,
    status: !qty
      ? "Closed"
      : events.some((e) => e.kind === "Under Repair")
        ? "Under Repair"
        : "Quarantine",
  };
}
function resolveDefect(
  d,
  {
    token,
    kind,
    qty,
    repair = 0,
    recovery = 0,
    account = "Cash Box",
    notes = "",
  },
) {
  requireStockBranch(d.branch);
  fresh(token);
  const open = defectState(d);
  insist(open.qty > 0, "This lot is closed.");
  insist(
    ["Under Repair", "Restore", "Write off"].includes(kind),
    "Invalid action.",
  );
  if (kind === "Under Repair") {
    insist(open.status !== "Under Repair", "Already under repair.");
    stockEvent(token, {
      branch: d.branch,
      productId: d.productId,
      defect: d.ref,
      kind,
      notes,
    });
    return;
  }
  if (kind === "Write off") authorizedOwner();
  qty = units(qty);
  insist(qty <= open.qty, "Quantity exceeds quarantine balance.");
  const basis = Math.round((open.basis * qty) / open.qty),
    expense = cents(repair),
    recovered = cents(recovery);
  const paymentAccount = fundAccount(d.branch, account);
  const p = variant(d.productId);
  if (kind === "Restore")
    insist(
      availableAt(p, d.branch) && !p.deleted,
      "Restore branch availability first.",
    );
  stockEvent(token, {
    branch: d.branch,
    productId: d.productId,
    defect: d.ref,
    kind,
    qty,
    basis,
    repair: expense,
    recovery: recovered,
    result: recovered - (kind === "Write off" ? basis : 0),
    notes,
  });
  if (kind === "Restore")
    moveStock(p, d.branch, qty, basis, "Restore repaired stock", token);
  if (expense)
    writeExpense({
      ref: "REPAIR-" + token,
      branch: d.branch,
      date: today,
      cat: "Repair",
      title: "Repair · " + token,
      total: expense,
      paid: expense,
      account,
      source: "Stock repair",
      original: token,
    });
  if (recovered)
    fundEntry(
      paymentAccount,
      recovered,
      "Stock recovery",
      token,
      "Operating",
      "Stock",
      { document: d.ref },
    );
}
function postCount({
  token,
  branch,
  id,
  previous,
  corrected,
  reason,
  notes,
  unitCost,
}) {
  requireStockBranch(branch);
  fresh(token);
  const p = variant(id);
  insist(
    p && !p.deleted && availableAt(p, branch) && p["b" + branch] === previous,
    "Stock changed or unavailable. Recheck the count.",
  );
  insist(
    String(corrected).trim() !== "" &&
      Number.isSafeInteger(+corrected) &&
      +corrected >= 0 &&
      +corrected <= 100000,
    "Enter a valid nonnegative count.",
  );
  const qty = Number(corrected) - previous;
  insist(
    qty && notes.trim() && adjustmentTypes.includes(reason),
    "Enter a changed count, reason and notes.",
  );
  insist(reason !== "Stock shortage" || qty < 0, "Shortage must reduce stock.");
  insist(reason !== "Stock excess" || qty > 0, "Excess must increase stock.");
  if (reason === "Correction") authorizedOwner();
  const basis =
    qty < 0
      ? -issueValue(p, branch, -qty)
      : previous
        ? Math.round((branchValue(p, branch) * qty) / previous)
        : qty * cents(unitCost);
  stockEvent(token, {
    branch,
    productId: p.id,
    kind: "Count adjustment",
    sku: p.sku,
    previous,
    corrected: Number(corrected),
    qty,
    basis,
    result: basis,
    reason,
    notes,
  });
  moveStock(p, branch, qty, basis, "Count · " + reason, token);
}
const seededSales = ledger.slice().sort((a, b) => a.date.localeCompare(b.date));
const firstSeedDay = seededSales.reduce(
  (d, s) => (s.date < d ? s.date : d),
  today,
);
function availabilityAge(p, b, asOf = today) {
  let onHand = 0,
    since = "",
    last = "";
  function apply(date, qty) {
    if (date > asOf) return;
    if (onHand === 0 && qty > 0) since = date;
    onHand += qty;
    if (!onHand) since = "";
  }
  const opening = stockMovements.find(
    (m) =>
      m.type === "Opening balance" && m.productId === p.id && m.branch === b,
  );
  if (opening) apply(firstSeedDay, opening.qty);
  for (const s of seededSales) {
    if (s.branch !== b || s.date > asOf) continue;
    for (const l of s.lines)
      if (l.productId === p.id) {
        apply(s.date, l.qty * (l.refund ? 1 : -1));
        if (!l.refund) last = s.date;
      }
  }
  for (const e of costAudit)
    if (
      e.productId === p.id &&
      e.branch === b &&
      e.type !== "Session baseline" &&
      e.date <= asOf
    ) {
      apply(e.date, e.qty);
      if (e.type === "Sale") last = e.date;
    }
  const days = (d) =>
    d ? Math.floor((Date.parse(asOf) - Date.parse(d)) / 86400000) : 0;
  const age = days(since),
    idle = since ? days(last > since ? last : since) : 0;
  return {
    since,
    last,
    age,
    idle,
    dead: onHand > 0 && idle >= stockOps.threshold[b],
  };
}
function position(p, b) {
  let transit = 0,
    travelling = 0,
    defects = 0,
    quarantined = 0;
  for (const t of stockOps.transfers)
    if (t.from === b)
      for (const l of t.lines)
        if (l.id === p.id) {
          transit += outstanding(t, l);
          travelling += transitBasis(t, l);
        }
  for (const d of retail.defects)
    if (d.branch === b && d.productId === p.id) {
      const open = defectState(d);
      defects += open.qty;
      quarantined += open.basis;
    }
  const qty = p["b" + b],
    value = branchValue(p, b),
    selling = Math.round(p.price * qty * 100);
  return {
    qty,
    value,
    transit,
    travelling,
    defects,
    quarantined,
    total: value + travelling + quarantined,
    selling,
    margin:
      Math.round(selling / (p.vat === "included" ? 1 + retail.rate / 100 : 1)) -
      value,
  };
}
inventoryValue = function (branch = curBranch()) {
  return (
    sumBy(products, (p) =>
      sumBy(
        branch === "all" ? [1, 2] : [Number(branch)],
        (b) => position(p, b).total,
      ),
    ) / 100
  );
};
const stockButton = (label, action, id = "") =>
  btn(label, 'data-stock-action="' + action + '" data-id="' + slug(id) + '"');
const branchNum = () => Number(curBranch());
function stockSelect(id, items, label) {
  return (
    "<label>" +
    slug(label) +
    '<select class="field" id="' +
    id +
    '">' +
    items
      .map(
        ([value, name]) =>
          '<option value="' + slug(value) + '">' + slug(name) + "</option>",
      )
      .join("") +
    "</select></label>"
  );
}
function stockForm(name, body, label, save, attributes = "") {
  purchaseModal(
    name,
    '<form class="stock-form" id="stock-form">' +
      body +
      '<p role="alert"></p><div class="modal-foot">' +
      btn("Cancel", "data-close") +
      '<button class="btn primary" ' +
      attributes +
      ">" +
      label +
      "</button></div></form>",
  );
  safeSubmit($("#stock-form"), (e) => save(e));
}
function stockVariants(branch) {
  return catalogProducts().filter((p) => availableAt(p, branch));
}
function productPicker(list, id = "stock-variant") {
  return stockSelect(
    id,
    list.map((p) => [
      p.id,
      p.sku + " · " + p.name + " · " + p.size + " / " + p.color,
    ]),
    "Variant",
  );
}
function branchActions(label, action) {
  return curBranch() === "all"
    ? "<small>Select a branch to post stock movements.</small>"
    : stockButton(label, action);
}
function transferForm(draft = null) {
  const from = branchNum();
  requireStockBranch(from);
  const to = 3 - from,
    token = draft?.id || stockRef("TR");
  const list = stockVariants(from).filter(
    (p) => p.active && availableAt(p, to) && p["b" + from] > 0,
  );
  insist(list.length, "No stock available to transfer.");
  const lines = draft
    ? draft.lines.map((l) => ({ ...l }))
    : [{ id: list[0].id, qty: Math.min(2, list[0]["b" + from]) }];
  stockForm(
    (draft ? "Edit draft · " : "Add transfer · ") + token,
    "<p>" +
      branchLabel(from) +
      " → " +
      branchLabel(to) +
      " · " +
      today +
      "</p>" +
      field("Scan SKU or barcode", "transfer-scan") +
      btn("Add match", 'id="add-match"') +
      '<div id="transfer-lines"></div>' +
      btn("Add variant", 'id="add-line"') +
      field(
        "Shipping charge (memo only)",
        "freight",
        "number",
        (draft?.freight || 0) / 100,
      ) +
      field("Transfer notes", "transfer-notes", "text", draft?.notes || "") +
      '<button class="btn" value="draft">Save draft</button>',
    "Dispatch transfer",
    (e) => {
      createTransfer(
        {
          id: token,
          from,
          freight: $("#freight").value,
          notes: $("#transfer-notes").value,
          lines,
        },
        e.submitter?.value !== "draft",
        draft,
      );
      finish("Transfer saved");
    },
    "data-dispatch-transfer",
  );
  const draw = () => {
    $("#transfer-lines").innerHTML = lines
      .map(
        (l, i) =>
          "<fieldset>" +
          productPicker(list, "transfer-variant-" + i) +
          field("Dispatch units", "transfer-qty-" + i, "number", l.qty) +
          btn("Remove", 'data-drop="' + i + '"') +
          "</fieldset>",
      )
      .join("");
    lines.forEach((l, i) => {
      const select = $("#transfer-variant-" + i);
      select.value = l.id;
      select.onchange = () => (l.id = Number(select.value));
      $("#transfer-qty-" + i).oninput = (e) => (l.qty = e.target.value);
    });
    document.querySelectorAll("[data-drop]").forEach(
      (el) =>
        (el.onclick = () => {
          lines.splice(+el.dataset.drop, 1);
          draw();
        }),
    );
  };
  function add(p) {
    if (!p) return notify("No matching available variant.");
    const l = lines.find((l) => l.id === p.id);
    if (l) l.qty = Number(l.qty) + 1;
    else lines.push({ id: p.id, qty: 1 });
    draw();
  }
  draw();
  $("#freight").step = ".01";
  $("#add-line").onclick = () =>
    add(list.find((p) => !lines.some((l) => l.id === p.id)));
  $("#add-match").onclick = () => {
    add(list.find((p) => matchesVariant(p, $("#transfer-scan").value.trim())));
    $("#transfer-scan").value = "";
    $("#transfer-scan").focus();
  };
  $("#transfer-scan").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#add-match").click();
    }
  };
}
transfers = function () {
  const rows = stockOps.transfers.filter((t) => scoped(t.from) || scoped(t.to));
  return (
    title(
      "Stock Transfers",
      "Dispatch, receive and reconcile branch shipments.",
      branchActions("Add Transfer", "transfer"),
    ) +
    section(
      "Transfer register",
      table(
        [
          "Reference",
          "Date",
          "Source",
          "Destination",
          "Units",
          "In transit",
          "Status",
          "Actions",
        ],
        rows.map((t) => {
          const status = transferStatus(t),
            source = branchNum() === t.from,
            dest = branchNum() === t.to,
            pending = ["Dispatched", "Discrepancy"].includes(status);
          return [
            t.id,
            t.date,
            branchLabel(t.from),
            branchLabel(t.to),
            sumBy(t.lines, (l) => l.qty),
            sumBy(t.lines, (l) => outstanding(t, l)),
            status,
            stockButton("Details / challan", "challan", t.id) +
              (source && status === "Draft"
                ? stockButton("Edit draft", "edit", t.id) +
                  stockButton("Dispatch", "dispatch", t.id) +
                  stockButton("Cancel draft", "cancel", t.id)
                : "") +
              (dest && pending
                ? btn(
                    "Receive",
                    'data-receive-transfer="' +
                      t.id +
                      '" data-stock-action="receive" data-id="' +
                      t.id +
                      '"',
                  )
                : "") +
              (source && status === "Discrepancy" && state.role === "owner"
                ? stockButton("Resolve discrepancy", "resolve", t.id)
                : ""),
          ];
        }),
      ),
    ) +
    "<details><summary>Earlier sample transfers</summary>" +
    table(
      [
        "Reference",
        "Source",
        "Destination",
        "Style",
        "Units",
        "Recorded status",
      ],
      state.transfers
        .filter((t) => scoped(t.from) || scoped(t.to))
        .map((t) => [
          t.id,
          branchLabel(t.from),
          branchLabel(t.to),
          slug(t.style),
          t.qty,
          t.status,
        ]),
    ) +
    "<p>Historical examples lack posted cost records and are excluded from current transit balances.</p></details>" +
    noReal
  );
};
function receiptTransfer(t, resolve) {
  const token = stockRef("TRM");
  stockForm(
    (resolve ? "Resolve discrepancy" : "Receive transfer") + " · " + t.id,
    stockSelect(
      "transfer-resolution",
      (resolve
        ? ["Return to source", "Missing/Lost"]
        : ["Receive", "Report shortage"]
      ).map((s) => [s, s]),
      "Action",
    ) +
      t.lines
        .map((l, i) =>
          field(
            l.sku + " · outstanding " + outstanding(t, l),
            "inbound-" + i,
            "number",
            resolve ? 0 : outstanding(t, l),
          ),
        )
        .join("") +
      field("Receipt / discrepancy notes", "inbound-notes"),
    "Confirm movement",
    () => {
      settleTransfer(
        t,
        t.lines.map((_, i) => $("#inbound-" + i).value),
        token,
        $("#transfer-resolution").value,
        $("#inbound-notes").value,
      );
      finish("Transfer movement recorded");
    },
    'id="confirm-inbound"',
  );
}
function challan(t) {
  purchaseModal(
    "Transfer challan",
    '<article id="demo-receipt"><h3>QAHAF · ' +
      t.id +
      "</h3><p>" +
      t.date +
      " · " +
      branchLabel(t.from) +
      " → " +
      branchLabel(t.to) +
      " · " +
      transferStatus(t) +
      "</p>" +
      table(
        ["Variant", "SKU", "Requested", "In transit"],
        t.lines.map((l) => [
          slug(l.label),
          slug(l.sku),
          l.qty,
          outstanding(t, l),
        ]),
      ) +
      "<p>Shipping (memo) " +
      amount(t.freight) +
      " · " +
      slug(t.notes) +
      "</p>" +
      table(
        ["Event", "Date", "Recorded by", "Reference", "Quantities", "Notes"],
        transferEvents(t).map((e) => [
          e.kind,
          e.date,
          slug(e.actor),
          e.id,
          (e.settled || e.lines || [])
            .map(
              (l) =>
                slug(l.sku || t.lines.find((x) => x.id === l.id)?.sku || "") +
                " × " +
                l.qty,
            )
            .join("<br>"),
          slug(e.notes || ""),
        ]),
      ) +
      '</article><div class="modal-foot">' +
      btn("Print challan", 'onclick="window.print()"') +
      btn("Close", "data-close") +
      "</div>",
  );
}
function damagePage() {
  const defects = retail.defects.filter((d) => scoped(d.branch));
  return (
    title(
      "Damage & Defects",
      "Quarantine, restoration and write-off by source lot.",
      branchActions("Report damage", "damage"),
    ) +
    section(
      "Quarantine register",
      table(
        [
          "Product / SKU",
          "Size / color",
          "Branch",
          "Original qty",
          "Open qty",
          "Open cost",
          "Reason",
          "Notes",
          "Date",
          "Status",
          "Source",
          "Recorded by",
          "",
        ],
        defects.map((d) => {
          const p = variant(d.productId),
            open = defectState(d);
          return [
            slug(p.name + " · " + p.sku),
            slug(p.size + " / " + p.color),
            branchLabel(d.branch),
            d.qty,
            open.qty,
            amount(open.basis),
            slug(d.reason),
            slug(d.notes || ""),
            d.date,
            open.status,
            slug([d.original, d.ref].filter(Boolean).join(" / ")),
            slug(d.actor),
            open.qty && branchNum() === d.branch
              ? stockButton("Manage lot", "lot", d.ref + "|" + d.productId)
              : "",
          ];
        }),
      ),
    ) +
    section(
      "Disposition history",
      table(
        [
          "Date",
          "Source",
          "SKU",
          "Branch",
          "Action",
          "Units",
          "Cost",
          "Repair expense",
          "Recovery",
          "Recorded by",
          "Notes",
        ],
        stockOps.events
          .filter((e) => e.defect && scoped(e.branch))
          .map((e) => [
            e.date,
            e.defect,
            slug(variant(e.productId).sku),
            branchLabel(e.branch),
            e.kind,
            e.qty ?? "—",
            amount(e.basis || 0),
            amount(e.repair || 0),
            amount(e.recovery || 0),
            slug(e.actor),
            slug(e.notes),
          ]),
      ),
    ) +
    noReal
  );
}
function reportDamage() {
  const branch = branchNum(),
    token = stockRef("DMG");
  requireStockBranch(branch);
  const ps = stockVariants(branch).filter((p) => p["b" + branch] > 0);
  insist(ps.length, "No sellable stock at this branch.");
  stockForm(
    "Report damage",
    productPicker(ps) +
      field("Units", "damage-qty", "number", 1) +
      stockSelect(
        "damage-reason",
        damageReasons.map((s) => [s, s]),
        "Reason",
      ) +
      field("Notes", "damage-note"),
    "Move to quarantine",
    () => {
      quarantine({
        token,
        branch,
        id: $("#stock-variant").value,
        qty: $("#damage-qty").value,
        reason: $("#damage-reason").value,
        notes: $("#damage-note").value,
      });
      finish("Stock moved to quarantine");
    },
  );
}
function lotForm(d) {
  const token = stockRef("LOT"),
    open = defectState(d),
    actions = [
      ...(open.status === "Quarantine" ? ["Under Repair"] : []),
      "Restore",
      ...(state.role === "owner" ? ["Write off"] : []),
    ];
  stockForm(
    "Manage lot · " + d.ref,
    stockSelect(
      "lot-action",
      actions.map((s) => [s, s]),
      "Disposition",
    ) +
      '<div id="lot-values">' +
      field("Units", "lot-qty", "number", open.qty) +
      accountPicker("lot-account", d.branch) +
      field("Repair expense", "repair-cost", "number", 0) +
      field("Recovered amount", "recovered", "number", 0) +
      "</div>" +
      field("Notes", "lot-notes"),
    "Confirm disposition",
    () => {
      resolveDefect(d, {
        token,
        kind: $("#lot-action").value,
        qty: $("#lot-qty").value,
        account: $("#lot-account").value,
        repair: $("#repair-cost").value,
        recovery: $("#recovered").value,
        notes: $("#lot-notes").value,
      });
      finish("Disposition recorded");
    },
  );
  $("#repair-cost").step = $("#recovered").step = ".01";
  const change = () =>
    ($("#lot-values").hidden = $("#lot-action").value === "Under Repair");
  $("#lot-action").onchange = change;
  change();
}
function adjustmentPage() {
  return (
    title(
      "Stock Adjustments",
      "Reconcile a physical count with branch stock.",
      branchActions("Record count", "count"),
    ) +
    section(
      "Count history",
      table(
        [
          "Reference",
          "Date",
          "Branch",
          "SKU",
          "Previous",
          "Corrected",
          "Variance",
          "Carrying value change",
          "Reason",
          "Notes",
          "Recorded by",
        ],
        stockOps.events
          .filter((e) => e.kind === "Count adjustment" && scoped(e.branch))
          .map((e) => [
            e.id,
            e.date,
            branchLabel(e.branch),
            slug(e.sku),
            e.previous,
            e.corrected,
            e.qty,
            amount(e.basis),
            slug(e.reason),
            slug(e.notes),
            slug(e.actor),
          ]),
      ),
    ) +
    noReal
  );
}
function countForm() {
  const branch = branchNum(),
    token = stockRef("ADJ");
  requireStockBranch(branch);
  const ps = stockVariants(branch);
  insist(ps.length, "No branch variants.");
  let previous;
  stockForm(
    "Reconcile branch count",
    productPicker(ps) +
      '<p id="previous-count"></p>' +
      field("Corrected quantity", "corrected", "number", 0) +
      '<div id="count-cost-field">' +
      field("Confirmed unit cost for found stock", "found-cost", "number", "") +
      "</div>" +
      stockSelect(
        "count-type",
        adjustmentTypes
          .filter((s) => s !== "Correction" || state.role === "owner")
          .map((s) => [s, s]),
        "Reason",
      ) +
      field("Count notes", "count-notes"),
    "Post adjustment",
    () => {
      postCount({
        token,
        branch,
        id: $("#stock-variant").value,
        previous,
        corrected: $("#corrected").value,
        reason: $("#count-type").value,
        notes: $("#count-notes").value,
        unitCost: $("#found-cost").value,
      });
      finish("Count adjustment posted");
    },
  );
  const change = () => {
    const p = variant($("#stock-variant").value);
    previous = p["b" + branch];
    $("#previous-count").textContent = "Previous quantity " + previous;
    $("#corrected").value = previous;
    $("#count-cost-field").hidden = previous > 0;
    $("#found-cost").value = previous ? "" : p.buyingPrice;
  };
  $("#found-cost").step = ".01";
  $("#stock-variant").onchange = change;
  change();
}
function valuationRows(ps, branches) {
  return branches.flatMap((b) =>
    ps
      .map((p) => ({ p, b, ...position(p, b), ...availabilityAge(p, b) }))
      .filter((r) => availableAt(r.p, b) || r.total || r.defects || r.transit),
  );
}
function deadRows() {
  return valuationRows(
    catalogProducts(),
    scopedBranches().map((b) => +b.id),
  )
    .filter(
      (r) =>
        r.dead &&
        (stockOps.branch === "all" ||
          String(r.b) === stockOps.branch ||
          curBranch() !== "all") &&
        [r.p.name, r.p.sku, r.p.color, r.p.size, categoryName(r.p.categoryId)]
          .join(" ")
          .toLowerCase()
          .includes(stockOps.search.toLowerCase()),
    )
    .sort((a, b) =>
      stockOps.sort === "value"
        ? b.value - a.value
        : stockOps.sort === "name"
          ? a.p.name.localeCompare(b.p.name)
          : b.idle - a.idle,
    );
}
const deadHeaders = [
  "Product",
  "SKU",
  "Variant",
  "Branch",
  "Dead units",
  "Last sale",
  "Available since",
  "Days idle",
  "Inventory age (days)",
  "Buying value",
  "Selling value",
];
const deadCells = (r) => [
  r.p.name,
  r.p.sku,
  r.p.size + " / " + r.p.color,
  branchLabel(r.b),
  r.qty,
  r.last || "Never",
  r.since,
  r.idle,
  r.age,
  r.value / 100,
  r.selling / 100,
];
function deadColumns(cells) {
  return state.role === "owner" ? cells : cells.slice(0, -2);
}
function deadPage() {
  const rows = deadRows();
  return (
    title(
      "Dead Stock",
      "Sellable stock at or beyond its branch inactivity threshold.",
      state.role === "owner" ? stockButton("Set thresholds", "threshold") : "",
    ) +
    '<form id="dead-filter" class="toolbar">' +
    field("Search product / SKU", "dead-search", "search", stockOps.search) +
    stockSelect(
      "dead-sort",
      [
        ["days", "Days idle"],
        ["value", "Buying value"],
        ["name", "Product name"],
      ],
      "Sort by",
    ) +
    (curBranch() === "all"
      ? stockSelect(
          "dead-branch",
          [
            ["all", "Both branches"],
            ...APP_CONFIG.branches.map((b) => [b.id, b.name]),
          ],
          "Branch",
        )
      : "") +
    '<button class="btn">Apply</button>' +
    stockButton("Export CSV", "dead-export") +
    "</form><p>" +
    scopedBranches()
      .map((b) => b.name + " · " + stockOps.threshold[b.id] + " days")
      .join(" / ") +
    "</p>" +
    section(
      "Dead-stock totals · " +
        sumBy(rows, (r) => r.qty) +
        " units" +
        (state.role === "owner"
          ? " · " + amount(sumBy(rows, (r) => r.value))
          : ""),
      table(
        deadColumns(deadHeaders),
        rows.map((r) => deadColumns(deadCells(r)).map(slug)),
      ),
    ) +
    noReal
  );
}
function thresholds() {
  authorizedOwner();
  const branches = scopedBranches();
  stockForm(
    "Inactivity thresholds",
    branches
      .map(
        (b) =>
          stockSelect(
            "preset-" + b.id,
            [
              [30, "30 days"],
              [60, "60 days"],
              [90, "90 days"],
              ["custom", "Custom"],
            ],
            b.name,
          ) +
          field(
            "Custom days",
            "days-" + b.id,
            "number",
            stockOps.threshold[b.id],
          ),
      )
      .join(""),
    "Save thresholds",
    () => {
      const next = { ...stockOps.threshold };
      for (const b of branches) {
        const select = $("#preset-" + b.id);
        next[b.id] = units(
          select.value === "custom" ? $("#days-" + b.id).value : select.value,
        );
      }
      stockOps.threshold = next;
      finish("Thresholds saved");
    },
  );
  branches.forEach((b) => {
    const sel = $("#preset-" + b.id);
    sel.value = [30, 60, 90].includes(stockOps.threshold[b.id])
      ? stockOps.threshold[b.id]
      : "custom";
    const change = () => ($("#days-" + b.id).disabled = sel.value !== "custom");
    sel.onchange = change;
    change();
  });
}
const oldStockReport = inventory;
inventory = function () {
  const rows = valuationRows(
      catalogRows(true),
      scopedBranches().map((b) => +b.id),
    ),
    owner = state.role === "owner";
  return (
    oldStockReport() +
    section(
      "Inventory valuation",
      "<p>Transit belongs to the dispatching branch until receipt. Inventory age begins with the current uninterrupted period of positive sellable stock.</p>" +
        table(
          [
            "Variant",
            "Branch",
            "Sellable",
            "Quarantine",
            "In transit",
            "Average unit cost",
            ...(owner
              ? [
                  "Sellable cost",
                  "Quarantine cost",
                  "Transit cost",
                  "Total carrying value",
                  "Marked selling value",
                  "Potential gross margin",
                ]
              : []),
            "Last sale",
            "Stock age (days)",
            "Dead stock",
          ],
          rows.map((r) => [
            slug(r.p.sku),
            branchLabel(r.b),
            r.qty,
            r.defects,
            r.transit,
            amount(r.qty ? r.value / r.qty : 0),
            ...(owner
              ? [
                  amount(r.value),
                  amount(r.quarantined),
                  amount(r.travelling),
                  amount(r.total),
                  amount(r.selling),
                  amount(r.margin),
                ]
              : []),
            r.last || "Never",
            r.age,
            r.dead ? "Yes" : "No",
          ]),
        ),
    ) +
    (owner
      ? '<p class="note">Total carrying value in this selection ' +
        amount(sumBy(rows, (r) => r.total)) +
        "</p>"
      : "")
  );
};
const stockDashboard = overview;
overview = function () {
  const scope = reportingContext({from:state.date,to:state.date});
  const rows = stockAsOf(scope,state.date).filter(r=>r.dead);
  return (
    stockDashboard() +
    section(
      "Dead stock by branch",
      table(
        ["Branch", "Dead units", "Threshold"],
        scopedBranches().map((b) => [
          b.name,
          sumBy(
            rows.filter((r) => r.b === Number(b.id)),
            (r) => r.qty,
          ),
          stockOps.threshold[b.id] + " days",
        ]),
      ) + btn("Review dead stock", 'data-go="deadstock"'),
    )
  );
};
const priorStockBind = bind;
bind = function () {
  priorStockBind();
  if ($("#dead-filter")) {
    $("#dead-sort").value = stockOps.sort;
    if ($("#dead-branch")) $("#dead-branch").value = stockOps.branch;
    $("#dead-filter").onsubmit = (e) => {
      e.preventDefault();
      stockOps.search = $("#dead-search").value.trim();
      stockOps.sort = $("#dead-sort").value;
      stockOps.branch = $("#dead-branch")?.value || "all";
      render();
    };
  }
  document.querySelectorAll("[data-stock-action]").forEach(
    (button) =>
      (button.onclick = () => {
        const id = button.dataset.id,
          t = stockOps.transfers.find((t) => t.id === id),
          action = button.dataset.stockAction;
        try {
          switch (action) {
            case "transfer":
              return transferForm();
            case "edit":
              return transferForm(t);
            case "dispatch":
              dispatchTransfer(t);
              return finish("Transfer dispatched");
            case "cancel":
              requireStockBranch(t.from);
              insist(
                transferStatus(t) === "Draft",
                "Only drafts can be cancelled.",
              );
              stockEvent(stockRef("CAN"), {
                transfer: t.id,
                branch: t.from,
                kind: "Cancel",
              });
              return finish("Draft cancelled");
            case "receive":
              return receiptTransfer(t, false);
            case "resolve":
              return receiptTransfer(t, true);
            case "challan":
              return challan(t);
            case "damage":
              return reportDamage();
            case "lot":
              return lotForm(
                retail.defects.find(
                  (d) => d.ref + "|" + d.productId === id && scoped(d.branch),
                ),
              );
            case "count":
              return countForm();
            case "threshold":
              return thresholds();
            case "dead-export":
              return downloadCatalogCsv("dead-stock", [
                deadColumns(deadHeaders),
                ...deadRows().map((r) => deadColumns(deadCells(r))),
              ]);
          }
        } catch (e) {
          notify(e.message);
        }
      }),
  );
};
