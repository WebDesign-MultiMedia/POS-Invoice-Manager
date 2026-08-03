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
