import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Stripe is fully mocked: no network, no real keys.
const stripeMock = vi.hoisted(() => ({
  paymentMethods: { retrieve: vi.fn() },
  paymentIntents: { create: vi.fn() },
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
