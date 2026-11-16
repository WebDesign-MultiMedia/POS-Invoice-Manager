import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { checkQrPayment, createQrPayment } from "../api/qrPay.js";
import { formatMoney } from "../lib/format.js";
import { friendlyMessage } from "../lib/errors.js";

// Event Sales → Pay now → QR pay. Shows a QR code for Stripe's checkout
// page; the customer scans it with their phone camera and pays there with
// Apple Pay, Google Pay or a card. Checks every few seconds and calls
// onPaid once it's paid.
//   onStart({ id, expiresAt }): the page exists (the parent keeps it so a
//     reload can't lose a paid sale)
//   onPaid(result, id): same shape as CardPaymentForm's, plus wallet
//   onCancel(): Cancel pressed; the parent closes this panel
//   onLeave(id): the panel closed while the page was still open, so the
//     parent closes the page with Stripe
const POLL_MS = 3000;

export default function QrPayPanel({ baseAmountCents, invoiceId, description, note, onStart, onPaid, onCancel, onLeave }) {
  // "making" → "open" → "paid" | "expired" | "error"
  const [state, setState] = useState({ phase: "making", qr: "", id: "", expiresAt: 0, error: "", trouble: false });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ onStart, onPaid, onLeave });
  latest.current = { onStart, onPaid, onLeave };

  useEffect(() => {
    let live = true;
    let timer;
    let id = "";
    let open = false;
    (async () => {
      try {
        const session = await createQrPayment({ baseAmountCents, invoiceId, description, note });
        id = session.id;
        // Closed while it was being made: close the page again right away.
        if (!live) return latest.current.onLeave(id);
        open = true;
        latest.current.onStart(session);
        const qr = await QRCode.toDataURL(session.url, { errorCorrectionLevel: "M", margin: 1, width: 560 });
        if (!live) return;
        setState({ phase: "open", qr, id, expiresAt: session.expiresAt, error: "", trouble: false });
        const tick = async () => {
          try {
            const r = await checkQrPayment(id);
            if (!live) return;
            if (r.status === "paid") {
              open = false;
              setState((s) => ({ ...s, phase: "paid" }));
              latest.current.onPaid(r, id);
              return;
            }
            if (r.status === "expired") {
              open = false;
              setState((s) => ({ ...s, phase: "expired" }));
              return;
            }
            setState((s) => (s.trouble ? { ...s, trouble: false } : s));
          } catch {
            if (live) setState((s) => ({ ...s, trouble: true }));
          }
          if (live) timer = setTimeout(tick, POLL_MS);
        };
        timer = setTimeout(tick, POLL_MS);
      } catch (err) {
        console.error("QR pay couldn't start:", err);
        if (live) setState((s) => ({ ...s, phase: "error", error: friendlyMessage(err, "The QR code couldn't be made.") }));
      }
    })();
    return () => {
      live = false;
      clearTimeout(timer);
      // Switched to Cash, went back, …: the parent closes the page so the
      // customer can't pay for a sale that's no longer on screen.
      if (open && id) latest.current.onLeave(id);
    };
    // A new QR only for a new amount or order, or "Try again".
  }, [baseAmountCents, invoiceId, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => {
    setState({ phase: "making", qr: "", id: "", expiresAt: 0, error: "", trouble: false });
    setAttempt((a) => a + 1);
  };

  if (state.phase === "error" || state.phase === "expired") {
    return (
      <div className="flex flex-col gap-3 text-center">
        <p className="glass-panel p-3 text-sm">
          <i className="fa-solid fa-triangle-exclamation text-brand-terracotta" aria-hidden="true"></i>{" "}
          {state.phase === "expired" ? "That QR code expired before it was paid. Nothing was charged." : state.error}
        </p>
        <button type="button" className="btn-3d justify-center" onClick={retry}>
          <i className="fa-solid fa-rotate-right" aria-hidden="true"></i> New QR code
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl bg-white text-neutral-900 p-4 flex flex-col items-center gap-2 text-center shadow-lg">
        <p className="text-sm font-semibold">Scan with your phone camera to pay</p>
        <p className="text-3xl font-bold">{formatMoney(baseAmountCents / 100)}</p>
        {state.qr ? (
          <img src={state.qr} alt={`QR code to pay ${formatMoney(baseAmountCents / 100)}`} className="w-full max-w-[280px] aspect-square" />
        ) : (
          <div className="w-full max-w-[280px] aspect-square flex items-center justify-center text-neutral-500" role="status">
            <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i> Making QR code…
          </div>
        )}
        <p className="text-sm">
          <i className="fa-brands fa-apple-pay text-2xl align-middle" aria-hidden="true"></i>{" "}
          <i className="fa-brands fa-google-pay text-2xl align-middle" aria-hidden="true"></i> Apple Pay, Google Pay or card
        </p>
      </div>
      <p className="glass-panel p-3 text-sm text-center" role="status" aria-live="polite">
        {state.phase === "paid" ? (
          <>
            <i className="fa-solid fa-circle-check text-emerald-600" aria-hidden="true"></i> Paid! Saving the sale…
          </>
        ) : state.trouble ? (
          <>
            <i className="fa-solid fa-wifi text-brand-terracotta" aria-hidden="true"></i> Connection trouble, still checking…
          </>
        ) : (
          <>
            <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Waiting for the customer to pay… The sale records by itself.
          </>
        )}
      </p>
      <p className="text-xs text-brand-navydeep/75 text-center">No card fee when paying by QR.</p>
      {state.phase === "open" && (
        <button type="button" className="btn-3d justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy" onClick={onCancel}>
          Cancel QR payment
        </button>
      )}
    </div>
  );
}
