/**
 * Parses a WhatsApp order message into structured order lines.
 *
 * Expected shape (based on real examples from the canteen team):
 *
 *   Greenfields
 *   Pizza inn
 *   Am 4
 *   Pm 4
 *   Innbucks
 *   Am 1
 *   Prokleen
 *   Am 2
 *   Pm 1
 *
 * -> location "Greenfields", then repeating (brand, then one or more
 *    "Am N" / "Pm N" lines). Also tolerates:
 *   - brand and qty on the same line ("Grave 13", single session implied)
 *   - "AM: 4", "am-4", "A.M 4", extra punctuation/whitespace
 *   - a bare number following a brand with no session label
 *   - blank lines anywhere
 */

const BRAND_NORMALIZE = {
  "chicken inn": "CHIX",
  "chickeninn": "CHIX",
  "chix": "CHIX",
  "creamy inn": "CREAMY",
  "creamy": "CREAMY",
  "pizza inn": "PIZZA",
  "pizza": "PIZZA",
  "dad": "DAD",
  "pro": "PRO",
  "prokleen": "PRO",
  "steers": "STEERS",
  "grave": "GRAVE",
  "innbucks": "INNBUCKS",
  "pastino": "PASTINO",
  "haefilis": "HAEFILIS",
  "chix+pro": "CHIX+PRO",
  "chicken inn+pro": "CHIX+PRO",
  "steers+pro": "STEERS+PRO",
  "progr": "PROGROUNDS",
};

function normalizeBrand(raw) {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return BRAND_NORMALIZE[key] || raw.trim().toUpperCase();
}

// Matches a line that is (only) a session + quantity, e.g.
// "Am 4", "AM: 4", "pm-7", "a.m 12", "AM4"
const SESSION_LINE_RE = /^\s*(a\.?m\.?|p\.?m\.?)\s*[:\-]?\s*(\d+)\s*$/i;

// Matches a line that ends in a brand name followed by a session+qty,
// e.g. "Pizza inn am 4" all on one line.
const INLINE_SESSION_RE = /^(.*?)\s+(a\.?m\.?|p\.?m\.?)\s*[:\-]?\s*(\d+)\s*$/i;

// A bare trailing number with no session label, e.g. "Grave 13"
const TRAILING_QTY_RE = /^(.*?)\s+(\d+)\s*$/;

// A lone number on its own line (session-less quantity, continuing the
// current brand - e.g. "Grave" then "13" on the next line)
const BARE_NUMBER_RE = /^\s*(\d+)\s*$/;

function normalizeSession(token) {
  const t = token.toLowerCase().replace(/\./g, "");
  if (t.startsWith("a")) return "AM";
  if (t.startsWith("p")) return "PM";
  return null;
}

/**
 * @param {string} rawText - the raw WhatsApp message body
 * @returns {{location: string|null, lines: Array<{brand:string, session:string|null, qty:number}>, warnings: string[]}}
 */
function parseOrderMessage(rawText) {
  const warnings = [];
  const rawLines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    return { location: null, lines: [], warnings: ["empty message"] };
  }

  const location = rawLines[0];
  const lines = [];
  let currentBrand = null;

  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Pure session+qty line, e.g. "Am 4"
    let m = line.match(SESSION_LINE_RE);
    if (m) {
      if (!currentBrand) {
        warnings.push(`session line "${line}" with no preceding brand - skipped`);
        continue;
      }
      lines.push({
        brand: currentBrand,
        session: normalizeSession(m[1]),
        qty: parseInt(m[2], 10),
      });
      continue;
    }

    // Bare number, no session - attaches to current brand with no session
    m = line.match(BARE_NUMBER_RE);
    if (m) {
      if (!currentBrand) {
        warnings.push(`bare quantity "${line}" with no preceding brand - skipped`);
        continue;
      }
      lines.push({
        brand: currentBrand,
        session: null,
        qty: parseInt(m[1], 10),
      });
      continue;
    }

    // Brand + inline session + qty, e.g. "Pizza inn am 4"
    m = line.match(INLINE_SESSION_RE);
    if (m && m[1].trim().length > 0) {
      currentBrand = normalizeBrand(m[1]);
      lines.push({
        brand: currentBrand,
        session: normalizeSession(m[2]),
        qty: parseInt(m[3], 10),
      });
      continue;
    }

    // Brand + trailing qty, no session, e.g. "Grave 13"
    m = line.match(TRAILING_QTY_RE);
    if (m && m[1].trim().length > 0) {
      currentBrand = normalizeBrand(m[1]);
      lines.push({
        brand: currentBrand,
        session: null,
        qty: parseInt(m[2], 10),
      });
      continue;
    }

    // Otherwise: a plain brand name line, e.g. "Prokleen"
    currentBrand = normalizeBrand(line);
  }

  return { location, lines, warnings };
}

module.exports = { parseOrderMessage, normalizeBrand };
