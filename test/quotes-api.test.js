import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookieFrom, mockReq, mockRes } from "./helpers.js";

const { default: handler } = await import("../api/quotes.js");
const { hashPassword, setSessionCookie, calculatorTokenFor } = await import("../api/_lib/auth.js");

const fetchMock = vi.fn();
let staffCookie;

const QUOTE = {
  id: "qabc12345xyz",
  code: "1108-0153",
  createdAt: "2026-11-08T01:53:00.000Z",
  total: 690,
  lines: [{ op: null, qty: 2, id: "carnitas", name: "Carnitas", size: "whole", amount: 340, extra: "ignored" }],
  itemsText: "2x Carnitas (Whole tray)",
  name: "Ana",
  phone: "555-0101",
  address: "",
  eventDate: "2026-11-20",
  notes: "",
};

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": hashPassword("a test password") }));
  vi.stubEnv("SHEETDB_ID", "test-sheet");
  const res = mockRes();
  setSessionCookie(res, "staff@example.com");
  staffCookie = cookieFrom(res);
  // What SheetDB really answers an update that matches no row.
  fetchMock.mockReset().mockImplementation(async (url, init) =>
    init.method === "PATCH" ? { ok: false, status: 404, json: async () => ({ error: "No results found" }) } : { ok: true, status: 200, json: async () => ({ created: 1 }) }
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function call(req) {
  const res = mockRes();
  await handler(mockReq(req), res);
  return res;
}
const post = (body, cookie) => call({ method: "POST", url: "/api/quotes", body, cookie });
const sentBodies = () => fetchMock.mock.calls.map(([url, init]) => ({ url, method: init.method, body: init.body && JSON.parse(init.body) }));

describe("quotes API access", () => {
  it("only staff can list or delete", async () => {
    expect((await call({ url: "/api/quotes?action=list" })).statusCode).toBe(401);
    expect((await post({ action: "delete", id: QUOTE.id, token: calculatorTokenFor() })).statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saving needs a staff login or a valid calculator link", async () => {
    expect((await post({ action: "save", quote: QUOTE })).statusCode).toBe(401);
    expect((await post({ action: "save", quote: QUOTE, token: "bad" })).statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects ids that aren't quote ids (no SheetDB wildcards)", async () => {
    expect((await post({ action: "save", quote: { ...QUOTE, id: "*" } }, staffCookie)).statusCode).toBe(400);
    expect((await post({ action: "delete", id: "*" }, staffCookie)).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("saving a quote", () => {
  it("creates the row when it's new, recording who made it", async () => {
    const res = await post({ action: "save", quote: QUOTE, token: calculatorTokenFor(), employeeName: " Maria " });
    expect(res.statusCode).toBe(200);
    const [patch, create] = sentBodies();
    expect(patch.method).toBe("PATCH");
    expect(patch.url).toContain("/QuoteId/qabc12345xyz?sheet=Quotes");
    expect(patch.body.data).not.toHaveProperty("Source"); // updates never change who made it
    expect(create.method).toBe("POST");
    const [row] = create.body.data;
    expect(row).toMatchObject({ QuoteId: "qabc12345xyz", Source: "link", CreatedBy: "Maria", ClientName: "Ana", Total: "690.00", EventDate: "2026-11-20" });
    expect(JSON.parse(row.Lines)).toEqual([{ op: null, qty: 2, id: "carnitas", name: "Carnitas", size: "whole", amount: 340 }]);
  });

  it("only updates when the row already exists", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ updated: 1 }) });
    await post({ action: "save", quote: QUOTE }, staffCookie);
    expect(sentBodies().map((c) => c.method)).toEqual(["PATCH"]);
  });

  it("a staff save is marked as staff, even if the browser says otherwise", async () => {
    await post({ action: "save", quote: { ...QUOTE, source: "link", createdBy: "someone" }, employeeName: "Fake" }, staffCookie);
    expect(sentBodies()[1].body.data[0]).toMatchObject({ Source: "staff", CreatedBy: "staff@example.com" });
  });

  it("still creates the row if SheetDB says the update matched 0 rows", async () => {
    fetchMock.mockImplementation(async (url, init) => ({ ok: true, status: 200, json: async () => (init.method === "PATCH" ? { updated: 0 } : { created: 1 }) }));
    await post({ action: "save", quote: QUOTE }, staffCookie);
    expect(sentBodies().map((c) => c.method)).toEqual(["PATCH", "POST"]);
  });

  it("reports a sheet failure without crashing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Sheet not found" }) });
    expect((await post({ action: "save", quote: QUOTE }, staffCookie)).statusCode).toBe(502);
  });
});

describe("staff list and delete", () => {
  it("lists the Quotes tab", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [{ QuoteId: "qabc12345xyz" }] });
    const res = await call({ url: "/api/quotes?action=list", cookie: staffCookie });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ QuoteId: "qabc12345xyz" }]);
    expect(fetchMock.mock.calls[0][0]).toContain("?sheet=Quotes");
  });

  it("deleting a quote that's already gone isn't an error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "No results found" }) });
    expect((await post({ action: "delete", id: QUOTE.id }, staffCookie)).statusCode).toBe(200);
  });

  it("deletes one quote by id", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ deleted: 1 }) });
    expect((await post({ action: "delete", id: QUOTE.id }, staffCookie)).statusCode).toBe(200);
    expect(sentBodies()[0]).toMatchObject({ method: "DELETE", url: expect.stringContaining("/QuoteId/qabc12345xyz?sheet=Quotes") });
  });
});
