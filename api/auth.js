import {
  ROLES,
  checkCredentials,
  checkEmployeeCredentials,
  clearSessionCookie,
  isAuthConfigured,
  normalizeIdentifier,
  readSessionInfo,
  sellerName,
  setSessionCookie,
} from "./_lib/auth.js";

// Vercel serverless function: staff login.
//   GET                                          → { user, role, name } or 401
//        name: an employee's name from the Employees tab, or the staff login
//   POST { action: "login", identifier, password } → sets the session cookie
//        Staff log in with email/phone + password. Employees log in with
//        their phone + PIN and get role "event" (Event Sales only).
//   POST { action: "logout" }                      → clears it

// Best-effort brute-force brake: counts failed logins per IP for each warm
// function instance. Serverless instances come and go, so this slows down
// guessing but isn't a hard limit; long passwords are the real protection.
// Failures are also counted per login, since employee PINs are short.
const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function isLockedOut(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) failures.set(ip, { count: 1, first: Date.now() });
  else entry.count++;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const info = await readSessionInfo(req);
    return info
      ? res.status(200).json({ user: info.login, role: info.role, name: await sellerName(info) })
      : res.status(401).json({ error: "Please log in" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, identifier, password } = req.body || {};

  if (action === "logout") {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  if (action !== "login") return res.status(400).json({ error: "Unknown action" });

  if (!isAuthConfigured()) {
    console.error("auth: STAFF_ACCOUNTS or SESSION_SECRET is not set");
    return res.status(500).json({ error: "Login is not set up on the server yet" });
  }

  const ip = clientIp(req);
  const loginKey = `login:${normalizeIdentifier(identifier)}`;
  if (isLockedOut(ip) || isLockedOut(loginKey)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim() || !password || password.length > 200) {
    return res.status(400).json({ error: "Enter your email or phone number and password" });
  }

  // Both are always checked, so the time taken doesn't reveal which kind of
  // account a login is. A login that's in both lists is staff.
  const staff = checkCredentials(identifier, password);
  const employee = await checkEmployeeCredentials(identifier, password);
  const login = staff || employee;
  const role = staff ? ROLES.STAFF : ROLES.EVENT;
  if (!login) {
    recordFailure(ip);
    recordFailure(loginKey);
    return res.status(401).json({ error: "Wrong email/phone or password" });
  }

  failures.delete(ip);
  failures.delete(loginKey);
  setSessionCookie(res, login, role);
  return res.status(200).json({ user: login, role, name: await sellerName({ login, role }) });
}
