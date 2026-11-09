import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import html2canvas from "html2canvas";
import Layout from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
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
            // The border is added outside the card's full desktop width
            // (703px + 2 × 32px) so the card isn't squeezed by it.
            w.style.padding = "32px";
            w.style.maxWidth = "767px";
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
        <SiteNav className="no-print mb-6" />
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

      {/* Receipt layout from the Figma file "POS Invoice Manager": phones
          follow the iPhone frame (node 41:3); sm: and up (desktop, and Save as
          Image, which renders at 900px wide) follow the Desktop frame
          (node 42:10). Printing always uses the Desktop frame: every sm:
          class has a matching print: class (in rem, not px, so the print CSS
          can scale the whole invoice to the page width), because phones
          print at their screen width and would otherwise print the narrow
          phone layout. */}
      <div ref={wrapRef} data-receipt-wrap className="receipt-wrap tilt-wrap w-full max-w-[368px] sm:max-w-[703px] print:max-w-[43.9375rem] stagger-in">
        <div ref={cardRef} className="paper-card receipt-card animate-unfold font-receipt px-4 pt-3.5 pb-0.5 sm:px-7 print:px-7 sm:pt-[19px] print:pt-[1.1875rem] sm:pb-1 print:pb-1 overflow-hidden">
          {/* Header: logo top-left; name, then tagline over a centred hairline */}
          <header className="relative">
            {brand.demo ? (
              <span className="absolute left-[-7px] top-0 sm:left-[-6px] print:left-[-0.375rem] w-[57px] h-[49px] sm:w-[100px] print:w-[6.25rem] sm:h-[86px] print:h-[5.375rem] flex items-center justify-center" aria-hidden="true">
                <i className="fa-solid fa-mug-saucer text-3xl sm:text-5xl print:text-5xl receipt-accent"></i>
              </span>
            ) : (
              <span className="absolute left-[-7px] top-0 sm:left-[-6px] print:left-[-0.375rem] w-[57px] h-[49px] sm:w-[100px] print:w-[6.25rem] sm:h-[86px] print:h-[5.375rem] overflow-hidden">
                <img
                  src="/imgs/invoice/blfm-logo.png"
                  alt={`${brand.name} logo`}
                  className="absolute max-w-none h-[106.51%] w-[121.83%] left-[-7.11%] top-[-5.33%]"
                />
              </span>
            )}
            <p className="relative pl-[49px] sm:pl-0 print:pl-0 mt-1 sm:mt-3 print:mt-3 text-center text-[20px] sm:text-[30px] print:text-[1.875rem] leading-tight">
              {brand.demo ? brand.name : "Buffet Lucia’s Fiesta Mexicana"}
            </p>
            <p className="relative mx-[29px] sm:mx-[58px] print:mx-[3.625rem] mt-0.5 sm:mt-1.5 print:mt-1.5 pb-1.5 sm:pb-[7px] print:pb-[0.4375rem] text-center text-[10px] sm:text-[15px] print:text-[0.9375rem] uppercase receipt-rule">
              {brand.shortTagline} &bull; {brand.location}
            </p>
          </header>

          {/* Receipt #, date, time, order type: label over the bold value */}
          <dl
            className={`relative grid ${invoice?.DueDate ? "grid-cols-5" : "grid-cols-4"} gap-1 ml-6 mr-[30px] sm:ml-[49px] print:ml-[3.0625rem] sm:mr-[60px] print:mr-[3.75rem] mt-[5px] sm:mt-2 print:mt-2 text-[10px] sm:text-[15px] print:text-[0.9375rem] text-center uppercase`}
          >
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

          {/* Bill to (indented, left) and, for the real restaurant, the SMS
              sign-up QR with its text beside it (right) */}
          <div className="flex items-start gap-3 sm:gap-6 print:gap-6 mt-2 sm:mt-3 print:mt-3">
            <div className="flex-1 min-w-0 ml-10 sm:ml-[79px] print:ml-[4.9375rem] text-[10px] sm:text-[15px] print:text-[0.9375rem]">
              <p>
                BILL TO {invoice?.Name && <span className="ml-1 font-bold">{invoice.Name}</span>}
              </p>
              <p className="flex items-center gap-1.5 mt-0.5 sm:mt-1 print:mt-1">
                <span className="relative w-[10px] h-[10px] sm:w-[19px] print:w-[1.1875rem] sm:h-4 print:h-4 shrink-0 flex justify-center">
                  <span className="relative h-full w-[60%] sm:w-[11px] print:w-[0.6875rem] overflow-hidden">
                    <img
                      src="/imgs/invoice/pin.png"
                      alt="Address"
                      className="absolute max-w-none h-full w-[166.67%] left-[-33.33%] sm:w-[145.45%] print:w-[145.45%] sm:left-[-22.73%] print:left-[-22.73%] top-0"
                    />
                  </span>
                </span>
                <span>{invoice?.Address ?? ""}</span>
              </p>
              <p className="flex items-center gap-1.5 mt-0.5 sm:mt-1 print:mt-1">
                <span className="relative w-[10px] h-[10px] sm:w-[19px] print:w-[1.1875rem] sm:h-4 print:h-4 shrink-0 overflow-hidden">
                  <img
                    src="/imgs/invoice/phone.png"
                    alt="Phone"
                    className="absolute max-w-none w-full h-full left-0 top-0 sm:h-[118.75%] print:h-[118.75%] sm:top-[-9.375%] print:top-[-9.375%]"
                  />
                </span>
                <span>{invoice?.Contact ?? ""}</span>
              </p>
            </div>
            {/* Promo texts only go to customers who opt in on the website's
                sign-up page, so the invoice points them there. */}
            {!brand.demo && (
              <a
                href="https://buffetluciasfiestamexicana.com/sms-consent/"
                className="flex items-start gap-[5px] sm:gap-[9px] print:gap-[0.5625rem] shrink-0 mr-2 sm:-mr-1 print:-mr-1 text-[7px] sm:text-[10px] print:text-[0.625rem]"
              >
                <img src="/imgs/sms-signup-qrCode.png" alt="SMS specials sign-up QR code" className="w-9 h-9 sm:w-[63px] print:w-[3.9375rem] sm:h-[63px] print:h-[3.9375rem] shrink-0" />
                <span className="block w-[134px] sm:w-[256px] print:w-[16rem] [overflow-wrap:anywhere]">
                  <span className="block font-bold uppercase receipt-accent">¡Recibe nuestras ofertas por texto!</span>
                  Get our weekend specials by text. Escanea o visita buffetluciasfiestamexicana.com/sms-consent (opcional).
                </span>
              </a>
            )}
          </div>

          {/* Items: Qty | Description | Amount with hairline column rules */}
          <table className="w-[calc(100%-8px)] sm:w-[calc(100%-18px)] print:w-[calc(100%-1.125rem)] mt-5 sm:mt-8 print:mt-8 text-[11px] sm:text-[15px] print:text-[0.9375rem] border-collapse">
            <thead>
              <tr className="text-left receipt-rule sm:text-[20px] print:text-[1.25rem]">
                <th className="font-normal pb-0.5 pl-1.5 sm:pl-3 print:pl-3 pr-1 w-[52px] sm:w-[68px] print:w-[4.25rem]">Qty</th>
                <th className="font-normal pb-0.5 px-1">Description</th>
                <th className="font-normal pb-0.5 pl-1 sm:pr-1.5 print:pr-1.5 text-right w-[52px] sm:w-[110px] print:w-[6.875rem]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice &&
                (itemList.length > 0 ? itemList : [{ qty: invoice.Quantity || 1, text: "" }]).map((item, i, rows) => (
                  <tr key={i}>
                    <td className={`pl-1.5 sm:pl-3 print:pl-3 pr-1 align-top ${i === 0 ? "pt-2" : "pt-0.5"} ${i === rows.length - 1 ? "pb-4" : ""}`}>{item.qty}</td>
                    <td
                      className={`px-2 align-top border-x-[0.5px] border-black ${i === 0 ? "pt-2" : "pt-0.5"} ${i === rows.length - 1 ? "pb-4" : ""}`}
                    >
                      {item.text}
                    </td>
                    {i === 0 && (
                      <td className="pl-1 sm:pr-1.5 print:pr-1.5 pt-2 text-right align-top font-bold" rowSpan={rows.length}>
                        {formatMoney(cost)}
                      </td>
                    )}
                  </tr>
                ))}
              {!invoice && (
                <tr>
                  <td className="h-[63px] sm:h-[100px] print:h-[6.25rem]"></td>
                  <td className="border-x-[0.5px] border-black"></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Notes + totals: labels on the left, full-width rule above the balance */}
          {invoice && (
            <div className="mt-3 sm:mt-4 print:mt-4 mr-2 sm:mr-[18px] print:mr-[1.125rem] text-[11px] sm:text-[15px] print:text-[0.9375rem]">
              {invoice.Notes && (
                <div className="mb-2 px-1.5 sm:px-3 print:px-3">
                  <p className="font-bold uppercase receipt-accent">Notes</p>
                  <p className="whitespace-pre-line">{invoice.Notes}</p>
                </div>
              )}
              <div className="flex justify-between py-0.5 px-1.5 sm:px-3 print:px-3">
                <span>Subtotal</span>
                <span>{formatMoney(cost)}</span>
              </div>
              {hasDeposit && (
                <div className="flex justify-between py-0.5 px-1.5 sm:px-3 print:px-3">
                  <span>Deposit Paid</span>
                  <span>-{formatMoney(deposit)}</span>
                </div>
              )}
              {cardPayments.map((p) => {
                const fee = toNumber(p.Fee) || 0;
                return (
                  <div key={p.PaymentIntentId || `${p.Date}-${p.Time}`} className="py-0.5 px-1.5 sm:px-3 print:px-3">
                    <div className="flex justify-between gap-2">
                      <span>
                        {p.Funding === "debit" ? "Debit" : "Credit"} card payment{p.Card ? ` (${p.Card})` : ""} · {p.Date}
                      </span>
                      <span>-{formatMoney(p.Amount)}</span>
                    </div>
                    <p className="text-[9px] sm:text-xs print:text-xs text-black/70">
                      {fee > 0
                        ? `Charged ${formatMoney(p.Total)} (incl. ${formatMoney(fee)} card processing fee)`
                        : `Charged ${formatMoney(p.Total)} (no card fee)`}
                    </p>
                  </div>
                );
              })}
              <div className="flex justify-between pt-1 sm:pt-2 print:pt-2 mt-0.5 px-1.5 sm:px-3 print:px-3 border-t-[0.5px] border-black font-bold sm:text-[17px] print:text-[1.0625rem]">
                <span>{hasPayments ? "Balance Due" : "Total Due"}</span>
                <span>{formatMoney(totalDue)}</span>
              </div>
            </div>
          )}

          {/* Terms (left) and the review quote + QR (right), both centred
              in their half and starting on the same line */}
          <div className="grid grid-cols-2 gap-x-2 justify-items-center items-start mt-5 sm:mt-7 print:mt-7 text-[10px] sm:text-[15px] print:text-[0.9375rem] text-center">
            <div className="w-full max-w-[154px] sm:max-w-[294px] print:max-w-[18.375rem]">
              <p className="font-bold uppercase receipt-accent">Terms &amp; Conditions</p>
              <p>
                {brand.demo
                  ? "Any remaining balance is due at delivery or pick-up. Thank you for your order!"
                  : "El saldo restante se paga al momento de la entrega o recogida. Gracias por su preferencia"}
              </p>
            </div>
            {/* The review QR and the Welcome to the Bronx sign belong to the
                real restaurant; the demo's sample café skips them. */}
            {!brand.demo && (
              <div className="break-inside-avoid w-full max-w-[163px] sm:max-w-[311px] print:max-w-[19.4375rem] flex flex-col items-center">
                <p className="font-bold uppercase receipt-accent">
                  "Pequeño negocio, grandes gracias: ¡tu reseña significa el mundo para nosotros!"
                </p>
                <a href="https://g.page/r/CRSDyjL1S-KyEBM/review" className="block mt-0.5 sm:mt-1 print:mt-1 leading-[0]">
                  <img src="/imgs/google-review-qrCode.png" alt="Google review QR code" className="w-[51px] h-[51px] sm:w-[83px] print:w-[5.1875rem] sm:h-[83px] print:h-[5.1875rem]" />
                </a>
              </div>
            )}
          </div>

          {brand.demo ? (
            <p className="mt-8 mb-4 text-center text-[10px] sm:text-xs print:text-xs">Thanks for trying the demo — this invoice belongs to a made-up business.</p>
          ) : (
            <span className="break-inside-avoid relative block mx-auto mt-1.5 sm:mt-0.5 print:mt-0.5 w-[205px] h-[126px] sm:w-[352px] print:w-[22rem] sm:h-[210px] print:h-[13.125rem] overflow-hidden">
              <img
                src="/imgs/invoice/welcome-bronx.png"
                alt="Welcome to the Bronx: Buffet Lucia's Fiesta Mexicana"
                className="absolute max-w-none left-0 w-full h-[162.77%] top-[-39.36%] sm:w-[102.27%] print:w-[102.27%] sm:h-[171.29%] print:h-[171.29%] sm:top-[-41.42%] print:top-[-41.42%]"
              />
            </span>
          )}
        </div>
      </div>
    </Layout>
  );
}
