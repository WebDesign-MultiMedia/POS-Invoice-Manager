import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Full-screen barcode scanner for the shopping trip. Uses the back camera
// and reads UPC / EAN / Code 128 barcodes; the reading library loads only
// when someone scans. If the camera can't be used (no permission, no
// camera), the number printed under the barcode can be typed instead.
//   <BarcodeScanner title="Scan Open Pit BBQ Sauce" onCode={(code) => …} onClose={…} />

export default function BarcodeScanner({ title, hint = "", onCode, onClose }) {
  const videoRef = useRef(null);
  const doneRef = useRef(false);
  const [problem, setProblem] = useState("");
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let controls = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This phone or browser can't use the camera here.");
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        if (cancelled) return;
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128]]]);
        const reader = new BrowserMultiFormatReader(hints);
        controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result) => {
          if (!result || doneRef.current) return;
          doneRef.current = true;
          navigator.vibrate?.(60);
          controls?.stop();
          onCode(result.getText());
        });
        if (cancelled) controls.stop();
      } catch (err) {
        console.error("barcode scanner:", err);
        if (!cancelled) setProblem(err?.name === "NotAllowedError" ? "The camera is blocked for this app. Allow it in the phone's settings, or type the number below." : "The camera couldn't start. Type the number under the barcode instead.");
      }
    })();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      controls?.stop();
      window.removeEventListener("keydown", onKey);
    };
    // Starts once per opening; onCode/onClose are read at scan time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitTyped = (e) => {
    e.preventDefault();
    const code = typed.replace(/\D/g, "");
    if (code.length >= 6 && !doneRef.current) {
      doneRef.current = true;
      onCode(code);
    }
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[1000] bg-black flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2 text-white">
        <p className="font-semibold leading-tight min-w-0">
          <i className="fa-solid fa-barcode" aria-hidden="true"></i> {title}
        </p>
        <button type="button" onClick={onClose} aria-label="Close scanner" className="shrink-0 h-10 w-10 rounded-full bg-white/15 text-lg">
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      <div className="relative flex-1 min-h-0">
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline aria-hidden="true" />
        {!problem && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
            <div className="w-[80%] max-w-sm h-32 rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}
        {problem && <p className="absolute inset-x-6 top-1/3 text-center text-white">{problem}</p>}
      </div>
      <form onSubmit={submitTyped} className="px-4 pt-3 pb-6 flex flex-col gap-2 bg-black text-white">
        <p className="text-sm text-white/80 text-center">{problem ? "" : "Hold the barcode inside the box. "}{hint}</p>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            aria-label="Or type the number under the barcode"
            className="input-3d !py-2 min-w-0"
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/[^\d\s-]/g, ""))}
            placeholder="Or type the number under the barcode"
            autoComplete="off"
          />
          <button type="submit" className="btn-3d !py-2 !px-4 disabled:opacity-60" disabled={typed.replace(/\D/g, "").length < 6}>
            Check
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
