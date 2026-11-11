import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Elements } from "@stripe/react-stripe-js";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import MenuPicker from "../components/MenuPicker.jsx";
import CardPaymentForm from "../components/CardPaymentForm.jsx";
import DemoCardForm from "../components/DemoCardForm.jsx";
import { deleteEventSale, editUnpaidSale, fetchAllEventSales, payEventSale, recordCardPayment, recordEventSale, updateEventSale } from "../api/sheetdb.js";
import { ROW_OUTLINE_BUTTON, RowButtons, RowEditor, confirmAndDelete, useMakeInvoice } from "../components/RowActions.jsx";
import { saleToOrderForm } from "../lib/saleToOrder.js";
import { useAuth } from "../lib/auth.jsx";
import ZelleQrCard from "../components/ZelleQrCard.jsx";
import TextReceiptButton from "../components/TextReceipt.jsx";
import { fetchZelleAlerts } from "../api/zelle.js";
import { toNumber, formatMoney, formatCardLabel, getCurrentDateTime } from "../lib/format.js";
import { formatCartLine, qtyStep } from "../lib/menu.js";
import { getBrand, getMenu } from "../lib/brand.js";
import { getStripe } from "../lib/stripeClient.js";
import { getTheme } from "../lib/theme.js";
import { isDemo } from "../lib/demo.js";
import { friendlyMessage } from "../lib/errors.js";
import { cartDeals, cartTotal as sumCart, toCents } from "../lib/totals.js";
import { cardPaymentsNewestFirst } from "../lib/recentOrder.js";
import { cartFromItems, cashChange, isUnpaid, newEventSaleId, quickCashOptions, saleEdit, summarizeSales } from "../lib/eventSales.js";

// Event Sales: checkout for a vendor event booth.
//   1. Build the order: tap menu items or type an amount, optional name.
//   2. Pay now → Card, Cash or Zelle; or Save order → Unpaid, paid later.
//   3. Sale recorded in the "EventSales" sheet tab → next customer.
// Phones get one column; tablets and computers get a full-screen register.
// Card sales are also logged to CardPayments like every other card charge,
// so they show in Recent card payments and the Order ID search.

const METHOD_ICONS = { Card: "fa-credit-card", Cash: "fa-money-bill-wave", Zelle: "fa-building-columns" };

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// "1x Coffee ($2.50)" sheet lines → "1x Coffee — $2.50" for the receipt.
const receiptLines = (items) =>
  String(items || "")
    .split("\n")
    .map((l) => l.trim().replace(/\s*\((\$[\d,.]+)\)$/, " — $1"))
    .filter(Boolean)
    .join("\n");

// Tablets and computers (768px and up) get the full-screen register
// layout; phones keep the one-column page.
const WIDE = "(min-width: 768px)";
const wideNow = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(WIDE).matches);
function useWideScreen() {
  const [wide, setWide] = useState(wideNow);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return;
    const onChange = () => setWide(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return wide;
}

export default function EventSalesPage() {
  const brand = getBrand();
  // Shown on the sale right away; the server stamps the real SoldBy itself.
  const { name: sellerName, isEmployee } = useAuth() || {};
  const MENU = getMenu();
  const MENU_ITEMS = Object.fromEntries(MENU.flatMap((c) => c.items).map((item) => [item.id, item]));

  // "order" → "pay" → "done"
  const [step, setStep] = useState("order");
  const [cart, setCart] = useState({});
  // Optional per-dish notes, { [menuItemId]: "no onion" }.
  const [dishNotes, setDishNotes] = useState({});
  const setDishNote = (id, text) => setDishNotes((prev) => ({ ...prev, [id]: text }));
  const clearCart = () => {
    setCart({});
    setDishNotes({});
  };
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
  // An Unpaid sale opened with Edit (its order back in the register), or null.
  const [editing, setEditing] = useState(null);
  const cardRef = useRef(null);
  const [theme, setTheme] = useState(getTheme());

  // Full screen: Unpaid, the order and Today's sales in a popup over the
  // page (like the catering calculator), so nothing else is in the way.
  // Opens by itself for employees; the X (or Esc) closes it, and the
  // "Open full screen" button brings it back. The page behind is locked
  // while it's open.
  // Tablets and computers get the register layout and open it by itself
  // for everyone; phones open it for employees only.
  const wide = useWideScreen();
  const [fullOpen, setFullOpen] = useState(() => Boolean(isEmployee) || wideNow());
  // Register layout tabs: "order", "unpaid", "today".
  const [posTab, setPosTab] = useState("order");
  const openFullRef = useRef(null);
  useEffect(() => {
    if (!fullOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const before = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !Swal.isVisible()) setFullOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = before.html;
      body.style.overflow = before.body;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullOpen]);
  const closeFull = () => {
    setFullOpen(false);
    requestAnimationFrame(() => openFullRef.current?.focus({ preventScroll: true }));
  };

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
    if ((cart[id] || 0) + delta <= 0) setDishNotes(({ [id]: _gone, ...rest }) => rest);
  };

  const cartEntries = Object.entries(cart)
    .filter(([id]) => MENU_ITEMS[id])
    .map(([id, qty]) => ({ item: MENU_ITEMS[id], qty, note: dishNotes[id] || "" }));
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
    ...cartEntries.map(({ item, qty, note }) => `${formatCartLine(item, qty, note)} (${formatMoney(item.price * qty)})`),
    ...dealsApplied.map((d) => `${dealLabel(d)} (-${formatMoney(d.savings)})`),
  ].join("\n");
  const receiptItemLines = [
    ...cartEntries.map(({ item, qty, note }) => `${formatCartLine(item, qty, note)} — ${formatMoney(item.price * qty)}`),
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
  // extra: for a Zelle confirmed by Chase's email, { ZelleRef, ZelleFrom }.
  const recordOffline = async (m, extra = {}) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const payment = { Method: m, ...extra };
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

  // "Save order" (pay later): saved as Unpaid with the customer's name, to
  // be paid from the Unpaid list when they're ready. Asks for the name if
  // it wasn't typed, since that's how they're found again.
  const savePayLater = async () => {
    if (savingRef.current) return;
    let name = customerName.trim();
    if (!name) {
      const { value, isConfirmed } = await Swal.fire({
        title: "Customer's name",
        text: "You'll use it to find their order when they come back to pay.",
        input: "text",
        inputPlaceholder: "e.g. Maria",
        showCancelButton: true,
        confirmButtonText: "Save order",
        theme: "dark",
        inputValidator: (v) => (String(v || "").trim() ? undefined : "Enter a name"),
      });
      if (!isConfirmed) return;
      name = String(value).trim();
      setCustomerName(name);
    }
    savingRef.current = true;
    setSaving(true);
    const row = { ...baseRow(), Name: name, Status: "Unpaid" };
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
    clearCart();
    setAmountInput("");
    setCustomerName("");
    setNote("");
    setMethod(null);
    setCashInput("");
    setEmail("");
    setDone(null);
    setPaying(null);
    setEditing(null);
    setSaleId(newEventSaleId());
  };

  // "Edit" on an Unpaid order: its dishes and notes go back in the order so
  // staff can tap to add more, change amounts or notes, then Save changes.
  const startEditing = async (sale) => {
    const { cart: loaded, notes: loadedNotes, unknown } = cartFromItems(sale.Items, Object.values(MENU_ITEMS));
    if (unknown.length) {
      const { isConfirmed } = await Swal.fire({
        title: "Some items aren't on the menu",
        html: `These can't be edited here and will be <b>removed</b> if you save:<br><br>${unknown.map((l) => escapeHtml(l)).join("<br>")}`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Edit anyway",
        cancelButtonText: "Keep it as is",
        theme: "dark",
      });
      if (!isConfirmed) return;
    }
    nextCustomer();
    setEditing(sale);
    setCart(loaded);
    setDishNotes(loadedNotes);
    if (!Object.keys(loaded).length) setAmountInput(toNumber(sale.Total || sale.Amount).toFixed(2));
    setCustomerName(sale.Name || "");
    setNote(sale.Note || "");
    setPosTab("order");
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const saveEdit = async () => {
    if (savingRef.current || !editing) return;
    const name = customerName.trim();
    if (!name) {
      Swal.fire({ title: "Customer's name", text: "An unpaid order needs the customer's name.", icon: "warning", theme: "dark" });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const { fields } = await editUnpaidSale(editing.SaleId, { Name: name, Items: itemsForSheet, Note: note.trim(), Total: total.toFixed(2) });
      const id = editing.SaleId;
      setSales((s) => ({ ...s, rows: s.rows.map((r) => (r.SaleId === id ? { ...r, ...fields } : r)) }));
      nextCustomer();
      setPosTab("unpaid");
      Swal.fire({ title: "Order updated", text: `${name}'s order is now ${formatMoney(total)}.`, icon: "success", timer: 1600, showConfirmButton: false, theme: "dark" });
    } catch (err) {
      console.error("editUnpaidSale failed:", err);
      Swal.fire({ title: "Changes not saved", text: friendlyMessage(err, "The order couldn't be updated. Try again."), icon: "error", theme: "dark" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // While editing: who's order this is, instead of a new sale.
  const editBanner = editing && (
    <div className="rounded-xl border-2 border-brand-terracotta/60 bg-brand-terracotta/10 px-3 py-2 text-sm">
      <p className="font-semibold text-brand-navy">
        <i className="fa-solid fa-pen-to-square text-brand-terracotta" aria-hidden="true"></i> Editing {editing.Name || "this"}&apos;s unpaid order
      </p>
      <p className="text-xs text-brand-navydeep/75">Add or change dishes, then Save changes. Was {formatMoney(toNumber(editing.Total || editing.Amount))}.</p>
    </div>
  );
  const editButtons = (big) =>
    editing && (
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={`btn-3d justify-center !px-3 ${big ? "!py-4 text-lg" : ""} !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy`} disabled={saving} onClick={nextCustomer}>
          Cancel
        </button>
        <button type="button" className={`btn-3d justify-center !px-3 ${big ? "!py-4 text-lg" : ""} disabled:opacity-60`} disabled={totalCents <= 0 || saving} aria-busy={saving} onClick={saveEdit}>
          <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i> {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    );

  // "Take payment" on an Unpaid sale: open the payment step for it.
  const startPaying = (sale) => {
    nextCustomer();
    setPaying(sale);
    setCustomerName(sale.Name || "");
    setNote(sale.Note || "");
    setStep("pay");
    setPosTab("order");
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Pay (Card / Cash / Zelle) and the done screens: in the order card on
  // phones, in the ticket panel of the register layout on bigger screens.
  const checkoutSteps = (
    <>
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
                  {cartEntries.map(({ item, qty, note }) => (
                    <li key={item.id}>
                      {formatCartLine(item, qty, note)} · {formatMoney(item.price * qty)}
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
                <ZelleQrCard amount={total} />
                <ZelleWatcher amount={total} saving={saving} onMatch={(alert) => recordOffline("Zelle", { ZelleRef: alert.id, ZelleFrom: alert.from || "" })} />
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
            {done.ZelleRef && (
              <p className="text-sm font-semibold text-emerald-600">
                <i className="fa-solid fa-envelope-circle-check" aria-hidden="true"></i> Confirmed by Chase&apos;s Zelle email{done.ZelleFrom ? ` · from ${done.ZelleFrom}` : ""}
              </p>
            )}
            {done.Method === "Cash" && <p className="glass-panel px-4 py-2 font-semibold text-lg">Change: {formatMoney(toNumber(done.Change))}</p>}
            <p className="text-xs text-brand-navydeep/75">Order ID: {done.SaleId}</p>
            <div className="grid grid-cols-1 gap-3 w-full mt-2">
              <button type="button" className="btn-3d justify-center text-lg" onClick={nextCustomer}>
                <i className="fa-solid fa-user-plus"></i> Next customer
              </button>
              <TextReceiptButton sale={done} receiptUrl={done.receiptUrl || null} className="btn-3d justify-center" />
              {done.receiptUrl && (
                <a href={done.receiptUrl} target="_blank" rel="noopener noreferrer" className="btn-3d justify-center">
                  <i className="fa-solid fa-receipt"></i> View receipt
                </a>
              )}
            </div>
          </div>
        )}
    </>
  );

  const unpaidCount = sales.rows.filter(isUnpaid).length;
  const removeRow = (id) => setSales((s) => ({ ...s, rows: s.rows.filter((r) => r.SaleId !== id) }));
  const updateRow = (id, fields) => setSales((s) => ({ ...s, rows: s.rows.map((r) => (r.SaleId === id ? { ...r, ...fields } : r)) }));

  // Unpaid list, the order card and Today's sales: shown in the page, or
  // in the full-screen popup on phones.
  const salesScreen = (
    <>
      <UnpaidSales rows={sales.rows} payingId={paying?.SaleId} editingId={editing?.SaleId} onPay={startPaying} onEdit={startEditing} onDeleted={(id) => setSales((s) => ({ ...s, rows: s.rows.filter((r) => r.SaleId !== id) }))} />

      <div ref={cardRef} className="w-full max-w-md glass-card p-6 sm:p-8 stagger-in scroll-mt-4">
        {step === "order" && (
          <div className="flex flex-col gap-4">
            {editBanner}
            <MenuPicker menu={MENU} cart={cart} onChange={changeQty} onClear={clearCart} total={cartTotal} deals={dealsApplied} notes={dishNotes} onNote={setDishNote} />
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
                <i className="fa-solid fa-user" aria-hidden="true"></i> Customer name (needed to save for later)
              </label>
              <input type="text" className="input-3d" id="event-name" placeholder="e.g. Maria" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="event-note" className="field-label">
                <i className="fa-solid fa-note-sticky" aria-hidden="true"></i> Note (optional)
              </label>
              <input type="text" className="input-3d" id="event-note" placeholder="e.g. extra salsa" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {!hasCart && totalCents > 0 && <p className="text-center font-semibold tabular-nums -mb-1">Total {formatMoney(total)}</p>}
            {editing ? editButtons(false) : (
            <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn-3d justify-center !px-3 disabled:opacity-60"
                disabled={totalCents <= 0 || saving}
                aria-busy={saving}
                onClick={savePayLater}
              >
                <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i> {saving ? "Saving…" : "Save order"}
              </button>
              <button type="button" className="btn-3d justify-center !px-3 disabled:opacity-60" disabled={totalCents <= 0 || saving} onClick={() => setStep("pay")}>
                <i className="fa-solid fa-credit-card" aria-hidden="true"></i> Pay now
              </button>
            </div>
            <p className="text-xs text-center text-brand-navydeep/70 -mt-2">Save order = they pay later (it goes in the Unpaid list).</p>
            </>
            )}
          </div>
        )}

        {checkoutSteps}
      </div>

      <TodaySales
        {...sales}
        onUpdated={(id, fields) => setSales((s) => ({ ...s, rows: s.rows.map((r) => (r.SaleId === id ? { ...r, ...fields } : r)) }))}
        onDeleted={(id) => setSales((s) => ({ ...s, rows: s.rows.filter((r) => r.SaleId !== id) }))}
      />
    </>
  );
  const closeButton = (
    <button type="button" onClick={closeFull} className="fab shrink-0 !w-11 !h-11" aria-label="Close full screen" title="Close (Esc)">
      <i className="fa-solid fa-xmark text-xl text-brand-gold" aria-hidden="true"></i>
    </button>
  );
  const screenTitle = (
    <p className="font-semibold text-brand-navy truncate min-w-0">
      <i className="fa-solid fa-store text-brand-teal" aria-hidden="true"></i> Event Sales
      {isEmployee && sellerName ? <span className="font-normal text-brand-navydeep/80"> · {sellerName}</span> : null}
    </p>
  );

  // Phones: the same one-column screen, full screen.
  const phoneScreen = (
    <div role="dialog" aria-modal="true" aria-label="Event Sales" className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-[rgb(var(--page-bg))]">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 bg-[rgb(var(--page-bg))]">
        {screenTitle}
        {closeButton}
      </div>
      <div className="flex flex-col items-center px-4 pt-2 pb-[max(2.5rem,env(safe-area-inset-bottom))]">{salesScreen}</div>
    </div>
  );

  // Tablets and computers: a register. Menu tiles on the left, the order
  // ticket on the right (where paying happens too), and tabs for Unpaid
  // and Today's sales instead of one long page.
  const tabs = [
    { id: "order", label: "New order", icon: "fa-cash-register" },
    { id: "unpaid", label: "Unpaid", icon: "fa-clock", badge: unpaidCount },
    { id: "today", label: "Today's sales", icon: "fa-chart-simple" },
  ];
  const ticket = (
    <div className="flex flex-col gap-3 min-h-full">
      {editBanner}
      <div className="flex items-center justify-between">
        <h2 className="field-label !mb-0">
          <i className="fa-solid fa-receipt" aria-hidden="true"></i> Current order
        </h2>
        {hasCart && (
          <button type="button" className="text-xs text-brand-navydeep/75 underline" onClick={clearCart}>
            Clear
          </button>
        )}
      </div>
      {hasCart ? (
        <ul className="flex flex-col divide-y divide-brand-navydeep/10" aria-label="Items in this order">
          {cartEntries.map(({ item, qty }) => (
            <li key={item.id} className="py-2 flex flex-col gap-1">
              <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight truncate">{item.name}</p>
                <p className="text-xs text-brand-navydeep/70">
                  {formatMoney(item.price)}
                  {item.unit === "lb" ? " / lb" : " each"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" className="w-9 h-9 rounded-full bg-brand-navydeep/10 font-bold text-lg" aria-label={`Remove ${item.name}`} onClick={() => changeQty(item.id, -qtyStep(item))}>
                  −
                </button>
                <span className="w-12 text-center font-semibold tabular-nums">
                  {qty}
                  {item.unit === "lb" ? " lb" : ""}
                </span>
                <button type="button" className="w-9 h-9 rounded-full bg-brand-gold text-white font-bold text-lg" aria-label={`Add ${item.name}`} onClick={() => changeQty(item.id, qtyStep(item))}>
                  +
                </button>
              </div>
              <span className="w-20 text-right font-semibold tabular-nums shrink-0">{formatMoney(item.price * qty)}</span>
              </div>
              {dishNotes[item.id]?.trim() && (
                <p className="text-sm italic text-brand-teal">
                  <i className="fa-solid fa-pen text-xs" aria-hidden="true"></i> {dishNotes[item.id].trim()}
                </p>
              )}
            </li>
          ))}
          {dealsApplied.map((d) => (
            <li key={d.key} className="flex justify-between gap-2 py-2 text-sm font-semibold text-brand-teal">
              <span>
                <i className="fa-solid fa-tag" aria-hidden="true"></i> {dealLabel(d)}
              </span>
              <span className="tabular-nums">−{formatMoney(d.savings)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-sm text-center text-brand-navydeep/70 py-4">Tap items on the menu to start an order.</p>
          <div className="field-group">
            <label htmlFor="event-amount" className="field-label">
              <i className="fa-solid fa-dollar-sign" aria-hidden="true"></i> Or enter the amount
            </label>
            <input type="number" inputMode="decimal" min="0" step="0.01" className="input-3d text-lg" id="event-amount" placeholder="0.00" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
          </div>
        </>
      )}
      <div className="mt-auto flex flex-col gap-3 pt-3 border-t border-brand-navydeep/15">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-brand-teal font-semibold">Total</span>
          <span className="font-form text-4xl tabular-nums">{formatMoney(total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="field-group">
            <label htmlFor="event-name" className="field-label">
              <i className="fa-solid fa-user" aria-hidden="true"></i> Customer
            </label>
            <input type="text" className="input-3d" id="event-name" placeholder="Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="event-note" className="field-label">
              <i className="fa-solid fa-note-sticky" aria-hidden="true"></i> Note
            </label>
            <input type="text" className="input-3d" id="event-note" placeholder="e.g. extra salsa" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        {editing ? editButtons(true) : (
        <>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-3d justify-center !px-3 !py-4 text-lg disabled:opacity-60" disabled={totalCents <= 0 || saving} aria-busy={saving} onClick={savePayLater}>
            <i className="fa-solid fa-floppy-disk" aria-hidden="true"></i> {saving ? "Saving…" : "Save order"}
          </button>
          <button type="button" className="btn-3d justify-center !px-3 !py-4 text-lg disabled:opacity-60" disabled={totalCents <= 0 || saving} onClick={() => setStep("pay")}>
            <i className="fa-solid fa-credit-card" aria-hidden="true"></i> Pay now
          </button>
        </div>
        <p className="text-xs text-center text-brand-navydeep/70">Save order = they pay later (it goes in Unpaid).</p>
        </>
        )}
      </div>
    </div>
  );
  const registerScreen = (
    <div role="dialog" aria-modal="true" aria-label="Event Sales" className="fixed inset-0 z-[60] flex flex-col bg-[rgb(var(--page-bg))]">
      <header className="flex items-center gap-4 px-5 py-3 border-b border-brand-navydeep/15">
        <div className="flex-1 min-w-0 text-lg">{screenTitle}</div>
        <div role="tablist" aria-label="Event Sales sections" className="glass-panel !rounded-full p-1 flex gap-1 shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={posTab === t.id}
              onClick={() => setPosTab(t.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 font-semibold whitespace-nowrap transition-colors ${posTab === t.id ? "bg-brand-gold text-white" : "text-brand-navydeep/80 hover:bg-brand-navydeep/10"}`}
            >
              <i className={`fa-solid ${t.icon}`} aria-hidden="true"></i>
              <span className={t.id === "order" ? "" : "max-lg:sr-only"}>{t.label}</span>
              {t.badge ? <span className="rounded-full bg-brand-terracotta text-white text-xs px-2 py-0.5 tabular-nums">{t.badge}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex-1 flex justify-end">{closeButton}</div>
      </header>
      {posTab === "order" ? (
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:grid-cols-[minmax(0,1fr)_420px] gap-4 p-4">
          <section
            aria-label="Menu"
            aria-disabled={step !== "order"}
            className={`min-h-0 overflow-y-auto overscroll-contain glass-card !rounded-3xl p-4 lg:p-5 transition-opacity ${step !== "order" ? "opacity-40 pointer-events-none" : ""}`}
          >
            <MenuPicker variant="pos" menu={MENU} cart={cart} onChange={changeQty} onClear={clearCart} total={cartTotal} deals={dealsApplied} notes={dishNotes} onNote={setDishNote} />
          </section>
          <aside ref={cardRef} aria-label="Current order" className="min-h-0 overflow-y-auto overscroll-contain glass-card !rounded-3xl p-5 flex flex-col">
            {step === "order" ? ticket : checkoutSteps}
          </aside>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col items-center">
          {posTab === "unpaid" &&
            (unpaidCount ? (
              <UnpaidSales wide rows={sales.rows} payingId={paying?.SaleId} editingId={editing?.SaleId} onPay={startPaying} onEdit={startEditing} onDeleted={removeRow} />
            ) : (
              <p className="glass-card p-8 mt-8 text-center text-brand-navydeep/80">
                <i className="fa-solid fa-circle-check text-3xl text-emerald-600 block mb-2" aria-hidden="true"></i>
                No unpaid orders.
              </p>
            ))}
          {posTab === "today" && <TodaySales wide {...sales} onUpdated={updateRow} onDeleted={removeRow} />}
        </div>
      )}
    </div>
  );

  return (
    <Layout blobs={["bg-brand-terracotta w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-teal w-80 h-80 top-1/2 -left-16 animate-float"]}>
      <SiteNav className="mb-6" />
      <PageHeader title="Event Sales" subtitle={brand.name} />

      <button ref={openFullRef} type="button" onClick={() => setFullOpen(true)} className="btn-3d stagger-in w-full max-w-md !py-4 text-lg mb-6">
        <i className="fa-solid fa-expand" aria-hidden="true"></i> Open full screen
      </button>

      {!fullOpen && salesScreen}

      {/* Portaled to <body> so it covers the floating theme / log out
          buttons too, like the catering calculator. */}
      {fullOpen && createPortal(wide ? registerScreen : phoneScreen, document.body)}
    </Layout>
  );
}

// While the Zelle QR shows: checks every few seconds for Chase's "You
// received money with Zelle" email (api/zelle-alerts.js). A payment for
// exactly this total, received after the screen opened (with 2 minutes of
// slack), records the sale by itself. Other amounts are listed so the
// employee can decide. Shows nothing until the Resend setup is done; the
// "Zelle received" button always works by hand.
const ZELLE_POLL_MS = 4000;
function ZelleWatcher({ amount, saving, onMatch }) {
  const [state, setState] = useState({ enabled: null, alerts: [], error: false, matched: null });
  const startedAt = useRef(Date.now());
  const tried = useRef(new Set());
  const latest = useRef({ saving, onMatch });
  latest.current = { saving, onMatch };
  const cents = toCents(amount);

  useEffect(() => {
    let live = true;
    let timer;
    const since = startedAt.current - 2 * 60 * 1000;
    const tick = async () => {
      try {
        const r = await fetchZelleAlerts({ since, startedAt: startedAt.current, amount });
        if (!live) return;
        if (!r.enabled) return setState((s) => ({ ...s, enabled: false }));
        const alerts = r.alerts || [];
        const match = alerts.find((a) => toCents(a.amount) === cents && !tried.current.has(a.id));
        setState((s) => ({ ...s, enabled: true, alerts, error: false, matched: match || s.matched }));
        if (match && !latest.current.saving) {
          tried.current.add(match.id);
          latest.current.onMatch(match);
        }
      } catch {
        if (live) setState((s) => ({ ...s, error: true }));
      }
      if (live) timer = setTimeout(tick, ZELLE_POLL_MS);
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [amount, cents]);

  if (!state.enabled) return null;
  const others = state.alerts.filter((a) => toCents(a.amount) !== cents);
  return (
    <div className="glass-panel p-3 text-sm text-center flex flex-col gap-1" role="status" aria-live="polite">
      {state.matched ? (
        <p className="font-semibold text-emerald-600">
          <i className="fa-solid fa-circle-check" aria-hidden="true"></i> Zelle received: {formatMoney(state.matched.amount)}
          {state.matched.from ? ` from ${state.matched.from}` : ""}
          {saving ? " · recording…" : ""}
        </p>
      ) : state.error ? (
        <p className="text-brand-terracotta">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Can&apos;t check for the Zelle email right now. Check the phone, then tap Zelle received.
        </p>
      ) : (
        <p className="font-semibold">
          <i className="fa-solid fa-circle-notch fa-spin text-brand-teal" aria-hidden="true"></i> Waiting for the Chase Zelle email for {formatMoney(amount)}…
        </p>
      )}
      {others.map((a) => (
        <p key={a.id} className="text-xs text-brand-navydeep/80">
          Zelle {formatMoney(a.amount)}
          {a.from ? ` from ${a.from}` : ""} came in, but it doesn&apos;t match {formatMoney(amount)}.
        </p>
      ))}
    </div>
  );
}

const PAGE = 5;

// Today's totals (all, and by Card / Cash / Zelle) and today's sales.
function TodaySales({ rows, loading, error, onUpdated, onDeleted, wide = false }) {
  const [shown, setShown] = useState(PAGE);
  if (loading) return null;
  const { date } = getCurrentDateTime();
  const todayAll = rows.filter((r) => r.Date === date);
  const today = todayAll.filter((r) => !isUnpaid(r));
  const summary = summarizeSales(todayAll);
  return (
    <section className={`glass-card w-full ${wide ? "max-w-3xl" : "max-w-md mt-8"} p-5 sm:p-6 stagger-in`} aria-label="Today's event sales">
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
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <SaleHeader name={s.Name || "Walk-up customer"} total={s.Total || s.Amount} method={s.Method} />
      <SaleMeta parts={[s.Time, s.SaleId, s.Note]} soldBy={s.SoldBy} />
      <SaleItems items={s.Items} />
      <RowButtons
        label={`sale ${s.SaleId}`}
        onMakeInvoice={can("orders") ? () => makeInvoice(saleToOrderForm(s, s.Method || "Cash"), `event sale ${s.SaleId}`) : null}
        receiptHref={receipt}
        onEdit={key && can("manage") ? () => setEditing(true) : null}
        onDelete={key && can("manage") ? remove : null}
        editing={editing}
      >
        {!editing && <TextReceiptButton sale={s} className={`${ROW_OUTLINE_BUTTON} border-brand-teal/60 text-brand-teal whitespace-nowrap`} />}
      </RowButtons>
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

// A saved sale's top line: name, Paid-with chip, total on the right.
function SaleHeader({ name, total, method }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <p className="font-semibold text-brand-navy truncate min-w-0">{name}</p>
      {method && (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-brand-navydeep/25 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-navydeep/90">
          <i className={`fa-solid ${METHOD_ICONS[method] || "fa-tag"}`} aria-hidden="true"></i> {method}
        </span>
      )}
      <span className="ml-auto shrink-0 font-semibold text-brand-navy tabular-nums">{formatMoney(toNumber(total))}</span>
    </div>
  );
}

// One small line: time · id · note, then who rang it up.
function SaleMeta({ parts, soldBy }) {
  const text = parts.filter(Boolean).join(" · ");
  if (!text && !soldBy) return null;
  return (
    <p className="text-xs text-brand-navydeep/75 leading-snug">
      {text}
      {soldBy && (
        <span className="font-semibold text-brand-teal">
          {text ? " · " : ""}
          <i className="fa-solid fa-user-tag" aria-hidden="true"></i> {soldBy}
        </span>
      )}
    </p>
  );
}

// The dishes as a list, one per line with its price on the right:
// "2x Taco de Chivo (no onion) ($10.00)" → "2x Taco de Chivo (no onion)  $10.00".
// Deal lines ("Drinks 3 for $5 (-$1.00)") show as savings.
function saleItemLines(items) {
  return String(items || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.*?)\s*\((-?)\$([\d,.]+)\)$/);
      return m ? { label: m[1], price: (m[2] ? -1 : 1) * Number(m[3].replace(/,/g, "")) } : { label: l, price: null };
    });
}

function SaleItems({ items }) {
  const lines = saleItemLines(items);
  if (!lines.length) return null;
  return (
    <ul className="rounded-lg bg-brand-navydeep/5 px-2.5 py-1.5 text-sm leading-snug" aria-label="Items">
      {lines.map((l, i) => (
        <li key={i} className={`flex justify-between gap-3 ${l.price < 0 ? "text-brand-teal font-semibold" : "text-brand-navydeep/90"}`}>
          <span className="min-w-0">{l.label}</span>
          {l.price != null && <span className="shrink-0 tabular-nums">{l.price < 0 ? `−${formatMoney(-l.price)}` : formatMoney(l.price)}</span>}
        </li>
      ))}
    </ul>
  );
}

// "Pay later" orders not paid yet (any day), at the top of the page so
// nobody forgets them. Employees only get their own from the server.
function UnpaidSales({ rows, payingId, editingId, onPay, onEdit, onDeleted, wide = false }) {
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
    <section className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} glass-card p-5 sm:p-6 mb-6 border-2 border-brand-terracotta/60 stagger-in`} aria-label="Unpaid orders">
      <h2 className="field-label !mb-1 justify-center !text-brand-terracotta">
        <i className="fa-solid fa-clock" aria-hidden="true"></i> Unpaid · {unpaid.length} · {formatMoney(owed)}
      </h2>
      <p className="text-xs text-center text-brand-navydeep/75 mb-3">Orders saved with Pay later. Tap Take payment when they&apos;re ready.</p>
      <ul className="flex flex-col divide-y divide-brand-navydeep/15">
        {unpaid.map((s) => (
          <li key={s.SaleId} className="py-2.5 first:pt-0 last:pb-0 flex flex-col gap-1">
            <SaleHeader name={s.Name || "No name"} total={s.Total || s.Amount} />
            <SaleMeta parts={[s.Date !== getCurrentDateTime().date ? s.Date : "", s.Time, s.Note]} soldBy={s.SoldBy} />
            <SaleItems items={s.Items} />
            <div className={`grid ${can("manage") ? "grid-cols-3" : "grid-cols-2"} gap-2 mt-1`}>
              <button type="button" className="btn-3d !py-2 !px-2 text-sm justify-center disabled:opacity-60" disabled={payingId === s.SaleId} onClick={() => onPay(s)}>
                <i className="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> {payingId === s.SaleId ? "Paying…" : "Take payment"}
              </button>
              {/* Edit: anyone with Event Sales (nothing's been charged); the server allows employees only their own. */}
              <button
                type="button"
                className="btn-3d !py-2 !px-2 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy disabled:opacity-60"
                disabled={editingId === s.SaleId}
                aria-label={`Edit ${s.Name || "this"}'s unpaid order`}
                onClick={() => onEdit(s)}
              >
                <i className="fa-solid fa-pen" aria-hidden="true"></i> {editingId === s.SaleId ? "Editing" : "Edit"}
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
