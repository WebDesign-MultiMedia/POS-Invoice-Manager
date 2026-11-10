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

// An event sale shown as an invoice for the customer's link (the sale is
// not an order, so nothing is added to the orders tab). Returns the same
// { invoice, cardPayments } shape the Invoice page reads:
//  - Card: the base Amount as the cost and the charge as a card payment line
//    (fee included), so the balance comes out to $0.00;
//  - Cash / Zelle: the total, with a deposit of the full amount;
//  - Unpaid: the total, nothing paid yet.
export function saleToInvoice(sale) {
  const unpaid = String(sale.Status || "").toLowerCase() === "unpaid";
  const isCard = !unpaid && sale.Method === "Card";
  const total = toNumber(sale.Total || sale.Amount) || 0;
  const amount = isCard ? toNumber(sale.Amount) || total : total;
  const invoice = {
    Id: sale.SaleId,
    Date: sale.Date || "",
    Time: sale.Time || "",
    Name: String(sale.Name || "").trim(),
    Contact: "",
    Address: "",
    PickupDelivery: "Event",
    Items: String(sale.Items || "").trim(),
    Cost: amount.toFixed(2),
    Deposit: !unpaid && !isCard ? total.toFixed(2) : "",
    Payment: unpaid ? "" : sale.Method || "",
    DueDate: "",
    Notes: [unpaid ? "Not paid yet." : `Paid in full by ${isCard && sale.Card ? `card (${sale.Card})` : String(sale.Method || "").toLowerCase()}.`, String(sale.Note || "").trim()]
      .filter(Boolean)
      .join(" "),
  };
  const cardPayments = isCard
    ? [{ InvoiceId: sale.SaleId, Date: sale.Date, Time: sale.Time, Amount: sale.Amount, Fee: sale.Fee, Total: sale.Total, Card: sale.Card, Funding: sale.Funding }]
    : [];
  return { invoice, cardPayments };
}
