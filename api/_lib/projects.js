// Web Design & MultiMedia: the owner's GitHub projects, so they can be
// opened from the app instead of a separate browser tab.
//
// Reached through /api/sheets (no new serverless function):
//   GET ?action=projects   → { user, projects: [...] }
//
// Server env vars (both optional):
//   GITHUB_USERNAME  whose public repos to list (default below: the GitHub
//                    account this app's own repo lives under)
//   GITHUB_TOKEN     a read-only token: lifts GitHub's limit of 60 requests
//                    an hour, and adds the account's private repos when it's
//                    that account's own token
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

// A GitHub repo → only what the page shows.
export function toProject(repo) {
  const homepage = String(repo.homepage ?? "").trim();
  return {
    name: String(repo.name ?? ""),
    description: String(repo.description ?? ""),
    url: String(repo.html_url ?? ""),
    homepage: /^https?:\/\//i.test(homepage) ? homepage : homepage ? `https://${homepage}` : "",
    language: String(repo.language ?? ""),
    topics: Array.isArray(repo.topics) ? repo.topics.map(String) : [],
    pushedAt: String(repo.pushed_at ?? repo.updated_at ?? ""),
    stars: Number(repo.stargazers_count) || 0,
    fork: Boolean(repo.fork),
    archived: Boolean(repo.archived),
    private: Boolean(repo.private),
  };
}

async function githubGet(path) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "pos-invoice-manager", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
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
// repos; otherwise the public list.
async function listRepos(user) {
  let ownToken = false;
  if (process.env.GITHUB_TOKEN) {
    const me = await githubGet("/user").catch(() => null);
    ownToken = String(me?.login || "").toLowerCase() === user.toLowerCase();
  }
  const repos = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const path = ownToken
      ? `/user/repos?affiliation=owner&sort=pushed&per_page=100&page=${page}`
      : `/users/${encodeURIComponent(user)}/repos?type=owner&sort=pushed&per_page=100&page=${page}`;
    const batch = await githubGet(path);
    if (!Array.isArray(batch)) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
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
      const projects = (await listRepos(user)).map(toProject).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
      cache = { at: Date.now(), user, projects };
    }
    return res.status(200).json({ user, projects: cache.projects });
  } catch (err) {
    // A stale list beats an error when GitHub hiccups.
    if (cache?.user === user) return res.status(200).json({ user, projects: cache.projects, stale: true });
    return res.status(err.status || 500).json({ error: err.status ? err.message : "Couldn't load the GitHub projects." });
  }
}
