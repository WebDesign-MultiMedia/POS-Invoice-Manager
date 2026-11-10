import Stripe from "stripe";
import { readSessionInfo } from "./_lib/auth.js";
import { canAny } from "./_lib/permissions.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Vercel serverless function: GET ?pi=pi_... → 302 redirect to the receipt
// (a plain <a target="_blank"> link points here, so no popup juggling).
// GET ?pi=pi_...&format=json → { receiptUrl } instead, for the Text receipt
// screen, which puts the link in a text message.
// Looks up the Stripe-hosted receipt for a logged card payment, so the
// Search page can open receipts for every CardPayments row (including ones
// logged before receipt links were saved) without storing URLs in the sheet.
// PaymentIntent ids are unguessable, and the receipt page itself only shows
// brand + last 4, so this exposes nothing a receipt holder can't already see.
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Receipts show customer contact details, so logged-in only, with a
  // section that shows card payments.
  const params = new URL(req.url, "http://localhost").searchParams;
  const json = params.get("format") === "json";
  const fail = (status, message) => (json ? res.status(status).json({ error: message }) : sendError(res, status, message));
  const session = await readSessionInfo(req);
  if (session && !canAny(session, ["pay", "search", "event"])) return fail(403, "You don't have access to receipts.");
  if (!session) return fail(401, "Please log in to the POS Invoice Manager first.");

  const pi = params.get("pi") || "";
  if (!/^pi_[A-Za-z0-9]+$/.test(pi)) {
    return fail(400, "Invalid payment id.");
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
    const receiptUrl = paymentIntent.latest_charge?.receipt_url;
    if (!receiptUrl?.startsWith("https://pay.stripe.com/receipts/")) {
      return fail(404, "No receipt is available for this payment yet.");
    }
    if (json) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ receiptUrl });
    }
    res.statusCode = 302;
    res.setHeader("Location", receiptUrl);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  } catch (err) {
    console.error("receipt-url error:", err);
    return fail(404, "Payment not found.");
  }
}

// The link opens in a browser tab, so errors are a readable page, not JSON.
function sendError(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Receipt</title><p style="font-family:system-ui;padding:2rem">${message} Check the payment in the Stripe dashboard.</p>`);
}
