import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The phone's back camera, full screen, for one receipt in several photos:
// snap the top, scroll down, snap again, … then Done. The phone's own camera
// app only takes one picture per trip, which made long receipts slow.
//   <ReceiptCamera onDone={(files) => …} onCancel={…} onUnavailable={…} />
// onUnavailable: no camera access (denied, or an old browser), so the page
// falls back to the phone's own camera / photo picker.
const MAX_SHOTS = 10;

export default function ReceiptCamera({ onDone, onCancel, onUnavailable, maxShots = MAX_SHOTS }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [shots, setShots] = useState([]); // [{ file, url }]
  const [flash, setFlash] = useState(false);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera API");
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          // As sharp as the phone allows: receipts have small print.
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (!live) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setReady(true);
      } catch (err) {
        console.warn("Receipt camera unavailable:", err);
        if (live) onUnavailable();
      }
    })();
    return () => {
      live = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    };
    // Runs once: the camera opens with the screen and closes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No scrolling the page behind the camera.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const snap = () => {
    const video = videoRef.current;
    if (!ready || !video?.videoWidth || shots.length >= maxShots) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: "image/jpeg" });
        setShots((s) => [...s, { file, url: URL.createObjectURL(blob) }]);
      },
      "image/jpeg",
      0.92
    );
  };

  const drop = (i) =>
    setShots((s) => {
      URL.revokeObjectURL(s[i].url);
      return s.filter((_, j) => j !== i);
    });

  const finish = () => {
    // Revoke on unmount, after the parent has the files.
    onDone(shots.map((s) => s.file));
  };

  const full = shots.length >= maxShots;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Scan receipt" className="fixed inset-0 z-[1000] bg-black flex flex-col text-white">
      <div className="relative flex-1 min-h-0">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-contain" />
        {flash && <div className="absolute inset-0 bg-white/70" aria-hidden="true" />}
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-white/80" role="status">
            <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true"></i> Opening camera…
          </p>
        )}
        <p className="absolute top-0 inset-x-0 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 text-center text-sm bg-gradient-to-b from-black/70 to-transparent">
          {shots.length === 0 ? "Start at the top of the receipt." : full ? `That's ${maxShots} photos, the most for one trip. Press Done.` : `Photo ${shots.length} saved. Move down a little, keep some overlap, and snap again.`}
        </p>
      </div>

      {shots.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-3 py-2 bg-black/80" aria-label="Photos taken">
          {shots.map((s, i) => (
            <li key={s.url} className="relative shrink-0">
              <img src={s.url} alt={`Photo ${i + 1}`} className="h-16 w-12 object-cover rounded border border-white/30" />
              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[10px]">{i + 1}</span>
              <button type="button" onClick={() => drop(i)} aria-label={`Remove photo ${i + 1}`} className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-black/80 border border-white/40 text-[11px]">
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-3 items-center px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-black">
        <button type="button" onClick={onCancel} className="justify-self-start rounded-full px-4 py-2 text-sm bg-white/15">
          Cancel
        </button>
        <button
          type="button"
          onClick={snap}
          disabled={!ready || full}
          aria-label="Take photo"
          className="justify-self-center h-[72px] w-[72px] rounded-full border-4 border-white bg-white/90 active:scale-95 transition disabled:opacity-40"
        />
        <button type="button" onClick={finish} disabled={!shots.length} className="justify-self-end rounded-full px-4 py-2 text-sm font-semibold bg-brand-gold text-brand-navydeep disabled:opacity-40">
          Done{shots.length ? ` (${shots.length})` : ""}
        </button>
      </div>
    </div>,
    document.body
  );
}
