// Vercel serverless function: the only path between the app and SheetDB.
// The SheetDB id and Basic Auth credentials live in server env vars
// (SHEETDB_ID, SHEETDB_USER, SHEETDB_PASS) and never reach the browser.
//
// Deliberately NOT a generic proxy: the browser can't pick the SheetDB path
// or HTTP method, only one of the named actions below. The only updates and
// deletes are of one order row by its numeric Id, and an update can change
// only the order's own fields (never its Id, Date or Time).
//   GET  ?action=orders
//   GET  ?action=order&id=714
//   GET  ?action=cardPayments
//   GET  ?action=cardPaymentsFor&invoiceId=714
//   GET  ?action=eventSales
//   GET  ?action=shareToken&id=714
//   POST { action: "createOrder", data }
//   POST { action: "recordCardPayment", data }
//   POST { action: "recordEventSale", data }
//   POST { action: "updateOrder", id, data }
//   POST { action: "deleteOrder", id }
//
// Every action needs a staff login (api/_lib/auth.js) except one:
//   GET  ?action=sharedInvoice&id=714&token=…
// which serves a customer's read-only invoice link. It returns only that
// one invoice and its card payments, and only with a valid signed token.

import { isValidShareToken, requireStaff, shareTokenFor } from "./_lib/auth.js";
import { sheetdbHeaders } from "./_lib/sheetdb.js";

const READ_ACTIONS = {
  orders: () => "",
  order: (q) => `/search?Id=${encodeURIComponent(requireId(q, "id"))}`,
  cardPayments: () => "?sheet=CardPayments",
  cardPaymentsFor: (q) =>
    `/search?InvoiceId=${encodeURIComponent(requireId(q, "invoiceId"))}&sheet=CardPayments`,
  eventSales: () => "?sheet=EventSales",
};

const WRITE_ACTIONS = {
  createOrder: "",
  recordCardPayment: "?sheet=CardPayments",
  recordEventSale: "?sheet=EventSales",
};

class BadRequest extends Error {}

function requireId(params, name) {
  const value = cleanId(params.get(name));
  if (!value) throw new BadRequest(`Missing or invalid ${name}`);
  return value;
}

// SheetDB's search treats * as a wildcard, so a bare "*" id would match
// every row. Ids are digits, CP-YYMMDD-HHMMSS for walk-up card sales, or
// EV-YYMMDD-HHMMSS for event sales.
function cleanId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9-]{1,40}$/.test(id) ? id : null;
}

// Fields staff can change on a saved order. Anything else sent is ignored.
const EDITABLE_ORDER_FIELDS = [
  "Name", "Contact", "Address", "PickupDelivery", "Items", "Quantity",
  "Cost", "Deposit", "Payment", "DueDate", "Notes",
];

function orderId(value) {
  const id = String(value ?? "").trim();
  if (!/^\d{1,12}$/.test(id)) throw new BadRequest("Missing or invalid id");
  return id;
}

function editableOrderFields(data) {
  if (!data || typeof data !== "object") throw new BadRequest("Missing data");
  const fields = {};
  for (const name of EDITABLE_ORDER_FIELDS) {
    if (Object.hasOwn(data, name)) fields[name] = String(data[name] ?? "").slice(0, 5000);
  }
  if (!Object.keys(fields).length) throw new BadRequest("Nothing to update");
  return fields;
}

// Update or delete one order row. 404 when no row has that Id.
async function changeOrder(base, body, res) {
  const id = orderId(body.id);
  const path = `/Id/${encodeURIComponent(id)}`;
  const init =
    body.action === "updateOrder"
      ? { method: "PATCH", headers: sheetdbHeaders(), body: JSON.stringify({ data: editableOrderFields(body.data) }) }
      : { method: "DELETE", headers: sheetdbHeaders() };
  const response = await fetch(`${base}${path}`, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("sheets: SheetDB responded", response.status, payload);
    return res.status(502).json({ error: "Sheet request failed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const count = body.action === "updateOrder" ? payload?.updated : payload?.deleted;
  if (!Number(count)) return res.status(404).json({ error: "Order not found" });
  return res.status(200).json(payload);
}

async function sheetGet(base, path) {
  const response = await fetch(`${base}${path}`, { method: "GET", headers: sheetdbHeaders() });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("sheets: SheetDB responded", response.status, payload);
    throw new Error("Sheet request failed");
  }
  return payload;
}

// Public: one invoice for a customer's share link.
async function sharedInvoice(base, params, res) {
  const id = cleanId(params.get("id"));
  if (!id || !isValidShareToken(id, params.get("token"))) {
    return res.status(404).json({ error: "Invoice not found" });
  }
  const rows = await sheetGet(base, `/search?Id=${encodeURIComponent(id)}`);
  const invoice = Array.isArray(rows) ? rows.find((row) => String(row.Id) === id) : null;
  if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  const payments = await sheetGet(base, `/search?InvoiceId=${encodeURIComponent(id)}&sheet=CardPayments`).catch(() => []);
  // The customer sees what's on their invoice; card rows are trimmed to
  // the fields the invoice shows.
  const cardPayments = (Array.isArray(payments) ? payments : [])
    .filter((p) => String(p.InvoiceId) === id)
    .map(({ Date, Time, Amount, Fee, Total, Card, Funding }) => ({ InvoiceId: id, Date, Time, Amount, Fee, Total, Card, Funding }));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ invoice, cardPayments });
}

export default async function handler(req, res) {
  const sheetId = process.env.SHEETDB_ID;
  if (!sheetId) {
    console.error("sheets: SHEETDB_ID is not set");
    return res.status(500).json({ error: "Server is not configured" });
  }
  const base = `https://sheetdb.io/api/v1/${encodeURIComponent(sheetId)}`;

  try {
    let path;
    let init;

    const params = new URL(req.url, "http://localhost").searchParams;

    if (req.method === "GET" && params.get("action") === "sharedInvoice") {
      return await sharedInvoice(base, params, res);
    }

    if (!requireStaff(req, res)) return;

    if (req.method === "GET" && params.get("action") === "shareToken") {
      const id = cleanId(params.get("id"));
      if (!id) throw new BadRequest("Missing or invalid id");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ token: shareTokenFor(id) });
    }

    if (req.method === "GET") {
      const build = READ_ACTIONS[params.get("action")];
      if (!build) throw new BadRequest("Unknown action");
      path = build(params);
      init = { method: "GET", headers: sheetdbHeaders() };
    } else if (req.method === "POST" && ["updateOrder", "deleteOrder"].includes(req.body?.action)) {
      return await changeOrder(base, req.body, res);
    } else if (req.method === "POST") {
      const { action, data } = req.body || {};
      if (!Object.hasOwn(WRITE_ACTIONS, action)) throw new BadRequest("Unknown action");
      if (!data || typeof data !== "object") throw new BadRequest("Missing data");
      path = WRITE_ACTIONS[action];
      init = { method: "POST", headers: sheetdbHeaders(), body: JSON.stringify(data) };
    } else {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const response = await fetch(`${base}${path}`, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("sheets: SheetDB responded", response.status, payload);
      return res.status(502).json({ error: "Sheet request failed" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    console.error("sheets error:", err);
    return res.status(500).json({ error: "Sheet request failed" });
  }
}
