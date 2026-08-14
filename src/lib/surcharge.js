// Visa/Mastercard cap non-cash-discount card surcharges at 3%; Regulation II
// and the Durbin Amendment require debit (including debit-as-credit) and
// prepaid cards to be surcharge-free. Stripe's PaymentMethod.card.funding
// already comes from a BIN lookup, so no separate BIN API call is needed —
// this just applies the compliant rate to whatever funding type Stripe
// reports. Kept as a plain, framework-free module so both the browser
// bundle (live preview) and the Vercel function (authoritative charge) can
// import the exact same math.
export const CREDIT_SURCHARGE_RATE = 0.03;

export function calcSurcharge(baseAmountCents, funding) {
  const base = Math.max(0, Math.round(Number(baseAmountCents) || 0));
  const surchargeCents = funding === "credit" ? Math.round(base * CREDIT_SURCHARGE_RATE) : 0;
  return { surchargeCents, totalCents: base + surchargeCents };
}
