import { requireStaff } from "./_lib/auth.js";
import { addEmployee, deleteEmployee, listEmployees, phoneKey, pinProblem, updateEmployee } from "./_lib/employees.js";
import { hashPassword } from "./_lib/passwords.js";

// Vercel serverless function: staff manage employee logins (phone + 4-digit
// PIN, Event Sales only), saved in the order sheet's "Employees" tab.
//   GET  ?action=list                             → [{ Phone, Name, Active, AddedBy, AddedAt, UpdatedAt }]
//   POST { action: "add", phone, name, pin }
//   POST { action: "setPin", phone, pin }
//   POST { action: "setActive", phone, active }   (true / false)
//   POST { action: "delete", phone }
// Staff only. PIN hashes never leave the server, and PINs are never stored.

class BadRequest extends Error {}

function requirePhone(value) {
  const phone = phoneKey(value);
  if (!phone) throw new BadRequest("Enter a 10-digit phone number.");
  return phone;
}

function requirePin(value) {
  const problem = pinProblem(value);
  if (problem) throw new BadRequest(problem);
  return String(value);
}

const publicRow = ({ Phone, Name, Active, AddedBy, AddedAt, UpdatedAt }) => ({
  Phone,
  Name: Name || "",
  Active: String(Active ?? "").trim().toLowerCase() === "no" ? "No" : "Yes",
  AddedBy: AddedBy || "",
  AddedAt: AddedAt || "",
  UpdatedAt: UpdatedAt || "",
});

// SheetDB answers 404 for an unmatched update/delete, or 200 with 0.
function changed(result, verb) {
  if (result.status === 404) return false;
  if (!result.ok) throw new Error(`Sheet ${verb} failed (${result.status})`);
  return Number(verb === "update" ? result.payload?.updated : result.payload?.deleted) > 0;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const staff = requireStaff(req, res);
  if (!staff) return;

  try {
    if (req.method === "GET") {
      const action = new URL(req.url, "http://localhost").searchParams.get("action");
      if (action !== "list") throw new BadRequest("Unknown action");
      const rows = await listEmployees({ fresh: true });
      return res.status(200).json(rows.map(publicRow));
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    const phone = requirePhone(body.phone);

    if (body.action === "add") {
      const name = String(body.name ?? "").trim().slice(0, 80);
      if (!name) throw new BadRequest("Enter the employee's name.");
      const pin = requirePin(body.pin);
      const existing = await listEmployees({ fresh: true });
      if (existing.some((r) => r.Phone === phone)) {
        return res.status(409).json({ error: "An employee with that phone number already exists. Reset their PIN instead." });
      }
      const result = await addEmployee({ phone, name, pin, addedBy: staff });
      if (!result.ok) throw new Error(`Sheet add failed (${result.status})`);
      return res.status(200).json({ ok: true });
    }

    if (body.action === "setPin") {
      const pin = requirePin(body.pin);
      if (!changed(await updateEmployee(phone, { PinHash: hashPassword(pin) }), "update")) return res.status(404).json({ error: "Employee not found" });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "setActive") {
      if (typeof body.active !== "boolean") throw new BadRequest("Missing active");
      if (!changed(await updateEmployee(phone, { Active: body.active ? "Yes" : "No" }), "update")) return res.status(404).json({ error: "Employee not found" });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "delete") {
      if (!changed(await deleteEmployee(phone), "delete")) return res.status(404).json({ error: "Employee not found" });
      return res.status(200).json({ ok: true });
    }

    throw new BadRequest("Unknown action");
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    console.error("employees error:", err);
    return res.status(502).json({ error: "Couldn't reach the Employees tab. Check that it exists in the sheet." });
  }
}
