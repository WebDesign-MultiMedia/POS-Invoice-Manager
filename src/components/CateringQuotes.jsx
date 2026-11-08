import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { TRAY_SIZES } from "../lib/cateringMenu.js";
import { quoteToOrderForm, quoteLabel } from "../lib/cateringQuotes.js";
import { hasDraft, writeDraft } from "../lib/orderDraft.js";
import { formatMoney } from "../lib/format.js";

const SIZE_SHORT = Object.fromEntries(TRAY_SIZES.map((s) => [s.id, s.short]));

const FIELDS = [
  { key: "name", label: "Client name", icon: "fa-user", type: "text", autoComplete: "off" },
  { key: "phone", label: "Phone", icon: "fa-phone", type: "tel", autoComplete: "off" },
  { key: "address", label: "Address", icon: "fa-location-dot", type: "text", autoComplete: "off" },
  { key: "eventDate", label: "Event date", icon: "fa-calendar-days", type: "date" },
];

const when = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Saved quotes under the calculator, newest first. Each one keeps the
// dishes and total from "=", takes the client's details, and can open the
// order form filled in so it becomes an order and an invoice.
// mode: "staff" (shared list from the spreadsheet), "link" (an employee's
// no-login link: their own quotes, also sent to the office), "local" (demo).
export default function CateringQuotes({ mode = "local", quotes, status = {}, onRefresh, employeeName, onChangeName, onChange, onDelete, highlightId, canInvoice = true }) {
  if (!quotes.length && mode !== "staff") return mode === "link" && employeeName ? <LinkNote employeeName={employeeName} onChangeName={onChangeName} /> : null;
  return (
    <section className="mt-8 w-full max-w-md stagger-in" aria-labelledby="quotes-heading">
      <div className="mb-3 flex items-center justify-center gap-3">
        <h2 id="quotes-heading" className="font-headings text-xl text-brand-navy">
          <i className="fa-solid fa-receipt" aria-hidden="true"></i> {mode === "staff" ? "Quotes" : "Saved Quotes"}
        </h2>
        {mode === "staff" && (
          <button type="button" onClick={onRefresh} disabled={status.loading} className="fab !h-10 !w-10 disabled:opacity-60" aria-label="Check for new quotes" title="Check for new quotes">
            <i className={`fa-solid fa-rotate text-brand-gold ${status.loading ? "fa-spin" : ""}`} aria-hidden="true"></i>
          </button>
        )}
      </div>
      {mode === "staff" && <p className="-mt-1 mb-3 text-center text-xs text-brand-muted/90">Shared by every staff login and the employee calculator link.</p>}
      {mode === "link" && <LinkNote employeeName={employeeName} onChangeName={onChangeName} />}
      {status.error === "load" && (
        <p role="alert" className="glass-panel mb-3 p-3 text-center text-sm text-brand-error">
          Couldn&apos;t load the shared quotes. Showing this device&apos;s copy. Check your connection and tap <i className="fa-solid fa-rotate" aria-hidden="true"></i>.
        </p>
      )}
      {mode === "staff" && !quotes.length && !status.loading && !status.error && <p className="text-center text-sm text-brand-muted">No quotes yet. Press = on the calculator to save one.</p>}
      <div className="flex flex-col gap-4">
        {[...quotes].reverse().map((quote) => (
          <QuoteCard key={quote.id} mode={mode} saveFailed={status.error === "save"} quote={quote} onChange={onChange} onDelete={onDelete} highlight={quote.id === highlightId} canInvoice={canInvoice} />
        ))}
      </div>
    </section>
  );
}

function LinkNote({ employeeName, onChangeName }) {
  return (
    <p className="mb-3 text-center text-sm text-brand-muted">
      Your quotes are sent to the office{employeeName ? <> as <b className="text-brand-navy">{employeeName}</b></> : null}.{" "}
      <button type="button" onClick={onChangeName} className="font-semibold text-brand-navy underline">
        Change name
      </button>
    </p>
  );
}

// Who made a quote and whether the shared list has it yet.
function SyncLine({ quote, mode, saveFailed }) {
  if (mode === "local") return null;
  let status = null;
  if (quote.pending) {
    status = saveFailed ? (
      <span className="text-brand-error">
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Not sent yet, will retry
      </span>
    ) : (
      <span>
        <i className="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Saving…
      </span>
    );
  } else if (mode === "link") {
    status = (
      <span className="text-brand-teal">
        <i className="fa-solid fa-check" aria-hidden="true"></i> Sent to the office
      </span>
    );
  }
  const who = mode === "staff" && quote.createdBy ? (quote.source === "link" ? `From ${quote.createdBy} (employee link)` : `By ${quote.createdBy}`) : null;
  if (!who && !status) return null;
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-brand-muted/90">
      {who && (
        <span>
          <i className={`fa-solid ${quote.source === "link" ? "fa-link" : "fa-user"}`} aria-hidden="true"></i> {who}
        </span>
      )}
      {status}
    </p>
  );
}

function QuoteCard({ quote, mode, saveFailed, onChange, onDelete, highlight, canInvoice }) {
  const label = quoteLabel(quote);
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const set = (key) => (e) => onChange({ ...quote, [key]: e.target.value });
  const trays = quote.lines.reduce((n, l) => n + l.qty, 0);

  const makeInvoice = async () => {
    if (hasDraft()) {
      const { isConfirmed } = await Swal.fire({
        theme: "dark",
        title: "Replace the order you started?",
        text: "The order form already has an unsaved order in it. It will be replaced with this quote.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Replace it",
        cancelButtonText: "Keep it",
      });
      if (!isConfirmed) return;
    }
    writeDraft(quoteToOrderForm(quote), `Catering ${label}`);
    onChange({ ...quote, sentAt: new Date().toISOString() });
    navigate("/");
  };

  const confirmDelete = async () => {
    const { isConfirmed } = await Swal.fire({
      theme: "dark",
      title: `Delete ${label}?`,
      text: mode === "link" ? "This removes it from this phone only. The office keeps its copy." : mode === "staff" ? "This deletes it for every staff login. It can't be undone." : "This can't be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#e23744",
    });
    if (!isConfirmed) return;
    try {
      await onDelete(quote.id);
    } catch {
      Swal.fire({ theme: "dark", icon: "error", title: "Couldn't delete it", text: "Check your connection and try again." });
    }
  };

  const idBase = `quote-${quote.id}`;

  return (
    <article id={idBase} className={`glass-card p-5 transition-shadow ${highlight ? "ring-2 ring-brand-gold" : ""}`} aria-label={`Catering ${label}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-brand-navy">
            {label}
            {quote.name.trim() && <span className="font-normal text-brand-muted"> · {quote.name.trim()}</span>}
          </h3>
          <p className="text-xs text-brand-muted/85">
            {when(quote.createdAt)} · {trays} {trays === 1 ? "tray" : "trays"}
            {quote.sentAt && (
              <span className="ml-1 text-brand-teal">
                · <i className="fa-solid fa-check" aria-hidden="true"></i> sent to order form
              </span>
            )}
          </p>
        </div>
        <p className="shrink-0 text-2xl font-semibold text-brand-navy tabular-nums">{formatMoney(quote.total)}</p>
      </header>
      <SyncLine quote={quote} mode={mode} saveFailed={saveFailed} />

      <ul className="mt-3 space-y-1 text-sm" aria-label="Dishes">
        {quote.lines.map((l, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="w-3 shrink-0 text-center font-semibold text-brand-gold">{l.op && l.op !== "+" ? l.op : "•"}</span>
            <span className="min-w-0 flex-1 text-brand-navydeep">
              {l.qty > 1 && <span className="font-semibold text-brand-gold">{l.qty}× </span>}
              {l.name} <span className="text-brand-muted/85">({SIZE_SHORT[l.size]})</span>
            </span>
            <span className="shrink-0 text-brand-muted tabular-nums">{formatMoney(l.amount)}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${idBase}-details`}
        className="mt-4 flex w-full items-center justify-between text-sm font-semibold text-brand-navy"
      >
        <span>
          <i className="fa-solid fa-user-pen" aria-hidden="true"></i> Client details
        </span>
        <i className={`fa-solid fa-chevron-down text-xs transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true"></i>
      </button>

      {open && (
        <div id={`${idBase}-details`} className="mt-3 flex flex-col gap-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`${idBase}-${f.key}`} className="field-label">
                <i className={`fa-solid ${f.icon}`} aria-hidden="true"></i> {f.label}
              </label>
              <input id={`${idBase}-${f.key}`} type={f.type} autoComplete={f.autoComplete} className="input-3d w-full" value={quote[f.key]} onChange={set(f.key)} />
            </div>
          ))}
          <div>
            <label htmlFor={`${idBase}-notes`} className="field-label">
              <i className="fa-solid fa-note-sticky" aria-hidden="true"></i> Notes
            </label>
            <textarea id={`${idBase}-notes`} rows={2} className="input-3d w-full resize-y" value={quote.notes} onChange={set("notes")} />
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <button type="button" onClick={confirmDelete} className="btn-3d flex-1 !px-4 !bg-none !bg-transparent border border-brand-error/60 text-brand-error" aria-label={`Delete ${label}`}>
          <i className="fa-solid fa-trash" aria-hidden="true"></i> Delete
        </button>
        {/* Making an order needs a staff login, so the no-login link hides it. */}
        {canInvoice && (
          <button type="button" onClick={makeInvoice} className="btn-3d flex-[2] !px-4">
            <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i> Make invoice
          </button>
        )}
      </div>
    </article>
  );
}
