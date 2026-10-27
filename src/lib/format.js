// DATE FORMAT MM/DD/YYYY
export function formatDate(inputDate) {
  if (!inputDate) return "";
  const [year, month, day] = inputDate.split("-");
  return `${month}/${day}/${year}`;
}

// TIME FORMAT 12-HOUR
export function time12Hour(timeStr) {
  if (!timeStr) return "";
  let [hour, minute] = timeStr.split(":");
  hour = parseInt(hour, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${ampm}`;
}

// The order form no longer asks staff to type the date/time — it's stamped
// automatically at submit time, in the same MM/DD/YYYY + 12-hour formats
// formatDate()/time12Hour() already produce from manual input.
export function getCurrentDateTime() {
  const now = new Date();
  const date = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const time = time12Hour(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`);
  return { date, time };
}

export function toNumber(v) {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  return Number(cleaned);
}

// "Visa •••• 4242" from Stripe's brand id + last4. Blank when unknown
// (e.g. rows logged before the Card column existed).
const CARD_BRAND_NAMES = { amex: "Amex", diners: "Diners", discover: "Discover", jcb: "JCB", mastercard: "Mastercard", unionpay: "UnionPay", visa: "Visa" };
export function formatCardLabel(brand, last4) {
  if (!last4) return "";
  const name = CARD_BRAND_NAMES[brand] || (brand ? brand[0].toUpperCase() + brand.slice(1) : "Card");
  return `${name} •••• ${last4}`;
}

export function formatMoney(v) {
  const n = toNumber(v);
  if (isNaN(n)) return "";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// row.Date is stored as MM/DD/YYYY; returns { month, year } as numbers, or null if unparsable
export function parseStoredDate(dateStr) {
  if (!dateStr) return null;
  const [month, , year] = String(dateStr).split("/");
  if (!month || !year) return null;
  return { month: Number(month), year: Number(year) };
}

export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The Items textarea is free text, so different orders delimit items
// differently: some are one comma-separated line ("1/2 lbs Chivo, 1 char
// Chivo"), others are one per line (sometimes with a trailing comma left
// over from a comma-separated habit, and/or a leading bullet like
// "•Carnitas"). Split on newlines when present (a line may legitimately
// contain its own commas), otherwise fall back to commas, then strip any
// leading bullet/dash marker and trailing comma so they aren't duplicated.
// A leading "Nx" (e.g. "2x Ensalada de frutas") is a quantity multiplier,
// not part of the item name, so it's parsed out into `qty` and stripped
// from `text`; items without a prefix default to qty 1.
export function splitItems(itemsStr) {
  if (!itemsStr) return [];
  const str = String(itemsStr);
  const parts = str.includes("\n") ? str.split("\n") : str.split(",");
  return parts
    .map((item) => item.trim().replace(/^[•\-*]+\s*/, "").replace(/,\s*$/, ""))
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(\d+)\s*[xX]\s*(.+)$/);
      return match ? { qty: Number(match[1]), text: match[2].trim() } : { qty: 1, text: item };
    });
}

// The order form no longer asks staff to type an aggregate Quantity — it's
// derived from the Items list itself (summing each line's parsed qty, so a
// "2x Ensalada de frutas" line counts as 2) at submit time.
export function getTotalQuantity(itemsStr) {
  const items = splitItems(itemsStr);
  const total = items.reduce((sum, item) => sum + item.qty, 0);
  return total || 1;
}
