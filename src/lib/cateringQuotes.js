import { isDemo } from "./demo.js";
import { TRAY_SIZES } from "./cateringMenu.js";

// Catering quotes: what "=" saves on the Catering Calculator. A quote holds
// the dishes and total plus client details staff fill in later, and can be
// turned into an order (and from there an invoice) on the order form.
//
// Every quote is kept in this browser's localStorage, and (outside the demo)
// also shared through the "Quotes" tab of the order spreadsheet
// (api/quotes.js, synced by hooks/useQuotes.js), so staff see quotes from
// every device and from employees using the no-login calculator link.
// Demo quotes stay in the browser; the no-login link keeps its own list.

const storageKey = (scope = "staff") => (isDemo() ? "pim-catering-quotes-demo" : scope === "link" ? "pim-catering-quotes-link" : "pim-catering-quotes");

export const CLIENT_FIELDS = ["name", "phone", "address", "eventDate", "notes"];

export function loadQuotes(scope) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(scope)));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveQuotes(quotes, scope) {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(quotes));
    return true;
  } catch {
    return false; // storage blocked (private mode): quotes last until reload
  }
}

// `lines` are the calculator's dish lines (dishLines); subtotal lines are
// left out since the quote has its own total.
export function makeQuote(lines, total, now = new Date()) {
  return {
    id: newQuoteId(),
    code: quoteCode(now),
    createdAt: now.toISOString(),
    lines: dishOnly(lines),
    total,
    ...Object.fromEntries(CLIENT_FIELDS.map((f) => [f, ""])),
  };
}

// Random and unguessable: the id is the only key for updating a quote's
// row, including from the no-login link.
function newQuoteId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `q${Array.from(bytes, (b) => (b % 36).toString(36)).join("")}`;
}

// A short label that's the same on every device: month-day-hour-minute,
// e.g. "1108-1453" for Nov 8, 2:53 PM.
export function quoteCode(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

// Quotes saved before codes existed have a per-device number instead.
export const quoteLabel = (quote) => (quote.code ? `Quote ${quote.code}` : `Quote #${quote.number}`);

export function updateQuoteDishes(quote, lines, total) {
  return { ...quote, lines: dishOnly(lines), total, updatedAt: new Date().toISOString() };
}

function dishOnly(lines) {
  return lines.filter((l) => l.kind === "dish").map(({ op, qty, id, name, size, amount }) => ({ op, qty, id, name, size, amount }));
}

const SIZE_LABEL = Object.fromEntries(TRAY_SIZES.map((s) => [s.id, s.label]));

// Items for the order form, one per line in the invoice's "Nx Item" format,
// with the same dish and size combined: "2x Carnitas (Whole tray)".
export function quoteItemsText(quote) {
  const merged = [];
  const byKey = {};
  for (const l of quote.lines) {
    const key = `${l.id}:${l.size}`;
    if (byKey[key]) byKey[key].qty += l.qty;
    else merged.push((byKey[key] = { ...l }));
  }
  return merged.map((l) => `${l.qty}x ${l.name} (${SIZE_LABEL[l.size] || l.size})`).join("\n");
}

// The order form's fields, filled in from a quote. Payment is left for
// staff to fill in; Deposit starts at 0, like a new order.
export function quoteToOrderForm(quote) {
  return {
    Name: quote.name.trim(),
    Contact: quote.phone.trim(),
    Address: quote.address.trim(),
    PickupDelivery: "Catering - Drop-off",
    Cost: quote.total.toFixed(2),
    Payment: "",
    Deposit: "0",
    Items: quoteItemsText(quote),
    DueDate: quote.eventDate || "",
    Notes: quote.notes.trim(),
  };
}

// ---------- spreadsheet rows (api/quotes.js) ----------

// What the browser sends to save a quote. The server validates every field
// and decides itself who made it.
export function quotePayload(quote) {
  return {
    id: quote.id,
    code: quote.code || (quote.number ? `#${quote.number}` : ""),
    createdAt: quote.createdAt,
    total: quote.total,
    lines: quote.lines,
    itemsText: quoteItemsText(quote),
    name: quote.name,
    phone: quote.phone,
    address: quote.address,
    eventDate: quote.eventDate,
    notes: quote.notes,
    sentAt: quote.sentAt || "",
  };
}

// A row of the Quotes tab back into a quote. Rows typed or edited by hand
// in the sheet are read as best they can be.
export function quoteFromRow(row) {
  let lines = [];
  try {
    const parsed = JSON.parse(row.Lines || "[]");
    if (Array.isArray(parsed)) lines = parsed;
  } catch {
    // Unreadable Lines: show the quote without its dish list.
  }
  const total = Number(String(row.Total || "0").replace(/[$,]/g, ""));
  return {
    id: row.QuoteId,
    code: row.Code || "",
    createdAt: row.CreatedAt || row.UpdatedAt || "",
    updatedAt: row.UpdatedAt || "",
    source: row.Source === "link" ? "link" : "staff",
    createdBy: row.CreatedBy || "",
    lines,
    total: Number.isFinite(total) ? total : 0,
    name: row.ClientName || "",
    phone: row.Phone || "",
    address: row.Address || "",
    eventDate: row.EventDate || "",
    notes: row.Notes || "",
    sentAt: row.SentAt || "",
    synced: true,
  };
}
