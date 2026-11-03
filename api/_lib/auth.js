import crypto from "node:crypto";

// Shared staff-login helpers for the /api functions. The leading underscore
// keeps Vercel from deploying this folder as its own endpoint.
//
// Server env vars:
//   STAFF_ACCOUNTS  JSON map of login → password hash, e.g.
//                   {"julio@example.com":"<salt>:<hash>","3475550100":"<salt>:<hash>"}
//                   Make each hash with: npm run hash-password
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

function loadAccounts() {
  try {
    const parsed = JSON.parse(process.env.STAFF_ACCOUNTS || "{}");
    const accounts = new Map();
    for (const [login, hash] of Object.entries(parsed)) {
      accounts.set(normalizeIdentifier(login), hash);
    }
    return accounts;
  } catch {
    console.error("auth: STAFF_ACCOUNTS is not valid JSON");
    return new Map();
  }
}

// A throwaway hash so an unknown login takes as long to check as a known
// one, which keeps response times from revealing which logins exist.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString("hex"));

export function checkCredentials(identifier, password) {
  const login = normalizeIdentifier(identifier);
  const stored = loadAccounts().get(login);
  const ok = verifyPassword(password, stored || DUMMY_HASH);
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

export function setSessionCookie(res, login) {
  const payload = Buffer.from(
    JSON.stringify({ sub: login, exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 })
  ).toString("base64url");
  const value = `${payload}.${sign(`session:${payload}`)}`;
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${value}; ${cookieAttributes(SESSION_DAYS * 24 * 60 * 60)}`);
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${cookieAttributes(0)}`);
}

// Returns the logged-in login (email or 10-digit phone), or null.
export function readSession(req) {
  if (!process.env.SESSION_SECRET) return null;
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(`session:${payload}`))) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!sub || !Number.isFinite(exp) || exp < Date.now()) return null;
    // Removing someone from STAFF_ACCOUNTS ends their session right away.
    if (!loadAccounts().has(sub)) return null;
    return sub;
  } catch {
    return null;
  }
}

// Gate for staff-only endpoints. Returns the login, or sends a 401 and
// returns null, so callers do: `if (!requireStaff(req, res)) return;`
export function requireStaff(req, res) {
  const login = readSession(req);
  if (login) return login;
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
