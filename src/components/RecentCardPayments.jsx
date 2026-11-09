import { useState } from "react";
import { Link } from "react-router-dom";
import { formatMoney } from "../lib/format.js";
import { isDemo } from "../lib/demo.js";

const PAGE = 5;

// Under the Pay with Card form: the card payments taken, newest first, a few
// at a time with "Show more", each one tap from its invoice and receipt.
export default function RecentCardPayments({ payments, loading, error, className = "max-w-3xl" }) {
  const [shown, setShown] = useState(PAGE);
  if (loading || (!error && !payments.length)) return null;
  return (
    <section className={`glass-card w-full ${className} mt-8 p-5 sm:p-6 stagger-in`} aria-label="Recent card payments">
      <h2 className="field-label !mb-3 justify-center">
        <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Recent card payments
      </h2>
      {error ? (
        <p className="text-center text-sm text-brand-navydeep/80">Couldn&apos;t load recent card payments. They&apos;ll show next time the page opens.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-navydeep/15">
          {payments.slice(0, shown).map((p, i) => (
            <PaymentRow key={p.PaymentIntentId || `${p.InvoiceId}-${p.Date}-${p.Time}-${i}`} payment={p} />
          ))}
        </ul>
      )}
      {payments.length > shown && (
        <div className="flex justify-center mt-4">
          <button type="button" className="underline font-semibold text-sm text-brand-navy" onClick={() => setShown((n) => n + PAGE * 2)}>
            Show more ({payments.length - shown} older)
          </button>
        </div>
      )}
    </section>
  );
}

function PaymentRow({ payment: p }) {
  // Plain-number ids are invoice payments, so their order invoice exists;
  // CP-… ids are walk-up sales.
  const invoiceId = /^\d+$/.test(p.InvoiceId || "") ? p.InvoiceId : null;
  // Demo payments were never sent to Stripe, so there's no receipt to fetch.
  const receipt = !isDemo() && /^pi_[A-Za-z0-9]+$/.test(p.PaymentIntentId || "") ? `/api/receipt-url?pi=${encodeURIComponent(p.PaymentIntentId)}` : null;
  const card = [p.Card, p.Funding === "debit" ? "Debit" : p.Funding ? "Credit" : ""].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold text-brand-navy truncate">
            {p.Name || "Walk-up customer"} · {formatMoney(p.Total || p.Amount)}
          </p>
          <OrderTypeTag type={invoiceId ? p.OrderType : "Walk-up"} />
        </div>
        <p className="text-sm text-brand-navydeep/80">
          {[p.Date, p.Time].filter(Boolean).join(" · ")}
          {p.InvoiceId ? ` · ${invoiceId ? `Invoice #${invoiceId}` : `Order ID ${p.InvoiceId}`}` : ""}
        </p>
        {card && <p className="text-xs text-brand-navydeep/70">{card}</p>}
      </div>
      {(invoiceId || receipt) && (
        <div className="flex gap-2">
          {invoiceId && (
            <Link to={`/invoice?id=${encodeURIComponent(invoiceId)}`} className="btn-3d !py-2 !px-4 text-sm whitespace-nowrap">
              <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i> Invoice
            </Link>
          )}
          {receipt && (
            <a href={receipt} target="_blank" rel="noopener noreferrer" className="btn-3d !py-2 !px-4 text-sm whitespace-nowrap">
              <i className="fa-solid fa-receipt" aria-hidden="true"></i> Receipt
            </a>
          )}
        </div>
      )}
    </li>
  );
}

const TYPE_ICONS = { Delivery: "fa-truck-fast", "Pick-up": "fa-bag-shopping", Catering: "fa-utensils", "Walk-up": "fa-cash-register" };

// What kind of order the payment was for: the order's type (Delivery,
// Pick-up, Catering) for invoice payments, "Walk-up" for walk-up sales.
function OrderTypeTag({ type }) {
  if (!type) return null;
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-brand-navydeep/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-navydeep/90">
      <i className={`fa-solid ${TYPE_ICONS[type] || "fa-tag"}`} aria-hidden="true"></i> {type}
    </span>
  );
}
