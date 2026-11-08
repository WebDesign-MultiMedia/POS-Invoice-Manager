import { isDemo } from "./demo.js";
import { TRAY_SIZES } from "./cateringMenu.js";

// Catering quotes: what "=" saves on the Catering Calculator. A quote holds
// the dishes and total plus client details staff fill in later, and can be
// turned into an order (and from there an invoice) on the order form.
//
// Quotes are kept in this browser's localStorage, so they're per device.
// Demo quotes use their own key so sample data never mixes with real ones.

const storageKey = () => (isDemo() ? "pim-catering-quotes-demo" : "pim-catering-quotes");

export const CLIENT_FIELDS = ["name", "phone", "address", "eventDate", "notes"];

export function loadQuotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveQuotes(quotes) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(quotes));
    return true;
  } catch {
    return false; // storage blocked (private mode): quotes last until reload
  }
}

// `lines` are the calculator's dish lines (dishLines); subtotal lines are
// left out since the quote has its own total.
export function makeQuote(lines, total, existing = []) {
  const number = existing.reduce((max, q) => Math.max(max, q.number || 0), 0) + 1;
  return {
    id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    number,
    createdAt: new Date().toISOString(),
    lines: dishOnly(lines),
    total,
    ...Object.fromEntries(CLIENT_FIELDS.map((f) => [f, ""])),
  };
}

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

// The order form's fields, filled in from a quote. Payment and Deposit are
// left for staff to fill in.
export function quoteToOrderForm(quote) {
  return {
    Name: quote.name.trim(),
    Contact: quote.phone.trim(),
    Address: quote.address.trim(),
    PickupDelivery: "Catering",
    Cost: quote.total.toFixed(2),
    Payment: "",
    Deposit: "",
    Items: quoteItemsText(quote),
    DueDate: quote.eventDate || "",
    Notes: quote.notes.trim(),
  };
}
