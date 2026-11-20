import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Web Design & MultiMedia: its own login (WEB_ACCOUNTS) and its own sheet
// (WEB_SHEETDB_ID). That login sees only the leads; restaurant employees
// never see the leads. Throwaway test values only.
vi.mock("stripe", () => ({
  default: vi.fn(function Stripe() {
    return { paymentMethods: { retrieve: vi.fn() }, paymentIntents: { create: vi.fn(), retrieve: vi.fn() } };
  }),
}));
vi.mock("twilio", () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }));

const { hashPassword, setSessionCookie, readSession, requireStaff } = await import("../api/_lib/auth.js");
const auth = (await import("../api/auth.js")).default;
const sheets = (await import("../api/sheets.js")).default;
const receiptUrl = (await import("../api/receipt-url.js")).default;
const quotes = (await import("../api/quotes.js")).default;
const { forgetHeaders, headerMap, cleanRow } = await import("../api/_lib/leads.js");

const WEB_PASSWORD = "a long web design test password";
const STAFF_PASSWORD = "a long staff test password";
// The real sheet's headers, typed by hand (trailing spaces, "Tikto").
const HEADERS = ["Id", "Business Type", "Business Name ", "Location ", "Email ", "Phone Number", "Google Location", "Business Website", "New Website", "Others", "Instagram ", "Yelp", "Tikto", "Facebook ", "Answer phone call ?", "Website?", "Notes"];
let rows;
let headers;
const fetchMock = vi.fn();

function sheetFetch(url, init = {}) {
  const u = String(url);
  const json = (payload, status = 200) => ({ ok: status < 400, status, json: async () => payload, clone: () => ({ text: async () => "" }) });
  if (!u.startsWith("https://sheetdb.io/api/v1/web-sheet")) return json([]);
  const path = u.slice("https://sheetdb.io/api/v1/web-sheet".length);
  if (path === "/keys") return json(headers);
  const method = init.method || "GET";
  if (method === "GET") return json(rows);
  if (method === "POST") {
    rows.push(...JSON.parse(init.body).data);
    return json({ created: 1 });
  }
  if (method === "PATCH") {
    const id = decodeURIComponent(path.split("/")[2]);
    const row = rows.find((r) => r.Id === id);
    if (!row) return json({ updated: 0 });
    Object.assign(row, JSON.parse(init.body).data);
    return json({ updated: 1 });
  }
  return json({}, 405);
}

async function loginAs(identifier, password) {
  const res = mockRes();
  await auth(mockReq({ method: "POST", url: "/api/auth", body: { action: "login", identifier, password } }), res);
  return { res, cookie: cookieFrom(res) };
}

async function call(cookie, { method = "GET", url = "/api/sheets?action=leads", body } = {}) {
  const res = mockRes();
  await sheets(mockReq({ method, url, body, cookie }), res);
  return res;
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": hashPassword(STAFF_PASSWORD) }));
  vi.stubEnv("WEB_ACCOUNTS", JSON.stringify({ "web@example.com": hashPassword(WEB_PASSWORD) }));
  vi.stubEnv("SHEETDB_ID", "restaurant-sheet");
  vi.stubEnv("WEB_SHEETDB_ID", "web-sheet");
  headers = [...HEADERS];
  rows = [{ Id: "1", "Business Type": "Bakery", "Business Name ": "Sample Bakery", "Phone Number": "555-555-0101", "Website?": "No", "Answer phone call ?": "yes" }];
  forgetHeaders();
  fetchMock.mockReset().mockImplementation(sheetFetch);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the Web Design login", () => {
  it("logs in with role web and only the webdesign section", async () => {
    const { res } = await loginAs("Web@Example.com", WEB_PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ user: "web@example.com", role: "web", access: ["webdesign"] });
  });

  it("isn't a staff session", async () => {
    const { cookie } = await loginAs("web@example.com", WEB_PASSWORD);
    expect(readSession(mockReq({ cookie }))).toBeNull();
    const res = mockRes();
    expect(requireStaff(mockReq({ cookie }), res)).toBeNull();
    expect(res.statusCode).toBe(403);
  });

  it("reads the leads from its own sheet, with clean field names", async () => {
    const { cookie } = await loginAs("web@example.com", WEB_PASSWORD);
    const res = await call(cookie);
    expect(res.statusCode).toBe(200);
    expect(res.body.canEdit).toBe(true);
    expect(res.body.leads[0]).toMatchObject({ Id: "1", BusinessName: "Sample Bakery", BusinessType: "Bakery", Phone: "555-555-0101", HasWebsite: "No", AnswerPhone: "yes" });
    for (const [url] of fetchMock.mock.calls) expect(String(url)).toContain("/web-sheet");
  });

  it("never reaches restaurant data", async () => {
    const { cookie } = await loginAs("web@example.com", WEB_PASSWORD);
    for (const action of ["orders", "orders&deleted=1", "cardPayments", "eventSales", "order&id=1"]) {
      expect((await call(cookie, { url: `/api/sheets?action=${action}` })).statusCode).toBe(403);
    }
    expect((await call(cookie, { method: "POST", url: "/api/sheets", body: { action: "createOrder", data: { Name: "x" } } })).statusCode).toBe(403);
    expect((await call(cookie, { method: "POST", url: "/api/sheets", body: { action: "restoreOrder", id: "1" } })).statusCode).toBe(403);
    const r = mockRes();
    await receiptUrl(mockReq({ url: "/api/receipt-url?pi=pi_1&format=json", cookie }), r);
    expect(r.statusCode).toBe(403);
    const q = mockRes();
    await quotes(mockReq({ url: "/api/quotes", cookie }), q);
    expect(q.statusCode).toBe(403);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("restaurant-sheet"))).toBe(false);
  });

  it("adds a business with a new Id, saved under the sheet's real headers", async () => {
    const { cookie } = await loginAs("web@example.com", WEB_PASSWORD);
    const res = await call(cookie, { method: "POST", url: "/api/sheets", body: { action: "createLead", data: { BusinessName: "New Shop", TikTok: "@newshop", HasWebsite: "No", Id: "hack" } } });
    expect(res.statusCode).toBe(200);
    const added = rows.at(-1);
    expect(added["Business Name "]).toBe("New Shop");
    expect(added.Tikto).toBe("@newshop");
    expect(added["Website?"]).toBe("No");
    expect(added.Id).toMatch(/^WD-\d{10}-[A-Z0-9]{1,2}$/);
  });

  it("edits the row with that Id", async () => {
    const { cookie } = await loginAs("web@example.com", WEB_PASSWORD);
    const res = await call(cookie, { method: "POST", url: "/api/sheets", body: { action: "updateLead", id: "1", data: { Notes: "Call back Monday" } } });
    expect(res.statusCode).toBe(200);
    expect(rows[0].Notes).toBe("Call back Monday");
    expect((await call(cookie, { method: "POST", url: "/api/sheets", body: { action: "updateLead", id: "99", data: { Notes: "x" } } })).statusCode).toBe(404);
  });

  it("asks for an Id column before adding or editing", async () => {
    headers = HEADERS.filter((h) => h !== "Id");
    const { cookie } = await loginAs("web@example.com", WEB_PASSWORD);
    expect((await call(cookie)).body.canEdit).toBe(false);
    const res = await call(cookie, { method: "POST", url: "/api/sheets", body: { action: "createLead", data: { BusinessName: "X" } } });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/Id/);
  });
});

describe("who else can open the leads", () => {
  it("the owner's login can", async () => {
    const { cookie } = await loginAs("staff@example.com", STAFF_PASSWORD);
    expect((await call(cookie)).statusCode).toBe(200);
  });

  it("restaurant employees can't, whatever is ticked", async () => {
    const res = mockRes();
    setSessionCookie(res, "3475550123", "event");
    // The Employees tab lookup answers [] here, so this employee also
    // stands in for one who was removed; both must be refused.
    expect([401, 403]).toContain((await call(cookieFrom(res))).statusCode);
  });

  it("nobody without a login", async () => {
    expect((await call("")).statusCode).toBe(401);
  });
});

describe("matching the sheet's hand-typed headers", () => {
  it("maps each header to the app's field", () => {
    const map = headerMap(HEADERS);
    expect(map).toMatchObject({ BusinessName: "Business Name ", TikTok: "Tikto", AnswerPhone: "Answer phone call ?", HasWebsite: "Website?", BusinessWebsite: "Business Website", Phone: "Phone Number" });
    expect(cleanRow({ "Instagram ": " @x " }, map).Instagram).toBe("@x");
  });
});
