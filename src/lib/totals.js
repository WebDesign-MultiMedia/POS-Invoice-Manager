import { toNumber } from "./format.js";
import { DEALS } from "./menu.js";

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

// Mix-and-match deals applied to a cart: for each deal key, how many full
// sets were bought and how much they save. The priciest units go into the
// sets first, so the customer always gets the better price.
//   → [{ key, label, sets, savings }]  (only deals that apply)
export function cartDeals(cart, menuItems, deals = DEALS) {
  const units = {};
  for (const [id, qty] of Object.entries(cart || {})) {
    const item = menuItems[id];
    if (!item?.deal || !deals[item.deal] || item.unit === "lb") continue;
    for (let i = 0; i < Math.floor(qty); i++) (units[item.deal] ||= []).push(item.price);
  }
  return Object.entries(units)
    .map(([key, prices]) => {
      const deal = deals[key];
      const sets = Math.floor(prices.length / deal.qty);
      const regular = prices
        .sort((a, b) => b - a)
        .slice(0, sets * deal.qty)
        .reduce((sum, p) => sum + p, 0);
      return { key, label: deal.label, sets, savings: roundCents(Math.max(regular - sets * deal.price, 0)) };
    })
    .filter((d) => d.sets > 0 && d.savings > 0);
}

// Sum of a quick-pick cart, { [menuItemId]: qty }, priced from `menuItems`
// ({ [id]: { price } }) with any deals taken off. Items no longer on the
// menu are ignored.
export function cartTotal(cart, menuItems, deals = DEALS) {
  const total = Object.entries(cart || {}).reduce((sum, [id, qty]) => {
    const item = menuItems[id];
    return item ? sum + item.price * qty : sum;
  }, 0);
  const savings = cartDeals(cart, menuItems, deals).reduce((sum, d) => sum + d.savings, 0);
  return roundCents(total - savings);
}

// Dollars → whole cents, the unit Stripe charges in.
export function toCents(dollars) {
  return Math.round((Number(dollars) || 0) * 100);
}

// Rounds to the cent so float noise (0.1 + 0.2) never shows up on screen.
function roundCents(dollars) {
  return Math.round(dollars * 100) / 100;
}
