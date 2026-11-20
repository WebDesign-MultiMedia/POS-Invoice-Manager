// Web Design & MultiMedia's GitHub projects, through /api/sheets
// (api/_lib/projects.js). The app's security rules only let the browser
// talk to this app's own server, so the server asks GitHub.
// In demo mode: made-up projects, no server call.
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { isDemo } from "../lib/demo.js";
import { apiErrorFrom } from "../lib/errors.js";
import { DEMO_PROJECTS } from "../lib/demoLeads.js";

// { user, projects: [{ name, description, url, homepage, language, pushedAt, stars, fork, archived, private }] }
export async function fetchProjects() {
  if (isDemo()) return new Promise((resolve) => setTimeout(() => resolve({ user: "demo", projects: DEMO_PROJECTS.map((p) => ({ ...p })) }), 250));
  const res = await fetch("/api/sheets?action=projects");
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}
