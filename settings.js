const demoSettings = {
  tab: "Business",
  yearStart: 1,
  email: "",
  phone: "",
  address: "",
  logo: "",
  managerBranch: APP_CONFIG.managerBranch,
  category: "",
  active: true,
  skuDigits: 4,
  lowStock: APP_CONFIG.lowStockThreshold,
  vatMode: "included",
  invoiceDiscount: true,
  credit: true,
  labelWidth: 58,
  labelHeight: 40,
  labelCount: 1,
  labelPrice: true,
  labelLayout: "Grid",
  branches: Object.fromEntries(
    APP_CONFIG.branches.map((b) => [
      b.id,
      {
        address: "",
        phone: "",
        header: "",
        footer: null,
        prefix: "",
        layout: null,
        checkoutAccount: null,
      },
    ]),
  ),
};
const settingsAudit = [];
function settingAudit(action, detail, branch = null) {
  settingsAudit.push({
    ref: "SET-" + (settingsAudit.length + 1),
    date: today,
    actor: state.role,
    branch,
    action,
    detail,
  });
}
function settingsFields(entries) {
  return entries
    .map(([label, key, type, value]) =>
      field(label, "setting-" + key, type, value),
    )
    .join("");
}
function settingsCheck(label, key, value) {
  return (
    '<label><input type="checkbox" id="setting-' +
    key +
    '" ' +
    (value ? "checked" : "") +
    "> " +
    label +
    "</label>"
  );
}
function settingsText(key) {
  return $("#setting-" + key).value.trim();
}
function settingsNumber(key, min, max) {
  const input = settingsText(key),
    n = Number(input);
  insist(
    input && Number.isInteger(n) && n >= min && n <= max,
    "Enter " + min + "–" + max + " for " + key + ".",
  );
  return n;
}
function settingsFieldRow(
  label,
  key,
  type = "text",
  value = demoSettings[key],
) {
  return [label, key, type, value];
}
function settingsView() {
  const owner = state.role === "owner",
    tabs = owner
      ? [
          "Business",
          "Branches",
          "Products & Inventory",
          "Sales & VAT",
          "Invoices & Receipts",
          "Barcode & Printers",
          "Accounts & Payments",
          "Notifications",
          "Security",
        ]
      : ["Security"];
  const tab = tabs.includes(demoSettings.tab) ? demoSettings.tab : tabs[0];
  const b = demoSettings.branches[curBranch()],
    rows = [];
  let actions = "",
    extra = "";
  const action = (label, key) => btn(label, 'data-settings="' + key + '"');
  switch (tab) {
    case "Business":
      rows.push(
        ["Brand", APP_CONFIG.brand],
        ["Currency", APP_CONFIG.currency],
        ["Timezone", APP_CONFIG.timezone],
        [
          "Financial year begins",
          new Intl.DateTimeFormat("en", {
            month: "long",
            timeZone: "UTC",
          }).format(new Date(Date.UTC(2026, demoSettings.yearStart - 1, 1))),
        ],
        ["Email", demoSettings.email],
        ["Phone", demoSettings.phone],
        ["Address", demoSettings.address],
      );
      actions = action("Edit business", "business");
      if (demoSettings.logo)
        extra =
          '<img class="receipt-logo" alt="QAHAF logo" src="' +
          slug(demoSettings.logo) +
          '">';
      break;
    case "Branches":
      rows.push(
        ...scopedBranches().map((x) => [
          x.name,
          [
            demoSettings.branches[x.id].address,
            demoSettings.branches[x.id].phone,
          ]
            .filter(Boolean)
            .join(" · "),
        ]),
      );
      actions = b ? action("Edit branch", "branch") : "";
      break;
    case "Products & Inventory":
      rows.push(
        [
          "Default category",
          categories.find((c) => c.id === Number(demoSettings.category))
            ?.name || "First active category",
        ],
        ["SKU sequence digits", demoSettings.skuDigits],
        ["Default status", demoSettings.active ? "Active" : "Inactive"],
        ["Stock alert at or below", demoSettings.lowStock],
        ...scopedBranches().map((x) => [
          x.name + " dead stock",
          stockOps.threshold[x.id] + " days",
        ]),
      );
      actions =
        action("Edit inventory defaults", "inventory") +
        action("Dead-stock thresholds", "dead");
      break;
    case "Sales & VAT":
      rows.push(
        ["Demo VAT rate", retail.rate + "%"],
        ["Default VAT mode", demoSettings.vatMode],
        ["Invoice discounts", demoSettings.invoiceDiscount ? "Enabled" : "Off"],
        ["Credit checkout", demoSettings.credit ? "Enabled" : "Off"],
        ["Return policy", retail.footer],
      );
      actions = action("Edit sales defaults", "sales");
      break;
    case "Invoices & Receipts":
      rows.push(
        ...scopedBranches().map((x) => [
          x.name,
          receiptSettingsDescription(x.id),
        ]),
      );
      actions = b
        ? action("Edit branch receipt", "receipt") +
          action("Preview and print", "receipt-preview")
        : "";
      break;
    case "Barcode & Printers":
      rows.push(
        ["Barcode format", "Code 128"],
        [
          "Label dimensions",
          demoSettings.labelWidth + " × " + demoSettings.labelHeight + " mm",
        ],
        ["Labels per variant", demoSettings.labelCount],
        ["Layout", demoSettings.labelLayout],
      );
      actions =
        action("Edit barcode defaults", "barcode") +
        action("Preview and print sample labels", "barcode-preview");
      break;
    case "Accounts & Payments":
      rows.push(
        ...scopedBranches().map((x) => [
          x.name,
          "Default " +
            defaultCheckoutAccount(x.id) +
            " · " +
            branchAccounts(x.id)
              .map((a) => a.name)
              .join(", "),
        ]),
      );
      actions =
        (b ? action("Choose checkout default", "payments") : "") +
        btn("Manage account availability", 'data-go="funds"');
      break;
    case "Notifications":
      rows.push(
        ["SMS gateway", "Simulation · balance unavailable"],
        ["WhatsApp drafting", marketing.whatsapp ? "Enabled" : "Off"],
      );
      actions =
        action("Sharing preferences", "notifications") +
        btn("Templates and SMS settings", 'data-go="marketing"');
      break;
    case "Security":
      rows.push(
        ["Role", owner ? "Owner" : "Manager"],
        ["Assigned Manager branch", branchLabel(demoSettings.managerBranch)],
        [
          "Role scope",
          owner
            ? "Both branches, settings and financial analytics"
            : "Assigned branch operations and operational reports",
        ],
      );
      actions = owner
        ? action("Edit Manager assignment", "security") +
          action("Settings audit", "audit")
        : "";
      extra =
        '<p class="note">Browser-only role simulation for public sample data. Production authentication and server-enforced permissions are pending.</p>';
      break;
  }
  return (
    title(
      "Settings",
      owner
        ? "Company and branch configuration."
        : "Assigned-branch access overview.",
    ) +
    contactTabs(tabs, tab, "settings") +
    section(
      tab,
      extra +
        table(
          ["Setting", "Value"],
          rows.map((r) => r.map(slug)),
        ) +
        '<div class="toolbar">' +
        actions +
        "</div>",
    ) +
    noReal
  );
}
function defaultCheckoutAccount(branch) {
  const id = demoSettings.branches[branch]?.checkoutAccount;
  return branchAccounts(branch).find((a) => a.id === id)?.name || "Cash Box";
}
function receiptSettingsDescription(branch) {
  const b = demoSettings.branches[branch];
  return (
    (b.prefix || "INV") +
    " · " +
    (b.layout || retail.layout) +
    " · " +
    (b.header || "QAHAF")
  );
}
function receiptSnapshot(branch) {
  const b = demoSettings.branches[branch];
  return Object.freeze({
    logo: demoSettings.logo,
    address: b.address || demoSettings.address,
    phone: b.phone || demoSettings.phone,
    header: b.header,
    footer: b.footer ?? retail.footer,
    layout: b.layout,
  });
}
function receiptHeading(meta) {
  return (
    (meta.logo
      ? '<img alt="QAHAF logo" class="receipt-logo" src="' +
        slug(meta.logo) +
        '">'
      : "") +
    "<h3>" +
    APP_CONFIG.brand +
    "</h3>" +
    [meta.header, meta.address, meta.phone]
      .filter(Boolean)
      .map((x) => "<div>" + slug(x) + "</div>")
      .join("")
  );
}
function invoiceIdentifier(branch) {
  const prefix = demoSettings.branches[branch].prefix;
  return retailId(prefix ? prefix + "-" + branch : "INV");
}
function receiptPreview() {
  const branch = curBranch();
  requireStockBranch(branch);
  const meta = receiptSnapshot(branch);
  retailModal(
    "Receipt print preview",
    '<article id="demo-receipt" class="retail-receipt">' +
      receiptHeading(meta) +
      "<p>" +
      branchLabel(branch) +
      " · " +
      slug(demoSettings.branches[branch].prefix || "INV") +
      " · Preview</p><p>Sample garment · " +
      money(500) +
      "</p><p>" +
      slug(meta.footer) +
      '</p></article><div class="modal-foot">' +
      btn("Print preview", 'id="test-receipt"') +
      btn("Close", "data-close") +
      "</div>",
  );
  const layout = meta.layout || retail.layout;
  $("#demo-receipt").dataset.layout = layout;
  $("#test-receipt").onclick = () => printRetailReceipt(layout);
}
function editSettings(kind) {
  ownerFinance();
  const branch = curBranch(),
    b = demoSettings.branches[branch],
    row = settingsFieldRow;
  if (["branch", "receipt", "payments", "receipt-preview"].includes(kind))
    requireStockBranch(branch);
  if (kind === "receipt-preview") return receiptPreview();
  if (kind === "dead") return thresholds();
  if (kind === "barcode-preview") return labels(catalogProducts()[0]?.id);
  if (kind === "audit")
    return purchaseModal(
      "Settings audit",
      table(
        ["Date", "Actor", "Setting", "Change"],
        settingsAudit
          .filter((e) => !e.branch || scoped(e.branch))
          .map((e) => [e.date, e.actor, slug(e.action), slug(e.detail)]),
      ) + btn("Close", "data-close"),
    );
  let html, save;
  switch (kind) {
    case "business":
      html =
        settingsFields([
          row("Financial year start month (1–12)", "yearStart", "number"),
          row("Email", "email", "email"),
          row("Phone", "phone", "tel"),
          row("Address", "address"),
        ]) +
        '<label>Logo (PNG, JPEG or WebP, 2 MB)<input id="setting-logo" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
        settingsCheck("Remove logo", "remove-logo", false);
      save = (logo) =>
        Object.assign(demoSettings, {
          yearStart: settingsNumber("yearStart", 1, 12),
          email: settingsText("email"),
          phone: settingsText("phone"),
          address: settingsText("address"),
          logo,
        });
      break;
    case "branch":
      html = settingsFields([
        row("Branch address", "address", "text", b.address),
        row("Branch phone", "phone", "tel", b.phone),
      ]);
      save = () =>
        Object.assign(b, {
          address: settingsText("address"),
          phone: settingsText("phone"),
        });
      break;
    case "inventory":
      html =
        stockSelect(
          "setting-category",
          [
            ["", "First active category"],
            ...categories.filter((c) => !c.archived).map((c) => [c.id, c.name]),
          ],
          "Default category",
        ) +
        settingsFields([
          row("SKU sequence digits (3–8)", "skuDigits", "number"),
          row("Low-stock alert threshold", "lowStock", "number"),
        ]) +
        settingsCheck(
          "New variants start active",
          "active",
          demoSettings.active,
        );
      save = () =>
        Object.assign(demoSettings, {
          category: settingsText("category"),
          skuDigits: settingsNumber("skuDigits", 3, 8),
          lowStock: settingsNumber("lowStock", 0, 10000),
          active: $("#setting-active").checked,
        });
      break;
    case "sales":
      html =
        settingsFields([
          row("Demo VAT rate (%)", "vat", "number", retail.rate),
          row("Return policy", "policy", "text", retail.footer),
        ]) +
        stockSelect(
          "setting-vatMode",
          [
            ["included", "Inclusive"],
            ["excluded", "Exclusive"],
            ["exempt", "Exempt"],
          ],
          "Default VAT mode",
        ) +
        settingsCheck(
          "Enable invoice discount",
          "invoiceDiscount",
          demoSettings.invoiceDiscount,
        ) +
        settingsCheck("Allow unpaid balance", "credit", demoSettings.credit);
      save = () => {
        const rate = cents(settingsText("vat")) / 100;
        insist(rate <= 100, "VAT must be 0–100%.");
        retail.rate = rate;
        retail.footer = settingsText("policy");
        Object.assign(demoSettings, {
          vatMode: settingsText("vatMode"),
          invoiceDiscount: $("#setting-invoiceDiscount").checked,
          credit: $("#setting-credit").checked,
        });
      };
      break;
    case "receipt":
      html =
        settingsFields([
          row("Invoice prefix (optional)", "prefix", "text", b.prefix),
          row("Header", "header", "text", b.header),
          row(
            "Footer (blank uses return policy)",
            "footer",
            "text",
            b.footer || "",
          ),
        ]) +
        stockSelect(
          "setting-layout",
          [["", "Use default"], ...["58mm", "80mm", "A4"].map((x) => [x, x])],
          "Print size",
        );
      save = () => {
        const prefix = settingsText("prefix").toUpperCase();
        insist(
          /^[A-Z0-9]{0,12}$/.test(prefix),
          "Use up to 12 letters or digits.",
        );
        Object.assign(b, {
          prefix,
          header: settingsText("header"),
          footer: settingsText("footer") || null,
          layout: settingsText("layout") || null,
        });
      };
      break;
    case "barcode":
      html =
        settingsFields([
          row("Width (40–100 mm)", "labelWidth", "number"),
          row("Minimum height (25–100 mm)", "labelHeight", "number"),
          row("Labels per variant", "labelCount", "number"),
        ]) +
        labelSelect(
          "setting-labelLayout",
          ["Grid", "Single column"],
          "Layout",
        ) +
        settingsCheck(
          "Include selling price",
          "labelPrice",
          demoSettings.labelPrice,
        );
      save = () =>
        Object.assign(demoSettings, {
          labelWidth: settingsNumber("labelWidth", 40, 100),
          labelHeight: settingsNumber("labelHeight", 25, 100),
          labelCount: settingsNumber("labelCount", 1, 100),
          labelLayout: settingsText("labelLayout"),
          labelPrice: $("#setting-labelPrice").checked,
        });
      break;
    case "payments":
      html = accountPicker("setting-checkoutAccount", branch);
      save = () => {
        b.checkoutAccount = fundAccount(
          branch,
          settingsText("checkoutAccount"),
        ).id;
      };
      break;
    case "notifications":
      html = settingsCheck(
        "Enable individual WhatsApp drafting",
        "whatsapp",
        marketing.whatsapp,
      );
      save = () => {
        marketing.whatsapp = $("#setting-whatsapp").checked;
      };
      break;
    case "security":
      html = stockSelect(
        "setting-managerBranch",
        APP_CONFIG.branches.map((x) => [x.id, x.name]),
        "Manager preview assignment",
      );
      save = () => {
        demoSettings.managerBranch = settingsText("managerBranch");
      };
      break;
  }
  stockForm("Edit " + demoSettings.tab, html, "Save settings", () => {
    const image = $("#setting-logo")?.files[0];
    if (image)
      insist(
        ["image/png", "image/jpeg", "image/webp"].includes(image.type) &&
          image.size <= 2097152,
        "Choose PNG, JPEG or WebP up to 2 MB.",
      );
    const logo = image
      ? URL.createObjectURL(image)
      : $("#setting-remove-logo")?.checked
        ? ""
        : demoSettings.logo;
    save(logo);
    settingAudit(
      demoSettings.tab,
      [...$("#stock-form").querySelectorAll("input,select")]
        .filter((el) => el.type !== "file")
        .map(
          (el) =>
            el.id.replace("setting-", "") +
            "=" +
            (el.type === "checkbox" ? el.checked : el.value),
        )
        .join(" · "),
      b && ["branch", "receipt", "payments"].includes(kind)
        ? Number(branch)
        : null,
    );
    finish("Settings saved");
  });
  const values = {
    category: demoSettings.category,
    vatMode: demoSettings.vatMode,
    layout: b?.layout || "",
    labelLayout: demoSettings.labelLayout,
    checkoutAccount: defaultCheckoutAccount(branch),
    managerBranch: demoSettings.managerBranch,
  };
  for (const [key, value] of Object.entries(values))
    if ($("#setting-" + key)) $("#setting-" + key).value = value;
  if ($("#setting-vat")) $("#setting-vat").step = ".01";
}
function bindDemoSettings() {
  document.querySelectorAll("[data-settings-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        demoSettings.tab = b.dataset.settingsTab;
        render();
      }),
  );
  document.querySelectorAll("[data-settings]").forEach(
    (b) =>
      (b.onclick = () => {
        try {
          editSettings(b.dataset.settings);
        } catch (e) {
          notify(e.message);
        }
      }),
  );
}
const bindWithReports = bind;
bind = function () {
  bindWithReports();
  bindContacts();
  bindMarketing();
  bindDemoSettings();
};
