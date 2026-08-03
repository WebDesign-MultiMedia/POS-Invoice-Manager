import { Link } from "react-router-dom";
import TiltCard from "./TiltCard.jsx";

// One circular icon-link button (the ".fab" footer nav repeated on all 4 pages).
export default function NavFab({ to, href, title, icon, colorClass, glowClass, external = false }) {
  const content = (
    <TiltCard maxDeg={10} className={`fab glass-panel hover:${glowClass}`}>
      <i className={`fa-solid ${icon} text-2xl ${colorClass}`}></i>
    </TiltCard>
  );

  if (external || href) {
    return (
      <a href={href} title={title} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
        {content}
      </a>
    );
  }

  return (
    <Link to={to} title={title}>
      {content}
    </Link>
  );
}

export function NavRow({ children, className = "" }) {
  return <section className={`flex justify-center gap-6 sm:gap-10 stagger-in ${className}`.trim()}>{children}</section>;
}
