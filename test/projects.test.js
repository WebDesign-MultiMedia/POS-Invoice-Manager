import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Web Design's GitHub projects (api/_lib/projects.js), through /api/sheets.
// GitHub is mocked; throwaway test values only.
vi.mock("stripe", () => ({ default: vi.fn(function Stripe() { return {}; }) }));
vi.mock("twilio", () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }));

const { setSessionCookie } = await import("../api/_lib/auth.js");
const sheets = (await import("../api/sheets.js")).default;
const { forgetProjects, toProject } = await import("../api/_lib/projects.js");

const fetchMock = vi.fn();
const repo = (name, extra = {}) => ({ name, html_url: `https://github.com/someone/${name}`, description: "d", homepage: "", language: "JavaScript", pushed_at: "2026-11-01T00:00:00Z", fork: false, archived: false, private: false, stargazers_count: 0, ...extra });
const ok = (payload) => ({ ok: true, status: 200, json: async () => payload, headers: { get: () => null } });

function cookie(role, login) {
  const res = mockRes();
  setSessionCookie(res, login, role);
  return cookieFrom(res);
}
async function get(c) {
  const res = mockRes();
  await sheets(mockReq({ url: "/api/sheets?action=projects", cookie: c }), res);
  return res;
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("STAFF_ACCOUNTS", JSON.stringify({ "staff@example.com": "00:00" }));
  vi.stubEnv("WEB_ACCOUNTS", JSON.stringify({ "web@example.com": "00:00" }));
  vi.stubEnv("SHEETDB_ID", "restaurant-sheet");
  vi.stubEnv("GITHUB_USERNAME", "someone");
  vi.stubEnv("GITHUB_TOKEN", "");
  forgetProjects();
  fetchMock.mockReset().mockImplementation(async () => ok([repo("older", { pushed_at: "2026-01-01T00:00:00Z" }), repo("newer", { homepage: "my-site.vercel.app" })]));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GitHub projects", () => {
  it("the Web Design login gets the public repos, newest first", async () => {
    const res = await get(cookie("web", "web@example.com"));
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toBe("someone");
    expect(res.body.projects.map((p) => p.name)).toEqual(["newer", "older"]);
    expect(res.body.projects[0].homepage).toBe("https://my-site.vercel.app");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.github.com/users/someone/repos?type=owner&sort=pushed&per_page=100&page=1");
  });

  it("the owner's login can see them too", async () => {
    expect((await get(cookie("staff", "staff@example.com"))).statusCode).toBe(200);
  });

  it("restaurant employees and visitors can't", async () => {
    expect([401, 403]).toContain((await get(cookie("event", "3475550123"))).statusCode);
    expect((await get("")).statusCode).toBe(401);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("api.github.com"))).toBe(false);
  });

  it("keeps the list for a while instead of asking GitHub every time", async () => {
    const c = cookie("web", "web@example.com");
    await get(c);
    await get(c);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads every page when there are more than 100", async () => {
    const first = Array.from({ length: 100 }, (_, i) => repo(`r${i}`));
    fetchMock.mockReset().mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok([repo("last")]));
    const res = await get(cookie("web", "web@example.com"));
    expect(res.body.projects).toHaveLength(101);
    expect(String(fetchMock.mock.calls[1][0])).toContain("page=2");
  });

  it("explains GitHub's hourly limit", async () => {
    fetchMock.mockReset().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: "rate limit" }), headers: { get: (h) => (h === "x-ratelimit-remaining" ? "0" : null) } });
    const res = await get(cookie("web", "web@example.com"));
    expect(res.statusCode).toBe(429);
    expect(res.body.error).toMatch(/limit/);
  });

  it("with the account's own token, also lists private repos", async () => {
    vi.stubEnv("GITHUB_TOKEN", "test-token");
    fetchMock.mockReset().mockImplementation(async (url) => (String(url).endsWith("/user") ? ok({ login: "Someone" }) : ok([repo("secret", { private: true })])));
    const res = await get(cookie("web", "web@example.com"));
    expect(res.body.projects[0]).toMatchObject({ name: "secret", private: true });
    expect(String(fetchMock.mock.calls[1][0])).toContain("/user/repos?affiliation=owner");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer test-token");
  });

  it("an expired token falls back to the public list", async () => {
    vi.stubEnv("GITHUB_TOKEN", "expired-token");
    fetchMock.mockReset().mockImplementation(async (url, init) => {
      if (init.headers.Authorization) return { ok: false, status: 401, json: async () => ({ message: "Bad credentials" }), headers: { get: () => null } };
      return ok([repo("public-one")]);
    });
    const res = await get(cookie("web", "web@example.com"));
    expect(res.statusCode).toBe(200);
    expect(res.body.projects.map((p) => p.name)).toEqual(["public-one"]);
    expect(String(fetchMock.mock.calls.at(-1)[0])).toContain("/users/someone/repos");
  });

  it("only sends the fields the page shows", () => {
    expect(Object.keys(toProject(repo("x", { owner: { secret: 1 } }))).sort()).toEqual(["archived", "description", "fork", "homepage", "language", "name", "private", "pushedAt", "stars", "topics", "url"]);
  });
});
