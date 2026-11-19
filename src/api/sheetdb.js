// All sheet reads/writes go through the app's own /api/sheets function
// (api/sheets.js), which holds the SheetDB id and credentials server-side.
// The browser never sees the SheetDB URL. Everything except
// getSharedInvoice needs a staff login (the session cookie).
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { isDemo, demoApi } from "../lib/demo.js";
import { apiErrorFrom } from "../lib/errors.js";
import { saleToInvoice } from "../lib/saleToOrder.js";

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

// Pages that open together (e.g. Search's totals and its lookup) ask for
// the same full list. Each SheetDB call counts toward the plan's monthly
// limit, so a list is fetched once and shared for a few seconds; any save
// drops every copy so the next read is fresh.
const SHARE_MS = 15000;
const shared = {};
function sharedRead(key, load) {
  const hit = shared[key];
  if (!hit || Date.now() - hit.at > SHARE_MS) {
    const promise = load().catch((err) => {
      if (shared[key]?.promise === promise) delete shared[key];
      throw err;
    });
    shared[key] = { at: Date.now(), promise };
  }
  // A new array each time, so one page sorting it can't reorder another's.
  return shared[key].promise.then((rows) => (Array.isArray(rows) ? [...rows] : rows));
}
const forgetShared = () => Object.keys(shared).forEach((k) => delete shared[k]);

function writeSheet(action, data) {
  return postSheet({ action, data });
}

async function postSheet(body) {
  forgetShared();
  try {
    return await sendPost(body);
  } finally {
    forgetShared();
  }
}

async function sendPost(body) {
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

// Deleting an order only hides it (the sheet's "Deleted" column says when
// and by whom), so it can be restored with its same number.
export function deleteOrder(id) {
  if (isDemo()) return demoApi.deleteOrder(id);
  return postSheet({ action: "deleteOrder", id: String(id) });
}

export function restoreOrder(id) {
  if (isDemo()) return demoApi.restoreOrder(id);
  return postSheet({ action: "restoreOrder", id: String(id) });
}

// Deleted orders, for the form's "Recently deleted" list. Read only when
// that list is opened.
export function fetchDeletedOrders() {
  if (isDemo()) return demoApi.deletedOrders();
  return readSheet("orders", { deleted: "1" });
}

export function fetchAllOrders() {
  if (isDemo()) return demoApi.orders();
  return sharedRead("orders", () => readSheet("orders"));
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
  return sharedRead("cardPayments", () => readSheet("cardPayments"));
}

// A logged card payment, found by its PaymentIntentId. Only who and what it
// was for can change (Name, Email, Phone, Items, Note, InvoiceId); the
// charged amounts can't. Deleting removes the sheet row only. It does NOT
// refund the card; refunds are done in Stripe.
export function updateCardPayment(paymentIntentId, data) {
  if (isDemo()) return demoApi.updateCardPayment(paymentIntentId, data);
  return postSheet({ action: "updateCardPayment", id: String(paymentIntentId), data });
}

export function deleteCardPayment(paymentIntentId) {
  if (isDemo()) return demoApi.deleteCardPayment(paymentIntentId);
  return postSheet({ action: "deleteCardPayment", id: String(paymentIntentId) });
}

// An event sale, found by its SaleId. Cash and Zelle sales can change their
// amount and method; card sales keep theirs.
export function updateEventSale(saleId, data) {
  if (isDemo()) return demoApi.updateEventSale(saleId, data);
  return postSheet({ action: "updateEventSale", id: String(saleId), data });
}

// "Pay later": take payment on a sale saved as Unpaid. data: { Method,
// CashReceived, Change } for cash, { Method } for Zelle, or { Method,
// Fee, Total, Card, Funding, PaymentIntentId } for card. The server sets
// Status "Paid", PaidAt and PaidBy, and answers { fields } it saved.
export function payEventSale(saleId, data) {
  if (isDemo()) return demoApi.payEventSale(saleId, data);
  return postSheet({ action: "payEventSale", id: String(saleId), data });
}

// "Edit" on an Unpaid sale: data { Name, Items, Note, Total }. Needs only
// Event Sales; employees only their own. Answers { fields } it saved.
export function editUnpaidSale(saleId, data) {
  if (isDemo()) return demoApi.editUnpaidSale(saleId, data);
  return postSheet({ action: "editUnpaidSale", id: String(saleId), data });
}

export function deleteEventSale(saleId) {
  if (isDemo()) return demoApi.deleteEventSale(saleId);
  return postSheet({ action: "deleteEventSale", id: String(saleId) });
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
    if (/^EV-/.test(String(invoiceId))) {
      const sale = (await demoApi.eventSales()).find((r) => r.SaleId === String(invoiceId));
      return sale ? saleToInvoice(sale) : null;
    }
    const [invoice] = await demoApi.order(invoiceId);
    return invoice ? { invoice, cardPayments: await demoApi.cardPaymentsFor(invoiceId) } : null;
  }
  const query = new URLSearchParams({ action: "sharedInvoice", id: invoiceId, token: token || "" });
  const res = await fetch(`${SHEETS_API}?${query}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await apiErrorFrom(res);
  return res.json();
}
