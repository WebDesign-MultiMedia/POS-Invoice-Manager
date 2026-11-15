import { afterEach, describe, expect, it, vi } from "vitest";
import { sheetdbFetch } from "../api/_lib/sheetdb.js";

const reply = (status, body) => new Response(JSON.stringify(body), { status });

describe("sheetdbFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads once more when Google Sheets timed out", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(400, { error: "cURL error 28: Connection timed out after 3002 milliseconds" })).mockResolvedValueOnce(reply(200, [{ Id: "1" }]));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sheetdbFetch("https://sheetdb.io/api/v1/x");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await res.json()).toEqual([{ Id: "1" }]);
  });

  it("never repeats a write, and leaves other errors alone", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(500, { error: "boom" }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await sheetdbFetch("https://sheetdb.io/api/v1/x", { method: "POST" })).status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear().mockResolvedValue(reply(429, { error: "Request limit exceeded. Upgrade your plan." }));
    expect((await sheetdbFetch("https://sheetdb.io/api/v1/x")).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
