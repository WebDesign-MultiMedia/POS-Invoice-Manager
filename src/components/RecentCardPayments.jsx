import { useState } from "react";
import { formatMoney } from "../lib/format.js";
import { isDemo } from "../lib/demo.js";
import { deleteCardPayment, updateCardPayment } from "../api/sheetdb.js";
import { saleToOrderForm } from "../lib/saleToOrder.js";
import { RowButtons, RowEditor, SoldByTag, confirmAndDelete, useMakeInvoice } from "./RowActions.jsx";
import { useAuth } from "../lib/auth.jsx";

const PAGE = 5;

// Under the Pay with Card form: the card payments taken, newest first, a few
// at a time with "Show more", each one tap from its invoice and receipt, and
// each one editable (who and what it was for, never the amount) or
// deletable from the sheet.
//   onUpdated(paymentIntentId, fields) / onDeleted(paymentIntentId) keep the
//   page's list in step after a save.
export default function RecentCardPayments({ payments, loading, error, className = "max-w-3xl", onUpdated, onDeleted }) {
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
            <PaymentRow key={p.PaymentIntentId || `${p.InvoiceId}-${p.Date}-${p.Time}-${i}`} payment={p} onUpdated={onUpdated} onDeleted={onDeleted} />
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

const EDIT_FIELDS = [
  { key: "Name", label: "Name", icon: "fa-user" },
  { key: "Phone", label: "Phone", icon: "fa-phone", type: "tel" },
  { key: "Email", label: "Email", icon: "fa-envelope", type: "email" },
  { key: "InvoiceId", label: "Order ID / invoice #", icon: "fa-hashtag" },
  { key: "Items", label: "Items", icon: "fa-clipboard-list", type: "textarea" },
  { key: "Note", label: "Note", icon: "fa-note-sticky" },
];

function PaymentRow({ payment: p, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const makeInvoice = useMakeInvoice();
  const { can = () => true } = useAuth() || {};
  // Plain-number ids are invoice payments, so their order invoice exists;
  // CP-… ids are walk-up sales and EV-… ids are event card sales.
  const invoiceId = /^\d+$/.test(p.InvoiceId || "") ? p.InvoiceId : null;
  // Demo payments were never sent to Stripe, so there's no receipt to fetch.
  const receipt = !isDemo() && /^pi_[A-Za-z0-9]+$/.test(p.PaymentIntentId || "") ? `/api/receipt-url?pi=${encodeURIComponent(p.PaymentIntentId)}` : null;
  const card = [p.Card, p.Funding === "debit" ? "Debit" : p.Funding ? "Credit" : ""].filter(Boolean).join(" · ");
  // Rows are found by their Stripe payment id; very old rows without one
  // can only be changed in the sheet itself.
  const key = /^[A-Za-z0-9_]{1,80}$/.test(p.PaymentIntentId || "") ? p.PaymentIntentId : null;
  const label = `card payment from ${p.Name || "walk-up customer"}`;

  const remove = async () => {
    const gone = await confirmAndDelete({
      title: "Delete this card payment?",
      text: `${formatMoney(p.Total || p.Amount)} from ${p.Name || "a walk-up customer"} will be removed from the sheet${invoiceId ? ` and from invoice #${invoiceId}` : ""}. This does NOT refund the card. Refunds are done in Stripe.`,
      remove: () => deleteCardPayment(key),
    });
    if (gone) onDeleted?.(key);
  };

  const save = async (values) => {
    const fields = Object.fromEntries(EDIT_FIELDS.map((f) => [f.key, String(values[f.key] ?? "").trim()]));
    await updateCardPayment(key, fields);
    onUpdated?.(key, fields);
    setEditing(false);
  };

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
        <SoldByTag name={p.SoldBy} />
      </div>
      <RowButtons
        label={label}
        invoiceHref={invoiceId && (can("orders") || can("search")) ? `/invoice?id=${encodeURIComponent(invoiceId)}` : null}
        onMakeInvoice={!invoiceId && can("orders") ? () => makeInvoice(saleToOrderForm(p, "Card"), `card payment ${p.InvoiceId || ""}`.trim()) : null}
        receiptHref={receipt}
        onEdit={key && can("manage") ? () => setEditing(true) : null}
        onDelete={key && can("manage") ? remove : null}
        editing={editing}
      />
      {editing && (
        <RowEditor
          idBase={`cp-${key}`}
          fields={EDIT_FIELDS}
          initial={Object.fromEntries(EDIT_FIELDS.map((f) => [f.key, String(p[f.key] ?? "")]))}
          note={`The amount (${formatMoney(p.Total || p.Amount)}) can't change here: the card was already charged. Set Order ID to an invoice number to show this payment on that invoice.`}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
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
