// The order form's choices. Older orders may hold other values (e.g. plain
// "Catering"); the form keeps those when editing.

export const ORDER_TYPES = ["Delivery", "Pick-up", "Catering - Drop-off", "Catering - Setup & pickup later"];

// "Pending": nothing paid yet; staff change it once the customer pays.
export const PAYMENT_OPTIONS = ["Cash", "Zelle", "Card", "Pending"];

// Whether an order is for a holiday. "Regular" is an everyday order; the
// rest are in calendar order. Orders saved before this choice existed have
// no Holiday and count as Regular.
export const REGULAR_ORDER = "Regular";
export const HOLIDAY_OPTIONS = [
  REGULAR_ORDER,
  "New Year's Day",
  "Día de Reyes",
  "Valentine's Day",
  "Super Bowl",
  "Easter",
  "Cinco de Mayo",
  "Mother's Day",
  "Memorial Day",
  "Father's Day",
  "4th of July",
  "Labor Day",
  "Mexican Independence Day",
  "Halloween",
  "Día de los Muertos",
  "Thanksgiving",
  "Virgen de Guadalupe",
  "Christmas Eve",
  "Christmas",
  "New Year's Eve",
  "Other holiday",
];

// The order's holiday, or "" for a regular (or older) order.
export function orderHoliday(order) {
  const h = String(order?.Holiday ?? "").trim();
  return h && h !== REGULAR_ORDER ? h : "";
}

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
