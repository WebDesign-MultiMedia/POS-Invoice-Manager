// All sheet reads/writes go through the app's own /api/sheets function
// (api/sheets.js), which holds the SheetDB id and credentials server-side.
// The browser never sees the SheetDB URL. Everything except
// getSharedInvoice needs a staff login (the session cookie).
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { isDemo, demoApi } from "../lib/demo.js";
import { apiErrorFrom } from "../lib/errors.js";

// In demo mode every call below is answered from the browser's sample data
// (src/lib/demo.js) and never reaches the server.

const SHEETS_API = "/api/sheets";

// Failures throw an ApiError (lib/errors.js) carrying the HTTP status, so
// pages can turn them into a friendly message with friendlyMessage().
async function readSheet(action, params = {}) {
  const query = new URLSearchParams({ action, ...params });
  const res = await fetch(`${SHEETS_API}?${query}`);
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}

function writeSheet(action, data) {
  return postSheet({ action, data });
}

async function postSheet(body) {
  const res = await fetch(SHEETS_API, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}

export function submitOrder(data) {
  if (isDemo()) return demoApi.createOrder(data);
  return writeSheet("createOrder", data);
}

// Change a saved order's fields (not its Id, Date or Time). A 404 means
// no order with that Id exists any more.
export function updateOrder(id, data) {
  if (isDemo()) return demoApi.updateOrder(id, data);
  return postSheet({ action: "updateOrder", id: String(id), data });
}

export function deleteOrder(id) {
  if (isDemo()) return demoApi.deleteOrder(id);
  return postSheet({ action: "deleteOrder", id: String(id) });
}

export function fetchAllOrders() {
  if (isDemo()) return demoApi.orders();
  return readSheet("orders");
}

export async function getInvoiceById(invoiceId) {
  const rows = isDemo() ? await demoApi.order(invoiceId) : await readSheet("order", { id: invoiceId });
  return rows && rows.length ? rows[0] : null;
}

// Logs every completed card charge to the "CardPayments" tab of the same
// Google Sheet. Fire-and-log: callers swallow the error so a sheet hiccup
// never blocks showing the customer their already-successful receipt.
export function recordCardPayment(data) {
  if (isDemo()) return demoApi.recordCardPayment(data);
  return writeSheet("recordCardPayment", data);
}

// Card payments logged against an order (InvoiceId = the order's Id), so
// the invoice can show them and the balance due accounts for them.
export async function getCardPaymentsForInvoice(invoiceId) {
  const rows = isDemo() ? await demoApi.cardPaymentsFor(invoiceId) : await readSheet("cardPaymentsFor", { invoiceId });
  return Array.isArray(rows) ? rows : [];
}

export function fetchAllCardPayments() {
  if (isDemo()) return demoApi.cardPayments();
  return readSheet("cardPayments");
}

// Event Sales: one row per sale in the "EventSales" tab (Card, Cash or Zelle).
export function recordEventSale(data) {
  if (isDemo()) return demoApi.recordEventSale(data);
  return writeSheet("recordEventSale", data);
}

export async function fetchAllEventSales() {
  const rows = isDemo() ? await demoApi.eventSales() : await readSheet("eventSales");
  return Array.isArray(rows) ? rows : [];
}

// Staff: the signed token that goes in a customer's read-only invoice link.
export async function getShareToken(invoiceId) {
  if (isDemo()) return "demo";
  const { token } = await readSheet("shareToken", { id: invoiceId });
  return token;
}

// Public: a customer's shared invoice. Returns { invoice, cardPayments },
// or null if the link's token doesn't match.
export async function getSharedInvoice(invoiceId, token) {
  if (isDemo()) {
    const [invoice] = await demoApi.order(invoiceId);
    return invoice ? { invoice, cardPayments: await demoApi.cardPaymentsFor(invoiceId) } : null;
  }
  const query = new URLSearchParams({ action: "sharedInvoice", id: invoiceId, token: token || "" });
  const res = await fetch(`${SHEETS_API}?${query}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await apiErrorFrom(res);
  return res.json();
}
