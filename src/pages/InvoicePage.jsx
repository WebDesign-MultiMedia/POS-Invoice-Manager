import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import html2canvas from "html2canvas";
import Layout from "../components/Layout.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import { getInvoiceById } from "../api/sheetdb.js";
import { toNumber, formatMoney, splitItems } from "../lib/format.js";
import { generateShareToken, isValidShareToken } from "../lib/shareToken.js";

const PRINT_PAGE = { widthIn: 8.5, heightIn: 11, marginIn: 0.4 };

export default function InvoicePage() {
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("id");
  const shareToken = searchParams.get("token");
  const isShareView = searchParams.get("share") === "1";

  const [invoice, setInvoice] = useState(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupValue, setPopupValue] = useState("");

  const wrapRef = useRef(null);
  const cardRef = useRef(null);

  const loadInvoice = async (invoiceId) => {
    try {
      const row = await getInvoiceById(invoiceId);
      if (!row) {
        console.warn("No invoice found for Id:", invoiceId);
        return;
      }
      setInvoice(row);
    } catch (err) {
      console.error("Error loading invoice:", err);
    }
  };

  useEffect(() => {
    if (!preselectedId) return;
    if (isShareView) {
      // Share links must present a token that matches this invoice id — a
      // bare ?id=X&share=1 (the old link shape) no longer loads anything,
      // since typing a different id in the address bar is exactly the
      // access-control hole this closes.
      isValidShareToken(preselectedId, shareToken).then((valid) => {
        if (valid) loadInvoice(preselectedId);
        else console.warn("Invalid or missing share token for invoice:", preselectedId);
      });
    } else {
      loadInvoice(preselectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedId, isShareView, shareToken]);

  // PRINT — scale the invoice down (if needed) so it always prints on a single
  // page, no matter how much content it holds. `transform: scale()` alone only
  // changes how the card *looks*; the browser still reserves the card's full
  // unscaled height in the page flow (which is what print pagination measures),
  // so the wrapper is also resized to the scaled-down box the card is shrunk
  // into. Runs on beforeprint/afterprint so it applies whether print is
  // triggered by the toolbar button, Ctrl/Cmd+P, or the browser menu.
  useEffect(() => {
    function fitInvoiceToOnePage() {
      const wrap = wrapRef.current;
      const card = cardRef.current;
      if (!wrap || !card) return;

      card.style.animation = "none";
      card.style.transform = "none";
      wrap.style.width = "";
      wrap.style.height = "";

      const cardWidth = card.offsetWidth;
      const cardHeight = card.offsetHeight;
      const usableWidthPx = (PRINT_PAGE.widthIn - PRINT_PAGE.marginIn * 2) * 96;
      const usableHeightPx = (PRINT_PAGE.heightIn - PRINT_PAGE.marginIn * 2) * 96;
      const scale = Math.min(usableWidthPx / cardWidth, usableHeightPx / cardHeight, 1);

      card.style.transformOrigin = "top left";
      card.style.transform = `scale(${scale})`;
      wrap.style.width = `${cardWidth * scale}px`;
      wrap.style.height = `${cardHeight * scale}px`;
    }

    function restoreInvoiceScale() {
      const wrap = wrapRef.current;
      const card = cardRef.current;
      if (!wrap || !card) return;
      card.style.animation = "";
      card.style.transform = "";
      card.style.transformOrigin = "";
      wrap.style.width = "";
      wrap.style.height = "";
    }

    window.addEventListener("beforeprint", fitInvoiceToOnePage);
    window.addEventListener("afterprint", restoreInvoiceScale);
    return () => {
      window.removeEventListener("beforeprint", fitInvoiceToOnePage);
      window.removeEventListener("afterprint", restoreInvoiceScale);
    };
  }, []);

  const handlePrint = () => window.print();

  // SAVE AS IMAGE — html2canvas renders CSS 3D transforms/perspective very
  // poorly (gradient/clipped text in particular can come out as a solid,
  // unreadable block). The invoice card's entrance animation is often still
  // live (or its ancestor's `perspective` still active) when this is clicked,
  // so briefly neutralize both, capture, then restore.
  const handleDownload = async () => {
    const card = cardRef.current;
    const wrap = wrapRef.current;
    if (!card || !wrap) return;

    const prevAnimation = card.style.animation;
    const prevTransform = card.style.transform;
    const prevPerspective = wrap.style.perspective;
    card.style.animation = "none";
    card.style.transform = "none";
    wrap.style.perspective = "none";

    try {
      // windowWidth forces html2canvas to lay the card out as if the
      // browser were this wide, regardless of the actual device — without
      // it, a phone-width capture renders the card cramped (its sm:
      // breakpoint padding never kicks in, text is tiny relative to the
      // image), so the saved image fills the recipient's whole screen
      // edge-to-edge instead of looking like a normal, easy-to-read
      // document. This makes every device produce the same well-
      // proportioned, desktop-quality image.
      const canvas = await html2canvas(card, { backgroundColor: "#ffffff", scale: 2, windowWidth: 900 });
      const link = document.createElement("a");
      link.download = `invoice-${invoice?.Id || "order"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      card.style.animation = prevAnimation;
      card.style.transform = prevTransform;
      wrap.style.perspective = prevPerspective;
    }
  };

  const handleShare = async () => {
    const invoiceId = invoice?.Id;
    if (!invoiceId) {
      Swal.fire({ title: "Load an invoice first", icon: "warning", theme: "dark", timer: 1600, showConfirmButton: false });
      return;
    }

    const token = await generateShareToken(invoiceId);
    const shareUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(invoiceId)}&token=${token}&share=1`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      Swal.fire({ title: "Read-only link copied!", text: shareUrl, icon: "success", theme: "dark", timer: 2200, showConfirmButton: false });
    } catch {
      Swal.fire({ title: "Copy this link", text: shareUrl, icon: "info", theme: "dark" });
    }
  };

  const handlePopupLoad = () => {
    const value = popupValue.trim();
    if (!value) {
      Swal.fire({ title: "Enter an invoice number", icon: "warning", theme: "dark", timer: 1400, showConfirmButton: false });
      return;
    }
    loadInvoice(value);
    setPopupOpen(false);
    setPopupValue("");
  };

  const cost = invoice ? toNumber(invoice.Cost) || 0 : 0;
  const itemList = invoice ? splitItems(invoice.Items) : [];
  const deposit = invoice ? toNumber(invoice.Deposit) : NaN;
  const hasDeposit = !isNaN(deposit) && deposit > 0;
  const totalDue = hasDeposit ? Math.max(cost - deposit, 0) : cost;

  return (
    <Layout blobs={["bg-brand-gold w-72 h-72 -top-10 -left-10 animate-float-slow no-print", "bg-brand-pink w-80 h-80 top-1/2 -right-16 animate-float no-print"]}>
      {!isShareView && (
        <NavRow className="no-print mb-6">
          <NavFab to="/" title="Order form" icon="fa-house" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
          <NavFab to="/search" title="Search orders" icon="fa-magnifying-glass" colorClass="text-brand-teal" glowClass="shadow-glow-teal" />
          <NavFab to="/updates" title="What's new" icon="fa-wand-magic-sparkles" colorClass="text-brand-goldlight" glowClass="shadow-glow-gold" />
        </NavRow>
      )}
      {!isShareView && (
        <div className="no-print flex gap-4 mb-2 flex-wrap justify-center stagger-in">
          <button className="btn-3d" onClick={handlePrint}>
            <i className="fa-solid fa-print"></i> Print
          </button>
          <button className="btn-3d" onClick={handleDownload}>
            <i className="fa-solid fa-download"></i> Save as Image
          </button>
          <button className="btn-3d" onClick={handleShare}>
            <i className="fa-solid fa-share-nodes"></i> Share
          </button>
        </div>
      )}
      {isShareView && (
        <p className="no-print text-xs uppercase tracking-widest text-brand-navylight/80 mb-6">
          <i className="fa-solid fa-lock"></i> View only &bull; ask Buffet Lucia Fiesta Mexicana for any changes
        </p>
      )}

      <div ref={wrapRef} className="tilt-wrap w-full max-w-3xl stagger-in">
        <div ref={cardRef} className="paper-card animate-unfold text-brand-navydeep p-8 sm:p-12 overflow-hidden">
          <div className="flex justify-between items-start gap-4 flex-wrap pb-6 border-b-2 border-brand-navydeep/10">
            <div className="flex items-center gap-3">
              <img src="/imgs/BLFM-logo.PNG" alt="Buffet Lucia Fiesta Mexicana logo" className="w-16 h-16 object-contain rounded-full ring-2 ring-brand-gold shadow" />
              <div>
                <p className="font-form text-2xl sm:text-3xl leading-tight text-brand-navy">Buffet Lucia Fiesta Mexicana</p>
                <p className="text-xs uppercase tracking-widest text-brand-navydeep/60">Auténtica Comida Mexicana &bull; Bronx, NY</p>
              </div>
            </div>
            <div className="text-sm text-right space-y-1 relative">
              <p>
                <span className="font-semibold text-brand-navydeep/70">Receipt #</span>{" "}
                {!isShareView && (
                  <i
                    className="fa-solid fa-magnifying-glass text-xs cursor-pointer hover:text-brand-gold no-print"
                    title="Look up another invoice"
                    onClick={() => setPopupOpen((v) => !v)}
                  ></i>
                )}{" "}
                <span className="font-semibold">{invoice?.Id ?? ""}</span>
              </p>
              <p>
                <span className="font-semibold text-brand-navydeep/70">Date</span> <span>{invoice?.Date ?? ""}</span>
              </p>
              <p>
                <span className="font-semibold text-brand-navydeep/70">Time</span> <span>{invoice?.Time ?? ""}</span>
              </p>
              <p>
                <span className="font-semibold text-brand-navydeep/70">Order Type</span> <span>{invoice?.PickupDelivery || "—"}</span>
              </p>
              {popupOpen && (
                <div className="no-print absolute z-20 top-full mt-2 left-1/2 -translate-x-1/2 glass-card !bg-white/95 p-3 flex flex-col gap-2 items-center shadow-depth-md">
                  <input
                    type="text"
                    className="w-28 text-black text-center placeholder:text-gray-500 rounded-lg border border-black/10 px-2 py-1"
                    placeholder="Invoice #"
                    value={popupValue}
                    onChange={(e) => setPopupValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handlePopupLoad()}
                  />
                  <button className="btn-3d !py-1.5 !px-4 text-sm" onClick={handlePopupLoad}>
                    Load
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6">
            <div className="rounded-xl bg-brand-canvas/60 border border-brand-navydeep/10 px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold mb-1">Bill To</p>
              <p className="font-form text-xl">{invoice?.Name ?? ""}</p>
              <p className="text-sm italic text-brand-navydeep/80">
                <i className="fa-solid fa-location-dot text-brand-coral"></i> {invoice?.Address ?? ""}
              </p>
              <p className="text-sm italic text-brand-navydeep/80">
                <i className="fa-solid fa-phone text-brand-teal"></i> {invoice?.Contact ?? ""}
              </p>
            </div>
          </div>

          <table className="w-full mt-6 text-sm">
            <thead>
              <tr className="border-b-2 border-brand-navydeep/20 text-left text-brand-navydeep/70">
                <th className="py-2 pr-2 w-14">Qty</th>
                <th className="py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {invoice && itemList.length > 0 && (
                <>
                  {itemList.map((item, i) => (
                    <tr
                      key={i}
                      className={`${i === itemList.length - 1 ? "border-b border-brand-navydeep/10" : ""} ${i % 2 === 1 ? "bg-brand-canvas/40" : ""}`}
                    >
                      <td className="py-1.5 pr-2 align-top">{item.qty}</td>
                      <td className="py-1.5">
                        <ul className="list-disc pl-4 marker:text-brand-navydeep/40">
                          <li>{item.text}</li>
                        </ul>
                      </td>
                    </tr>
                  ))}
                </>
              )}
              {invoice && itemList.length === 0 && (
                <tr className="border-b border-brand-navydeep/10">
                  <td className="py-2 pr-2 align-top">{invoice.Quantity || 1}</td>
                  <td className="py-2"></td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex justify-end mt-4">
            <div className="w-full sm:w-72 text-sm">
              {invoice && (
                <>
                  <div className="flex justify-between py-1 text-brand-navydeep/70">
                    <span>Subtotal</span>
                    <span>{formatMoney(cost)}</span>
                  </div>
                  {hasDeposit && (
                    <div className="flex justify-between py-1 text-brand-navydeep/70">
                      <span>Deposit paid</span>
                      <span>-{formatMoney(deposit)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-2 py-2.5 px-3 rounded-lg bg-brand-gold/10 font-bold text-base text-brand-navy">
                    <span>{hasDeposit ? "Balance Due" : "Total Due"}</span>
                    <span>{formatMoney(totalDue)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-between items-end gap-6 mt-10 flex-wrap">
            <div className="max-w-xs">
              <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold mb-1">Terms &amp; Conditions</p>
              <p className="text-xs text-brand-navydeep/70">
                El saldo restante se paga al momento de la entrega o recogida. Gracias por su preferencia <i className="fa-solid fa-hand-holding-heart"></i>
              </p>
            </div>
            <div className="text-right">
              <p className="font-form text-2xl text-brand-teal">Buffet Lucia</p>
              <p className="text-xs text-brand-navydeep/60 -mt-1">Fiesta Mexicana</p>
            </div>
          </div>

          <div className="flex flex-col items-center mt-8 pt-6 border-t border-brand-navydeep/10 text-center">
            <p className="text-xs text-brand-navydeep/70 max-w-xs">
              "Pequeño negocio, grandes gracias: ¡tu reseña significa el mundo para nosotros!"
            </p>
            <span className="flex items-center gap-4 mt-2">
              <a href="https://www.facebook.com/BuffetLuciasFiestaMExicana">
                <i className="fa-brands fa-facebook text-2xl text-blue-600 hover:text-blue-400"></i>
              </a>
              <a href="https://www.tiktok.com/@buffetluciasftamexicana?is_from_webapp=1&sender_device=pc">
                <i className="fa-brands fa-tiktok text-2xl text-cyan-600 hover:text-cyan-400"></i>
              </a>
              <a href="https://maps.app.goo.gl/BVCYcyCA5nvdb1as9">
                <i className="fa-solid fa-map-location-dot text-2xl text-green-700 hover:text-green-500"></i>
              </a>
              <a href="https://g.page/r/CRSDyjL1S-KyEBM/review">
                <img src="/imgs/google-review-qrCode.png" alt="Google review QR code" className="w-12 h-12" />
              </a>
            </span>
          </div>

          <div className="relative -mx-8 sm:-mx-12 -mb-8 sm:-mb-12 mt-8 h-36 sm:h-44 overflow-hidden select-none pointer-events-none">
            <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMax slice" className="w-full h-full">
              <g fill="#001A50" fillOpacity="0.12">
                <rect x="0" y="110" width="76" height="90" />
                <rect x="80" y="130" width="76" height="70" />
                <rect x="160" y="100" width="76" height="100" />
                <polygon points="160,100 198,80 236,100" />
                <rect x="240" y="140" width="76" height="60" />
                <rect x="320" y="115" width="76" height="85" />
                <rect x="400" y="125" width="76" height="75" />
                <rect x="480" y="105" width="76" height="95" />
                <polygon points="480,105 518,85 556,105" />
                <rect x="560" y="135" width="76" height="65" />
                <rect x="640" y="120" width="76" height="80" />
                <rect x="720" y="130" width="76" height="70" />
                <rect x="14" y="126" width="10" height="14" />
                <rect x="42" y="126" width="10" height="14" />
                <rect x="14" y="156" width="10" height="14" />
                <rect x="42" y="156" width="10" height="14" />
                <rect x="176" y="118" width="10" height="14" />
                <rect x="204" y="118" width="10" height="14" />
                <rect x="176" y="148" width="10" height="14" />
                <rect x="204" y="148" width="10" height="14" />
                <rect x="656" y="138" width="10" height="14" />
                <rect x="684" y="138" width="10" height="14" />
                <line x1="330" y1="140" x2="386" y2="140" stroke="#001A50" strokeWidth="3" />
                <line x1="330" y1="160" x2="386" y2="160" stroke="#001A50" strokeWidth="3" />
                <line x1="580" y1="150" x2="626" y2="150" stroke="#001A50" strokeWidth="3" />
              </g>
              <g fill="#001A50" fillOpacity="0.18">
                <line x1="345" y1="115" x2="336" y2="95" stroke="#001A50" strokeWidth="2" />
                <line x1="357" y1="115" x2="358" y2="95" stroke="#001A50" strokeWidth="2" />
                <rect x="336" y="78" width="24" height="20" rx="3" />
                <polygon points="333,78 363,78 348,64" />
                <line x1="665" y1="120" x2="656" y2="100" stroke="#001A50" strokeWidth="2" />
                <line x1="677" y1="120" x2="678" y2="100" stroke="#001A50" strokeWidth="2" />
                <rect x="656" y="83" width="24" height="20" rx="3" />
                <polygon points="653,83 683,83 668,69" />
              </g>
              <g stroke="#0288CB" strokeWidth="4" fill="none" opacity="0.55">
                <line x1="0" y1="200" x2="0" y2="150" />
                <line x1="100" y1="200" x2="100" y2="150" />
                <line x1="200" y1="200" x2="200" y2="150" />
                <line x1="300" y1="200" x2="300" y2="150" />
                <line x1="400" y1="200" x2="400" y2="150" />
                <line x1="500" y1="200" x2="500" y2="150" />
                <line x1="600" y1="200" x2="600" y2="150" />
                <line x1="700" y1="200" x2="700" y2="150" />
                <line x1="800" y1="200" x2="800" y2="150" />
                <line x1="0" y1="200" x2="100" y2="150" />
                <line x1="100" y1="200" x2="200" y2="150" />
                <line x1="200" y1="200" x2="300" y2="150" />
                <line x1="300" y1="200" x2="400" y2="150" />
                <line x1="400" y1="200" x2="500" y2="150" />
                <line x1="500" y1="200" x2="600" y2="150" />
                <line x1="600" y1="200" x2="700" y2="150" />
                <line x1="700" y1="200" x2="800" y2="150" />
                <line x1="100" y1="200" x2="0" y2="150" />
                <line x1="200" y1="200" x2="100" y2="150" />
                <line x1="300" y1="200" x2="200" y2="150" />
                <line x1="400" y1="200" x2="300" y2="150" />
                <line x1="500" y1="200" x2="400" y2="150" />
                <line x1="600" y1="200" x2="500" y2="150" />
                <line x1="700" y1="200" x2="600" y2="150" />
                <line x1="800" y1="200" x2="700" y2="150" />
              </g>
              <rect x="0" y="144" width="800" height="10" fill="#0288CB" opacity="0.55" />
              <g opacity="0.85">
                <rect x="250" y="118" width="200" height="26" rx="8" fill="#0288CB" />
                <rect x="266" y="124" width="26" height="12" rx="2" fill="#F7FAFF" />
                <rect x="300" y="124" width="26" height="12" rx="2" fill="#F7FAFF" />
                <rect x="334" y="124" width="26" height="12" rx="2" fill="#F7FAFF" />
                <rect x="368" y="124" width="26" height="12" rx="2" fill="#F7FAFF" />
                <rect x="402" y="124" width="26" height="12" rx="2" fill="#F7FAFF" />
                <circle cx="270" cy="146" r="6" fill="#001A50" />
                <circle cx="430" cy="146" r="6" fill="#001A50" />
              </g>
              <circle cx="758" cy="188" r="24" fill="#0055FF" />
              <text x="758" y="195" textAnchor="middle" fontFamily="Open Sans, sans-serif" fontWeight="700" fontSize="18" fill="#ffffff">
                BX
              </text>
            </svg>
          </div>
        </div>
      </div>
    </Layout>
  );
}
