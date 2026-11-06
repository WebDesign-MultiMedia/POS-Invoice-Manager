import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiErrorFrom, friendlyMessage } from "../src/lib/errors.js";

afterEach(() => vi.unstubAllGlobals());

describe("friendlyMessage", () => {
  it("explains network failures in plain words", () => {
    expect(friendlyMessage(new TypeError("Failed to fetch"), "Couldn't save the order.")).toMatch(/Couldn't reach the server/);
  });

  it("says when the device is offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(friendlyMessage(new Error("x"))).toMatch(/internet connection/);
  });

  it("asks to log in again on 401", () => {
    expect(friendlyMessage(new ApiError(401, "Please log in"))).toBe("Your login expired. Please log in again.");
  });

  it("shows our API's own 4xx messages, which are written for staff", () => {
    expect(friendlyMessage(new ApiError(400, "Message content required"))).toBe("Message content required");
  });

  it("never shows raw 5xx details", () => {
    const msg = friendlyMessage(new ApiError(502, "Sheet request failed: upstream 500 at line 4"), "Couldn't load orders.");
    expect(msg).toMatch(/^Couldn't load orders\. The server had a problem/);
    expect(msg).not.toMatch(/upstream|line 4/);
  });

  it("falls back to the given sentence for anything else", () => {
    expect(friendlyMessage(new Error("Unexpected token < in JSON"), "Couldn't load the invoice.")).toBe("Couldn't load the invoice.");
  });
});

describe("apiErrorFrom", () => {
  it("reads the server's error message", async () => {
    const err = await apiErrorFrom({ status: 400, json: async () => ({ error: "Unknown action" }) });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.serverMessage).toBe("Unknown action");
  });

  it("copes with a non-JSON body (e.g. an HTML error page)", async () => {
    const err = await apiErrorFrom({ status: 504, json: async () => JSON.parse("<html>") });
    expect(err.status).toBe(504);
    expect(err.serverMessage).toBe("");
  });
});
