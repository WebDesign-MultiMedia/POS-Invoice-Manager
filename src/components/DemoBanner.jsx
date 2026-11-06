import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import { useAuth } from "../lib/auth.jsx";

// Shown on every page while trying the demo: says it's sample data, gives a
// tip for the current page, and opens a short guide to the whole app.

const PAGE_TIPS = {
  "/": "Fill in a customer order and press Submit Order — then find it on the Search page.",
  "/search": 'Try searching by phone "555", a name like "Alex", or switch to Order ID and type "CP".',
  "/invoice": "Tap the magnifying glass next to Receipt # to load an order (try 1001), then Print, Save as Image or Share.",
  "/pay": "Tap menu items or type an amount, then pay with the test card 4242 4242 4242 4242.",
  "/broadcast": "Write a specials message to see the preview. In the demo nothing is actually texted.",
  "/updates": "A changelog of features added to the app over time.",
};

const GUIDE_STEPS = [
  ["fa-utensils", "Take an order", "The home page is the order form: customer, phone, address, order type, cost, payment, deposit, due date and items."],
  ["fa-magnifying-glass", "Search orders", "Find any order by phone, name, address, date, month, year — or a card payment by its Order ID."],
  ["fa-file-invoice-dollar", "Make an invoice", "Every search result has Generate Invoice: a printable receipt with deposits and card payments taken off the balance."],
  ["fa-credit-card", "Take card payments", "Pay with Card charges a walk-up sale or an invoice balance, adds the card fee for credit cards and logs it."],
  ["fa-bullhorn", "Text customers", "Text weekend specials to customers who signed up, and see how many there are."],
  ["fa-droplet", "Pick a theme", "The top-right button switches between blue, green, red, black, white and gray."],
];

const SEEN_KEY = "pim-demo-guide-seen";

export function showDemoGuide() {
  const steps = GUIDE_STEPS.map(
    ([icon, title, body]) =>
      `<li style="display:flex;gap:12px;align-items:flex-start;margin:0 0 12px;text-align:left">
        <i class="fa-solid ${icon}" style="width:20px;margin-top:3px;color:#9db4ff"></i>
        <span><strong style="display:block;color:#fff">${title}</strong><span style="opacity:.8;font-size:14px">${body}</span></span>
      </li>`
  ).join("");
  return Swal.fire({
    title: "Welcome to the demo",
    html: `<p style="margin:0 0 16px;opacity:.85;font-size:15px">This is a working copy of the POS with made-up orders for a sample café. Click around and try everything — nothing is really saved, charged or texted.</p>
      <ul style="list-style:none;padding:0;margin:0">${steps}</ul>`,
    theme: "dark",
    confirmButtonText: "Start exploring",
    width: 560,
  });
}

export default function DemoBanner() {
  const { status, logout } = useAuth();
  const { pathname } = useLocation();

  // Open the guide the first time the demo starts.
  useEffect(() => {
    if (status !== "demo") return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage blocked: just show it.
    }
    if (!seen) showDemoGuide();
  }, [status]);

  if (status !== "demo") return null;
  const tip = PAGE_TIPS[pathname];

  return (
    <section className="no-print w-full max-w-3xl mt-12 mb-6 stagger-in" aria-label="Demo mode">
      <div className="glass-panel demo-banner-panel px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-widest uppercase bg-brand-cactus/90 text-black">Demo</span>
          <p className="text-brand-navydeep leading-snug">
            <span className="font-semibold">Sample data only — nothing real is saved, charged or texted.</span>
            {tip && <span className="block text-brand-navydeep/90 mt-0.5">{tip}</span>}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={showDemoGuide} className="btn-3d !px-3 !py-1.5 text-xs">
            <i className="fa-solid fa-circle-question"></i> How it works
          </button>
          <button type="button" onClick={logout} className="btn-3d !px-3 !py-1.5 text-xs">
            <i className="fa-solid fa-right-from-bracket"></i> Exit demo
          </button>
        </div>
      </div>
    </section>
  );
}
