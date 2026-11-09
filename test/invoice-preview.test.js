import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes } from "./helpers.js";

const { default: handler, previewFor, withPreview } = await import("../api/invoice-preview.js");
const { shareTokenFor } = await import("../api/_lib/auth.js");

const INDEX = `<!doctype html><html><head>
    <title>Buffet Lucia Fiesta Mexicana | POS-Invoice-Manager</title>
  </head><body><div id="root"></div></body></html>`;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("SHEETDB_ID", "test-sheet");
  fetchMock.mockReset().mockImplementation(async (url) =>
    String(url).endsWith("/index.html")
      ? { ok: true, status: 200, text: async () => INDEX }
      : { ok: true, status: 200, json: async () => [{ Id: "1013", Name: "Ana <López>", Cost: "240" }] }
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open(query) {
  const res = mockRes();
  await handler(mockReq({ url: `/invoice?${query}`, headers: { host: "pos.example.com" } }), res);
  return res;
}

describe("invoice link preview", () => {
  it("a valid link previews the invoice number, customer and total", async () => {
    const res = await open(`id=1013&token=${shareTokenFor("1013")}&share=1`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body).toContain("<title>Invoice #1013 · Ana &lt;López&gt;</title>");
    expect(res.body).toContain('<meta property="og:title" content="Invoice #1013 · Ana &lt;López&gt;" />');
    expect(res.body).toContain('content="Buffet Lucia Fiesta Mexicana · Total $240.00"');
    expect(res.body).toContain('<meta property="og:image" content="https://pos.example.com/icons/apple-touch-icon.png" />');
    expect(res.body).toContain('<div id="root"></div>'); // still the app
  });

  it("a wrong token never looks up or shows customer details", async () => {
    const res = await open("id=1013&token=bad&share=1");
    expect(res.body).toContain("<title>Buffet Lucia Fiesta Mexicana · Invoice</title>");
    expect(res.body).not.toContain("Ana");
    expect(fetchMock).toHaveBeenCalledTimes(1); // only index.html
  });

  it("still opens the invoice if the sheet lookup fails", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/index.html") ? { ok: true, status: 200, text: async () => INDEX } : { ok: false, status: 500, json: async () => ({}) }
    );
    const res = await open(`id=1013&token=${shareTokenFor("1013")}&share=1`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>Buffet Lucia Fiesta Mexicana · Invoice</title>");
  });

  it("builds the text and tags", () => {
    expect(previewFor({ Name: "", Cost: "" }, "7")).toEqual({ title: "Invoice #7", description: "Buffet Lucia Fiesta Mexicana" });
    const html = withPreview('<head><meta property="og:title" content="old" /><title>x</title></head>', { title: "T", description: "D" });
    expect(html.match(/og:title/g)).toHaveLength(1);
    expect(html).toContain("<title>T</title>");
  });
});
