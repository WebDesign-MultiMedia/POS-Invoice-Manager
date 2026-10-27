import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Elements } from "@stripe/react-stripe-js";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import CardPaymentForm from "../components/CardPaymentForm.jsx";
import { getInvoiceById, getCardPaymentsForInvoice, recordCardPayment } from "../api/sheetdb.js";
import { toNumber, formatMoney, formatCardLabel, getCurrentDateTime } from "../lib/format.js";
import { getStripe } from "../lib/stripeClient.js";
import { getTheme } from "../lib/theme.js";
import { MENU, MENU_ITEMS, qtyStep, formatCartLine } from "../lib/menu.js";

// Two entry points into the same card-payment flow:
//  - "amount": staff types a dollar figure on the spot (pop-up/street
//    vending — there's no invoice for a walk-up sale).
//  - "invoice": pulls up an existing order's balance due, for customers who
//    already have a receipt number.
// Landing here via a share/invoice link (?id=...) jumps straight to the
// invoice tab pre-loaded; otherwise "amount" is the default since that's
// the more common vending-table case.
// Walk-up charges have no order row, so they get their own order number.
// The "CP-" prefix keeps them out of the plain-numeric order Id sequence
// that the Pay Invoice lookup searches. Format: CP-YYMMDD-HHMMSS.
function newCardPaymentId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `CP-${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Normalizes US numbers to 347-555-0100 so the sheet stays consistent no
// matter how it was typed; anything else (e.g. international) is kept as-is.
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  return raw.trim();
}

export default function PayPage() {
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("id");

  const [mode, setMode] = useState(preselectedId ? "invoice" : "amount");

  const [invoice, setInvoice] = useState(null);
  // Sum of earlier card payments' base Amount on this invoice.
  const [invoiceCardPaid, setInvoiceCardPaid] = useState(0);
  const [lookupValue, setLookupValue] = useState(preselectedId || "");
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const [amountInput, setAmountInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  // { [menuItemId]: qty } — tapped items from the quick-pick menu.
  const [cart, setCart] = useState({});
  const [cardPaymentId, setCardPaymentId] = useState(newCardPaymentId);

  const [email, setEmail] = useState("");
  // Prefills the sms: link and is logged to the CardPayments sheet; never
  // sent to the payment server or Stripe.
  const [phone, setPhone] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [theme, setTheme] = useState(getTheme());

  const loadInvoice = async (id) => {
    const value = id.trim();
    if (!value) return;
    setLoadingInvoice(true);
    try {
      const row = await getInvoiceById(value);
      if (!row) {
        Swal.fire({ title: "Invoice not found", text: `No invoice matches #${value}`, icon: "warning", theme: "dark", timer: 2000, showConfirmButton: false });
        return;
      }
      // Fetched before the invoice is shown so the charge can never be the
      // full balance while earlier card payments are still loading. If this
      // fails, the catch below blocks the charge rather than risk a double one.
      const payments = await getCardPaymentsForInvoice(row.Id);
      setInvoiceCardPaid(payments.reduce((sum, p) => sum + (toNumber(p.Amount) || 0), 0));
      setInvoice(row);
      setReceipt(null);
    } catch (err) {
      Swal.fire({ title: "Couldn't load invoice", text: err.message, icon: "error", theme: "dark" });
    } finally {
      setLoadingInvoice(false);
    }
  };

  useEffect(() => {
    if (preselectedId) loadInvoice(preselectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedId]);

  // ThemeToggle flips the `dark` class straight on <html> (see lib/theme.js),
  // not through React state, so this page has to watch for it directly to
  // keep the Stripe Element's hardcoded colors in sync if it's toggled here.
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const switchMode = (next) => {
    setMode(next);
    setReceipt(null);
  };

  const cost = invoice ? toNumber(invoice.Cost) || 0 : 0;
  const deposit = invoice ? toNumber(invoice.Deposit) : NaN;
  const hasDeposit = !isNaN(deposit) && deposit > 0;
  const invoiceTotalDue = invoice ? Math.max(cost - (hasDeposit ? deposit : 0) - invoiceCardPaid, 0) : 0;

  const changeQty = (id, delta) => {
    setCart((prev) => {
      const qty = Math.max(0, (prev[id] || 0) + delta);
      const next = { ...prev };
      if (qty > 0) next[id] = qty;
      else delete next[id];
      return next;
    });
  };

  // Once anything is picked from the menu, the cart drives the charge amount
  // and the item list is prepended to the note so it lands in Stripe's
  // description and the CardPayments sheet.
  const cartEntries = Object.entries(cart).map(([id, qty]) => ({ item: MENU_ITEMS[id], qty }));
  const hasCart = cartEntries.length > 0;
  const cartTotal = cartEntries.reduce((sum, { item, qty }) => sum + item.price * qty, 0);
  // Sheet "Items" column: one priced line per item so later lookups
  // (Search → Order ID) show what was actually charged even after menu
  // prices change. Parsed by parseCardPaymentOrder() in lib/menu.js — keep
  // the two in sync. The typed note goes in its own "Note" column.
  const itemsForSheet = cartEntries.map(({ item, qty }) => `${formatCartLine(item, qty)} (${formatMoney(item.price * qty)})`).join("\n");
  // Stripe's receipt keeps line breaks (and blank lines) in the description,
  // so the receipt gets the Order ID set apart on top, then one priced line
  // per item. The trailing "\n" leaves a blank line before the fee line the
  // server appends when there are no items.
  const receiptItemLines = cartEntries.map(({ item, qty }) => `${formatCartLine(item, qty)} — ${formatMoney(item.price * qty)}`).join("\n");
  const receiptDescription = `Order ID: ${cardPaymentId}\n${receiptItemLines ? `\n${receiptItemLines}` : ""}`;

  const customAmount = hasCart ? cartTotal : toNumber(amountInput) || 0;
  const totalDue = mode === "invoice" ? invoiceTotalDue : customAmount;
  const baseAmountCents = Math.round(totalDue * 100);
  const readyToCharge = mode === "invoice" ? !!invoice && invoiceTotalDue > 0 : customAmount > 0;
  const payLabel = mode === "invoice" ? invoice?.Name || "" : customerName;
  const payInvoiceId = mode === "invoice" ? invoice?.Id : cardPaymentId;

  // Logs every completed charge to the "CardPayments" sheet tab before
  // showing the receipt. Sheet logging is best-effort: a failure here must
  // never block the customer from seeing their (already successful) receipt.
  const handlePaid = async (result) => {
    const { date, time } = getCurrentDateTime();
    try {
      await recordCardPayment({
        Date: date,
        Time: time,
        Amount: (result.baseAmountCents / 100).toFixed(2),
        Fee: (result.surchargeCents / 100).toFixed(2),
        Total: (result.totalCents / 100).toFixed(2),
        Funding: result.funding,
        Card: formatCardLabel(result.cardBrand, result.cardLast4),
        PaymentIntentId: result.id || "",
        Name: mode === "invoice" ? invoice?.Name || "" : customerName,
        Email: email,
        Phone: formatPhone(phone),
        InvoiceId: payInvoiceId || "",
        Items: mode === "amount" ? itemsForSheet : "",
        Note: mode === "amount" ? note.trim() : "",
      });
    } catch (err) {
      console.error("recordCardPayment failed:", err.message);
    }
    setReceipt(result);
  };

  // Copies the Stripe receipt link (fallback for desktops where sms: does
  // nothing) and opens Messages prefilled; staff still has to press Send.
  // "?&body=" is the form both iOS and Android accept.
  const textReceipt = async () => {
    const orderId = payInvoiceId ? ` (Order ID: ${payInvoiceId})` : "";
    const message = `Thank you from Buffet Lucia Fiesta Mexicana! Here is your receipt${orderId}: ${receipt.receiptUrl}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(message);
      copied = true;
    } catch {
      // Clipboard can be blocked; the prefilled message still has the link.
    }
    // Laptops may have no texting app for sms: (e.g. Windows), so they get
    // told the message is on the clipboard. Phones jump straight to Messages.
    if (copied && !window.matchMedia("(pointer: coarse)").matches) {
      Swal.fire({
        title: "Receipt message copied",
        text: "If Messages doesn't open, paste it into your texting app.",
        icon: "success",
        theme: "dark",
        timer: 2500,
        showConfirmButton: false,
      });
    }
    const number = phone.replace(/[^\d+]/g, "");
    window.location.href = `sms:${number}?&body=${encodeURIComponent(message)}`;
  };

  return (
    <Layout blobs={["bg-brand-teal w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-gold w-80 h-80 top-1/2 -left-16 animate-float"]}>
      <NavRow className="mb-6">
        <NavFab to="/" title="Order form" icon="fa-house" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
        <NavFab to="/search" title="Search orders" icon="fa-magnifying-glass" colorClass="text-brand-teal" glowClass="shadow-glow-teal" />
        <NavFab to="/invoice" title="View invoice" icon="fa-file-invoice-dollar" colorClass="text-brand-terracotta" glowClass="shadow-glow-terracotta" />
      </NavRow>

      <PageHeader title="Pay with Card" subtitle="Buffet Lucia Fiesta Mexicana" />

      <div className="w-full max-w-md glass-card p-6 sm:p-8 stagger-in">
        <div className="h-1.5 w-full rounded-full overflow-hidden flex mb-6">
          <span className="flex-1 bg-[#006837]"></span>
          <span className="flex-1 bg-white"></span>
          <span className="flex-1 bg-[#CE1126]"></span>
        </div>

        {!receipt && (
          <div className="flex glass-panel p-1 mb-6 text-sm font-semibold">
            <button
              className={`flex-1 py-2 rounded-xl transition-colors ${mode === "amount" ? "bg-brand-gold text-white" : "text-brand-navydeep/70"}`}
              onClick={() => switchMode("amount")}
            >
              Charge Amount
            </button>
            <button
              className={`flex-1 py-2 rounded-xl transition-colors ${mode === "invoice" ? "bg-brand-gold text-white" : "text-brand-navydeep/70"}`}
              onClick={() => switchMode("invoice")}
            >
              Pay Invoice
            </button>
          </div>
        )}

        {!receipt && mode === "amount" && (
          <div className="flex flex-col gap-4">
            <div className="field-group">
              <span className="field-label">
                <i className="fa-solid fa-utensils"></i> Order items (tap to add)
              </span>
              <div className="flex flex-col gap-3">
                {MENU.map((group) => (
                  <div key={group.category}>
                    <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold mb-1.5">{group.category}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((item) => {
                        const qty = cart[item.id] || 0;
                        return (
                          <div
                            key={item.id}
                            className={`glass-panel p-2 text-sm flex flex-col gap-1 border-2 transition-colors ${qty ? "border-brand-gold" : "border-transparent"}`}
                          >
                            <button type="button" className="text-left" onClick={() => changeQty(item.id, qtyStep(item))}>
                              <span className="block font-semibold leading-tight">{item.name}</span>
                              <span className="text-xs text-brand-navydeep/70">
                                {formatMoney(item.price)}
                                {item.unit === "lb" ? " / lb" : ""}
                              </span>
                            </button>
                            {qty > 0 && (
                              <div className="flex items-center justify-between mt-1">
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-full bg-brand-navydeep/10 font-bold"
                                  aria-label={`Remove ${item.name}`}
                                  onClick={() => changeQty(item.id, -qtyStep(item))}
                                >
                                  −
                                </button>
                                <span className="font-semibold">
                                  {qty}
                                  {item.unit === "lb" ? " lb" : ""}
                                </span>
                                <button
                                  type="button"
                                  className="w-7 h-7 rounded-full bg-brand-gold text-white font-bold"
                                  aria-label={`Add ${item.name}`}
                                  onClick={() => changeQty(item.id, qtyStep(item))}
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {hasCart && (
                <div className="flex justify-between items-center mt-2 text-sm">
                  <span className="font-semibold">Items total: {formatMoney(cartTotal)}</span>
                  <button type="button" className="text-xs text-brand-navydeep/60 underline" onClick={() => setCart({})}>
                    Clear items
                  </button>
                </div>
              )}
            </div>
            {!hasCart && (
              <div className="field-group">
                <span className="field-label">
                  <i className="fa-solid fa-dollar-sign"></i> Or enter amount to charge
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="input-3d text-lg"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
              </div>
            )}
            <div className="field-group">
              <span className="field-label">
                <i className="fa-solid fa-user"></i> Customer name (optional)
              </span>
              <input
                type="text"
                className="input-3d"
                placeholder="e.g. Maria"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="field-group">
              <span className="field-label">
                <i className="fa-solid fa-note-sticky"></i> Note (optional)
              </span>
              <input
                type="text"
                className="input-3d"
                placeholder="e.g. street vending"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        )}

        {!receipt && mode === "invoice" && !invoice && (
          <div className="flex flex-col gap-4">
            <div className="field-group">
              <span className="field-label">
                <i className="fa-solid fa-hashtag"></i> Invoice / Receipt #
              </span>
              <input
                type="text"
                className="input-3d"
                placeholder="e.g. 1042"
                value={lookupValue}
                onChange={(e) => setLookupValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadInvoice(lookupValue)}
              />
            </div>
            <button className="btn-3d justify-center" onClick={() => loadInvoice(lookupValue)} disabled={loadingInvoice}>
              {loadingInvoice ? "Looking up…" : "Find invoice"}
            </button>
          </div>
        )}

        {!receipt && mode === "invoice" && invoice && (
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold mb-1">Paying for</p>
            <p className="font-form text-lg">{invoice.Name}</p>
            <p className="text-sm text-brand-navydeep/70 mb-2">Receipt #{invoice.Id}</p>
            {invoiceTotalDue <= 0 && (
              <p className="glass-panel p-3 text-sm font-semibold text-emerald-600">
                <i className="fa-solid fa-circle-check"></i> This invoice is already paid in full.
              </p>
            )}
            <button className="text-xs text-brand-navydeep/60 underline self-start" onClick={() => setInvoice(null)}>
              Not the right invoice? Look up another
            </button>
          </div>
        )}

        {!receipt && readyToCharge && (
          <div className="flex flex-col gap-6 mt-6">
            <div className="glass-panel p-4 text-sm">
              <div className="flex justify-between py-1">
                <span className="text-brand-navydeep/70">Amount due</span>
                <span className="font-semibold">{formatMoney(totalDue)}</span>
              </div>
              <p className="text-xs text-brand-navydeep/60 mt-1">
                Final total (including a Card Processing Fee of up to 3.0% for credit cards — debit cards are
                exempt) is confirmed after your card is verified.
              </p>
            </div>

            <div className="field-group">
              <span className="field-label">
                <i className="fa-solid fa-envelope"></i> Email for receipt (optional)
              </span>
              <input
                type="email"
                className="input-3d"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field-group">
              <span className="field-label">
                <i className="fa-solid fa-mobile-screen"></i> Phone for text receipt (optional)
              </span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                className="input-3d"
                placeholder="e.g. 347-555-0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <Elements stripe={getStripe()}>
              <CardPaymentForm
                baseAmountCents={baseAmountCents}
                invoiceId={payInvoiceId}
                email={email}
                description={mode === "amount" ? receiptDescription : undefined}
                note={mode === "amount" ? note.trim() : undefined}
                theme={theme}
                onPaid={handlePaid}
              />
            </Elements>
          </div>
        )}

        {receipt && (
          <div className="flex flex-col items-center gap-3 text-center">
            <i className="fa-solid fa-circle-check text-4xl text-emerald-600"></i>
            <p className="font-form text-xl">Payment successful</p>
            {payLabel && <p className="text-sm text-brand-navydeep/70">{payLabel}</p>}
            {payInvoiceId && <p className="text-xs text-brand-navydeep/60">Order ID: {payInvoiceId}</p>}
            <div className="glass-panel p-4 text-sm w-full text-left">
              <div className="flex justify-between py-1">
                <span className="text-brand-navydeep/70">Subtotal</span>
                <span>{formatMoney(receipt.baseAmountCents / 100)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-brand-navydeep/70">
                  Card Processing Fee
                  {receipt.surchargeCents > 0
                    ? ` (${((receipt.surchargeCents / receipt.baseAmountCents) * 100).toFixed(1)}%)`
                    : " (Exempt)"}
                </span>
                <span>{formatMoney(receipt.surchargeCents / 100)}</span>
              </div>
              <div className="flex justify-between py-2 mt-1 border-t border-brand-navydeep/20 font-bold">
                <span>Total charged</span>
                <span>{formatMoney(receipt.totalCents / 100)}</span>
              </div>
              {receipt.cardLast4 && (
                <div className="flex justify-between pt-1 text-xs text-brand-navydeep/60">
                  <span>Paid with</span>
                  <span>
                    {formatCardLabel(receipt.cardBrand, receipt.cardLast4)} · {receipt.funding === "debit" ? "Debit" : "Credit"}
                  </span>
                </div>
              )}
            </div>
            {/* Stacked full-width on phones (easy thumb targets), side by side from sm up. */}
            <div className={`grid grid-cols-1 gap-3 w-full mt-2 ${receipt.receiptUrl ? "sm:grid-cols-2" : ""}`}>
              {/* The same Stripe link Text receipt sends, so staff can check it
                  first. Full row on top; "Receipt" when paying an order, since
                  that flow already has a View invoice button for the order. */}
              {receipt.receiptUrl && (
                <a
                  href={receipt.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-3d justify-center !px-4 whitespace-nowrap sm:col-span-2"
                >
                  <i className="fa-solid fa-receipt"></i> {mode === "invoice" ? "View receipt" : "View invoice"}
                </a>
              )}
              {mode === "invoice" && invoice?.Id ? (
                <Link to={`/invoice?id=${encodeURIComponent(invoice.Id)}`} className="btn-3d justify-center !px-4 whitespace-nowrap">
                  <i className="fa-solid fa-file-invoice"></i> View invoice
                </Link>
              ) : (
                <button
                  className="btn-3d justify-center !px-4 whitespace-nowrap"
                  onClick={() => {
                    setReceipt(null);
                    setAmountInput("");
                    setCustomerName("");
                    setNote("");
                    setCart({});
                    setCardPaymentId(newCardPaymentId());
                    // Cleared so the next customer's receipt can't go to
                    // the previous customer's email or phone.
                    setEmail("");
                    setPhone("");
                  }}
                >
                  <i className="fa-solid fa-credit-card"></i> Charge another
                </button>
              )}
              {receipt.receiptUrl && (
                <button className="btn-3d justify-center !px-4 whitespace-nowrap" onClick={textReceipt}>
                  <i className="fa-solid fa-comment-sms"></i> Text receipt
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
