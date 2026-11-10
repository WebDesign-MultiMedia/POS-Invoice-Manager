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
// Every action needs a login. Staff may use them all; an employee only the
// ones their ticked sections allow (ACTION_ACCESS below, sections in
// api/_lib/permissions.js). The one public action is:
//   GET  ?action=sharedInvoice&id=714&token=…
// which serves a customer's read-only invoice link. It returns only that
// one invoice and its card payments, and only with a valid signed token.

import { NO_ACCESS, isValidShareToken, readSessionInfo, sellerName, shareTokenFor } from "./_lib/auth.js";
import { can, canAny } from "./_lib/permissions.js";
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

// Which sections allow each action. An employee needs any one of them
// ticked; edits and deletes also need "manage".
const READ_ACCESS = {
  orders: ["orders", "search", "pay"],
  order: ["orders", "search", "pay"],
  cardPayments: ["search", "pay"],
  cardPaymentsFor: ["orders", "search", "pay"],
  eventSales: ["event"],
  shareToken: ["orders", "search"],
};
const WRITE_ACCESS = {
  createOrder: ["orders"],
  recordCardPayment: ["pay"],
  recordEventSale: ["event"],
};
const ROW_ACCESS = { Order: ["orders"], CardPayment: ["pay"], EventSale: ["event"] };
const isEventSaleId = (id) => /^EV-\d{6}-\d{6}$/.test(String(id || ""));

// True when this session may make this request. Unknown actions pass here
// and are refused as bad requests further on.
function allowed(session, req, params) {
  if (req.method === "GET") {
    const keys = READ_ACCESS[params.get("action")];
    return !keys || canAny(session, keys);
  }
  if (req.method !== "POST") return true;
  const { action, data } = req.body || {};
  const row = rowAction(action);
  if (row) return canAny(session, ROW_ACCESS[row[2]]) && can(session, "manage");
  // Event Sales also logs the card payment of an event card sale.
  if (action === "recordCardPayment" && can(session, "event") && isEventSaleId(data?.InvoiceId)) return true;
  const keys = WRITE_ACCESS[action];
  return !keys || canAny(session, keys);
}

// Employees only ever see and change their own rows: orders they took
// (TakenBy) and sales they rang up (SoldBy), matched on their name from the
// Employees tab. Staff see everything. Filtering happens here, on the
// server, so it can't be got around from the browser.
const OWNER_COLUMN = { orders: "TakenBy", order: "TakenBy", cardPayments: "SoldBy", eventSales: "SoldBy" };
const ROW_OWNER = {
  Order: { column: "TakenBy", lookup: (id) => `/search?Id=${encodeURIComponent(id)}`, key: "Id" },
  CardPayment: { column: "SoldBy", lookup: (id) => `/search?PaymentIntentId=${encodeURIComponent(id)}&sheet=CardPayments`, key: "PaymentIntentId" },
  EventSale: { column: "SoldBy", lookup: (id) => `/search?SaleId=${encodeURIComponent(id)}&sheet=EventSales`, key: "SaleId" },
};
const isStaff = (session) => session.role === "staff";
const norm = (v) => String(v ?? "").trim().toLowerCase();
const isMine = (session, value) => Boolean(norm(value)) && norm(value) === norm(session.name);
const mineOnly = (rows, column, session) => (Array.isArray(rows) ? rows.filter((r) => isMine(session, r[column])) : rows);

// True when this order (by its numeric Id) was taken by this employee.
async function ownsOrder(base, id, session) {
  const rows = await sheetGet(base, `/search?Id=${encodeURIComponent(id)}`);
  const row = Array.isArray(rows) ? rows.find((r) => String(r.Id) === String(id)) : null;
  return Boolean(row) && isMine(session, row.TakenBy);
}

// Employees: what this read may return. Card payments on an order they
// took are all theirs to see (so the invoice balance is right).
async function filterForEmployee(base, action, params, payload, session) {
  if (action === "cardPaymentsFor") {
    const invoiceId = params.get("invoiceId");
    if (/^\d+$/.test(String(invoiceId)) && (await ownsOrder(base, invoiceId, session))) return payload;
    return mineOnly(payload, "SoldBy", session);
  }
  const column = OWNER_COLUMN[action];
  return column ? mineOnly(payload, column, session) : payload;
}

// Rows that record who made them: sales in a "SoldBy" column, orders in a
// "TakenBy" column.
const STAMP_COLUMN = { recordEventSale: "SoldBy", recordCardPayment: "SoldBy", createOrder: "TakenBy" };

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
async function changeRow(base, body, res, session) {
  const [verb, target, kind] = rowAction(body.action);
  const id = String(body.id ?? "").trim();
  if (!target.id.test(id)) throw new BadRequest("Missing or invalid id");
  // Employees may change only their own orders and sales.
  if (!isStaff(session)) {
    const owner = ROW_OWNER[kind];
    const rows = await sheetGet(base, owner.lookup(id));
    const row = Array.isArray(rows) ? rows.find((r) => String(r[owner.key]) === id) : null;
    if (!row) return res.status(404).json({ error: "Not found" });
    if (!isMine(session, row[owner.column])) return res.status(403).json({ error: "You can only change orders and sales you took." });
  }
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

    const session = await readSessionInfo(req);
    if (!session) return res.status(401).json({ error: "Please log in" });
    if (!allowed(session, req, params)) return res.status(403).json({ error: NO_ACCESS });

    if (req.method === "GET" && params.get("action") === "shareToken") {
      const id = cleanId(params.get("id"));
      if (!id) throw new BadRequest("Missing or invalid id");
      if (!isStaff(session) && !(await ownsOrder(base, id, session))) return res.status(404).json({ error: "Not found" });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ token: shareTokenFor(id) });
    }

    if (req.method === "GET") {
      const build = READ_ACTIONS[params.get("action")];
      if (!build) throw new BadRequest("Unknown action");
      path = build(params);
      init = { method: "GET", headers: sheetdbHeaders() };
    } else if (req.method === "POST" && rowAction(req.body?.action)) {
      return await changeRow(base, req.body, res, session);
    } else if (req.method === "POST") {
      const { action, data } = req.body || {};
      if (!Object.hasOwn(WRITE_ACTIONS, action)) throw new BadRequest("Unknown action");
      if (!data || typeof data !== "object") throw new BadRequest("Missing data");
      path = WRITE_ACTIONS[action];
      // Sales and orders are stamped with who made them, from the login
      // itself, so it can't be typed in or changed from the browser.
      const column = STAMP_COLUMN[action];
      const row = column ? { ...data, [column]: await sellerName(session) } : data;
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
    if (req.method === "GET" && !isStaff(session)) {
      return res.status(200).json(await filterForEmployee(base, params.get("action"), params, payload, session));
    }
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    console.error("sheets error:", err);
    return res.status(500).json({ error: "Sheet request failed" });
  }
}
