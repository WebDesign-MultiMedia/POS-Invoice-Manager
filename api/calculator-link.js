import { calculatorTokenFor, isValidCalculatorToken, requireAccess } from "./_lib/auth.js";

// Vercel serverless function for the Catering Calculator's no-login link
// (see calculatorTokenFor in _lib/auth.js).
//   GET ?action=token            staff, or Catering Calculator access → { token }
//   GET ?action=check&token=…    public     → { ok: true } or 403
// The calculator itself holds no customer data; the check only decides
// whether the app shows the calculator without a login.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const params = new URL(req.url, "http://localhost").searchParams;
  const action = params.get("action");

  if (action === "check") {
    return isValidCalculatorToken(params.get("token")) ? res.status(200).json({ ok: true }) : res.status(403).json({ error: "This link isn't valid anymore" });
  }

  if (action === "token") {
    if (!(await requireAccess(req, res, ["catering"]))) return;
    return res.status(200).json({ token: calculatorTokenFor() });
  }

  return res.status(400).json({ error: "Unknown action" });
}
