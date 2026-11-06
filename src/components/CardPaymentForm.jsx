import { useRef, useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import Swal from "sweetalert2";
import { formatMoney } from "../lib/format.js";
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { apiErrorFrom, friendlyMessage } from "../lib/errors.js";

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
  blue: {
    base: { fontSize: "16px", color: "#FFFFFF", "::placeholder": { color: "rgba(255,255,255,0.45)" } },
    invalid: { color: "#fcd34d" },
  },
};
// Dark green and dark red use the same white-on-dark card text as blue.
CARD_ELEMENT_STYLE.green = CARD_ELEMENT_STYLE.blue;
CARD_ELEMENT_STYLE.red = CARD_ELEMENT_STYLE.blue;

// A problem with the card itself, with a message safe to show as-is.
class CardError extends Error {}

export default function CardPaymentForm({ baseAmountCents, invoiceId, email, description, note, theme, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  // Blocks a second charge from a double tap that lands before React
  // re-renders the disabled button.
  const submittingRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);

    try {
      const cardElement = elements.getElement(CardElement);
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: email ? { email } : undefined,
      });
      // Stripe.js card errors are written for the cardholder; shown as-is.
      if (pmError) throw new CardError(pmError.message);

      const res = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: paymentMethod.id, baseAmountCents, invoiceId, email, description, note }),
      });
      if (!res.ok) {
        reportIfLoggedOut(res);
        throw await apiErrorFrom(res);
      }
      const data = await res.json();

      let status = data.status;
      if (status === "requires_action") {
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret);
        if (confirmError) throw new CardError(confirmError.message);
        status = paymentIntent.status;
      }

      if (status !== "succeeded") {
        throw new CardError("Payment was not completed. Please try again.");
      }

      onPaid({
        id: data.id,
        funding: data.funding,
        cardBrand: data.cardBrand,
        cardLast4: data.cardLast4,
        baseAmountCents: data.baseAmountCents,
        surchargeCents: data.surchargeCents,
        totalCents: data.totalCents,
        receiptUrl: data.receiptUrl,
      });
    } catch (err) {
      console.error("Card payment failed:", err);
      const text = err instanceof CardError ? err.message : friendlyMessage(err, "The payment didn't go through.");
      Swal.fire({ title: "Payment failed", text, icon: "error", theme: "dark" });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="field-group">
        <span className="field-label" id="card-details-label">
          <i className="fa-solid fa-credit-card" aria-hidden="true"></i> Card details
        </span>
        <div className="input-3d !py-3">
          <CardElement
            key={theme}
            options={{ style: CARD_ELEMENT_STYLE[theme] || CARD_ELEMENT_STYLE.light }}
            onChange={(e) => setCardComplete(e.complete)}
          />
        </div>
      </div>

      <p className="text-xs text-brand-muted/90 leading-relaxed">
        <i className="fa-solid fa-circle-info text-brand-teal"></i> A Card Processing Fee of up to 3.0% applies to
        credit cards, as permitted by card network rules. Debit cards are never charged a fee.
      </p>

      <button type="submit" className="btn-3d justify-center disabled:opacity-60" disabled={!stripe || !cardComplete || submitting} aria-busy={submitting}>
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
