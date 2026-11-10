import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";
import { addressOf, clearZelleCache, isGenuineChase, parseZelleEmail, recentZelleAlerts, sentToInbound } from "../api/_lib/zelle.js";

const INBOUND = "zelle-k3y@abc123.resend.app";
const PASS = { spf: "pass", dkim: "pass", dmarc: "pass" };
const chaseEmail = (over = {}) => ({
  id: "0f6a1c2e-1111-4a5b-9c8d-123456789abc",
  from: "Chase <no.reply.alerts@chase.com>",
  to: ["floreslucia@example.com"],
  received_for: [INBOUND],
  created_at: new Date().toISOString(),
  subject: "You received money with Zelle®",
  text: "MARIA LOPEZ sent you money\nAmount $13.50\nMemo tacos",
  authentication: PASS,
  ...over,
});

describe("reading Chase's Zelle email", () => {
  it("gets the amount and who sent it", () => {
    expect(parseZelleEmail(chaseEmail())).toEqual({ amount: 13.5, from: "MARIA LOPEZ" });
  });

  it("reads the HTML version too, and amounts with commas", () => {
    const html = "<table><tr><td>JOSE R sent you money</td></tr><tr><td>Amount</td><td>&#36;1,250.00</td></tr></table>";
    expect(parseZelleEmail({ subject: "You received money with Zelle®", html })).toEqual({ amount: 1250, from: "JOSE R" });
  });

  // Chase's real layout (Spanish), as Gmail forwards it.
  const SPANISH_HTML =
    '<td style="font-size:30px">MARIA LOPEZ RIVERA te envió dinero</td></tr>' +
    '<tr><td>Aquí están los detalles:</td></tr>' +
    '<tr><td><table><tr><td class="font14">Cantidad</td>\n<td align="right">$10.00</td></tr></table></td></tr>' +
    '<tr><td>Número de transacción</td><td>31549525360</td></tr><tr><td>Nota</td><td>pay</td></tr>';
  it("reads Chase's Spanish email (HTML and text)", () => {
    expect(parseZelleEmail({ subject: "Recibiste dinero con Zelle®", html: SPANISH_HTML })).toEqual({ amount: 10, from: "MARIA LOPEZ RIVERA" });
    const text = "[image: Chase Logo]\nPago de Zelle®\nMARIA LOPEZ RIVERA te envió dinero\nAquí están los detalles:\nCantidad $10.00\nSe envió en nov 8, 2026\nNúmero de transacción 31549525360\nNota pay";
    expect(parseZelleEmail({ subject: "Recibiste dinero con Zelle®", text })).toEqual({ amount: 10, from: "MARIA LOPEZ RIVERA" });
  });

  it("ignores Spanish money-sent and request emails", () => {
    expect(parseZelleEmail({ subject: "Enviaste dinero con Zelle®", text: "Enviaste $20.00 a Ana\nCantidad $20.00" })).toBeNull();
    expect(parseZelleEmail({ subject: "Ana te solicitó dinero con Zelle®", text: "Cantidad $20.00" })).toBeNull();
  });

  it("ignores money you sent, requests, and other alerts", () => {
    expect(parseZelleEmail({ subject: "You sent money with Zelle®", text: "You sent $20.00 to Ana" })).toBeNull();
    expect(parseZelleEmail({ subject: "Ana requested money with Zelle®", text: "Amount $20.00" })).toBeNull();
    expect(parseZelleEmail({ subject: "Your statement is ready", text: "Balance $500.00" })).toBeNull();
  });

  it("trusts only real Chase mail sent to our private address", () => {
    expect(isGenuineChase(chaseEmail())).toBe(true);
    expect(isGenuineChase(chaseEmail({ from: "Chase <alerts@chase-secure.com>" }))).toBe(false);
    expect(isGenuineChase(chaseEmail({ authentication: { ...PASS, dkim: "fail" } }))).toBe(false);
    expect(isGenuineChase(chaseEmail({ authentication: { ...PASS, dmarc: "none" } }))).toBe(false);
    expect(isGenuineChase(chaseEmail({ authentication: undefined }))).toBe(false);
    expect(sentToInbound(chaseEmail(), INBOUND)).toBe(true);
    expect(sentToInbound(chaseEmail({ received_for: ["other@abc123.resend.app"] }), INBOUND)).toBe(false);
    expect(addressOf("Chase <No.Reply.Alerts@Chase.com>")).toBe("no.reply.alerts@chase.com");
  });
});

describe("recent Zelle alerts from Resend", () => {
  let emails;
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ZELLE_INBOUND_ADDRESS", INBOUND);
    clearZelleCache();
    emails = [
      chaseEmail(),
      chaseEmail({ id: "fake-1111-2222", from: "Chase <no.reply.alerts@chase.com>", authentication: { ...PASS, dkim: "fail", dmarc: "fail" } }),
      chaseEmail({ id: "old-1111-2222", created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const u = String(url);
        const json = (p) => ({ ok: true, status: 200, json: async () => p });
        if (u.endsWith("/emails/receiving?limit=20")) return json({ object: "list", data: emails.map(({ id, to, received_for, created_at, from, subject }) => ({ id, to, received_for, created_at, from, subject })) });
        const id = decodeURIComponent(u.split("/emails/receiving/")[1]);
        return json(emails.find((e) => e.id === id));
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns only genuine, recent Zelle payments", async () => {
    const alerts = await recentZelleAlerts(Date.now() - 10 * 60 * 1000);
    expect(alerts).toEqual([expect.objectContaining({ id: "0f6a1c2e-1111-4a5b-9c8d-123456789abc", amount: 13.5, from: "MARIA LOPEZ" })]);
  });
});

describe("one Zelle payment, one sale", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-session-secret");
    vi.stubEnv("SHEETDB_ID", "test-sheet");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refuses a sale that reuses a Zelle payment already recorded", async () => {
    const { hashPassword, setSessionCookie } = await import("../api/_lib/auth.js");
    vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": hashPassword("a long staff test password") }));
    const sheets = (await import("../api/sheets.js")).default;
    const used = "0f6a1c2e-1111-4a5b-9c8d-123456789abc";
    const fetchMock = vi.fn(async (url) => {
      const ref = String(url).match(/ZelleRef=([^&]+)/)?.[1];
      return { ok: true, status: 200, json: async () => (ref ? (decodeURIComponent(ref) === used ? [{ ZelleRef: used }] : []) : { created: 1 }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const cookieRes = mockRes();
    setSessionCookie(cookieRes, "staff@example.com");
    const post = async (ref) => {
      const res = mockRes();
      await sheets(mockReq({ method: "POST", url: "/api/sheets", cookie: cookieFrom(cookieRes), body: { action: "recordEventSale", data: { SaleId: "EV-261110-120000", Method: "Zelle", Total: "13.50", ZelleRef: ref } } }), res);
      return res;
    };
    expect((await post(used)).statusCode).toBe(409);
    expect((await post("aaaaaaaa-1111-4a5b-9c8d-123456789abc")).statusCode).toBe(200);
  });
});

describe("zelle-alerts endpoint", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("needs a login", async () => {
    vi.stubEnv("SESSION_SECRET", "test-session-secret");
    const handler = (await import("../api/zelle-alerts.js")).default;
    const res = mockRes();
    await handler(mockReq({ url: "/api/zelle-alerts?since=0" }), res);
    expect(res.statusCode).toBe(401);
  });
});
