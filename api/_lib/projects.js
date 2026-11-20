// Web Design & MultiMedia: the owner's GitHub projects, so they can be
// opened from the app instead of a separate browser tab.
//
// Reached through /api/sheets (no new serverless function):
//   GET ?action=projects   → { user, projects: [...] }
//
// Server env vars (all optional):
//   GITHUB_USERNAME  whose public repos to list (default below: the GitHub
//                    account this app's own repo lives under)
//   GITHUB_TOKEN     a read-only token: lifts GitHub's limit of 60 requests
//                    an hour, and adds the account's private repos when it's
//                    that account's own token
//   VERCEL_TOKEN     a Vercel token: fills in each project's live site from
//                    Vercel (when GitHub has no website set), adds a Vercel
//                    dashboard button, and lists Vercel sites that aren't
//                    on GitHub
//   VERCEL_TEAM_ID   only to limit that to one Vercel team; otherwise every
//                    team the token can see
//
// Only the owner's login and the Web Design login may use it. The list is
// kept for 10 minutes per warm function, so opening the tab again doesn't
// spend GitHub requests.

import { readSessionInfo, NO_ACCESS } from "./auth.js";
import { can } from "./permissions.js";

const DEFAULT_USER = "WebDesign-MultiMedia";
const CACHE_MS = 10 * 60 * 1000;
const MAX_PAGES = 3; // 300 repos
let cache = null;

export function forgetProjects() {
  cache = null;
}

// A repo published with GitHub Pages lives at owner.github.io/repo/ (or
// at owner.github.io itself for the repo named that). GitHub doesn't copy
// that into the repo's website setting, so it's worked out here.
export function pagesUrl(repo) {
  if (!repo?.has_pages) return "";
  const owner = String(repo.owner?.login || "").toLowerCase();
  if (!owner) return "";
  const name = String(repo.name || "");
  return name.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${name}/`;
}

// A GitHub repo → only what the page shows. Live site: the repo's own
// website setting, else its GitHub Pages address (Vercel's comes later,
// in mergeVercel, and goes before Pages).
export function toProject(repo) {
  const homepage = String(repo.homepage ?? "").trim();
  return {
    name: String(repo.name ?? ""),
    description: String(repo.description ?? ""),
    url: String(repo.html_url ?? ""),
    homepage: /^https?:\/\//i.test(homepage) ? homepage : homepage ? `https://${homepage}` : "",
    pages: pagesUrl(repo),
    language: String(repo.language ?? ""),
    topics: Array.isArray(repo.topics) ? repo.topics.map(String) : [],
    pushedAt: String(repo.pushed_at ?? repo.updated_at ?? ""),
    stars: Number(repo.stargazers_count) || 0,
    vercel: "",
    fork: Boolean(repo.fork),
    archived: Boolean(repo.archived),
    private: Boolean(repo.private),
  };
}

async function githubGet(path, { token = "" } = {}) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "pos-invoice-manager", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com${path}`, { headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("projects: GitHub responded", response.status, payload?.message);
    const limited = response.status === 429 || (response.status === 403 && response.headers?.get?.("x-ratelimit-remaining") === "0");
    const error = new Error(
      limited
        ? "GitHub's hourly limit for this server was reached. Try again in a little while (or add a GITHUB_TOKEN in Vercel)."
        : response.status === 404
          ? "That GitHub account wasn't found (GITHUB_USERNAME)."
          : "GitHub didn't answer. Try again."
    );
    error.status = limited ? 429 : response.status === 404 ? 404 : 502;
    throw error;
  }
  return payload;
}

// With a token for this same account, /user/repos also lists private
// repos; otherwise the public list. A token GitHub refuses (expired, or
// typed wrong) is left out, so the public list still shows.
async function listRepos(user) {
  let token = String(process.env.GITHUB_TOKEN || "").trim();
  let ownToken = false;
  if (token) {
    const me = await githubGet("/user", { token }).catch((err) => {
      if (err.status !== 429) {
        console.error("projects: GITHUB_TOKEN was refused (expired?); listing public repos without it");
        token = "";
      }
      return null;
    });
    ownToken = String(me?.login || "").toLowerCase() === user.toLowerCase();
  }
  const repos = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const path = ownToken
      ? `/user/repos?affiliation=owner&sort=pushed&per_page=100&page=${page}`
      : `/users/${encodeURIComponent(user)}/repos?type=owner&sort=pushed&per_page=100&page=${page}`;
    const batch = await githubGet(path, { token });
    if (!Array.isArray(batch)) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

// ---------- Vercel ----------

async function vercelGet(path) {
  const response = await fetch(`https://api.vercel.com${path}`, { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`Vercel responded ${response.status}: ${payload?.error?.message || ""}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

// The address people should open: a custom domain if it has one, else
// "<name>.vercel.app", else the shortest one.
export function liveDomain(project) {
  const aliases = [...(project?.targets?.production?.alias || []), ...(Array.isArray(project?.alias) ? project.alias.map((a) => a?.domain || a) : [])]
    .map((d) => String(d || "").trim().toLowerCase())
    .filter(Boolean);
  if (!aliases.length) return "";
  const custom = aliases.find((d) => !d.endsWith(".vercel.app"));
  const plain = aliases.find((d) => d === `${String(project.name).toLowerCase()}.vercel.app`);
  const pick = custom || plain || [...aliases].sort((a, b) => a.length - b.length)[0];
  return `https://${pick}`;
}

// Every Vercel project the token can see: { name, repo, org, url, dashboard, updatedAt }.
async function listVercel() {
  if (!process.env.VERCEL_TOKEN) return [];
  let teams;
  if (process.env.VERCEL_TEAM_ID) teams = [{ id: process.env.VERCEL_TEAM_ID, slug: "" }];
  else teams = ((await vercelGet("/v2/teams?limit=50"))?.teams || []).map((t) => ({ id: t.id, slug: t.slug || "" }));
  const out = [];
  for (const team of teams) {
    let from = "";
    for (let page = 0; page < 5; page++) {
      const data = await vercelGet(`/v9/projects?teamId=${encodeURIComponent(team.id)}&limit=100${from ? `&from=${encodeURIComponent(from)}` : ""}`);
      for (const p of data?.projects || []) {
        const github = p.link?.type === "github";
        out.push({
          name: String(p.name || ""),
          repo: github ? String(p.link.repo || "") : "",
          org: github ? String(p.link.org || "") : "",
          url: liveDomain(p),
          dashboard: team.slug ? `https://vercel.com/${team.slug}/${p.name}` : "https://vercel.com/dashboard",
          updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
        });
      }
      from = data?.pagination?.next;
      if (!from) break;
    }
  }
  return out;
}

const squashName = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// GitHub projects + what Vercel knows. A Vercel project matches a repo by
// its linked GitHub repo, or else by the same name ("sulys-sweets" =
// "SulysSweets"). GitHub's own website setting wins when both exist.
// Vercel projects with no repo here are added as "Vercel only".
export function mergeVercel(projects, vercelProjects) {
  const used = new Set();
  const merged = projects.map((p) => {
    const match =
      vercelProjects.find((v) => v.repo && v.repo.toLowerCase() === p.name.toLowerCase()) ||
      vercelProjects.find((v) => !v.repo && squashName(v.name) === squashName(p.name));
    if (!match) return p;
    used.add(match);
    return { ...p, homepage: p.homepage || match.url, vercel: match.dashboard };
  });
  // No website setting and not on Vercel: the GitHub Pages site, if any.
  for (const p of merged) if (!p.homepage && p.pages) p.homepage = p.pages;
  for (const v of vercelProjects) {
    if (used.has(v)) continue;
    // Linked to a repo that isn't in the list (another account, or private
    // without a token): still worth showing.
    merged.push({
      name: v.name,
      description: v.repo ? `Deployed from ${v.org ? `${v.org}/` : ""}${v.repo}` : "On Vercel only (not linked to a GitHub project)",
      url: v.repo && v.org ? `https://github.com/${v.org}/${v.repo}` : "",
      homepage: v.url,
      language: "",
      topics: [],
      pushedAt: v.updatedAt,
      stars: 0,
      fork: false,
      archived: false,
      private: false,
      vercel: v.dashboard,
      vercelOnly: true,
    });
  }
  return merged;
}

export async function handleProjects(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const session = await readSessionInfo(req);
  if (!session) return res.status(401).json({ error: "Please log in" });
  if (!can(session, "webdesign")) return res.status(403).json({ error: NO_ACCESS });
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = String(process.env.GITHUB_USERNAME || DEFAULT_USER).trim();
  try {
    if (!cache || cache.user !== user || Date.now() - cache.at > CACHE_MS) {
      const [repos, vercelProjects] = await Promise.all([
        listRepos(user),
        // Vercel is extra: if it fails, the GitHub list still shows.
        listVercel().catch((err) => {
          console.error("projects: couldn't read Vercel:", err.message);
          return [];
        }),
      ]);
      const projects = mergeVercel(repos.map(toProject), vercelProjects).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
      cache = { at: Date.now(), user, projects };
    }
    return res.status(200).json({ user, projects: cache.projects });
  } catch (err) {
    // A stale list beats an error when GitHub hiccups.
    if (cache?.user === user) return res.status(200).json({ user, projects: cache.projects, stale: true });
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Couldn't load the GitHub projects." });
  }
}
