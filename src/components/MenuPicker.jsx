import { formatMoney } from "../lib/format.js";
import { DEALS, qtyStep } from "../lib/menu.js";

// Tap-to-add menu grid, used by Pay with Card and Event Sales.
// cart is { [menuItemId]: qty }; onChange(id, delta) adds or removes.
// Items with a `deal` (see DEALS in lib/menu.js) get a "+3 for $5" button,
// and `deals` (from cartDeals) lists the savings already in the total.
export default function MenuPicker({ menu, cart, onChange, onClear, total, deals = [] }) {
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
