// The top-right toggle cycles blue → dark green → dark red → black → white
// → gray. The choice is remembered on this device (localStorage), so the
// login screen, logging in/out and reopening the app all keep the theme
// that was picked. Blue is the default until one is picked.
const THEME_ORDER = ["blue", "green", "red", "dark", "light", "gray"];
// Themes built on the dark palette plus their own .theme-* colour overrides.
const TINTED_DARK = ["blue", "green", "red"];
const STORAGE_KEY = "pim-theme";
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
export function applyTheme(theme, { remember = true } = {}) {
  currentTheme = theme;
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage blocked (private mode): the theme still applies for this visit.
    }
  }
  const root = document.documentElement.classList;
  root.toggle("dark", theme === "dark" || TINTED_DARK.includes(theme));
  for (const tint of TINTED_DARK) root.toggle(`theme-${tint}`, theme === tint);
  root.toggle("theme-gray", theme === "gray");
}

export function savedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEME_ORDER.includes(saved) ? saved : "blue";
  } catch {
    return "blue";
  }
}

// Called once, synchronously, before React renders (see src/main.jsx) so
// the saved theme is already applied on first paint (no flash of blue).
export function initTheme() {
  // Older versions used a "theme" key with different names; drop it.
  try {
    localStorage.removeItem("theme");
  } catch {
    // Storage can be blocked (private mode); nothing to clean up then.
  }
  applyTheme(savedTheme(), { remember: false });
}
