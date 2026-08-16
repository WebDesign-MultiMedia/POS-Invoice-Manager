// Visa/Mastercard cap non-cash-discount card surcharges at 3%; Regulation II
// and the Durbin Amendment require debit (including debit-as-credit) and
// prepaid cards to be surcharge-free. Stripe's PaymentMethod.card.funding
// already comes from a BIN lookup, so no separate BIN API call is needed —
// this just applies the compliant rate to whatever funding type Stripe
// reports. Kept as a plain, framework-free module so both the browser
// bundle (live preview) and the Vercel function (authoritative charge) can
// import the exact same math.
export const CREDIT_SURCHARGE_CAP_RATE = 0.03;

// Stripe's standard US rate for online/manually-keyed cards.
const STRIPE_PERCENT_RATE = 0.029;
const STRIPE_FLAT_CENTS = 30;

export function calcSurcharge(baseAmountCents, funding) {
  const base = Math.max(0, Math.round(Number(baseAmountCents) || 0));
  if (funding !== "credit" || base <= 0) {
    return { surchargeCents: 0, totalCents: base };
  }

  // Dynamic pass-through: the fee that, after Stripe's own cut, nets exactly
  // `base` back to the merchant. But covering Stripe's true cost isn't a
  // valid reason to exceed the network's 3% cap — on small tickets the
  // pass-through amount alone (dominated by Stripe's flat $0.30) blows past
  // 3%, so it's clamped to whichever is lower.
  const passThroughGrandTotal = (base + STRIPE_FLAT_CENTS) / (1 - STRIPE_PERCENT_RATE);
  const passThroughFeeCents = passThroughGrandTotal - base;
  const cappedFeeCents = base * CREDIT_SURCHARGE_CAP_RATE;
  const surchargeCents = Math.round(Math.min(passThroughFeeCents, cappedFeeCents));

  return { surchargeCents, totalCents: base + surchargeCents };
}
