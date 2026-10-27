import Stripe from "stripe";
import { calcSurcharge } from "../src/lib/surcharge.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Vercel serverless function: POST { paymentMethodId, baseAmountCents, invoiceId, email }
// Runs server-side only (STRIPE_SECRET_KEY never reaches the browser) and is
// the sole place the surcharge is actually applied — the client-side number
// shown before this call is a preview, not the charge.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { paymentMethodId, baseAmountCents, invoiceId, email, description, note } = req.body || {};

  if (!paymentMethodId || !Number.isFinite(baseAmountCents) || baseAmountCents <= 0) {
    return res.status(400).json({ error: "Missing or invalid payment details" });
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
    console.error("create-payment-intent error:", err);
    return res.status(500).json({ error: err.message || "Payment failed" });
  }
}
