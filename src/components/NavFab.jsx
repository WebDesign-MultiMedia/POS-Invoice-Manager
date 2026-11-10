import { Link, useLocation } from "react-router-dom";
import { isDemo } from "../lib/demo.js";
import { useAuth } from "../lib/auth.jsx";
import { canOpen } from "../lib/permissions.js";
import { hardRefresh } from "../lib/hardRefresh.js";
import { useState } from "react";
import TiltCard from "./TiltCard.jsx";

// One circular icon-link button (the ".fab" footer nav repeated on all 4 pages).
export default function NavFab({ to, href, title, icon, colorClass, glowClass, external = false }) {
  const content = (
    <TiltCard maxDeg={10} className={`fab glass-panel hover:${glowClass}`}>
      <i className={`fa-solid ${icon} text-2xl ${colorClass}`} aria-hidden="true"></i>
    </TiltCard>
  );

  // Icon-only buttons: aria-label gives screen readers the name the
  // tooltip shows sighted users.
  if (external || href) {
    return (
      <a href={href} title={title} aria-label={title} className="nav-fab-link" target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
        {content}
      </a>
    );
  }

  return (
    <Link to={to} title={title} aria-label={title} className="nav-fab-link">
      {content}
    </Link>
  );
}

export function NavRow({ children, className = "" }) {
  return <section className={`flex flex-wrap justify-center gap-6 sm:gap-10 stagger-in ${className}`.trim()}>{children}</section>;
}

// Every section of the app, in one place, so all pages show the same buttons.
const SECTIONS = [
  { to: "/", title: "Order form", icon: "fa-house", colorClass: "text-brand-gold", glowClass: "shadow-glow-gold" },
  { to: "/search", title: "Search orders", icon: "fa-magnifying-glass", colorClass: "text-brand-teal", glowClass: "shadow-glow-teal" },
  { to: "/invoice", title: "View invoice", icon: "fa-file-invoice-dollar", colorClass: "text-brand-terracotta", glowClass: "shadow-glow-terracotta" },
  { to: "/pay", title: "Pay with Card", icon: "fa-credit-card", colorClass: "text-brand-cactus", glowClass: "shadow-glow-teal" },
  { to: "/event", title: "Event sales", icon: "fa-store", colorClass: "text-brand-terracotta", glowClass: "shadow-glow-terracotta" },
  { to: "/employees", title: "Team & permissions", icon: "fa-users", colorClass: "text-brand-teal", glowClass: "shadow-glow-teal" },
  { to: "/catering", title: "Catering calculator", icon: "fa-calculator", colorClass: "text-brand-gold", glowClass: "shadow-glow-gold" },
  { to: "/broadcast", title: "Text customers", icon: "fa-bullhorn", colorClass: "text-brand-pink", glowClass: "shadow-glow-pink" },
  { to: "/updates", title: "What's new", icon: "fa-wand-magic-sparkles", colorClass: "text-brand-pink", glowClass: "shadow-glow-pink" },
];

// The nav row for every page: all sections except the one you're on, plus
// the spreadsheet. The real Google Sheet isn't part of the demo; the link
// goes through a staff-only redirect (api/sheet-link.js) so the sheet's
// address isn't in the public bundle.
// Employee logins see only the sections the owner gave them (Team page).
export function SiteNav({ className = "" }) {
  const { pathname } = useLocation();
  const { isEmployee, can } = useAuth() || {};
  const allowed = (to) => !can || canOpen(can, to);
  return (
    <NavRow className={className}>
      {SECTIONS.filter((s) => s.to !== pathname && allowed(s.to)).map((s) => (
        <NavFab key={s.to} {...s} />
      ))}
      {!isDemo() && !isEmployee && <NavFab href="/api/sheet-link" external title="Open spreadsheet" icon="fa-file-excel" colorClass="text-brand-teal" glowClass="shadow-glow-teal" />}
      <RefreshFab />
    </NavRow>
  );
}

// Hard refresh: loads the newest version of the app (see lib/hardRefresh.js).
function RefreshFab() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      title="Refresh app"
      aria-label="Refresh app"
      className="nav-fab-link"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        hardRefresh();
      }}
    >
      <TiltCard maxDeg={10} className="fab glass-panel hover:shadow-glow-teal">
        <i className={`fa-solid fa-arrows-rotate text-2xl text-brand-teal ${busy ? "fa-spin" : ""}`} aria-hidden="true"></i>
      </TiltCard>
    </button>
  );
}
