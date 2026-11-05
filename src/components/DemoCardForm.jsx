import { useState } from "react";
import { calcSurcharge } from "../lib/surcharge.js";
import { formatMoney } from "../lib/format.js";

// Stand-in for CardPaymentForm in demo mode: same look and the same fee
// math, but nothing leaves the browser — no Stripe, no charge. Accepts
// Stripe's public test numbers, so the flow feels real:
//   4242 4242 4242 4242 → Visa credit (card fee added)
//   4000 0566 5566 5556 → Visa debit (no fee)
const TEST_CARDS = [
  { number: "4242 4242 4242 4242", label: "Credit", funding: "credit" },
  { number: "4000 0566 5566 5556", label: "Debit", funding: "debit" },
];

const digitsOf = (v) => v.replace(/\D/g, "");

function luhnOk(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

function brandOf(digits) {
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6/.test(digits)) return "discover";
  return "card";
}

export default function DemoCardForm({ baseAmountCents, onPaid }) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const digits = digitsOf(number);
  const complete = luhnOk(digits) && /^\d{2}\s*\/\s*\d{2}$/.test(expiry) && /^\d{3,4}$/.test(cvc);

  const fillTestCard = (card) => {
    setNumber(card.number);
    setExpiry("12 / 34");
    setCvc("123");
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!complete) {
      setError("Use one of the test cards below.");
      return;
    }
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const funding = TEST_CARDS.find((c) => digitsOf(c.number) === digits)?.funding || "credit";
    const { surchargeCents, totalCents } = calcSurcharge(baseAmountCents, funding);
    setSubmitting(false);
    onPaid({
      id: `demo_${Date.now()}`,
      funding,
      cardBrand: brandOf(digits),
      cardLast4: digits.slice(-4),
      baseAmountCents,
      surchargeCents,
      totalCents,
      receiptUrl: null,
    });
  };

  const preview = calcSurcharge(baseAmountCents, "credit");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="field-group">
        <span className="field-label">
          <i className="fa-solid fa-credit-card"></i> Card details (demo)
        </span>
        <input
          className="input-3d tracking-wider"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Card number"
          aria-label="Card number"
          value={number}
          maxLength={23}
          onChange={(e) => {
            setNumber(digitsOf(e.target.value).replace(/(\d{4})(?=\d)/g, "$1 "));
            setError("");
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className="input-3d"
            inputMode="numeric"
            autoComplete="off"
            placeholder="MM / YY"
            aria-label="Expiry date"
            value={expiry}
            maxLength={7}
            onChange={(e) => {
              const d = digitsOf(e.target.value).slice(0, 4);
              setExpiry(d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d);
            }}
          />
          <input
            className="input-3d"
            inputMode="numeric"
            autoComplete="off"
            placeholder="CVC"
            aria-label="CVC"
            value={cvc}
            maxLength={4}
            onChange={(e) => setCvc(digitsOf(e.target.value).slice(0, 4))}
          />
        </div>
      </div>

      <div className="glass-panel p-3 text-xs leading-relaxed">
        <p className="font-semibold mb-1.5">
          <i className="fa-solid fa-flask"></i> Test cards — tap one to fill it in
        </p>
        <div className="flex flex-wrap gap-2">
          {TEST_CARDS.map((card) => (
            <button key={card.number} type="button" onClick={() => fillTestCard(card)} className="btn-3d !px-3 !py-1.5 text-xs">
              {card.label} · {card.number.slice(-4)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-brand-navydeep/70">No real card is charged. Credit adds the card fee ({formatMoney(preview.surchargeCents / 100)} here); debit doesn't.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-brand-error">
          <i className="fa-solid fa-circle-exclamation"></i> {error}
        </p>
      )}

      <button type="submit" className="btn-3d justify-center" disabled={submitting}>
        {submitting ? (
          <>
            <i className="fa-solid fa-spinner fa-spin"></i> Processing…
          </>
        ) : (
          <>
            <i className="fa-solid fa-lock"></i> Pay (demo)
          </>
        )}
      </button>
    </form>
  );
}
