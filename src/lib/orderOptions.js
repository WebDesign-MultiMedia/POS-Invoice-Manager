// The order form's choices. Older orders may hold other values (e.g. plain
// "Catering"); the form keeps those when editing.

export const ORDER_TYPES = ["Delivery", "Pick-up", "Catering - Drop-off", "Catering - Setup & pickup later"];

// "Pending": nothing paid yet; staff change it once the customer pays.
export const PAYMENT_OPTIONS = ["Cash", "Zelle", "Card", "Pending"];

// Any catering type, old or new.
export function isCatering(type) {
  return /^catering/i.test(String(type || "").trim());
}

// The one day an order goes by: its due date. Orders saved before the form
// dropped the order date only have Date, so fall back to that.
export function orderDay(order) {
  return String(order?.DueDate || "").trim() || String(order?.Date || "").trim();
}

// A setup order: the restaurant goes back later for its equipment.
export function isSetupCatering(type) {
  return isCatering(type) && /setup/i.test(String(type));
}
