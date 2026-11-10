import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "./passwords.js";
import { employeeRecord } from "./employees.js";
import { ALL_ACCESS, canAny, can } from "./permissions.js";

// Shared staff-login helpers for the /api functions. The leading underscore
// keeps Vercel from deploying this folder as its own endpoint.
//
// Server env vars:
//   STAFF_ACCOUNTS  JSON map of login → password hash, e.g.
//                   {"julio@example.com":"<salt>:<hash>","3475550100":"<salt>:<hash>"}
//                   Make each hash with: npm run hash-password
//   Employees (phone + 4-digit PIN, Event Sales only) aren't env vars:
//                   they live in the order sheet's "Employees" tab, managed
//                   from the app's Employees page (api/_lib/employees.js).
//   SESSION_SECRET  long random string that signs session cookies and
//                   invoice share links. Changing it logs everyone out and
//                   breaks share links that were already sent.

const COOKIE_NAME = "pim_session";
const SESSION_DAYS = 7;

// ---------- passwords ----------

export { hashPassword } from "./passwords.js";

// Emails are case-insensitive; phone numbers can be typed any way, so they
// match on their last 10 digits.
export function normalizeIdentifier(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (value.includes("@")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return value;
}

function loadAccountMap(envName) {
  try {
    const parsed = JSON.parse(process.env[envName] || "{}");
    const accounts = new Map();
    for (const [login, hash] of Object.entries(parsed)) {
      accounts.set(normalizeIdentifier(login), hash);
    }
    return accounts;
  } catch {
    console.error(`auth: ${envName} is not valid JSON`);
    return new Map();
  }
}

const loadAccounts = () => loadAccountMap("STAFF_ACCOUNTS");
// An employee's { hash, name, access } from the sheet's Employees tab.
// Undefined if they don't exist, are turned off, or the sheet can't be read
// (fail closed).
async function employee(phone) {
  try {
    return await employeeRecord(phone);
  } catch (err) {
    console.error("auth: couldn't check the Employees tab:", err.message);
    return undefined;
  }
}

// What each kind of login may use. "staff" is everything; "event" is an
// employee who may only use Event Sales.
export const ROLES = { STAFF: "staff", EVENT: "event" };


// A throwaway hash so an unknown login takes as long to check as a known
// one, which keeps response times from revealing which logins exist.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

export function checkCredentials(identifier, password) {
  const login = normalizeIdentifier(identifier);
  const stored = loadAccounts().get(login);
  const ok = verifyPassword(password, stored || DUMMY_HASH);
  return ok && stored ? login : null;
}

// Employees log in with a phone number and a 4-digit PIN. Returns the 10-digit
// phone, or null.
export async function checkEmployeeCredentials(identifier, pin) {
  const login = normalizeIdentifier(identifier);
  const stored = /^\d{10}$/.test(login) ? (await employee(login))?.hash : undefined;
  const ok = verifyPassword(pin, stored || DUMMY_HASH);
  return ok && stored ? login : null;
}

export function isAuthConfigured() {
  return Boolean(process.env.SESSION_SECRET) && loadAccounts().size > 0;
}

// ---------- signing ----------

function sign(value) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------- session cookie ----------

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Local `npm run dev` is plain http, where Safari drops Secure cookies.
function cookieAttributes(maxAgeSeconds) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function setSessionCookie(res, login, role = ROLES.STAFF) {
  const payload = Buffer.from(
    JSON.stringify({ sub: login, role, exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const value = `${payload}.${sign(`session:${payload}`)}`;
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${value}; ${cookieAttributes(SESSION_DAYS * 24 * 60 * 60)}`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${cookieAttributes(0)}`);
}

// The signed cookie's { login, role }, if its signature and expiry are good.
// Doesn't check the account still exists; the readers below do.
function parseSession(req) {
  if (!process.env.SESSION_SECRET) return null;
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(`session:${payload}`))) return null;
  try {
    const { sub, exp, role: rawRole } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!sub || !Number.isFinite(exp) || exp < Date.now()) return null;
    // Sessions from before roles existed are staff sessions.
    return { login: sub, role: rawRole === ROLES.EVENT ? ROLES.EVENT : ROLES.STAFF };
  } catch {
    return null;
  }
}

// Returns the logged-in STAFF login (email or 10-digit phone), or null.
// Employee sessions don't count, so every staff-only check stays closed
// to employees unless an endpoint lets them in on purpose. Removing
// someone from STAFF_ACCOUNTS ends their session right away.
export function readSession(req) {
  const info = parseSession(req);
  return info?.role === ROLES.STAFF && loadAccounts().has(info.login) ? info.login : null;
}

// Returns { login, role, name, access } for any valid session (staff, or an
// employee who is still active), or null. Staff have every access key. An
// employee's access comes fresh from the Employees tab, so ticking or
// unticking a section, turning them off or deleting them takes effect
// within the Employees cache time, without logging out.
export async function readSessionInfo(req) {
  const info = parseSession(req);
  return info ? sessionInfoFor(info.login, info.role) : null;
}

// { login, role, name, access } for a login that still exists, or null.
export async function sessionInfoFor(login, role) {
  if (role === ROLES.STAFF) return loadAccounts().has(login) ? { login, role, name: login, access: ALL_ACCESS } : null;
  const emp = await employee(login);
  return emp ? { login, role: ROLES.EVENT, name: emp.name, access: emp.access } : null;
}

// Gate for staff-only endpoints. Returns the login, or sends 401 (not
// logged in) / 403 (an employee login) and returns null, so callers do:
// `if (!requireStaff(req, res)) return;`
export function requireStaff(req, res) {
  const login = readSession(req);
  if (login) return login;
  if (parseSession(req)?.role === ROLES.EVENT) res.status(403).json({ error: "Only the owner's login can use this." });
  else res.status(401).json({ error: "Please log in" });
  return null;
}

// Who to credit for a sale or order: an employee's name from the
// Employees tab, or the staff login (email or phone).
export async function sellerName(info) {
  if (!info) return "";
  if (info.name) return info.name;
  if (info.role !== ROLES.EVENT) return info.login;
  return (await employee(info.login))?.name || info.login;
}

export const NO_ACCESS = "You don't have access to this. Ask the owner to turn it on for you.";

// Gate for a section: staff, or an employee with any of `keys` ticked
// (and "manage" too when `manage` is set). Resolves to the session info, or
// sends 401 / 403 and resolves to null:
//   const session = await requireAccess(req, res, ["pay"]); if (!session) return;
export async function requireAccess(req, res, keys, { manage = false } = {}) {
  const info = await readSessionInfo(req);
  if (!info) {
    res.status(401).json({ error: "Please log in" });
    return null;
  }
  if (!canAny(info, keys) || (manage && !can(info, "manage"))) {
    res.status(403).json({ error: NO_ACCESS });
    return null;
  }
  return info;
}

// ---------- invoice share links ----------

// A share link is ?id=714&token=… where the token is a server-side HMAC of
// the invoice id. Unlike the old browser-side token, the secret never ships
// to the browser, so a token can't be worked out for a different invoice.
export function shareTokenFor(invoiceId) {
  return sign(`invoice-share:${invoiceId}`).slice(0, 32);
}

export function isValidShareToken(invoiceId, token) {
  if (!process.env.SESSION_SECRET || !invoiceId || !token) return false;
  return safeEqual(token, shareTokenFor(invoiceId));
}

// ---------- catering calculator link ----------

// One no-login link for employees: /catering?share=1&token=… opens only the
// Catering Calculator. The token is an HMAC of the link "version", so every
// link already sent stops working when CALCULATOR_LINK_VERSION is changed
// (e.g. from 1 to 2) on the server, without logging anyone out.
const calculatorLinkVersion = () => String(process.env.CALCULATOR_LINK_VERSION || "1").trim();

export function calculatorTokenFor() {
  return sign(`catering-calculator:${calculatorLinkVersion()}`).slice(0, 32);
}

export function isValidCalculatorToken(token) {
  if (!process.env.SESSION_SECRET || !token) return false;
  return safeEqual(token, calculatorTokenFor());
}
