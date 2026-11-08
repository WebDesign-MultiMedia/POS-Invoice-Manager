import { useMemo } from "react";
import { priceList } from "../lib/cateringList.js";
import { CATERING_MENU, TRAY_SIZES } from "../lib/cateringMenu.js";
import { formatMoney } from "../lib/format.js";

const DISHES = CATERING_MENU.flatMap((c) => c.dishes);
const SIZE_SHORT = Object.fromEntries(TRAY_SIZES.map((s) => [s.id, s.short]));
const PLACEHOLDER = "2 carnitas entera\n• Chivo (media charola)\nmole poblano\n3x arroz mexicano, frijoles";

// "Type a list": staff type or paste dishes, and the total is worked out
// as they type. Each line shows what it matched, so a wrong match is easy
// to spot; vague lines ("mole") offer the dishes they could mean.
export default function CateringListMode({ text, onTextChange, size, onSizeChange, onSendToCalculator }) {
  const { lines, total, unmatched } = useMemo(() => priceList(text, DISHES, size), [text, size]);
  const matched = lines.filter((l) => l.dish);

  // Picking a suggestion rewrites that line with the dish's full name,
  // keeping its quantity and any size that was typed.
  const choose = (line, dish) => {
    const sizeWord = line.sizeTyped ? ` ${SIZE_SHORT[line.size].toLowerCase()}` : "";
    const replacement = `${line.qty > 1 ? `${line.qty}x ` : ""}${dish.name}${sizeWord}`;
    onTextChange(text.replace(line.raw, replacement));
  };

  const totalText = formatMoney(total);

  return (
    <div>
      <div className="px-2 pt-2 pb-3 text-right">
        <div className="min-h-[1.5rem] text-base text-[#a5a5a5]">
          {matched.length ? `${matched.reduce((n, l) => n + l.qty, 0)} trays` : "Type or paste a list below"}
          {unmatched > 0 && <span className="text-[#f1a33c]"> · {unmatched} not counted</span>}
        </div>
        <output className={`block font-light text-white leading-tight tabular-nums ${totalText.length > 10 ? "text-5xl" : "text-6xl"}`} aria-live="polite" aria-label="Total">
          {totalText}
        </output>
      </div>

      <label htmlFor="catering-list" className="sr-only">
        Dish list, one per line
      </label>
      <textarea
        id="catering-list"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={6}
        spellCheck={false}
        autoCapitalize="none"
        className="block w-full resize-y rounded-2xl border-0 bg-[#1c1c1e] p-4 text-base leading-relaxed text-white placeholder:text-[#6b6b6b] focus:outline-none focus:ring-2 focus:ring-[#f1a33c] select-text"
      />

      <div className="mt-3 flex items-center gap-3">
        <span className="shrink-0 text-xs text-[#a5a5a5]">No size typed =</span>
        <div className="flex flex-1 rounded-full bg-[#333] p-1" role="radiogroup" aria-label="Size for lines without one">
          {TRAY_SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={size === s.id}
              onClick={() => onSizeChange(s.id)}
              className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition-colors ${size === s.id ? "bg-[#a5a5a5] text-black" : "text-white"}`}
            >
              {s.short}
            </button>
          ))}
        </div>
      </div>

      {lines.length > 0 && (
        <ul className="mt-4 divide-y divide-[#2c2c2e] rounded-2xl bg-[#1c1c1e] px-4" aria-label="Breakdown">
          {lines.map((line, i) => (
            <li key={i} className="py-3 text-sm">
              {line.dish ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white">
                      {line.qty > 1 && <span className="text-[#f1a33c]">{line.qty}× </span>}
                      {line.dish.name} <span className="text-[#a5a5a5]">({SIZE_SHORT[line.size]})</span>
                    </div>
                    {line.qty > 1 && <div className="text-xs text-[#7a7a7a]">{formatMoney(line.unitPrice)} each</div>}
                  </div>
                  <span className="shrink-0 font-semibold text-white tabular-nums">{formatMoney(line.lineTotal)}</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-start gap-2 text-[#f1a33c]">
                    <i className="fa-solid fa-circle-exclamation mt-0.5" aria-hidden="true"></i>
                    <span className="min-w-0 break-words">
                      “{line.raw}” — {line.options.length ? "which one?" : "not on the menu"}
                    </span>
                  </div>
                  {line.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {line.options.map((dish) => (
                        <button key={dish.id} type="button" onClick={() => choose(line, dish)} className="calc-dish rounded-full bg-[#333] px-3 py-1.5 text-xs text-white">
                          {dish.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-3">
        <button type="button" onClick={() => onTextChange("")} disabled={!text} className="calc-dish flex-1 rounded-full bg-[#5c5c5c] py-3 font-semibold text-white disabled:opacity-40">
          Clear
        </button>
        <button
          type="button"
          onClick={() => onSendToCalculator(matched)}
          disabled={!matched.length}
          className="calc-dish flex-[2] rounded-full bg-[#f1a33c] py-3 font-semibold text-white disabled:opacity-40"
        >
          Open in calculator
        </button>
      </div>
    </div>
  );
}
