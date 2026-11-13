import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

// The picture full size, over the page, with what's useful at the store.
// Tap outside, the ×, or press Escape to close. Rendered at the end of
// <body> so it isn't caught inside a card, a tilt or a checkbox label.
export function ImageViewer({ product, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const details = [product.size, whereToFind(product), productPriceLine(product)].filter(Boolean);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={product.name} className="fixed inset-0 z-[1000] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close picture" className="absolute -top-2 right-0 h-10 w-10 rounded-full bg-white/15 text-white text-lg">
          <i className="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
        <img src={productSrc(product)} alt={product.name} className="w-full max-h-[65vh] object-contain mt-8" />
        <div className="text-center text-white">
          <p className="font-semibold text-lg leading-tight">{product.name}</p>
          {details.map((d) => (
            <p key={d} className="text-sm text-white/80">
              {d}
            </p>
          ))}
          {product.store && <p className="text-xs text-white/60 mt-1">{product.store}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

// A product picture you can tap to see bigger. Works inside a checkbox
// label too: the tap opens the picture instead of ticking the box.
export function ZoomThumb({ product, size = "h-12 w-12" }) {
  const [open, setOpen] = useState(false);
  if (!productSrc(product)) return <ProductThumb product={product} size={size} />;
  return (
    <>
      <button
        type="button"
        className="shrink-0 rounded-lg"
        aria-label={`See a bigger picture of ${product.name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ProductThumb product={product} size={size} />
      </button>
      {open && <ImageViewer product={product} onClose={() => setOpen(false)} />}
    </>
  );
}

// "Bin 3002 · Item #25849": what helps find it in the store.
export const whereToFind = (p) => [p?.bin && `Bin ${p.bin}`, p?.itemNo && `Item #${p.itemNo}`].filter(Boolean).join(" · ");

const storeOf = (p) => String(p?.store || "").trim() || "Restaurant Depot";

// Products grouped by store (business), stores A–Z: [{ store, products }].
export function byStore(products) {
  const groups = new Map();
  for (const p of products) {
    const store = storeOf(p);
    if (!groups.has(store)) groups.set(store, []);
    groups.get(store).push(p);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([store, list]) => ({ store, products: list }));
}

function useSearch(products) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [store, setStore] = useState("");
  const stores = useMemo(() => [...new Set(products.map(storeOf))].sort(), [products]);
  const inStore = store ? products.filter((p) => storeOf(p) === store) : products;
  const categories = [...new Set(inStore.map((p) => p.category).filter(Boolean))].sort();
  const q = query.trim().toLowerCase();
  const shown = inStore.filter(
    (p) => (!category || p.category === category) && (!q || [p.name, p.size, p.category, p.bin, p.itemNo, p.upc, p.store].some((v) => String(v || "").toLowerCase().includes(q)))
  );
  const pickStore = (s) => {
    setStore(s);
    setCategory("");
  };
  return { query, setQuery, category, setCategory, categories, store, setStore: pickStore, stores, shown, groups: byStore(shown) };
}

// A store's heading above its products.
function StoreHeading({ store, count }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
      <i className="fa-solid fa-store text-brand-teal" aria-hidden="true"></i>
      <span className="min-w-0 truncate">{store}</span>
      <span className="text-xs font-normal text-brand-navydeep/65">({count})</span>
    </h3>
  );
}

function Chips({ label, options, value, onChange, allLabel }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar" role="group" aria-label={label}>
      {["", ...options].map((c) => (
        <button
          key={c || "all"}
          type="button"
          aria-pressed={value === c}
          onClick={() => onChange(c)}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs ${value === c ? "border-brand-teal bg-brand-teal/15 text-brand-teal" : "border-brand-navydeep/30 text-brand-navydeep/80"}`}
        >
          {c || allLabel}
        </button>
      ))}
    </div>
  );
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
      {search.stores.length > 1 && <Chips label="Store" options={search.stores} value={search.store} onChange={search.setStore} allLabel="All stores" />}
      {search.categories.length > 1 && <Chips label="Category" options={search.categories} value={search.category} onChange={search.setCategory} allLabel="All" />}
    </div>
  );
}

// ---------- picking products while making a list ----------

// counts: { productId: how many are on the list }.
export function CatalogPicker({ products, counts, onPick }) {
  const search = useSearch(products);
  const [open, setOpen] = useState(true);
  const [zoomed, setZoomed] = useState(null);
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
          <div className="flex flex-col gap-4 max-h-[28rem] overflow-y-auto pr-1">
            {search.groups.map((group) => (
              <section key={group.store} className="flex flex-col gap-2" aria-label={group.store}>
                <StoreHeading store={group.store} count={group.products.length} />
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {group.products.map((p) => {
              const n = counts[p.id] || 0;
              return (
                <li key={p.id} className="relative">
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
                  {productSrc(p) && (
                    <button
                      type="button"
                      onClick={() => setZoomed(p)}
                      aria-label={`See a bigger picture of ${p.name}`}
                      className="absolute top-1 left-1 h-7 w-7 rounded-full bg-black/45 text-white text-xs flex items-center justify-center"
                    >
                      <i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true"></i>
                    </button>
                  )}
                </li>
              );
            })}
                </ul>
              </section>
            ))}
          </div>
          {!search.shown.length && <p className="text-center text-sm text-brand-navydeep/75">Nothing matches.</p>}
        </div>
      )}
      {zoomed && <ImageViewer product={zoomed} onClose={() => setZoomed(null)} />}
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
        stores={search.stores}
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
        {search.groups.map((group) => (
          <section key={group.store} className="flex flex-col gap-1" aria-label={group.store}>
            <StoreHeading store={group.store} count={group.products.length} />
            <ul className="flex flex-col divide-y divide-brand-navydeep/15">
              {group.products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <ZoomThumb product={p} size="h-14 w-14" />
              <button type="button" className="min-w-0 flex-1 text-left flex items-center gap-3" onClick={() => setEditing(p)} aria-label={`Change ${p.name}`}>
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
          </section>
        ))}
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

function ProductForm({ product, photos, categories, stores, onCancel, onSaved, onDeleted }) {
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
        <ZoomThumb product={preview} size="h-28 w-28" />
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
        <input id="p-store" className="input-3d" list="p-stores" value={form.store} onChange={set("store")} placeholder="Restaurant Depot" autoComplete="off" />
        <datalist id="p-stores">
          {stores.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="text-xs text-brand-navydeep/70 mt-1">Products are grouped by store in the catalog and on shopping lists.</p>
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
