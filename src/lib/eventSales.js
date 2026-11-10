import { ApiError } from "./errors.js";

// Event Sales: quick checkout at a vendor event. Each sale is one row in the
// "EventSales" sheet tab, paid by Card, Cash or Zelle.

export const METHODS = ["Card", "Cash", "Zelle"];

// Event sales have no order row, so they get their own id, like the CP-
// walk-up card ids. Format: EV-YYMMDD-HHMMSS.
export function newEventSaleId(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `EV-${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const cents = (dollars) => Math.round((Number(dollars) || 0) * 100);

// Change to hand back, or null when the cash given doesn't cover the total.
export function cashChange(total, received) {
  const diff = cents(received) - cents(total);
  return diff < 0 ? null : diff / 100;
}

// One-tap amounts for "cash received": exact, then the next bills up.
export function quickCashOptions(total) {
  const t = cents(total);
  if (t <= 0) return [];
  const options = [t];
  for (const step of [500, 1000, 2000]) {
    const up = Math.ceil(t / step) * step;
    if (up > t) options.push(up);
  }
  for (const bill of [2000, 5000, 10000]) if (bill > t) options.push(bill);
  return [...new Set(options)].sort((a, b) => a - b).slice(0, 5).map((c) => c / 100);
}

// "Pay later" sales are saved with Status "Unpaid" until someone takes
// payment. Rows from before Status existed are paid.
export const isUnpaid = (sale) => String(sale?.Status ?? "").trim() === "Unpaid";

// Totals for one day's sales: count, everything collected, and per method.
// Unpaid sales aren't money collected yet, so they're only in `unpaid`.
// Card totals include card fees, since that's what was collected.
export function summarizeSales(allSales) {
  const unpaidRows = allSales.filter(isUnpaid);
  const sales = allSales.filter((s) => !isUnpaid(s));
  const unpaid = { count: unpaidRows.length, total: unpaidRows.reduce((t, s) => t + cents(s.Total || s.Amount), 0) / 100 };
  const byMethod = Object.fromEntries(METHODS.map((m) => [m, { count: 0, total: 0 }]));
  let total = 0;
  for (const s of sales) {
    const c = cents(s.Total || s.Amount);
    total += c;
    const m = byMethod[s.Method];
    if (m) {
      m.count += 1;
      m.total += c;
    }
  }
  for (const m of Object.values(byMethod)) m.total /= 100;
  // Who rang up what, biggest total first. Sales from before SoldBy existed
  // are grouped as "Not recorded".
  const people = {};
  for (const s of sales) {
    const who = String(s.SoldBy || "").trim() || "Not recorded";
    const p = (people[who] ||= { name: who, count: 0, total: 0 });
    p.count += 1;
    p.total += cents(s.Total || s.Amount);
  }
  const bySeller = Object.values(people)
    .map((p) => ({ ...p, total: p.total / 100 }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { count: sales.length, total: total / 100, byMethod, bySeller, unpaid };
}

// What editing a sale sends to the sheet. Name, Items and Note always;
// a Cash or Zelle sale also its method and total (Amount = Total), with the
// change worked out again from the cash received. A card sale's amounts
// never change: the card was already charged.
export function saleEdit(sale, values) {
  const text = (k) => String(values[k] ?? "").trim();
  const fields = { Name: text("Name"), Items: text("Items"), Note: text("Note") };
  if (sale.Method === "Card") return fields;
  const total = Math.round((Number(String(values.Total ?? "").replace(/[$,\s]/g, "")) || 0) * 100) / 100;
  if (!(total > 0)) throw new ApiError(400, "Enter a total above $0.00.");
  const method = values.Method === "Zelle" ? "Zelle" : "Cash";
  const change = method === "Cash" && sale.CashReceived ? cashChange(total, sale.CashReceived) : null;
  return {
    ...fields,
    Method: method,
    Amount: total.toFixed(2),
    Total: total.toFixed(2),
    CashReceived: change == null ? "" : (Number(sale.CashReceived) || 0).toFixed(2),
    Change: change == null ? "" : change.toFixed(2),
  };
}
