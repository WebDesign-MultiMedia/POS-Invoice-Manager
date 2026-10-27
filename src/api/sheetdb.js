export const SHEETDB_URL = "https://sheetdb.io/api/v1/knvxv3inyom8t";

export async function submitOrder(data) {
  const res = await fetch(SHEETDB_URL, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Response status: ${res.status}`);
  }
  return res.json();
}

export async function fetchAllOrders() {
  const res = await fetch(SHEETDB_URL);
  return res.json();
}

export async function getInvoiceById(invoiceId) {
  const res = await fetch(`${SHEETDB_URL}/search?Id=${encodeURIComponent(invoiceId)}`);
  const rows = await res.json();
  return rows && rows.length ? rows[0] : null;
}

// Logs every completed card charge to the "CardPayments" tab of the same
// Google Sheet (SheetDB routes to a specific tab via ?sheet=). Fire-and-log:
// callers swallow the error so a sheet hiccup never blocks showing the
// customer their already-successful receipt.
export async function recordCardPayment(data) {
  const res = await fetch(`${SHEETDB_URL}?sheet=CardPayments`, {
    method: "POST",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Response status: ${res.status}`);
  }
  return res.json();
}

// Card payments logged against an order (InvoiceId = the order's Id), so
// the invoice can show them and the balance due accounts for them.
export async function getCardPaymentsForInvoice(invoiceId) {
  const res = await fetch(`${SHEETDB_URL}/search?InvoiceId=${encodeURIComponent(invoiceId)}&sheet=CardPayments`);
  if (!res.ok) {
    throw new Error(`Response status: ${res.status}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

export async function fetchAllCardPayments() {
  const res = await fetch(`${SHEETDB_URL}?sheet=CardPayments`);
  if (!res.ok) {
    throw new Error(`Response status: ${res.status}`);
  }
  return res.json();
}
