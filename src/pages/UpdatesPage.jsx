import Layout, { PageHeader } from "../components/Layout.jsx";
import TiltCard from "../components/TiltCard.jsx";
import { SiteNav } from "../components/NavFab.jsx";

const UPDATES = [
  {
    icon: "fa-tags",
    title: "Receipts keep catalog prices up to date",
    date: "2026-11-14",
    body: "When a receipt is scanned on a shopping trip, the products on it get the price actually paid in the catalog: missing prices are filled in and changed ones updated, with the old price kept in the note. Each change is listed under the receipt.",
  },
  {
    icon: "fa-paste",
    title: "Paste a texted shopping list",
    date: "2026-11-13",
    body: "Got the list by text? Paste it into a new shopping list and the app splits it by store and matches things to the catalog. Employees can now make their own lists this way, and fix them until the trip is done.",
  },
  {
    icon: "fa-route",
    title: "One list, several stores",
    date: "2026-11-12",
    body: "A shopping list can now cover several stops, like a wholesale club and then a grocery store. Each store gets its own part of the list, receipts are labeled by store, and the receipt totals are added up for you.",
  },
  {
    icon: "fa-store",
    title: "Product catalog",
    date: "2026-11-12",
    body: "Managers keep a catalog of the things you buy all the time at your wholesale stores, grouped by store, with pictures, prices and bin numbers. Tap a picture to see it bigger. Making a shopping list is now tapping products instead of typing, and whoever shops sees each picture and where to find it.",
  },
  {
    icon: "fa-wand-magic-sparkles",
    title: "Receipts read themselves",
    date: "2026-11-12",
    body: "After you scan a receipt on a shopping trip, the app reads it and shows the store, date, every item and the total under the photo, and fills in the receipt total for you.",
  },
  {
    icon: "fa-cart-shopping",
    title: "Shopping lists & receipts",
    date: "2026-11-12",
    body: "Managers write a shopping list and give it to an employee (or anyone). At the store they check things off, mark what was out of stock, scan the receipt and type its total. Managers see every trip, its receipt photos, and what each month cost.",
  },
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

      <SiteNav className="mb-8" />

      <div className="w-full max-w-2xl flex flex-col gap-4">
        {UPDATES.map((update, i) => (
          <TiltCard key={update.title + update.date} maxDeg={3} className="glass-card p-6 stagger-in" delayMs={i * 70}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-brand-navy font-semibold">
                <i className={`fa-solid ${update.icon}`}></i> {update.title}
              </span>
              <span className="text-xs text-brand-muted/85">{update.date}</span>
            </div>
            <p className="text-sm text-brand-muted/90">{update.body}</p>
          </TiltCard>
        ))}
      </div>
    </Layout>
  );
}
