import crypto from "node:crypto";
import { can } from "./permissions.js";

// Shopping lists, one row per list in the order sheet's "Shopping" tab:
//   ListId | Title | AssignedTo | AssignedName | Status | Items | Notes |
//   Spent | Receipts | CreatedBy | CreatedAt | UpdatedAt | DoneBy | DoneAt
// Items and Receipts are JSON (see cleanItems / Receipts below). Status is
// "Open" or "Done". AssignedTo is the employee's 10-digit phone, or blank
// for "anyone with Shopping lists". These helpers are pure so they can be
// tested without the sheet.

export const SHOPPING_SHEET = "Shopping";
export const LIMITS = { items: 150, text: 120, notes: 1000, receipts: 10 };

export class BadRequest extends Error {}

const text = (v, max = LIMITS.text) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const randomId = (prefix, bytes = 8) => prefix + crypto.randomBytes(bytes).toString("hex");

export const newListId = () => randomId("s", 10);

export function cleanListId(value) {
  const id = String(value ?? "").trim();
  if (!/^s[a-f0-9]{8,40}$/.test(id)) throw new BadRequest("Missing or invalid list id");
  return id;
}

// "" (not given) or a dollar amount with 2 decimals.
export function money(value) {
  if (value === "" || value == null) return "";
  const n = Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1e6) throw new BadRequest("Check the dollar amount.");
  return n.toFixed(2);
}

const parseJson = (raw, fallback) => {
  try {
    const v = JSON.parse(String(raw || ""));
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

// An item: { id, name, qty, note, price, got, out, extra, productId, store }.
//   store  which business it's bought at (a list can cover several stops)
//   price  what the manager expects that line to cost ("" if not given)
//   got    bought; out = the store didn't have it
//   extra  added at the store by the person shopping, not on the list
// Ids are kept when they're valid so check marks survive an edit.
export function cleanItems(list, { keepState = true } = {}) {
  if (!Array.isArray(list)) throw new BadRequest("Missing items");
  const seen = new Set();
  const items = [];
  for (const raw of list.slice(0, LIMITS.items)) {
    const name = text(raw?.name);
    if (!name) continue;
    let id = /^i[a-f0-9]{6,20}$/.test(String(raw?.id)) ? String(raw.id) : "";
    if (!id || seen.has(id)) id = randomId("i", 5);
    seen.add(id);
    items.push({
      id,
      name,
      qty: text(raw?.qty, 40),
      note: text(raw?.note, 200),
      price: money(raw?.price),
      got: keepState && raw?.got === true,
      out: keepState && raw?.out === true && raw?.got !== true,
      extra: raw?.extra === true,
      // From the product catalog (api/_lib/products.js), for its picture and bin.
      productId: /^p[a-f0-9]{8,40}$/.test(String(raw?.productId)) ? String(raw.productId) : "",
      store: text(raw?.store, 60),
    });
  }
  return items;
}

// A receipt photo: { path, at, by, store?, details? }. store: which stop it's from. path is the private Vercel Blob
// pathname; details is what the receipt reader found (api/_lib/receiptReader.js).
export function receiptsOf(row) {
  return parseJson(row?.Receipts, []).filter((r) => r && typeof r.path === "string" && r.path.startsWith(`receipts/${row.ListId}/`));
}

export const itemsOf = (row) => parseJson(row?.Items, []);

export const isManager = (session) => can(session, "shopping") && can(session, "manage");
export const seesPrices = (session) => isManager(session) || can(session, "prices");

// Who may see a list: managers see all; everyone else sees lists given to
// them or to anyone.
export function canSee(session, row) {
  if (isManager(session)) return true;
  const to = String(row?.AssignedTo ?? "").trim();
  return !to || to === session.login;
}

// Managers may change any list; an employee only one they made, while it's open.
export const canEditList = (session, row) => isManager(session) || (String(row?.CreatedBy || "") === session.name && row?.Status !== "Done");

// The row as the app gets it. Without "prices", the manager's expected
// prices are left out, and so is what the trip cost unless they finished it.
export function publicList(row, session) {
  const prices = seesPrices(session);
  const items = itemsOf(row).map((i) => (prices ? i : { ...i, price: "" }));
  const mine = String(row.DoneBy || "") === session.name;
  return {
    id: row.ListId,
    title: row.Title || "",
    assignedTo: row.AssignedTo || "",
    assignedName: row.AssignedName || "",
    status: row.Status === "Done" ? "Done" : "Open",
    items,
    notes: row.Notes || "",
    spent: prices || mine ? row.Spent || "" : "",
    receipts: receiptsOf(row).map(({ path, at, by, store, details }) => ({ path, at, by, store: store || "", details: details || null })),
    createdBy: row.CreatedBy || "",
    createdAt: row.CreatedAt || "",
    updatedAt: row.UpdatedAt || "",
    doneBy: row.DoneBy || "",
    doneAt: row.DoneAt || "",
    canEdit: canEditList(session, row),
  };
}

// A JPEG/PNG/WebP photo sent as base64 (the app shrinks it first). Returns
// { buffer, contentType, ext }.
const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function decodeImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new BadRequest("That photo couldn't be read. Try taking it again.");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw new BadRequest("That photo is empty.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new BadRequest("That photo is too big. Try again a little further from the receipt.");
  return { buffer, contentType: match[1], ext: IMAGE_TYPES[match[1]] };
}
