// Vercel serverless function: the only path between the app and SheetDB.
// The SheetDB id and Basic Auth credentials live in server env vars
// (SHEETDB_ID, SHEETDB_USER, SHEETDB_PASS) and never reach the browser.
//
// Deliberately NOT a generic proxy: the browser can't pick the SheetDB path
// or HTTP method, only one of the named actions below. Updates and deletes
// target exactly one row by its key (an order's Id, a card payment's
// PaymentIntentId, an event sale's SaleId) and can change only the fields
// listed in ROW_TARGETS. Card charges already went through Stripe, so their
// amounts can never be changed here.
//   GET  ?action=orders
//   GET  ?action=order&id=714
//   GET  ?action=cardPayments
//   GET  ?action=cardPaymentsFor&invoiceId=714
//   GET  ?action=eventSales
//   GET  ?action=shareToken&id=714
//   POST { action: "createOrder", data }
//   POST { action: "recordCardPayment", data }
//   POST { action: "recordEventSale", data }
//   POST { action: "updateOrder" | "updateCardPayment" | "updateEventSale", id, data }
//   POST { action: "deleteOrder" | "deleteCardPayment" | "deleteEventSale", id }
//
// Employee logins (Event Sales only) may use just EMPLOYEE_ACTIONS below:
// read event sales, record one, and log the card payment of an event card
// sale. Every other action needs a staff login (api/_lib/auth.js), except:
//   GET  ?action=sharedInvoice&id=714&token=…
// which serves a customer's read-only invoice link. It returns only that
// one invoice and its card payments, and only with a valid signed token.

import { ROLES, isValidShareToken, requireEventAccess, sellerName, shareTokenFor } from "./_lib/auth.js";
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

// What an employee login may do. Card payments they log must belong to an
// event sale (InvoiceId EV-…), so they can't attach payments to orders.
function isEmployeeAllowed(req, params) {
  if (req.method === "GET") return params.get("action") === "eventSales";
  if (req.method !== "POST") return false;
  const { action, data } = req.body || {};
  if (action === "recordEventSale") return true;
  if (action === "recordCardPayment") return /^EV-\d{6}-\d{6}$/.test(String(data?.InvoiceId || ""));
  return false;
}

// Rows that record who made the sale, in a "SoldBy" column.
const SOLD_BY_ACTIONS = new Set(["recordEventSale", "recordCardPayment"]);

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

// Rows staff can edit or delete, each by its unique key column. Anything
// sent outside `fields` is ignored.
const ROW_TARGETS = {
  Order: {
    key: "Id",
    sheet: "",
    id: /^\d{1,12}$/,
    fields: ["Name", "Contact", "Address", "PickupDelivery", "Items", "Quantity", "Cost", "Deposit", "Payment", "DueDate", "Notes"],
  },
  // The money was charged in Stripe: only who/what it was for can change.
  CardPayment: {
    key: "PaymentIntentId",
    sheet: "CardPayments",
    id: /^[A-Za-z0-9_]{1,80}$/,
    fields: ["Name", "Email", "Phone", "Items", "Note", "InvoiceId"],
  },
  EventSale: {
    key: "SaleId",
    sheet: "EventSales",
    id: /^EV-\d{6}-\d{6}$/,
    fields: ["Name", "Items", "Note", "Method", "Amount", "Total", "CashReceived", "Change"],
  },
};
const EVENT_MONEY_FIELDS = ["Method", "Amount", "Total", "CashReceived", "Change"];
const MONEY = /^\d{1,7}(\.\d{1,2})?$/;

// "updateOrder" → ["update", ROW_TARGETS.Order], etc.
function rowAction(action) {
  const m = /^(update|delete)(Order|CardPayment|EventSale)$/.exec(String(action || ""));
  return m ? [m[1], ROW_TARGETS[m[2]], m[2]] : null;
}

function editableFields(target, data) {
  if (!data || typeof data !== "object") throw new BadRequest("Missing data");
  const fields = {};
  for (const name of target.fields) {
    if (Object.hasOwn(data, name)) fields[name] = String(data[name] ?? "").trim().slice(0, 5000);
  }
  if (!Object.keys(fields).length) throw new BadRequest("Nothing to update");
  return fields;
}

// Event sales: Card sales keep their charged amounts; Cash/Zelle amounts
// must be plain money values and the method stays Cash or Zelle.
async function checkEventSaleEdit(base, id, fields) {
  if (!EVENT_MONEY_FIELDS.some((f) => Object.hasOwn(fields, f))) return;
  const rows = await sheetGet(base, `/search?SaleId=${encodeURIComponent(id)}&sheet=EventSales`);
  const row = Array.isArray(rows) ? rows.find((r) => String(r.SaleId) === id) : null;
  if (row && String(row.Method) === "Card") throw new BadRequest("A card sale's amount and method can't be changed.");
  if (Object.hasOwn(fields, "Method") && !["Cash", "Zelle"].includes(fields.Method)) throw new BadRequest("Method must be Cash or Zelle.");
  for (const f of ["Amount", "Total", "CashReceived", "Change"]) {
    if (fields[f] && !MONEY.test(fields[f])) throw new BadRequest(`${f} must be an amount like 12.50`);
  }
}

// Update or delete one row. 404 when no row has that key.
async function changeRow(base, body, res) {
  const [verb, target, kind] = rowAction(body.action);
  const id = String(body.id ?? "").trim();
  if (!target.id.test(id)) throw new BadRequest("Missing or invalid id");
  if (kind === "CardPayment" && verb === "update" && body.data?.InvoiceId && !cleanId(body.data.InvoiceId)) {
    throw new BadRequest("Invalid order ID");
  }
  const path = `/${target.key}/${encodeURIComponent(id)}${target.sheet ? `?sheet=${target.sheet}` : ""}`;
  let init;
  if (verb === "update") {
    const fields = editableFields(target, body.data);
    if (kind === "EventSale") await checkEventSaleEdit(base, id, fields);
    init = { method: "PATCH", headers: sheetdbHeaders(), body: JSON.stringify({ data: fields }) };
  } else {
    init = { method: "DELETE", headers: sheetdbHeaders() };
  }
  const response = await fetch(`${base}${path}`, init);
  const payload = await response.json().catch(() => null);
  // SheetDB answers 404 when no row matches.
  if (response.status === 404) return res.status(404).json({ error: "Not found" });
  if (!response.ok) {
    console.error("sheets: SheetDB responded", response.status, payload);
    return res.status(502).json({ error: "Sheet request failed" });
  }
  res.setHeader("Cache-Control", "no-store");
  const count = verb === "update" ? payload?.updated : payload?.deleted;
  if (!Number(count)) return res.status(404).json({ error: "Not found" });
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

    const session = await requireEventAccess(req, res);
    if (!session) return;
    if (session.role !== ROLES.STAFF && !isEmployeeAllowed(req, params)) {
      return res.status(403).json({ error: "Employee logins can only use Event Sales." });
    }

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
    } else if (req.method === "POST" && rowAction(req.body?.action)) {
      return await changeRow(base, req.body, res);
    } else if (req.method === "POST") {
      const { action, data } = req.body || {};
      if (!Object.hasOwn(WRITE_ACTIONS, action)) throw new BadRequest("Unknown action");
      if (!data || typeof data !== "object") throw new BadRequest("Missing data");
      path = WRITE_ACTIONS[action];
      // Sales are stamped with who rang them up (SoldBy), from the login
      // itself, so it can't be typed in or changed from the browser.
      const row = SOLD_BY_ACTIONS.has(action) ? { ...data, SoldBy: await sellerName(session) } : data;
      init = { method: "POST", headers: sheetdbHeaders(), body: JSON.stringify(row) };
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
