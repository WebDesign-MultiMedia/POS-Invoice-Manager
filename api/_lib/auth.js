import crypto from "node:crypto";

// Shared staff-login helpers for the /api functions. The leading underscore
// keeps Vercel from deploying this folder as its own endpoint.
//
// Server env vars:
//   STAFF_ACCOUNTS  JSON map of login → password hash, e.g.
//                   {"julio@example.com":"<salt>:<hash>","3475550100":"<salt>:<hash>"}
//                   Make each hash with: npm run hash-password
//   EMPLOYEE_ACCOUNTS  JSON map of phone number → PIN hash, for employees
//                   who may ONLY use Event Sales, e.g.
//                   {"3475550123":"<salt>:<hash>"}
//                   Make each hash with: npm run hash-pin
//   SESSION_SECRET  long random string that signs session cookies and
//                   invoice share links. Changing it logs everyone out and
//                   breaks share links that were already sent.

const COOKIE_NAME = "pim_session";
const SESSION_DAYS = 7;
const SCRYPT_KEYLEN = 64;

// ---------- passwords ----------

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(String(password), salt, expected.length || SCRYPT_KEYLEN);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

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
const loadEmployees = () => loadAccountMap("EMPLOYEE_ACCOUNTS");

// What each kind of login may use. "staff" is everything; "event" is an
// employee who may only use Event Sales.
export const ROLES = { STAFF: "staff", EVENT: "event" };
const accountsFor = (role) => (role === ROLES.EVENT ? loadEmployees() : loadAccounts());

// A throwaway hash so an unknown login takes as long to check as a known
// one, which keeps response times from revealing which logins exist.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

export function checkCredentials(identifier, password) {
  const login = normalizeIdentifier(identifier);
  const stored = loadAccounts().get(login);
  const ok = verifyPassword(password, stored || DUMMY_HASH);
  return ok && stored ? login : null;
}

// Employees log in with a phone number and a PIN. Returns the 10-digit
// phone, or null.
export function checkEmployeeCredentials(identifier, pin) {
  const login = normalizeIdentifier(identifier);
  const stored = /^\d{10}$/.test(login) ? loadEmployees().get(login) : undefined;
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

// Returns { login, role } for any valid session (staff or employee), or null.
export function readSessionInfo(req) {
  if (!process.env.SESSION_SECRET) return null;
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(`session:${payload}`))) return null;
  try {
    const { sub, exp, role: rawRole } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // Sessions from before roles existed are staff sessions.
    const role = rawRole === ROLES.EVENT ? ROLES.EVENT : ROLES.STAFF;
    if (!sub || !Number.isFinite(exp) || exp < Date.now()) return null;
    // Removing someone from STAFF_ACCOUNTS / EMPLOYEE_ACCOUNTS ends their
    // session right away.
    if (!accountsFor(role).has(sub)) return null;
    return { login: sub, role };
  } catch {
    return null;
  }
}

// Returns the logged-in STAFF login (email or 10-digit phone), or null.
// Employee sessions don't count, so every staff-only check stays closed
// to employees unless an endpoint lets them in on purpose.
export function readSession(req) {
  const info = readSessionInfo(req);
  return info?.role === ROLES.STAFF ? info.login : null;
}

// Gate for staff-only endpoints. Returns the login, or sends 401 (not
// logged in) / 403 (an employee login) and returns null, so callers do:
// `if (!requireStaff(req, res)) return;`
export function requireStaff(req, res) {
  const info = readSessionInfo(req);
  if (info?.role === ROLES.STAFF) return info.login;
  if (info) res.status(403).json({ error: "Employee logins can only use Event Sales." });
  else res.status(401).json({ error: "Please log in" });
  return null;
}

// Gate for what Event Sales needs: staff or an employee. Returns
// { login, role }, or sends a 401 and returns null.
export function requireEventAccess(req, res) {
  const info = readSessionInfo(req);
  if (info) return info;
  res.status(401).json({ error: "Please log in" });
  return null;
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
