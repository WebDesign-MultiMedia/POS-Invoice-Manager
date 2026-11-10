import { useEffect, useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import MenuPicker from "../components/MenuPicker.jsx";
import CardPaymentForm from "../components/CardPaymentForm.jsx";
import DemoCardForm from "../components/DemoCardForm.jsx";
import { deleteEventSale, fetchAllEventSales, payEventSale, recordCardPayment, recordEventSale, updateEventSale } from "../api/sheetdb.js";
import { RowButtons, RowEditor, SoldByTag, confirmAndDelete, useMakeInvoice } from "../components/RowActions.jsx";
import { saleToOrderForm } from "../lib/saleToOrder.js";
import { useAuth } from "../lib/auth.jsx";
import ZelleQrCard from "../components/ZelleQrCard.jsx";
import { toNumber, formatMoney, formatCardLabel, getCurrentDateTime } from "../lib/format.js";
import { formatCartLine } from "../lib/menu.js";
import { getBrand, getMenu } from "../lib/brand.js";
import { getStripe } from "../lib/stripeClient.js";
import { getTheme } from "../lib/theme.js";
import { isDemo } from "../lib/demo.js";
import { friendlyMessage } from "../lib/errors.js";
import { cartDeals, cartTotal as sumCart, toCents } from "../lib/totals.js";
import { cardPaymentsNewestFirst } from "../lib/recentOrder.js";
import { cashChange, isUnpaid, newEventSaleId, quickCashOptions, saleEdit, summarizeSales } from "../lib/eventSales.js";

// Event Sales: checkout for a vendor event booth.
//   1. Build the order: tap menu items or type an amount, optional name.
//   2. Save order → the total, then take Card, Cash or Zelle.
//   3. Sale recorded in the "EventSales" sheet tab → next customer.
// Card sales are also logged to CardPayments like every other card charge,
// so they show in Recent card payments and the Order ID search.

const METHOD_ICONS = { Card: "fa-credit-card", Cash: "fa-money-bill-wave", Zelle: "fa-building-columns", Later: "fa-clock" };
const METHOD_LABELS = { Later: "Pay later" };

// "1x Coffee ($2.50)" sheet lines → "1x Coffee — $2.50" for the receipt.
const receiptLines = (items) =>
  String(items || "")
    .split("\n")
    .map((l) => l.trim().replace(/\s*\((\$[\d,.]+)\)$/, " — $1"))
    .filter(Boolean)
    .join("\n");

export default function EventSalesPage() {
  const brand = getBrand();
  // Shown on the sale right away; the server stamps the real SoldBy itself.
  const { name: sellerName } = useAuth() || {};
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
  // An Unpaid ("Pay later") sale being paid now, or null for a new sale.
  const [paying, setPaying] = useState(null);
  const cardRef = useRef(null);
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
  // e.g. "Drinks 3 for $5" savings, shown as their own line on the sale.
  const dealsApplied = cartDeals(cart, MENU_ITEMS);
  const dealLabel = (d) => `${d.label}${d.sets > 1 ? ` ×${d.sets}` : ""}`;
  const total = paying ? toNumber(paying.Amount || paying.Total) : hasCart ? cartTotal : toNumber(amountInput) || 0;
  const activeSaleId = paying ? paying.SaleId : saleId;
  const totalCents = toCents(total);
  // Same "1x Item ($5.00)" lines as CardPayments, so Search can read them.
  const itemsForSheet = [
    ...cartEntries.map(({ item, qty }) => `${formatCartLine(item, qty)} (${formatMoney(item.price * qty)})`),
    ...dealsApplied.map((d) => `${dealLabel(d)} (-${formatMoney(d.savings)})`),
  ].join("\n");
  const receiptItemLines = [
    ...cartEntries.map(({ item, qty }) => `${formatCartLine(item, qty)} — ${formatMoney(item.price * qty)}`),
    ...dealsApplied.map((d) => `${dealLabel(d)} — -${formatMoney(d.savings)}`),
  ].join("\n");
  const paidItemLines = paying ? receiptLines(paying.Items) : receiptItemLines;
  const receiptDescription = `Order ID: ${activeSaleId}\n${paidItemLines ? `\n${paidItemLines}` : ""}`;

  const change = cashChange(total, cashInput);

  const baseRow = () => {
    const { date, time } = getCurrentDateTime();
    return {
      Date: date,
      Time: time,
      SaleId: saleId,
      SoldBy: sellerName || "",
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

  // Adds a new sale to the lists, or replaces the Unpaid one just paid.
  const finish = (row, extra = {}) => {
    setSales((s) => ({
      ...s,
      rows: s.rows.some((r) => r.SaleId === row.SaleId) ? s.rows.map((r) => (r.SaleId === row.SaleId ? row : r)) : [row, ...s.rows],
    }));
    setDone({ ...row, ...extra });
    setStep("done");
  };

  // Cash and Zelle: nothing is charged, so a failed save stays on this
  // screen to try again.
  const recordOffline = async (m) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const payment = { Method: m };
    if (m === "Cash") {
      payment.CashReceived = toNumber(cashInput).toFixed(2);
      payment.Change = change.toFixed(2);
    }
    try {
      if (paying) {
        const { fields } = await payEventSale(paying.SaleId, payment);
        finish({ ...paying, ...payment, ...fields });
      } else {
        const row = { ...baseRow(), ...payment, Status: "Paid" };
        await recordEventSale(row);
        finish(row);
      }
    } catch (err) {
      console.error("recordEventSale failed:", err);
      Swal.fire({ title: "Sale not saved", text: friendlyMessage(err, "The sale couldn't be saved. Try again."), icon: "error", theme: "dark" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // "Pay later": saved as Unpaid with the customer's name, to be paid from
  // the Unpaid list when they're ready.
  const savePayLater = async () => {
    if (savingRef.current) return;
    if (!customerName.trim()) {
      Swal.fire({ title: "Add the customer's name", text: "You'll use it to find their order when they come back to pay.", icon: "info", theme: "dark" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const row = { ...baseRow(), Status: "Unpaid" };
    try {
      await recordEventSale(row);
      finish(row);
    } catch (err) {
      console.error("recordEventSale (unpaid) failed:", err);
      Swal.fire({ title: "Order not saved", text: friendlyMessage(err, "The order couldn't be saved. Try again."), icon: "error", theme: "dark" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Card: the charge already went through, so a failed save only warns.
  const handleCardPaid = async (result) => {
    const payment = {
      Method: "Card",
      Fee: (result.surchargeCents / 100).toFixed(2),
      Total: (result.totalCents / 100).toFixed(2),
      Card: formatCardLabel(result.cardBrand, result.cardLast4),
      Funding: result.funding,
      PaymentIntentId: result.id || "",
    };
    const row = paying
      ? { ...paying, ...payment, Status: "Paid", PaidBy: sellerName || "" }
      : { ...baseRow(), ...payment, Status: "Paid", Amount: (result.baseAmountCents / 100).toFixed(2) };
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
      InvoiceId: row.SaleId,
      Items: row.Items,
      Note: ["Event sale", row.Note].filter(Boolean).join(" — "),
      SoldBy: row.SoldBy,
    };
    const save = paying ? payEventSale(paying.SaleId, payment) : recordEventSale(row);
    const results = await Promise.allSettled([save, recordCardPayment(cardRow)]);
    if (results.some((r) => r.status === "rejected")) {
      console.error("Event card sale logging failed:", results);
      Swal.fire({
        title: "Paid, but not added to the sheet",
        text: `The card payment went through. Write down Order ID ${row.SaleId} and add it to the sheet later.`,
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
    setPaying(null);
    setSaleId(newEventSaleId());
  };

  // "Take payment" on an Unpaid sale: open the payment step for it.
  const startPaying = (sale) => {
    nextCustomer();
    setPaying(sale);
    setCustomerName(sale.Name || "");
    setNote(sale.Note || "");
    setStep("pay");
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <Layout blobs={["bg-brand-terracotta w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-teal w-80 h-80 top-1/2 -left-16 animate-float"]}>
      <SiteNav className="mb-6" />
      <PageHeader title="Event Sales" subtitle={brand.name} />

      <UnpaidSales rows={sales.rows} payingId={paying?.SaleId} onPay={startPaying} onDeleted={(id) => setSales((s) => ({ ...s, rows: s.rows.filter((r) => r.SaleId !== id) }))} />

      <div ref={cardRef} className="w-full max-w-md glass-card p-6 sm:p-8 stagger-in scroll-mt-4">
        {step === "order" && (
          <div className="flex flex-col gap-4">
            <MenuPicker menu={MENU} cart={cart} onChange={changeQty} onClear={() => setCart({})} total={cartTotal} deals={dealsApplied} />
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
              {paying && (
                <p className="glass-panel !rounded-full px-4 py-1.5 mb-3 text-sm font-semibold text-brand-terracotta inline-block">
                  <i className="fa-solid fa-clock" aria-hidden="true"></i> Paying an unpaid order · {paying.SaleId}
                </p>
              )}
              <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold">Total</p>
              <p className="font-form text-5xl tabular-nums mt-1">{formatMoney(total)}</p>
              {customerName.trim() && <p className="text-sm text-brand-navydeep/80 mt-1">{customerName.trim()}</p>}
              {paying && paying.Items && (
                <ul className="text-sm text-brand-navydeep/80 mt-2">
                  {receiptLines(paying.Items)
                    .split("\n")
                    .map((line) => (
                      <li key={line}>{line.replace(" — ", " · ")}</li>
                    ))}
                </ul>
              )}
              {!paying && hasCart && (
                <ul className="text-sm text-brand-navydeep/80 mt-2">
                  {cartEntries.map(({ item, qty }) => (
                    <li key={item.id}>
                      {formatCartLine(item, qty)} · {formatMoney(item.price * qty)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`grid ${paying ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"} gap-2`} role="group" aria-label="Payment method">
              {(paying ? ["Card", "Cash", "Zelle"] : ["Card", "Cash", "Zelle", "Later"]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={method === m}
                  className={`glass-panel py-3 flex flex-col items-center gap-1 font-semibold border-2 transition-colors ${method === m ? "border-brand-gold" : "border-transparent"}`}
                  onClick={() => setMethod(m)}
                >
                  <i className={`fa-solid ${METHOD_ICONS[m]} text-xl`} aria-hidden="true"></i>
                  {METHOD_LABELS[m] || m}
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
                <ZelleQrCard amount={total} />
                <p className="glass-panel p-3 text-sm text-center">Check the {formatMoney(total)} Zelle payment arrived, then record it.</p>
                <button type="button" className="btn-3d justify-center disabled:opacity-60" disabled={saving} aria-busy={saving} onClick={() => recordOffline("Zelle")}>
                  {saving ? "Saving…" : "Zelle received · record sale"}
                </button>
              </div>
            )}

            {method === "Later" && (
              <div className="flex flex-col gap-3">
                <p className="glass-panel p-3 text-sm text-center">
                  The order is saved as <strong>Unpaid</strong>. When they come back, tap <strong>Take payment</strong> on it in the Unpaid list at the top.
                </p>
                <div className="field-group">
                  <label htmlFor="event-later-name" className="field-label">
                    <i className="fa-solid fa-user" aria-hidden="true"></i> Customer name (required)
                  </label>
                  <input type="text" className="input-3d" id="event-later-name" placeholder="e.g. Maria" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div className="field-group">
                  <label htmlFor="event-later-note" className="field-label">
                    <i className="fa-solid fa-note-sticky" aria-hidden="true"></i> How to spot them (optional)
                  </label>
                  <input type="text" className="input-3d" id="event-later-note" placeholder="e.g. red shirt, table 3" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button type="button" className="btn-3d justify-center disabled:opacity-60" disabled={saving || !customerName.trim()} aria-busy={saving} onClick={savePayLater}>
                  <i className="fa-solid fa-clock" aria-hidden="true"></i> {saving ? "Saving…" : "Save as unpaid"}
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
                      invoiceId={activeSaleId}
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

            <button type="button" className="text-sm text-brand-navydeep/75 underline self-center" onClick={() => (paying ? nextCustomer() : setStep("order"))}>
              {paying ? "Cancel, keep it unpaid" : "Back to edit the order"}
            </button>
          </div>
        )}

        {step === "done" && done && isUnpaid(done) && (
          <div className="flex flex-col items-center gap-3 text-center">
            <i className="fa-solid fa-clock text-4xl text-brand-terracotta"></i>
            <p className="font-form text-xl">Saved as unpaid</p>
            <p className="font-form text-4xl tabular-nums">{formatMoney(toNumber(done.Total))}</p>
            <p className="text-sm text-brand-navydeep/80">
              {done.Name}
              {done.Note ? ` · ${done.Note}` : ""}
            </p>
            <p className="text-xs text-brand-navydeep/75">It&apos;s in the Unpaid list at the top. Order ID: {done.SaleId}</p>
            <button type="button" className="btn-3d justify-center text-lg w-full mt-2" onClick={nextCustomer}>
              <i className="fa-solid fa-user-plus"></i> Next customer
            </button>
          </div>
        )}

        {step === "done" && done && !isUnpaid(done) && (
          <div className="flex flex-col items-center gap-3 text-center">
            <i className="fa-solid fa-circle-check text-4xl text-emerald-600"></i>
            <p className="font-form text-xl">{paying ? "Payment taken" : "Sale recorded"}</p>
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

      <TodaySales
        {...sales}
        onUpdated={(id, fields) => setSales((s) => ({ ...s, rows: s.rows.map((r) => (r.SaleId === id ? { ...r, ...fields } : r)) }))}
        onDeleted={(id) => setSales((s) => ({ ...s, rows: s.rows.filter((r) => r.SaleId !== id) }))}
      />
    </Layout>
  );
}

const PAGE = 5;

// Today's totals (all, and by Card / Cash / Zelle) and today's sales.
function TodaySales({ rows, loading, error, onUpdated, onDeleted }) {
  const [shown, setShown] = useState(PAGE);
  if (loading) return null;
  const { date } = getCurrentDateTime();
  const todayAll = rows.filter((r) => r.Date === date);
  const today = todayAll.filter((r) => !isUnpaid(r));
  const summary = summarizeSales(todayAll);
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
              {summary.count} {summary.count === 1 ? "sale" : "sales"} paid
            </p>
            {summary.unpaid.count > 0 && (
              <p className="mt-1 text-sm font-semibold text-brand-terracotta">
                <i className="fa-solid fa-clock" aria-hidden="true"></i> Unpaid: {summary.unpaid.count} · {formatMoney(summary.unpaid.total)} still owed
              </p>
            )}
          </div>
          {summary.bySeller.length > 0 && (
            <div className="glass-panel px-4 py-2.5 mb-4 w-fit max-w-full mx-auto" aria-label="Sales by person">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-navydeep/80 mb-1 text-center">
                <i className="fa-solid fa-user-tag" aria-hidden="true"></i> Rung up by
              </p>
              <ul className="flex flex-col gap-0.5">
                {summary.bySeller.map((p) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-6 text-sm">
                    <span className="font-semibold text-brand-navy truncate min-w-0">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-brand-navydeep/90">
                      {p.count} {p.count === 1 ? "sale" : "sales"} · <span className="font-semibold">{formatMoney(p.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                <SaleRow key={`${s.SaleId}-${i}`} sale={s} onUpdated={onUpdated} onDeleted={onDeleted} />
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

const TEXT_FIELDS = [
  { key: "Name", label: "Name", icon: "fa-user" },
  { key: "Items", label: "Items", icon: "fa-clipboard-list", type: "textarea" },
  { key: "Note", label: "Note", icon: "fa-note-sticky" },
];
const MONEY_FIELDS = [
  { key: "Method", label: "Paid with", icon: "fa-wallet", type: "select", options: ["Cash", "Zelle"] },
  { key: "Total", label: "Total", icon: "fa-dollar-sign", type: "money" },
];

function SaleRow({ sale: s, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  // Changing or removing sales needs "Can edit & delete"; Make invoice
  // needs the Order form (Team page). The server checks too.
  const { can = () => true } = useAuth() || {};
  const makeInvoice = useMakeInvoice();
  const receipt = !isDemo() && /^pi_[A-Za-z0-9]+$/.test(s.PaymentIntentId || "") ? `/api/receipt-url?pi=${encodeURIComponent(s.PaymentIntentId)}` : null;
  const isCard = s.Method === "Card";
  const fields = isCard ? TEXT_FIELDS : [...MONEY_FIELDS, ...TEXT_FIELDS];
  const key = /^EV-\d{6}-\d{6}$/.test(s.SaleId || "") ? s.SaleId : null;
  const items = (s.Items || "")
    .split("\n")
    .map((l) => l.replace(/\s*\(\$[\d,.]+\)$/, "").trim())
    .filter(Boolean)
    .join(", ");

  const remove = async () => {
    const gone = await confirmAndDelete({
      title: `Delete sale ${s.SaleId}?`,
      text: `${formatMoney(toNumber(s.Total || s.Amount))} (${s.Method}) will be removed from today's sales.${isCard ? " This does NOT refund the card. Refunds are done in Stripe, and the payment stays in Pay with Card's list." : ""}`,
      remove: () => deleteEventSale(key),
    });
    if (gone) onDeleted?.(key);
  };

  const save = async (values) => {
    const edit = saleEdit(s, values);
    await updateEventSale(key, edit);
    onUpdated?.(key, edit);
    setEditing(false);
  };

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
      {s.SoldBy && <SoldByTag name={s.SoldBy} />}
      {items && <p className="text-xs text-brand-navydeep/70">{items}</p>}
      <RowButtons
        label={`sale ${s.SaleId}`}
        onMakeInvoice={can("orders") ? () => makeInvoice(saleToOrderForm(s, s.Method || "Cash"), `event sale ${s.SaleId}`) : null}
        receiptHref={receipt}
        onEdit={key && can("manage") ? () => setEditing(true) : null}
        onDelete={key && can("manage") ? remove : null}
        editing={editing}
      />
      {editing && (
        <RowEditor
          idBase={`ev-${key}`}
          fields={fields}
          initial={{ ...Object.fromEntries(fields.map((f) => [f.key, String(s[f.key] ?? "")])), Total: toNumber(s.Total || s.Amount).toFixed(2) }}
          note={isCard ? `The amount (${formatMoney(toNumber(s.Total))}) can't change here: the card was already charged.` : null}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      )}
    </li>
  );
}

// "Pay later" orders not paid yet (any day), at the top of the page so
// nobody forgets them. Employees only get their own from the server.
function UnpaidSales({ rows, payingId, onPay, onDeleted }) {
  const { can = () => true } = useAuth() || {};
  const unpaid = rows.filter(isUnpaid);
  if (!unpaid.length) return null;
  const owed = unpaid.reduce((t, s) => t + toNumber(s.Total || s.Amount), 0);
  const remove = async (s) => {
    const gone = await confirmAndDelete({
      title: `Delete ${s.Name || "this"}'s unpaid order?`,
      text: `${formatMoney(toNumber(s.Total || s.Amount))} will be removed. Only do this if they left without paying.`,
      remove: () => deleteEventSale(s.SaleId),
    });
    if (gone) onDeleted?.(s.SaleId);
  };
  return (
    <section className="w-full max-w-md glass-card p-5 sm:p-6 mb-6 border-2 border-brand-terracotta/60 stagger-in" aria-label="Unpaid orders">
      <h2 className="field-label !mb-1 justify-center !text-brand-terracotta">
        <i className="fa-solid fa-clock" aria-hidden="true"></i> Unpaid · {unpaid.length} · {formatMoney(owed)}
      </h2>
      <p className="text-xs text-center text-brand-navydeep/75 mb-3">Orders saved with Pay later. Tap Take payment when they&apos;re ready.</p>
      <ul className="flex flex-col divide-y divide-brand-navydeep/15">
        {unpaid.map((s) => (
          <li key={s.SaleId} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-1">
            <p className="font-semibold text-brand-navy truncate">
              {s.Name || "No name"} · {formatMoney(toNumber(s.Total || s.Amount))}
            </p>
            <p className="text-sm text-brand-navydeep/80">
              {[s.Date !== getCurrentDateTime().date ? s.Date : "", s.Time, s.Note].filter(Boolean).join(" · ")}
            </p>
            {s.Items && <p className="text-xs text-brand-navydeep/70">{receiptLines(s.Items).replace(/ — \$[\d,.]+/g, "").split("\n").join(", ")}</p>}
            <SoldByTag name={s.SoldBy} />
            <div className={`grid ${can("manage") ? "grid-cols-2" : "grid-cols-1"} gap-2 mt-1`}>
              <button type="button" className="btn-3d !py-2 !px-2 text-sm justify-center disabled:opacity-60" disabled={payingId === s.SaleId} onClick={() => onPay(s)}>
                <i className="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> {payingId === s.SaleId ? "Paying…" : "Take payment"}
              </button>
              {can("manage") && (
                <button type="button" className="btn-3d !py-2 !px-2 text-sm justify-center !bg-none !bg-transparent border border-brand-error/60 text-brand-error" onClick={() => remove(s)}>
                  <i className="fa-solid fa-trash" aria-hidden="true"></i> Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
