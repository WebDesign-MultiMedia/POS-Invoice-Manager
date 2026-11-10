import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import TiltCard from "../components/TiltCard.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import { deleteOrder, fetchAllOrders, submitOrder, updateOrder } from "../api/sheetdb.js";
import { getCurrentDateTime, getTotalQuantity, formatDate, formatMoney, toDateInput, toNumber } from "../lib/format.js";
import { findSubmittedOrder, ordersNewestFirst } from "../lib/recentOrder.js";
import { getBrand } from "../lib/brand.js";
import { readDraft, writeDraft, readDraftSource } from "../lib/orderDraft.js";
import { friendlyMessage } from "../lib/errors.js";

const INITIAL_FORM = {
  Name: "",
  Contact: "",
  Address: "",
  PickupDelivery: "",
  Cost: "",
  Payment: "",
  Deposit: "0",
  Items: "",
  DueDate: "",
  Notes: "",
};

const ALERT_BASE = {
  showDenyButton: false,
  showConfirmButton: false,
  theme: "dark",
  backdrop: `
    rgba(9, 8, 9, 0.87)
    left top
    no-repeat
  `,
};

// A saved order's fields, as the form shows them.
function orderToForm(order) {
  const form = {};
  for (const key of Object.keys(INITIAL_FORM)) form[key] = String(order[key] ?? "");
  form.DueDate = toDateInput(order.DueDate);
  return form;
}

// A select's options, plus the order's current value if it isn't one of
// them (e.g. an older order paid another way), so editing doesn't blank it.
function withCurrent(options, value) {
  return value && !options.includes(value) ? [...options, value] : options;
}

function loadDraft() {
  const saved = readDraft();
  return saved ? { ...INITIAL_FORM, ...saved } : null;
}

// The order just saved, for the success alert's "View invoice". The sheet
// gives new orders their Id, so it's looked up after saving (the demo
// returns it directly). Null if it can't be found; the order is still saved.
async function lookUpSavedOrder(data, created) {
  if (created?.id) return { ...data, Id: String(created.id) };
  try {
    return findSubmittedOrder(await fetchAllOrders(), data);
  } catch (err) {
    console.error("Couldn't look up the saved order:", err);
    return null;
  }
}

function fieldClass(value, validated) {
  if (!validated) return "input-3d text-center";
  return value.trim() ? "input-3d text-center field-valid" : "input-3d text-center field-error";
}

export default function OrderFormPage() {
  const [initialDraft] = useState(loadDraft);
  const [form, setForm] = useState(initialDraft || INITIAL_FORM);
  const [validated, setValidated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState(Boolean(initialDraft));
  // A ref as well as state: two quick taps can land before React re-renders
  // the disabled button, and the ref stops the second one immediately.
  const savingRef = useRef(false);
  const navigate = useNavigate();
  // The saved order being edited, or null when the form makes a new order.
  const [editing, setEditing] = useState(null);
  const formRef = useRef(null);

  // Saved orders, newest first, listed under the form for quick access.
  const [recent, setRecent] = useState({ orders: [], loading: true, error: false });
  useEffect(() => {
    let live = true;
    fetchAllOrders()
      .then((rows) => live && setRecent({ orders: ordersNewestFirst(rows), loading: false, error: false }))
      .catch((err) => {
        console.error("Couldn't load recent orders:", err);
        if (live) setRecent({ orders: [], loading: false, error: true });
      });
    return () => {
      live = false;
    };
  }, []);

  // Set when the draft was filled in from a Catering Calculator quote.
  const [draftSource] = useState(() => (initialDraft ? readDraftSource() : null));

  // The new-order draft is kept while an order is being edited, and comes
  // back when the edit is saved or cancelled.
  useEffect(() => {
    if (!editing) writeDraft(form);
  }, [form, editing]);

  const startEdit = (order) => {
    setEditing(order);
    setForm(orderToForm(order));
    setValidated(false);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const stopEdit = () => {
    const draft = loadDraft();
    setEditing(null);
    setForm(draft || INITIAL_FORM);
    setRestored(Boolean(draft));
    setValidated(false);
  };

  const removeFromRecent = (id) =>
    setRecent((r) => ({ ...r, orders: r.orders.filter((o) => String(o.Id) !== String(id)) }));

  const handleDelete = async (order) => {
    const { isConfirmed } = await Swal.fire({
      ...ALERT_BASE,
      title: `Delete order #${order.Id}?`,
      text: `${order.Name || "This order"} will be removed from the sheet. This can't be undone. Card payments already logged for it stay in Card Payments.`,
      icon: "warning",
      showConfirmButton: true,
      confirmButtonText: '<i class="fa-solid fa-trash"></i> Delete',
      confirmButtonColor: "#dc2626",
      showCancelButton: true,
      cancelButtonText: "Keep it",
      focusCancel: true,
    });
    if (!isConfirmed) return;
    try {
      await deleteOrder(order.Id);
    } catch (err) {
      if (err?.status !== 404) {
        console.error("deleteOrder failed:", err);
        Swal.fire({ ...ALERT_BASE, showConfirmButton: true, title: "Order not deleted", text: friendlyMessage(err, "Couldn't delete the order."), icon: "error" });
        return;
      }
      // Already gone from the sheet: just drop it from the list.
    }
    removeFromRecent(order.Id);
    if (editing && String(editing.Id) === String(order.Id)) stopEdit();
    Swal.fire({ ...ALERT_BASE, title: `Order #${order.Id} deleted`, icon: "success", timer: 1500 });
  };

  const setField = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (savingRef.current) return;

    const { date, time } = getCurrentDateTime();
    const data = {
      Date: date,
      Time: time,
      Name: form.Name,
      Contact: form.Contact,
      Address: form.Address,
      PickupDelivery: form.PickupDelivery,
      Items: form.Items,
      Quantity: getTotalQuantity(form.Items),
      Cost: form.Cost,
      Deposit: form.Deposit,
      Payment: form.Payment,
      DueDate: form.DueDate ? formatDate(form.DueDate) : "",
      Notes: form.Notes,
    };

    // DueDate and Notes are optional, so they're excluded from the required-fields check.
    const { DueDate: _dueDate, Notes: _notes, ...requiredData } = data;
    const hasBlank = Object.values(requiredData).some((v) => !v);

    if (hasBlank) {
      setValidated(true);
      Swal.fire({ ...ALERT_BASE, title: "Fill in Blanks", icon: "error", timer: 1000 });
      return;
    }

    if (editing) {
      await saveEdit(data);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    let saved = null;
    try {
      const created = await submitOrder(data);
      saved = await lookUpSavedOrder(data, created);
    } catch (err) {
      // The form (and its draft) stay as they are, so nothing is retyped.
      console.error("submitOrder failed:", err);
      Swal.fire({
        ...ALERT_BASE,
        showConfirmButton: true,
        title: "Order not saved",
        text: `${friendlyMessage(err, "Couldn't save the order.")} Your order is still here — press Submit Order again.`,
        icon: "error",
      });
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }

    setForm(INITIAL_FORM);
    setValidated(false);
    setRestored(false);
    if (saved) setRecent((r) => ({ ...r, orders: [saved, ...r.orders.filter((o) => String(o.Id) !== String(saved.Id))] }));

    if (!saved) {
      Swal.fire({ ...ALERT_BASE, title: "Successfully Stored", icon: "success", timer: 1500 });
      return;
    }
    const { isConfirmed } = await Swal.fire({
      ...ALERT_BASE,
      title: "Successfully Stored",
      text: `Order #${saved.Id} for ${saved.Name} is saved.`,
      icon: "success",
      showConfirmButton: true,
      confirmButtonText: '<i class="fa-solid fa-file-invoice-dollar"></i> View invoice',
      showCancelButton: true,
      cancelButtonText: "New order",
    });
    if (isConfirmed) navigate(`/invoice?id=${encodeURIComponent(saved.Id)}`);
  };

  // Saves changes to the order being edited. Its Id, Date and Time stay.
  async function saveEdit(data) {
    const { Date: _date, Time: _time, ...fields } = data;
    savingRef.current = true;
    setSaving(true);
    try {
      await updateOrder(editing.Id, fields);
    } catch (err) {
      console.error("updateOrder failed:", err);
      const gone = err?.status === 404;
      if (gone) removeFromRecent(editing.Id);
      Swal.fire({
        ...ALERT_BASE,
        showConfirmButton: true,
        title: "Changes not saved",
        text: gone ? `Order #${editing.Id} isn't in the sheet any more.` : `${friendlyMessage(err, "Couldn't save the changes.")} Your changes are still here — press Save changes again.`,
        icon: "error",
      });
      if (gone) stopEdit();
      return;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    const updated = { ...editing, ...fields };
    setRecent((r) => ({ ...r, orders: r.orders.map((o) => (String(o.Id) === String(updated.Id) ? updated : o)) }));
    stopEdit();
    Swal.fire({ ...ALERT_BASE, title: `Order #${updated.Id} updated`, icon: "success", timer: 1500 });
  }

  const brand = getBrand();


  return (
    <Layout blobs={["bg-brand-gold w-72 h-72 -top-10 -left-10 animate-float-slow", "bg-brand-cactus w-80 h-80 top-1/3 -right-16 animate-float", "bg-brand-pink w-64 h-64 bottom-0 left-1/4 animate-float-slow"]}>
      <PageHeader logoSize="w-36 h-36 sm:w-44 sm:h-44" title={brand.name} subtitle={brand.tagline} />

      <SiteNav className="mb-8" />

      <div ref={formRef} className="w-full max-w-3xl scroll-mt-4">
      <TiltCard maxDeg={3} as="form" wrapClassName="w-full" className={`glass-card p-6 sm:p-10 stagger-in ${editing ? "ring-2 ring-brand-gold" : ""}`} onSubmit={handleSubmit}>
        <div className="flex items-center gap-2 mb-6 justify-center">
          <i className={`fa-solid ${editing ? "fa-pen-to-square" : "fa-utensils"} text-brand-gold text-xl`}></i>
          <h2 className="text-xl sm:text-2xl font-semibold text-brand-navy">{editing ? `Edit Order #${editing.Id}` : "Customer Order"}</h2>
        </div>

        {editing && (
          <p role="status" className="glass-panel p-3 mb-5 text-sm text-center">
            <i className="fa-solid fa-pen" aria-hidden="true"></i> Editing the order saved {[editing.Date, editing.Time].filter(Boolean).join(" at ")}. Change what you need, then press Save changes.
          </p>
        )}

        {restored && !editing && (
          <p role="status" className="glass-panel p-3 mb-5 text-sm text-center">
            {draftSource ? (
              <>
                <i className="fa-solid fa-calculator" aria-hidden="true"></i> Filled in from {draftSource}. Add the payment and deposit, then submit.{" "}
              </>
            ) : (
              <>
                <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Restored your unsaved order.{" "}
              </>
            )}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => {
                setForm(INITIAL_FORM);
                setValidated(false);
                setRestored(false);
              }}
            >
              Start over
            </button>
          </p>
        )}

        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          <div className="field-group">
            <label htmlFor="Name" className="field-label">
              <i className="fa-solid fa-user"></i> Name
            </label>
            <input type="text" name="Name" id="Name" placeholder="Customer name" className={fieldClass(form.Name, validated)} value={form.Name} onChange={setField("Name")} />
          </div>
          <div className="field-group">
            <label htmlFor="Contact" className="field-label">
              <i className="fa-solid fa-phone"></i> Phone
            </label>
            <input type="text" name="Contact" id="Contact" placeholder="Customer phone" className={fieldClass(form.Contact, validated)} value={form.Contact} onChange={setField("Contact")} />
          </div>
          <div className="field-group">
            <label htmlFor="Address" className="field-label">
              <i className="fa-solid fa-location-dot"></i> Address
            </label>
            <input type="text" name="Address" id="Address" placeholder="Customer address" className={fieldClass(form.Address, validated)} value={form.Address} onChange={setField("Address")} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <div className="field-group">
            <label htmlFor="PickupDelivery" className="field-label">
              <i className="fa-solid fa-truck-fast"></i> Type
            </label>
            <select name="PickupDelivery" id="PickupDelivery" className={fieldClass(form.PickupDelivery, validated)} value={form.PickupDelivery} onChange={setField("PickupDelivery")}>
              <option value="">Type</option>
              {withCurrent(["Delivery", "Pick-up", "Catering"], form.PickupDelivery).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="Cost" className="field-label">
              <i className="fa-solid fa-dollar-sign"></i> Cost
            </label>
            <input type="text" name="Cost" id="Cost" placeholder="Total" className={fieldClass(form.Cost, validated)} value={form.Cost} onChange={setField("Cost")} />
          </div>
          <div className="field-group">
            <label htmlFor="Payment" className="field-label">
              <i className="fa-solid fa-wallet"></i> Payment
            </label>
            <select id="Payment" name="Payment" className={fieldClass(form.Payment, validated)} value={form.Payment} onChange={setField("Payment")}>
              <option value="">Paid w/</option>
              {withCurrent(["Cash", "Zelle"], form.Payment).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="Deposit" className="field-label">
              <i className="fa-solid fa-hand-holding-dollar"></i> Deposit
            </label>
            <input type="text" name="Deposit" id="Deposit" placeholder="Deposit" className={fieldClass(form.Deposit, validated)} value={form.Deposit} onChange={setField("Deposit")} />
          </div>
        </div>

        <div className="field-group mb-5">
          <label htmlFor="DueDate" className="field-label">
            <i className="fa-solid fa-calendar-days"></i> Due Date <span className="normal-case text-brand-muted/90">(optional — catering/future orders)</span>
          </label>
          <input type="date" name="DueDate" id="DueDate" className="input-3d" value={form.DueDate} onChange={setField("DueDate")} />
        </div>

        <div className="field-group mb-8">
          <label htmlFor="Items" className="field-label">
            <i className="fa-solid fa-clipboard-list"></i> Items
          </label>
          <textarea
            name="Items"
            id="Items"
            rows="3"
            placeholder="Customer order"
            className={`${fieldClass(form.Items, validated)} resize-none`}
            value={form.Items}
            onChange={setField("Items")}
          ></textarea>
        </div>

        <div className="field-group mb-8">
          <label htmlFor="Notes" className="field-label">
            <i className="fa-solid fa-note-sticky"></i> Notes <span className="normal-case text-brand-muted/90">(optional)</span>
          </label>
          <textarea
            name="Notes"
            id="Notes"
            rows="2"
            placeholder="Anything else worth noting about this order"
            className="input-3d resize-none"
            value={form.Notes}
            onChange={setField("Notes")}
          ></textarea>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {editing && (
            <button type="button" className="btn-3d !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy" onClick={stopEdit} disabled={saving}>
              <i className="fa-solid fa-xmark" aria-hidden="true"></i> Cancel
            </button>
          )}
          <button id="addDate" type="submit" className="btn-3d disabled:opacity-60" disabled={saving} aria-busy={saving}>
            <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : editing ? "fa-floppy-disk" : "fa-paper-plane"}`} aria-hidden="true"></i>{" "}
            {saving ? "Saving…" : editing ? "Save changes" : "Submit Order"}
          </button>
        </div>
      </TiltCard>
      </div>

      <RecentOrders {...recent} editingId={editing?.Id} onEdit={startEdit} onDelete={handleDelete} />
    </Layout>
  );
}

const RECENT_PAGE = 5;

// Under the form: the orders saved, newest first, each one tap from its
// invoice. Shows a few at a time with "Show more" for older ones.
function RecentOrders({ orders, loading, error, editingId, onEdit, onDelete }) {
  const [shown, setShown] = useState(RECENT_PAGE);
  if (loading || (!error && !orders.length)) return null;
  return (
    <section className="glass-card w-full max-w-3xl mt-8 p-5 sm:p-6 stagger-in" aria-label="Recent orders">
      <h2 className="field-label !mb-3 justify-center">
        <i className="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Recent orders
      </h2>
      {error ? (
        <p className="text-center text-sm text-brand-navydeep/80">Couldn&apos;t load recent orders. They&apos;ll show next time the page opens.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-navydeep/15">
          {orders.slice(0, shown).map((order) => (
            <RecentOrderRow key={order.Id} order={order} editing={String(order.Id) === String(editingId)} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </ul>
      )}
      {orders.length > shown && (
        <div className="flex justify-center mt-4">
          <button type="button" className="underline font-semibold text-sm text-brand-navy" onClick={() => setShown((n) => n + RECENT_PAGE * 2)}>
            Show more ({orders.length - shown} older)
          </button>
        </div>
      )}
    </section>
  );
}

function RecentOrderRow({ order, editing, onEdit, onDelete }) {
  const items = getTotalQuantity(order.Items || "");
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between py-3 first:pt-0 last:pb-0">
      <div className="text-center sm:text-left min-w-0">
        <p className="font-semibold text-brand-navy truncate">
          #{order.Id} · {order.Name || "No name"}
        </p>
        <p className="text-sm text-brand-navydeep/80">
          {[order.Date, order.Time].filter(Boolean).join(" · ")}
          {order.PickupDelivery ? ` · ${order.PickupDelivery}` : ""}
          {items ? ` · ${items} item${items === 1 ? "" : "s"}` : ""}
          {order.Cost !== undefined && order.Cost !== "" ? ` · ${formatMoney(toNumber(order.Cost))}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 w-full sm:flex sm:w-auto shrink-0 self-center [&>*]:justify-center">
        <Link to={`/invoice?id=${encodeURIComponent(order.Id)}`} className="btn-3d !py-2 !px-2 sm:!px-4 text-sm">
          <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i> <span className="sm:hidden">Invoice</span>
          <span className="hidden sm:inline">View invoice</span>
        </Link>
        <button
          type="button"
          className="btn-3d !py-2 !px-2 sm:!px-4 text-sm !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy disabled:opacity-60"
          onClick={() => onEdit(order)}
          disabled={editing}
          aria-label={`Edit order #${order.Id}`}
        >
          <i className="fa-solid fa-pen" aria-hidden="true"></i> {editing ? "Editing" : "Edit"}
        </button>
        <button
          type="button"
          className="btn-3d !py-2 !px-2 sm:!px-4 text-sm !bg-none !bg-transparent border border-brand-error/60 text-brand-error"
          onClick={() => onDelete(order)}
          aria-label={`Delete order #${order.Id}`}
        >
          <i className="fa-solid fa-trash" aria-hidden="true"></i> Delete
        </button>
      </div>
    </li>
  );
}
