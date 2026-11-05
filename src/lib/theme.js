// Every visit starts in the blue theme (the login screen's look carried
// across the app); the top-right toggle cycles
// blue → dark green → dark red → black → white → gray.
// The choice lives only in memory, so it carries across client-side page
// changes but a fresh load/visit is blue again.
const THEME_ORDER = ["blue", "green", "red", "dark", "light", "gray"];
// Themes built on the dark palette plus their own .theme-* colour overrides.
const TINTED_DARK = ["blue", "green", "red"];
let currentTheme = "blue";

export function getTheme() {
  return currentTheme;
}

export function nextTheme(theme) {
  return THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
}

// Applies the theme to the real <html> node directly (not through React
// state) so it survives client-side route changes without a flash: Layout
// remounts on every page navigation, but the DOM node does not. "gray" is
// the light palette plus .theme-gray overrides; blue, green and red are the
// dark palette plus .theme-blue / .theme-green / .theme-red (src/index.css).
export function applyTheme(theme) {
  currentTheme = theme;
  const root = document.documentElement.classList;
  root.toggle("dark", theme === "dark" || TINTED_DARK.includes(theme));
  for (const tint of TINTED_DARK) root.toggle(`theme-${tint}`, theme === tint);
  root.toggle("theme-gray", theme === "gray");
}

// Called once, synchronously, before React renders (see src/main.jsx) so
// blue is already applied on first paint.
export function initTheme() {
  // Older versions remembered the theme in localStorage; drop it so it
  // can't linger or confuse anyone reading storage.
  try {
    localStorage.removeItem("theme");
  } catch {
    // Storage can be blocked (private mode); nothing to clean up then.
  }
  applyTheme("blue");
}
