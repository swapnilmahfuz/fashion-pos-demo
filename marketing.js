const marketing = {
  tab: "Compose",
  templates: [],
  history: [],
  branch: "all",
  group: "",
  activity: "Any",
  mode: "Individual",
  person: "",
  message: "",
  title: "",
  cost: 0,
  provider: "",
  whatsapp: true,
};
const gsmBasic = new Set(
  Array.from(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  ),
);
const gsmExtension = new Set(Array.from("^{}\\[~]|€\f"));
function smsSize(message) {
  const gsm = [...message].every((c) => gsmBasic.has(c) || gsmExtension.has(c));
  const units = gsm
    ? [...message].reduce((n, c) => n + (gsmExtension.has(c) ? 2 : 1), 0)
    : message.length;
  const single = gsm ? 160 : 70,
    multi = gsm ? 153 : 67;
  return {
    units,
    encoding: gsm ? "GSM-7" : "Unicode",
    segments: units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi),
  };
}
function canMarket(c, channel) {
  return Boolean(
    c?.active &&
      scoped(c.branch) &&
      reachablePhone(c.phone) &&
      c[channel] &&
      (channel !== "whatsapp" || marketing.whatsapp),
  );
}
function whatsappLink(c, message, label = "Open WhatsApp draft") {
  if (!canMarket(c, "whatsapp")) return "";
  const key = phoneKey(c.phone),
    phone =
      key.startsWith("01") && key.length === 11 ? "880" + key.slice(1) : key;
  return (
    '<a class="btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/' +
    phone +
    "?text=" +
    slug(encodeURIComponent(message)) +
    '">' +
    slug(label) +
    "</a>"
  );
}
function marketAudience(channel = "sms", f = marketing) {
  return customersData.filter((c) => {
    if (
      !canMarket(c, channel) ||
      (curBranch() === "all" &&
        f.branch !== "all" &&
        String(c.branch) !== f.branch) ||
      (f.group && String(c.groupId) !== f.group)
    )
      return false;
    const purchases = ledger.filter(
      (s) =>
        s.customerId === c.id &&
        scoped(s.branch) &&
        s.lines.some((l) => !l.refund),
    );
    if (f.activity === "Purchased in last 30 days")
      return purchases.some((s) => s.date >= dayShift(today, -29));
    if (f.activity === "No purchase in last 30 days")
      return !purchases.some((s) => s.date >= dayShift(today, -29));
    return true;
  });
}
function marketingRecipients(channel, f = marketing) {
  return marketAudience(channel, f).filter(
    (c) => f.mode === "Bulk" || String(c.id) === f.person,
  );
}
function saveSms(status, f = marketing) {
  const { segments } = smsSize(f.message),
    recipients = marketingRecipients("sms", f);
  insist(
    f.message.trim() && segments <= 16,
    "Enter a message of up to 16 SMS segments.",
  );
  insist(
    status === "Draft" || recipients.length,
    "Choose customers currently opted in to SMS.",
  );
  const row = {
    id: "SMS-" + (marketing.history.length + 1),
    date: retailTime(),
    recipients: recipients.map((c) => ({
      id: c.id,
      branch: c.branch,
      name: c.name,
    })),
    branch: curBranch(),
    actor: state.role,
    body: f.message,
    segments,
    cost: segments * recipients.length * marketing.cost,
    status,
    delivery: status === "Draft" ? "Pending simulation" : "Not sent",
  };
  marketing.history.unshift(row);
  return row;
}
function marketButton(label, key) {
  return btn(label, 'data-market="' + key + '"');
}
function marketFilters() {
  return (
    (curBranch() === "all"
      ? stockSelect(
          "market-branch",
          [
            ["all", "Both branches"],
            ...APP_CONFIG.branches.map((b) => [b.id, b.name]),
          ],
          "Audience branch",
        )
      : "") +
    stockSelect(
      "market-group",
      [["", "All groups"], ...customerGroups.map((g) => [g.id, g.name])],
      "Group",
    ) +
    labelSelect(
      "market-activity",
      ["Any", "Purchased in last 30 days", "No purchase in last 30 days"],
      "Purchase activity",
    )
  );
}
const composeByScope = new Map();
let composeScope = null;
function syncComposeScope() {
  const scope = state.role + "|" + curBranch();
  if (composeScope === scope) return;
  const keys = ["branch", "group", "activity", "mode", "person", "message"];
  if (composeScope)
    composeByScope.set(
      composeScope,
      Object.fromEntries(keys.map((k) => [k, marketing[k]])),
    );
  Object.assign(
    marketing,
    composeByScope.get(scope) || {
      branch: "all",
      group: "",
      activity: "Any",
      mode: "Individual",
      person: "",
      message: "",
    },
  );
  composeScope = scope;
}
function marketPage() {
  syncComposeScope();
  const tab = marketing.tab;
  let body = "";
  if (tab === "Compose")
    body = section(
      "Compose a message",
      '<div class="stock-form">' +
        marketFilters() +
        labelSelect("market-mode", ["Individual", "Bulk"], "Recipients") +
        stockSelect(
          "market-person",
          [
            ["", "Select customer"],
            ...new Map(
              [...marketAudience(), ...marketAudience("whatsapp")].map((c) => [
                c.id,
                c.name + " · " + branchLabel(c.branch),
              ]),
            ),
          ],
          "Customer",
        ) +
        stockSelect(
          "market-template",
          [
            ["", "Choose a template"],
            ...marketing.templates
              .filter((t) => t.branch === "all" || scoped(t.branch))
              .map((t) => [t.id, t.name]),
          ],
          "Template",
        ) +
        '<label>Message<textarea id="market-body" class="input" rows="5" maxlength="2500">' +
        slug(marketing.message) +
        '</textarea></label><p id="market-size" aria-live="polite"></p><div id="market-wa"></div></div><div class="toolbar">' +
        marketButton("Save draft", "draft") +
        marketButton("Simulate SMS", "simulate") +
        marketButton("Copy message", "copy") +
        marketButton("Download SMS recipients", "sms-csv") +
        marketButton("Download WhatsApp recipients", "wa-csv") +
        "</div>",
    );
  if (tab === "Customer Segments")
    body = section(
      "Eligible sample audience",
      '<div class="toolbar">' +
        marketFilters() +
        "</div>" +
        table(
          [
            "Customer",
            "Branch",
            "Group",
            "SMS permission",
            "WhatsApp permission",
          ],
          [
            ...new Map(
              [...marketAudience(), ...marketAudience("whatsapp")].map((c) => [
                c.id,
                c,
              ]),
            ).values(),
          ].map((c) => [
            slug(c.name),
            branchLabel(c.branch),
            slug(customerGroups.find((g) => g.id === c.groupId)?.name || "—"),
            canMarket(c, "sms") ? "Allowed" : "Off",
            canMarket(c, "whatsapp") ? "Allowed" : "Off",
          ]),
        ) +
        '<div class="toolbar">' +
        marketButton("Download SMS segment", "sms-csv") +
        marketButton("Download WhatsApp segment", "wa-csv") +
        "</div>",
    );
  if (tab === "Templates")
    body = section(
      "Message templates",
      marketButton("Add template", "template") +
        table(
          ["Name", "Branch", "Message", ""],
          marketing.templates
            .filter((t) => t.branch === "all" || scoped(t.branch))
            .map((t) => [
              slug(t.name),
              branchLabel(t.branch),
              slug(t.body),
              btn("Use template", 'data-use-template="' + t.id + '"') +
                (t.branch === curBranch() || state.role === "owner"
                  ? btn("Edit", 'data-edit-template="' + t.id + '"')
                  : ""),
            ]),
        ),
    );
  if (tab === "SMS History")
    body = section(
      "SMS history",
      table(
        [
          "Reference",
          "Date (Dhaka)",
          "Branch",
          "SMS recipients",
          "Segments each",
          "Estimated cost",
          "Status",
          "Delivery",
          "",
        ],
        marketing.history
          .filter((r) =>
            r.branch === "all"
              ? curBranch() === "all" && state.role === "owner"
              : scoped(r.branch),
          )
          .map((r) => [
            r.id,
            r.date,
            branchLabel(r.branch),
            r.recipients.length,
            r.segments,
            amount(r.cost),
            r.status,
            r.delivery,
            btn("Details", 'data-sms-details="' + r.id + '"') +
              (r.status === "Draft"
                ? btn("Resume draft", 'data-sms-draft="' + r.id + '"')
                : ""),
          ]),
      ),
    );
  if (tab === "SMS Settings")
    body = section(
      "SMS gateway",
      "<p>Simulation active. Provider balance unavailable.</p><p>Future provider: " +
        slug(marketing.provider || "Unassigned") +
        " · Estimated segment cost " +
        amount(marketing.cost) +
        "</p>" +
        (state.role === "owner"
          ? marketButton("Edit simulation settings", "settings")
          : ""),
    );
  return (
    title(
      "Marketing",
      "Prepare consented messages and review SMS simulations.",
      btn("Create offer message", 'data-action="offer"'),
    ) +
    contactTabs(
      [
        "Compose",
        "Customer Segments",
        "Templates",
        "SMS History",
        "SMS Settings",
      ],
      tab,
      "marketing",
    ) +
    body +
    noReal
  );
}
function templateForm(t) {
  stockForm(
    t ? "Edit template" : "Add template",
    field("Template name", "template-name", "text", t?.name || "") +
      '<label>Message<textarea class="input" id="template-body" rows="5">' +
      slug(t?.body || "") +
      "</textarea></label>",
    "Save template",
    () => {
      const name = $("#template-name").value.trim(),
        body = $("#template-body").value.trim();
      insist(
        name && body && smsSize(body).segments <= 16,
        "Enter a name and a message up to 16 segments.",
      );
      if (t) Object.assign(t, { name, body });
      else
        marketing.templates.push({
          id: marketing.templates.length + 1,
          branch: curBranch(),
          name,
          body,
        });
      finish("Template saved");
    },
  );
}
function smsSettings() {
  ownerFinance();
  stockForm(
    "SMS simulation settings",
    field("Future provider label", "sms-provider", "text", marketing.provider) +
      field(
        "Estimated cost per segment (BDT)",
        "sms-cost",
        "number",
        marketing.cost / 100,
      ) +
      "<p>Provider credentials and live delivery belong to a later approved server integration.</p>",
    "Save settings",
    () => {
      marketing.cost = cents($("#sms-cost").value);
      marketing.provider = $("#sms-provider").value.trim();
      settingAudit("SMS simulation", "Provider label and segment estimate");
      finish("Settings saved");
    },
  );
  $("#sms-cost").step = ".01";
}
function bindMarketing() {
  document.querySelectorAll("[data-marketing-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        marketing.tab = b.dataset.marketingTab;
        render();
      }),
  );
  for (const key of ["branch", "group", "activity", "mode", "person"]) {
    const el = $("#market-" + key);
    if (el) {
      el.value = marketing[key];
      if (!el.value && key === "person") marketing.person = "";
      el.onchange = (e) => {
        marketing[key] = e.target.value;
        render();
      };
    }
  }
  const body = $("#market-body");
  if (body) {
    const draw = () => {
      marketing.message = body.value;
      const n = smsSize(body.value),
        recipients = marketingRecipients("sms").length;
      $("#market-size").textContent =
        n.units +
        " " +
        n.encoding +
        " units · " +
        n.segments +
        " segments × " +
        recipients +
        " recipients · " +
        amount(n.segments * recipients * marketing.cost) +
        " estimated";
      $("#market-wa").innerHTML =
        marketing.mode === "Individual" && body.value.trim()
          ? whatsappLink(
              marketAudience("whatsapp").find(
                (c) => String(c.id) === marketing.person,
              ),
              body.value,
            )
          : "";
    };
    body.oninput = draw;
    draw();
    $("#market-template").onchange = (e) => {
      const t = marketing.templates.find(
        (x) => x.id === Number(e.target.value),
      );
      if (t) {
        body.value = t.body;
        draw();
      }
    };
  }
  document.querySelectorAll("[data-market]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          switch (b.dataset.market) {
            case "draft":
            case "simulate":
              saveSms(b.dataset.market === "draft" ? "Draft" : "Simulated");
              marketing.tab = "SMS History";
              return render();
            case "template":
              return templateForm();
            case "settings":
              return smsSettings();
            case "copy":
              await navigator.clipboard.writeText(marketing.message);
              return notify("Message copied");
            default: {
              const channel =
                  b.dataset.market === "sms-csv" ? "sms" : "whatsapp",
                rows =
                  marketing.tab === "Compose"
                    ? marketingRecipients(channel)
                    : marketAudience(channel);
              return downloadCatalogCsv(channel + "-recipients", [
                ["Customer", "Phone", "Branch"],
                ...rows.map((c) => [c.name, c.phone, branchLabel(c.branch)]),
              ]);
            }
          }
        } catch (e) {
          notify(e.message);
        }
      }),
  );
  document.querySelectorAll("[data-use-template],[data-edit-template]").forEach(
    (b) =>
      (b.onclick = () => {
        const t = marketing.templates.find(
          (t) =>
            t.id === Number(b.dataset.useTemplate || b.dataset.editTemplate),
        );
        if (b.dataset.editTemplate) return templateForm(t);
        marketing.message = t.body;
        marketing.tab = "Compose";
        render();
      }),
  );
  document.querySelectorAll("[data-sms-details],[data-sms-draft]").forEach(
    (b) =>
      (b.onclick = () => {
        const r = marketing.history.find(
          (r) => r.id === (b.dataset.smsDetails || b.dataset.smsDraft),
        );
        if (b.dataset.smsDraft) {
          marketing.message = r.body;
          marketing.tab = "Compose";
          render();
          return;
        }
        purchaseModal(
          "SMS · " + r.id,
          "<p>" +
            slug(r.body) +
            "</p><p>" +
            r.status +
            " · " +
            r.delivery +
            "</p>" +
            table(
              ["Customer", "Branch"],
              r.recipients.map((c) => [slug(c.name), branchLabel(c.branch)]),
            ) +
            btn("Close", "data-close"),
        );
      }),
  );
}
