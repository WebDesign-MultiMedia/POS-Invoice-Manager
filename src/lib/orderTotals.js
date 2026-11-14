// Totals for the Search page's Catering / Delivery / Pick-ups cards.
import { parseStoredDate, toDateInput, toNumber } from "./format.js";
import { isCatering, isSetupCatering } from "./orderOptions.js";

export const TYPE_GROUPS = [
  { key: "catering", label: "Catering", icon: "fa-utensils" },
  { key: "delivery", label: "Delivery", icon: "fa-truck-fast" },
  { key: "pickup", label: "Pick-ups", icon: "fa-bag-shopping" },
];

// Which card an order's type counts toward, or null (Event, blank, …).
// Catering is checked first: "Catering - Setup & pickup later" is catering.
export function orderTypeGroup(type) {
  const t = String(type || "").trim();
  if (isCatering(t)) return "catering";
  if (/deliver/i.test(t)) return "delivery";
  if (/pick/i.test(t)) return "pickup";
  return null;
}

// The years orders were taken in, newest first.
export function orderYears(orders) {
  const years = new Set();
  for (const o of orders) {
    const d = parseStoredDate(o.Date);
    if (d?.year) years.add(d.year);
  }
  return [...years].sort((a, b) => b - a);
}

const money = (n) => Math.round(n * 100) / 100;

// What a Pending order still owes: its cost minus any deposit.
function owed(order) {
  const cost = toNumber(order.Cost);
  if (isNaN(cost)) return 0;
  const deposit = toNumber(order.Deposit);
  return Math.max(0, cost - (isNaN(deposit) ? 0 : deposit));
}

// One card's numbers per type group, for every year or one year.
// today is "YYYY-MM-DD"; orders due on or after it count as coming up.
export function typeTotals(orders, { year = null, today } = {}) {
  const out = {};
  for (const g of TYPE_GROUPS) {
    out[g.key] = { count: 0, total: 0, average: 0, pendingCount: 0, pendingOwed: 0, setupCount: 0, upcoming: [], topCustomer: null, orders: [] };
  }
  const customers = {};
  for (const order of orders) {
    const key = orderTypeGroup(order.PickupDelivery);
    if (!key) continue;
    if (year && parseStoredDate(order.Date)?.year !== year) continue;
    const t = out[key];
    t.count += 1;
    t.orders.push(order);
    const cost = toNumber(order.Cost);
    if (!isNaN(cost)) t.total += cost;
    if (/^pending$/i.test(String(order.Payment || "").trim())) {
      t.pendingCount += 1;
      t.pendingOwed += owed(order);
    }
    if (isSetupCatering(order.PickupDelivery)) t.setupCount += 1;
    const due = toDateInput(order.DueDate);
    if (due && today && due >= today) t.upcoming.push({ order, due });
    const who = String(order.Name || "").trim();
    if (who) {
      const byName = (customers[key] ||= {});
      const id = who.toLowerCase();
      byName[id] = { name: byName[id]?.name || who, count: (byName[id]?.count || 0) + 1 };
    }
  }
  for (const g of TYPE_GROUPS) {
    const t = out[g.key];
    t.total = money(t.total);
    t.pendingOwed = money(t.pendingOwed);
    t.average = t.count ? money(t.total / t.count) : 0;
    t.upcoming.sort((a, b) => a.due.localeCompare(b.due));
    // A top customer only means something once someone ordered twice.
    const top = Object.values(customers[g.key] || {}).sort((a, b) => b.count - a.count)[0];
    t.topCustomer = top && top.count > 1 ? top : null;
  }
  return out;
}
