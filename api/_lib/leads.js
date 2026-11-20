// Web Design & MultiMedia: the business leads list (shops that might want a
// website). It has its own Google Sheet and its own SheetDB API, set in
// server env vars that never reach the browser:
//   WEB_SHEETDB_ID    the SheetDB API id for that sheet
//   WEB_SHEETDB_USER  } only once Basic Auth is switched on for that API
//   WEB_SHEETDB_PASS  }
//
// Reached through /api/sheets (no new serverless function):
//   GET  ?action=leads                         every row
//   POST { action: "createLead", data }        add a row (gets a new Id)
//   POST { action: "updateLead", id, data }    change the row with that Id
//   POST { action: "deleteLead", id }          hide it (Undo / Recently deleted)
//   POST { action: "restoreLead", id }         bring a deleted one back
//
// Only the owner's login and the Web Design login (role "web") may use it;
// restaurant employees never can (they can't be given "webdesign").
//
// The sheet's headers were typed by hand ("Business Name ", "Tikto",
// "Answer phone call ?"), so columns are matched loosely: lower-case, only
// letters and digits. The app always uses the clean names in FIELDS.
// Editing needs an "Id" column, because SheetDB finds a row by a column's
// value; rows typed in the sheet without an Id can be seen but not edited.
//
// Deleting only marks the row, like orders: its "Deleted" column gets when
// and by whom, the app moves it to Recently deleted, and Restore clears it.
// The row stays in the sheet. Needs a "Deleted" column.

import { readSessionInfo, NO_ACCESS } from "./auth.js";
import { can } from "./permissions.js";
import { SHEETDB_LIMIT_MESSAGE, sheetdbFetch } from "./sheetdb.js";

export const LEAD_ACTIONS = ["leads", "createLead", "updateLead", "deleteLead", "restoreLead"];

// Clean name → other ways the header may be spelled (after squash()).
export const FIELDS = {
  Id: ["id"],
  BusinessType: ["businesstype", "type"],
  BusinessName: ["businessname", "name"],
  Location: ["location", "address"],
  Email: ["email"],
  Phone: ["phonenumber", "phone"],
  GoogleLocation: ["googlelocation", "google", "googlemaps"],
  BusinessWebsite: ["businesswebsite"],
  NewWebsite: ["newwebsite"],
  Others: ["others", "other"],
  Instagram: ["instagram"],
  Yelp: ["yelp"],
  TikTok: ["tiktok", "tikto"],
  Facebook: ["facebook"],
  AnswerPhone: ["answerphonecall", "answerphone", "answeredphonecall"],
  HasWebsite: ["website"],
  Notes: ["notes", "note"],
  Deleted: ["deleted"],
};
// Id is set once by the server; Deleted only by delete/restore.
const EDITABLE = Object.keys(FIELDS).filter((f) => f !== "Id" && f !== "Deleted");

export const squash = (header) => String(header ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// { BusinessName: "Business Name ", ... } for the headers this sheet has.
export function headerMap(headers) {
  const map = {};
  for (const header of headers) {
    const key = squash(header);
    const field = Object.keys(FIELDS).find((f) => FIELDS[f].includes(key));
    if (field && !map[field]) map[field] = header;
  }
  return map;
}

// A sheet row → the app's clean names (columns the app doesn't know are
// dropped). Blank rows are skipped by the caller.
export function cleanRow(row, map) {
  const out = {};
  for (const field of Object.keys(FIELDS)) out[field] = map[field] ? String(row[map[field]] ?? "").trim() : "";
  return out;
}

// The app's clean names → this sheet's real headers, only the editable
// fields that were sent. Throws when the sheet lacks a column for one of
// them, so nothing typed is silently lost.
function sheetFields(data, map) {
  if (!data || typeof data !== "object") throw new LeadError(400, "Missing data");
  const out = {};
  const missing = [];
  for (const field of EDITABLE) {
    if (!Object.hasOwn(data, field)) continue;
    const value = String(data[field] ?? "").trim().slice(0, 2000);
    if (!map[field]) {
      if (value) missing.push(field);
      continue;
    }
    out[map[field]] = value;
  }
  if (missing.length) throw new LeadError(409, `The sheet has no column for: ${missing.join(", ")}. Add it to the sheet's first row, then try again.`);
  if (!Object.keys(out).length) throw new LeadError(400, "Nothing to save");
  return out;
}

class LeadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function base() {
  const id = process.env.WEB_SHEETDB_ID;
  return id ? `https://sheetdb.io/api/v1/${encodeURIComponent(id)}` : null;
}

function headers() {
  const out = { "Content-Type": "application/json" };
  if (process.env.WEB_SHEETDB_USER && process.env.WEB_SHEETDB_PASS) {
    const creds = Buffer.from(`${process.env.WEB_SHEETDB_USER}:${process.env.WEB_SHEETDB_PASS}`).toString("base64");
    out.Authorization = `Basic ${creds}`;
  }
  return out;
}

async function sheet(path, init = {}) {
  const response = await sheetdbFetch(`${base()}${path}`, { method: "GET", ...init, headers: headers() });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("leads: SheetDB responded", response.status, payload);
    if (response.status === 429) throw new LeadError(429, SHEETDB_LIMIT_MESSAGE);
    if (response.status === 404 && init.method === "PATCH") throw new LeadError(404, "That business isn't in the sheet any more.");
    throw new LeadError(502, "The Web Design sheet didn't answer. Try again.");
  }
  return payload;
}

// The sheet's header row. Cached for a few minutes: SheetDB requests count
// toward the monthly limit, and headers rarely change.
let keysCache = null;
const KEYS_MS = 5 * 60 * 1000;
async function sheetHeaders() {
  if (keysCache && Date.now() - keysCache.at < KEYS_MS && keysCache.base === base()) return keysCache.keys;
  const keys = await sheet("/keys");
  if (!Array.isArray(keys)) throw new LeadError(502, "Couldn't read the Web Design sheet's columns.");
  keysCache = { at: Date.now(), base: base(), keys };
  return keys;
}
export function forgetHeaders() {
  keysCache = null;
}

// New rows get an Id like "WD-2611191432-7Q": sortable by when it was made,
// and the short random end keeps two phones saving at once apart.
function newId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  return `WD-${stamp}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
}
const VALID_ID = /^[A-Za-z0-9-]{1,40}$/;

// "11/19/2026 5:42 PM", New York time, like the orders' Deleted column.
function stamp(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: process.env.ORDER_TIME_ZONE || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true })
      .formatToParts(now)
      .map((x) => [x.type, x.value])
  );
  return `${p.month}/${p.day}/${p.year} ${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}`;
}
const NO_DELETED_COLUMN = 'Add a column named "Deleted" to the Web Design sheet (first row), then try again. It lets deleted businesses be restored.';

async function patchRow(map, rowId, fields) {
  if (!VALID_ID.test(rowId)) throw new LeadError(400, "Missing or invalid id");
  const payload = await sheet(`/${encodeURIComponent(map.Id)}/${encodeURIComponent(rowId)}`, {
    method: "PATCH",
    body: JSON.stringify({ data: fields }),
  });
  if (!Number(payload?.updated)) throw new LeadError(404, "That business isn't in the sheet any more.");
}

export async function handleLeads(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const session = await readSessionInfo(req);
  if (!session) return res.status(401).json({ error: "Please log in" });
  if (!can(session, "webdesign")) return res.status(403).json({ error: NO_ACCESS });
  if (!base()) {
    console.error("leads: WEB_SHEETDB_ID is not set");
    return res.status(500).json({ error: "The Web Design sheet isn't connected yet (WEB_SHEETDB_ID)." });
  }

  try {
    if (req.method === "GET") {
      const [keys, rows] = await Promise.all([sheetHeaders(), sheet("")]);
      const map = headerMap(keys);
      const all = (Array.isArray(rows) ? rows : []).map((r) => cleanRow(r, map)).filter((r) => Object.values(r).some(Boolean));
      // One read gives both lists, so opening Recently deleted costs no
      // extra SheetDB request.
      return res.status(200).json({
        leads: all.filter((r) => !r.Deleted),
        deleted: all.filter((r) => r.Deleted),
        canEdit: Boolean(map.Id),
        canDelete: Boolean(map.Id && map.Deleted),
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { action, id, data } = req.body || {};
    const map = headerMap(await sheetHeaders());
    if (!map.Id) throw new LeadError(409, 'Add a column named "Id" to the Web Design sheet (first row), then try again.');

    if (action === "createLead") {
      const fields = sheetFields(data, map);
      if (!String(data.BusinessName ?? "").trim()) throw new LeadError(400, "Add the business name.");
      const newRowId = newId();
      await sheet("", { method: "POST", body: JSON.stringify({ data: [{ ...fields, [map.Id]: newRowId }] }) });
      return res.status(200).json({ ok: true, id: newRowId });
    }

    if (action === "updateLead") {
      await patchRow(map, String(id ?? "").trim(), sheetFields(data, map));
      return res.status(200).json({ ok: true });
    }

    if (action === "deleteLead" || action === "restoreLead") {
      if (!map.Deleted) throw new LeadError(409, NO_DELETED_COLUMN);
      const value = action === "deleteLead" ? `${stamp()} by ${session.name || session.login}` : "";
      await patchRow(map, String(id ?? "").trim(), { [map.Deleted]: value });
      return res.status(200).json(action === "deleteLead" ? { deleted: 1, Deleted: value } : { restored: 1 });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    if (err instanceof LeadError) return res.status(err.status).json({ error: err.message });
    console.error("leads error:", err);
    return res.status(500).json({ error: "Web Design sheet request failed" });
  }
}
