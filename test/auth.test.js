import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hashPassword,
  checkCredentials,
  normalizeIdentifier,
  setSessionCookie,
  clearSessionCookie,
  readSession,
  requireStaff,
  shareTokenFor,
  isValidShareToken,
  isAuthConfigured,
} from "../api/_lib/auth.js";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Throwaway test credentials only; nothing here is a real secret.
const PASSWORD = "correct horse battery staple";
const OWNER_HASH = hashPassword(PASSWORD);
const PHONE_HASH = hashPassword("another long test password");

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret-0123456789abcdef");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "Owner@Example.com": OWNER_HASH, "(347) 555-0100": PHONE_HASH }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("normalizeIdentifier", () => {
  it("lower-cases and trims emails", () => {
    expect(normalizeIdentifier("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("reduces any phone format to its last 10 digits", () => {
    for (const phone of ["(347) 555-0100", "347.555.0100", "+1 347 555 0100", "13475550100", "3475550100"]) {
      expect(normalizeIdentifier(phone)).toBe("3475550100");
    }
  });

  it("leaves short or empty input alone", () => {
    expect(normalizeIdentifier("12345")).toBe("12345");
    expect(normalizeIdentifier(undefined)).toBe("");
  });
});

describe("hashPassword / checkCredentials", () => {
  it("produces a salted salt:hash string, different every time", () => {
    const a = hashPassword("same password");
    const b = hashPassword("same password");
    expect(a).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(a).not.toBe(b);
  });

  it("accepts the right password, for email or phone logins in any format", () => {
    expect(checkCredentials("owner@example.com", PASSWORD)).toBe("owner@example.com");
    expect(checkCredentials("OWNER@EXAMPLE.COM", PASSWORD)).toBe("owner@example.com");
    expect(checkCredentials("+1 347-555-0100", "another long test password")).toBe("3475550100");
  });

  it("rejects a wrong password or unknown login", () => {
    expect(checkCredentials("owner@example.com", "wrong password")).toBeNull();
    expect(checkCredentials("nobody@example.com", PASSWORD)).toBeNull();
  });

  it("rejects malformed stored hashes and malformed STAFF_ACCOUNTS", () => {
    vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "a@example.com": "not-a-hash" }));
    expect(checkCredentials("a@example.com", "anything")).toBeNull();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("STAFF_ACCOUNTS", "{not json");
    expect(checkCredentials("owner@example.com", PASSWORD)).toBeNull();
    expect(isAuthConfigured()).toBe(false);
    errorSpy.mockRestore();
  });

  it("reports whether login is configured", () => {
    expect(isAuthConfigured()).toBe(true);
    vi.stubEnv("SESSION_SECRET", "");
    expect(isAuthConfigured()).toBe(false);
  });
});

describe("session cookie", () => {
  function loggedInCookie(login = "owner@example.com") {
    const res = mockRes();
    setSessionCookie(res, login);
    return { res, cookie: cookieFrom(res) };
  }

  it("is HttpOnly, SameSite=Lax and lasts 7 days", () => {
    const { res } = loggedInCookie();
    const header = res.headers["set-cookie"];
    expect(header).toMatch(/^pim_session=/);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain(`Max-Age=${7 * 24 * 60 * 60}`);
  });

  it("is Secure on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(loggedInCookie().res.headers["set-cookie"]).toContain("Secure");
  });

  it("reads back a valid session", () => {
    const { cookie } = loggedInCookie();
    expect(readSession(mockReq({ cookie }))).toBe("owner@example.com");
  });

  it("rejects a tampered payload", () => {
    const { cookie } = loggedInCookie();
    const [name, value] = cookie.split("=");
    const [payload, sig] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "owner@example.com", exp: Date.now() + 1e12 })).toString("base64url");
    expect(readSession(mockReq({ cookie: `${name}=${forged}.${sig}` }))).toBeNull();
    expect(readSession(mockReq({ cookie: `${name}=${payload}.${sig.slice(0, -2)}xx` }))).toBeNull();
    expect(readSession(mockReq({ cookie: `${name}=${payload}` }))).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const { cookie } = loggedInCookie();
    vi.stubEnv("SESSION_SECRET", "a-different-secret");
    expect(readSession(mockReq({ cookie }))).toBeNull();
  });

  it("expires after 7 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const { cookie } = loggedInCookie();
    vi.setSystemTime(new Date("2026-01-08T11:59:00Z"));
    expect(readSession(mockReq({ cookie }))).toBe("owner@example.com");
    vi.setSystemTime(new Date("2026-01-08T12:01:00Z"));
    expect(readSession(mockReq({ cookie }))).toBeNull();
  });

  it("ends right away when the account is removed", () => {
    const { cookie } = loggedInCookie();
    vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "3475550100": PHONE_HASH }));
    expect(readSession(mockReq({ cookie }))).toBeNull();
  });

  it("logout clears the cookie", () => {
    const res = mockRes();
    clearSessionCookie(res);
    expect(res.headers["set-cookie"]).toMatch(/^pim_session=;.*Max-Age=0/);
  });

  it("requireStaff sends 401 without a session", () => {
    const res = mockRes();
    expect(requireStaff(mockReq(), res)).toBeNull();
    expect(res.statusCode).toBe(401);
  });
});

describe("invoice share tokens", () => {
  it("validates a token for its own invoice", () => {
    expect(isValidShareToken("714", shareTokenFor("714"))).toBe(true);
  });

  it("rejects the token on a different invoice", () => {
    expect(isValidShareToken("715", shareTokenFor("714"))).toBe(false);
  });

  it("rejects a tampered, empty or missing token", () => {
    const token = shareTokenFor("714");
    const flipped = (token[0] === "A" ? "B" : "A") + token.slice(1);
    expect(isValidShareToken("714", flipped)).toBe(false);
    expect(isValidShareToken("714", "")).toBe(false);
    expect(isValidShareToken("714", undefined)).toBe(false);
    expect(isValidShareToken("", token)).toBe(false);
  });

  it("stops working if the secret changes, and never validates without one", () => {
    const token = shareTokenFor("714");
    vi.stubEnv("SESSION_SECRET", "rotated-secret");
    expect(isValidShareToken("714", token)).toBe(false);
    vi.stubEnv("SESSION_SECRET", "");
    expect(isValidShareToken("714", token)).toBe(false);
  });
});
