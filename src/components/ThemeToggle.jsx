import { useTheme } from "../hooks/useTheme.js";
import { nextTheme } from "../lib/theme.js";

// Icon/label describe the theme the NEXT tap switches to.
const NEXT_THEME_UI = {
  light: { icon: "fa-sun", label: "Switch to white theme" },
  gray: { icon: "fa-circle-half-stroke", label: "Switch to gray theme" },
  dark: { icon: "fa-moon", label: "Switch to black theme" },
};

// Intentionally `absolute`, NOT `fixed` — position: fixed elements have
// repeatedly caused real iOS Safari scroll-bounce bugs on this site (see
// .page-shell::before in src/index.css). Being absolute means this no
// longer floats while scrolling, but it's always the first thing visible
// at the top of every page, which is enough.
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { icon, label } = NEXT_THEME_UI[nextTheme(theme)];

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="no-print fab absolute top-4 right-4 z-50 hover:shadow-glow-gold"
    >
      <i className={`fa-solid ${icon} text-xl text-brand-gold`}></i>
    </button>
  );
}
