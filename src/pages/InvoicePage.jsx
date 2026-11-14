import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import html2canvas from "html2canvas";
import Layout from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import { getInvoiceById, getCardPaymentsForInvoice, getShareToken, getSharedInvoice } from "../api/sheetdb.js";
import { toNumber, formatMoney, formatLongDate, splitItems } from "../lib/format.js";
import { getBrand } from "../lib/brand.js";
import { copyText } from "../lib/clipboard.js";
import { friendlyMessage } from "../lib/errors.js";
import { invoiceBalance } from "../lib/totals.js";
import { isCatering } from "../lib/orderOptions.js";

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
  // The restaurant's invoice is in Spanish (Figma Desktop frame 42:10); the
  // demo's made-up café keeps English.
  const t = brand.demo ? INVOICE_TEXT.en : INVOICE_TEXT.es;

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
          (node 42:10). Printing always uses the Desktop frame, sized to the
          printed page: every length has a print: twin in cqw (a share of
          the printed width; 100cqw = the 703px design), so the invoice fills
          the page width on any device. Phones measure px, rem and vw against
          their screen, not the page, so only cqw fits there. */}
      <div ref={wrapRef} data-receipt-wrap className="receipt-wrap tilt-wrap w-full max-w-[368px] sm:max-w-[703px] stagger-in print:w-full print:max-w-[100cqw]">
        <div ref={cardRef} className="paper-card receipt-card animate-unfold font-receipt px-4 pt-3.5 pb-0.5 sm:px-7 sm:pt-[19px] sm:pb-1 overflow-hidden print:px-[3.9829cqw] print:pt-[2.7027cqw] print:pb-[0.569cqw]">
          {/* Header: logo top-left; name, then tagline over a centred hairline */}
          <header className="relative">
            {brand.demo ? (
              <span className="absolute left-[-7px] top-0 sm:left-[-6px] w-[57px] h-[49px] sm:w-[100px] sm:h-[86px] flex items-center justify-center print:left-[-0.8535cqw] print:top-[0cqw] print:w-[14.2248cqw] print:h-[12.2333cqw]" aria-hidden="true">
                <i className="fa-solid fa-mug-saucer text-3xl sm:text-5xl receipt-accent print:text-[6.8279cqw] print:leading-none"></i>
              </span>
            ) : (
              <span className="absolute left-[-7px] top-0 sm:left-[-6px] w-[57px] h-[49px] sm:w-[100px] sm:h-[86px] overflow-hidden print:left-[-0.8535cqw] print:top-[0cqw] print:w-[14.2248cqw] print:h-[12.2333cqw]">
                <img
                  src="/imgs/invoice/blfm-logo.png"
                  alt={`${brand.name} logo`}
                  className="absolute max-w-none h-[106.51%] w-[121.83%] left-[-7.11%] top-[-5.33%] print:h-[106.51%] print:w-[121.83%] print:left-[-7.11%] print:top-[-5.33%]"
                />
              </span>
            )}
            <p className="relative pl-[49px] sm:pl-0 mt-1 sm:mt-3 text-center text-[20px] sm:text-[30px] leading-tight print:pl-[0cqw] print:mt-[1.707cqw] print:text-[4.2674cqw]">
              {brand.demo ? brand.name : "Buffet Lucia’s Fiesta Mexicana"}
            </p>
            <p className="relative mx-[29px] sm:mx-[58px] mt-0.5 sm:mt-1.5 pb-1.5 sm:pb-[7px] text-center text-[10px] sm:text-[15px] uppercase receipt-rule print:mx-[8.2504cqw] print:mt-[0.8535cqw] print:pb-[0.9957cqw] print:text-[2.1337cqw]">
              {brand.shortTagline} &bull; {brand.location}
            </p>
          </header>

          {/* Receipt #, date, order type, due/drop-off: label over the bold value.
              The time the order was taken stays in the sheet, not here. */}
          <dl
            className={`relative grid ${invoice?.DueDate || invoice?.DueTime ? "grid-cols-4" : "grid-cols-3"} gap-1 ml-6 mr-[30px] sm:ml-[49px] sm:mr-[60px] mt-[5px] sm:mt-2 text-[10px] sm:text-[15px] text-center uppercase print:gap-[0.569cqw] print:ml-[6.9701cqw] print:mr-[8.5349cqw] print:mt-[1.138cqw] print:text-[2.1337cqw]`}
          >
            {[
              [t.receipt, invoice?.Id, "receipt"],
              [t.date, invoice ? formatLongDate(invoice.Date) : ""],
              [t.orderType, invoice?.PickupDelivery || (invoice ? "—" : "")],
              ...(invoice?.DueDate || invoice?.DueTime ? [[isCatering(invoice.PickupDelivery) ? "Drop-off" : t.dueDate, [formatLongDate(invoice.DueDate), invoice.DueTime].filter(Boolean).join("\n")]] : []),
            ].map(([label, value, key]) => (
              <div key={label} className="flex flex-col items-center">
                <dt className="leading-tight">
                  {label}
                  {key === "receipt" && !isShareView && (
                    <button
                      type="button"
                      className="no-print ml-1 hover:text-[#3358b5] print:ml-[0.569cqw]"
                      title="Look up another invoice"
                      aria-label="Look up another invoice"
                      aria-expanded={popupOpen}
                      onClick={() => setPopupOpen((v) => !v)}
                    >
                      <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                    </button>
                  )}
                </dt>
                <dd className="min-h-[1.4em] mt-0.5 px-1 font-bold normal-case whitespace-pre-line print:mt-[0.2845cqw] print:px-[0.569cqw]">{value ?? ""}</dd>
              </div>
            ))}
            {popupOpen && (
              <div className="no-print absolute z-20 top-full mt-2 left-0 glass-card !bg-white/95 p-3 flex flex-col gap-2 items-center shadow-depth-md font-form normal-case print:top-full print:mt-[1.138cqw] print:left-[0cqw] print:p-[1.707cqw] print:gap-[1.138cqw]">
                <input
                  type="text"
                  className="w-28 text-base text-black text-center placeholder:text-gray-600 rounded-lg border border-black/10 px-2 py-1 print:w-[15.9317cqw] print:text-[2.276cqw] print:px-[1.138cqw] print:py-[0.569cqw]"
                  placeholder="Invoice #"
                  aria-label="Invoice number"
                  value={popupValue}
                  onChange={(e) => setPopupValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePopupLoad()}
                />
                <button className="btn-3d !py-1.5 !px-4 text-sm print:text-[1.9915cqw]" onClick={handlePopupLoad}>
                  Load
                </button>
              </div>
            )}
          </dl>

          {/* Bill to (indented, left) and, for the real restaurant, the SMS
              sign-up QR with its text beside it (right) */}
          <div className="flex items-start gap-3 sm:gap-6 mt-2 sm:mt-3 print:gap-[3.4139cqw] print:mt-[1.707cqw]">
            <div className="flex-1 min-w-0 ml-10 sm:ml-[79px] text-[10px] sm:text-[15px] print:ml-[11.2376cqw] print:text-[2.1337cqw]">
              <p>
                BILL TO {invoice?.Name && <span className="ml-1 font-bold print:ml-[0.569cqw]">{invoice.Name}</span>}
              </p>
              <p className="flex items-center gap-1.5 mt-0.5 sm:mt-1 print:gap-[0.8535cqw] print:mt-[0.569cqw]">
                <span className="relative w-[10px] h-[10px] sm:w-[19px] sm:h-4 shrink-0 flex justify-center print:w-[2.7027cqw] print:h-[2.276cqw]">
                  <span className="relative h-full w-[60%] sm:w-[11px] overflow-hidden print:h-full print:w-[1.5647cqw]">
                    <img
                      src="/imgs/invoice/pin.png"
                      alt="Address"
                      className="absolute max-w-none h-full w-[166.67%] left-[-33.33%] sm:w-[145.45%] sm:left-[-22.73%] top-0 print:h-full print:w-[145.45%] print:left-[-22.73%] print:top-[0cqw]"
                    />
                  </span>
                </span>
                <span>{invoice?.Address ?? ""}</span>
              </p>
              <p className="flex items-center gap-1.5 mt-0.5 sm:mt-1 print:gap-[0.8535cqw] print:mt-[0.569cqw]">
                <span className="relative w-[10px] h-[10px] sm:w-[19px] sm:h-4 shrink-0 overflow-hidden print:w-[2.7027cqw] print:h-[2.276cqw]">
                  <img
                    src="/imgs/invoice/phone.png"
                    alt="Phone"
                    className="absolute max-w-none w-full h-full left-0 top-0 sm:h-[118.75%] sm:top-[-9.375%] print:w-full print:h-[118.75%] print:left-[0cqw] print:top-[-9.375%]"
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
                className="flex items-start gap-[5px] sm:gap-[9px] shrink-0 mr-2 sm:-mr-1 text-[7px] sm:text-[10px] print:gap-[1.2802cqw] print:mr-[-0.569cqw] print:text-[1.4225cqw]"
              >
                <img src="/imgs/sms-signup-qrCode.png" alt="SMS specials sign-up QR code" className="w-9 h-9 sm:w-[63px] sm:h-[63px] shrink-0 print:w-[8.9616cqw] print:h-[8.9616cqw]" />
                <span className="block w-[134px] sm:w-[256px] sm:text-center [overflow-wrap:anywhere] print:w-[36.4154cqw] print:text-center">
                  <span className="block font-bold uppercase receipt-accent sm:text-[12px] print:text-[1.707cqw]">¡Recibe nuestras ofertas por texto!</span>
                  <span className="sm:text-[11px] print:text-[1.5647cqw]">Get our weekend specials by text. </span>
                  <span className="sm:block sm:mt-1 sm:font-bold sm:text-[13px] sm:text-[#3358b5] print:block print:mt-[0.569cqw] print:font-bold print:text-[1.8492cqw] print:text-[#3358b5]">Escanea o visita </span>
                  <span className="sm:block sm:text-[11px] print:block print:text-[1.5647cqw]">buffetluciasfiestamexicana.com/sms-consent (opcional).</span>
                </span>
              </a>
            )}
          </div>

          {/* Items: Qty | Description | Amount with hairline column rules */}
          <table className="w-[calc(100%-8px)] sm:w-[calc(100%-18px)] mt-5 sm:mt-8 text-[11px] sm:text-[15px] border-collapse print:w-[calc(100%-2.5605cqw)] print:mt-[4.5519cqw] print:text-[2.1337cqw]">
            <thead>
              <tr className="text-left receipt-rule sm:text-[20px] print:text-[2.845cqw]">
                <th className="font-normal pb-0.5 pl-1.5 sm:pl-3 pr-1 w-[52px] sm:w-[68px] print:pb-[0.2845cqw] print:pl-[1.707cqw] print:pr-[0.569cqw] print:w-[9.6728cqw]">{t.qty}</th>
                <th className="font-normal pb-0.5 px-1 print:pb-[0.2845cqw] print:px-[0.569cqw]">{t.description}</th>
                <th className="font-normal pb-0.5 pl-1 sm:pr-1.5 text-right w-[52px] sm:w-[110px] print:pb-[0.2845cqw] print:pl-[0.569cqw] print:pr-[0.8535cqw] print:w-[15.6472cqw]">{t.amount}</th>
              </tr>
            </thead>
            <tbody>
              {invoice &&
                (itemList.length > 0 ? itemList : [{ qty: invoice.Quantity || 1, text: "" }]).map((item, i, rows) => (
                  <tr key={i}>
                    <td className={`pl-1.5 sm:pl-3 pr-1 align-top print:pl-[1.707cqw] print:pr-[0.569cqw] ${i === 0 ? "pt-2 print:pt-[1.138cqw]" : "pt-0.5 print:pt-[0.2845cqw]"} ${i === rows.length - 1 ? "pb-4 print:pb-[2.276cqw]" : ""}`}>{item.qty}</td>
                    <td
                      className={`px-2 align-top border-x-[0.5px] border-black print:px-[1.138cqw] ${i === 0 ? "pt-2 print:pt-[1.138cqw]" : "pt-0.5 print:pt-[0.2845cqw]"} ${i === rows.length - 1 ? "pb-4 print:pb-[2.276cqw]" : ""}`}
                    >
                      {item.text}
                    </td>
                    {i === 0 && (
                      <td className="pl-1 sm:pr-1.5 pt-2 text-right align-top font-bold print:pl-[0.569cqw] print:pr-[0.8535cqw] print:pt-[1.138cqw]" rowSpan={rows.length}>
                        {formatMoney(cost)}
                      </td>
                    )}
                  </tr>
                ))}
              {!invoice && (
                <tr>
                  <td className="h-[63px] sm:h-[100px] print:h-[14.2248cqw]"></td>
                  <td className="border-x-[0.5px] border-black"></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Notes + totals: labels on the left, full-width rule above the balance */}
          {invoice && (
            <div className="mt-3 sm:mt-4 mr-2 sm:mr-[18px] text-[11px] sm:text-[15px] print:mt-[2.276cqw] print:mr-[2.5605cqw] print:text-[2.1337cqw]">
              {invoice.Notes && (
                <div className="mb-2 px-1.5 sm:px-3 print:mb-[1.138cqw] print:px-[1.707cqw]">
                  <p className="font-bold sm:text-[17px] print:text-[2.4182cqw]">{t.notes}</p>
                  <p className="whitespace-pre-line">{invoice.Notes}</p>
                </div>
              )}
              <div className="flex justify-between py-0.5 px-1.5 sm:px-3 print:py-[0.2845cqw] print:px-[1.707cqw]">
                <span>{t.subtotal}</span>
                <span>{formatMoney(cost)}</span>
              </div>
              {hasDeposit && (
                <div className="flex justify-between py-0.5 px-1.5 sm:px-3 print:py-[0.2845cqw] print:px-[1.707cqw]">
                  <span>{t.deposit}</span>
                  <span>-{formatMoney(deposit)}</span>
                </div>
              )}
              {cardPayments.map((p) => {
                const fee = toNumber(p.Fee) || 0;
                return (
                  <div key={p.PaymentIntentId || `${p.Date}-${p.Time}`} className="py-0.5 px-1.5 sm:px-3 print:py-[0.2845cqw] print:px-[1.707cqw]">
                    <div className="flex justify-between gap-2 print:gap-[1.138cqw]">
                      <span>
                        {p.Funding === "debit" ? t.debitPayment : t.creditPayment}{p.Card ? ` (${p.Card})` : ""} · {formatLongDate(p.Date)}
                      </span>
                      <span>-{formatMoney(p.Amount)}</span>
                    </div>
                    <p className="text-[9px] sm:text-xs text-black/70 print:text-[1.707cqw] print:leading-[1.333]">
                      {fee > 0 ? t.chargedWithFee(formatMoney(p.Total), formatMoney(fee)) : t.chargedNoFee(formatMoney(p.Total))}
                    </p>
                  </div>
                );
              })}
              <div className="flex justify-between pt-1 sm:pt-2 mt-0.5 px-1.5 sm:px-3 border-t-[0.5px] border-black font-bold sm:text-[17px] print:pt-[1.138cqw] print:mt-[0.2845cqw] print:px-[1.707cqw] print:text-[2.4182cqw]">
                <span>{hasPayments ? t.balanceDue : t.totalDue}</span>
                <span>{formatMoney(totalDue)}</span>
              </div>
            </div>
          )}

          {/* Footer. Phones (iPhone frame 41:3): terms beside the review
              quote + QR, the Welcome to the Bronx sign below. sm: and print
              (Desktop frame 42:10): the sign on the left; terms, quote and
              QR stacked on the right. The demo's café has no sign or QR. */}
          {brand.demo ? (
            <>
              <div className="mt-5 sm:mt-7 mx-auto max-w-[294px] text-[10px] sm:text-[15px] text-center print:mt-[3.9829cqw] print:max-w-[41.8208cqw] print:text-[2.1337cqw]">
                <p className="font-bold uppercase receipt-accent">{t.terms}</p>
                <p>Any remaining balance is due at delivery or pick-up. Thank you for your order!</p>
              </div>
              <p className="mt-8 mb-4 text-center text-[10px] sm:text-xs print:mt-[4.5519cqw] print:mb-[2.276cqw] print:text-[1.707cqw] print:leading-[1.333]">Thanks for trying the demo — this invoice belongs to a made-up business.</p>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-x-2 justify-items-center items-start mt-5 text-[10px] text-center sm:grid-cols-[352px_minmax(0,1fr)] sm:gap-x-3 sm:-ml-2.5 sm:mt-4 sm:mb-4 sm:text-[15px] print:grid-cols-[50.0711cqw_minmax(0,1fr)] print:gap-x-[1.707cqw] print:ml-[-1.4225cqw] print:mt-[2.276cqw] print:mb-[2.276cqw] print:text-[2.1337cqw]">
              <div className="col-start-1 row-start-1 w-full max-w-[154px] sm:col-start-2 sm:max-w-[294px] print:col-start-2 print:max-w-[41.8208cqw]">
                <p className="font-bold uppercase receipt-accent">{t.terms}</p>
                <p>El saldo restante se paga al momento de la entrega o recogida. Gracias por su preferencia</p>
              </div>
              <div className="break-inside-avoid col-start-2 row-start-1 w-full max-w-[163px] flex flex-col items-center sm:row-start-2 sm:max-w-[311px] sm:mt-6 print:row-start-2 print:max-w-[44.239cqw] print:mt-[3.4139cqw]">
                <p className="font-bold uppercase receipt-accent sm:text-[14px] print:text-[1.9915cqw]">
                  "Pequeño negocio, grandes gracias: ¡tu reseña significa el mundo para nosotros!"
                </p>
                <a href="https://g.page/r/CRSDyjL1S-KyEBM/review" className="block mt-0.5 leading-[0] bg-[#fefdfd] sm:mt-4 sm:p-1 print:mt-[2.276cqw] print:p-[0.569cqw]">
                  <img src="/imgs/google-review-qrCode.png" alt="Google review QR code" className="w-[51px] h-[51px] sm:w-[75px] sm:h-[74px] print:w-[10.6686cqw] print:h-[10.5263cqw]" />
                </a>
              </div>
              <span className="break-inside-avoid relative block col-span-2 row-start-2 mt-1.5 w-[205px] h-[126px] overflow-hidden sm:col-span-1 sm:col-start-1 sm:row-start-1 sm:row-span-2 sm:mt-0.5 sm:w-[352px] sm:h-[210px] print:col-span-1 print:col-start-1 print:row-start-1 print:row-span-2 print:mt-[0.2845cqw] print:w-[50.0711cqw] print:h-[29.872cqw]">
                <img
                  src="/imgs/invoice/welcome-bronx.png"
                  alt="Welcome to the Bronx: Buffet Lucia's Fiesta Mexicana"
                  className="absolute max-w-none left-0 w-full h-[162.77%] top-[-39.36%] sm:w-[102.27%] sm:h-[171.29%] sm:top-[-41.42%] print:left-[0cqw] print:w-[102.27%] print:h-[171.29%] print:top-[-41.42%]"
                />
              </span>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

// The invoice's words: Spanish for the restaurant (Figma frame 42:10),
// English for the demo's made-up café.
const INVOICE_TEXT = {
  es: {
    receipt: "Recibo #",
    date: "Fecha",
    orderType: "Tipo de pedido",
    dueDate: "Fecha de entrega",
    qty: "Qty",
    description: "Descripción",
    amount: "Cantidad",
    notes: "Notas",
    subtotal: "Total Parcial",
    deposit: "Depósito",
    creditPayment: "Pago con tarjeta de crédito",
    debitPayment: "Pago con tarjeta de débito",
    chargedWithFee: (total, fee) => `Cobrado ${total} (incluye ${fee} de cargo por tarjeta)`,
    chargedNoFee: (total) => `Cobrado ${total} (sin cargo por tarjeta)`,
    balanceDue: "Saldo deudor",
    totalDue: "Saldo deudor",
    terms: "Términos y condiciones",
  },
  en: {
    receipt: "Receipt #",
    date: "Date",
    orderType: "Order type",
    dueDate: "Due date",
    qty: "Qty",
    description: "Description",
    amount: "Amount",
    notes: "Notes",
    subtotal: "Subtotal",
    deposit: "Deposit Paid",
    creditPayment: "Credit card payment",
    debitPayment: "Debit card payment",
    chargedWithFee: (total, fee) => `Charged ${total} (incl. ${fee} card processing fee)`,
    chargedNoFee: (total) => `Charged ${total} (no card fee)`,
    balanceDue: "Balance Due",
    totalDue: "Total Due",
    terms: "Terms & Conditions",
  },
};
