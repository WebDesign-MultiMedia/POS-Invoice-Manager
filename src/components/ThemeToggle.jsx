import { useTheme } from "../hooks/useTheme.js";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="no-print fab fixed top-4 right-4 z-50 hover:shadow-glow-gold"
    >
      <i className={`fa-solid ${isDark ? "fa-sun" : "fa-moon"} text-xl text-brand-gold`}></i>
    </button>
  );
}
