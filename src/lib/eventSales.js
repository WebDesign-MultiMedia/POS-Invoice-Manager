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

// Totals for one day's sales: count, everything collected, and per method.
// Card totals include card fees, since that's what was collected.
export function summarizeSales(sales) {
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
  return { count: sales.length, total: total / 100, byMethod };
}
