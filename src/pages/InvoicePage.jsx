import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import html2canvas from "html2canvas";
import Layout from "../components/Layout.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import { getInvoiceById, getCardPaymentsForInvoice, getShareToken, getSharedInvoice } from "../api/sheetdb.js";
import { toNumber, formatMoney, splitItems } from "../lib/format.js";
import { getBrand } from "../lib/brand.js";
import { copyText } from "../lib/clipboard.js";
import { friendlyMessage } from "../lib/errors.js";
import { invoiceBalance } from "../lib/totals.js";

export default function InvoicePage() {
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("id");
  const shareToken = searchParams.get("token");
  const isShareView = searchParams.get("share") === "1";

  const [invoice, setInvoice] = useState(null);
  const [cardPayments, setCardPayments] = useState([]);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupValue, setPopupValue] = useState("");
  // Shown in place of a blank invoice when a customer's link can't load.
  const [loadError, setLoadError] = useState("");

  const wrapRef = useRef(null);
  const cardRef = useRef(null);

  const loadInvoice = async (invoiceId) => {
    try {
      const row = await getInvoiceById(invoiceId);
      if (!row) {
        console.warn("No invoice found for Id:", invoiceId);
        Swal.fire({ title: "Invoice not found", text: `No order matches #${invoiceId}`, icon: "warning", theme: "dark", timer: 2200, showConfirmButton: false });
        return;
      }
      setInvoice(row);
      // Best-effort: if this lookup fails the invoice still shows, just
      // without the card payment lines.
      try {
        setCardPayments(await getCardPaymentsForInvoice(row.Id));
      } catch (err) {
        console.error("Error loading card payments:", err);
        setCardPayments([]);
      }
    } catch (err) {
      console.error("Error loading invoice:", err);
      Swal.fire({ title: "Couldn't load the invoice", text: friendlyMessage(err, "The invoice couldn't be loaded."), icon: "error", theme: "dark" });
    }
  };

  useEffect(() => {
    if (!preselectedId) {
      // Demo: open on a sample order instead of a blank invoice.
      if (brand.demo) loadInvoice("1001");
      return;
    }
    if (isShareView) {
      // Customer links carry a server-signed token for this one invoice;
      // the server refuses the request if the id or token was changed.
      getSharedInvoice(preselectedId, shareToken)
        .then((shared) => {
          if (!shared) {
            console.warn("Invalid or missing share token for invoice:", preselectedId);
            setLoadError(`This invoice link isn't valid. Please ask ${getBrand().name} to send it again.`);
            return;
          }
          setInvoice(shared.invoice);
          setCardPayments(shared.cardPayments || []);
        })
        .catch((err) => {
          console.error("Error loading shared invoice:", err);
          setLoadError(friendlyMessage(err, "This invoice couldn't be loaded right now."));
        });
    } else {
      loadInvoice(preselectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedId, isShareView, shareToken]);

  // Font Awesome's icon glyphs (the location pin, phone, etc.) sometimes
  // haven't finished loading the very first time a page prints, which prints
  // them as blank space instead of the icon — waiting on document.fonts.ready
  // avoids that race.
  const handlePrint = () => {
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => window.print());
    } else {
      window.print();
    }
  };

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
    // Webfonts and images must be ready, or the image gets fallback text
    // and blank picture slots.
    await document.fonts?.ready;
    await Promise.all(
      [...card.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))),
    );

    // html2canvas measures where text sits using a 1x1 GIF placed inline in
    // the live page; Tailwind's base `img { display: block }` knocks it onto
    // its own line, and every line of text then gets drawn a few pixels low
    // (through the rules). This style matches only that measuring image and
    // is removed right after the capture.
    const metricsFix = document.createElement("style");
    metricsFix.textContent = 'img[src^="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"] { display: inline !important; }';
    document.head.appendChild(metricsFix);

    try {
      // windowWidth forces html2canvas to lay the card out as if the
      // browser were this wide, regardless of the actual device — without
      // it, a phone-width capture renders the card cramped (its sm:
      // breakpoint padding never kicks in, text is tiny relative to the
      // image), so the saved image fills the recipient's whole screen
      // edge-to-edge instead of looking like a normal, easy-to-read
      // document. This makes every device produce the same well-
      // proportioned, desktop-quality image.
      // The design frames the receipt on blue (#3358b5): capture the
      // wrapper with that border so the saved image looks the same.
      const canvas = await html2canvas(wrap, {
        backgroundColor: "#3358b5",
        scale: 2,
        windowWidth: 900,
        useCORS: true,
        onclone: (doc) => {
          // Only affects html2canvas's copy of the page: entrance animations
          // restart in the copy and would be caught mid-fade (a washed-out
          // card), so pin everything fully shown; staff-only controls (the
          // lookup button) stay out of the customer's image.
          const fix = doc.createElement("style");
          fix.textContent = `*, *::before, *::after { animation: none !important; transition: none !important; }
            .stagger-in, .animate-unfold, .paper-card, .tilt-wrap { opacity: 1 !important; transform: none !important; translate: none !important; }
            .no-print { display: none !important; }`;
          doc.head.appendChild(fix);
          const w = doc.querySelector("[data-receipt-wrap]");
          if (w) {
            w.style.padding = "32px";
            w.style.background = "#3358b5";
          }
        },
      });
      const link = document.createElement("a");
      link.download = `invoice-${invoice?.Id || "order"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      metricsFix.remove();
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

    let token;
    try {
      token = await getShareToken(invoiceId);
    } catch {
      Swal.fire({ title: "Couldn't make a share link", text: "Check your connection and try again.", icon: "error", theme: "dark" });
      return;
    }
    const shareUrl = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(invoiceId)}&token=${token}&share=1`;

    // In the demo the link only works in this browser (the sample data
    // lives here), so say so instead of implying a customer could open it.
    const demoNote = getBrand().demo ? " (Demo: this link only opens in this browser.)" : "";
    if (await copyText(shareUrl)) {
      Swal.fire({ title: "Read-only link copied!", text: shareUrl + demoNote, icon: "success", theme: "dark", timer: 2600, showConfirmButton: false });
    } else {
      Swal.fire({ title: "Copy this link", text: shareUrl + demoNote, icon: "info", theme: "dark" });
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

  const brand = getBrand();
  const itemList = invoice ? splitItems(invoice.Items) : [];
  // Card payments reduce the balance by their base Amount; the processing
  // fee was paid on top and never counts toward the order (lib/totals.js).
  const { cost, deposit, hasDeposit, balanceDue: totalDue } = invoiceBalance(invoice, cardPayments);
  const hasPayments = hasDeposit || cardPayments.length > 0;

  return (
    <Layout blobs={["bg-brand-gold w-72 h-72 -top-10 -left-10 animate-float-slow no-print", "bg-brand-pink w-80 h-80 top-1/2 -right-16 animate-float no-print"]}>
      {!isShareView && (
        <NavRow className="no-print mb-6">
          <NavFab to="/" title="Order form" icon="fa-house" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
          <NavFab to="/search" title="Search orders" icon="fa-magnifying-glass" colorClass="text-brand-teal" glowClass="shadow-glow-teal" />
          <NavFab to="/updates" title="What's new" icon="fa-wand-magic-sparkles" colorClass="text-brand-goldlight" glowClass="shadow-glow-gold" />
          <NavFab to="/pay" title="Pay with Card" icon="fa-credit-card" colorClass="text-brand-cactus" glowClass="shadow-glow-teal" />
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
          <i className="fa-solid fa-lock"></i> View only &bull; ask {brand.name} for any changes
        </p>
      )}

      {loadError && (
        <p role="alert" className="no-print glass-panel w-full max-w-3xl p-4 mb-6 text-center font-semibold text-brand-error">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {loadError}
        </p>
      )}

      {/* Receipt layout from the Figma design "POS Invoice Manager" (node 41:3).
          Sizes follow the phone frame; sm: scales them up for wider screens
          and for Save as Image (rendered at 900px wide). */}
      <div ref={wrapRef} data-receipt-wrap className="receipt-wrap tilt-wrap w-full max-w-2xl stagger-in">
        <div ref={cardRef} className="paper-card receipt-card animate-unfold font-receipt px-4 py-5 sm:px-10 sm:py-10 overflow-hidden">
          {/* Header: logo, name, tagline, hairline */}
          <header className="flex items-start gap-2 sm:gap-4">
            {brand.demo ? (
              <span className="w-[57px] h-[49px] sm:w-24 sm:h-20 shrink-0 flex items-center justify-center" aria-hidden="true">
                <i className="fa-solid fa-mug-saucer text-3xl sm:text-5xl receipt-accent"></i>
              </span>
            ) : (
              <span className="relative w-[57px] h-[49px] sm:w-24 sm:h-[82.5px] shrink-0 overflow-hidden">
                <img
                  src="/imgs/invoice/blfm-logo.png"
                  alt={`${brand.name} logo`}
                  className="absolute max-w-none h-[106.51%] w-[121.83%] left-[-7.11%] top-[-5.33%]"
                />
              </span>
            )}
            <div className="flex-1 min-w-0 pt-2 sm:pt-3 text-center">
              <p className="text-[15px] sm:text-2xl leading-tight">{brand.demo ? brand.name : "Buffet Lucia’s Fiesta Mexicana"}</p>
              <p className="text-[10px] sm:text-sm uppercase mt-0.5 pb-1 receipt-rule">
                {brand.shortTagline} &bull; {brand.location}
              </p>
            </div>
          </header>

          {/* Receipt #, date, time, order type: label over a short underline */}
          <dl className={`relative grid ${invoice?.DueDate ? "grid-cols-5" : "grid-cols-4"} gap-2 mt-2 sm:mt-4 text-[10px] sm:text-sm text-center uppercase`}>
            {[
              ["Receipt #", invoice?.Id],
              ["Date", invoice?.Date],
              ["Time", invoice?.Time],
              ["Order type", invoice?.PickupDelivery || (invoice ? "—" : "")],
              ...(invoice?.DueDate ? [["Due date", invoice.DueDate]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col items-center">
                <dt className="whitespace-nowrap">
                  {label}
                  {label === "Receipt #" && !isShareView && (
                    <button
                      type="button"
                      className="no-print ml-1 hover:text-[#3358b5]"
                      title="Look up another invoice"
                      aria-label="Look up another invoice"
                      aria-expanded={popupOpen}
                      onClick={() => setPopupOpen((v) => !v)}
                    >
                      <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    </button>
                  )}
                </dt>
                <dd className="min-h-[1.4em] mt-0.5 px-1 font-bold normal-case">{value ?? ""}</dd>
              </div>
            ))}
            {popupOpen && (
              <div className="no-print absolute z-20 top-full mt-2 left-0 glass-card !bg-white/95 p-3 flex flex-col gap-2 items-center shadow-depth-md font-form normal-case">
                <input
                  type="text"
                  className="w-28 text-base text-black text-center placeholder:text-gray-600 rounded-lg border border-black/10 px-2 py-1"
                  placeholder="Invoice #"
                  aria-label="Invoice number"
                  value={popupValue}
                  onChange={(e) => setPopupValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePopupLoad()}
                />
                <button className="btn-3d !py-1.5 !px-4 text-sm" onClick={handlePopupLoad}>
                  Load
                </button>
              </div>
            )}
          </dl>

          {/* Bill to */}
          <div className="mt-2 sm:mt-4 text-[10px] sm:text-sm">
            <p>
              BILL TO {invoice?.Name && <span className="ml-1 font-bold">{invoice.Name}</span>}
            </p>
            <p className="flex items-center gap-1.5 mt-0.5">
              <span className="relative w-[10px] h-[10px] sm:w-3.5 sm:h-3.5 shrink-0 flex justify-center">
                <span className="relative h-full w-[60%] overflow-hidden">
                  <img src="/imgs/invoice/pin.png" alt="Address" className="absolute max-w-none h-full w-[166.67%] left-[-33.33%] top-0" />
                </span>
              </span>
              <span>{invoice?.Address ?? ""}</span>
            </p>
            <p className="flex items-center gap-1.5 mt-0.5">
              <img src="/imgs/invoice/phone.png" alt="Phone" className="w-[10px] h-[10px] sm:w-3.5 sm:h-3.5 shrink-0" />
              <span>{invoice?.Contact ?? ""}</span>
            </p>
          </div>

          {/* Items: Qty | Description | Amount with hairline column rules */}
          <table className="w-full mt-5 sm:mt-6 text-[11px] sm:text-sm border-collapse">
            <thead>
              <tr className="text-left receipt-rule">
                <th className="font-normal pb-0.5 pr-1 w-[30px] sm:w-12">Qty</th>
                <th className="font-normal pb-0.5 px-1">Description</th>
                <th className="font-normal pb-0.5 pl-1 text-right w-[52px] sm:w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice &&
                (itemList.length > 0 ? itemList : [{ qty: invoice.Quantity || 1, text: "" }]).map((item, i, rows) => (
                  <tr key={i}>
                    <td className={`pr-1 align-top ${i === 0 ? "pt-2" : "pt-0.5"} ${i === rows.length - 1 ? "pb-4" : ""}`}>{item.qty}</td>
                    <td
                      className={`px-2 align-top border-x-[0.5px] border-black ${i === 0 ? "pt-2" : "pt-0.5"} ${i === rows.length - 1 ? "pb-4" : ""}`}
                    >
                      {item.text}
                    </td>
                    {i === 0 && (
                      <td className="pl-1 pt-2 text-right align-top font-bold" rowSpan={rows.length}>
                        {formatMoney(cost)}
                      </td>
                    )}
                  </tr>
                ))}
              {!invoice && (
                <tr>
                  <td className="h-[63px]"></td>
                  <td className="border-x-[0.5px] border-black"></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Notes + totals */}
          {invoice && (
            <div className="flex flex-wrap items-start gap-4 mt-3 text-[10px] sm:text-sm">
              {invoice.Notes && (
                <div className="flex-1 min-w-[140px]">
                  <p className="font-bold uppercase receipt-accent">Notes</p>
                  <p className="whitespace-pre-line">{invoice.Notes}</p>
                </div>
              )}
              <div className="w-full sm:w-72 ml-auto">
                <div className="flex justify-between py-0.5">
                  <span>Subtotal</span>
                  <span>{formatMoney(cost)}</span>
                </div>
                {hasDeposit && (
                  <div className="flex justify-between py-0.5">
                    <span>Deposit paid</span>
                    <span>-{formatMoney(deposit)}</span>
                  </div>
                )}
                {cardPayments.map((p) => {
                  const fee = toNumber(p.Fee) || 0;
                  return (
                    <div key={p.PaymentIntentId || `${p.Date}-${p.Time}`} className="py-0.5">
                      <div className="flex justify-between gap-2">
                        <span>
                          {p.Funding === "debit" ? "Debit" : "Credit"} card payment{p.Card ? ` (${p.Card})` : ""} · {p.Date}
                        </span>
                        <span>-{formatMoney(p.Amount)}</span>
                      </div>
                      <p className="text-[9px] sm:text-xs text-black/70">
                        {fee > 0
                          ? `Charged ${formatMoney(p.Total)} (incl. ${formatMoney(fee)} card processing fee)`
                          : `Charged ${formatMoney(p.Total)} (no card fee)`}
                      </p>
                    </div>
                  );
                })}
                <div className="flex justify-between pt-1 mt-1 border-t-[0.5px] border-black font-bold text-[12px] sm:text-base">
                  <span>{hasPayments ? "Balance Due" : "Total Due"}</span>
                  <span>{formatMoney(totalDue)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Terms */}
          <div className="mt-8 sm:mt-10 max-w-[172px] sm:max-w-xs text-[7px] sm:text-xs">
            <p className="font-bold uppercase receipt-accent">Terms &amp; Conditions</p>
            <p>
              {brand.demo
                ? "Any remaining balance is due at delivery or pick-up. Thank you for your order!"
                : "El saldo restante se paga al momento de la entrega o recogida. Gracias por su preferencia"}
            </p>
          </div>

          {/* Review QR, SMS sign-up and the Welcome to the Bronx sign belong
              to the real restaurant, so the demo's sample café shows a plain
              thank-you instead. */}
          {brand.demo ? (
            <p className="mt-8 text-center text-[10px] sm:text-xs">Thanks for trying the demo — this invoice belongs to a made-up business.</p>
          ) : (
            <div className="flex items-center gap-2 sm:gap-6 mt-6 sm:mt-8">
              <div className="flex-1 min-w-0 flex flex-col items-center text-[7px] sm:text-xs">
                <p className="font-bold uppercase text-center receipt-accent">
                  "Pequeño negocio, grandes gracias: ¡tu reseña significa el mundo para nosotros!"
                </p>
                <a href="https://g.page/r/CRSDyjL1S-KyEBM/review" className="block mt-1 sm:mt-2 leading-[0]">
                  <img src="/imgs/google-review-qrCode.png" alt="Google review QR code" className="w-[51px] h-[51px] sm:w-20 sm:h-20" />
                </a>
                {/* Promo texts only go to customers who opt in on the website's
                    sign-up page, so the invoice points them there. */}
                <a href="https://buffetluciasfiestamexicana.com/sms-consent/" className="flex items-center gap-2 sm:gap-3 self-stretch mt-2 sm:mt-4">
                  <img src="/imgs/sms-signup-qrCode.png" alt="SMS specials sign-up QR code" className="w-[51px] h-[51px] sm:w-20 sm:h-20 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="block font-bold uppercase receipt-accent">¡Recibe nuestras ofertas por texto!</span>
                    Get our weekend specials by text. Escanea o visita buffetluciasfiestamexicana.com/sms-consent (opcional).
                  </span>
                </a>
              </div>
              <span className="relative block w-[177px] h-[109px] sm:w-72 sm:h-[177.4px] shrink-0 overflow-hidden">
                <img
                  src="/imgs/invoice/welcome-bronx.png"
                  alt="Welcome to the Bronx: Buffet Lucia's Fiesta Mexicana"
                  className="absolute max-w-none w-full h-[162.77%] left-0 top-[-39.36%]"
                />
              </span>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
