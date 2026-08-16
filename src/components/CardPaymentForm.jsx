import { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import Swal from "sweetalert2";
import { formatMoney } from "../lib/format.js";

// Stripe Elements render in a sandboxed iframe that can't see this app's
// CSS variables, so its text colors are hardcoded per theme instead of
// pulling from the brand tokens like everything else in index.css.
const CARD_ELEMENT_STYLE = {
  light: {
    base: { fontSize: "16px", color: "#1F2937", "::placeholder": { color: "#9CA3AF" } },
    invalid: { color: "#e23744" },
  },
  dark: {
    base: { fontSize: "16px", color: "#F1F5F9", "::placeholder": { color: "#64748B" } },
    invalid: { color: "#f87171" },
  },
};

export default function CardPaymentForm({ baseAmountCents, invoiceId, email, description, theme, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);

    try {
      const cardElement = elements.getElement(CardElement);
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: email ? { email } : undefined,
      });
      if (pmError) throw new Error(pmError.message);

      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: paymentMethod.id, baseAmountCents, invoiceId, email, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");

      let status = data.status;
      if (status === "requires_action") {
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmError) throw new Error(confirmError.message);
        status = paymentIntent.status;
      }

      if (status !== "succeeded") {
        throw new Error("Payment was not completed. Please try again.");
      }

      onPaid({
        id: data.id,
        funding: data.funding,
        baseAmountCents: data.baseAmountCents,
        surchargeCents: data.surchargeCents,
        totalCents: data.totalCents,
      });
    } catch (err) {
      Swal.fire({ title: "Payment failed", text: err.message, icon: "error", theme: "dark" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="field-group">
        <span className="field-label">
          <i className="fa-solid fa-credit-card"></i> Card details
        </span>
        <div className="input-3d !py-3">
          <CardElement
            key={theme}
            options={{ style: CARD_ELEMENT_STYLE[theme] || CARD_ELEMENT_STYLE.light }}
            onChange={(e) => setCardComplete(e.complete)}
          />
        </div>
      </div>

      <p className="text-xs text-brand-muted/80 leading-relaxed">
        <i className="fa-solid fa-circle-info text-brand-teal"></i> A Card Processing Fee of up to 3.0% applies to
        credit cards, as permitted by card network rules. Debit cards are never charged a fee.
      </p>

      <button type="submit" className="btn-3d justify-center" disabled={!stripe || !cardComplete || submitting}>
        {submitting ? (
          <>
            <i className="fa-solid fa-spinner fa-spin"></i> Processing…
          </>
        ) : (
          <>
            <i className="fa-solid fa-lock"></i> Pay {formatMoney(baseAmountCents / 100)}
          </>
        )}
      </button>
    </form>
  );
}
