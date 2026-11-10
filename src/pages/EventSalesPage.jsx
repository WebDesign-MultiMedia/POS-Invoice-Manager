import { useEffect, useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import MenuPicker from "../components/MenuPicker.jsx";
import CardPaymentForm from "../components/CardPaymentForm.jsx";
import DemoCardForm from "../components/DemoCardForm.jsx";
import { fetchAllEventSales, recordCardPayment, recordEventSale } from "../api/sheetdb.js";
import { toNumber, formatMoney, formatCardLabel, getCurrentDateTime } from "../lib/format.js";
import { formatCartLine } from "../lib/menu.js";
import { getBrand, getMenu } from "../lib/brand.js";
import { getStripe } from "../lib/stripeClient.js";
import { getTheme } from "../lib/theme.js";
import { isDemo } from "../lib/demo.js";
import { friendlyMessage } from "../lib/errors.js";
import { cartTotal as sumCart, toCents } from "../lib/totals.js";
import { cardPaymentsNewestFirst } from "../lib/recentOrder.js";
import { cashChange, newEventSaleId, quickCashOptions, summarizeSales } from "../lib/eventSales.js";

// Event Sales: checkout for a vendor event booth.
//   1. Build the order: tap menu items or type an amount, optional name.
//   2. Save order → the total, then take Card, Cash or Zelle.
//   3. Sale recorded in the "EventSales" sheet tab → next customer.
// Card sales are also logged to CardPayments like every other card charge,
// so they show in Recent card payments and the Order ID search.

const METHOD_ICONS = { Card: "fa-credit-card", Cash: "fa-money-bill-wave", Zelle: "fa-building-columns" };

export default function EventSalesPage() {
  const brand = getBrand();
  const MENU = getMenu();
  const MENU_ITEMS = Object.fromEntries(MENU.flatMap((c) => c.items).map((item) => [item.id, item]));

  // "order" → "pay" → "done"
  const [step, setStep] = useState("order");
  const [cart, setCart] = useState({});
  const [amountInput, setAmountInput] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [saleId, setSaleId] = useState(newEventSaleId);
  const [method, setMethod] = useState(null);
  const [cashInput, setCashInput] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [done, setDone] = useState(null);
  const [theme, setTheme] = useState(getTheme());

  // Keeps the Stripe card field's colors matched to the theme (see PayPage).
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const [sales, setSales] = useState({ rows: [], loading: true, error: false });
  useEffect(() => {
    let live = true;
    fetchAllEventSales()
      .then((rows) => live && setSales({ rows: cardPaymentsNewestFirst(rows), loading: false, error: false }))
      .catch((err) => {
        console.error("Couldn't load event sales:", err);
        if (live) setSales({ rows: [], loading: false, error: true });
      });
    return () => {
      live = false;
    };
  }, []);

  const changeQty = (id, delta) => {
    setCart((prev) => {
      const qty = Math.max(0, (prev[id] || 0) + delta);
      const next = { ...prev };
      if (qty > 0) next[id] = qty;
      else delete next[id];
      return next;
    });
  };

  const cartEntries = Object.entries(cart)
    .filter(([id]) => MENU_ITEMS[id])
    .map(([id, qty]) => ({ item: MENU_ITEMS[id], qty }));
  const hasCart = cartEntries.length > 0;
  const cartTotal = sumCart(cart, MENU_ITEMS);
  const total = hasCart ? cartTotal : toNumber(amountInput) || 0;
  const totalCents = toCents(total);
  // Same "1x Item ($5.00)" lines as CardPayments, so Search can read them.
  const itemsForSheet = cartEntries.map(({ item, qty }) => `${formatCartLine(item, qty)} (${formatMoney(item.price * qty)})`).join("\n");
  const receiptItemLines = cartEntries.map(({ item, qty }) => `${formatCartLine(item, qty)} — ${formatMoney(item.price * qty)}`).join("\n");
  const receiptDescription = `Order ID: ${saleId}\n${receiptItemLines ? `\n${receiptItemLines}` : ""}`;

  const change = cashChange(total, cashInput);

  const baseRow = () => {
    const { date, time } = getCurrentDateTime();
    return {
      Date: date,
      Time: time,
      SaleId: saleId,
      Name: customerName.trim(),
      Items: itemsForSheet,
      Note: note.trim(),
      Amount: total.toFixed(2),
      Fee: "0.00",
      Total: total.toFixed(2),
      Method: "",
      CashReceived: "",
      Change: "",
      Card: "",
      Funding: "",
      PaymentIntentId: "",
    };
  };

  const finish = (row, extra = {}) => {
    setSales((s) => ({ ...s, rows: [row, ...s.rows] }));
    setDone({ ...row, ...extra });
    setStep("done");
  };

  // Cash and Zelle: nothing is charged, so a failed save stays on this
  // screen to try again.
  const recordOffline = async (m) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const row = { ...baseRow(), Method: m };
    if (m === "Cash") {
      row.CashReceived = toNumber(cashInput).toFixed(2);
      row.Change = change.toFixed(2);
    }
    try {
      await recordEventSale(row);
      finish(row);
    } catch (err) {
      console.error("recordEventSale failed:", err);
      Swal.fire({ title: "Sale not saved", text: friendlyMessage(err, "The sale couldn't be saved. Try again."), icon: "error", theme: "dark" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Card: the charge already went through, so a failed save only warns.
  const handleCardPaid = async (result) => {
    const row = {
      ...baseRow(),
      Method: "Card",
      Amount: (result.baseAmountCents / 100).toFixed(2),
      Fee: (result.surchargeCents / 100).toFixed(2),
      Total: (result.totalCents / 100).toFixed(2),
      Card: formatCardLabel(result.cardBrand, result.cardLast4),
      Funding: result.funding,
      PaymentIntentId: result.id || "",
    };
    const cardRow = {
      Date: row.Date,
      Time: row.Time,
      Amount: row.Amount,
      Fee: row.Fee,
      Total: row.Total,
      Funding: row.Funding,
      Card: row.Card,
      PaymentIntentId: row.PaymentIntentId,
      Name: row.Name,
      Email: email,
      Phone: "",
      InvoiceId: saleId,
      Items: row.Items,
      Note: ["Event sale", row.Note].filter(Boolean).join(" — "),
    };
    const results = await Promise.allSettled([recordEventSale(row), recordCardPayment(cardRow)]);
    if (results.some((r) => r.status === "rejected")) {
      console.error("Event card sale logging failed:", results);
      Swal.fire({
        title: "Paid, but not added to the sheet",
        text: `The card payment went through. Write down Order ID ${saleId} and add it to the sheet later.`,
        icon: "warning",
        theme: "dark",
      });
    }
    finish(row, { receiptUrl: result.receiptUrl });
  };

  const nextCustomer = () => {
    setStep("order");
    setCart({});
    setAmountInput("");
    setCustomerName("");
    setNote("");
    setMethod(null);
    setCashInput("");
    setEmail("");
    setDone(null);
    setSaleId(newEventSaleId());
  };

  return (
    <Layout blobs={["bg-brand-terracotta w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-teal w-80 h-80 top-1/2 -left-16 animate-float"]}>
      <SiteNav className="mb-6" />
      <PageHeader title="Event Sales" subtitle={brand.name} />

      <div className="w-full max-w-md glass-card p-6 sm:p-8 stagger-in">
        {step === "order" && (
          <div className="flex flex-col gap-4">
            <MenuPicker menu={MENU} cart={cart} onChange={changeQty} onClear={() => setCart({})} total={cartTotal} />
            {!hasCart && (
              <div className="field-group">
                <label htmlFor="event-amount" className="field-label">
                  <i className="fa-solid fa-dollar-sign" aria-hidden="true"></i> Or enter the amount
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="input-3d text-lg"
                  id="event-amount"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
              </div>
            )}
            <div className="field-group">
              <label htmlFor="event-name" className="field-label">
                <i className="fa-solid fa-user" aria-hidden="true"></i> Customer name (optional)
              </label>
              <input type="text" className="input-3d" id="event-name" placeholder="e.g. Maria" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="event-note" className="field-label">
                <i className="fa-solid fa-note-sticky" aria-hidden="true"></i> Note (optional)
              </label>
              <input type="text" className="input-3d" id="event-note" placeholder="e.g. extra salsa" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button type="button" className="btn-3d justify-center text-lg disabled:opacity-60" disabled={totalCents <= 0} onClick={() => setStep("pay")}>
              <i className="fa-solid fa-floppy-disk"></i> Save order{totalCents > 0 ? ` · ${formatMoney(total)}` : ""}
            </button>
          </div>
        )}

        {step === "pay" && (
          <div className="flex flex-col gap-5">
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold">Total</p>
              <p className="font-form text-5xl tabular-nums mt-1">{formatMoney(total)}</p>
              {customerName.trim() && <p className="text-sm text-brand-navydeep/80 mt-1">{customerName.trim()}</p>}
              {hasCart && (
                <ul className="text-sm text-brand-navydeep/80 mt-2">
                  {cartEntries.map(({ item, qty }) => (
                    <li key={item.id}>
                      {formatCartLine(item, qty)} · {formatMoney(item.price * qty)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Payment method">
              {["Card", "Cash", "Zelle"].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  className={`glass-panel py-3 flex flex-col items-center gap-1 font-semibold border-2 transition-colors ${method === m ? "border-brand-gold" : "border-transparent"}`}
                  onClick={() => setMethod(m)}
                >
                  <i className={`fa-solid ${METHOD_ICONS[m]} text-xl`} aria-hidden="true"></i>
                  {m}
                </button>
              ))}
            </div>

            {method === "Cash" && (
              <div className="flex flex-col gap-3">
                <div className="field-group">
                  <label htmlFor="event-cash" className="field-label">
                    <i className="fa-solid fa-money-bill-wave" aria-hidden="true"></i> Cash received
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="input-3d text-lg"
                    id="event-cash"
                    placeholder="0.00"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickCashOptions(total).map((v, i) => (
                    <button key={v} type="button" className="glass-panel px-3 py-1.5 text-sm font-semibold" onClick={() => setCashInput(v.toFixed(2))}>
                      {i === 0 ? "Exact" : formatMoney(v)}
                    </button>
                  ))}
                </div>
                {cashInput !== "" && (
                  <p className={`glass-panel p-3 text-center font-semibold ${change == null ? "text-brand-terracotta" : ""}`}>
                    {change == null ? `Short ${formatMoney(total - (toNumber(cashInput) || 0))}` : `Change: ${formatMoney(change)}`}
                  </p>
                )}
                <button type="button" className="btn-3d justify-center disabled:opacity-60" disabled={change == null || saving} aria-busy={saving} onClick={() => recordOffline("Cash")}>
                  {saving ? "Saving…" : "Record cash sale"}
                </button>
              </div>
            )}

            {method === "Zelle" && (
              <div className="flex flex-col gap-3">
                {brand.zelle && (
                  // Always white behind the QR so bank apps can read it on every theme.
                  <div className="rounded-2xl bg-white text-neutral-900 p-4 flex flex-col items-center gap-2 text-center shadow-lg">
                    <p className="text-sm font-semibold">Scan in your bank's app to pay</p>
                    <p className="text-3xl font-bold">{formatMoney(total)}</p>
                    <img src={brand.zelle.qr} alt={`Zelle QR code to pay ${brand.zelle.payee}`} className="w-full max-w-[280px] aspect-square" />
                    <p className="text-sm">
                      Zelle to <span className="font-semibold">{brand.zelle.payee}</span> at {brand.zelle.phoneHint}
                    </p>
                  </div>
                )}
                <p className="glass-panel p-3 text-sm text-center">Check the {formatMoney(total)} Zelle payment arrived, then record it.</p>
                <button type="button" className="btn-3d justify-center disabled:opacity-60" disabled={saving} aria-busy={saving} onClick={() => recordOffline("Zelle")}>
                  {saving ? "Saving…" : "Zelle received · record sale"}
                </button>
              </div>
            )}

            {method === "Card" && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-brand-navydeep/75 text-center">Credit cards add a Card Processing Fee of up to 3.0%; debit cards are exempt.</p>
                <div className="field-group">
                  <label htmlFor="event-email" className="field-label">
                    <i className="fa-solid fa-envelope" aria-hidden="true"></i> Email for receipt (optional)
                  </label>
                  <input type="email" className="input-3d" id="event-email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {brand.demo ? (
                  <DemoCardForm baseAmountCents={totalCents} onPaid={handleCardPaid} />
                ) : (
                  <Elements stripe={getStripe()}>
                    <CardPaymentForm
                      baseAmountCents={totalCents}
                      invoiceId={saleId}
                      email={email}
                      description={receiptDescription}
                      note={note.trim() || undefined}
                      theme={theme}
                      onPaid={handleCardPaid}
                    />
                  </Elements>
                )}
              </div>
            )}

            <button type="button" className="text-sm text-brand-navydeep/75 underline self-center" onClick={() => setStep("order")}>
              Back to edit the order
            </button>
          </div>
        )}

        {step === "done" && done && (
          <div className="flex flex-col items-center gap-3 text-center">
            <i className="fa-solid fa-circle-check text-4xl text-emerald-600"></i>
            <p className="font-form text-xl">Sale recorded</p>
            <p className="font-form text-4xl tabular-nums">{formatMoney(toNumber(done.Total))}</p>
            <p className="text-sm text-brand-navydeep/80">
              {done.Method}
              {done.Card ? ` · ${done.Card}` : ""}
              {done.Name ? ` · ${done.Name}` : ""}
            </p>
            {done.Method === "Cash" && <p className="glass-panel px-4 py-2 font-semibold text-lg">Change: {formatMoney(toNumber(done.Change))}</p>}
            <p className="text-xs text-brand-navydeep/75">Order ID: {done.SaleId}</p>
            <div className="grid grid-cols-1 gap-3 w-full mt-2">
              <button type="button" className="btn-3d justify-center text-lg" onClick={nextCustomer}>
                <i className="fa-solid fa-user-plus"></i> Next customer
              </button>
              {done.receiptUrl && (
                <a href={done.receiptUrl} target="_blank" rel="noopener noreferrer" className="btn-3d justify-center">
                  <i className="fa-solid fa-receipt"></i> View receipt
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <TodaySales {...sales} />
    </Layout>
  );
}

const PAGE = 5;

// Today's totals (all, and by Card / Cash / Zelle) and today's sales.
function TodaySales({ rows, loading, error }) {
  const [shown, setShown] = useState(PAGE);
  if (loading) return null;
  const { date } = getCurrentDateTime();
  const today = rows.filter((r) => r.Date === date);
  const summary = summarizeSales(today);
  return (
    <section className="glass-card w-full max-w-md mt-8 p-5 sm:p-6 stagger-in" aria-label="Today's event sales">
      <h2 className="field-label !mb-3 justify-center">
        <i className="fa-solid fa-chart-simple" aria-hidden="true"></i> Today&apos;s sales
      </h2>
      {error ? (
        <p className="text-center text-sm text-brand-navydeep/80">Couldn&apos;t load today&apos;s sales. They&apos;ll show next time the page opens.</p>
      ) : (
        <>
          <div className="text-center mb-4">
            <p className="font-form text-4xl tabular-nums">{formatMoney(summary.total)}</p>
            <p className="text-sm text-brand-navydeep/80">
              {summary.count} {summary.count === 1 ? "sale" : "sales"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {Object.entries(summary.byMethod).map(([m, s]) => (
              <div key={m} className="glass-panel p-2 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-navydeep/80">
                  <i className={`fa-solid ${METHOD_ICONS[m]}`} aria-hidden="true"></i> {m}
                </p>
                <p className="font-semibold tabular-nums">{formatMoney(s.total)}</p>
                <p className="text-xs text-brand-navydeep/70">{s.count}</p>
              </div>
            ))}
          </div>
          {today.length > 0 && (
            <ul className="flex flex-col divide-y divide-brand-navydeep/15">
              {today.slice(0, shown).map((s, i) => (
                <SaleRow key={`${s.SaleId}-${i}`} sale={s} />
              ))}
            </ul>
          )}
          {today.length > shown && (
            <div className="flex justify-center mt-4">
              <button type="button" className="underline font-semibold text-sm text-brand-navy" onClick={() => setShown((n) => n + PAGE * 2)}>
                Show more ({today.length - shown} older)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SaleRow({ sale: s }) {
  const receipt = !isDemo() && /^pi_[A-Za-z0-9]+$/.test(s.PaymentIntentId || "") ? `/api/receipt-url?pi=${encodeURIComponent(s.PaymentIntentId)}` : null;
  const items = (s.Items || "")
    .split("\n")
    .map((l) => l.replace(/\s*\(\$[\d,.]+\)$/, "").trim())
    .filter(Boolean)
    .join(", ");
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2 min-w-0">
        <p className="font-semibold text-brand-navy truncate">
          {s.Name || "Walk-up customer"} · {formatMoney(toNumber(s.Total || s.Amount))}
        </p>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-brand-navydeep/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-navydeep/90">
          <i className={`fa-solid ${METHOD_ICONS[s.Method] || "fa-tag"}`} aria-hidden="true"></i> {s.Method}
        </span>
      </div>
      <p className="text-sm text-brand-navydeep/80">
        {s.Time} · {s.SaleId}
      </p>
      {items && <p className="text-xs text-brand-navydeep/70">{items}</p>}
      {receipt && (
        <a href={receipt} target="_blank" rel="noopener noreferrer" className="btn-3d !py-2 !px-4 text-sm whitespace-nowrap self-start mt-1">
          <i className="fa-solid fa-receipt" aria-hidden="true"></i> Receipt
        </a>
      )}
    </li>
  );
}
