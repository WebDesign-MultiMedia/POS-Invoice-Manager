import { useEffect, useMemo, useRef, useState } from "react";
import Layout, { PageHeader } from "../components/Layout.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import { CATERING_MENU, DEMO_PRICES, TRAY_SIZES } from "../lib/cateringMenu.js";
import { pressDish, pressOp, pressDelete, pressEquals, evaluate, dishCounts } from "../lib/cateringCalc.js";
import { formatMoney } from "../lib/format.js";

const SIZE_SHORT = Object.fromEntries(TRAY_SIZES.map((s) => [s.id, s.short]));
const HOLD_TO_CLEAR_MS = 600;

// An iPhone-style calculator where the number keys are catering dishes.
// Tapping dishes adds them up; ÷ × − + = keep their usual spots down the
// right side, and ⌫ stays top-left (hold it to clear everything).
export default function CateringCalcPage() {
  const [tokens, setTokens] = useState([]);
  const [size, setSize] = useState("half");
  const total = evaluate(tokens);
  const counts = useMemo(() => dishCounts(tokens), [tokens]);
  const lastOp = tokens.length && tokens[tokens.length - 1].type === "op" ? tokens[tokens.length - 1].op : null;

  // Keep the newest part of a long expression in view.
  const tapeRef = useRef(null);
  useEffect(() => {
    if (tapeRef.current) tapeRef.current.scrollLeft = tapeRef.current.scrollWidth;
  }, [tokens]);

  // ⌫: a tap deletes the last entry; holding it clears everything.
  const holdTimer = useRef(null);
  const held = useRef(false);
  const startHold = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setTokens([]);
    }, HOLD_TO_CLEAR_MS);
  };
  const endHold = () => clearTimeout(holdTimer.current);
  const onDelete = () => {
    if (held.current) return void (held.current = false);
    setTokens(pressDelete);
  };

  const totalText = formatMoney(total);
  const totalSize = totalText.length > 13 ? "text-4xl" : totalText.length > 10 ? "text-5xl" : "text-6xl";

  return (
    <Layout blobs={["bg-brand-gold w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-teal w-64 h-64 bottom-0 -left-16 animate-float"]}>
      <NavRow className="mb-6">
        <NavFab to="/" title="Order form" icon="fa-house" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
        <NavFab to="/search" title="Search orders" icon="fa-magnifying-glass" colorClass="text-brand-teal" glowClass="shadow-glow-teal" />
        <NavFab to="/invoice" title="View invoice" icon="fa-file-invoice-dollar" colorClass="text-brand-terracotta" glowClass="shadow-glow-terracotta" />
        <NavFab to="/pay" title="Pay with Card" icon="fa-credit-card" colorClass="text-brand-cactus" glowClass="shadow-glow-teal" />
      </NavRow>

      <PageHeader title="Catering Calculator" subtitle="Tap dishes to add them up" />

      <section className="catering-calc stagger-in w-full max-w-md rounded-[2.5rem] p-4 sm:p-5" aria-label="Catering calculator">
        {DEMO_PRICES && <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#f1a33c] mb-1">Demo prices</p>}

        {/* Display: the expression on top, the running total under it. */}
        <div className="px-2 pt-2 pb-3 text-right">
          <div ref={tapeRef} className="min-h-[1.5rem] overflow-x-auto whitespace-nowrap text-base text-[#a5a5a5] no-scrollbar" aria-label="Expression">
            {tokens.map((t, i) =>
              t.type === "op" ? (
                <span key={i} className="mx-1.5 text-[#f1a33c]">{t.op}</span>
              ) : t.type === "result" ? (
                <span key={i}>{formatMoney(t.value)}</span>
              ) : (
                <span key={i}>
                  {t.name} <span className="text-[#7a7a7a]">({SIZE_SHORT[t.size]})</span>
                </span>
              )
            )}
          </div>
          <output className={`block font-light text-white leading-tight tabular-nums ${totalSize}`} aria-live="polite" aria-label="Total">
            {totalText}
          </output>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {/* Top row: ⌫ · tray size · ÷ (AC and % left out for now) */}
          <button
            type="button"
            className="calc-key calc-key-fn"
            onClick={onDelete}
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => e.preventDefault()}
            title="Delete (hold to clear all)"
            aria-label="Delete last entry. Hold to clear all."
          >
            <i className="fa-solid fa-delete-left text-2xl" aria-hidden="true"></i>
          </button>

          <div className="col-span-2 flex rounded-full bg-[#333] p-1" role="radiogroup" aria-label="Tray size">
            {TRAY_SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={size === s.id}
                onClick={() => setSize(s.id)}
                className={`flex-1 rounded-full text-sm font-semibold transition-colors ${size === s.id ? "bg-[#a5a5a5] text-black" : "text-white"}`}
              >
                {s.short}
              </button>
            ))}
          </div>

          <OpKey op="÷" active={lastOp === "÷"} onPress={(op) => setTokens((t) => pressOp(t, op))} />

          {/* Dishes take the number keys' place and scroll; × − + = stay put. */}
          <div className="relative col-span-3">
            <div className="absolute inset-0 overflow-y-auto overscroll-contain rounded-2xl no-scrollbar">
              {CATERING_MENU.map(({ category, dishes }) => (
                <div key={category} className="mb-2">
                  <h2 className="sticky top-0 z-10 bg-black py-1 text-[0.7rem] font-semibold uppercase tracking-wider text-[#a5a5a5]">{category}</h2>
                  <div className="grid grid-cols-3 gap-2">
                    {dishes.map((dish) => {
                      const count = counts[`${dish.id}:${size}`];
                      return (
                        <button
                          key={dish.id}
                          type="button"
                          onClick={() => setTokens((t) => pressDish(t, dish, size))}
                          className="calc-dish relative flex min-h-[4.5rem] flex-col items-center justify-center rounded-2xl bg-[#333] px-1.5 py-2 text-center text-white"
                          aria-label={`${dish.name}, ${SIZE_SHORT[size].toLowerCase()} tray, ${formatMoney(dish.prices[size])}`}
                        >
                          <span className="text-[0.75rem] leading-tight">{dish.name}</span>
                          <span className="mt-1 text-xs font-semibold text-[#f1a33c] tabular-nums">{formatMoney(dish.prices[size])}</span>
                          {count > 0 && (
                            <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-[#f1a33c] px-1 text-[0.7rem] font-bold leading-5 text-white" aria-hidden="true">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {["×", "−", "+"].map((op) => (
              <OpKey key={op} op={op} active={lastOp === op} onPress={(o) => setTokens((t) => pressOp(t, o))} />
            ))}
            <button type="button" className="calc-key calc-key-op" onClick={() => setTokens(pressEquals)} aria-label="Equals">
              =
            </button>
          </div>
        </div>
      </section>
    </Layout>
  );
}

const OP_LABELS = { "+": "Plus", "−": "Minus", "×": "Times", "÷": "Divide" };

function OpKey({ op, active, onPress }) {
  return (
    <button
      type="button"
      className={`calc-key calc-key-op ${active ? "is-active" : ""}`}
      onClick={() => onPress(op)}
      aria-label={OP_LABELS[op]}
      aria-pressed={active}
    >
      {op}
    </button>
  );
}
