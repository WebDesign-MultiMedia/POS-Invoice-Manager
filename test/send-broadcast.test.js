import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Twilio and SheetDB are fully mocked: nothing is texted, nothing leaves the test.
const twilioMock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("twilio", () => ({
  default: vi.fn(() => ({ messages: { create: twilioMock.create } })),
}));

const { default: handler, isMarkedOptedOut } = await import("../api/send-broadcast.js");
const { hashPassword, setSessionCookie } = await import("../api/_lib/auth.js");

const SIGNING_KEY = "test-signing-key";

// A signup row the way the website's consent Worker writes it.
function signup(phone, { consentId = crypto.randomUUID(), specials = "Yes", ...extra } = {}) {
  const digits = phone.replace(/\D/g, "");
  const e164 = `+1${digits.slice(-10)}`;
  const Signature = crypto.createHmac("sha256", SIGNING_KEY).update(`${consentId}|${e164}|${specials}`).digest("hex");
  return { Phone: phone, ConsentId: consentId, Specials: specials, Signature, ...extra };
}

let staffCookie;
let sheetRows;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": hashPassword("a test password") }));
  vi.stubEnv("SHEETDB_ID", "test-sheet");
  vi.stubEnv("SIGNUP_SIGNING_KEY", SIGNING_KEY);
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test-token");
  vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG_test");
  const res = mockRes();
  setSessionCookie(res, "staff@example.com");
  staffCookie = cookieFrom(res);

  sheetRows = [];
  fetchMock.mockReset().mockImplementation(async () => ({ ok: true, status: 200, json: async () => sheetRows }));
  vi.stubGlobal("fetch", fetchMock);
  twilioMock.create.mockReset().mockResolvedValue({ sid: "SM_test" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function send(body, { cookie = staffCookie } = {}) {
  const res = mockRes();
  return handler(mockReq({ method: "POST", body, cookie }), res).then(() => res);
}

const sentTo = () => twilioMock.create.mock.calls.map(([msg]) => msg.to).sort();

describe("POST /api/send-broadcast", () => {
  it("rejects requests without a staff session", async () => {
    const res = await send({ messageText: "Hi" }, { cookie: null });
    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(twilioMock.create).not.toHaveBeenCalled();
  });

  it("needs only the staff login (no separate manager password)", async () => {
    sheetRows = [signup("(347) 555-0101")];
    const res = await send({ messageText: "Hi" });
    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBe(1);
  });

  it("refuses to run when Twilio or the sheet isn't configured", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const res = await send({ messageText: "Hi" });
    expect(res.statusCode).toBe(500);
    expect(twilioMock.create).not.toHaveBeenCalled();
  });

  it("rejects empty and over-long messages", async () => {
    expect((await send({ messageText: "   " })).statusCode).toBe(400);
    expect((await send({ messageText: "x".repeat(481) })).statusCode).toBe(400);
  });

  it("only texts opted-in, correctly signed signups, once per number", async () => {
    sheetRows = [
      signup("(347) 555-0101"),
      signup("347-555-0101"), // same person signed up twice
      signup("(347) 555-0102"),
      signup("(347) 555-0103", { specials: "No" }), // didn't opt in to specials
      { ...signup("(347) 555-0104"), Signature: "forged" }, // typed into the sheet by hand
      { Phone: "(347) 555-0105", Specials: "Yes" }, // no consent record at all
    ];
    const res = await send({ messageText: "Tamales this weekend" });
    expect(res.statusCode).toBe(200);
    expect(sentTo()).toEqual(["+13475550101", "+13475550102"]);
    expect(res.body).toMatchObject({ recipientCount: 2, sent: 2, optedOut: 0, failed: 0 });
  });

  it("skips numbers marked unsubscribed in the sheet", async () => {
    sheetRows = [
      signup("(347) 555-0101", { Unsubscribed: "Yes" }),
      signup("(347) 555-0102", { OptOut: "TRUE" }),
      signup("(347) 555-0103", { Unsubscribed: "No" }),
      signup("(347) 555-0104", { Unsubscribed: "" }),
      // An opt-out on any row for a number wins over another signup row.
      signup("(347) 555-0105"),
      signup("347.555.0105", { Unsubscribed: "STOP" }),
    ];
    const res = await send({ messageText: "Hi" });
    expect(sentTo()).toEqual(["+13475550103", "+13475550104"]);
    expect(res.body.recipientCount).toBe(2);
  });

  it("counts numbers Twilio blocked for replying STOP as opted out, not failed", async () => {
    sheetRows = [signup("(347) 555-0101"), signup("(347) 555-0102"), signup("(347) 555-0103")];
    twilioMock.create.mockImplementation(async ({ to }) => {
      if (to === "+13475550102") throw Object.assign(new Error("Attempt to send to unsubscribed recipient"), { code: 21610 });
      if (to === "+13475550103") throw Object.assign(new Error("Invalid number"), { code: 21211 });
      return { sid: "SM_ok" };
    });
    const res = await send({ messageText: "Hi" });
    expect(res.body).toMatchObject({ recipientCount: 3, sent: 1, optedOut: 1, failed: 1 });
  });

  it("names the business and says how to opt out in every message", async () => {
    sheetRows = [signup("(347) 555-0101"), signup("(347) 555-0102")];
    await send({ messageText: "Party trays available" });
    for (const [msg] of twilioMock.create.mock.calls) {
      expect(msg.body.startsWith("Buffet Lucia's Fiesta Mexicana: Party trays available")).toBe(true);
      expect(msg.body).toMatch(/Reply STOP to unsubscribe\.$/);
      expect(msg.messagingServiceSid).toBe("MG_test");
    }
  });

  it("dry run counts recipients without texting anyone", async () => {
    sheetRows = [signup("(347) 555-0101"), signup("(347) 555-0102")];
    const res = await send({ messageText: "Hi", dryRun: true });
    expect(res.body).toEqual({ recipientCount: 2 });
    expect(twilioMock.create).not.toHaveBeenCalled();
  });

  it("fails safely when SheetDB is down", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => null });
    const res = await send({ messageText: "Hi" });
    expect(res.statusCode).toBe(500);
    expect(twilioMock.create).not.toHaveBeenCalled();
  });
});

describe("subscriber count (countOnly)", () => {
  it("counts valid, opted-in, not-unsubscribed numbers and reports the newest sign-up", async () => {
    sheetRows = [
      signup("(347) 555-0101", { Date: "2026-10-01T15:00:00.000Z" }),
      signup("(347) 555-0102", { Date: "2026-11-04T18:30:00.000Z" }),
      signup("(347) 555-0103", { Date: "2026-11-05T09:00:00.000Z", Unsubscribed: "Yes" }), // newest, but opted out
      { ...signup("(347) 555-0104", { Date: "2026-11-06T09:00:00.000Z" }), Signature: "forged" }, // not a real sign-up
    ];
    const res = await send({ countOnly: true });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ recipientCount: 2, latestSignup: "2026-11-04T18:30:00.000Z" });
    expect(twilioMock.create).not.toHaveBeenCalled();
  });

  it("needs no message, but does need a staff login", async () => {
    expect((await send({ countOnly: true }, { cookie: null })).statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports no date when nobody has signed up", async () => {
    sheetRows = [];
    expect((await send({ countOnly: true })).body).toEqual({ recipientCount: 0, latestSignup: null });
  });
});

describe("isMarkedOptedOut", () => {
  it.each([
    [{}, false],
    [{ Unsubscribed: "" }, false],
    [{ Unsubscribed: "No" }, false],
    [{ OptOut: "false" }, false],
    [{ OptOut: "0" }, false],
    [{ Unsubscribed: "Yes" }, true],
    [{ Unsubscribed: "x" }, true],
    [{ OptOut: "2026-11-06" }, true],
  ])("%j → %s", (row, expected) => {
    expect(isMarkedOptedOut(row)).toBe(expected);
  });
});
