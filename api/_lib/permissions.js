// What each login may use. Staff (STAFF_ACCOUNTS) may use everything.
// Employees may use only the sections the owner ticked for them on the
// Team page, saved in the Employees tab's "Access" column as a
// comma-separated list, e.g. "event,orders,manage".
//
//   event      Event Sales: ring up sales, charge cards for them
//   orders     Order form: take orders, see recent orders and their invoices
//   search     Search orders & invoices: every order and card payment
//   pay        Pay with Card: charge cards, see recent card payments
//   catering   Catering Calculator: quotes, and its share link
//   broadcast  Text customers: send texts to every subscriber
//   shopping   Shopping lists: lists given to them (or to anyone), check
//              items off, add receipt photos, finish the trip
//   prices     With shopping: see the expected prices on lists and what
//              past trips cost
//   manage     Can edit & delete, in the sections above (in Shopping:
//              make, change and delete lists, and see every list)
//
// Never for employees, whatever is ticked: the Team page and the
// spreadsheet link (they stay behind requireStaff).

export const SECTIONS = ["event", "orders", "search", "pay", "catering", "broadcast", "shopping"];
export const PRICES = "prices";
export const MANAGE = "manage";
export const ALL_ACCESS = [...SECTIONS, PRICES, MANAGE];

// An empty cell (or a sheet without the column) means Event Sales only,
// which is what every employee had before permissions existed. "none" is
// how an employee with every box unticked is saved.
export function parseAccess(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return ["event"];
  if (value === "none") return [];
  return ALL_ACCESS.filter((key) => value.split(/[\s,]+/).includes(key));
}

export function formatAccess(list) {
  const keys = ALL_ACCESS.filter((key) => (list || []).includes(key));
  return keys.length ? keys.join(",") : "none";
}

// info: { role, access } from readSessionInfo.
export const can = (info, key) => info?.role === "staff" || Boolean(info?.access?.includes(key));
export const canAny = (info, keys) => keys.some((key) => can(info, key));
