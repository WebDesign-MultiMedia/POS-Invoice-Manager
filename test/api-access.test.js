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
const calculatorLink = (await import("../api/calculator-link.js")).default;
const { shareTokenFor, calculatorTokenFor, setSessionCookie } = await import("../api/_lib/auth.js");
const { cookieFrom } = await import("./helpers.js");

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
    ["GET event sales", sheets, { url: "/api/sheets?action=eventSales" }],
    ["POST event sale", sheets, { method: "POST", url: "/api/sheets", body: { action: "recordEventSale", data: {} } }],
    ["GET share token", sheets, { url: "/api/sheets?action=shareToken&id=1" }],
    ["POST create order", sheets, { method: "POST", url: "/api/sheets", body: { action: "createOrder", data: { Name: "x" } } }],
    ["POST update order", sheets, { method: "POST", url: "/api/sheets", body: { action: "updateOrder", id: "1", data: { Name: "x" } } }],
    ["POST delete order", sheets, { method: "POST", url: "/api/sheets", body: { action: "deleteOrder", id: "1" } }],
    ["POST update card payment", sheets, { method: "POST", url: "/api/sheets", body: { action: "updateCardPayment", id: "pi_1", data: { Name: "x" } } }],
    ["POST delete card payment", sheets, { method: "POST", url: "/api/sheets", body: { action: "deleteCardPayment", id: "pi_1" } }],
    ["POST update event sale", sheets, { method: "POST", url: "/api/sheets", body: { action: "updateEventSale", id: "EV-261109-120000", data: { Name: "x" } } }],
    ["POST delete event sale", sheets, { method: "POST", url: "/api/sheets", body: { action: "deleteEventSale", id: "EV-261109-120000" } }],
    ["POST card payment log", sheets, { method: "POST", url: "/api/sheets", body: { action: "recordCardPayment", data: {} } }],
    ["POST charge a card", createPaymentIntent, { method: "POST", body: { paymentMethodId: "pm_1", baseAmountCents: 100 } }],
    ["GET receipt", receiptUrl, { url: "/api/receipt-url?pi=pi_123" }],
    ["POST broadcast", sendBroadcast, { method: "POST", body: { messageText: "hi" } }],
    ["GET spreadsheet link", sheetLink, { url: "/api/sheet-link" }],
    ["GET current user", auth, { url: "/api/auth" }],
    ["GET calculator link token", calculatorLink, { url: "/api/calculator-link?action=token" }],
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
  it("the calculator link check accepts only the signed token", async () => {
    expect((await call(calculatorLink, { url: "/api/calculator-link?action=check&token=bad" })).statusCode).toBe(403);
    expect((await call(calculatorLink, { url: "/api/calculator-link?action=check" })).statusCode).toBe(403);
    const ok = await call(calculatorLink, { url: `/api/calculator-link?action=check&token=${calculatorTokenFor()}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toEqual({ ok: true });
  });

  it("changing CALCULATOR_LINK_VERSION turns off links already sent", async () => {
    const oldToken = calculatorTokenFor();
    vi.stubEnv("CALCULATOR_LINK_VERSION", "2");
    expect((await call(calculatorLink, { url: `/api/calculator-link?action=check&token=${oldToken}` })).statusCode).toBe(403);
    expect((await call(calculatorLink, { url: `/api/calculator-link?action=check&token=${calculatorTokenFor()}` })).statusCode).toBe(200);
  });

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

describe("editing and deleting an order (staff)", () => {
  function staffCookie() {
    const res = mockRes();
    setSessionCookie(res, "staff@example.com");
    return cookieFrom(res);
  }
  const post = (body) => call(sheets, { method: "POST", url: "/api/sheets", body, cookie: staffCookie() });

  it("updates only the order's own fields, on the row with that Id", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ updated: 1 }) });
    const res = await post({ action: "updateOrder", id: "714", data: { Name: "New", Cost: "20", Id: "999", Date: "01/01/2000", Evil: "x" } });
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sheetdb.io/api/v1/test-sheet/Id/714");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ data: { Name: "New", Cost: "20" } });
  });

  it("deletes the row with that Id", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: 1 }) });
    const res = await post({ action: "deleteOrder", id: "714" });
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sheetdb.io/api/v1/test-sheet/Id/714");
    expect(init.method).toBe("DELETE");
  });

  it("404s when no order has that Id", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: 0 }) });
    expect((await post({ action: "deleteOrder", id: "714" })).statusCode).toBe(404);
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ updated: 0 }) });
    expect((await post({ action: "updateOrder", id: "714", data: { Name: "x" } })).statusCode).toBe(404);
  });

  it.each(["*", "", "7 14", "CP-261109-120000", "1/../2"])("refuses a non-numeric id %j without calling SheetDB", async (id) => {
    expect((await post({ action: "deleteOrder", id })).statusCode).toBe(400);
    expect((await post({ action: "updateOrder", id, data: { Name: "x" } })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an update with no editable fields", async () => {
    expect((await post({ action: "updateOrder", id: "714", data: { Id: "1", Date: "x" } })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("editing and deleting card payments and event sales (staff)", () => {
  function staffCookie() {
    const res = mockRes();
    setSessionCookie(res, "staff@example.com");
    return cookieFrom(res);
  }
  const post = (body) => call(sheets, { method: "POST", url: "/api/sheets", body, cookie: staffCookie() });
  const okWith = (payload) => ({ ok: true, status: 200, json: async () => payload });

  it("a card payment can change who/what it was for, never its amounts", async () => {
    fetchMock.mockResolvedValue(okWith({ updated: 1 }));
    const res = await post({
      action: "updateCardPayment",
      id: "pi_3Abc",
      data: { Name: "Pat", InvoiceId: "714", Amount: "1.00", Total: "1.00", Fee: "0", PaymentIntentId: "pi_other" },
    });
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sheetdb.io/api/v1/test-sheet/PaymentIntentId/pi_3Abc?sheet=CardPayments");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ data: { Name: "Pat", InvoiceId: "714" } });
  });

  it("refuses a bad order ID on a card payment", async () => {
    expect((await post({ action: "updateCardPayment", id: "pi_1", data: { InvoiceId: "*" } })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes a card payment row by its payment id", async () => {
    fetchMock.mockResolvedValue(okWith({ deleted: 1 }));
    expect((await post({ action: "deleteCardPayment", id: "pi_3Abc" })).statusCode).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("https://sheetdb.io/api/v1/test-sheet/PaymentIntentId/pi_3Abc?sheet=CardPayments");
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("a cash event sale can change its total and method", async () => {
    fetchMock.mockImplementation(async (url, init) =>
      init.method === "GET" ? okWith([{ SaleId: "EV-261109-120000", Method: "Cash" }]) : okWith({ updated: 1 })
    );
    const res = await post({ action: "updateEventSale", id: "EV-261109-120000", data: { Method: "Zelle", Amount: "12.50", Total: "12.50", SaleId: "x" } });
    expect(res.statusCode).toBe(200);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://sheetdb.io/api/v1/test-sheet/SaleId/EV-261109-120000?sheet=EventSales");
    expect(JSON.parse(init.body)).toEqual({ data: { Method: "Zelle", Amount: "12.50", Total: "12.50" } });
  });

  it("a card event sale's amount and method can't change", async () => {
    fetchMock.mockResolvedValue(okWith([{ SaleId: "EV-261109-120000", Method: "Card" }]));
    const res = await post({ action: "updateEventSale", id: "EV-261109-120000", data: { Total: "1.00" } });
    expect(res.statusCode).toBe(400);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET")).toBe(true);
  });

  it("an event sale's method must be Cash or Zelle and amounts must be money", async () => {
    fetchMock.mockResolvedValue(okWith([{ SaleId: "EV-261109-120000", Method: "Cash" }]));
    expect((await post({ action: "updateEventSale", id: "EV-261109-120000", data: { Method: "Card" } })).statusCode).toBe(400);
    expect((await post({ action: "updateEventSale", id: "EV-261109-120000", data: { Total: "lots" } })).statusCode).toBe(400);
  });

  it.each([
    ["deleteCardPayment", "pi_1/../x"],
    ["deleteCardPayment", "*"],
    ["deleteEventSale", "714"],
    ["deleteEventSale", "EV-*"],
  ])("%s refuses id %j without calling SheetDB", async (action, id) => {
    expect((await post({ action, id })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
