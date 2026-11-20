import { useCallback, useEffect, useMemo, useState } from "react";
import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import { createLead, fetchLeads, updateLead } from "../api/leads.js";
import { friendlyMessage } from "../lib/errors.js";
import { EMPTY_LEAD, LEAD_FIELDS, LEAD_FILTERS, YES_NO_FIELDS, businessTypes, linkFor, matchesFilter, matchesSearch, telLink, yesNo } from "../lib/leads.js";

// Web Design & MultiMedia: businesses that might want a website. Its own
// Google Sheet and SheetDB API (api/_lib/leads.js); the Web Design login
// sees only this page, the owner's login can open it too.

const LOGO = { src: "/imgs/WebDesignMultiMedia-logo.png", alt: "Web Design & MultiMedia logo", icon: "fa-laptop-code" };
const OUTLINE = "btn-3d !py-2 !px-3 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy disabled:opacity-60";
const CHIP = "rounded-full px-3 py-1.5 text-sm font-semibold border transition-colors";
const chipClass = (on) => `${CHIP} ${on ? "bg-brand-teal text-white border-brand-teal" : "border-brand-navy/30 text-brand-navy"}`;

export default function WebDesignPage() {
  const [leads, setLeads] = useState([]);
  const [canEdit, setCanEdit] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("");
  // null, "new", or the Id being edited.
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await fetchLeads();
      setLeads(Array.isArray(data?.leads) ? data.leads : []);
      setCanEdit(data?.canEdit !== false);
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
  const shown = useMemo(
    () =>
      leads
        .filter((l) => matchesFilter(l, filter) && matchesSearch(l, query) && (!type || String(l.BusinessType).trim().toLowerCase() === type.toLowerCase()))
        .sort((a, b) => String(a.BusinessName).localeCompare(String(b.BusinessName))),
    [leads, filter, query, type]
  );

  const saved = async (message) => {
    setEditing(null);
    setNotice(message);
    await load();
  };

  return (
    <Layout blobs={["bg-brand-teal w-72 h-72 -top-10 -left-10 animate-float-slow", "bg-brand-terracotta w-80 h-80 top-1/2 -right-16 animate-float"]}>
      <SiteNav className="mb-6" />
      <PageHeader logo={LOGO} logoSize="w-36 h-36 sm:w-44 sm:h-44" title="Web Design & MultiMedia" subtitle="Business leads" />

      <section className="w-full max-w-3xl flex flex-col gap-4">
        {!canEdit && (
          <p role="status" className="glass-panel p-3 text-sm text-center">
            To add or edit businesses here, add a column named <b>Id</b> to the Web Design sheet (first row), and type 1, 2, 3… down it for the businesses already there.
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

        {shown.map((lead, i) =>
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
            />
          )
        )}
      </section>
    </Layout>
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

function LeadCard({ lead, onEdit }) {
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
        {onEdit && (
          <button type="button" className={OUTLINE} onClick={onEdit} aria-label={`Edit ${lead.BusinessName || "business"}`}>
            <i className="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
        )}
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
    const { Id: _id, ...data } = form;
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
