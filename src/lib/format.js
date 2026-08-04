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

export function toNumber(v) {
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  return Number(cleaned);
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
