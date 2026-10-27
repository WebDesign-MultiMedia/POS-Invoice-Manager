// All sheet reads/writes go through the app's own /api/sheets function
// (api/sheets.js), which holds the SheetDB id and credentials server-side.
// The browser never sees the SheetDB URL.
const SHEETS_API = "/api/sheets";

async function readSheet(action, params = {}) {
  const query = new URLSearchParams({ action, ...params });
  const res = await fetch(`${SHEETS_API}?${query}`);
  if (!res.ok) {
    throw new Error(`Response status: ${res.status}`);
  }
  return res.json();
}

async function writeSheet(action, data) {
  const res = await fetch(SHEETS_API, {
    method: "POST",
    body: JSON.stringify({ action, data }),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Response status: ${res.status}`);
  }
  return res.json();
}

export function submitOrder(data) {
  return writeSheet("createOrder", data);
}

export function fetchAllOrders() {
  return readSheet("orders");
}

export async function getInvoiceById(invoiceId) {
  const rows = await readSheet("order", { id: invoiceId });
  return rows && rows.length ? rows[0] : null;
}

// Logs every completed card charge to the "CardPayments" tab of the same
// Google Sheet. Fire-and-log: callers swallow the error so a sheet hiccup
// never blocks showing the customer their already-successful receipt.
export function recordCardPayment(data) {
  return writeSheet("recordCardPayment", data);
}

// Card payments logged against an order (InvoiceId = the order's Id), so
// the invoice can show them and the balance due accounts for them.
export async function getCardPaymentsForInvoice(invoiceId) {
  const rows = await readSheet("cardPaymentsFor", { invoiceId });
  return Array.isArray(rows) ? rows : [];
}

export function fetchAllCardPayments() {
  return readSheet("cardPayments");
}
