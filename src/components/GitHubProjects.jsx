import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchProjects } from "../api/projects.js";
import { friendlyMessage } from "../lib/errors.js";
import { PROJECT_FILTERS, matchesProject, projectTitle, updatedAgo } from "../lib/leads.js";

// Web Design & MultiMedia's GitHub projects: each one's live site and code,
// newest first, so they open from here instead of another browser tab.

const OUTLINE = "btn-3d !py-2 !px-3 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy";
const CHIP = "rounded-full px-3 py-1.5 text-sm font-semibold border transition-colors";
const chipClass = (on) => `${CHIP} ${on ? "bg-brand-teal text-white border-brand-teal" : "border-brand-navy/30 text-brand-navy"}`;

export default function GitHubProjects() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showOld, setShowOld] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchProjects());
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't load the GitHub projects."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const projects = useMemo(() => data?.projects || [], [data]);
  const shown = useMemo(() => projects.filter((p) => matchesProject(p, { filter, query, showOld })), [projects, filter, query, showOld]);
  const hiddenOld = projects.filter((p) => p.archived || p.fork).length;
  const liveCount = projects.filter((p) => p.homepage && !p.archived && !p.fork).length;

  return (
    <section className="w-full max-w-3xl flex flex-col gap-4" aria-label="GitHub projects">
      <div className="glass-card p-4 flex flex-col gap-3">
        <label htmlFor="project-search" className="sr-only">
          Search projects
        </label>
        <input id="project-search" type="search" className="input-3d" placeholder="Search name, description, language" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {PROJECT_FILTERS.map((f) => (
            <button key={f.key} type="button" className={chipClass(filter === f.key)} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
              {f.key === "live" && liveCount ? ` (${liveCount})` : ""}
            </button>
          ))}
          {hiddenOld > 0 && (
            <button type="button" className={chipClass(showOld)} aria-pressed={showOld} onClick={() => setShowOld((v) => !v)}>
              Archived & forks ({hiddenOld})
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="glass-panel p-4 text-center text-sm flex flex-col gap-3 items-center">
          <p className="text-brand-error font-semibold">{error}</p>
          <button type="button" className={OUTLINE} onClick={load}>
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <p role="status" className="text-center text-brand-navydeep/80">
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading projects…
        </p>
      ) : (
        !error && (
          <p className="text-center text-sm text-brand-navydeep/80">
            {shown.length} of {projects.length} projects
            {data?.user && data.user !== "demo" && (
              <>
                {" · "}
                <a className="underline font-semibold" href={`https://github.com/${encodeURIComponent(data.user)}?tab=repositories`} target="_blank" rel="noopener noreferrer">
                  Open GitHub
                </a>
              </>
            )}
            {data?.stale ? " · couldn't refresh from GitHub, showing the last list" : ""}
          </p>
        )
      )}

      {shown.map((p) => (
        <ProjectCard key={p.name} project={p} />
      ))}
    </section>
  );
}

function ProjectCard({ project: p }) {
  return (
    <article className="glass-card p-4 flex flex-col gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-brand-navy break-words">{projectTitle(p.name)}</h2>
        <p className="text-xs text-brand-navydeep/70 flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
          {p.language && (
            <span>
              <i className="fa-solid fa-code" aria-hidden="true"></i> {p.language}
            </span>
          )}
          {p.pushedAt && <span>Updated {updatedAgo(p.pushedAt)}</span>}
          {p.stars > 0 && (
            <span>
              <i className="fa-solid fa-star" aria-hidden="true"></i> {p.stars}
            </span>
          )}
          {p.private && <span className="text-brand-terracotta font-semibold">Private</span>}
          {p.archived && <span className="font-semibold">Archived</span>}
          {p.fork && <span className="font-semibold">Fork</span>}
        </p>
        {p.description && <p className="text-sm text-brand-navydeep/90 mt-2 break-words">{p.description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {p.homepage && (
          <a href={p.homepage} className="btn-3d !py-2 !px-3 text-sm justify-center" target="_blank" rel="noopener noreferrer">
            <i className="fa-solid fa-globe" aria-hidden="true"></i> Live site
          </a>
        )}
        {p.url && (
          <a href={p.url} className={OUTLINE} target="_blank" rel="noopener noreferrer">
            <i className="fa-brands fa-github" aria-hidden="true"></i> Code
          </a>
        )}
      </div>
    </article>
  );
}
