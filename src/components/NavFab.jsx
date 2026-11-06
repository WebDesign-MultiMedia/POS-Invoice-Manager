import { Link } from "react-router-dom";
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
