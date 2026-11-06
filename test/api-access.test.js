import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes } from "./helpers.js";

// Every /api route must refuse visitors without a staff session. The only
// public paths are logging in and a customer's signed invoice link.
// Third-party SDKs and fetch are mocked so nothing leaves the test.
vi.mock("stripe", () => ({
  default: vi.fn(function Stripe() {
    return { paymentMethods: { retrieve: vi.fn() }, paymentIntents: { create: vi.fn(), retrieve: vi.fn() } };
  }),
}));
vi.mock("twilio", () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }));

const sheets = (await import("../api/sheets.js")).default;
const createPaymentIntent = (await import("../api/create-payment-intent.js")).default;
const receiptUrl = (await import("../api/receipt-url.js")).default;
const sendBroadcast = (await import("../api/send-broadcast.js")).default;
const sheetLink = (await import("../api/sheet-link.js")).default;
const auth = (await import("../api/auth.js")).default;
const { shareTokenFor } = await import("../api/_lib/auth.js");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": "00:00" }));
  vi.stubEnv("SHEETDB_ID", "test-sheet");
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

async function call(handler, reqOptions) {
  const res = mockRes();
  await handler(mockReq(reqOptions), res);
  return res;
}

describe("staff-only routes return 401 without a session", () => {
  it.each([
    ["GET orders", sheets, { url: "/api/sheets?action=orders" }],
    ["GET one order", sheets, { url: "/api/sheets?action=order&id=1" }],
    ["GET card payments", sheets, { url: "/api/sheets?action=cardPayments" }],
    ["GET share token", sheets, { url: "/api/sheets?action=shareToken&id=1" }],
    ["POST create order", sheets, { method: "POST", url: "/api/sheets", body: { action: "createOrder", data: { Name: "x" } } }],
    ["POST card payment log", sheets, { method: "POST", url: "/api/sheets", body: { action: "recordCardPayment", data: {} } }],
    ["POST charge a card", createPaymentIntent, { method: "POST", body: { paymentMethodId: "pm_1", baseAmountCents: 100 } }],
    ["GET receipt", receiptUrl, { url: "/api/receipt-url?pi=pi_123" }],
    ["POST broadcast", sendBroadcast, { method: "POST", body: { messageText: "hi" } }],
    ["GET spreadsheet link", sheetLink, { url: "/api/sheet-link" }],
    ["GET current user", auth, { url: "/api/auth" }],
  ])("%s", async (_name, handler, req) => {
    const res = await call(handler, req);
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a forged session cookie doesn't help", async () => {
    const res = await call(sheets, { url: "/api/sheets?action=orders", cookie: "pim_session=eyJzdWIiOiJ4In0.fake" });
    expect(res.statusCode).toBe(401);
  });

  it("the spreadsheet link never redirects without a session", async () => {
    const res = await call(sheetLink, { url: "/api/sheet-link" });
    expect(res.headers.location).toBeUndefined();
  });
});

describe("public routes", () => {
  it("a shared invoice needs a valid token for that exact invoice", async () => {
    expect((await call(sheets, { url: "/api/sheets?action=sharedInvoice&id=714&token=bad" })).statusCode).toBe(404);
    const wrongInvoice = shareTokenFor("715");
    expect((await call(sheets, { url: `/api/sheets?action=sharedInvoice&id=714&token=${wrongInvoice}` })).statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a valid share link returns only that invoice", async () => {
    fetchMock.mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).includes("CardPayments") ? [] : [{ Id: "714", Name: "Test" }, { Id: "7140", Name: "Other" }]),
    }));
    const res = await call(sheets, { url: `/api/sheets?action=sharedInvoice&id=714&token=${shareTokenFor("714")}` });
    expect(res.statusCode).toBe(200);
    expect(res.body.invoice).toEqual({ Id: "714", Name: "Test" });
  });

  it("login answers without a session (and rejects bad credentials)", async () => {
    const res = await call(auth, { method: "POST", body: { action: "login", identifier: "staff@example.com", password: "nope" } });
    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
