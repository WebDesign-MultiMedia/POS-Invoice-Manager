import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Employee logins (phone + PIN, EMPLOYEE_ACCOUNTS) may use only Event Sales.
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

// Throwaway test values only.
const PIN = "482915";
const EMPLOYEE_PHONE = "3475550123";
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": hashPassword("a long staff test password") }));
  vi.stubEnv("EMPLOYEE_ACCOUNTS", JSON.stringify({ "(347) 555-0123": hashPassword(PIN) }));
  vi.stubEnv("SHEETDB_ID", "test-sheet");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("GOOGLE_SHEET_URL", "https://docs.google.com/spreadsheets/d/test/edit");
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
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
    expect(res.body).toEqual({ user: EMPLOYEE_PHONE, role: "event" });
    const info = readSessionInfo(mockReq({ cookie: cookieFrom(res) }));
    expect(info).toEqual({ login: EMPLOYEE_PHONE, role: "event" });
  });

  it("an employee session is not a staff session", () => {
    expect(readSession(mockReq({ cookie: employeeCookie() }))).toBeNull();
  });

  it("a PIN never works as a staff password, nor a staff password as a PIN", () => {
    expect(checkCredentials(EMPLOYEE_PHONE, PIN)).toBeNull();
    expect(checkEmployeeCredentials("staff@example.com", "a long staff test password")).toBeNull();
    expect(checkEmployeeCredentials(EMPLOYEE_PHONE, "000000")).toBeNull();
  });

  it("removing the employee ends their session", () => {
    const cookie = employeeCookie();
    vi.stubEnv("EMPLOYEE_ACCOUNTS", "{}");
    expect(readSessionInfo(mockReq({ cookie }))).toBeNull();
  });

  it("a forged role in the cookie doesn't work", () => {
    const cookie = employeeCookie();
    const [name, value] = cookie.split("=");
    const [payload, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url")), role: "staff" })).toString("base64url");
    expect(readSessionInfo(mockReq({ cookie: `${name}=${forged}.${sig}` }))).toBeNull();
  });

  it("locks a phone number after repeated wrong PINs, from any device", async () => {
    for (let i = 0; i < 8; i++) {
      const res = mockRes();
      await auth(mockReq({ method: "POST", body: { action: "login", identifier: "3475550123", password: "111111" }, headers: { "x-forwarded-for": `10.1.0.${i}` } }), res);
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["text customers", sendBroadcast, { method: "POST", body: { messageText: "hi" } }],
    ["catering quotes", quotes, { url: "/api/quotes?action=list" }],
    ["calculator link", calculatorLink, { url: "/api/calculator-link?action=token" }],
  ])("%s", async (_name, handler, opts) => {
    const res = await call(handler, opts);
    expect(res.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("the spreadsheet link", async () => {
    const res = await call(sheetLink, { url: "/api/sheet-link" });
    expect(res.statusCode).toBe(401);
    expect(res.headers.location).toBeUndefined();
  });
});
