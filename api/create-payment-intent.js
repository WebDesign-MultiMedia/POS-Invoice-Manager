import Stripe from "stripe";
import { calcSurcharge } from "../src/lib/surcharge.js";
import { requireAccess } from "./_lib/auth.js";
import { can } from "./_lib/permissions.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Sanity ceiling on one charge ($25,000), well above any real catering
// order. The amount is typed by staff, so this catches a slipped decimal or
// an extra zero before it reaches a customer's card.
export const MAX_CHARGE_CENTS = 2_500_000;

// Card problems (declined, expired, wrong CVC…) come back from Stripe with a
// message written for the cardholder, so staff see it as-is. Anything else
// (bad API key, network trouble, a Stripe bug) gets a generic message; the
// details go to the server log only.
function publicError(err) {
  if (err?.type === "StripeCardError") return { status: 402, error: err.message || "The card was declined." };
  return { status: 500, error: "The payment couldn't be processed. No charge was made. Please try again." };
}

// Vercel serverless function: POST { paymentMethodId, baseAmountCents, invoiceId, email }
// Runs server-side only (STRIPE_SECRET_KEY never reaches the browser) and is
// the sole place the surcharge is actually applied — the client-side number
// shown before this call is a preview, not the charge.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Logged-in only, with Pay with Card or Event Sales: an open charge
  // endpoint lets fraudsters test stolen cards.
  const session = await requireAccess(req, res, ["pay", "event"]);
  if (!session) return;

  // Pay by QR (Event Sales): the customer pays on their own phone.
  const action = req.body?.action;
  if (action === "qr-create") return qrCreate(req, res);
  if (action === "qr-status" || action === "qr-cancel") return qrCheck(req, res, action === "qr-cancel");

  const { paymentMethodId, baseAmountCents, invoiceId, email, description, note } = req.body || {};

  // With only Event Sales, card payments must be for an event sale (EV-…).
  if (!can(session, "pay") && !/^EV-\d{6}-\d{6}$/.test(String(invoiceId || ""))) {
    return res.status(403).json({ error: "You can only take card payments for event sales." });
  }

  if (typeof paymentMethodId !== "string" || !Number.isInteger(baseAmountCents) || baseAmountCents <= 0) {
    return res.status(400).json({ error: "Missing or invalid payment details" });
  }
  if (baseAmountCents > MAX_CHARGE_CENTS) {
    return res.status(400).json({ error: `Amounts over $${(MAX_CHARGE_CENTS / 100).toLocaleString("en-US")} can't be charged here. Check the amount.` });
  }

  try {
    // Authoritative card-funding lookup — a client could claim "debit" to
    // dodge the surcharge, so the funding type is re-read from Stripe here,
    // never trusted from the request body.
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const funding = paymentMethod.card?.funding; // "credit" | "debit" | "prepaid" | "unknown"

    const { surchargeCents, totalCents } = calcSurcharge(baseAmountCents, funding);

    // The fee is only known here, after the funding lookup, so its receipt
    // line is added server-side. Card rules require the surcharge to be
    // itemized on the customer's receipt. Order: items, fee, then the note,
    // set apart by a blank line (Stripe's receipt keeps it).
    const feeLine =
      surchargeCents > 0
        ? `Card Processing Fee (${((surchargeCents / baseAmountCents) * 100).toFixed(1)}%) — $${(surchargeCents / 100).toFixed(2)}`
        : "";
    const noteLine = typeof note === "string" && note.trim() ? `Note: ${note.trim()}` : "";
    const receiptDescription = [[description, feeLine].filter(Boolean).join("\n"), noteLine].filter(Boolean).join("\n\n");

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      payment_method: paymentMethodId,
      payment_method_types: ["card"],
      confirm: true,
      receipt_email: email || undefined,
      description: receiptDescription || undefined,
      // Expanded so the receipt link can be handed back for texting.
      expand: ["latest_charge"],
      metadata: {
        card_funding: funding || "unknown",
        invoice_no: invoiceId || "",
        base_amount_cents: String(baseAmountCents),
        surcharge_cents: String(surchargeCents),
        card_processing_fee: `$${(surchargeCents / 100).toFixed(2)}`,
        fee_percentage: surchargeCents > 0 ? `${((surchargeCents / baseAmountCents) * 100).toFixed(1)}%` : "0.0%",
        fee_calculation_method: surchargeCents > 0 ? "dynamic_pass_through_capped_3pct" : "exempt",
      },
    });

    return res.status(200).json({
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
      funding: funding || "unknown",
      // Brand + last 4 only — the full card number never reaches this app.
      cardBrand: paymentMethod.card?.brand || "",
      cardLast4: paymentMethod.card?.last4 || "",
      baseAmountCents,
      surchargeCents,
      totalCents,
      // Stripe-hosted, unguessable URL; null if the charge needed 3D Secure
      // (no charge exists yet at this point in that flow).
      receiptUrl: paymentIntent.latest_charge?.receipt_url || null,
    });
  } catch (err) {
    console.error("create-payment-intent error:", err?.type, err?.code, err?.message);
    const { status, error } = publicError(err);
    return res.status(status).json({ error });
  }
}

// ── Pay by QR ────────────────────────────────────────────────────────────
// Event Sales shows a QR code for a Stripe-hosted checkout page; the
// customer scans it with their phone camera and pays there with Apple Pay,
// Google Pay or a card. The register asks for its status every few seconds
// and records the sale once it's paid.
// No card fee here: Stripe's page shows the price before the customer picks
// a card, so a fee that depends on credit vs debit can't be added.
const QR_SOURCE = "event_qr";
const EVENT_SALE_ID = /^EV-\d{6}-\d{6}$/;
const CHECKOUT_ID = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
// Just over Stripe's shortest allowed life for a checkout page (30 min).
const QR_LIFETIME_S = 30 * 60 + 30;
const QR_EXPAND = ["payment_intent.latest_charge"];

function siteOrigin(req) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "");
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const proto = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}

async function qrCreate(req, res) {
  const { baseAmountCents, invoiceId, email, description, note } = req.body || {};
  if (!EVENT_SALE_ID.test(String(invoiceId || ""))) return res.status(400).json({ error: "Pay by QR is only for event sales." });
  if (!Number.isInteger(baseAmountCents) || baseAmountCents < 50) {
    return res.status(400).json({ error: "Pay by QR needs an amount of at least $0.50." });
  }
  if (baseAmountCents > MAX_CHARGE_CENTS) {
    return res.status(400).json({ error: `Amounts over $${(MAX_CHARGE_CENTS / 100).toLocaleString("en-US")} can't be charged here. Check the amount.` });
  }
  const noteLine = typeof note === "string" && note.trim() ? `Note: ${note.trim()}` : "";
  const receiptDescription = [typeof description === "string" ? description.trim() : "", noteLine].filter(Boolean).join("\n\n");
  const origin = siteOrigin(req);
  const mail = typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? email.trim() : undefined;
  const metadata = {
    source: QR_SOURCE,
    invoice_no: invoiceId,
    base_amount_cents: String(baseAmountCents),
    surcharge_cents: "0",
    card_processing_fee: "$0.00",
    fee_percentage: "0.0%",
    fee_calculation_method: "exempt_qr_checkout",
  };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: { currency: "usd", unit_amount: baseAmountCents, product_data: { name: `Order ${invoiceId}` } },
        },
      ],
      customer_email: mail,
      expires_at: Math.floor(Date.now() / 1000) + QR_LIFETIME_S,
      // A plain thank-you page; the customer isn't logged in to the app.
      success_url: origin ? `${origin}/paid.html` : undefined,
      metadata,
      payment_intent_data: {
        description: receiptDescription.slice(0, 1000) || undefined,
        receipt_email: mail,
        metadata,
      },
    });
    return res.status(200).json({ id: session.id, url: session.url, expiresAt: session.expires_at * 1000 });
  } catch (err) {
    console.error("qr-create error:", err?.type, err?.code, err?.message);
    return res.status(500).json({ error: "The QR code couldn't be made. Try again, or take the card another way." });
  }
}

// qr-status → { status: "open" | "paid" | "expired", …card details when paid }.
// qr-cancel closes the page so it can't be paid any more; if the customer
// had already paid, it answers "paid" like qr-status, so the sale is kept.
async function qrCheck(req, res, cancel) {
  const id = String(req.body?.id || "");
  if (!CHECKOUT_ID.test(id)) return res.status(400).json({ error: "Unknown QR payment." });
  try {
    let session = await stripe.checkout.sessions.retrieve(id, { expand: QR_EXPAND });
    if (session.metadata?.source !== QR_SOURCE) return res.status(404).json({ error: "Unknown QR payment." });
    if (cancel && session.status === "open") {
      try {
        await stripe.checkout.sessions.expire(id);
        return res.status(200).json({ status: "expired" });
      } catch (err) {
        // Paid in that same moment: read it again and report that instead.
        console.warn("qr-cancel expire failed:", err?.code, err?.message);
        session = await stripe.checkout.sessions.retrieve(id, { expand: QR_EXPAND });
      }
    }
    if (session.payment_status !== "paid") return res.status(200).json({ status: session.status === "open" ? "open" : "expired" });
    const intent = session.payment_intent;
    const charge = intent?.latest_charge;
    const card = charge?.payment_method_details?.card || {};
    return res.status(200).json({
      status: "paid",
      id: intent?.id || "",
      invoiceId: session.metadata?.invoice_no || "",
      funding: card.funding || "unknown",
      cardBrand: card.brand || "",
      cardLast4: card.last4 || "",
      // "apple_pay", "google_pay", "link"…, or "" for a typed card.
      wallet: card.wallet?.type || "",
      baseAmountCents: Number(session.metadata?.base_amount_cents) || session.amount_total || 0,
      surchargeCents: 0,
      totalCents: session.amount_total || 0,
      receiptUrl: charge?.receipt_url || null,
    });
  } catch (err) {
    console.error("qr-status error:", err?.type, err?.code, err?.message);
    if (err?.code === "resource_missing") return res.status(404).json({ error: "Unknown QR payment." });
    return res.status(500).json({ error: "Couldn't check the QR payment." });
  }
}
