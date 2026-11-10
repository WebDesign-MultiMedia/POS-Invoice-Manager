import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Employee logins (phone + PIN, saved in the sheet's Employees tab) may use
// only Event Sales.
// Every other endpoint must refuse them, even though they're logged in.
vi.mock("stripe", () => ({
  default: vi.fn(function Stripe() {
    return {
      paymentMethods: { retrieve: vi.fn(async () => ({ card: { funding: "debit", brand: "visa", last4: "4242" } })) },
      paymentIntents: {
        create: vi.fn(async (p) => ({ id: "pi_1", client_secret: "s", status: "succeeded", amount: p.amount })),
        retrieve: vi.fn(async () => ({ latest_charge: { receipt_url: "https://pay.stripe.com/receipts/x" } })),
      },
    };
  }),
}));
vi.mock("twilio", () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }));

const { hashPassword, setSessionCookie, readSession, readSessionInfo, checkEmployeeCredentials, checkCredentials } = await import(
  "../api/_lib/auth.js"
);
const auth = (await import("../api/auth.js")).default;
const sheets = (await import("../api/sheets.js")).default;
const createPaymentIntent = (await import("../api/create-payment-intent.js")).default;
const receiptUrl = (await import("../api/receipt-url.js")).default;
const sendBroadcast = (await import("../api/send-broadcast.js")).default;
const sheetLink = (await import("../api/sheet-link.js")).default;
const quotes = (await import("../api/quotes.js")).default;
const calculatorLink = (await import("../api/calculator-link.js")).default;
const employeesApi = (await import("../api/employees.js")).default;
const { clearEmployeeCache } = await import("../api/_lib/employees.js");

// Throwaway test values only.
const PIN = "4829";
const EMPLOYEE_PHONE = "3475550123";
const fetchMock = vi.fn();
const PIN_HASH = hashPassword(PIN);
let employeeRows;

// SheetDB stand-in: the Employees tab answers from employeeRows; every
// other call answers [].
function sheetFetch(url, init = {}) {
  const u = String(url);
  const json = (payload) => ({ ok: true, status: 200, json: async () => payload });
  if (u.includes("sheet=Employees")) {
    if ((init.method || "GET") === "GET") return json(employeeRows);
    if (init.method === "POST") {
      employeeRows.push(...JSON.parse(init.body).data);
      return json({ created: 1 });
    }
    const phone = decodeURIComponent(u.match(/\/Phone\/([^?]+)/)?.[1] || "");
    const row = employeeRows.find((r) => String(r.Phone) === phone);
    if (!row) return { ok: false, status: 404, json: async () => ({}) };
    if (init.method === "PATCH") {
      Object.assign(row, JSON.parse(init.body).data);
      return json({ updated: 1 });
    }
    employeeRows = employeeRows.filter((r) => r !== row);
    return json({ deleted: 1 });
  }
  // Any one order looked up by Id was taken by Carlos.
  const id = u.match(/\/search\?Id=([^&]+)/)?.[1];
  if (id && (init.method || "GET") === "GET") return json([{ Id: decodeURIComponent(id), TakenBy: "Carlos" }]);
  return json([]);
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": hashPassword("a long staff test password") }));
  vi.stubEnv("SHEETDB_ID", "test-sheet");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("GOOGLE_SHEET_URL", "https://docs.google.com/spreadsheets/d/test/edit");
  employeeRows = [{ Phone: "3475550123", Name: "Carlos", PinHash: PIN_HASH, Active: "Yes" }];
  clearEmployeeCache();
  fetchMock.mockReset().mockImplementation(async (url, init) => sheetFetch(url, init));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function employeeCookie() {
  const res = mockRes();
  setSessionCookie(res, EMPLOYEE_PHONE, "event");
  return cookieFrom(res);
}

async function call(handler, opts) {
  const res = mockRes();
  await handler(mockReq({ cookie: employeeCookie(), ...opts }), res);
  return res;
}

describe("employee login", () => {
  it("logs in with phone + PIN and gets the event role", async () => {
    const res = mockRes();
    await auth(mockReq({ method: "POST", body: { action: "login", identifier: "347-555-0123", password: PIN }, headers: { "x-forwarded-for": "10.0.0.1" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ user: EMPLOYEE_PHONE, role: "event", name: "Carlos", access: ["event"] });
    const info = await readSessionInfo(mockReq({ cookie: cookieFrom(res) }));
    expect(info).toEqual({ login: EMPLOYEE_PHONE, role: "event", name: "Carlos", access: ["event"] });
  });

  it("an employee session is not a staff session", () => {
    expect(readSession(mockReq({ cookie: employeeCookie() }))).toBeNull();
  });

  it("a PIN never works as a staff password, nor a staff password as a PIN", async () => {
    expect(checkCredentials(EMPLOYEE_PHONE, PIN)).toBeNull();
    expect(await checkEmployeeCredentials("staff@example.com", "a long staff test password")).toBeNull();
    expect(await checkEmployeeCredentials(EMPLOYEE_PHONE, "0000")).toBeNull();
  });

  it("deleting or turning off the employee in the sheet ends their session", async () => {
    const cookie = employeeCookie();
    employeeRows[0].Active = "No";
    clearEmployeeCache();
    expect(await readSessionInfo(mockReq({ cookie }))).toBeNull();
    employeeRows = [];
    clearEmployeeCache();
    expect(await readSessionInfo(mockReq({ cookie }))).toBeNull();
  });

  it("can't log in if the Employees tab can't be read", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await checkEmployeeCredentials(EMPLOYEE_PHONE, PIN)).toBeNull();
  });

  it("a forged role in the cookie doesn't work", async () => {
    const cookie = employeeCookie();
    const [name, value] = cookie.split("=");
    const [payload, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), role: "staff" })).toString("base64url");
    expect(await readSessionInfo(mockReq({ cookie: `${name}=${forged}.${sig}` }))).toBeNull();
  });

  it("locks a phone number after repeated wrong PINs, from any device", async () => {
    for (let i = 0; i < 8; i++) {
      const res = mockRes();
      await auth(mockReq({ method: "POST", body: { action: "login", identifier: "3475550123", password: "1111" }, headers: { "x-forwarded-for": `10.1.0.${i}` } }), res);
      expect(res.statusCode).toBe(401);
    }
    const res = mockRes();
    await auth(mockReq({ method: "POST", body: { action: "login", identifier: "3475550123", password: PIN }, headers: { "x-forwarded-for": "10.2.0.1" } }), res);
    expect(res.statusCode).toBe(429);
  });
});

describe("what an employee can use", () => {
  it("reads and records event sales", async () => {
    expect((await call(sheets, { url: "/api/sheets?action=eventSales" })).statusCode).toBe(200);
    expect((await call(sheets, { method: "POST", url: "/api/sheets", body: { action: "recordEventSale", data: { SaleId: "EV-261109-120000" } } })).statusCode).toBe(200);
  });

  it("logs the card payment of an event card sale, but no other card payment", async () => {
    const ok = await call(sheets, { method: "POST", url: "/api/sheets", body: { action: "recordCardPayment", data: { InvoiceId: "EV-261109-120000" } } });
    expect(ok.statusCode).toBe(200);
    for (const InvoiceId of ["714", "CP-261109-120000", ""]) {
      const res = await call(sheets, { method: "POST", url: "/api/sheets", body: { action: "recordCardPayment", data: { InvoiceId } } });
      expect(res.statusCode).toBe(403);
    }
  });

  it("charges a card only for an event sale", async () => {
    const body = { paymentMethodId: "pm_1", baseAmountCents: 500 };
    expect((await call(createPaymentIntent, { method: "POST", body: { ...body, invoiceId: "EV-261109-120000" } })).statusCode).toBe(200);
    expect((await call(createPaymentIntent, { method: "POST", body: { ...body, invoiceId: "714" } })).statusCode).toBe(403);
  });

  it("opens a receipt", async () => {
    const res = await call(receiptUrl, { url: "/api/receipt-url?pi=pi_123" });
    expect(res.statusCode).toBe(302);
  });
});

describe("what an employee can't use", () => {
  it.each([
    ["orders", { url: "/api/sheets?action=orders" }],
    ["one order", { url: "/api/sheets?action=order&id=1" }],
    ["card payments", { url: "/api/sheets?action=cardPayments" }],
    ["share token", { url: "/api/sheets?action=shareToken&id=1" }],
    ["create order", { method: "POST", url: "/api/sheets", body: { action: "createOrder", data: { Name: "x" } } }],
    ["edit an event sale", { method: "POST", url: "/api/sheets", body: { action: "updateEventSale", id: "EV-261109-120000", data: { Name: "x" } } }],
    ["delete an event sale", { method: "POST", url: "/api/sheets", body: { action: "deleteEventSale", id: "EV-261109-120000" } }],
    ["delete an order", { method: "POST", url: "/api/sheets", body: { action: "deleteOrder", id: "1" } }],
    ["delete a card payment", { method: "POST", url: "/api/sheets", body: { action: "deleteCardPayment", id: "pi_1" } }],
  ])("sheets: %s", async (_name, opts) => {
    const res = await call(sheets, opts);
    expect(res.statusCode).toBe(403);
    // Only the Employees tab was read (to check the login), nothing else.
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("sheet=Employees"))).toBe(true);
  });

  it.each([
    ["text customers", sendBroadcast, { method: "POST", body: { messageText: "hi" } }],
    ["catering quotes", quotes, { url: "/api/quotes?action=list" }],
    ["calculator link", calculatorLink, { url: "/api/calculator-link?action=token" }],
    ["manage employees", employeesApi, { url: "/api/employees?action=list" }],
  ])("%s", async (_name, handler, opts) => {
    const res = await call(handler, opts);
    expect(res.statusCode).toBe(403);
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("sheet=Employees"))).toBe(true);
  });

  it("the spreadsheet link", async () => {
    const res = await call(sheetLink, { url: "/api/sheet-link" });
    expect(res.statusCode).toBe(401);
    expect(res.headers.location).toBeUndefined();
  });
});

describe("managing employees (staff)", () => {
  function staffCookie() {
    const res = mockRes();
    setSessionCookie(res, "staff@example.com");
    return cookieFrom(res);
  }
  const staffCall = async (opts) => {
    const res = mockRes();
    await employeesApi(mockReq({ cookie: staffCookie(), method: opts.body ? "POST" : "GET", url: "/api/employees?action=list", ...opts }), res);
    return res;
  };

  it("needs a login", async () => {
    const res = mockRes();
    await employeesApi(mockReq({ url: "/api/employees?action=list" }), res);
    expect(res.statusCode).toBe(401);
  });

  it("lists employees without their PIN hashes", async () => {
    const res = await staffCall({});
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ Phone: "3475550123", Name: "Carlos", Active: "Yes", Access: ["event"], AddedBy: "", AddedAt: "", UpdatedAt: "" }]);
  });

  it("adds an employee with a hashed PIN, who can then log in", async () => {
    const res = await staffCall({ body: { action: "add", phone: "(718) 555-0199", name: "Ana", pin: "5821" } });
    expect(res.statusCode).toBe(200);
    const row = employeeRows.find((r) => r.Phone === "7185550199");
    expect(row).toMatchObject({ Name: "Ana", Active: "Yes", AddedBy: "staff@example.com" });
    expect(row.PinHash).not.toContain("5821");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('"5821"');
    expect(await checkEmployeeCredentials("7185550199", "5821")).toBe("7185550199");
  });

  it("refuses weak PINs, bad phones, missing names and duplicates", async () => {
    for (const pin of ["1234", "1111", "1999", "12", "abcd"]) {
      expect((await staffCall({ body: { action: "add", phone: "7185550199", name: "Ana", pin } })).statusCode).toBe(400);
    }
    expect((await staffCall({ body: { action: "add", phone: "555", name: "Ana", pin: "5821" } })).statusCode).toBe(400);
    expect((await staffCall({ body: { action: "add", phone: "7185550199", name: " ", pin: "5821" } })).statusCode).toBe(400);
    expect((await staffCall({ body: { action: "add", phone: "347-555-0123", name: "Dup", pin: "5821" } })).statusCode).toBe(409);
  });

  it("resets a PIN: the old one stops working", async () => {
    expect((await staffCall({ body: { action: "setPin", phone: "3475550123", pin: "7395" } })).statusCode).toBe(200);
    expect(await checkEmployeeCredentials(EMPLOYEE_PHONE, PIN)).toBeNull();
    expect(await checkEmployeeCredentials(EMPLOYEE_PHONE, "7395")).toBe(EMPLOYEE_PHONE);
  });

  it("turning off blocks the login; turning on allows it again", async () => {
    await staffCall({ body: { action: "setActive", phone: "3475550123", active: false } });
    expect(await checkEmployeeCredentials(EMPLOYEE_PHONE, PIN)).toBeNull();
    await staffCall({ body: { action: "setActive", phone: "3475550123", active: true } });
    expect(await checkEmployeeCredentials(EMPLOYEE_PHONE, PIN)).toBe(EMPLOYEE_PHONE);
  });

  it("deletes an employee", async () => {
    expect((await staffCall({ body: { action: "delete", phone: "3475550123" } })).statusCode).toBe(200);
    expect(employeeRows).toHaveLength(0);
    expect((await staffCall({ body: { action: "delete", phone: "3475550123" } })).statusCode).toBe(404);
  });
});

describe("who rang up a sale (SoldBy)", () => {
  const bodyOf = (call) => JSON.parse(call[1].body);
  const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

  it("stamps an employee's sales with their name from the Employees tab, ignoring what the phone sent", async () => {
    await call(sheets, { method: "POST", url: "/api/sheets", body: { action: "recordEventSale", data: { SaleId: "EV-261110-120000", SoldBy: "The Boss" } } });
    await call(sheets, { method: "POST", url: "/api/sheets", body: { action: "recordCardPayment", data: { InvoiceId: "EV-261110-120000", SoldBy: "The Boss" } } });
    expect(writes().map((c) => bodyOf(c).SoldBy)).toEqual(["Carlos", "Carlos"]);
  });

  it("stamps a staff member's sales with their login", async () => {
    const res = mockRes();
    setSessionCookie(res, "staff@example.com");
    await sheets(mockReq({ cookie: cookieFrom(res), method: "POST", url: "/api/sheets", body: { action: "recordEventSale", data: { SaleId: "EV-261110-120001" } } }), mockRes());
    expect(bodyOf(writes()[0]).SoldBy).toBe("staff@example.com");
  });

  it("the login answer carries the employee's name", async () => {
    const res = mockRes();
    await auth(mockReq({ cookie: employeeCookie() }), res);
    expect(res.body).toEqual({ user: EMPLOYEE_PHONE, role: "event", name: "Carlos", access: ["event"] });
  });

  it("SoldBy can't be changed by editing a sale", async () => {
    const res = mockRes();
    setSessionCookie(res, "staff@example.com");
    const out = mockRes();
    await sheets(mockReq({ cookie: cookieFrom(res), method: "POST", url: "/api/sheets", body: { action: "updateCardPayment", id: "pi_1", data: { SoldBy: "Someone else" } } }), out);
    expect(out.statusCode).toBe(400);
  });
});

describe("section permissions (Team page)", () => {
  const give = (access) => {
    employeeRows[0].Access = access;
    clearEmployeeCache();
  };
  const post = (handler, body, url = "/api/sheets") => call(handler, { method: "POST", url, body });
  const get = (handler, url) => call(handler, { url });
  const staffPost = async (body) => {
    const res = mockRes();
    setSessionCookie(res, "staff@example.com");
    const out = mockRes();
    await employeesApi(mockReq({ cookie: cookieFrom(res), method: "POST", url: "/api/employees", body }), out);
    return out;
  };

  it("an empty Access cell means Event Sales only (as before)", async () => {
    give("");
    expect((await get(sheets, "/api/sheets?action=eventSales")).statusCode).toBe(200);
    expect((await get(sheets, "/api/sheets?action=orders")).statusCode).toBe(403);
  });

  it("every box unticked means nothing at all", async () => {
    give("none");
    expect((await get(sheets, "/api/sheets?action=eventSales")).statusCode).toBe(403);
    const res = mockRes();
    await auth(mockReq({ cookie: employeeCookie() }), res);
    expect(res.body.access).toEqual([]);
  });

  it("Order form: take orders (stamped TakenBy) and read them, but not edit or delete without manage", async () => {
    give("orders");
    expect((await get(sheets, "/api/sheets?action=orders")).statusCode).toBe(200);
    expect((await get(sheets, "/api/sheets?action=shareToken&id=714")).statusCode).toBe(200);
    expect((await post(sheets, { action: "createOrder", data: { Name: "Pat", TakenBy: "Someone else" } })).statusCode).toBe(200);
    const order = fetchMock.mock.calls.find(([url, init]) => init?.method === "POST" && !String(url).includes("Employees"));
    expect(JSON.parse(order[1].body).TakenBy).toBe("Carlos");
    expect((await post(sheets, { action: "deleteOrder", id: "714" })).statusCode).toBe(403);
    expect((await get(sheets, "/api/sheets?action=eventSales")).statusCode).toBe(403);
  });

  it("Can edit & delete opens edits only in the ticked sections", async () => {
    give("orders,manage");
    fetchMock.mockImplementation(async (url, init = {}) =>
      String(url).includes("Employees") || (init.method || "GET") === "GET" ? sheetFetch(url, init) : { ok: true, status: 200, json: async () => ({ deleted: 1, updated: 1 }) }
    );
    expect((await post(sheets, { action: "deleteOrder", id: "714" })).statusCode).toBe(200);
    expect((await post(sheets, { action: "deleteCardPayment", id: "pi_1" })).statusCode).toBe(403);
    expect((await post(sheets, { action: "deleteEventSale", id: "EV-261110-120000" })).statusCode).toBe(403);
  });

  it("Pay with Card: any card charge, card payment list and receipts", async () => {
    give("pay");
    const body = { paymentMethodId: "pm_1", baseAmountCents: 500 };
    expect((await post(createPaymentIntent, { ...body, invoiceId: "714" }, "/api/create-payment-intent")).statusCode).toBe(200);
    expect((await get(sheets, "/api/sheets?action=cardPayments")).statusCode).toBe(200);
    expect((await post(sheets, { action: "recordCardPayment", data: { InvoiceId: "714" } })).statusCode).toBe(200);
    expect((await get(receiptUrl, "/api/receipt-url?pi=pi_123")).statusCode).toBe(302);
    expect((await post(sheets, { action: "createOrder", data: { Name: "x" } })).statusCode).toBe(403);
  });

  it("Search: orders, card payments and share links, but no charging", async () => {
    give("search");
    expect((await get(sheets, "/api/sheets?action=orders")).statusCode).toBe(200);
    expect((await get(sheets, "/api/sheets?action=cardPayments")).statusCode).toBe(200);
    expect((await get(sheets, "/api/sheets?action=shareToken&id=714")).statusCode).toBe(200);
    expect((await post(createPaymentIntent, { paymentMethodId: "pm_1", baseAmountCents: 500, invoiceId: "714" }, "/api/create-payment-intent")).statusCode).toBe(403);
  });

  it("Catering: quotes and the share link; deleting a quote needs manage", async () => {
    give("catering");
    expect((await get(quotes, "/api/quotes?action=list")).statusCode).toBe(200);
    expect((await get(calculatorLink, "/api/calculator-link?action=token")).statusCode).toBe(200);
    expect((await post(quotes, { action: "delete", id: "q_1" }, "/api/quotes")).statusCode).toBe(403);
  });

  it("Text customers: gets past the login check only when ticked", async () => {
    give("event");
    expect((await post(sendBroadcast, { countOnly: true }, "/api/send-broadcast")).statusCode).toBe(403);
    give("broadcast");
    expect([401, 403]).not.toContain((await post(sendBroadcast, { countOnly: true }, "/api/send-broadcast")).statusCode);
  });

  it("the Team page and the spreadsheet stay owner-only, whatever is ticked", async () => {
    give("event,orders,search,pay,catering,broadcast,manage");
    expect((await get(employeesApi, "/api/employees?action=list")).statusCode).toBe(403);
    expect((await post(employeesApi, { action: "setAccess", phone: EMPLOYEE_PHONE, access: ["manage"] }, "/api/employees")).statusCode).toBe(403);
    expect((await get(sheetLink, "/api/sheet-link")).statusCode).toBe(401);
  });

  it("staff save the ticked boxes; unknown keys are refused", async () => {
    expect((await staffPost({ action: "setAccess", phone: EMPLOYEE_PHONE, access: ["event", "pay", "manage"] })).statusCode).toBe(200);
    expect(employeeRows[0].Access).toBe("event,pay,manage");
    expect((await staffPost({ action: "setAccess", phone: EMPLOYEE_PHONE, access: [] })).statusCode).toBe(200);
    expect(employeeRows[0].Access).toBe("none");
    expect((await staffPost({ action: "setAccess", phone: EMPLOYEE_PHONE, access: ["staff"] })).statusCode).toBe(400);
    expect((await staffPost({ action: "setAccess", phone: EMPLOYEE_PHONE, access: "event" })).statusCode).toBe(400);
  });

  it("a change applies to a logged-in employee without logging out", async () => {
    const cookie = employeeCookie();
    give("event");
    expect((await readSessionInfo(mockReq({ cookie }))).access).toEqual(["event"]);
    await staffPost({ action: "setAccess", phone: EMPLOYEE_PHONE, access: ["event", "orders"] });
    expect((await readSessionInfo(mockReq({ cookie }))).access).toEqual(["event", "orders"]);
  });
});

describe("employees see only their own orders and sales", () => {
  const ORDERS = [
    { Id: "1", Name: "A", TakenBy: "Carlos" },
    { Id: "2", Name: "B", TakenBy: "Ana" },
    { Id: "3", Name: "C", TakenBy: "staff@example.com" },
    { Id: "4", Name: "D" },
  ];
  const CARD = [
    { PaymentIntentId: "pi_a", InvoiceId: "1", SoldBy: "staff@example.com" },
    { PaymentIntentId: "pi_b", InvoiceId: "2", SoldBy: "Ana" },
    { PaymentIntentId: "pi_c", InvoiceId: "EV-261110-120000", SoldBy: "carlos" },
  ];
  const SALES = [
    { SaleId: "EV-261110-120000", SoldBy: "Carlos" },
    { SaleId: "EV-261110-120001", SoldBy: "Ana" },
  ];

  beforeEach(() => {
    employeeRows[0].Access = "event,orders,search,pay,manage";
    clearEmployeeCache();
    fetchMock.mockImplementation(async (url, init = {}) => {
      const u = String(url);
      if (u.includes("sheet=Employees")) return sheetFetch(url, init);
      const json = (payload) => ({ ok: true, status: 200, json: async () => payload });
      if (init.method === "DELETE" || init.method === "PATCH") return json({ deleted: 1, updated: 1 });
      const id = u.match(/search\?Id=([^&]+)/)?.[1];
      if (id) return json(ORDERS.filter((o) => o.Id === decodeURIComponent(id)));
      const pi = u.match(/PaymentIntentId=([^&]+)/)?.[1];
      if (pi) return json(CARD.filter((c) => c.PaymentIntentId === pi));
      const inv = u.match(/InvoiceId=([^&]+)/)?.[1];
      if (inv) return json(CARD.filter((c) => c.InvoiceId === decodeURIComponent(inv)));
      const sale = u.match(/SaleId=([^&]+)/)?.[1];
      if (sale) return json(SALES.filter((r) => r.SaleId === sale));
      if (u.includes("sheet=CardPayments")) return json(CARD);
      if (u.includes("sheet=EventSales")) return json(SALES);
      return json(ORDERS);
    });
  });
  const get = (url) => call(sheets, { url });
  const post = (body) => call(sheets, { method: "POST", url: "/api/sheets", body });

  it("orders list: only the ones they took", async () => {
    expect((await get("/api/sheets?action=orders")).body.map((o) => o.Id)).toEqual(["1"]);
  });

  it("one order: someone else's comes back empty", async () => {
    expect((await get("/api/sheets?action=order&id=1")).body).toHaveLength(1);
    expect((await get("/api/sheets?action=order&id=2")).body).toEqual([]);
  });

  it("card payments and event sales: only the ones they rang up (name match ignores case)", async () => {
    expect((await get("/api/sheets?action=cardPayments")).body.map((c) => c.PaymentIntentId)).toEqual(["pi_c"]);
    expect((await get("/api/sheets?action=eventSales")).body.map((r) => r.SaleId)).toEqual(["EV-261110-120000"]);
  });

  it("an invoice they took shows every payment on it, even the owner's", async () => {
    expect((await get("/api/sheets?action=cardPaymentsFor&invoiceId=1")).body.map((c) => c.PaymentIntentId)).toEqual(["pi_a"]);
    expect((await get("/api/sheets?action=cardPaymentsFor&invoiceId=2")).body).toEqual([]);
  });

  it("share links only for their own orders", async () => {
    expect((await get("/api/sheets?action=shareToken&id=1")).statusCode).toBe(200);
    expect((await get("/api/sheets?action=shareToken&id=2")).statusCode).toBe(404);
  });

  it("can edit or delete only what they took, even with Can edit & delete", async () => {
    expect((await post({ action: "deleteOrder", id: "1" })).statusCode).toBe(200);
    expect((await post({ action: "deleteOrder", id: "2" })).statusCode).toBe(403);
    expect((await post({ action: "deleteOrder", id: "4" })).statusCode).toBe(403);
    expect((await post({ action: "updateCardPayment", id: "pi_b", data: { Name: "x" } })).statusCode).toBe(403);
    expect((await post({ action: "deleteEventSale", id: "EV-261110-120001" })).statusCode).toBe(403);
    expect((await post({ action: "deleteEventSale", id: "EV-261110-120000" })).statusCode).toBe(200);
  });

  it("staff still see everything", async () => {
    const res = mockRes();
    setSessionCookie(res, "staff@example.com");
    const out = mockRes();
    await sheets(mockReq({ cookie: cookieFrom(res), url: "/api/sheets?action=orders" }), out);
    expect(out.body.map((o) => o.Id)).toEqual(["1", "2", "3", "4"]);
  });

  it("two employees can't share a name", async () => {
    const res = mockRes();
    setSessionCookie(res, "staff@example.com");
    const out = mockRes();
    await employeesApi(mockReq({ cookie: cookieFrom(res), method: "POST", url: "/api/employees", body: { action: "add", phone: "7185550199", name: "carlos", pin: "5821" } }), out);
    expect(out.statusCode).toBe(409);
  });
});
