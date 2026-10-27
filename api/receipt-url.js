import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Vercel serverless function: GET ?pi=pi_... → 302 redirect to the receipt
// (a plain <a target="_blank"> link points here, so no popup juggling).
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

  const pi = new URL(req.url, "http://localhost").searchParams.get("pi") || "";
  if (!/^pi_[A-Za-z0-9]+$/.test(pi)) {
    return sendError(res, 400, "Invalid payment id.");
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
    const receiptUrl = paymentIntent.latest_charge?.receipt_url;
    if (!receiptUrl?.startsWith("https://pay.stripe.com/receipts/")) {
      return sendError(res, 404, "No receipt is available for this payment yet.");
    }
    res.statusCode = 302;
    res.setHeader("Location", receiptUrl);
    res.setHeader("Cache-Control", "no-store");
    return res.end();
  } catch (err) {
    console.error("receipt-url error:", err);
    return sendError(res, 404, "Payment not found.");
  }
}

// The link opens in a browser tab, so errors are a readable page, not JSON.
function sendError(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Receipt</title><p style="font-family:system-ui;padding:2rem">${message} Check the payment in the Stripe dashboard.</p>`);
}
