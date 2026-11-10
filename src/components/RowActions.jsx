import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { hasDraft, writeDraft } from "../lib/orderDraft.js";
import { friendlyMessage } from "../lib/errors.js";

// Shared by Recent card payments (Pay with Card) and Today's sales (Event
// Sales): the Invoice / Receipt / Edit / Delete buttons under each row, the
// edit form that opens in place, and the confirm-then-delete flow.

const ALERT = { theme: "dark" };
const OUTLINE = "btn-3d !py-2 !px-2 sm:!px-4 text-sm justify-center !bg-none !bg-transparent border";

export function RowButtons({ invoiceHref, onMakeInvoice, receiptHref, onEdit, onDelete, editing, label }) {
  // Two per row on phones; with an odd count the invoice button takes the
  // whole first row so the rest pair up.
  const count = [invoiceHref || onMakeInvoice, receiptHref, onEdit, onDelete].filter(Boolean).length;
  const wide = count % 2 === 1 ? "col-span-2 sm:col-span-1" : "";
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap mt-1">
      {invoiceHref ? (
        <Link to={invoiceHref} className={`btn-3d !py-2 !px-2 sm:!px-4 text-sm justify-center whitespace-nowrap ${wide}`}>
          <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i> Invoice
        </Link>
      ) : (
        onMakeInvoice && (
          <button type="button" onClick={onMakeInvoice} className={`btn-3d !py-2 !px-2 sm:!px-4 text-sm justify-center whitespace-nowrap ${wide}`}>
            <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i> Make invoice
          </button>
        )
      )}
      {receiptHref && (
        <a href={receiptHref} target="_blank" rel="noopener noreferrer" className={`${OUTLINE} border-brand-navy/40 text-brand-navy whitespace-nowrap`}>
          <i className="fa-solid fa-receipt" aria-hidden="true"></i> Receipt
        </a>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit} disabled={editing} aria-label={`Edit ${label}`} className={`${OUTLINE} border-brand-navy/40 text-brand-navy disabled:opacity-60`}>
          <i className="fa-solid fa-pen" aria-hidden="true"></i> {editing ? "Editing" : "Edit"}
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} aria-label={`Delete ${label}`} className={`${OUTLINE} border-brand-error/60 text-brand-error`}>
          <i className="fa-solid fa-trash" aria-hidden="true"></i> Delete
        </button>
      )}
    </div>
  );
}

// "Make invoice": opens the order form filled in from this sale, after
// checking it won't wipe out an order someone already started typing.
export function useMakeInvoice() {
  const navigate = useNavigate();
  return async (form, source) => {
    if (hasDraft()) {
      const { isConfirmed } = await Swal.fire({
        ...ALERT,
        title: "Replace the order you started?",
        text: "The order form already has an unsaved order in it. It will be replaced with this sale.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Replace it",
        cancelButtonText: "Keep it",
      });
      if (!isConfirmed) return;
    }
    writeDraft(form, source);
    navigate("/");
  };
}

// Asks first, then deletes. Returns true once the row is gone (a 404 means
// someone already deleted it, which counts as gone).
export async function confirmAndDelete({ title, text, remove }) {
  const { isConfirmed } = await Swal.fire({
    ...ALERT,
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: '<i class="fa-solid fa-trash"></i> Delete',
    confirmButtonColor: "#dc2626",
    cancelButtonText: "Keep it",
    focusCancel: true,
  });
  if (!isConfirmed) return false;
  try {
    await remove();
  } catch (err) {
    if (err?.status !== 404) {
      console.error("delete failed:", err);
      Swal.fire({ ...ALERT, title: "Not deleted", text: friendlyMessage(err, "Couldn't delete it."), icon: "error" });
      return false;
    }
  }
  return true;
}

// The edit form that opens inside a row.
//   fields: [{ key, label, icon, type: "text" | "textarea" | "select" | "money" | "email" | "tel", options }]
//   onSave(values) saves and resolves, or throws to keep the form open.
export function RowEditor({ idBase, fields, initial, note, onSave, onCancel }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(values);
    } catch (err) {
      console.error("save failed:", err);
      Swal.fire({
        ...ALERT,
        title: err?.status === 404 ? "It's gone" : "Changes not saved",
        text: err?.status === 404 ? "This was already deleted from the sheet." : friendlyMessage(err, "Couldn't save the changes."),
        icon: "error",
      });
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="glass-panel p-3 mt-2 flex flex-col gap-3" aria-label="Edit">
      {note && <p className="text-xs text-brand-navydeep/80">{note}</p>}
      {fields.map((f) => {
        const id = `${idBase}-${f.key}`;
        const common = { id, className: "input-3d w-full !py-2 text-sm", value: values[f.key] ?? "", onChange: set(f.key) };
        return (
          <div key={f.key} className="flex flex-col gap-1">
            <label htmlFor={id} className="field-label !mb-0">
              <i className={`fa-solid ${f.icon}`} aria-hidden="true"></i> {f.label}
            </label>
            {f.type === "textarea" ? (
              <textarea rows={3} {...common} className={`${common.className} resize-y`} />
            ) : f.type === "select" ? (
              <select {...common}>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "money" ? "text" : f.type || "text"}
                inputMode={f.type === "money" ? "decimal" : undefined}
                autoComplete="off"
                {...common}
              />
            )}
          </div>
        );
      })}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className={`${OUTLINE} border-brand-navy/40 text-brand-navy`}>
          <i className="fa-solid fa-xmark" aria-hidden="true"></i> Cancel
        </button>
        <button type="submit" disabled={saving} aria-busy={saving} className="btn-3d !py-2 !px-2 text-sm justify-center disabled:opacity-60">
          <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true"></i> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
