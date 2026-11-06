import { toNumber } from "./format.js";

// Money math shared by the Invoice and Pay pages, kept here so both show the
// same numbers and it can be unit-tested.

// What's still owed on an order: Cost minus a Deposit (when one was taken)
// minus earlier card payments' base Amount. The card processing fee was paid
// on top of each charge and never counts toward the order. Never negative.
export function invoiceBalance(order, cardPayments = []) {
  const cost = order ? toNumber(order.Cost) || 0 : 0;
  const depositRaw = order ? toNumber(order.Deposit) : NaN;
  const hasDeposit = !isNaN(depositRaw) && depositRaw > 0;
  const deposit = hasDeposit ? depositRaw : 0;
  const cardPaid = (cardPayments || []).reduce((sum, p) => sum + (toNumber(p.Amount) || 0), 0);
  const balanceDue = Math.max(roundCents(cost - deposit - cardPaid), 0);
  return { cost, deposit, hasDeposit, cardPaid: roundCents(cardPaid), balanceDue };
}

// Sum of a quick-pick cart, { [menuItemId]: qty }, priced from `menuItems`
// ({ [id]: { price } }). Items no longer on the menu are ignored.
export function cartTotal(cart, menuItems) {
  const total = Object.entries(cart || {}).reduce((sum, [id, qty]) => {
    const item = menuItems[id];
    return item ? sum + item.price * qty : sum;
  }, 0);
  return roundCents(total);
}

// Dollars → whole cents, the unit Stripe charges in.
export function toCents(dollars) {
  return Math.round((Number(dollars) || 0) * 100);
}

// Rounds to the cent so float noise (0.1 + 0.2) never shows up on screen.
function roundCents(dollars) {
  return Math.round(dollars * 100) / 100;
}
