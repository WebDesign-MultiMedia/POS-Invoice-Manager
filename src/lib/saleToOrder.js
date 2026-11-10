import { formatMoney, toNumber } from "./format.js";

// The order form's fields, filled in from a sale that has no order yet (a
// walk-up card payment or an event sale), for its "Make invoice" button.
// The sale is already paid, so the deposit is the full price and the
// invoice shows nothing left to pay. Order type is left for staff to pick.
//   method: "Card", "Cash" or "Zelle"
export function saleToOrderForm(row, method) {
  const price = toNumber(row.Amount || row.Total);
  const fee = toNumber(row.Fee);
  const paidBy = method === "Card" && row.Card ? `card (${row.Card})` : method.toLowerCase();
  const notes = [
    `Paid in full by ${paidBy}${row.Date ? ` on ${row.Date}` : ""}.`,
    fee > 0 ? `Card fee ${formatMoney(fee)} (total charged ${formatMoney(toNumber(row.Total))}).` : "",
    row.SaleId || row.InvoiceId ? `Sale ${row.SaleId || row.InvoiceId}.` : "",
    String(row.Note || "").trim(),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    Name: String(row.Name || "").trim(),
    Contact: String(row.Phone || "").trim(),
    Address: "",
    PickupDelivery: "",
    Cost: price.toFixed(2),
    Payment: method,
    Deposit: price.toFixed(2),
    Items: String(row.Items || "").trim(),
    DueDate: "",
    Notes: notes,
  };
}
