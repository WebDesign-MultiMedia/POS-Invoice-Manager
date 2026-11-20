import Layout, { PageHeader } from "../components/Layout.jsx";
import TiltCard from "../components/TiltCard.jsx";
import { SiteNav } from "../components/NavFab.jsx";

const UPDATES = [
  {
    icon: "fa-code-branch",
    title: "Web Design: your GitHub projects",
    date: "2026-11-20",
    body: "The Web Design page has a Projects tab next to Leads. It lists every GitHub project, newest first, with a Live site button (when the project has its website set on GitHub) and a Code button. Search them, or show only Live sites or the last 30 days. Archived projects and forks are hidden until you tap that button. With Vercel connected, projects get their live site from Vercel, a Vercel button, and Vercel sites that aren't on GitHub show up too.",
  },
  {
    icon: "fa-trash-can-arrow-up",
    title: "Web Design: delete, Undo and Recently deleted",
    date: "2026-11-19",
    body: "Each business on the Web Design page has a trash button. Deleted one by mistake? Tap Undo right after, or open Recently deleted at the bottom and tap Restore. It comes back exactly as it was; the row never leaves the Google Sheet.",
  },
  {
    icon: "fa-laptop-code",
    title: "Web Design & MultiMedia leads",
    date: "2026-11-19",
    body: "A separate login for the Web Design & MultiMedia business. It opens only its own list of businesses (from its own Google Sheet): search, filter by No website or Didn't answer, tap to call or open their Instagram, Google map and website, and add or edit a business. It never sees restaurant orders or sales. The owner's login can open it too.",
  },
  {
    icon: "fa-rotate-left",
    title: "Undo a deleted order",
    date: "2026-11-19",
    body: "Deleted an order by mistake? Tap Undo right after, or open Recently deleted under the order list and tap Restore. The order comes back with the same number and everything it had.",
  },
  {
    icon: "fa-gift",
    title: "Holiday orders",
    date: "2026-11-18",
    body: "The order form has a Holiday choice: leave it on Regular order, or pick the holiday (Christmas Eve, Thanksgiving, Día de los Muertos…). Holiday orders get a tag in the order list and on Search, and the invoice says \"Holiday order\".",
  },
  {
    icon: "fa-clock",
    title: "Order date and time fill in by themselves",
    date: "2026-11-18",
    body: "The top of the order form shows the order number, date and time. The date and time are saved automatically when you press Submit Order, so you never type them. On the invoice, the customer's name sits under BILL TO and long names or phones stay on one line.",
  },
  {
    icon: "fa-barcode",
    title: "Scan to pick the right product",
    date: "2026-11-14",
    body: "On a shopping trip, scan a product's barcode: the app finds it on the list and ticks it off, or warns you when it's the wrong one or not on the list. New lists also name themselves with the stores, date and time.",
  },
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
