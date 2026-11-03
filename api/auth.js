import { checkCredentials, clearSessionCookie, isAuthConfigured, readSession, setSessionCookie } from "./_lib/auth.js";

// Vercel serverless function: staff login.
//   GET                                          → { user } or 401
//   POST { action: "login", identifier, password } → sets the session cookie
//   POST { action: "logout" }                      → clears it

// Best-effort brute-force brake: counts failed logins per IP for each warm
// function instance. Serverless instances come and go, so this slows down
// guessing but isn't a hard limit; long passwords are the real protection.
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
    const user = readSession(req);
    return user ? res.status(200).json({ user }) : res.status(401).json({ error: "Please log in" });
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
  if (isLockedOut(ip)) {
    return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
  }

  if (typeof identifier !== "string" || typeof password !== "string" || !identifier.trim() || !password || password.length > 200) {
    return res.status(400).json({ error: "Enter your email or phone number and password" });
  }

  const login = checkCredentials(identifier, password);
  if (!login) {
    recordFailure(ip);
    return res.status(401).json({ error: "Wrong email/phone or password" });
  }

  failures.delete(ip);
  setSessionCookie(res, login);
  return res.status(200).json({ user: login });
}
