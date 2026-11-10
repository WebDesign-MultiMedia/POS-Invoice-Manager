import { formatMoney } from "../lib/format.js";
import { qtyStep } from "../lib/menu.js";

// Tap-to-add menu grid, used by Pay with Card and Event Sales.
// cart is { [menuItemId]: qty }; onChange(id, delta) adds or removes.
export default function MenuPicker({ menu, cart, onChange, onClear, total }) {
  const hasCart = Object.keys(cart).length > 0;
  return (
    <div className="field-group">
      <span className="field-label">
        <i className="fa-solid fa-utensils"></i> Order items (tap to add)
      </span>
      <div className="flex flex-col gap-3">
        {menu.map((group) => (
          <div key={group.category}>
            <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold mb-1.5">{group.category}</p>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((item) => {
                const qty = cart[item.id] || 0;
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
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
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
