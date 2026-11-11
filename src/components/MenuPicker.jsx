import { useState } from "react";
import { formatMoney } from "../lib/format.js";
import { DEALS, qtyStep } from "../lib/menu.js";

// Tap-to-add menu grid, used by Pay with Card and Event Sales.
// cart is { [menuItemId]: qty }; onChange(id, delta) adds or removes.
// Items with a `deal` (see DEALS in lib/menu.js) get a "+3 for $5" button,
// and `deals` (from cartDeals) lists the savings already in the total.
// variant="pos": the register layout on tablets/computers. Big tiles, more
// per row, a count badge instead of − / + (the order ticket has those),
// and no total underneath (the ticket shows it). A Columns / Rows switch
// picks tiles or one row per item.
export default function MenuPicker({ menu, cart, onChange, onClear, total, deals = [], variant }) {
  if (variant === "pos") return <PosMenu menu={menu} cart={cart} onChange={onChange} />;
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

const VIEWS = [
  { id: "tiles", label: "Columns", icon: "fa-table-cells-large" },
  { id: "list", label: "Rows", icon: "fa-list" },
];

function PosMenu({ menu, cart, onChange }) {
  const [view, setView] = useState(loadView);
  const pick = (v) => {
    setView(v);
    saveView(v);
  };
  const list = view === "list";
  return (
    <div className="flex flex-col gap-5">
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
          <div className={list ? "flex flex-col gap-2" : "grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3"}>
            {group.items.map((item) =>
              list ? (
                <PosRow key={item.id} item={item} qty={cart[item.id] || 0} onChange={onChange} />
              ) : (
                <PosTile key={item.id} item={item} qty={cart[item.id] || 0} onChange={onChange} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
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

function PosTile({ item, qty, onChange }) {
  const deal = item.unit !== "lb" && DEALS[item.deal];
  return (
    <div className="relative flex flex-col">
      <button
        type="button"
        onClick={() => onChange(item.id, qtyStep(item))}
        aria-label={addLabel(item, qty)}
        className={`glass-panel min-h-[6.5rem] p-3 flex flex-col justify-between text-left border-2 transition-[transform,border-color] active:scale-95 ${qty ? "border-brand-gold" : "border-transparent"} ${deal ? "!rounded-b-none" : ""}`}
      >
        <span className="block font-semibold text-base leading-tight pr-8">{item.name}</span>
        <span className="text-sm text-brand-navydeep/80 tabular-nums">
          {formatMoney(item.price)}
          {item.unit === "lb" ? " / lb" : ""}
        </span>
      </button>
      {qty > 0 && <QtyBadge qty={qty} className="absolute top-2 right-2" />}
      {deal && (
        <button
          type="button"
          className="rounded-b-2xl border-2 border-t-0 border-brand-gold/70 py-1.5 text-sm font-semibold active:scale-95"
          aria-label={`Add ${deal.qty} ${item.name} for ${formatMoney(deal.price)}`}
          onClick={() => onChange(item.id, deal.qty)}
        >
          +{deal.qty} for {formatMoney(deal.price)}
        </button>
      )}
    </div>
  );
}

function PosRow({ item, qty, onChange }) {
  const deal = item.unit !== "lb" && DEALS[item.deal];
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={() => onChange(item.id, qtyStep(item))}
        aria-label={addLabel(item, qty)}
        className={`glass-panel flex-1 min-w-0 min-h-[3.5rem] px-4 py-2 flex items-center gap-3 text-left border-2 transition-[transform,border-color] active:scale-[0.98] ${qty ? "border-brand-gold" : "border-transparent"}`}
      >
        <span className="flex-1 min-w-0 font-semibold text-base leading-tight">{item.name}</span>
        <span className="text-sm text-brand-navydeep/80 tabular-nums whitespace-nowrap">
          {formatMoney(item.price)}
          {item.unit === "lb" ? " / lb" : ""}
        </span>
        <span className="w-8 flex justify-end">{qty > 0 && <QtyBadge qty={qty} />}</span>
      </button>
      {deal && (
        <button
          type="button"
          className="shrink-0 rounded-2xl border-2 border-brand-gold/70 px-3 text-sm font-semibold whitespace-nowrap active:scale-95"
          aria-label={`Add ${deal.qty} ${item.name} for ${formatMoney(deal.price)}`}
          onClick={() => onChange(item.id, deal.qty)}
        >
          +{deal.qty} for {formatMoney(deal.price)}
        </button>
      )}
    </div>
  );
}
