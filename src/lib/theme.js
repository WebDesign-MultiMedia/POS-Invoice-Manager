const STORAGE_KEY = "theme";

export function getStoredTheme() {
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

// Applies the theme to the real <html> node directly (not through React
// state) so it survives client-side route changes without a flash: Layout
// remounts on every page navigation, but the DOM node and localStorage do
// not.
export function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(STORAGE_KEY, theme);
}

// Called once, synchronously, before React renders (see src/main.jsx) so
// the correct theme is already applied on first paint.
export function initTheme() {
  applyTheme(getStoredTheme());
}
