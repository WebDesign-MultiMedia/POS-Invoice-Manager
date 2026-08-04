import { useTheme } from "../hooks/useTheme.js";

// Intentionally `absolute`, NOT `fixed` — position: fixed elements have
// repeatedly caused real iOS Safari scroll-bounce bugs on this site (see
// .page-shell::before in src/index.css). Being absolute means this no
// longer floats while scrolling, but it's always the first thing visible
// at the top of every page, which is enough.
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="no-print fab absolute top-4 right-4 z-50 hover:shadow-glow-gold"
    >
      <i className={`fa-solid ${isDark ? "fa-sun" : "fa-moon"} text-xl text-brand-gold`}></i>
    </button>
  );
}
