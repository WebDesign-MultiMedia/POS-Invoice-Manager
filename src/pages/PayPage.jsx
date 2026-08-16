import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Elements } from "@stripe/react-stripe-js";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import CardPaymentForm from "../components/CardPaymentForm.jsx";
import { getInvoiceById, recordCardPayment } from "../api/sheetdb.js";
import { toNumber, formatMoney, getCurrentDateTime } from "../lib/format.js";
import { getStripe } from "../lib/stripeClient.js";
import { getStoredTheme } from "../lib/theme.js";

// Two entry points into the same card-payment flow:
//  - "amount": staff types a dollar figure on the spot (pop-up/street
//    vending — there's no invoice for a walk-up sale).
//  - "invoice": pulls up an existing order's balance due, for customers who
//    already have a receipt number.
// Landing here via a share/invoice link (?id=...) jumps straight to the
// invoice tab pre-loaded; otherwise "amount" is the default since that's
// the more common vending-table case.
export default function PayPage() {
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("id");

  const [mode, setMode] = useState(preselectedId ? "invoice" : "amount");

  const [invoice, setInvoice] = useState(null);
  const [lookupValue, setLookupValue] = useState(preselectedId || "");
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const [amountInput, setAmountInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");

  const [email, setEmail] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [theme, setTheme] = useState(getStoredTheme());

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
    const observer = new MutationObserver(() => setTheme(getStoredTheme()));
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
  const invoiceTotalDue = invoice ? Math.max(hasDeposit ? cost - deposit : cost, 0) : 0;

  const customAmount = toNumber(amountInput) || 0;
  const totalDue = mode === "invoice" ? invoiceTotalDue : customAmount;
  const baseAmountCents = Math.round(totalDue * 100);
  const readyToCharge = mode === "invoice" ? !!invoice : customAmount > 0;
  const payLabel = mode === "invoice" ? invoice?.Name || "" : customerName;
  const payInvoiceId = mode === "invoice" ? invoice?.Id : undefined;

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
        PaymentIntentId: result.id || "",
        Name: mode === "invoice" ? invoice?.Name || "" : customerName,
        Email: email,
        InvoiceId: payInvoiceId || "",
        Note: mode === "amount" ? note : "",
      });
    } catch (err) {
      console.error("recordCardPayment failed:", err.message);
    }
    setReceipt(result);
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
                <i className="fa-solid fa-dollar-sign"></i> Amount to charge
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

            <Elements stripe={getStripe()}>
              <CardPaymentForm
                baseAmountCents={baseAmountCents}
                invoiceId={payInvoiceId}
                email={email}
                description={mode === "amount" ? note : undefined}
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
            </div>
            {mode === "invoice" && invoice?.Id ? (
              <Link to={`/invoice?id=${encodeURIComponent(invoice.Id)}`} className="btn-3d mt-2">
                <i className="fa-solid fa-file-invoice"></i> View invoice
              </Link>
            ) : (
              <button
                className="btn-3d mt-2"
                onClick={() => {
                  setReceipt(null);
                  setAmountInput("");
                  setCustomerName("");
                  setNote("");
                }}
              >
                <i className="fa-solid fa-credit-card"></i> Charge another
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
