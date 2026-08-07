const express = require("express");
const path = require("path");
const fs = require("fs");
const { parseOrderMessage } = require("./parseOrder");
const { recordOrder, getDay, applyPreviousDayDefaults, setStatus } = require("./store");
const { buildCardsWorkbook, buildDatasheetWorkbook } = require("./generateOutputs");

const LOC_ROUTE = require("../loc_route.json");
const KNOWN_LOCATIONS = Object.keys(LOC_ROUTE).sort();
const KNOWN_BRANDS = [
  { value: "CHIX", label: "Chicken Inn" },
  { value: "CREAMY", label: "Creamy inn" },
  { value: "PIZZA", label: "Pizza Inn" },
  { value: "DAD", label: "DAD" },
  { value: "PRO", label: "Pro" },
  { value: "STEERS", label: "Steers" },
  { value: "GRAVE", label: "Grave" },
  { value: "INNBUCKS", label: "Innbucks" },
  { value: "HAEFILIS", label: "Haefilis" },
  { value: "PASTINO", label: "Pastino" },
  { value: "PROGROUNDS", label: "ProGrounds" },
  { value: "CAPRI", label: "Capri" },
  { value: "TRAINEES", label: "Trainees" },
  { value: "BLACKSHARK AGENTS", label: "Blackshark agents" },
];

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Wrap async route handlers so thrown errors become a 500 instead of
// crashing the process or hanging the request.
const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.get("/api/locations", (req, res) => res.json(KNOWN_LOCATIONS));
app.get("/api/brands", (req, res) => res.json(KNOWN_BRANDS));

// Submit an order as free text (same format the team already uses on WhatsApp)
app.post("/api/orders/paste", h(async (req, res) => {
  const { text, sender } = req.body;
  const parsed = parseOrderMessage(text || "");
  if (!parsed.location || parsed.lines.length === 0) {
    return res.status(400).json({ error: "Could not find a location and order lines in that text.", warnings: parsed.warnings });
  }
  const entry = await recordOrder(todayStr(), {
    location: parsed.location,
    lines: parsed.lines,
    sender: sender || "web",
    rawText: text,
    warnings: parsed.warnings,
  });
  res.json(entry);
}));

// Submit an order as structured fields from the form
app.post("/api/orders", h(async (req, res) => {
  const { location, lines, sender } = req.body;
  if (!location || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "location and at least one order line are required" });
  }
  const entry = await recordOrder(todayStr(), {
    location,
    lines,
    sender: sender || "web",
    rawText: JSON.stringify(lines),
    warnings: [],
  });
  res.json(entry);
}));

app.get("/api/orders", h(async (req, res) => {
  const date = req.query.date || todayStr();
  res.json(await getDay(date));
}));

app.get("/api/missing", h(async (req, res) => {
  const date = req.query.date || todayStr();
  const day = await getDay(date);
  const missing = KNOWN_LOCATIONS.filter((loc) => !day.locations[loc]);
  res.json({ missing });
}));

app.post("/api/apply-cutoff-defaults", h(async (req, res) => {
  const date = req.body.date || todayStr();
  const previousDate = req.body.previousDate || todayStr(-1);
  const applied = await applyPreviousDayDefaults(date, previousDate, KNOWN_LOCATIONS);
  res.json({ appliedTo: applied });
}));

app.post("/api/orders/:date/:location/confirm", h(async (req, res) => {
  const updated = await setStatus(req.params.date, decodeURIComponent(req.params.location), "confirmed");
  res.json(updated);
}));

app.get("/api/export/cards", h(async (req, res) => {
  const date = req.query.date || todayStr();
  const day = await getDay(date);
  const buffer = await buildCardsWorkbook(day, LOC_ROUTE);
  res.setHeader("Content-Disposition", `attachment; filename="dispatch_cards_${date}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
}));

app.get("/api/export/datasheet", h(async (req, res) => {
  const date = req.query.date || todayStr();
  const day = await getDay(date);
  const buffer = await buildDatasheetWorkbook(day);
  res.setHeader("Content-Disposition", `attachment; filename="dispatch_datasheet_${date}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
}));

// Simple uptime check - also useful as a "keep it awake" ping target
app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Order site running at http://localhost:${PORT}`));
}

module.exports = app;
