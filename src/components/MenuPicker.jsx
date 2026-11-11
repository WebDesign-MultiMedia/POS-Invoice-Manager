import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "../lib/format.js";
import { DEALS, DISH_NOTE_MAX, qtyStep } from "../lib/menu.js";

// Tap-to-add menu grid, used by Pay with Card and Event Sales.
// cart is { [menuItemId]: qty }; onChange(id, delta) adds or removes.
// Items with a `deal` (see DEALS in lib/menu.js) get a "+3 for $5" button,
// and `deals` (from cartDeals) lists the savings already in the total.
// variant="pos": the register layout on tablets/computers. Big tiles, more
// per row, a count badge instead of − / + (the order ticket has those),
// and no total underneath (the ticket shows it). A Columns / Rows switch
// picks tiles or one row per item.
// notes / onNote (optional): per-dish notes ({ [menuItemId]: text }); when
// given, each item in the order gets an "Add note" field.
export default function MenuPicker({ menu, cart, onChange, onClear, total, deals = [], variant, notes, onNote }) {
  if (variant === "pos") return <PosMenu menu={menu} cart={cart} onChange={onChange} notes={notes} onNote={onNote} />;
  const hasCart = Object.keys(cart).length > 0;
  return (
    <div className="field-group">
      <span className="field-label">
        <i className="fa-solid fa-utensils"></i> Order items (tap to add)
      </span>
      <div className="flex flex-col gap-3">
        {menu.map((group) => (
          <div key={group.category}>
            <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold mb-1.5">
              {group.category}
              {DEALS[group.deal] && (
                <span className="ml-2 normal-case tracking-normal rounded-full bg-brand-gold/20 px-2 py-0.5 text-brand-navydeep">
                  <i className="fa-solid fa-tag"></i> Mix &amp; match {DEALS[group.deal].qty} for {formatMoney(DEALS[group.deal].price)}
                </span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => {
                const qty = cart[item.id] || 0;
                const deal = item.unit !== "lb" && DEALS[item.deal];
                return (
                  <div
                    key={item.id}
                    className={`glass-panel p-2 text-sm flex flex-col gap-1 border-2 transition-colors ${qty ? "border-brand-gold" : "border-transparent"}`}
                  >
                    <button type="button" className="text-left" onClick={() => onChange(item.id, qtyStep(item))}>
                      <span className="block font-semibold leading-tight">{item.name}</span>
                      <span className="text-xs text-brand-navydeep/80">
                        {formatMoney(item.price)}
                        {item.unit === "lb" ? " / lb" : ""}
                      </span>
                    </button>
                    {qty > 0 && (
                      <div className="flex items-center justify-between mt-1">
                        <button
                          type="button"
                          className="w-7 h-7 rounded-full bg-brand-navydeep/10 font-bold"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => onChange(item.id, -qtyStep(item))}
                        >
                          −
                        </button>
                        <span className="font-semibold">
                          {qty}
                          {item.unit === "lb" ? " lb" : ""}
                        </span>
                        <button
                          type="button"
                          className="w-7 h-7 rounded-full bg-brand-gold text-white font-bold"
                          aria-label={`Add ${item.name}`}
                          onClick={() => onChange(item.id, qtyStep(item))}
                        >
                          +
                        </button>
                      </div>
                    )}
                    {qty > 0 && onNote && <DishNote item={item} value={notes?.[item.id] || ""} onChange={(v) => onNote(item.id, v)} />}
                    {deal && (
                      <button
                        type="button"
                        className="mt-1 rounded-full border border-brand-gold px-2 py-1 text-xs font-semibold"
                        aria-label={`Add ${deal.qty} ${item.name} for ${formatMoney(deal.price)}`}
                        onClick={() => onChange(item.id, deal.qty)}
                      >
                        +{deal.qty} for {formatMoney(deal.price)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {hasCart && deals.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5 text-sm text-brand-teal font-semibold">
          {deals.map((d) => (
            <span key={d.key}>
              <i className="fa-solid fa-tag"></i> {d.label}
              {d.sets > 1 ? ` ×${d.sets}` : ""}: −{formatMoney(d.savings)}
            </span>
          ))}
        </div>
      )}
      {hasCart && (
        <div className="flex justify-between items-center mt-2 text-sm">
          <span className="font-semibold">Items total: {formatMoney(total)}</span>
          <button type="button" className="text-xs text-brand-navydeep/75 underline" onClick={onClear}>
            Clear items
          </button>
        </div>
      )}
    </div>
  );
}

// Register menu view: "tiles" (a grid of columns) or "list" (one row per
// item). Remembered per device; storage can be blocked, so it's optional.
const VIEW_KEY = "pim-pos-menu-view";
function loadView() {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "tiles";
  } catch {
    return "tiles";
  }
}
function saveView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // not saved; the choice still applies until the page reloads
  }
}

// Computers (a mouse or trackpad) always get Columns; the Rows option is
// for touch tablets only. Checked by pointer type, not width, since a big
// tablet sideways is as wide as a laptop.
const DESKTOP = "(hover: hover) and (pointer: fine)";
function useIsDesktop() {
  const query = () => typeof window !== "undefined" && window.matchMedia?.(DESKTOP).matches;
  const [desktop, setDesktop] = useState(query);
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP);
    if (!mq) return;
    const update = () => setDesktop(mq.matches);
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return Boolean(desktop);
}

const VIEWS = [
  { id: "tiles", label: "Columns", icon: "fa-table-cells-large" },
  { id: "list", label: "Rows", icon: "fa-list" },
];

// Register: each tap on a dish adds one (keep tapping for more). The small
// pencil on the dish (shown when onNote is given) opens a card for its note.
function PosMenu({ menu, cart, onChange, notes, onNote }) {
  const [savedView, setView] = useState(loadView);
  const desktop = useIsDesktop();
  const view = desktop ? "tiles" : savedView;
  const [picked, setPicked] = useState(null);
  const noteFor = (item) => (onNote ? () => setPicked(item) : null);
  const pick = (v) => {
    setView(v);
    saveView(v);
  };
  const list = view === "list";
  return (
    <div className="flex flex-col gap-4">
      {!desktop && (
      <div className="flex justify-end">
        <div role="group" aria-label="Menu layout" className="inline-flex rounded-full bg-brand-navydeep/10 p-1 gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => pick(v.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5 transition-colors ${view === v.id ? "bg-brand-gold text-white" : "text-brand-navydeep/80"}`}
            >
              <i className={`fa-solid ${v.icon}`} aria-hidden="true"></i> {v.label}
            </button>
          ))}
        </div>
      </div>
      )}
      {menu.map((group) => (
        <div key={group.category}>
          <p className="text-sm uppercase tracking-widest text-brand-teal font-semibold mb-2">
            {group.category}
            {DEALS[group.deal] && (
              <span className="ml-2 normal-case tracking-normal rounded-full bg-brand-gold/20 px-2 py-0.5 text-brand-navydeep">
                <i className="fa-solid fa-tag"></i> Mix &amp; match {DEALS[group.deal].qty} for {formatMoney(DEALS[group.deal].price)}
              </span>
            )}
          </p>
          <div className={list ? "grid grid-cols-1 lg:grid-cols-2 gap-x-3 gap-y-1.5" : "grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2"}>
            {group.items.map((item) =>
              list ? (
                <PosRow key={item.id} item={item} qty={cart[item.id] || 0} onChange={onChange} onNote={noteFor(item)} hasNote={Boolean(notes?.[item.id]?.trim())} />
              ) : (
                <PosTile key={item.id} item={item} qty={cart[item.id] || 0} onChange={onChange} onNote={noteFor(item)} hasNote={Boolean(notes?.[item.id]?.trim())} />
              ),
            )}
          </div>
        </div>
      ))}
      {picked && (
        <DishSheet
          key={picked.id}
          item={picked}
          inOrder={cart[picked.id] || 0}
          note={notes?.[picked.id] || ""}
          onClose={() => setPicked(null)}
          onAdd={(qty, note) => {
            if (qty) onChange(picked.id, qty);
            onNote(picked.id, note);
            setPicked(null);
          }}
        />
      )}
    </div>
  );
}

// The dish's note card (from the pencil). One note per dish in the order,
// so it starts with the note already on it. Already in the order: just the
// note and Save note. Not yet: how many too, then Add to order.
function DishSheet({ item, inOrder, note: startNote, onClose, onAdd }) {
  const step = qtyStep(item);
  const lb = item.unit === "lb";
  const [qty, setQty] = useState(step);
  const [note, setNote] = useState(startNote);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const round = (n) => Math.round(n * 100) / 100;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${item.name}`}
        className="w-full max-w-sm rounded-3xl bg-[rgb(var(--page-bg))] p-5 shadow-2xl flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(inOrder ? 0 : qty, note);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-lg leading-tight text-brand-navy">{item.name}</p>
            <p className="text-sm text-brand-navydeep/80 tabular-nums">
              {formatMoney(item.price)}
              {lb ? " / lb" : " each"}
              {inOrder > 0 ? ` · ${inOrder}${lb ? " lb" : ""} in order` : ""}
            </p>
          </div>
          <button type="button" className="w-9 h-9 shrink-0 rounded-full bg-brand-navydeep/10" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        {!inOrder && (
        <div className="flex items-center justify-center gap-4">
          <button type="button" className="w-11 h-11 rounded-full bg-brand-navydeep/10 font-bold text-xl disabled:opacity-40" aria-label="One less" disabled={qty <= step} onClick={() => setQty((q) => round(Math.max(step, q - step)))}>
            −
          </button>
          <span className="min-w-[4rem] text-center text-2xl font-bold tabular-nums" aria-live="polite">
            {qty}
            {lb ? " lb" : ""}
          </span>
          <button type="button" className="w-11 h-11 rounded-full bg-brand-gold text-white font-bold text-xl" aria-label="One more" onClick={() => setQty((q) => round(q + step))}>
            +
          </button>
        </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">
            <i className="fa-solid fa-pen text-brand-teal" aria-hidden="true"></i> Note <span className="font-normal text-brand-navydeep/70">(optional)</span>
          </span>
          <input
            type="text"
            autoFocus={inOrder > 0}
            value={note}
            maxLength={DISH_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. no onion, extra salsa"
            className="w-full rounded-xl border border-brand-navydeep/20 bg-white/70 px-3 py-2 text-base"
          />
        </label>
        <button type="submit" className="btn-3d justify-center text-lg w-full">
          {inOrder ? "Save note" : `Add to order · ${formatMoney(item.price * qty)}`}
        </button>
      </form>
    </div>,
    document.body,
  );
}

const addLabel = (item, qty) => `Add ${item.name}${qty ? ` (${qty}${item.unit === "lb" ? " lb" : ""} in order)` : ""}`;

function QtyBadge({ qty, className = "" }) {
  return (
    <span className={`pointer-events-none min-w-[1.75rem] h-7 px-1.5 rounded-full bg-brand-gold text-white text-sm font-bold flex items-center justify-center tabular-nums ${className}`} aria-hidden="true">
      {qty}
    </span>
  );
}

function PosTile({ item, qty, onChange, onNote, hasNote }) {
  const deal = item.unit !== "lb" && DEALS[item.deal];
  return (
    <div className="flex flex-col">
      <div className="relative flex flex-col">
      <button
        type="button"
        onClick={() => onChange(item.id, qtyStep(item))}
        aria-label={addLabel(item, qty)}
        className={`glass-panel !rounded-xl min-h-[4.5rem] px-3 py-2 flex flex-col justify-between gap-1 text-left border-2 transition-[transform,border-color] active:scale-95 ${qty ? "border-brand-gold" : "border-transparent"} ${deal ? "!rounded-b-none" : ""}`}
      >
        <span className="block font-semibold text-[0.95rem] leading-tight pr-7">{item.name}</span>
        <span className="text-sm text-brand-navydeep/80 tabular-nums">
          {formatMoney(item.price)}
          {item.unit === "lb" ? " / lb" : ""}
        </span>
      </button>
      {qty > 0 && <QtyBadge qty={qty} className="absolute top-1.5 right-1.5 !h-6 !min-w-[1.5rem] text-xs" />}
      {onNote && <NoteButton item={item} hasNote={hasNote} onClick={onNote} className="absolute bottom-1 right-1" />}
      </div>
      {deal && (
        <button
          type="button"
          className="rounded-b-xl border-2 border-t-0 border-brand-gold/70 py-1 text-xs font-semibold active:scale-95"
          aria-label={`Add ${deal.qty} ${item.name} for ${formatMoney(deal.price)}`}
          onClick={() => onChange(item.id, deal.qty)}
        >
          +{deal.qty} for {formatMoney(deal.price)}
        </button>
      )}
    </div>
  );
}

function PosRow({ item, qty, onChange, onNote, hasNote }) {
  const deal = item.unit !== "lb" && DEALS[item.deal];
  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        onClick={() => onChange(item.id, qtyStep(item))}
        aria-label={addLabel(item, qty)}
        className={`glass-panel !rounded-xl flex-1 min-w-0 min-h-[2.75rem] px-3 py-1.5 flex items-center gap-2 text-left border-2 transition-[transform,border-color] active:scale-[0.98] ${qty ? "border-brand-gold" : "border-transparent"}`}
      >
        <span className="flex-1 min-w-0 font-semibold text-sm leading-tight">{item.name}</span>
        <span className="text-sm text-brand-navydeep/80 tabular-nums whitespace-nowrap">
          {formatMoney(item.price)}
          {item.unit === "lb" ? " / lb" : ""}
        </span>
        {qty > 0 && <QtyBadge qty={qty} className="!h-6 !min-w-[1.5rem] text-xs" />}
      </button>
      {onNote && <NoteButton item={item} hasNote={hasNote} onClick={onNote} className="self-center" />}
      {deal && (
        <button
          type="button"
          className="shrink-0 rounded-xl border-2 border-brand-gold/70 px-2 text-xs font-semibold whitespace-nowrap active:scale-95"
          aria-label={`Add ${deal.qty} ${item.name} for ${formatMoney(deal.price)}`}
          onClick={() => onChange(item.id, deal.qty)}
        >
          +{deal.qty} for {formatMoney(deal.price)}
        </button>
      )}
    </div>
  );
}

// The pencil on a register dish: opens its note card. Gold once it has one.
function NoteButton({ item, hasNote, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={hasNote ? `Edit the note for ${item.name}` : `Add a note for ${item.name}`}
      className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm active:scale-90 transition-transform ${hasNote ? "bg-brand-gold text-white" : "bg-brand-navydeep/10 text-brand-navydeep/70"} ${className}`}
    >
      <i className="fa-solid fa-pen" aria-hidden="true"></i>
    </button>
  );
}

// Optional note for one dish in the order ("no onion", "extra salsa").
// Starts as a small "Add note" link; stays open while it has text.
export function DishNote({ item, value, onChange }) {
  const [open, setOpen] = useState(false);
  if (!open && !value) {
    return (
      <button type="button" className="self-start text-xs font-semibold text-brand-teal underline" onClick={() => setOpen(true)} aria-label={`Add a note for ${item.name}`}>
        <i className="fa-solid fa-pen" aria-hidden="true"></i> Add note
      </button>
    );
  }
  return (
    <input
      type="text"
      autoFocus={open && !value}
      value={value}
      maxLength={DISH_NOTE_MAX}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => !value.trim() && setOpen(false)}
      placeholder="e.g. no onion, extra salsa"
      aria-label={`Note for ${item.name} (optional)`}
      className="w-full min-w-0 rounded-lg border border-brand-navydeep/20 bg-white/70 px-2 py-1 text-base sm:text-sm"
    />
  );
}
