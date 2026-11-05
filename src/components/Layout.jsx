import ThemeToggle from "./ThemeToggle.jsx";
import { useAuth } from "../lib/auth.jsx";

// Top-left, opposite the theme toggle. Absolute (not fixed) for the same
// iOS reason as ThemeToggle. Hidden on customers' shared invoice links,
// since they aren't logged in.
function LogoutButton() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <button
      type="button"
      onClick={logout}
      title={`Log out (${user})`}
      aria-label="Log out"
      className="no-print fab absolute top-4 left-4 z-50 hover:shadow-glow-gold"
    >
      <i className="fa-solid fa-right-from-bracket text-xl text-brand-gold"></i>
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
        <div key={i} className={`blob ${cls}`}></div>
      ))}
      <main className={`relative z-10 flex flex-col items-center px-4 py-10 ${mainClassName}`.trim()}>
        {children}
      </main>
    </>
  );
}

export function PageHeader({ logoSize = "w-16 h-16", title, subtitle, marginBottom = "mb-6" }) {
  return (
    <div className={`flex flex-col items-center ${marginBottom} stagger-in`}>
      <img src="/imgs/BLFM-logo.PNG" alt="logo" className={`${logoSize} object-contain drop-shadow-lg`} />
      <h1 className="font-headings text-2xl sm:text-3xl leading-snug shimmer-text text-center mt-2">{title}</h1>
      <p className="text-brand-muted/80 text-sm leading-relaxed tracking-widest uppercase text-center mt-2 max-w-md px-2 text-balance">
        {/* Keep a "•" separator on the end of the line it follows, never starting the next one. */}
        {typeof subtitle === "string" ? subtitle.replace(/ • /g, "\u00a0• ") : subtitle}
      </p>
    </div>
  );
}
