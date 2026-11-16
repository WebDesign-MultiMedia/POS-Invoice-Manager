// Pay by QR (Event Sales): a Stripe checkout page the customer opens by
// scanning a QR code, then pays on their own phone with Apple Pay, Google
// Pay or a card. Server side: the qr-* actions in api/create-payment-intent.js.
// These calls go to Stripe, not the Google Sheet, so checking every few
// seconds doesn't use up the SheetDB request limit.
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { isDemo } from "../lib/demo.js";
import { apiErrorFrom } from "../lib/errors.js";

// The demo pretends the customer pays a few seconds after the QR shows.
const DEMO_PAY_MS = 7000;
const demoStarted = new Map(); // id → { at, cents }

async function post(body) {
  const res = await fetch("/api/create-payment-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}

// → { id, url, expiresAt }
export async function createQrPayment({ baseAmountCents, invoiceId, email, description, note }) {
  if (isDemo()) {
    const id = `cs_demo_${Date.now()}_${demoStarted.size + 1}_${Math.random().toString(36).slice(2, 8)}`;
    demoStarted.set(id, { at: Date.now(), cents: baseAmountCents });
    return { id, url: `https://example.com/demo-pay/${invoiceId}`, expiresAt: Date.now() + 30 * 60 * 1000 };
  }
  return post({ action: "qr-create", baseAmountCents, invoiceId, email, description, note });
}

function demoStatus(id, cancel) {
  const started = demoStarted.get(id);
  if (!started) return { status: "expired" };
  if (Date.now() - started.at < DEMO_PAY_MS) {
    if (cancel) demoStarted.delete(id);
    return { status: cancel ? "expired" : "open" };
  }
  return {
    status: "paid",
    id: `demo_${started.at}`,
    funding: "credit",
    cardBrand: "visa",
    cardLast4: "4242",
    wallet: "apple_pay",
    baseAmountCents: started.cents,
    surchargeCents: 0,
    totalCents: started.cents,
    receiptUrl: null,
  };
}

// → { status: "open" | "paid" | "expired", …card details when paid }
export async function checkQrPayment(id) {
  if (isDemo()) return demoStatus(id, false);
  return post({ action: "qr-status", id });
}

// Closes the page so it can't be paid any more. Answers "paid" (with the
// card details) if the customer had already paid, so the sale is kept.
export async function cancelQrPayment(id) {
  if (isDemo()) return demoStatus(id, true);
  return post({ action: "qr-cancel", id });
}

// A QR payment still waiting, kept so a reload or a closed tab can't lose
// a sale the customer paid for. Per device; null when there's none. The
// demo keeps its own, so a demo QR is never checked with Stripe.
const pendingKey = () => (isDemo() ? "pim-demo-qr-pending" : "pim-qr-pending");

export function savePendingQr(pending) {
  try {
    if (pending) localStorage.setItem(pendingKey(), JSON.stringify(pending));
    else localStorage.removeItem(pendingKey());
  } catch {
    // Private mode: nothing to keep it in.
  }
}

export function readPendingQr() {
  try {
    const p = JSON.parse(localStorage.getItem(pendingKey()) || "null");
    return p && typeof p.id === "string" && p.ctx?.base ? p : null;
  } catch {
    return null;
  }
}
