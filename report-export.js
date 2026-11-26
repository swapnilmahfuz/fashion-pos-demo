// Load bundled encoders only when their format is requested.
const reportLibraries = new Map();
function loadReportLibrary(file) {
  if (!reportLibraries.has(file))
    reportLibraries.set(
      file,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "vendor/" + file;
        script.onload = resolve;
        script.onerror = () => {
          reportLibraries.delete(file);
          reject(Error("Could not load " + file));
        };
        document.head.append(script);
      }),
    );
  return reportLibraries.get(file);
}
function exportMatrix(m) {
  const cells = (values, headers) =>
    values.map((v, i) => ({
      v: v == null ? null : monetary(headers[i]) ? v / 100 : v,
      h: headers[i],
    }));
  const plain = (...v) =>
    cells(
      v,
      v.map(() => ""),
    );
  const metricRows = (list) =>
    list.map(([h, v]) => cells([heading(h), v], ["", h]));
  return [
    ...m.meta.map((r) => plain(...r)),
    plain("Matching rows", m.rows.length),
    ...metricRows(m.summary),
    ...metricRows(m.support),
    plain(m.notes),
    plain(...m.headers.map(heading)),
    ...m.rows.map((r) => cells(r.v, m.headers)),
    cells(
      m.totals.map((v, i) => (i ? v : "Total")),
      m.headers,
    ),
  ];
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function safeReportCsv(v) {
  if (typeof v === "string" && /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(v))
    v = "'" + v;
  return '"' + String(v ?? "").replaceAll('"', '""') + '"';
}
const exportText = (c) =>
  c.v == null
    ? ""
    : typeof c.v === "number" && monetary(c.h)
      ? "BDT " +
        c.v.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : typeof c.v === "number" && c.h.startsWith("%")
        ? c.v.toFixed(2) + "%"
        : String(c.v);
async function downloadAnalytics(format) {
  const m = buildReport(),
    matrix = exportMatrix(m),
    filename =
      "QAHAF-" +
      m.title.replace(/[^\w]+/g, "-") +
      "-" +
      reportState.from +
      "-" +
      reportState.to;
  if (format === "csv") {
    downloadBlob(
      new Blob(
        [
          "\uFEFF" +
            matrix
              .map((r) => r.map((c) => safeReportCsv(c.v)).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      filename + ".csv",
    );
    return;
  }
  const head = matrix.length - m.rows.length - 2,
    labels = m.headers.map(heading);
  if (format === "print") {
    const root = document.createElement("article");
    root.id = "analytics-print";
    root.innerHTML =
      "<h1>" +
      slug(m.title) +
      "</h1>" +
      table(
        ["Report details", "Value"],
        matrix.slice(0, head).map((r) => r.map((c) => slug(exportText(c)))),
      ) +
      table(
        labels,
        matrix.slice(head + 1).map((r) => r.map((c) => slug(exportText(c)))),
      );
    document.querySelector("#analytics-print")?.remove();
    document.body.append(root);
    window.addEventListener("afterprint", () => root.remove(), { once: true });
    window.print();
    return;
  }
  if (format === "xlsx") {
    await loadReportLibrary("exceljs.min.js");
    const book = new ExcelJS.Workbook();
    book.creator = APP_CONFIG.brand;
    const sheet = book.addWorksheet("Report");
    matrix.forEach((r, i) => {
      const row = sheet.addRow(r.map((c) => c.v));
      r.forEach((c, k) => {
        const cell = row.getCell(k + 1);
        if (monetary(c.h) && typeof c.v === "number")
          cell.numFmt = '"BDT" #,##0.00;[Red]("BDT" #,##0.00)';
        if (c.h.startsWith("%") && typeof c.v === "number")
          cell.numFmt = '0.00"%"';
      });
      if (i === head || i === matrix.length - 1)
        row.font = { bold: true, color: { argb: "FF4B3A2F" } };
    });
    sheet.columns.forEach(
      (col, i) =>
        (col.width = Math.min(
          55,
          Math.max(
            18,
            labels[i]?.length + 2 || 20,
            ...m.rows.slice(0, 100).map((r) => String(r.v[i] ?? "").length + 1),
          ),
        )),
    );
    sheet.autoFilter = {
      from: { row: head + 1, column: 1 },
      to: { row: head + 1, column: labels.length },
    };
    downloadBlob(
      new Blob([await book.xlsx.writeBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename + ".xlsx",
    );
    return;
  }
  if (format === "pdf") {
    await loadReportLibrary("pdfmake.min.js");
    await loadReportLibrary("vfs_fonts.js");
    const rich = (s) =>
      String(s)
        .split(/([\u0980-\u09FF]+)/)
        .filter(Boolean)
        .map((text) =>
          /[\u0980-\u09FF]/.test(text) ? { text, font: "Bengali" } : { text },
        );
    const cell = (c) => ({
      text: rich(exportText(c)),
      alignment: typeof c.v === "number" ? "right" : "left",
    });
    const doc = {
      pageSize: labels.length > 10 ? "A3" : "A4",
      pageOrientation: "landscape",
      pageMargins: [24, 25, 24, 30],
      defaultStyle: { font: "Roboto", fontSize: 9, color: "#1F1F1C" },
      footer: (n, count) => ({
        text: "QAHAF · " + n + " / " + count,
        alignment: "right",
        margin: [0, 5, 24, 0],
      }),
      content: [
        { text: m.title, fontSize: 17, bold: true, margin: [0, 0, 0, 8] },
        ...matrix
          .slice(0, head)
          .filter((r) => r.length && r[0].v)
          .map((r) => ({
            text: rich(r.map(exportText).join("   ")),
            margin: [0, 0, 0, 2],
          })),
        {
          margin: [0, 10, 0, 0],
          table: {
            headerRows: 1,
            widths: labels.map(() => "*"),
            body: [
              labels.map((text) => ({
                text,
                bold: true,
                fillColor: "#E7DED2",
              })),
              ...matrix.slice(head + 1).map((r) => r.map(cell)),
            ],
          },
          layout: "lightHorizontalLines",
        },
      ],
    };
    const fonts = {
      Roboto: {
        normal: "Roboto-Regular.ttf",
        bold: "Roboto-Medium.ttf",
        italics: "Roboto-Italic.ttf",
        bolditalics: "Roboto-MediumItalic.ttf",
      },
      Bengali: {
        normal: "NotoSansBengali-Regular.ttf",
        bold: "NotoSansBengali-Regular.ttf",
        italics: "NotoSansBengali-Regular.ttf",
        bolditalics: "NotoSansBengali-Regular.ttf",
      },
    };
    await new Promise((resolve, reject) => {
      try {
        pdfMake.createPdf(doc, undefined, fonts).getBlob((blob) => {
          downloadBlob(blob, filename + ".pdf");
          resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
    return;
  }
  throw Error("Unknown report format.");
}
