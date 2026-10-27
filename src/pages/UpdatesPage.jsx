import Layout, { PageHeader } from "../components/Layout.jsx";
import TiltCard from "../components/TiltCard.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";

const UPDATES = [
  {
    icon: "fa-palette",
    title: "Modern blue redesign",
    date: "2026-07-09",
    body: "A cleaner, professional look throughout — a blue/cyan color system, soft shadows, and rounded cards on a light background.",
  },
  {
    icon: "fa-share-nodes",
    title: "Read-only invoice sharing",
    date: "2026-07-08",
    body: "Share a view-only invoice link with a customer straight from the invoice page — they can view, print, or save it, but can't browse other orders or reach the internal tools.",
  },
  {
    icon: "fa-file-invoice-dollar",
    title: "Generate invoice from search",
    date: "2026-07-08",
    body: "Every search result now has a one-click button to jump straight to that order's invoice.",
  },
  {
    icon: "fa-calendar-days",
    title: "Search by name, address, date & month",
    date: "2026-07-08",
    body: "Order search is no longer just phone number — filter by customer name, address, exact date, or a whole month.",
  },
  {
    icon: "fa-cube",
    title: "Full 3D redesign",
    date: "2026-07-07",
    body: "Every page rebuilt with an animated glass/3D look — tilt-on-hover cards, layered depth shadows, and smoother transitions across the order form, search, and invoice.",
  },
  {
    icon: "fa-file-invoice-dollar",
    title: "Downloadable invoices",
    date: "2026-07-07",
    body: "Invoices can now be printed or saved as an image directly from the invoice page.",
  },
  {
    icon: "fa-magnifying-glass",
    title: "Order search by phone",
    date: "2025-08-10",
    body: "Look up any past order instantly by searching a customer's phone number.",
  },
  {
    icon: "fa-receipt",
    title: "Invoice lookup by number",
    date: "2025-08-10",
    body: "Pull up any invoice directly from its receipt number.",
  },
];

export default function UpdatesPage() {
  return (
    <Layout blobs={["bg-brand-pink w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-cactus w-64 h-64 bottom-0 -left-16 animate-float"]}>
      <PageHeader
        marginBottom="mb-8"
        title={
          <>
            <i className="fa-solid fa-wand-magic-sparkles"></i> What's New
          </>
        }
        subtitle="POS-Invoice-Manager Updates"
      />

      <NavRow className="mb-8">
        <NavFab to="/" title="Order form" icon="fa-house" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
        <NavFab to="/search" title="Search orders" icon="fa-magnifying-glass" colorClass="text-brand-teal" glowClass="shadow-glow-teal" />
        <NavFab to="/invoice" title="View invoice" icon="fa-file-invoice-dollar" colorClass="text-brand-terracotta" glowClass="shadow-glow-terracotta" />
        <NavFab to="/pay" title="Pay with Card" icon="fa-credit-card" colorClass="text-brand-cactus" glowClass="shadow-glow-teal" />
      </NavRow>

      <div className="w-full max-w-2xl flex flex-col gap-4">
        {UPDATES.map((update, i) => (
          <TiltCard key={update.title + update.date} maxDeg={3} className="glass-card p-6 stagger-in" delayMs={i * 70}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-brand-navy font-semibold">
                <i className={`fa-solid ${update.icon}`}></i> {update.title}
              </span>
              <span className="text-xs text-brand-muted/60">{update.date}</span>
            </div>
            <p className="text-sm text-brand-muted/90">{update.body}</p>
          </TiltCard>
        ))}
      </div>
    </Layout>
  );
}
