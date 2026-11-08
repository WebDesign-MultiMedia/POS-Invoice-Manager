import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import Layout, { PageHeader } from "../components/Layout.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import CateringListMode from "../components/CateringListMode.jsx";
import CateringQuotes from "../components/CateringQuotes.jsx";
import ShareCalculatorButton from "../components/ShareCalculatorButton.jsx";
import { checkCalculatorToken } from "../api/calculatorLink.js";
import { loadQuotes, saveQuotes, makeQuote, updateQuoteDishes } from "../lib/cateringQuotes.js";
import { CATERING_MENU, DEMO_PRICES, TRAY_SIZES } from "../lib/cateringMenu.js";
import { pressDish, pressOp, pressDelete, pressEquals, evaluate, dishCounts, dishLines } from "../lib/cateringCalc.js";
import { formatMoney } from "../lib/format.js";

const SIZE_SHORT = Object.fromEntries(TRAY_SIZES.map((s) => [s.id, s.short]));
const HOLD_TO_CLEAR_MS = 600;

const MODES = [
  { id: "tap", label: "Tap dishes", icon: "fa-calculator" },
  { id: "list", label: "Type a list", icon: "fa-list" },
];

// Two ways to price a catering order:
//  - "Tap dishes": an iPhone-style calculator where the number keys are
//    catering dishes. Tapping dishes adds them up; ÷ × − + = keep their
//    usual spots down the right side, and ⌫ stays top-left (hold it to
//    clear everything).
//  - "Type a list": type or paste dishes, the total is worked out as you
//    type (CateringListMode).
export default function CateringCalcPage() {
  // An employee's no-login link (?share=1&token=…) shows only the
  // calculator: no menu buttons, no Share, no Make invoice. Its token is
  // checked with the server first.
  const [searchParams] = useSearchParams();
  const shared = searchParams.get("share") === "1";
  const linkToken = searchParams.get("token");
  const [linkState, setLinkState] = useState(shared ? "checking" : "ok");
  useEffect(() => {
    if (!shared) return;
    let cancelled = false;
    checkCalculatorToken(linkToken)
      .then((ok) => !cancelled && setLinkState(ok ? "ok" : "invalid"))
      .catch(() => !cancelled && setLinkState("offline"));
    return () => {
      cancelled = true;
    };
  }, [shared, linkToken]);

  const [mode, setMode] = useState("tap");
  const [listText, setListText] = useState("");
  const [tokens, setTokens] = useState([]);
  const [size, setSize] = useState("whole"); // whole tray is the usual order

  // Dish categories are dropdowns, one open at a time. Opening one scrolls
  // its header to the top of the dish area so its dishes are in view.
  const [openCategory, setOpenCategory] = useState(null);
  const toggleCategory = (category, headerButton) => {
    const opening = openCategory !== category;
    setOpenCategory(opening ? category : null);
    if (opening) {
      requestAnimationFrame(() => {
        const box = headerButton.closest(".overflow-y-auto");
        if (box) box.scrollTo({ top: headerButton.offsetTop - box.offsetTop, behavior: "smooth" });
      });
    }
  };

  // "Open in calculator": each matched line becomes that many taps.
  const sendToCalculator = (lines) => {
    let next = [];
    for (const line of lines) for (let n = 0; n < line.qty; n++) next = pressDish(next, line.dish, line.size);
    setTokens(next);
    setActiveQuoteId(null);
    setMode("tap");
  };

  // "=" saves the order as a quote below the calculator. Carrying on after
  // "=" (adding more dishes, then "=" again) updates that same quote rather
  // than making a new one; starting over makes a new one.
  const [quotes, setQuotes] = useState(loadQuotes);
  const [activeQuoteId, setActiveQuoteId] = useState(null);
  const [savedNote, setSavedNote] = useState(null);
  const updateQuotes = (fn) =>
    setQuotes((prev) => {
      const next = fn(prev);
      saveQuotes(next);
      return next;
    });

  const onEquals = () => {
    const next = pressEquals(tokens);
    if (next === tokens) return;
    const value = next[0].value;
    const dishLinesNow = dishLines(next);
    const continuing = tokens[0]?.type === "result" && quotes.some((q) => q.id === activeQuoteId);
    let saved;
    if (continuing) {
      saved = updateQuoteDishes(quotes.find((q) => q.id === activeQuoteId), dishLinesNow, value);
      updateQuotes((prev) => prev.map((q) => (q.id === saved.id ? saved : q)));
    } else {
      saved = makeQuote(dishLinesNow, value, quotes);
      updateQuotes((prev) => [...prev, saved]);
    }
    setActiveQuoteId(saved.id);
    setSavedNote({ id: saved.id, number: saved.number, updated: continuing });
    setTokens(next);
  };

  useEffect(() => {
    if (!savedNote) return;
    const t = setTimeout(() => setSavedNote(null), 4000);
    return () => clearTimeout(t);
  }, [savedNote]);

  // Back to an empty calculator: the next "=" starts a new quote.
  useEffect(() => {
    if (!tokens.length) setActiveQuoteId(null);
  }, [tokens.length]);

  // The calculator is a popup over the page: full screen on phones, a
  // centered card on bigger screens. It opens with the page, and while
  // it's open the page behind is locked so nothing scrolls the calculator
  // away. Closing it shows the page (menu buttons and saved quotes).
  const [calcOpen, setCalcOpen] = useState(true);
  const calcRef = useRef(null);
  const openButtonRef = useRef(null);
  useEffect(() => {
    if (!calcOpen || linkState !== "ok") return;
    const html = document.documentElement;
    const body = document.body;
    const before = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    calcRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") setCalcOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = before.html;
      body.style.overflow = before.body;
      window.removeEventListener("keydown", onKey);
    };
  }, [calcOpen, linkState]);

  const closeCalc = () => {
    setCalcOpen(false);
    requestAnimationFrame(() => openButtonRef.current?.focus({ preventScroll: true }));
  };

  const scrollToQuote = (id) => {
    setCalcOpen(false);
    requestAnimationFrame(() => document.getElementById(`quote-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const total = evaluate(tokens);
  const counts = useMemo(() => dishCounts(tokens), [tokens]);
  const lines = useMemo(() => dishLines(tokens), [tokens]);
  const lastOp = tokens.length && tokens[tokens.length - 1].type === "op" ? tokens[tokens.length - 1].op : null;

  // Keep the newest dish in view at the bottom of the list.
  const tapeRef = useRef(null);
  useEffect(() => {
    if (tapeRef.current) tapeRef.current.scrollTop = tapeRef.current.scrollHeight;
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

  if (linkState !== "ok") return <LinkStatus state={linkState} />;

  return (
    <Layout blobs={["bg-brand-gold w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-teal w-64 h-64 bottom-0 -left-16 animate-float"]}>
      {!shared && (
      <NavRow className="mb-6">
        <NavFab to="/" title="Order form" icon="fa-house" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
        <NavFab to="/search" title="Search orders" icon="fa-magnifying-glass" colorClass="text-brand-teal" glowClass="shadow-glow-teal" />
        <NavFab to="/invoice" title="View invoice" icon="fa-file-invoice-dollar" colorClass="text-brand-terracotta" glowClass="shadow-glow-terracotta" />
        <NavFab to="/pay" title="Pay with Card" icon="fa-credit-card" colorClass="text-brand-cactus" glowClass="shadow-glow-teal" />
      </NavRow>
      )}

      <PageHeader title="Catering Calculator" subtitle="Tap dishes to add them up" />

      <button ref={openButtonRef} type="button" onClick={() => setCalcOpen(true)} className="btn-3d stagger-in w-full max-w-md !py-4 text-lg">
        <i className="fa-solid fa-calculator" aria-hidden="true"></i> Open calculator
        {tokens.length > 0 && <span className="font-normal opacity-90">· {totalText}</span>}
      </button>

      {/* Portaled to <body> so it covers the page's floating buttons (theme,
          log out), which sit above <main> and everything inside it. */}
      {calcOpen && createPortal(
      <div className="calc-popup fixed inset-0 z-[60] flex justify-center overflow-y-auto overscroll-contain bg-black sm:items-center sm:bg-black/75 sm:p-6">
      <section
        ref={calcRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Catering calculator"
        className="catering-calc flex w-full max-w-md flex-col p-4 outline-none max-sm:min-h-full max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] sm:my-auto sm:rounded-[2.5rem] sm:p-5"
      >
        <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={closeCalc}
          className="calc-dish flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#333] text-white"
          aria-label="Close calculator"
          title="Close (shows the menu and saved quotes)"
        >
          <i className="fa-solid fa-xmark text-lg" aria-hidden="true"></i>
        </button>
        <div className="flex min-w-0 flex-1 rounded-full bg-[#1c1c1e] p-1" role="tablist" aria-label="How to calculate">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-full py-2 text-sm font-semibold transition-colors ${mode === m.id ? "bg-[#f1a33c] text-white" : "text-[#a5a5a5]"}`}
            >
              <i className={`fa-solid ${m.icon} mr-1.5 max-[400px]:hidden`} aria-hidden="true"></i>
              {m.label}
            </button>
          ))}
        </div>
        {!shared && <ShareCalculatorButton className="calc-dish flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#333] text-white" />}
        </div>

        {DEMO_PRICES && mode === "list" && <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#f1a33c] mb-1">Demo prices</p>}

        {mode === "list" ? (
          <CateringListMode text={listText} onTextChange={setListText} size={size} onSizeChange={setSize} onSendToCalculator={sendToCalculator} />
        ) : (
        <div className="flex flex-1 flex-col">
        {/* Display: the picked dishes as a list, the running total under it. */}
        <div className="px-1 pt-1 pb-3">
          <ul
            ref={tapeRef}
            className="max-h-[9.5rem] max-sm:max-h-[min(9.5rem,18dvh)] min-h-[2.75rem] overflow-y-auto overscroll-contain rounded-2xl bg-[#1c1c1e] px-3 py-2 text-sm no-scrollbar"
            aria-label="Dishes selected"
          >
            {lines.length === 0 ? (
              <li className="py-1.5 text-center text-[#7a7a7a]">No dishes yet. Tap a dish to start.</li>
            ) : (
              lines.map((line, i) =>
                line.kind === "subtotal" ? (
                  <li key={i} className="mt-1 flex justify-between border-t border-dashed border-[#3a3a3c] pt-1.5 font-semibold text-white tabular-nums">
                    <span className="text-[#f1a33c]">=</span>
                    <span>{formatMoney(line.value)}</span>
                  </li>
                ) : (
                  <li key={i} className="flex items-baseline gap-2 py-1">
                    <span className={`w-3 shrink-0 text-center ${line.op && line.op !== "+" ? "text-base font-semibold text-[#f1a33c]" : "text-[#f1a33c]"}`} aria-label={line.op ? OP_LABELS[line.op] : undefined}>
                      {line.op && line.op !== "+" ? line.op : "•"}
                    </span>
                    <span className="min-w-0 flex-1 text-white">
                      {line.qty > 1 && <span className="font-semibold text-[#f1a33c]">{line.qty}× </span>}
                      {line.name} <span className="text-[#7a7a7a]">({SIZE_SHORT[line.size]})</span>
                    </span>
                    <span className="shrink-0 text-[#a5a5a5] tabular-nums">{formatMoney(line.amount)}</span>
                  </li>
                )
              )
            )}
          </ul>
          <div className="mt-2 flex items-end justify-between gap-2 px-1">
            {/* Beside the total (not on its own line) to save height on phones. */}
            <span className="pb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-[#f1a33c]">{DEMO_PRICES && "Demo prices"}</span>
            <output className={`block text-right font-light text-white leading-tight tabular-nums ${totalSize} [@media(max-height:640px)]:text-5xl`} aria-live="polite" aria-label="Total">
              {totalText}
            </output>
          </div>
          <p className="min-h-[1.25rem] px-1 text-right text-sm text-[#f1a33c]" role="status">
            {savedNote && (
              <button type="button" onClick={() => scrollToQuote(savedNote.id)} className="underline-offset-2 hover:underline">
                <i className="fa-solid fa-check" aria-hidden="true"></i> {savedNote.updated ? "Updated" : "Saved as"} Quote #{savedNote.number} below{" "}
                <i className="fa-solid fa-arrow-down" aria-hidden="true"></i>
              </button>
            )}
          </p>
        </div>

        <div className="grid flex-1 grid-cols-4 grid-rows-[auto_1fr] gap-3">
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
              {CATERING_MENU.map(({ category, dishes }) => {
                const isOpen = openCategory === category;
                const picked = dishes.reduce((n, d) => n + (counts[`${d.id}:half`] || 0) + (counts[`${d.id}:whole`] || 0), 0);
                const panelId = `cat-${dishes[0].id}`;
                return (
                <div key={category} className="mb-2">
                  <h2>
                    <button
                      type="button"
                      onClick={(e) => toggleCategory(category, e.currentTarget)}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      className={`calc-dish flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-white ${isOpen ? "bg-[#5c5c5c]" : "bg-[#333]"}`}
                    >
                      <span className="min-w-0 flex-1">{category}</span>
                      {picked > 0 && (
                        <span className="min-w-[1.25rem] rounded-full bg-[#f1a33c] px-1.5 text-center text-[0.7rem] font-bold leading-5" aria-label={`${picked} picked`}>
                          {picked}
                        </span>
                      )}
                      <i className={`fa-solid fa-chevron-down text-xs text-[#a5a5a5] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true"></i>
                    </button>
                  </h2>
                  {isOpen && (
                  <div id={panelId} className="mt-2 grid grid-cols-3 gap-2">
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
                  )}
                </div>
                );
              })}
            </div>
          </div>

          <div className="calc-op-col flex flex-col justify-start gap-3">
            {["×", "−", "+"].map((op) => (
              <OpKey key={op} op={op} active={lastOp === op} onPress={(o) => setTokens((t) => pressOp(t, o))} />
            ))}
            <button type="button" className="calc-key calc-key-op" onClick={onEquals} aria-label="Equals, save as a quote" title="Total and save as a quote">
              =
            </button>
          </div>
        </div>
        </div>
        )}
      </section>
      </div>,
      document.body
      )}

      <CateringQuotes
        canInvoice={!shared}
        quotes={quotes}
        highlightId={activeQuoteId}
        onChange={(quote) => updateQuotes((prev) => prev.map((q) => (q.id === quote.id ? quote : q)))}
        onDelete={(id) => {
          updateQuotes((prev) => prev.filter((q) => q.id !== id));
          if (id === activeQuoteId) setActiveQuoteId(null);
        }}
      />
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

// What a no-login link shows while it's checked, or when it can't be used.
function LinkStatus({ state }) {
  const content = {
    checking: { icon: "fa-spinner fa-spin", title: "Opening the calculator…", text: "" },
    invalid: { icon: "fa-link-slash", title: "This link doesn't work anymore", text: "Ask your manager for a new calculator link." },
    offline: { icon: "fa-wifi", title: "Couldn't open the calculator", text: "Check your connection, then reload this page." },
  }[state];
  return (
    <Layout>
      <PageHeader title="Catering Calculator" subtitle="" />
      <div className="glass-card w-full max-w-md p-6 text-center" role={state === "checking" ? "status" : "alert"}>
        <i className={`fa-solid ${content.icon} text-3xl text-brand-gold`} aria-hidden="true"></i>
        <p className="mt-3 font-semibold text-brand-navy">{content.title}</p>
        {content.text && <p className="mt-1 text-sm text-brand-muted">{content.text}</p>}
      </div>
    </Layout>
  );
}
