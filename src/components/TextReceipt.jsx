import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getBrand } from "../lib/brand.js";
import { isDemo } from "../lib/demo.js";
import { receiptMessage, smsHref } from "../lib/textReceipt.js";

// "Text receipt" for a paid sale (Card, Cash or Zelle): a screen with the
// message, the customer's phone, Copy message, and Open Messages (the
// phone's own texting app, number and text filled in). Nothing is sent
// from the server; the employee sends it from their phone.
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
  const [looking, setLooking] = useState(false);
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

  const message = receiptMessage({ brandName: brand.name, sale, receiptUrl });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
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
          {looking && <span className="normal-case tracking-normal font-normal"> · getting the card receipt link…</span>}
        </p>
        <pre className="glass-panel p-3 text-sm whitespace-pre-wrap break-words font-form1 leading-relaxed">{message}</pre>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <button type="button" className="btn-3d justify-center !px-3" onClick={copy}>
            <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} aria-hidden="true"></i> {copied ? "Copied" : "Copy message"}
          </button>
          <a href={smsHref(phone, message)} className="btn-3d justify-center !px-3" onClick={copy}>
            <i className="fa-solid fa-paper-plane" aria-hidden="true"></i> Open Messages
          </a>
        </div>
        <p className="text-xs text-center text-brand-navydeep/70 mt-3">
          Open Messages fills in the number and the text; tap Send there. If the text doesn&apos;t show up, paste it (it&apos;s copied too).
        </p>
      </div>
    </div>,
    document.body,
  );
}
