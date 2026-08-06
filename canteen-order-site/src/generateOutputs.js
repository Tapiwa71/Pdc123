const ExcelJS = require("exceljs");

const CARDS_PER_ROW = 5;
const ROW_HEIGHT = 90;
const COL_WIDTH = 22;
const THIN = { style: "thin" };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const YELLOW = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };

/**
 * Builds the printable dispatch-card workbook: one sheet per delivery
 * route, cards laid out 5-per-row, styled to match the canteen's existing
 * cards (bold wrapped text, thin borders, Pizza Inn cards highlighted).
 */
async function buildCardsWorkbook(day, locRoute) {
  const wb = new ExcelJS.Workbook();
  const routeCards = {}; // route -> [{text, isPizza}]

  for (const [location, order] of Object.entries(day.locations || {})) {
    const route = locRoute[location.toUpperCase()] || "UNASSIGNED";
    for (const line of order.lines) {
      const text = [
        location.toUpperCase(),
        line.brand,
        line.session || "",
        String(line.qty),
      ].join("\n");
      routeCards[route] = routeCards[route] || [];
      routeCards[route].push({ text, isPizza: line.brand === "PIZZA" });
    }
  }

  for (const [route, cards] of Object.entries(routeCards)) {
    const ws = wb.addWorksheet(route.slice(0, 31));
    for (let c = 1; c <= CARDS_PER_ROW; c++) {
      ws.getColumn(c).width = COL_WIDTH;
    }
    cards.forEach((card, idx) => {
      const row = Math.floor(idx / CARDS_PER_ROW) + 1;
      const col = (idx % CARDS_PER_ROW) + 1;
      const cell = ws.getRow(row).getCell(col);
      cell.value = card.text;
      cell.font = { name: "Aptos", size: 11, bold: true };
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = BORDER;
      if (card.isPizza) cell.fill = YELLOW;
      ws.getRow(row).height = ROW_HEIGHT;
    });
  }

  return wb.xlsx.writeBuffer();
}

/**
 * Builds the dispatch datasheet: one row per location, one column per
 * brand+session, quantity in the cell - the flat "who's getting what"
 * reference sheet dispatch staff use alongside the cards.
 */
async function buildDatasheetWorkbook(day) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Dispatch");

  // Collect the full set of brand+session column keys present today
  const columns = new Set();
  for (const order of Object.values(day.locations || {})) {
    for (const line of order.lines) {
      columns.add(`${line.brand}|${line.session || ""}`);
    }
  }
  const sortedCols = [...columns].sort();

  const header = ["Location", "Status", ...sortedCols.map((c) => c.replace("|", " "))];
  ws.addRow(header).font = { bold: true };

  for (const [location, order] of Object.entries(day.locations || {})) {
    const qtyByCol = {};
    for (const line of order.lines) {
      qtyByCol[`${line.brand}|${line.session || ""}`] = line.qty;
    }
    const row = [
      location.toUpperCase(),
      order.status,
      ...sortedCols.map((c) => qtyByCol[c] ?? ""),
    ];
    ws.addRow(row);
  }

  ws.columns.forEach((col) => (col.width = 16));
  return wb.xlsx.writeBuffer();
}

module.exports = { buildCardsWorkbook, buildDatasheetWorkbook };
