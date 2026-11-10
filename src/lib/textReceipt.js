import { formatMoney, toNumber } from "./format.js";

// The text a customer gets from "Text receipt": sent from the employee's
// own phone (copy + open Messages), not through Twilio.

// "1x Coffee ($2.50)" sheet lines → "1x Coffee — $2.50".
function itemLines(items) {
  return String(items || "")
    .split("\n")
    .map((l) => l.trim().replace(/\s*\((-?\$[\d,.]+)\)$/, " — $1"))
    .filter(Boolean);
}

// sale: an EventSales row (Date, Time, SaleId, Items, Total, Fee, Method,
// Card, Note). invoiceUrl: the customer's invoice link (same page as the
// Invoice section's share link). receiptUrl: the Stripe receipt link, for
// card sales.
export function receiptMessage({ brandName, sale, invoiceUrl, receiptUrl }) {
  const total = toNumber(sale.Total || sale.Amount) || 0;
  const fee = toNumber(sale.Fee) || 0;
  const method = sale.Method === "Card" && sale.Card ? `card (${sale.Card})` : String(sale.Method || "").toLowerCase();
  const lines = [
    `${brandName} — Receipt`,
    [sale.SaleId ? `Order ${sale.SaleId}` : "", [sale.Date, sale.Time].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
    "",
    ...itemLines(sale.Items),
    fee > 0 ? `Card fee — ${formatMoney(fee)}` : null,
    "",
    `Total paid: ${formatMoney(total)}${method ? ` by ${method}` : ""}`,
    "",
    invoiceUrl ? `Invoice: ${invoiceUrl}` : null,
    receiptUrl ? `Card receipt: ${receiptUrl}` : null,
    "",
    "Thank you! ¡Gracias!",
  ].filter((l) => l !== null);
  // One blank line between sections, never two (e.g. a sale with no items).
  return lines
    .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
    .join("\n")
    .trim();
}

// 10-digit US numbers get +1; anything else is passed through as digits.
export function smsNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

// Opens the phone's Messages app with the number and text filled in.
// "?&body=" is the form both iPhone and Android read.
export function smsHref(phone, body) {
  return `sms:${smsNumber(phone)}?&body=${encodeURIComponent(body)}`;
}
