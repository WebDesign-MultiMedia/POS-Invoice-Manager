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

  const { paymentMethodId, baseAmountCents, invoiceId, email, description } = req.body || {};

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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      payment_method: paymentMethodId,
      payment_method_types: ["card"],
      confirm: true,
      receipt_email: email || undefined,
      description: description || undefined,
      metadata: {
        card_funding: funding || "unknown",
        invoice_no: invoiceId || "",
        base_amount_cents: String(baseAmountCents),
        surcharge_cents: String(surchargeCents),
        card_processing_fee: `$${(surchargeCents / 100).toFixed(2)}`,
        fee_percentage: funding === "credit" ? "3.0%" : "0.0%",
      },
    });

    return res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
      funding: funding || "unknown",
      baseAmountCents,
      surchargeCents,
      totalCents,
    });
  } catch (err) {
    console.error("create-payment-intent error:", err);
    return res.status(500).json({ error: err.message || "Payment failed" });
  }
}
