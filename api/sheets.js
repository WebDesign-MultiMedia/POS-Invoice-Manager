// Vercel serverless function: the only path between the app and SheetDB.
// The SheetDB id and Basic Auth credentials live in server env vars
// (SHEETDB_ID, SHEETDB_USER, SHEETDB_PASS) and never reach the browser.
//
// Deliberately NOT a generic proxy: the browser can't pick the SheetDB path
// or HTTP method, only one of the named actions below. Updates and deletes
// aren't exposed at all.
//   GET  ?action=orders
//   GET  ?action=order&id=714
//   GET  ?action=cardPayments
//   GET  ?action=cardPaymentsFor&invoiceId=714
//   POST { action: "createOrder", data }
//   POST { action: "recordCardPayment", data }

const READ_ACTIONS = {
  orders: () => "",
  order: (q) => `/search?Id=${encodeURIComponent(requireParam(q, "id"))}`,
  cardPayments: () => "?sheet=CardPayments",
  cardPaymentsFor: (q) =>
    `/search?InvoiceId=${encodeURIComponent(requireParam(q, "invoiceId"))}&sheet=CardPayments`,
};

const WRITE_ACTIONS = {
  createOrder: "",
  recordCardPayment: "?sheet=CardPayments",
};

class BadRequest extends Error {}

function requireParam(params, name) {
  const value = (params.get(name) || "").trim();
  if (!value || value.length > 64) throw new BadRequest(`Missing or invalid ${name}`);
  return value;
}

function sheetdbHeaders() {
  const headers = { "Content-Type": "application/json" };
  // Sent once Basic Auth is switched on in SheetDB's API settings; until
  // then the id alone works, so this can deploy before that toggle.
  if (process.env.SHEETDB_USER && process.env.SHEETDB_PASS) {
    const creds = Buffer.from(`${process.env.SHEETDB_USER}:${process.env.SHEETDB_PASS}`).toString("base64");
    headers.Authorization = `Basic ${creds}`;
  }
  return headers;
}

export default async function handler(req, res) {
  const sheetId = process.env.SHEETDB_ID;
  if (!sheetId) {
    console.error("sheets: SHEETDB_ID is not set");
    return res.status(500).json({ error: "Server is not configured" });
  }
  const base = `https://sheetdb.io/api/v1/${encodeURIComponent(sheetId)}`;

  try {
    let path;
    let init;

    if (req.method === "GET") {
      const params = new URL(req.url, "http://localhost").searchParams;
      const build = READ_ACTIONS[params.get("action")];
      if (!build) throw new BadRequest("Unknown action");
      path = build(params);
      init = { method: "GET", headers: sheetdbHeaders() };
    } else if (req.method === "POST") {
      const { action, data } = req.body || {};
      if (!Object.hasOwn(WRITE_ACTIONS, action)) throw new BadRequest("Unknown action");
      if (!data || typeof data !== "object") throw new BadRequest("Missing data");
      path = WRITE_ACTIONS[action];
      init = { method: "POST", headers: sheetdbHeaders(), body: JSON.stringify(data) };
    } else {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const response = await fetch(`${base}${path}`, init);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("sheets: SheetDB responded", response.status, payload);
      return res.status(502).json({ error: "Sheet request failed" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    console.error("sheets error:", err);
    return res.status(500).json({ error: "Sheet request failed" });
  }
}
