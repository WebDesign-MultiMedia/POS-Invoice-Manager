import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { THEMES } from "../lib/theme.js";

// Top-right button that opens a small menu of every theme (there are too
// many now to cycle through one tap at a time). The developer themes are
// listed under their own heading.
//
// Intentionally `absolute`, NOT `fixed` — position: fixed elements have
// repeatedly caused real iOS Safari scroll-bounce bugs on this site (see
// .page-shell::before in src/index.css). Being absolute means this no
// longer floats while scrolling, but it's always the first thing visible
// at the top of every page, which is enough. The menu hangs under the
// button, also absolute.
export default function ThemeToggle() {
  const { theme, choose } = useTheme();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  // Tapping anywhere else, or Escape, closes the menu.
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const current = THEMES.find((t) => t.key === theme) || THEMES[0];
  const row = (t) => (
    <li key={t.key}>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={t.key === theme}
        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-brand-navydeep hover:bg-brand-navydeep/10 ${t.key === theme ? "bg-brand-navydeep/10" : ""}`}
        onClick={() => {
          choose(t.key);
          setOpen(false);
        }}
      >
        <span className="w-6 h-6 rounded-full border border-brand-navydeep/30 shrink-0" style={{ background: `linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }} aria-hidden="true"></span>
        <span className="flex-1">{t.label}</span>
        {t.key === theme && <i className="fa-solid fa-check text-brand-gold" aria-hidden="true"></i>}
      </button>
    </li>
  );

  return (
    <div ref={wrap} className="no-print absolute top-4 right-4 z-50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Theme: ${current.label}`}
        aria-label={`Change theme (now ${current.label})`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="fab hover:shadow-glow-gold"
      >
        <i className="fa-solid fa-palette text-xl text-brand-gold" aria-hidden="true"></i>
      </button>
      {open && (
        <div role="menu" aria-label="Themes" className="glass-card absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] p-2 flex flex-col gap-1">
          <ul className="flex flex-col gap-0.5">{THEMES.filter((t) => !t.group).map(row)}</ul>
          <p className="field-label px-3 pt-2">
            <i className="fa-solid fa-code" aria-hidden="true"></i> Developer
          </p>
          <ul className="flex flex-col gap-0.5">{THEMES.filter((t) => t.group === "dev").map(row)}</ul>
        </div>
      )}
    </div>
  );
}
