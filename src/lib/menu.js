// Quick-pick menu for the Pay with Card "Charge Amount" tab. Edit prices or
// add items here — the picker, running total and note all read from this.
// `unit: "lb"` items are sold by weight and step in half-pound increments.
export const MENU = [
  {
    category: "Tacos",
    items: [
      { id: "taco-chivo", name: "Taco de Chivo", price: 5 },
      { id: "taco-carnitas", name: "Taco de Carnitas", price: 5 },
    ],
  },
  {
    category: "Por Libra",
    items: [
      { id: "lb-chivo", name: "Chivo", price: 21, unit: "lb" },
      { id: "lb-carnitas", name: "Carnitas", price: 16, unit: "lb" },
    ],
  },
  {
    category: "Consomé",
    items: [
      { id: "consome-small", name: "Consomé Small", price: 9 },
      { id: "consome-large", name: "Consomé Large", price: 16 },
    ],
  },
  {
    category: "Glass Sodas",
    items: [
      { id: "soda-pepsi", name: "Pepsi", price: 5 },
      { id: "soda-coke", name: "Coke", price: 5 },
      { id: "soda-sprite", name: "Sprite", price: 5 },
    ],
  },
];

export const MENU_ITEMS = Object.fromEntries(MENU.flatMap((c) => c.items).map((item) => [item.id, item]));

export const qtyStep = (item) => (item.unit === "lb" ? 0.5 : 1);

// Matches the "Nx Item" convention used in invoice Items, e.g.
// "2x Taco de Chivo, 1.5 lb Carnitas".
export function formatCartLine(item, qty) {
  return item.unit === "lb" ? `${qty} lb ${item.name}` : `${qty}x ${item.name}`;
}

// CardPayments rows store the order two ways:
//  - current: an "Items" column, one "1x Taco de Chivo ($5.00)" per line,
//    and a "Note" column holding only the typed note;
//  - older rows: everything in "Note", e.g.
//      "1x Taco de Chivo ($5.00), 0.5 lb Carnitas ($8.00) — Note: extra salsa"
//      "1x Taco de Chivo, 0.5 lb Carnitas — extra salsa"   (no prices saved)
// A missing price falls back to the current menu price (null when the item
// isn't on the menu anymore).
export function parseCardPaymentOrder(row) {
  if (row.Items) return { items: parseItems(row.Items), note: (row.Note || "").trim() };

  const text = (row.Note || "").trim();
  if (!text) return { items: [], note: "" };
  const sep = text.indexOf(" — ");
  const itemsPart = sep === -1 ? text : text.slice(0, sep);
  const notePart = sep === -1 ? "" : text.slice(sep + 3).replace(/^Note:\s*/, "");

  // A free-text note with no items at all (e.g. a typed-amount charge, or a
  // current row whose note happens to start with a number like "2 extra").
  if (!/^\d+(?:\.\d+)?(x| lb) /.test(itemsPart)) return { items: [], note: text.replace(/^Note:\s*/, "") };
  return { items: parseItems(itemsPart), note: notePart };
}

// Splits on newlines, or on ", " only before a digit so a comma inside a
// price like "$1,050.00" stays intact.
function parseItems(text) {
  return text
    .split(/\n|,\s*(?=\d)/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const priced = entry.match(/^(.*?)\s*\((\$[\d,.]+)\)$/);
      if (priced) return { label: priced[1], price: Number(priced[2].replace(/[$,]/g, "")) };

      const parts = entry.match(/^(\d+(?:\.\d+)?)(x| lb) (.+)$/);
      const menuItem = parts && MENU.flatMap((c) => c.items).find((i) => i.name === parts[3] && (i.unit === "lb") === (parts[2] === " lb"));
      return { label: entry, price: menuItem ? menuItem.price * Number(parts[1]) : null };
    });
}
