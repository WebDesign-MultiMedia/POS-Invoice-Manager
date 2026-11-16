import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Stripe is fully mocked: no network, no real keys.
const stripeMock = vi.hoisted(() => ({
  paymentMethods: { retrieve: vi.fn() },
  paymentIntents: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
}));
vi.mock("stripe", () => ({
  default: vi.fn(function Stripe() {
    return stripeMock;
  }),
}));

const { default: handler, MAX_CHARGE_CENTS } = await import("../api/create-payment-intent.js");
const { hashPassword, setSessionCookie } = await import("../api/_lib/auth.js");
const { calcSurcharge } = await import("../src/lib/surcharge.js");

let staffCookie;

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": hashPassword("a test password") }));
  const res = mockRes();
  setSessionCookie(res, "staff@example.com");
  staffCookie = cookieFrom(res);

  stripeMock.paymentMethods.retrieve.mockReset().mockResolvedValue({ card: { funding: "credit", brand: "visa", last4: "4242" } });
  stripeMock.paymentIntents.create.mockReset().mockImplementation(async (params) => ({
    id: "pi_test_123",
    client_secret: "pi_test_123_secret",
    status: "succeeded",
    amount: params.amount,
    latest_charge: { receipt_url: "https://pay.stripe.com/receipts/test" },
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function post(body, { cookie = staffCookie } = {}) {
  const res = mockRes();
  return handler(mockReq({ method: "POST", body, cookie }), res).then(() => res);
}

describe("POST /api/create-payment-intent", () => {
  it("rejects requests without a staff session and never calls Stripe", async () => {
    const res = await post({ paymentMethodId: "pm_1", baseAmountCents: 1000 }, { cookie: null });
    expect(res.statusCode).toBe(401);
    expect(stripeMock.paymentMethods.retrieve).not.toHaveBeenCalled();
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("rejects non-POST methods", async () => {
    const res = mockRes();
    await handler(mockReq({ method: "GET", cookie: staffCookie }), res);
    expect(res.statusCode).toBe(405);
  });

  it.each([
    [{ baseAmountCents: 1000 }],
    [{ paymentMethodId: "pm_1", baseAmountCents: 0 }],
    [{ paymentMethodId: "pm_1", baseAmountCents: -5 }],
    [{ paymentMethodId: "pm_1", baseAmountCents: 10.5 }],
    [{ paymentMethodId: "pm_1", baseAmountCents: "1000" }],
  ])("rejects invalid input %j", async (body) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("refuses amounts over the sanity limit", async () => {
    const res = await post({ paymentMethodId: "pm_1", baseAmountCents: MAX_CHARGE_CENTS + 1 });
    expect(res.statusCode).toBe(400);
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("computes the surcharge and total on the server, ignoring client-sent totals", async () => {
    // A client trying to dodge the fee: claims debit and sends its own total.
    const res = await post({
      paymentMethodId: "pm_1",
      baseAmountCents: 10000,
      funding: "debit",
      totalCents: 10000,
      surchargeCents: 0,
    });
    const expected = calcSurcharge(10000, "credit");
    expect(res.statusCode).toBe(200);
    expect(stripeMock.paymentMethods.retrieve).toHaveBeenCalledWith("pm_1");
    const params = stripeMock.paymentIntents.create.mock.calls[0][0];
    expect(params.amount).toBe(expected.totalCents);
    expect(params.amount).toBe(10300);
    expect(params.currency).toBe("usd");
    expect(params.metadata.surcharge_cents).toBe(String(expected.surchargeCents));
    // What the receipt screen shows is exactly what Stripe was asked to charge.
    expect(res.body).toMatchObject({ baseAmountCents: 10000, surchargeCents: 300, totalCents: 10300, funding: "credit" });
  });

  it("charges no fee when Stripe says the card is debit", async () => {
    stripeMock.paymentMethods.retrieve.mockResolvedValue({ card: { funding: "debit", brand: "visa", last4: "5556" } });
    const res = await post({ paymentMethodId: "pm_1", baseAmountCents: 1850 });
    expect(stripeMock.paymentIntents.create.mock.calls[0][0].amount).toBe(1850);
    expect(res.body).toMatchObject({ surchargeCents: 0, totalCents: 1850, cardLast4: "5556" });
  });

  it("passes a card decline message through with 402", async () => {
    stripeMock.paymentIntents.create.mockRejectedValue(Object.assign(new Error("Your card was declined."), { type: "StripeCardError" }));
    const res = await post({ paymentMethodId: "pm_1", baseAmountCents: 1000 });
    expect(res.statusCode).toBe(402);
    expect(res.body.error).toBe("Your card was declined.");
  });

  it("hides internal Stripe errors behind a generic message", async () => {
    stripeMock.paymentMethods.retrieve.mockRejectedValue(
      Object.assign(new Error("Invalid API Key provided: sk_test_****"), { type: "StripeAuthenticationError" })
    );
    const res = await post({ paymentMethodId: "pm_1", baseAmountCents: 1000 });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/sk_|API Key/i);
    expect(res.body.error).toMatch(/No charge was made/);
  });
});

describe("Pay by QR (Event Sales)", () => {
  const SESSION_ID = "cs_test_a1B2c3D4e5F6g7H8";
  const paidSession = {
    id: SESSION_ID,
    status: "complete",
    payment_status: "paid",
    amount_total: 1250,
    metadata: { source: "event_qr", invoice_no: "EV-261116-120000", base_amount_cents: "1250" },
    payment_intent: {
      id: "pi_qr_1",
      latest_charge: {
        receipt_url: "https://pay.stripe.com/receipts/qr",
        payment_method_details: { card: { brand: "visa", last4: "4242", funding: "credit", wallet: { type: "apple_pay" } } },
      },
    },
  };

  beforeEach(() => {
    stripeMock.checkout.sessions.create.mockReset().mockResolvedValue({ id: SESSION_ID, url: "https://checkout.stripe.com/c/pay/x", expires_at: 1_900_000_000 });
    stripeMock.checkout.sessions.retrieve.mockReset();
    stripeMock.checkout.sessions.expire.mockReset().mockResolvedValue({});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("makes a checkout page for an event sale, with no card fee", async () => {
    const res = await post({ action: "qr-create", baseAmountCents: 1250, invoiceId: "EV-261116-120000", description: "Order ID: EV-261116-120000" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: SESSION_ID, url: "https://checkout.stripe.com/c/pay/x", expiresAt: 1_900_000_000_000 });
    const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(1250);
    expect(params.metadata).toMatchObject({ source: "event_qr", surcharge_cents: "0" });
    expect(params.expires_at - Date.now() / 1000).toBeGreaterThanOrEqual(30 * 60);
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ baseAmountCents: 1250, invoiceId: "INV-1" }],
    [{ baseAmountCents: 49, invoiceId: "EV-261116-120000" }],
    [{ baseAmountCents: "1250", invoiceId: "EV-261116-120000" }],
    [{ baseAmountCents: MAX_CHARGE_CENTS + 1, invoiceId: "EV-261116-120000" }],
  ])("won't make a QR for %j", async (body) => {
    const res = await post({ action: "qr-create", ...body });
    expect(res.statusCode).toBe(400);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("needs a login", async () => {
    const res = await post({ action: "qr-create", baseAmountCents: 1250, invoiceId: "EV-261116-120000" }, { cookie: null });
    expect(res.statusCode).toBe(401);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("reports open, then paid with the card and wallet", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ ...paidSession, status: "open", payment_status: "unpaid", payment_intent: null });
    let res = await post({ action: "qr-status", id: SESSION_ID });
    expect(res.body).toEqual({ status: "open" });

    stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce(paidSession);
    res = await post({ action: "qr-status", id: SESSION_ID });
    expect(res.body).toMatchObject({ status: "paid", id: "pi_qr_1", cardBrand: "visa", cardLast4: "4242", wallet: "apple_pay", totalCents: 1250, surchargeCents: 0 });
  });

  it("won't read checkout pages it didn't make", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ ...paidSession, metadata: {} });
    const res = await post({ action: "qr-status", id: SESSION_ID });
    expect(res.statusCode).toBe(404);
    const bad = await post({ action: "qr-status", id: "../../v1/charges" });
    expect(bad.statusCode).toBe(400);
  });

  it("cancel closes an open page", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ ...paidSession, status: "open", payment_status: "unpaid" });
    const res = await post({ action: "qr-cancel", id: SESSION_ID });
    expect(stripeMock.checkout.sessions.expire).toHaveBeenCalledWith(SESSION_ID);
    expect(res.body).toEqual({ status: "expired" });
  });

  it("cancel keeps the sale when the customer paid in that same moment", async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValueOnce({ ...paidSession, status: "open", payment_status: "unpaid" }).mockResolvedValueOnce(paidSession);
    stripeMock.checkout.sessions.expire.mockRejectedValueOnce(Object.assign(new Error("already complete"), { code: "checkout_session_not_open" }));
    const res = await post({ action: "qr-cancel", id: SESSION_ID });
    expect(res.body).toMatchObject({ status: "paid", id: "pi_qr_1" });
  });
});
