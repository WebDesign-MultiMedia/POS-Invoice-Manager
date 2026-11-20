import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import GitHubProjects from "../components/GitHubProjects.jsx";
import useStoredState from "../hooks/useStoredState.js";
import { createLead, deleteLead, fetchLeads, restoreLead, updateLead } from "../api/leads.js";
import { friendlyMessage } from "../lib/errors.js";
import { EMPTY_LEAD, LEAD_FIELDS, LEAD_FILTERS, YES_NO_FIELDS, businessTypes, isAnsweredWithWebsite, linkFor, matchesFilter, matchesSearch, telLink, yesNo } from "../lib/leads.js";

// Web Design & MultiMedia: businesses that might want a website. Its own
// Google Sheet and SheetDB API (api/_lib/leads.js); the Web Design login
// sees only this page, the owner's login can open it too.

const LOGO = { src: "/imgs/WebDesignMultiMedia-logo.png", alt: "Web Design & MultiMedia logo", icon: "fa-laptop-code" };
const OUTLINE = "btn-3d !py-2 !px-3 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy disabled:opacity-60";
const DANGER = "btn-3d !py-2 !px-3 text-sm justify-center !bg-none !bg-transparent border border-brand-error/60 text-brand-error disabled:opacity-60";
const CHIP = "rounded-full px-3 py-1.5 text-sm font-semibold border transition-colors";
const ALERT_BASE = { showDenyButton: false, showConfirmButton: false, theme: "dark", backdrop: "rgba(9, 8, 9, 0.87) left top no-repeat" };
// Per-phone conveniences (try/catch: storage can be blocked).
const BOTH_OPEN_KEY = "pim-webdesign-both-open";
function readFlag(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage blocked: it just won't be remembered.
  }
}
const byName = (a, b) => String(a.BusinessName).localeCompare(String(b.BusinessName));
const chipClass = (on) => `${CHIP} ${on ? "bg-brand-teal text-white border-brand-teal" : "border-brand-navy/30 text-brand-navy"}`;

const TABS = [
  { key: "leads", label: "Leads", icon: "fa-address-book" },
  { key: "projects", label: "Projects", icon: "fa-github", brand: true },
];

// Two tabs: Leads (the sheet) and Projects (GitHub). The phone remembers
// the last one (a ?tab=projects link still opens Projects). Each tab loads
// the first time it's opened and then stays loaded, so switching back and
// forth doesn't spend SheetDB or GitHub requests.
const TAB_KEYS = ["leads", "projects"];
export default function WebDesignPage() {
  const [params, setParams] = useSearchParams();
  const [savedTab, setSavedTab] = useStoredState("pim-webdesign-tab", "leads", (v) => TAB_KEYS.includes(v));
  const linked = params.get("tab");
  const tab = TAB_KEYS.includes(linked) ? linked : savedTab;
  const [opened, setOpened] = useState(() => new Set([tab]));
  const pick = (key) => {
    setOpened((o) => new Set(o).add(key));
    setSavedTab(key);
    setParams(key === "leads" ? {} : { tab: key }, { replace: true });
  };

  return (
    <Layout blobs={["bg-brand-teal w-72 h-72 -top-10 -left-10 animate-float-slow", "bg-brand-terracotta w-80 h-80 top-1/2 -right-16 animate-float"]}>
      <SiteNav className="mb-6" />
      <PageHeader logo={LOGO} logoSize="w-36 h-36 sm:w-44 sm:h-44" title="Web Design & MultiMedia" subtitle={tab === "projects" ? "My projects" : "Business leads"} />

      <div role="tablist" aria-label="Web Design sections" className="glass-panel !rounded-full p-1 flex gap-1 mb-5 w-full max-w-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${tab === t.key ? "bg-brand-teal text-white" : "text-brand-navy"}`}
            onClick={() => pick(t.key)}
          >
            <i className={`${t.brand ? "fa-brands" : "fa-solid"} ${t.icon}`} aria-hidden="true"></i> {t.label}
          </button>
        ))}
      </div>

      {(opened.has("leads") || tab === "leads") && (
        <div className={tab === "leads" ? "w-full flex flex-col items-center" : "hidden"}>
          <LeadsSection />
        </div>
      )}
      {(opened.has("projects") || tab === "projects") && (
        <div className={tab === "projects" ? "w-full flex flex-col items-center" : "hidden"}>
          <GitHubProjects />
        </div>
      )}
    </Layout>
  );
}

function LeadsSection() {
  const [leads, setLeads] = useState([]);
  const [canEdit, setCanEdit] = useState(true);
  const [deleted, setDeleted] = useState([]);
  const [canDelete, setCanDelete] = useState(true);
  const [showDeleted, setShowDeleted] = useStoredState("pim-webdesign-deleted-open", false, (v) => typeof v === "boolean");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // Remembered on this phone, so a refresh keeps the same view.
  const [filter, setFilter] = useStoredState("pim-webdesign-filter", "all", (v) => LEAD_FILTERS.some((f) => f.key === v));
  const [savedType, setType] = useStoredState("pim-webdesign-type", "", (v) => typeof v === "string");
  // null, "new", or the Id being edited.
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await fetchLeads();
      setLeads(Array.isArray(data?.leads) ? data.leads : []);
      setCanEdit(data?.canEdit !== false);
      setDeleted(Array.isArray(data?.deleted) ? data.deleted : []);
      setCanDelete(data?.canDelete !== false);
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't load the businesses."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const types = useMemo(() => businessTypes(leads), [leads]);
  // A remembered type that's no longer in the sheet counts as "every type".
  const type = types.find((t) => t.toLowerCase() === savedType.toLowerCase()) || "";
  const shown = useMemo(
    () =>
      leads
        .filter((l) => matchesFilter(l, filter) && matchesSearch(l, query) && (!type || String(l.BusinessType).trim().toLowerCase() === type.toLowerCase()))
        .sort(byName),
    [leads, filter, query, type]
  );

  // Answered the phone and already have a website: their own box, after
  // the rest of the list. Open or closed stays how it was left.
  const regular = shown.filter((l) => !isAnsweredWithWebsite(l));
  const both = shown.filter(isAnsweredWithWebsite);
  const [bothOpen, setBothOpen] = useState(() => readFlag(BOTH_OPEN_KEY, true));
  const toggleBoth = () =>
    setBothOpen((open) => {
      writeFlag(BOTH_OPEN_KEY, !open);
      return !open;
    });

  // Puts a deleted business back, exactly as it was.
  const handleRestore = async (lead) => {
    try {
      await restoreLead(lead.Id);
    } catch (err) {
      Swal.fire({ ...ALERT_BASE, showConfirmButton: true, title: "Not restored", text: friendlyMessage(err, "Couldn't restore the business."), icon: "error" });
      if (err?.status === 404) load();
      return;
    }
    const back = { ...lead, Deleted: "" };
    setDeleted((d) => d.filter((l) => l.Id !== lead.Id));
    setLeads((l) => [...l.filter((x) => x.Id !== lead.Id), back]);
    Swal.fire({ ...ALERT_BASE, title: `${lead.BusinessName || "Business"} restored`, icon: "success", timer: 1500 });
  };

  const handleDelete = async (lead) => {
    const name = lead.BusinessName || "This business";
    const { isConfirmed } = await Swal.fire({
      ...ALERT_BASE,
      title: `Delete ${name}?`,
      text: "It will be hidden from the list. You can bring it back with Undo or from Recently deleted. The row stays in the Google Sheet.",
      icon: "warning",
      showConfirmButton: true,
      confirmButtonText: '<i class="fa-solid fa-trash"></i> Delete',
      confirmButtonColor: "#dc2626",
      showCancelButton: true,
      cancelButtonText: "Keep it",
      focusCancel: true,
    });
    if (!isConfirmed) return;
    let result;
    try {
      result = await deleteLead(lead.Id);
    } catch (err) {
      Swal.fire({ ...ALERT_BASE, showConfirmButton: true, title: "Not deleted", text: friendlyMessage(err, "Couldn't delete the business."), icon: "error" });
      if (err?.status === 404) load();
      return;
    }
    const gone = { ...lead, Deleted: result?.Deleted || "Just now" };
    if (editing === lead.Id) setEditing(null);
    setNotice("");
    setLeads((l) => l.filter((x) => x.Id !== lead.Id));
    setDeleted((d) => [gone, ...d.filter((x) => x.Id !== lead.Id)]);
    const { isConfirmed: undo } = await Swal.fire({
      ...ALERT_BASE,
      title: `${name} deleted`,
      icon: "success",
      showConfirmButton: true,
      confirmButtonText: '<i class="fa-solid fa-rotate-left"></i> Undo',
      showCancelButton: true,
      cancelButtonText: "OK",
    });
    if (undo) await handleRestore(gone);
  };

  const saved = async (message) => {
    setEditing(null);
    setNotice(message);
    await load();
  };

  const renderLead = (lead, i) =>
    editing && editing === lead.Id ? (
      <LeadForm key={lead.Id} lead={lead} types={types} onCancel={() => setEditing(null)} onSave={(data) => updateLead(lead.Id, data).then(() => saved(`Saved ${data.BusinessName || "the business"}.`))} />
    ) : (
      <LeadCard
        key={lead.Id || `row-${i}`}
        lead={lead}
        onEdit={
          canEdit && lead.Id
            ? () => {
                setNotice("");
                setEditing(lead.Id);
              }
            : null
        }
        onDelete={canDelete && lead.Id ? () => handleDelete(lead) : null}
      />
    );

  return (
      <section className="w-full max-w-3xl flex flex-col gap-4">
        {!canEdit && (
          <p role="status" className="glass-panel p-3 text-sm text-center">
            To add or edit businesses here, add a column named <b>Id</b> to the Web Design sheet (first row), and type 1, 2, 3… down it for the businesses already there.
          </p>
        )}
        {canEdit && !canDelete && (
          <p role="status" className="glass-panel p-3 text-sm text-center">
            To delete businesses (with Undo and Restore), add a column named <b>Deleted</b> to the Web Design sheet (first row). Leave it empty.
          </p>
        )}
        {notice && (
          <p role="status" className="glass-panel p-3 text-sm text-center text-brand-teal font-semibold">
            {notice}
          </p>
        )}

        {editing === "new" ? (
          <LeadForm lead={EMPTY_LEAD} types={types} onCancel={() => setEditing(null)} onSave={(data) => createLead(data).then(() => saved(`Added ${data.BusinessName}.`))} />
        ) : (
          <button
            type="button"
            className="btn-3d justify-center disabled:opacity-60"
            disabled={!canEdit}
            onClick={() => {
              setNotice("");
              setEditing("new");
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true"></i> Add a business
          </button>
        )}

        <div className="glass-card p-4 flex flex-col gap-3">
          <label htmlFor="lead-search" className="sr-only">
            Search businesses
          </label>
          <input id="lead-search" type="search" className="input-3d" placeholder="Search name, type, location, phone, notes" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
            {LEAD_FILTERS.map((f) => (
              <button key={f.key} type="button" className={chipClass(filter === f.key)} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}
              </button>
            ))}
          </div>
          {types.length > 0 && (
            <select aria-label="Business type" className="input-3d" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Every business type</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
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
            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading businesses…
          </p>
        ) : (
          !error && (
            <p className="text-center text-sm text-brand-navydeep/80">
              {shown.length} of {leads.length} {leads.length === 1 ? "business" : "businesses"}
            </p>
          )
        )}

        {regular.map(renderLead)}

        {both.length > 0 && (
          <section className="glass-card w-full p-4 sm:p-5 flex flex-col gap-4 border border-brand-teal/40" aria-label="Answered and has a website">
            <button type="button" className="field-label w-full justify-center !text-brand-teal !opacity-100" onClick={toggleBoth} aria-expanded={bothOpen}>
              <i className="fa-solid fa-circle-check" aria-hidden="true"></i> Answered + has a website ({both.length})
              <i className={`fa-solid ${bothOpen ? "fa-chevron-up" : "fa-chevron-down"}`} aria-hidden="true"></i>
            </button>
            {bothOpen && both.map(renderLead)}
          </section>
        )}

        {canDelete && !loading && !error && <RecentlyDeleted open={showDeleted} leads={deleted} onToggle={() => setShowDeleted((o) => !o)} onRestore={handleRestore} />}
      </section>
  );
}

function Badge({ label, value }) {
  const v = yesNo(value);
  const color = v === "Yes" ? "bg-brand-teal/15 text-brand-teal border-brand-teal/40" : v === "No" ? "bg-brand-error/10 text-brand-error border-brand-error/40" : "text-brand-navydeep/60 border-brand-navy/20";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      {label}: {v || "?"}
    </span>
  );
}

function LinkButton({ href, icon, label }) {
  if (!href) return null;
  const external = /^https?:/.test(href);
  return (
    <a href={href} className={OUTLINE} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
      <i className={`${icon} fa-fw`} aria-hidden="true"></i> {label}
    </a>
  );
}

function LeadCard({ lead, onEdit, onDelete }) {
  const mapHref = linkFor("GoogleLocation", lead.GoogleLocation) || (lead.Location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.Location)}` : "");
  const email = String(lead.Email ?? "").trim();
  return (
    <article className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-brand-navy break-words">{lead.BusinessName || "(No name)"}</h2>
          {lead.BusinessType && <p className="text-xs uppercase tracking-widest text-brand-teal">{lead.BusinessType}</p>}
          {lead.Location && <p className="text-sm text-brand-navydeep/80 break-words">{lead.Location}</p>}
          {lead.Phone && <p className="text-sm text-brand-navydeep/80">{lead.Phone}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {onEdit && (
            <button type="button" className={OUTLINE} onClick={onEdit} aria-label={`Edit ${lead.BusinessName || "business"}`} title="Edit">
              <i className="fa-solid fa-pen" aria-hidden="true"></i>
            </button>
          )}
          {onDelete && (
            <button type="button" className={DANGER} onClick={onDelete} aria-label={`Delete ${lead.BusinessName || "business"}`} title="Delete">
              <i className="fa-solid fa-trash" aria-hidden="true"></i>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge label="Answered" value={lead.AnswerPhone} />
        <Badge label="Website" value={lead.HasWebsite} />
      </div>

      <div className="flex flex-wrap gap-2">
        <LinkButton href={telLink(lead.Phone)} icon="fa-solid fa-phone" label="Call" />
        <LinkButton href={mapHref} icon="fa-solid fa-location-dot" label="Map" />
        <LinkButton href={email.includes("@") ? `mailto:${email}` : ""} icon="fa-solid fa-envelope" label="Email" />
        <LinkButton href={linkFor("BusinessWebsite", lead.BusinessWebsite)} icon="fa-solid fa-globe" label="Website" />
        <LinkButton href={linkFor("NewWebsite", lead.NewWebsite)} icon="fa-solid fa-laptop-code" label="New site" />
        <LinkButton href={linkFor("Instagram", lead.Instagram)} icon="fa-brands fa-instagram" label="Instagram" />
        <LinkButton href={linkFor("TikTok", lead.TikTok)} icon="fa-brands fa-tiktok" label="TikTok" />
        <LinkButton href={linkFor("Facebook", lead.Facebook)} icon="fa-brands fa-facebook" label="Facebook" />
        <LinkButton href={linkFor("Yelp", lead.Yelp)} icon="fa-brands fa-yelp" label="Yelp" />
        <LinkButton href={linkFor("Others", lead.Others)} icon="fa-solid fa-link" label="Other" />
      </div>

      {lead.Others && !linkFor("Others", lead.Others) && <p className="text-sm text-brand-navydeep/80 break-words">Others: {lead.Others}</p>}
      {lead.Notes && <p className="text-sm text-brand-navydeep/90 whitespace-pre-wrap break-words border-t border-brand-navy/10 pt-2">{lead.Notes}</p>}
    </article>
  );
}

function LeadForm({ lead, types, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_LEAD, ...lead, AnswerPhone: yesNo(lead.AnswerPhone) || lead.AnswerPhone || "", HasWebsite: yesNo(lead.HasWebsite) || lead.HasWebsite || "" }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const isNew = !lead.Id;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.BusinessName.trim()) {
      setError("Add the business name.");
      return;
    }
    setBusy(true);
    setError("");
    const { Id: _id, Deleted: _deleted, ...data } = form;
    try {
      await onSave(data);
    } catch (err) {
      setError(friendlyMessage(err, "Couldn't save the business."));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass-card p-4 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-brand-navy">{isNew ? "Add a business" : `Edit ${lead.BusinessName || "business"}`}</h2>
      <datalist id="lead-types">
        {types.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {LEAD_FIELDS.map((f) => (
          <div key={f.key} className="field-group">
            <label htmlFor={`lead-${f.key}`} className="field-label">
              {f.label}
            </label>
            <input
              id={`lead-${f.key}`}
              className="input-3d"
              type={f.type === "email" || f.type === "tel" ? f.type : "text"}
              inputMode={f.type === "url" ? "url" : undefined}
              list={f.key === "BusinessType" ? "lead-types" : undefined}
              placeholder={f.placeholder}
              autoComplete="off"
              autoCapitalize={f.type ? "none" : undefined}
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {YES_NO_FIELDS.map((f) => (
        <div key={f.key} className="field-group">
          <span className="field-label">{f.label}</span>
          <div className="flex gap-2" role="group" aria-label={f.label}>
            {["Yes", "No"].map((v) => (
              <button key={v} type="button" className={`${chipClass(form[f.key] === v)} flex-1`} aria-pressed={form[f.key] === v} onClick={() => set(f.key, form[f.key] === v ? "" : v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="field-group">
        <label htmlFor="lead-Notes" className="field-label">
          Notes
        </label>
        <textarea id="lead-Notes" className="input-3d min-h-[6rem]" value={form.Notes} onChange={(e) => set("Notes", e.target.value)} />
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-brand-error text-center">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={OUTLINE} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn-3d justify-center disabled:opacity-60" disabled={busy}>
          {busy ? <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> : <i className="fa-solid fa-check" aria-hidden="true"></i>} Save
        </button>
      </div>
    </form>
  );
}

// Businesses deleted from the list, each with Restore. They
// come with the same sheet read as the list, so opening this is free.
function RecentlyDeleted({ open, leads, onToggle, onRestore }) {
  const [busyId, setBusyId] = useState(null);
  const restore = async (lead) => {
    setBusyId(lead.Id);
    try {
      await onRestore(lead);
    } finally {
      setBusyId(null);
    }
  };
  return (
    <section className="glass-card w-full p-5 sm:p-6" aria-label="Recently deleted businesses">
      <button type="button" className="field-label w-full justify-center" onClick={onToggle} aria-expanded={open}>
        <i className="fa-solid fa-trash-can-arrow-up" aria-hidden="true"></i> Recently deleted{leads.length ? ` (${leads.length})` : ""}
        <i className={`fa-solid ${open ? "fa-chevron-up" : "fa-chevron-down"}`} aria-hidden="true"></i>
      </button>
      {open && (
        <div className="mt-3">
          {!leads.length && <p className="text-center text-sm text-brand-navydeep/80">No deleted businesses.</p>}
          {leads.length > 0 && (
            <ul className="flex flex-col divide-y divide-brand-navydeep/15">
              {leads.map((lead) => (
                <li key={lead.Id} className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between py-3 first:pt-0 last:pb-0">
                  <div className="text-center sm:text-left min-w-0">
                    <p className="font-semibold text-brand-navy break-words">{lead.BusinessName || "(No name)"}</p>
                    <p className="text-sm text-brand-navydeep/80">
                      Deleted {lead.Deleted}
                      {lead.BusinessType ? ` · ${lead.BusinessType}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-3d !py-2 !px-4 text-sm justify-center shrink-0 disabled:opacity-60"
                    onClick={() => restore(lead)}
                    disabled={busyId !== null}
                    aria-label={`Restore ${lead.BusinessName || "business"}`}
                  >
                    <i className="fa-solid fa-rotate-left" aria-hidden="true"></i> {busyId === lead.Id ? "Restoring…" : "Restore"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
