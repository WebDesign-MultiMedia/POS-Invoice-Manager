import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getBrand } from "../lib/brand.js";
import { isDemo } from "../lib/demo.js";
import { getShareToken } from "../api/sheetdb.js";
import { receiptMessage, smsHref } from "../lib/textReceipt.js";

// "Text receipt" for a paid sale (Card, Cash or Zelle): a screen with the
// customer's phone and the message (with their invoice link, and the card
// receipt link for card sales). Send text copies the message, then opens
// the phone's own texting app with the number and text filled in. Nothing
// is sent from the server; the employee sends it from their phone.
//   sale: an EventSales row. receiptUrl: Stripe receipt link if known;
//   otherwise card sales look it up from PaymentIntentId.
export default function TextReceiptButton({ sale, receiptUrl: knownUrl = null, className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <i className="fa-solid fa-comment-sms" aria-hidden="true"></i> Text receipt
      </button>
      {open && <TextReceiptDialog sale={sale} knownUrl={knownUrl} onClose={() => setOpen(false)} />}
    </>
  );
}

function TextReceiptDialog({ sale, knownUrl, onClose }) {
  const brand = getBrand();
  const [phone, setPhone] = useState(sale.Phone || "");
  const [receiptUrl, setReceiptUrl] = useState(knownUrl);
  const [invoiceUrl, setInvoiceUrl] = useState(null);
  const [looking, setLooking] = useState(false);
  const [lookingInvoice, setLookingInvoice] = useState(true);
  const [copied, setCopied] = useState(false);
  const phoneRef = useRef(null);

  // Card sales: fetch the Stripe receipt link to put in the text.
  const pi = sale.PaymentIntentId || "";
  useEffect(() => {
    if (knownUrl || sale.Method !== "Card" || isDemo() || !/^pi_[A-Za-z0-9]+$/.test(pi)) return;
    let live = true;
    setLooking(true);
    fetch(`/api/receipt-url?pi=${encodeURIComponent(pi)}&format=json`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => live && data?.receiptUrl && setReceiptUrl(data.receiptUrl))
      .catch(() => {})
      .finally(() => live && setLooking(false));
    return () => {
      live = false;
    };
  }, [knownUrl, pi, sale.Method]);

  // The customer's invoice link: the same signed link the Invoice section
  // shares, for this sale. Without it the text still goes, minus the link.
  useEffect(() => {
    let live = true;
    getShareToken(sale.SaleId)
      .then((token) => {
        if (live && token) setInvoiceUrl(`${window.location.origin}/invoice?id=${encodeURIComponent(sale.SaleId)}&token=${encodeURIComponent(token)}&share=1`);
      })
      .catch((err) => console.error("Invoice link failed:", err))
      .finally(() => live && setLookingInvoice(false));
    return () => {
      live = false;
    };
  }, [sale.SaleId]);

  useEffect(() => {
    phoneRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const message = receiptMessage({ brandName: brand.name, sale, invoiceUrl, receiptUrl });
  const busy = looking || lookingInvoice;

  // Copies first (so it can be pasted if the texting app leaves the text
  // out), then the link itself opens Messages.
  const copy = () => {
    navigator.clipboard
      ?.writeText(message)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 4000);
      })
      .catch(() => {});
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Text receipt"
        className="glass-card w-full max-w-md max-h-[92dvh] overflow-y-auto p-5 sm:p-6 !rounded-b-none sm:!rounded-[28px] pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-lg text-brand-navy">
            <i className="fa-solid fa-comment-sms text-brand-teal" aria-hidden="true"></i> Text receipt
          </h2>
          <button type="button" onClick={onClose} className="fab shrink-0 !w-10 !h-10" aria-label="Close">
            <i className="fa-solid fa-xmark text-lg text-brand-gold" aria-hidden="true"></i>
          </button>
        </div>

        <div className="field-group">
          <label htmlFor="text-receipt-phone" className="field-label">
            <i className="fa-solid fa-phone" aria-hidden="true"></i> Customer&apos;s phone
          </label>
          <input
            ref={phoneRef}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className="input-3d text-lg"
            id="text-receipt-phone"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <p className="field-label mt-4">
          <i className="fa-solid fa-message" aria-hidden="true"></i> Message
          {busy && <span className="normal-case tracking-normal font-normal"> · adding the links…</span>}
        </p>
        <pre className="glass-panel p-3 text-sm whitespace-pre-wrap break-words font-form1 leading-relaxed">{message}</pre>

        <a
          href={smsHref(phone, message)}
          aria-disabled={busy}
          className={`btn-3d justify-center w-full mt-4 !py-4 text-lg ${busy ? "opacity-60 pointer-events-none" : ""}`}
          onClick={copy}
        >
          <i className={`fa-solid ${copied ? "fa-check" : "fa-paper-plane"}`} aria-hidden="true"></i> {copied ? "Copied · opening Messages…" : "Send text"}
        </a>
        <p className="text-xs text-center text-brand-navydeep/70 mt-3">
          Copies the message, then opens Messages with the number and text filled in. Tap Send there. If the text is missing, paste it.
        </p>
      </div>
    </div>,
    document.body,
  );
}
