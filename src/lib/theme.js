// Every visit starts in dark mode; the top-right toggle cycles
// dark → light → gray. The choice lives only in memory, so it carries across
// client-side page changes but a fresh load/visit is dark again.
const THEME_ORDER = ["dark", "light", "gray"];
let currentTheme = "dark";

export function getTheme() {
  return currentTheme;
}

export function nextTheme(theme) {
  return THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
}

// Applies the theme to the real <html> node directly (not through React
// state) so it survives client-side route changes without a flash: Layout
// remounts on every page navigation, but the DOM node does not. "gray" is
// the light palette plus .theme-gray overrides (see src/index.css).
export function applyTheme(theme) {
  currentTheme = theme;
  const root = document.documentElement.classList;
  root.toggle("dark", theme === "dark");
  root.toggle("theme-gray", theme === "gray");
}

// Called once, synchronously, before React renders (see src/main.jsx) so
// dark is already applied on first paint.
export function initTheme() {
  // Older versions remembered the theme in localStorage; drop it so it
  // can't linger or confuse anyone reading storage.
  try {
    localStorage.removeItem("theme");
  } catch {
    // Storage can be blocked (private mode); nothing to clean up then.
  }
  applyTheme("dark");
}
