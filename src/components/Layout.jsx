import ThemeToggle from "./ThemeToggle.jsx";
import DemoBanner from "./DemoBanner.jsx";
import { useAuth } from "../lib/auth.jsx";
import { isDemo } from "../lib/demo.js";

// Top-left, opposite the theme toggle. Absolute (not fixed) for the same
// iOS reason as ThemeToggle. Hidden on customers' shared invoice links,
// since they aren't logged in.
function LogoutButton() {
  const { user, status, logout } = useAuth();
  if (!user) return null;
  const label = status === "demo" ? "Exit demo" : `Log out (${user})`;
  return (
    <button
      type="button"
      onClick={logout}
      title={label}
      aria-label={status === "demo" ? "Exit demo" : "Log out"}
      className="no-print fab absolute top-4 left-4 z-50 hover:shadow-glow-gold"
    >
      <i className="fa-solid fa-right-from-bracket text-xl text-brand-gold" aria-hidden="true"></i>
    </button>
  );
}

// Shared page chrome: the floating decorative blobs + the centered <main>
// wrapper repeated (with only colors/spacing varying) across all 4 pages.
export default function Layout({ blobs = [], children, mainClassName = "" }) {
  return (
    <>
      <ThemeToggle />
      <LogoutButton />
      {blobs.map((cls, i) => (
        <div key={i} className={`blob ${cls}`} aria-hidden="true"></div>
      ))}
      {/* pt-24 keeps the page (usually the round nav buttons) clear of the
          log out / theme buttons in the top corners. */}
      <main className={`relative z-10 flex flex-col items-center px-4 pt-24 pb-10 ${mainClassName}`.trim()}>
        <DemoBanner />
        {children}
      </main>
    </>
  );
}

export function PageHeader({ logoSize = "w-28 h-28 sm:w-32 sm:h-32", title, subtitle, marginBottom = "mb-6" }) {
  return (
    <div className={`flex flex-col items-center ${marginBottom} stagger-in`}>
      {/* The demo is a fictional business, so it shows a generic mark
          instead of the restaurant's logo. */}
      {isDemo() ? (
        <span className={`${logoSize} glass-panel !rounded-full flex items-center justify-center`} aria-hidden="true">
          <i className="fa-solid fa-mug-saucer text-4xl sm:text-5xl text-brand-gold"></i>
        </span>
      ) : (
        <img src="/imgs/BLFM-logo.PNG" alt="Buffet Lucia Fiesta Mexicana logo" className={`${logoSize} object-contain drop-shadow-lg`} />
      )}
      <h1 className="font-headings text-2xl sm:text-3xl leading-snug shimmer-text text-center mt-2">{title}</h1>
      <p className="text-brand-navydeep/90 text-sm leading-relaxed tracking-widest uppercase text-center mt-2 max-w-md px-2 text-balance">
        {/* Keep a "•" separator on the end of the line it follows, never starting the next one. */}
        {typeof subtitle === "string" ? subtitle.replace(/ • /g, "\u00a0• ") : subtitle}
      </p>
    </div>
  );
}
