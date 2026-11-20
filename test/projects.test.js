import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReq, mockRes, cookieFrom } from "./helpers.js";

// Web Design's GitHub projects (api/_lib/projects.js), through /api/sheets.
// GitHub is mocked; throwaway test values only.
vi.mock("stripe", () => ({ default: vi.fn(function Stripe() { return {}; }) }));
vi.mock("twilio", () => ({ default: vi.fn(() => ({ messages: { create: vi.fn() } })) }));

const { setSessionCookie } = await import("../api/_lib/auth.js");
const sheets = (await import("../api/sheets.js")).default;
const { forgetProjects, toProject, liveDomain, mergeVercel } = await import("../api/_lib/projects.js");

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
    expect(Object.keys(toProject(repo("x", { owner: { secret: 1 } }))).sort()).toEqual(["archived", "description", "fork", "homepage", "language", "name", "pages", "private", "pushedAt", "stars", "topics", "url", "vercel"]);
  });
});

describe("Vercel live sites", () => {
  const vercelProject = (name, extra = {}) => ({ name, updatedAt: Date.parse("2026-11-10T00:00:00Z"), targets: { production: { alias: [`${name}.vercel.app`, `${name}-team.vercel.app`] } }, ...extra });

  function withVercel(projects) {
    vi.stubEnv("VERCEL_TOKEN", "test-vercel-token");
    fetchMock.mockReset().mockImplementation(async (url) => {
      const u = String(url);
      if (u.startsWith("https://api.vercel.com/v2/teams")) return ok({ teams: [{ id: "team_1", slug: "my-team" }] });
      if (u.startsWith("https://api.vercel.com/v9/projects")) return ok({ projects, pagination: { next: null } });
      return ok([repo("POS-Invoice-Manager"), repo("SulysSweets"), repo("has-own-site", { homepage: "https://mine.example.com" })]);
    });
  }

  it("fills in live sites from Vercel, by linked repo or same name", async () => {
    withVercel([
      vercelProject("pos-invoice-manager", { link: { type: "github", repo: "POS-Invoice-Manager", org: "someone" } }),
      vercelProject("sulys-sweets"),
      vercelProject("has-own-site", { link: { type: "github", repo: "has-own-site", org: "someone" } }),
    ]);
    const res = await get(cookie("web", "web@example.com"));
    const by = Object.fromEntries(res.body.projects.map((p) => [p.name, p]));
    expect(by["POS-Invoice-Manager"]).toMatchObject({ homepage: "https://pos-invoice-manager.vercel.app", vercel: "https://vercel.com/my-team/pos-invoice-manager" });
    expect(by.SulysSweets.homepage).toBe("https://sulys-sweets.vercel.app");
    // GitHub's own website setting wins.
    expect(by["has-own-site"].homepage).toBe("https://mine.example.com");
    const vercelCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("api.vercel.com"));
    expect(vercelCalls[0][1].headers.Authorization).toBe("Bearer test-vercel-token");
  });

  it("lists Vercel sites that aren't on GitHub", async () => {
    withVercel([vercelProject("dream-stars-daycare")]);
    const res = await get(cookie("web", "web@example.com"));
    expect(res.body.projects.find((p) => p.name === "dream-stars-daycare")).toMatchObject({ vercelOnly: true, homepage: "https://dream-stars-daycare.vercel.app", url: "" });
  });

  it("if Vercel fails, the GitHub list still shows", async () => {
    vi.stubEnv("VERCEL_TOKEN", "bad");
    fetchMock.mockReset().mockImplementation(async (url) =>
      String(url).includes("api.vercel.com") ? { ok: false, status: 403, json: async () => ({ error: { message: "forbidden" } }), headers: { get: () => null } } : ok([repo("one")])
    );
    const res = await get(cookie("web", "web@example.com"));
    expect(res.statusCode).toBe(200);
    expect(res.body.projects.map((p) => p.name)).toEqual(["one"]);
  });

  it("without a Vercel token, Vercel isn't asked", async () => {
    await get(cookie("web", "web@example.com"));
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("api.vercel.com"))).toBe(false);
  });

  it("picks a custom domain first, then <name>.vercel.app", () => {
    expect(liveDomain({ name: "shop", targets: { production: { alias: ["shop-x.vercel.app", "www.shop.com", "shop.vercel.app"] } } })).toBe("https://www.shop.com");
    expect(liveDomain({ name: "shop", targets: { production: { alias: ["shop-team.vercel.app", "shop.vercel.app"] } } })).toBe("https://shop.vercel.app");
    expect(liveDomain({ name: "shop" })).toBe("");
  });

  it("a repo linked from another account still shows, with its code link", () => {
    const merged = mergeVercel([], [{ name: "x", repo: "Other", org: "someone-else", url: "https://x.vercel.app", dashboard: "d", updatedAt: "" }]);
    expect(merged[0]).toMatchObject({ url: "https://github.com/someone-else/Other", vercelOnly: true });
  });
});

describe("GitHub Pages sites", () => {
  it("a repo with Pages turned on gets its github.io address", async () => {
    fetchMock.mockReset().mockImplementation(async () => ok([repo("Tracker_World", { has_pages: true, owner: { login: "Some-One" } }), repo("no-site")]));
    const res = await get(cookie("web", "web@example.com"));
    const by = Object.fromEntries(res.body.projects.map((p) => [p.name, p]));
    expect(by.Tracker_World.homepage).toBe("https://some-one.github.io/Tracker_World/");
    expect(by["no-site"].homepage).toBe("");
  });

  it("the repo's own website setting and Vercel come before Pages", () => {
    const own = toProject(repo("a", { homepage: "https://mine.example.com", has_pages: true, owner: { login: "x" } }));
    expect(mergeVercel([own], [])[0].homepage).toBe("https://mine.example.com");
    const onVercel = toProject(repo("b", { has_pages: true, owner: { login: "x" } }));
    expect(mergeVercel([onVercel], [{ name: "b", repo: "b", org: "x", url: "https://b.vercel.app", dashboard: "d", updatedAt: "" }])[0].homepage).toBe("https://b.vercel.app");
  });

  it("the account's own user-site repo is the root address", () => {
    expect(toProject(repo("x.github.io", { has_pages: true, owner: { login: "X" } })).pages).toBe("https://x.github.io/");
  });
});
