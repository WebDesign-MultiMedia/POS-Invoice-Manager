import { useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { deleteProduct, productSrc, saveProduct } from "../api/shopping.js";
import { friendlyMessage } from "../lib/errors.js";
import { productPriceLine, shrinkPhoto } from "../lib/shopping.js";

// The product catalog: things bought again and again (from Restaurant Depot
// for now), so a shopping list can be made by tapping instead of typing.
// Saved in the sheet's "Products" tab by api/shopping.js.

const ALERT = { theme: "dark" };
const OUTLINE = "btn-3d !py-2 !px-3 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy disabled:opacity-60";

// A product's picture, or a box icon. Pictures have see-through backgrounds,
// so they sit on any theme.
export function ProductThumb({ product, size = "h-12 w-12" }) {
  const src = productSrc(product);
  return (
    <span className={`${size} shrink-0 rounded-lg bg-white/10 border border-brand-navydeep/15 flex items-center justify-center overflow-hidden`}>
      {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" /> : <i className="fa-solid fa-box text-brand-navydeep/40" aria-hidden="true"></i>}
    </span>
  );
}

// "Bin 3002 · Item #25849": what helps find it in the store.
export const whereToFind = (p) => [p?.bin && `Bin ${p.bin}`, p?.itemNo && `Item #${p.itemNo}`].filter(Boolean).join(" · ");

function useSearch(products) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);
  const q = query.trim().toLowerCase();
  const shown = products.filter(
    (p) => (!category || p.category === category) && (!q || [p.name, p.size, p.category, p.bin, p.itemNo, p.upc].some((v) => String(v || "").toLowerCase().includes(q)))
  );
  return { query, setQuery, category, setCategory, categories, shown };
}

function SearchBar({ search, id }) {
  return (
    <div className="flex flex-col gap-2">
      <input
        id={id}
        type="search"
        className="input-3d !py-2"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        placeholder="Search name, bin or item #"
        aria-label="Search the catalog"
        autoComplete="off"
      />
      {search.categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label="Category">
          {["", ...search.categories].map((c) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={search.category === c}
              onClick={() => search.setCategory(c)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${search.category === c ? "border-brand-teal bg-brand-teal/15 text-brand-teal" : "border-brand-navydeep/30 text-brand-navydeep/80"}`}
            >
              {c || "All"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- picking products while making a list ----------

// counts: { productId: how many are on the list }.
export function CatalogPicker({ products, counts, onPick }) {
  const search = useSearch(products);
  const [open, setOpen] = useState(true);
  if (!products.length) return null;
  return (
    <section className="glass-panel px-3 py-3 flex flex-col gap-3" aria-labelledby="pick-h">
      <button type="button" className="flex items-center justify-between text-sm font-semibold text-brand-navy" aria-expanded={open} aria-controls="pick-body" onClick={() => setOpen((o) => !o)}>
        <span id="pick-h">
          <i className="fa-solid fa-store" aria-hidden="true"></i> Tap to add from the catalog ({products.length})
        </span>
        <i className={`fa-solid fa-chevron-down text-xs transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true"></i>
      </button>
      {open && (
        <div id="pick-body" className="flex flex-col gap-3">
          <SearchBar search={search} id="pick-search" />
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[26rem] overflow-y-auto pr-1">
            {search.shown.map((p) => {
              const n = counts[p.id] || 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className={`relative w-full h-full rounded-xl border p-2 flex flex-col items-center gap-1 text-center ${n ? "border-brand-teal bg-brand-teal/10" : "border-brand-navydeep/20"}`}
                    aria-label={`Add ${p.name}${n ? `, ${n} on the list` : ""}`}
                  >
                    {n > 0 && <span className="absolute top-1 right-1 rounded-full bg-brand-teal text-white text-xs font-semibold min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center">{n}</span>}
                    <ProductThumb product={p} size="h-20 w-20" />
                    <span className="text-xs font-semibold text-brand-navy leading-tight line-clamp-2">{p.name}</span>
                    {p.size && <span className="text-[11px] text-brand-navydeep/70 leading-tight">{p.size}</span>}
                    {p.price && <span className="text-[11px] text-brand-teal">{productPriceLine(p).split(" · ")[0]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {!search.shown.length && <p className="text-center text-sm text-brand-navydeep/75">Nothing matches.</p>}
        </div>
      )}
    </section>
  );
}

// ---------- managing the catalog (managers) ----------

const BLANK = { id: "", store: "Restaurant Depot", name: "", size: "", category: "", bin: "", itemNo: "", upc: "", unit: "each", price: "", estEach: "", casePrice: "", caseQty: "", priceNote: "", photo: "" };

export function CatalogManager({ products, photos, onBack, onSaved, onDeleted }) {
  const search = useSearch(products);
  const [editing, setEditing] = useState(null); // a product, or BLANK for a new one

  if (editing) {
    return (
      <ProductForm
        product={editing}
        photos={photos}
        categories={search.categories}
        onCancel={() => setEditing(null)}
        onSaved={(p) => {
          onSaved(p);
          setEditing(null);
        }}
        onDeleted={(id) => {
          onDeleted(id);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-md flex flex-col gap-5">
      <button type="button" className={`${OUTLINE} self-start`} onClick={onBack}>
        <i className="fa-solid fa-arrow-left" aria-hidden="true"></i> All lists
      </button>
      <section className="glass-card p-5 flex flex-col gap-4" aria-labelledby="cat-h">
        <h2 id="cat-h" className="field-label !mb-0 justify-center">
          <i className="fa-solid fa-store" aria-hidden="true"></i> Product catalog ({products.length})
        </h2>
        <p className="text-sm text-center text-brand-navydeep/80">Things you buy again and again. When making a list, tap them instead of typing.</p>
        <button type="button" className="btn-3d justify-center" onClick={() => setEditing(BLANK)}>
          <i className="fa-solid fa-plus" aria-hidden="true"></i> Add a product
        </button>
        {products.length > 0 && <SearchBar search={search} id="cat-search" />}
        <ul className="flex flex-col divide-y divide-brand-navydeep/15">
          {search.shown.map((p) => (
            <li key={p.id}>
              <button type="button" className="w-full text-left py-2 flex items-center gap-3" onClick={() => setEditing(p)}>
                <ProductThumb product={p} size="h-14 w-14" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-brand-navy leading-tight">{p.name}</span>
                  <span className="block text-xs text-brand-navydeep/75">{[p.size, p.category].filter(Boolean).join(" · ")}</span>
                  {p.price && <span className="block text-xs text-brand-teal">{productPriceLine(p)}</span>}
                  {whereToFind(p) && <span className="block text-[11px] text-brand-navydeep/65">{whereToFind(p)}</span>}
                </span>
                <i className="fa-solid fa-pen text-xs text-brand-navydeep/60" aria-hidden="true"></i>
              </button>
            </li>
          ))}
        </ul>
        {!products.length && <p className="text-center text-sm text-brand-navydeep/75">No products yet.</p>}
      </section>
    </div>
  );
}

function Field({ id, label, icon, children, className = "" }) {
  return (
    <div className={`field-group !mb-0 min-w-0 ${className}`}>
      <label htmlFor={id} className="field-label">
        {icon && <i className={`fa-solid ${icon}`} aria-hidden="true"></i>} {label}
      </label>
      {children}
    </div>
  );
}

function ProductForm({ product, photos, categories, onCancel, onSaved, onDeleted }) {
  const [form, setForm] = useState(product);
  const [image, setImage] = useState(""); // a new picture, as a data URL
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setMoney = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value.replace(/[^\d.]/g, "") }));
  const isNew = !product.id;

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setImage(await shrinkPhoto(file, { maxSide: 600, transparent: true }));
    } catch {
      Swal.fire({ ...ALERT, title: "Picture not added", text: "That file couldn't be opened. Use a PNG, JPG or WebP picture.", icon: "error" });
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim()) return Swal.fire({ ...ALERT, title: "Name the product", icon: "info" });
    setSaving(true);
    try {
      const { photo: _photo, ...fields } = form;
      const res = await saveProduct(fields, image || undefined);
      onSaved(res.product);
    } catch (err) {
      Swal.fire({ ...ALERT, title: "Product not saved", text: friendlyMessage(err, "Couldn't save the product."), icon: "error" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const { isConfirmed } = await Swal.fire({
      ...ALERT,
      title: `Delete ${product.name}?`,
      text: "It comes off the catalog. Lists that already have it keep it.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc2626",
      focusCancel: true,
    });
    if (!isConfirmed) return;
    setSaving(true);
    try {
      await deleteProduct(product.id);
      onDeleted(product.id);
    } catch (err) {
      Swal.fire({ ...ALERT, title: "Not deleted", text: friendlyMessage(err, "Couldn't delete the product."), icon: "error" });
      setSaving(false);
    }
  };

  const preview = image ? { ...form, photo: image } : form;

  return (
    <form onSubmit={save} className="glass-card w-full max-w-md p-5 sm:p-6 flex flex-col gap-4" aria-labelledby="prod-h">
      <h2 id="prod-h" className="field-label !mb-0 justify-center">
        <i className={`fa-solid ${isNew ? "fa-plus" : "fa-pen"}`} aria-hidden="true"></i> {isNew ? "Add a product" : "Change product"}
      </h2>

      <div className="flex items-center gap-4">
        <ProductThumb product={preview} size="h-28 w-28" />
        <div className="flex flex-col gap-2 min-w-0">
          {photos ? (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pickPhoto} />
              <button type="button" className={OUTLINE} onClick={() => fileRef.current?.click()}>
                <i className="fa-solid fa-image" aria-hidden="true"></i> {preview.photo ? "Change picture" : "Add picture"}
              </button>
              <p className="text-xs text-brand-navydeep/70">Square PNG or WebP with a see-through background works best. Any size is fine.</p>
            </>
          ) : (
            <p className="text-xs text-brand-navydeep/70">Pictures need photo storage set up.</p>
          )}
        </div>
      </div>

      <Field id="p-name" label="Name" icon="fa-tag">
        <input id="p-name" className="input-3d" value={form.name} onChange={set("name")} placeholder="e.g. Open Pit BBQ Sauce" autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="p-size" label="Size / pack">
          <input id="p-size" className="input-3d" value={form.size} onChange={set("size")} placeholder="1 gallon" autoComplete="off" />
        </Field>
        <Field id="p-cat" label="Category">
          <input id="p-cat" className="input-3d" list="p-cats" value={form.category} onChange={set("category")} placeholder="Sauces" autoComplete="off" />
          <datalist id="p-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field id="p-bin" label="Bin">
          <input id="p-bin" className="input-3d !px-2" inputMode="numeric" value={form.bin} onChange={set("bin")} autoComplete="off" />
        </Field>
        <Field id="p-item" label="Item #">
          <input id="p-item" className="input-3d !px-2" inputMode="numeric" value={form.itemNo} onChange={set("itemNo")} autoComplete="off" />
        </Field>
        <Field id="p-upc" label="UPC">
          <input id="p-upc" className="input-3d !px-2" inputMode="numeric" value={form.upc} onChange={set("upc")} autoComplete="off" />
        </Field>
      </div>

      <fieldset className="glass-panel px-3 py-3 flex flex-col gap-3">
        <legend className="sr-only">Price</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="p-unit" label="Sold by">
            <select id="p-unit" className="input-3d" value={form.unit} onChange={set("unit")}>
              <option value="each">Each</option>
              <option value="lb">The pound (lb)</option>
            </select>
          </Field>
          <Field id="p-price" label={form.unit === "lb" ? "Price per lb" : "Price each"} icon="fa-dollar-sign">
            <input id="p-price" className="input-3d" inputMode="decimal" value={form.price} onChange={setMoney("price")} placeholder={form.unit === "lb" ? "5.59" : "22.65"} autoComplete="off" />
          </Field>
        </div>
        {form.unit === "lb" ? (
          <Field id="p-est" label="About how much one costs">
            <input id="p-est" className="input-3d" inputMode="decimal" value={form.estEach} onChange={setMoney("estEach")} placeholder="89.44" autoComplete="off" />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field id="p-case" label="Case price">
              <input id="p-case" className="input-3d" inputMode="decimal" value={form.casePrice} onChange={setMoney("casePrice")} placeholder="79.99" autoComplete="off" />
            </Field>
            <Field id="p-caseqty" label="How many in a case">
              <input id="p-caseqty" className="input-3d" inputMode="numeric" value={form.caseQty} onChange={(e) => setForm((f) => ({ ...f, caseQty: e.target.value.replace(/\D/g, "") }))} placeholder="4" autoComplete="off" />
            </Field>
          </div>
        )}
        <Field id="p-note" label="Price note (optional)">
          <input id="p-note" className="input-3d" value={form.priceNote} onChange={set("priceNote")} placeholder="e.g. $5.59/lb when buying 80 lb or more" autoComplete="off" />
        </Field>
      </fieldset>

      <Field id="p-store" label="Store" icon="fa-store">
        <input id="p-store" className="input-3d" value={form.store} onChange={set("store")} autoComplete="off" />
      </Field>

      <div className={`grid gap-3 ${isNew ? "grid-cols-2" : "grid-cols-3"}`}>
        <button type="button" className={OUTLINE} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        {!isNew && (
          <button type="button" className="btn-3d !py-2 !px-3 text-sm justify-center !bg-none !bg-transparent border border-brand-error/60 text-brand-error disabled:opacity-60" onClick={remove} disabled={saving}>
            <i className="fa-solid fa-trash" aria-hidden="true"></i> Delete
          </button>
        )}
        <button type="submit" className="btn-3d justify-center disabled:opacity-60" disabled={saving} aria-busy={saving}>
          <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true"></i> {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
