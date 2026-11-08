// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuotes } from "../src/hooks/useQuotes.js";
import { makeQuote } from "../src/lib/cateringQuotes.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A fake /api/quotes: a Quotes "sheet" in memory.
let sheet;
let failSaves;
const calls = [];
function fakeFetch(url, init = {}) {
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url, body });
  const reply = (status, data) => Promise.resolve({ ok: status < 400, status, json: async () => data, headers: new Headers() });
  if (String(url).includes("action=list")) return reply(200, sheet);
  if (body?.action === "save") {
    if (failSaves) return reply(502, { error: "down" });
    const q = body.quote;
    const row = { QuoteId: q.id, Code: q.code, CreatedAt: q.createdAt, Source: body.token ? "link" : "staff", CreatedBy: body.employeeName || "staff@example.com", ClientName: q.name, Phone: q.phone, Address: q.address, EventDate: q.eventDate, Notes: q.notes, Total: Number(q.total).toFixed(2), Lines: JSON.stringify(q.lines), SentAt: q.sentAt };
    const i = sheet.findIndex((r) => r.QuoteId === q.id);
    if (i >= 0) sheet[i] = { ...sheet[i], ...row, Source: sheet[i].Source, CreatedBy: sheet[i].CreatedBy };
    else sheet.push(row);
    return reply(200, { ok: true });
  }
  if (body?.action === "delete") {
    sheet = sheet.filter((r) => r.QuoteId !== body.id);
    return reply(200, { ok: true });
  }
  return reply(400, {});
}

let api;
let root;
let container;
function Harness(props) {
  api = useQuotes(props);
  return null;
}
async function mount(props) {
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(createElement(Harness, props)));
}
const flush = async (ms = 0) => act(async () => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sheet = [];
  failSaves = false;
  calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useQuotes", () => {
  it("staff: a new quote is saved on the device and in the shared sheet", async () => {
    await mount({ mode: "staff" });
    const q = makeQuote([], 120);
    await act(async () => api.addQuote(q));
    expect(api.quotes[0].pending).toBe(true);
    await flush(10);
    expect(sheet).toHaveLength(1);
    expect(api.quotes[0]).toMatchObject({ id: q.id, pending: false, synced: true });
    expect(JSON.parse(localStorage.getItem("pim-catering-quotes"))[0].synced).toBe(true);
  });

  it("staff: sees quotes from other devices and employee links", async () => {
    sheet = [{ QuoteId: "qfromlink12345", Code: "1108-1000", CreatedAt: "2026-11-08T10:00:00Z", Source: "link", CreatedBy: "Maria", Total: "350.00", Lines: "[]" }];
    await mount({ mode: "staff" });
    await flush(10);
    expect(api.quotes).toHaveLength(1);
    expect(api.quotes[0]).toMatchObject({ id: "qfromlink12345", source: "link", createdBy: "Maria", total: 350 });
  });

  it("staff: typing is saved once it pauses, not on every key", async () => {
    await mount({ mode: "staff" });
    const q = makeQuote([], 100);
    await act(async () => api.addQuote(q));
    await flush(10);
    calls.length = 0;
    for (const name of ["A", "An", "Ana"]) await act(async () => api.updateQuote({ ...api.quotes[0], name }));
    await flush(500);
    expect(calls.filter((c) => c.body?.action === "save")).toHaveLength(0);
    await flush(1500);
    const saves = calls.filter((c) => c.body?.action === "save");
    expect(saves).toHaveLength(1);
    expect(sheet[0].ClientName).toBe("Ana");
  });

  it("keeps unsent changes when the server is down, and retries", async () => {
    failSaves = true;
    await mount({ mode: "staff" });
    await act(async () => api.addQuote(makeQuote([], 100)));
    await flush(10);
    expect(api.status.error).toBe("save");
    expect(api.quotes[0].pending).toBe(true);
    failSaves = false;
    await flush(20000);
    expect(sheet).toHaveLength(1);
    expect(api.quotes[0].pending).toBe(false);
    expect(api.status.error).toBe(null);
  });

  it("uploads quotes saved on this device before sharing existed", async () => {
    localStorage.setItem("pim-catering-quotes", JSON.stringify([{ ...makeQuote([], 90), number: 1, code: undefined }]));
    await mount({ mode: "staff" });
    await flush(10);
    expect(sheet).toHaveLength(1);
    expect(sheet[0].Code).toBe("#1");
  });

  it("link: sends quotes with the employee's name; deleting only removes the phone's copy", async () => {
    await mount({ mode: "link", link: { token: "tok", employeeName: "Maria" } });
    await flush(10);
    expect(calls.some((c) => String(c.url).includes("action=list"))).toBe(false); // the link can't list
    const q = makeQuote([], 200);
    await act(async () => api.addQuote(q));
    await flush(10);
    expect(sheet[0]).toMatchObject({ QuoteId: q.id, Source: "link", CreatedBy: "Maria" });
    await act(async () => api.removeQuote(q.id));
    expect(api.quotes).toHaveLength(0);
    expect(sheet).toHaveLength(1);
    expect(localStorage.getItem("pim-catering-quotes")).toBe(null); // kept apart from staff quotes
  });

  it("staff: deleting removes it from the shared sheet", async () => {
    await mount({ mode: "staff" });
    const q = makeQuote([], 50);
    await act(async () => api.addQuote(q));
    await flush(10);
    await act(async () => api.removeQuote(q.id));
    expect(sheet).toHaveLength(0);
    expect(api.quotes).toHaveLength(0);
  });

  it("demo: never talks to the server", async () => {
    await mount({ mode: "local" });
    await act(async () => api.addQuote(makeQuote([], 10)));
    await flush(5000);
    expect(calls).toHaveLength(0);
  });
});
