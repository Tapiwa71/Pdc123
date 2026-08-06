/**
 * Order store backed by MongoDB Atlas (free tier persists indefinitely,
 * unlike Render's free Postgres which expires after 30 days, or local
 * files, which are wiped every time a free Render web service restarts
 * or spins down from inactivity).
 *
 * One document per day, _id = "YYYY-MM-DD", shape unchanged from the
 * original file-based version: { date, locations: { LOCATION: {...} } }
 */
const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;

// In-memory fallback so the app is still runnable locally without setting
// up MongoDB first (handy for a quick try, or for automated tests). Data
// is lost on restart in this mode - fine for testing, not for production.
// Set MONGODB_URI to switch to real persistent storage.
let memoryStore = null;
if (!MONGODB_URI) {
  console.warn("MONGODB_URI is not set - using in-memory storage (data is lost on restart). See README for setup.");
  memoryStore = new Map();
}

let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = new MongoClient(MONGODB_URI).connect();
  }
  return clientPromise;
}

async function getCollection() {
  const client = await getClient();
  return client.db("canteen").collection("orders_by_day");
}

async function loadDay(date) {
  if (memoryStore) {
    return memoryStore.get(date) || { date, locations: {} };
  }
  const col = await getCollection();
  const doc = await col.findOne({ _id: date });
  return doc ? { date: doc._id, locations: doc.locations } : { date, locations: {} };
}

async function saveDay(day) {
  if (memoryStore) {
    memoryStore.set(day.date, day);
    return;
  }
  const col = await getCollection();
  await col.updateOne(
    { _id: day.date },
    { $set: { locations: day.locations } },
    { upsert: true }
  );
}

async function recordOrder(date, { location, lines, sender, rawText, warnings }) {
  const day = await loadDay(date);
  const key = location.trim().toUpperCase();
  const existing = day.locations[key];
  const entry = {
    location: key,
    lines,
    sender,
    rawText,
    warnings: warnings || [],
    receivedAt: new Date().toISOString(),
    status: "received",
  };
  if (existing) {
    entry.history = [...(existing.history || []), {
      lines: existing.lines, rawText: existing.rawText, receivedAt: existing.receivedAt,
    }];
  }
  day.locations[key] = entry;
  await saveDay(day);
  return entry;
}

async function getDay(date) {
  return loadDay(date);
}

async function setStatus(date, location, status) {
  const day = await loadDay(date);
  if (day.locations[location]) {
    day.locations[location].status = status;
    await saveDay(day);
  }
  return day.locations[location];
}

async function editOrder(date, location, lines) {
  const day = await loadDay(date);
  if (day.locations[location]) {
    day.locations[location].lines = lines;
    day.locations[location].status = "reviewed";
    day.locations[location].editedAt = new Date().toISOString();
    await saveDay(day);
  }
  return day.locations[location];
}

async function applyPreviousDayDefaults(date, previousDate, knownLocations) {
  const today = await loadDay(date);
  const yesterday = await loadDay(previousDate);
  const appliedTo = [];

  for (const loc of knownLocations) {
    if (!today.locations[loc]) {
      const prev = yesterday.locations[loc];
      if (prev) {
        today.locations[loc] = {
          ...prev,
          status: "carried_over",
          carriedOverFrom: previousDate,
          receivedAt: new Date().toISOString(),
        };
        appliedTo.push(loc);
      }
    }
  }
  await saveDay(today);
  return appliedTo;
}

module.exports = {
  loadDay,
  saveDay,
  recordOrder,
  getDay,
  setStatus,
  editOrder,
  applyPreviousDayDefaults,
};
