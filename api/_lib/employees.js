import { hashPassword } from "./passwords.js";
import { sheetdbBase, sheetdbHeaders } from "./sheetdb.js";

// Employee accounts (phone + 4-digit PIN, Event Sales only), kept in the
// "Employees" tab of the order sheet so staff can add and remove them from
// the app's Employees page, with no redeploy. Columns:
//   Phone | Name | PinHash | Active | AddedBy | AddedAt | UpdatedAt
// PinHash is a salted scrypt hash. The PIN itself is never stored anywhere.
//
// Logins and every employee request check this list, so it's cached for a
// short time per server instance. Turning someone off or deleting them
// takes effect within CACHE_MS.

export const EMPLOYEES_SHEET = "Employees";
const CACHE_MS = 30 * 1000;
let cache = { at: 0, rows: null };

export function clearEmployeeCache() {
  cache = { at: 0, rows: null };
}

export const phoneKey = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};

// The PINs people try first: all one digit, in a row, or a year.
export function pinProblem(pin) {
  const p = String(pin ?? "");
  if (!/^\d{4}$/.test(p)) return "The PIN must be exactly 4 digits.";
  if (/^(\d)\1+$/.test(p) || "0123456789".includes(p) || "9876543210".includes(p) || /^(19|20)\d\d$/.test(p)) {
    return "That PIN is too easy to guess (all one digit, in a row, or a year). Pick another.";
  }
  return null;
}

export const hashPin = (pin) => hashPassword(pin);

async function sheetdb(path, init = {}) {
  const base = sheetdbBase();
  if (!base) throw new Error("SHEETDB_ID is not set");
  const res = await fetch(`${base}${path}`, { ...init, headers: sheetdbHeaders() });
  const payload = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, payload };
}

// Every employee row, with Phone normalized. Throws if the sheet can't be
// read (so a login fails closed instead of letting anyone in).
export async function listEmployees({ fresh = false } = {}) {
  if (!fresh && cache.rows && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const { ok, status, payload } = await sheetdb(`?sheet=${EMPLOYEES_SHEET}`, { method: "GET" });
  if (!ok) {
    console.error("employees: SheetDB responded", status, payload);
    throw new Error("Couldn't read the Employees tab");
  }
  const rows = (Array.isArray(payload) ? payload : [])
    .map((r) => ({ ...r, Phone: phoneKey(r.Phone) }))
    .filter((r) => r.Phone);
  cache = { at: Date.now(), rows };
  return rows;
}

const isActive = (row) => String(row.Active ?? "").trim().toLowerCase() !== "no";

// The stored PIN hash for an active employee, or undefined.
export async function employeePinHash(phone) {
  const key = phoneKey(phone);
  if (!key) return undefined;
  const row = (await listEmployees()).find((r) => r.Phone === key);
  return row && isActive(row) ? String(row.PinHash || "") || undefined : undefined;
}

// An employee's name as staff typed it, or their phone if it's blank.
export async function employeeName(phone) {
  const key = phoneKey(phone);
  const row = (await listEmployees()).find((r) => r.Phone === key);
  return String(row?.Name || "").trim() || key;
}

export async function addEmployee({ phone, name, pin, addedBy }) {
  const now = new Date().toISOString();
  const row = { Phone: phone, Name: name, PinHash: hashPin(pin), Active: "Yes", AddedBy: addedBy, AddedAt: now, UpdatedAt: now };
  const result = await sheetdb(`?sheet=${EMPLOYEES_SHEET}`, { method: "POST", body: JSON.stringify({ data: [row] }) });
  clearEmployeeCache();
  return result;
}

export async function updateEmployee(phone, fields) {
  const result = await sheetdb(`/Phone/${encodeURIComponent(phone)}?sheet=${EMPLOYEES_SHEET}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { ...fields, UpdatedAt: new Date().toISOString() } }),
  });
  clearEmployeeCache();
  return result;
}

export async function deleteEmployee(phone) {
  const result = await sheetdb(`/Phone/${encodeURIComponent(phone)}?sheet=${EMPLOYEES_SHEET}`, { method: "DELETE" });
  clearEmployeeCache();
  return result;
}
