import { isValidCalculatorToken, readSession, requireStaff } from "./_lib/auth.js";

// Vercel serverless function: Catering Calculator quotes, stored in the
// "Quotes" tab of the order spreadsheet (through SheetDB, like api/sheets.js),
// so every staff login sees every quote on any device.
//
//   GET  ?action=list                         staff → quote rows
//   POST { action: "save", quote }            staff, or the no-login
//   POST { action: "save", quote, token,        calculator link (valid
//          employeeName }                       signed token) → upsert
//   POST { action: "delete", id }             staff only
//
// The no-login link can only save (create, or update a quote by its random
// id, which link users only ever know for quotes they made). It can't list
// or delete anything. Who made a quote (Source/CreatedBy) is set by the
// server when the row is created, never taken from the browser.

const SHEET = "Quotes";
const MAX = { text: 300, notes: 2000, lines: 200, linesJson: 40000, items: 8000 };

class BadRequest extends Error {}

function sheetdbHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (process.env.SHEETDB_USER && process.env.SHEETDB_PASS) {
    const creds = Buffer.from(`${process.env.SHEETDB_USER}:${process.env.SHEETDB_PASS}`).toString("base64");
    headers.Authorization = `Basic ${creds}`;
  }
  return headers;
}

async function sheetdb(base, path, init = {}, { notFoundOk = false } = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: sheetdbHeaders() });
  const payload = await response.json().catch(() => null);
  // SheetDB answers an update or delete that matches no rows with
  // 404 { error: "No results found" } rather than { updated: 0 }.
  if (response.status === 404 && notFoundOk) return null;
  if (!response.ok) {
    console.error("quotes: SheetDB responded", response.status, payload);
    throw new Error("Sheet request failed");
  }
  return payload;
}

const text = (v, max = MAX.text) => String(v ?? "").trim().slice(0, max);

// Quote ids are random (made in the browser) and the only key for updates.
function cleanQuoteId(value) {
  const id = String(value || "").trim();
  if (!/^q[a-z0-9]{8,40}$/.test(id)) throw new BadRequest("Missing or invalid quote id");
  return id;
}

// The editable part of a row, validated. Anything else in the payload is ignored.
function editableFields(quote) {
  if (!quote || typeof quote !== "object") throw new BadRequest("Missing quote");
  const total = Number(quote.total);
  if (!Number.isFinite(total) || Math.abs(total) > 1e7) throw new BadRequest("Invalid total");
  const lines = Array.isArray(quote.lines) ? quote.lines.slice(0, MAX.lines) : [];
  const linesJson = JSON.stringify(
    lines.map((l) => ({
      op: ["+", "−", "×", "÷"].includes(l?.op) ? l.op : null,
      qty: Math.max(1, Math.min(999, Math.round(Number(l?.qty) || 1))),
      id: text(l?.id, 80),
      name: text(l?.name, 120),
      size: l?.size === "half" ? "half" : "whole",
      amount: Number.isFinite(Number(l?.amount)) ? Number(l.amount) : 0,
    }))
  );
  if (linesJson.length > MAX.linesJson) throw new BadRequest("Too many dishes");
  const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(quote.eventDate || "")) ? quote.eventDate : "";
  return {
    Code: text(quote.code, 20),
    UpdatedAt: new Date().toISOString(),
    ClientName: text(quote.name),
    Phone: text(quote.phone, 40),
    Address: text(quote.address),
    EventDate: eventDate,
    Notes: text(quote.notes, MAX.notes),
    Items: text(quote.itemsText, MAX.items),
    Total: total.toFixed(2),
    Lines: linesJson,
    SentAt: text(quote.sentAt, 40),
  };
}

async function save(base, body, who, res) {
  const id = cleanQuoteId(body.quote?.id);
  const fields = editableFields(body.quote);
  const path = `/QuoteId/${encodeURIComponent(id)}?sheet=${SHEET}`;

  const updated = await sheetdb(base, path, { method: "PATCH", body: JSON.stringify({ data: fields }) }, { notFoundOk: true });
  if (!updated?.updated) {
    const createdAt = /^\d{4}-\d{2}-\d{2}T/.test(String(body.quote.createdAt || "")) ? text(body.quote.createdAt, 40) : fields.UpdatedAt;
    const row = { QuoteId: id, CreatedAt: createdAt, Source: who.source, CreatedBy: who.name, ...fields };
    await sheetdb(base, `?sheet=${SHEET}`, { method: "POST", body: JSON.stringify({ data: [row] }) });
  }
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const sheetId = process.env.SHEETDB_ID;
  if (!sheetId) {
    console.error("quotes: SHEETDB_ID is not set");
    return res.status(500).json({ error: "Server is not configured" });
  }
  const base = `https://sheetdb.io/api/v1/${encodeURIComponent(sheetId)}`;

  try {
    if (req.method === "GET") {
      if (!requireStaff(req, res)) return;
      const params = new URL(req.url, "http://localhost").searchParams;
      if (params.get("action") !== "list") throw new BadRequest("Unknown action");
      const rows = await sheetdb(base, `?sheet=${SHEET}`, { method: "GET" });
      return res.status(200).json(Array.isArray(rows) ? rows : []);
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    if (body.action === "save") {
      const login = readSession(req);
      if (login) return await save(base, body, { source: "staff", name: login }, res);
      if (isValidCalculatorToken(body.token)) {
        const name = text(body.employeeName, 60) || "Employee";
        return await save(base, body, { source: "link", name }, res);
      }
      return res.status(401).json({ error: "Please log in" });
    }

    if (body.action === "delete") {
      if (!requireStaff(req, res)) return;
      const id = cleanQuoteId(body.id);
      await sheetdb(base, `/QuoteId/${encodeURIComponent(id)}?sheet=${SHEET}`, { method: "DELETE" }, { notFoundOk: true });
      return res.status(200).json({ ok: true });
    }

    throw new BadRequest("Unknown action");
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    console.error("quotes error:", err);
    return res.status(502).json({ error: "Couldn't reach the quotes sheet" });
  }
}
