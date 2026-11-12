// The sections an employee can be given on the Team page, in the order
// they're listed there. Must match api/_lib/permissions.js; the server
// enforces them, the app only hides what a login can't use.

export const SECTION_INFO = [
  { key: "event", label: "Event Sales", icon: "fa-store", route: "/event", note: "Ring up sales at events" },
  { key: "orders", label: "Order form", icon: "fa-house", route: "/", note: "Take orders, see recent orders and their invoices" },
  { key: "search", label: "Search orders & invoices", icon: "fa-magnifying-glass", route: "/search", note: "Every customer's orders, phone and address", risk: true },
  { key: "pay", label: "Pay with Card", icon: "fa-credit-card", route: "/pay", note: "Charge cards, see recent card payments" },
  { key: "catering", label: "Catering Calculator", icon: "fa-calculator", route: "/catering", note: "Make and save catering quotes" },
  { key: "broadcast", label: "Text customers", icon: "fa-bullhorn", route: "/broadcast", note: "Send a text to every subscriber (costs money)", risk: true },
  { key: "shopping", label: "Shopping lists", icon: "fa-cart-shopping", route: "/shopping", note: "Lists given to them: check items off, scan receipts" },
];
// Extra boxes under the sections. "prices" only matters with Shopping.
export const PRICES_INFO = { key: "prices", label: "See shopping prices", icon: "fa-tags", note: "With Shopping lists: expected prices, and what past trips cost" };
export const MANAGE_INFO = { key: "manage", label: "Can edit & delete", icon: "fa-pen-to-square", note: "In the sections above: change or remove orders, sales and payments; make and delete shopping lists" };
export const ALL_ACCESS = [...SECTION_INFO.map((s) => s.key), PRICES_INFO.key, MANAGE_INFO.key];

// Which access keys open each page ("staff" = the owner's login only).
const ROUTE_ACCESS = {
  "/": ["orders"],
  "/search": ["search"],
  "/invoice": ["orders", "search"],
  "/pay": ["pay"],
  "/event": ["event"],
  "/catering": ["catering"],
  "/broadcast": ["broadcast"],
  "/shopping": ["shopping"],
  "/employees": ["staff"],
  "/updates": null, // anyone logged in
};

export function canOpen(can, pathname) {
  const keys = ROUTE_ACCESS[pathname];
  if (keys === null) return true;
  if (!keys) return false;
  return keys.some((k) => can(k));
}

// Where to send an employee who opens a page they can't use.
export function homeFor(can) {
  return SECTION_INFO.find((s) => can(s.key))?.route || null;
}
