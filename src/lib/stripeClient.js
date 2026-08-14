import { loadStripe } from "@stripe/stripe-js";

// Loaded once and reused for every <Elements> mount, per Stripe.js guidance.
let stripePromise;

export function getStripe() {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.warn("VITE_STRIPE_PUBLISHABLE_KEY is not set — card payments are disabled.");
    }
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}
