import { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import { addExtraItem, addReceipt, createList, deleteList, editList, finishTrip, loadShopping, readReceipt, receiptSrc, removeReceipt, reopenList, saveBarcode, setItem, DEMO_BARCODE_HINT } from "../api/shopping.js";
import BarcodeScanner from "../components/BarcodeScanner.jsx";
import { isDemo } from "../lib/demo.js";
import { useAuth } from "../lib/auth.jsx";
import { friendlyMessage } from "../lib/errors.js";
import { CatalogManager, CatalogPicker, ZoomThumb, whereToFind } from "../components/ProductCatalog.jsx";
import { addProduct, barcodeMatches, defaultStore, dollars, groupItemsByStore, parseTextList, regularStores, storesOf, expectedCents, itemsFromText, monthKey, progress, shrinkPhoto, spendingByMonth, toCents } from "../lib/shopping.js";

// Shopping lists. A manager (the owner, or an employee with Shopping lists
// + "Can edit & delete") writes a list and gives it to someone, or to
// anyone. The person shopping checks things off at the store, snaps the
// receipt, types its total and finishes the trip. Managers see every trip
// and what each month cost. Saved in the sheet's "Shopping" tab; photos in
// private storage (api/shopping.js).

const ALERT = { theme: "dark" };
const OUTLINE = "btn-3d !py-2 !px-3 text-sm justify-center !bg-none !bg-transparent border border-brand-navy/40 text-brand-navy disabled:opacity-60";
const DANGER = "btn-3d !py-2 !px-3 text-sm justify-center !bg-none !bg-transparent border border-brand-error/60 text-brand-error disabled:opacity-60";

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const fail = (title, err, fallback) => Swal.fire({ ...ALERT, title, text: friendlyMessage(err, fallback), icon: "error" });

export default function ShoppingPage() {
  const { can } = useAuth();
  const [data, setData] = useState({ lists: [], products: [], catalog: false, people: [], manager: false, photos: false, reader: false });
  const [state, setState] = useState({ loading: true, error: "" });
  // "home", "catalog", { open: id } or { edit: id | null } (null = a new list).
  const [view, setView] = useState("home");

  const load = useCallback(
    () =>
      loadShopping()
        .then((d) => {
          setData(d);
          setState({ loading: false, error: "" });
        })
        .catch((err) => {
          console.error("loadShopping failed:", err);
          setState({ loading: false, error: friendlyMessage(err, "Couldn't load the shopping lists.") });
        }),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  // Swap in the server's copy of one list after a change.
  const replace = (list) => setData((d) => ({ ...d, lists: d.lists.some((l) => l.id === list.id) ? d.lists.map((l) => (l.id === list.id ? list : l)) : [...d.lists, list] }));
  const drop = (id) => setData((d) => ({ ...d, lists: d.lists.filter((l) => l.id !== id) }));
  const sortByName = (list) => list.sort((a, b) => a.name.localeCompare(b.name));
  const saveProductLocally = (p) => setData((d) => ({ ...d, products: sortByName(d.products.some((x) => x.id === p.id) ? d.products.map((x) => (x.id === p.id ? p : x)) : [...d.products, p]) }));
  const dropProduct = (id) => setData((d) => ({ ...d, products: d.products.filter((x) => x.id !== id) }));

  const prices = data.manager || can("prices");
  const openList = typeof view === "object" && view.open ? data.lists.find((l) => l.id === view.open) : null;
  const editing = typeof view === "object" && "edit" in view;

  const goHome = () => {
    setView("home");
    window.scrollTo({ top: 0 });
  };

  return (
    <Layout blobs={["bg-brand-cactus w-72 h-72 -top-10 -right-10 animate-float-slow", "bg-brand-gold w-64 h-64 bottom-0 -left-16 animate-float"]}>
      <SiteNav className="mb-6" />
      <PageHeader title="Shopping" subtitle={data.manager ? "Lists • Receipts • Spending" : "Your shopping lists"} />

      {state.loading ? (
        <p className="glass-card w-full max-w-md p-6 text-center text-sm text-brand-navydeep/80">Loading…</p>
      ) : state.error ? (
        <div className="glass-card w-full max-w-md p-6 text-center flex flex-col gap-3">
          <p className="text-sm text-brand-navydeep/80">
            {state.error} If this keeps happening, check that the sheet has a tab named <strong>Shopping</strong>.
          </p>
          <button type="button" className={OUTLINE} onClick={load}>
            <i className="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Try again
          </button>
        </div>
      ) : view === "catalog" ? (
        <CatalogManager products={data.products} photos={data.photos} onBack={goHome} onSaved={saveProductLocally} onDeleted={dropProduct} />
      ) : editing ? (
        <ListEditor
          list={view.edit ? data.lists.find((l) => l.id === view.edit) : null}
          people={data.people}
          manager={data.manager}
          prices={prices}
          products={data.products}
          onCancel={() => (view.edit ? setView({ open: view.edit }) : goHome())}
          onSaved={(list) => {
            replace(list);
            setView({ open: list.id });
          }}
        />
      ) : openList ? (
        <TripView list={openList} products={data.products} manager={data.manager} prices={prices} photos={data.photos} reader={data.reader} onBack={goHome} onChange={replace} onEdit={() => setView({ edit: openList.id })} onDeleted={(id) => (drop(id), goHome())} onCatalogChanged={load} />
      ) : (
        <Home data={data} prices={prices} onOpen={(id) => setView({ open: id })} onNew={() => setView({ edit: null })} onCatalog={() => setView("catalog")} onRefresh={load} />
      )}
    </Layout>
  );
}

// ---------- the list of lists ----------

function Home({ data, prices, onOpen, onNew, onCatalog, onRefresh }) {
  const open = data.lists.filter((l) => l.status === "Open").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const months = spendingByMonth(data.lists);
  const thisMonth = months.find((m) => m.key === monthKey(new Date().toISOString()));
  const [shown, setShown] = useState(1); // months of finished trips shown

  return (
    <div className="w-full max-w-md flex flex-col gap-6">
      <div className="grid grid-cols-[1fr_auto] gap-3 stagger-in">
        <button type="button" className="btn-3d justify-center" onClick={onNew}>
          <i className="fa-solid fa-plus" aria-hidden="true"></i> New shopping list
        </button>
        <button type="button" className={OUTLINE} onClick={onRefresh} aria-label="Refresh lists" title="Refresh lists">
          <i className="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
        </button>
        {data.manager &&
          (data.catalog ? (
            <button type="button" className={`${OUTLINE} col-span-2`} onClick={onCatalog}>
              <i className="fa-solid fa-store" aria-hidden="true"></i> Product catalog ({data.products.length})
            </button>
          ) : (
            <p className="col-span-2 text-xs text-center text-brand-navydeep/70">
              To pick things from a catalog instead of typing, add a tab named <strong>Products</strong> to the sheet.
            </p>
          ))}
      </div>

      {prices && (
        <section className="glass-card p-5 text-center stagger-in" aria-label="Spent this month">
          <p className="field-label !mb-1 justify-center">
            <i className="fa-solid fa-receipt" aria-hidden="true"></i> Spent this month
          </p>
          <p className="text-3xl font-semibold text-brand-navy">{dollars(thisMonth?.cents || 0)}</p>
          <p className="text-sm text-brand-navydeep/75">
            {thisMonth ? `${thisMonth.trips.length} trip${thisMonth.trips.length === 1 ? "" : "s"}` : "No finished trips yet"}
          </p>
        </section>
      )}

      <section className="glass-card p-5 stagger-in" aria-labelledby="open-h">
        <h2 id="open-h" className="field-label !mb-3 justify-center">
          <i className="fa-solid fa-cart-shopping" aria-hidden="true"></i> To buy
        </h2>
        {!open.length ? (
          <p className="text-center text-sm text-brand-navydeep/80">{data.manager ? "No open lists. Make one with New shopping list." : "Nothing to buy right now. Got a list by text? Press New shopping list and paste it."}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((l) => {
              const p = progress(l);
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => onOpen(l.id)} className="glass-panel w-full text-left px-4 py-3 flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-brand-navy truncate">{l.title}</span>
                      <span className="block text-xs text-brand-navydeep/75">
                        For {l.assignedName || "anyone"} · {shortDate(l.createdAt)}
                        {l.receipts.length ? ` · ${l.receipts.length} receipt${l.receipts.length === 1 ? "" : "s"}` : ""}
                      </span>
                      {storesOf(l.items).length > 0 && (
                        <span className="block text-xs text-brand-teal truncate">
                          <i className="fa-solid fa-store" aria-hidden="true"></i> {storesOf(l.items).join(" · ")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-brand-teal">
                      {p.got}/{p.total}
                    </span>
                    <i className="fa-solid fa-chevron-right text-xs text-brand-navydeep/60" aria-hidden="true"></i>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {months.length > 0 && (
        <section className="glass-card p-5 stagger-in" aria-labelledby="done-h">
          <h2 id="done-h" className="field-label !mb-3 justify-center">
            <i className="fa-solid fa-circle-check" aria-hidden="true"></i> Finished trips
          </h2>
          <div className="flex flex-col gap-4">
            {months.slice(0, shown).map((m) => (
              <div key={m.key}>
                <p className="flex justify-between text-sm font-semibold text-brand-navydeep/85 mb-2">
                  <span>{m.label}</span>
                  {prices && <span>{dollars(m.cents)}</span>}
                </p>
                <ul className="flex flex-col divide-y divide-brand-navydeep/15">
                  {m.trips.map((l) => (
                    <li key={l.id}>
                      <button type="button" onClick={() => onOpen(l.id)} className="w-full text-left py-2 flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-brand-navy truncate">{l.title}</span>
                          <span className="block text-xs text-brand-navydeep/75">
                            {l.doneBy || "—"} · {shortDate(l.doneAt)}
                            {l.receipts.length ? "" : " · no receipt photo"}
                          </span>
                        </span>
                        {l.spent && <span className="shrink-0 text-sm font-semibold text-brand-navy">{dollars(toCents(l.spent))}</span>}
                        <i className="fa-solid fa-chevron-right text-xs text-brand-navydeep/60" aria-hidden="true"></i>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {months.length > shown && (
            <button type="button" className={`${OUTLINE} w-full mt-4`} onClick={() => setShown((n) => n + 3)}>
              Show earlier months
            </button>
          )}
        </section>
      )}
    </div>
  );
}

// ---------- one trip: check off, receipts, finish ----------

function TripView({ list, products = [], manager, prices, photos, reader, onBack, onChange, onEdit, onDeleted, onCatalogChanged }) {
  const productById = new Map(products.map((x) => [x.id, x]));
  // One line of the list: check box, picture, name, where to find it.
  const renderItem = (item) => {
    const product = productById.get(item.productId);
    return (
      <li key={item.id} className="py-2 flex items-start gap-3">
        <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer py-1">
          <input
            type="checkbox"
            className="mt-0.5 h-6 w-6 shrink-0 accent-[rgb(var(--brand-teal))]"
            checked={item.got}
            disabled={locked}
            onChange={() => mark(item, { got: !item.got, out: false })}
          />
          {product && <ZoomThumb product={product} size="h-12 w-12" />}
          <span className="min-w-0">
            <span className={`block text-brand-navy break-words ${item.got ? "line-through opacity-60" : ""} ${item.out ? "opacity-60" : ""}`}>
              {item.qty && <span className="font-semibold">{item.qty} </span>}
              {item.name}
              {item.extra && <span className="ml-2 rounded-full border border-brand-gold/60 px-1.5 text-[10px] uppercase tracking-wide text-brand-gold">Extra</span>}
              {item.out && <span className="ml-2 rounded-full border border-brand-error/60 px-1.5 text-[10px] uppercase tracking-wide text-brand-error">Out of stock</span>}
            </span>
            {item.note && <span className="block text-xs text-brand-navydeep/75">{item.note}</span>}
            {product && whereToFind(product) && (
              <span className="block text-xs text-brand-teal">
                <i className="fa-solid fa-location-dot" aria-hidden="true"></i> {whereToFind(product)}
              </span>
            )}
            {prices && item.price && <span className="block text-xs text-brand-navydeep/70">About {dollars(toCents(item.price))}</span>}
          </span>
        </label>
        {!locked && !item.got && product && (
          <button
            type="button"
            className="shrink-0 h-8 w-8 rounded-full border border-brand-teal/50 text-brand-teal text-sm"
            onClick={() => setScanFor({ item })}
            aria-label={`Scan ${item.name} to check it's the right one`}
            title="Scan to check it's the right one"
          >
            <i className="fa-solid fa-barcode" aria-hidden="true"></i>
          </button>
        )}
        {!locked && !item.got && !item.extra && (
          <button
            type="button"
            className={`shrink-0 rounded-full border px-2 py-1 text-xs ${item.out ? "border-brand-error/60 text-brand-error" : "border-brand-navydeep/30 text-brand-navydeep/75"}`}
            aria-pressed={item.out}
            onClick={() => mark(item, { got: false, out: !item.out })}
            title="The store didn't have it"
          >
            {item.out ? "Out" : "None?"}
          </button>
        )}
      </li>
    );
  };
  // Grouped by store when items come from the catalog; typed ones go last.
  const sections = groupItemsByStore(list.items, productById);

  const [busy, setBusy] = useState("");
  const [extra, setExtra] = useState({ name: "", qty: "", store: "" });
  // The stores on this trip, so an extra item or a receipt goes with the right one.
  const tripStores = sections.map((sec) => sec.store).filter(Boolean);
  const [receiptStore, setReceiptStore] = useState("");
  // Default: the first store that has no receipt photo yet.
  const photoStore = tripStores.includes(receiptStore) ? receiptStore : tripStores.find((st) => !list.receipts.some((r) => r.store === st)) || tripStores[0] || "";
  const extraStore = tripStores.includes(extra.store) ? extra.store : tripStores[0] || "";
  const [spent, setSpent] = useState("");
  // Once someone types the total themselves, the app stops filling it in.
  const [spentTyped, setSpentTyped] = useState(false);
  const fileRef = useRef(null);
  const done = list.status === "Done";
  const locked = done && !manager;
  const p = progress(list);
  const expected = prices ? expectedCents(list) : 0;

  const run = async (key, action, failTitle, fallback) => {
    setBusy(key);
    try {
      const res = await action();
      if (res?.list) onChange(res.list);
      return res;
    } catch (err) {
      fail(failTitle, err, fallback);
      return null;
    } finally {
      setBusy("");
    }
  };

  // Check marks show right away and save one at a time, in order, so fast
  // taps at the store can't overwrite each other. The server's copy is
  // shown once the last one is saved; a failed one is put back.
  const latest = useRef(list);
  latest.current = list;
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);
  const withItem = (id, fields) => ({ ...latest.current, items: latest.current.items.map((i) => (i.id === id ? { ...i, ...fields } : i)) });
  const mark = (item, next) => {
    pending.current += 1;
    onChange(withItem(item.id, next));
    queue.current = queue.current.then(async () => {
      try {
        const res = await setItem(list.id, item.id, next);
        pending.current -= 1;
        if (!pending.current && res?.list) onChange(res.list);
      } catch (err) {
        pending.current -= 1;
        onChange(withItem(item.id, { got: item.got, out: item.out }));
        fail("Not saved", err, "Couldn't save that check mark.");
      }
    });
  };

  // ---------- barcode scanning: make sure the right product is picked ----------
  // scanFor: null (closed), { item } (check one item), or { any: true }
  // (scan whatever was picked; the app finds it on the list).
  const [scanFor, setScanFor] = useState(null);
  const toast = (title, icon = "success") => Swal.fire({ ...ALERT, toast: true, position: "top", title, icon, timer: 2200, showConfirmButton: false });
  const catalogFor = (code) => products.find((x) => x.upc && barcodeMatches(code, x.upc));

  const onScanned = async (code) => {
    const target = scanFor?.item;
    setScanFor(null);
    if (target) {
      const product = productById.get(target.productId);
      if (!product) return;
      if (!product.upc) {
        // First time: teach the catalog this product's barcode.
        const { isConfirmed } = await Swal.fire({
          ...ALERT,
          title: "Save this barcode?",
          text: `${product.name} doesn't have a barcode in the catalog yet. Save ${code} as its barcode, so it can be checked next time?`,
          icon: "question",
          showCancelButton: true,
          confirmButtonText: "Save and tick it",
          cancelButtonText: "Not now",
        });
        if (!isConfirmed) return;
        if (await run("barcode", () => saveBarcode(product.id, code), "Barcode not saved", "Couldn't save the barcode.")) {
          mark(target, { got: true, out: false });
          onCatalogChanged?.();
          toast(`Saved. ${product.name} ticked off`);
        }
        return;
      }
      if (barcodeMatches(code, product.upc)) {
        mark(target, { got: true, out: false });
        toast(`Right one: ${product.name}`);
        return;
      }
      const other = catalogFor(code);
      const { isConfirmed, isDenied } = await Swal.fire({
        ...ALERT,
        title: `That's not ${product.name}`,
        html: `You scanned ${other ? `<strong>${other.name.replace(/</g, "&lt;")}</strong>` : "a different product"} <small>(${code})</small>.<br>Check the shelf for the right one.`,
        icon: "error",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: "Scan again",
        denyButtonText: "It's right, tick it",
        cancelButtonText: "Close",
      });
      if (isConfirmed) setScanFor({ item: target });
      if (isDenied) mark(target, { got: true, out: false });
      return;
    }
    // Scanned without picking an item first: find it on the list.
    const hits = list.items.filter((i) => {
      const pr = productById.get(i.productId);
      return pr?.upc && barcodeMatches(code, pr.upc);
    });
    const open = hits.find((i) => !i.got);
    if (open) {
      mark(open, { got: true, out: false });
      toast(`${open.name} ticked off`);
      return;
    }
    if (hits.length) {
      toast(`${hits[0].name} is already ticked off`, "info");
      return;
    }
    const other = catalogFor(code);
    if (other) {
      const { isConfirmed } = await Swal.fire({
        ...ALERT,
        title: "Not on this list",
        text: `That's ${other.name}. It isn't on this list.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Add it as extra",
        cancelButtonText: "Put it back",
      });
      if (isConfirmed) await run("extra", () => addExtraItem(list.id, other.name, "1", String(other.store || "").trim() || defaultStore()), "Not added", "Couldn't add it to the list.");
      return;
    }
    Swal.fire({ ...ALERT, title: "Not in the catalog", text: `Barcode ${code} isn't in the catalog and doesn't match anything on this list. If it's the right product, tick it by hand.`, icon: "info" });
  };
  const canScan = !locked && list.items.some((i) => productById.has(i.productId));

  const addExtra = async (e) => {
    e.preventDefault();
    if (!extra.name.trim()) return;
    const res = await run("extra", () => addExtraItem(list.id, extra.name.trim(), extra.qty.trim(), extraStore), "Not added", "Couldn't add it to the list.");
    if (res) setExtra((x) => ({ name: "", qty: "", store: x.store }));
  };

  const takePhoto = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    for (const file of files) {
      let image;
      try {
        image = await shrinkPhoto(file);
      } catch (err) {
        console.error("shrinkPhoto failed:", err);
        Swal.fire({ ...ALERT, title: "Photo not added", text: "That picture couldn't be opened. Try taking it again.", icon: "error" });
        return;
      }
      const res = await run("photo", () => addReceipt(list.id, image, photoStore), "Photo not saved", "Couldn't save the receipt photo.");
      if (!res) return;
      const added = res.list?.receipts?.[res.list.receipts.length - 1];
      if (reader && added) await read(added.path);
    }
  };

  // Reads a photo with AI. The receipt's total goes in Receipt total if
  // nothing's typed there yet (they can still change it).
  const read = async (path) => {
    const res = await run(`read:${path}`, () => readReceipt(list.id, path), "Receipt not read", "Couldn't read the receipt.");
    // Receipt total = every receipt read so far added up (one per store).
    const totals = (res?.list?.receipts || []).map((r) => r.details?.total).filter((t) => t != null);
    if (totals.length && !spentTyped) setSpent((totals.reduce((a, b) => a + Math.round(b * 100), 0) / 100).toFixed(2));
    // Catalog prices were updated from this receipt: show the new ones.
    if (res?.details?.catalog?.length) onCatalogChanged?.();
  };

  const dropPhoto = async (path) => {
    const { isConfirmed } = await Swal.fire({ ...ALERT, title: "Remove this photo?", icon: "warning", showCancelButton: true, confirmButtonText: "Remove", confirmButtonColor: "#dc2626", focusCancel: true });
    if (isConfirmed) run(path, () => removeReceipt(list.id, path), "Not removed", "Couldn't remove the photo.");
  };

  const finish = async (e) => {
    e.preventDefault();
    if (!spent.trim() || toCents(spent) < 0 || Number.isNaN(Number(spent.replace(/[$,\s]/g, "")))) {
      Swal.fire({ ...ALERT, title: "Receipt total", text: "Type the total from the receipt, e.g. 84.37.", icon: "info" });
      return;
    }
    const warnings = [];
    if (p.left) warnings.push(`${p.left} thing${p.left === 1 ? " isn't" : "s aren't"} checked off.`);
    if (!list.receipts.length) warnings.push("There's no receipt photo.");
    const { isConfirmed } = await Swal.fire({
      ...ALERT,
      title: `Finish this trip? ${dollars(toCents(spent))}`,
      text: warnings.length ? warnings.join(" ") + " Finish anyway?" : "The manager will see it with the receipt.",
      icon: warnings.length ? "warning" : "question",
      showCancelButton: true,
      confirmButtonText: "Finish trip",
      cancelButtonText: "Not yet",
    });
    if (!isConfirmed) return;
    const res = await run("finish", () => finishTrip(list.id, spent), "Not finished", "Couldn't finish the trip.");
    if (res) {
      setSpent("");
      Swal.fire({ ...ALERT, title: "Trip finished", text: "Thanks! It's saved with the receipt.", icon: "success", timer: 1800, showConfirmButton: false });
      onBack();
    }
  };

  const remove = async () => {
    const { isConfirmed } = await Swal.fire({
      ...ALERT,
      title: `Delete "${list.title}"?`,
      text: "The list and its receipt photos are deleted for good.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-trash"></i> Delete',
      confirmButtonColor: "#dc2626",
      cancelButtonText: "Keep",
      focusCancel: true,
    });
    if (isConfirmed && (await run("delete", () => deleteList(list.id), "Not deleted", "Couldn't delete the list."))) onDeleted(list.id);
  };

  return (
    <div className="w-full max-w-md flex flex-col gap-5">
      <button type="button" className={`${OUTLINE} self-start`} onClick={onBack}>
        <i className="fa-solid fa-arrow-left" aria-hidden="true"></i> All lists
      </button>

      <section className="glass-card p-5 flex flex-col gap-3" aria-labelledby="trip-h">
        <div>
          <h2 id="trip-h" className="text-xl font-semibold text-brand-navy break-words">
            {list.title}
          </h2>
          <p className="text-sm text-brand-navydeep/75">
            For {list.assignedName || "anyone"} · made by {list.createdBy || "—"} {shortDate(list.createdAt)}
          </p>
          {done && (
            <p className="mt-2 inline-block rounded-full border border-brand-teal/60 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand-teal">
              Finished by {list.doneBy} · {shortDate(list.doneAt)}
              {list.spent ? ` · ${dollars(toCents(list.spent))}` : ""}
            </p>
          )}
        </div>
        {list.notes && (
          <p className="glass-panel px-3 py-2 text-sm text-brand-navydeep/90 whitespace-pre-line">
            <i className="fa-solid fa-note-sticky text-brand-gold" aria-hidden="true"></i> {list.notes}
          </p>
        )}

        <p className="text-sm font-semibold text-brand-navydeep/85" aria-live="polite">
          {p.got} of {p.total} bought{p.out ? ` · ${p.out} out of stock` : ""}
          {p.extras ? ` · ${p.extras} extra` : ""}
        </p>
        {canScan && (
          <button type="button" className={`${OUTLINE} w-full`} onClick={() => setScanFor({ any: true })}>
            <i className="fa-solid fa-barcode" aria-hidden="true"></i> Scan what you&apos;re picking
          </button>
        )}
        {scanFor && (
          <BarcodeScanner
            title={scanFor.item ? `Scan ${scanFor.item.name}` : "Scan what you're picking"}
            hint={`${scanFor.item ? "It's checked against the catalog." : "The app finds it on the list and ticks it off."}${isDemo() ? ` ${DEMO_BARCODE_HINT}` : ""}`}
            onCode={onScanned}
            onClose={() => setScanFor(null)}
          />
        )}

        {sections.map((section) => (
          <section key={section.store || "other"} aria-label={section.store || "Other items"}>
            {sections.length > 1 || section.store ? (
              <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-navy mt-1">
                <i className={`fa-solid ${section.store ? "fa-store text-brand-teal" : "fa-list text-brand-navydeep/60"}`} aria-hidden="true"></i>
                {section.store || "Other items"}
              </h3>
            ) : null}
            <ul className="flex flex-col divide-y divide-brand-navydeep/15">{section.items.map(renderItem)}</ul>
          </section>
        ))}
        {prices && expected > 0 && <p className="text-xs text-right text-brand-navydeep/70">Expected about {dollars(expected)}</p>}

        {!locked && (
          <form onSubmit={addExtra} className="grid grid-cols-[1fr_5.5rem_auto] gap-2 items-end" aria-label="Add something not on the list">
            <div className="field-group min-w-0 !mb-0">
              <label htmlFor="extra-name" className="text-xs text-brand-navydeep/75">
                Bought something not on the list?
              </label>
              <input id="extra-name" className="input-3d !py-2" value={extra.name} onChange={(e) => setExtra((x) => ({ ...x, name: e.target.value }))} placeholder="e.g. Ice" autoComplete="off" />
            </div>
            <input aria-label="How many" className="input-3d !py-2 min-w-0" value={extra.qty} onChange={(e) => setExtra((x) => ({ ...x, qty: e.target.value }))} placeholder="Qty" autoComplete="off" />
            <button type="submit" className={OUTLINE} disabled={busy === "extra" || !extra.name.trim()} aria-label="Add">
              <i className={`fa-solid ${busy === "extra" ? "fa-spinner fa-spin" : "fa-plus"}`} aria-hidden="true"></i>
            </button>
            {tripStores.length > 1 && (
              <StoreSelect id="extra-store" label="Bought at" stores={tripStores} value={extraStore} onChange={(v) => setExtra((x) => ({ ...x, store: v }))} className="col-span-3" />
            )}
          </form>
        )}
      </section>

      <section className="glass-card p-5 flex flex-col gap-3" aria-labelledby="rcpt-h">
        <h2 id="rcpt-h" className="field-label !mb-0 justify-center">
          <i className="fa-solid fa-receipt" aria-hidden="true"></i> Receipts
        </h2>
        {list.receipts.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2">
            {list.receipts.map((r) => (
              <li key={r.path} className="relative">
                <a href={receiptSrc(list.id, r.path)} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={receiptSrc(list.id, r.path)} alt={`Receipt photo${r.store ? ` from ${r.store}` : ""} by ${r.by || "someone"}`} loading="lazy" className="w-full aspect-[3/4] object-cover object-top rounded-lg border border-brand-navydeep/20 bg-white" />
                </a>
                {r.store && <p className="mt-1 text-[11px] text-center text-brand-navydeep/80 truncate">{r.store}</p>}
                {!locked && (
                  <button type="button" onClick={() => dropPhoto(r.path)} disabled={busy === r.path} aria-label="Remove photo" className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/60 text-white text-xs">
                    <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-sm text-brand-navydeep/80">No receipt photos yet.</p>
        )}
        {list.receipts.map((r, i) =>
          r.details ? (
            <ReceiptDetails key={`d-${r.path}`} details={r.details} label={r.store ? `${r.store} receipt` : list.receipts.length > 1 ? `Receipt ${i + 1}` : "What the receipt says"} />
          ) : busy === `read:${r.path}` ? (
            <p key={`d-${r.path}`} className="glass-panel px-3 py-2 text-sm text-center text-brand-navydeep/85" role="status">
              <i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Reading {list.receipts.length > 1 ? `receipt ${i + 1}` : "the receipt"}…
            </p>
          ) : (
            reader && (
              <button key={`d-${r.path}`} type="button" className={OUTLINE} disabled={!!busy} onClick={() => read(r.path)}>
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Read {list.receipts.length > 1 ? `receipt ${i + 1}` : "receipt"}
              </button>
            )
          )
        )}
        {!locked &&
          (photos ? (
            <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={takePhoto} tabIndex={-1} aria-hidden="true" />
              {tripStores.length > 1 && <StoreSelect id="receipt-store" label="Receipt from" stores={tripStores} value={photoStore} onChange={setReceiptStore} />}
              <button type="button" className="btn-3d justify-center disabled:opacity-60" disabled={busy === "photo"} onClick={() => fileRef.current?.click()}>
                <i className={`fa-solid ${busy === "photo" ? "fa-spinner fa-spin" : "fa-camera"}`} aria-hidden="true"></i> {busy === "photo" ? "Saving photo…" : tripStores.length > 1 ? `Scan ${photoStore} receipt` : "Scan receipt"}
              </button>
              <p className="text-xs text-center text-brand-navydeep/70">Lay the receipt flat, in good light. Long receipt? Take more than one photo.</p>
            </>
          ) : (
            <p className="text-xs text-center text-brand-navydeep/70">Receipt photos aren&apos;t set up yet. Keep the paper receipt for now.</p>
          ))}
      </section>

      {!done && (
        <form onSubmit={finish} className="glass-card p-5 flex flex-col gap-3" aria-labelledby="finish-h">
          <h2 id="finish-h" className="field-label !mb-0 justify-center">
            <i className="fa-solid fa-flag-checkered" aria-hidden="true"></i> Done shopping?
          </h2>
          <div className="field-group !mb-0">
            <label htmlFor="spent" className="field-label">
              <i className="fa-solid fa-dollar-sign" aria-hidden="true"></i> {tripStores.length > 1 ? "Receipt total, all stores" : "Receipt total"}
            </label>
            <input id="spent" className="input-3d" inputMode="decimal" autoComplete="off" value={spent} onChange={(e) => {
                setSpentTyped(true);
                setSpent(e.target.value.replace(/[^\d.,$]/g, ""));
              }} placeholder="e.g. 84.37" />
          </div>
          <button type="submit" className="btn-3d justify-center disabled:opacity-60" disabled={busy === "finish"}>
            <i className={`fa-solid ${busy === "finish" ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true"></i> {busy === "finish" ? "Saving…" : "Finish trip"}
          </button>
        </form>
      )}

      {(manager || list.canEdit) && (
        <div className={`grid gap-2 ${done && manager ? "grid-cols-3" : "grid-cols-2"}`}>
          {list.canEdit && (
            <button type="button" className={OUTLINE} onClick={onEdit} disabled={!!busy}>
              <i className="fa-solid fa-pen" aria-hidden="true"></i> Edit
            </button>
          )}
          {done && manager && (
            <button type="button" className={OUTLINE} disabled={!!busy} onClick={() => run("reopen", () => reopenList(list.id), "Not reopened", "Couldn't reopen the list.")}>
              <i className="fa-solid fa-rotate-left" aria-hidden="true"></i> Reopen
            </button>
          )}
          <button type="button" className={DANGER} onClick={remove} disabled={!!busy}>
            <i className="fa-solid fa-trash" aria-hidden="true"></i> Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- making or changing a list (managers) ----------

const newKey = () => Math.random().toString(36).slice(2);
const blankRow = (store = "") => ({ key: newKey(), name: "", qty: "", price: "", store });
const isBlank = (r) => !r.name.trim() && !r.qty && !r.price;
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_4.25rem_3.5rem_1.75rem] sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_2rem] gap-1.5 sm:gap-2";
// Without "See shopping prices" there's no About $ column.
const ROW_GRID_NO_PRICE = "grid grid-cols-[minmax(0,1fr)_5.5rem_1.75rem] sm:grid-cols-[minmax(0,1fr)_7rem_2rem] gap-1.5 sm:gap-2";
// The example in the paste box (the demo's own store in the demo).
const pasteExample = () => `${defaultStore()}:\n2 tomato sauce\n1 case tomatoes\n\nBJ's:\npaper towels\n2 milk`;

// The rows shown: the real ones, plus one empty row at the end of every
// section (store) to type the next thing into. Empty rows keep the same key
// until something is typed in them, so the cursor doesn't jump.
function tidyRows(rows, sections, blankKeys) {
  const out = rows.filter((r) => !isBlank(r));
  for (const store of sections) {
    blankKeys[store] ||= newKey();
    out.push({ ...blankRow(store), key: blankKeys[store] });
  }
  return out;
}

function ListEditor({ list, people, products = [], manager = true, prices = true, onCancel, onSaved }) {
  // The name fills itself in ("Restaurant Depot + Lucero Produce · Thu, Nov 13,
  // 2:30 PM") and follows the stores, until someone types their own.
  const [title, setTitle] = useState(list?.title || "");
  const [titleTyped, setTitleTyped] = useState(Boolean(list?.title));
  const [startedAt] = useState(() => new Date());
  const [assignedTo, setAssignedTo] = useState(list?.assignedTo || "");
  const [notes, setNotes] = useState(list?.notes || "");
  // The stops on this trip, in order. Items with no store go under "Other items".
  const [stops, setStops] = useState(() => storesOf(list?.items));
  const [rows, setRows] = useState(() => (list?.items || []).map((i) => ({ ...i, store: i.store || "", key: i.id })));
  const [newStore, setNewStore] = useState("");
  // The "paste a texted list" box: open on a new list until it's used.
  const [pasteOpen, setPasteOpen] = useState(!list);
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const blankKeys = useRef({});

  const hasOther = rows.some((r) => !r.store && !isBlank(r));
  const sections = stops.length ? (hasOther ? [...stops, ""] : stops) : [""];
  const shown = tidyRows(rows, sections, blankKeys.current);
  const update = (next) => setRows(next.filter((r) => !isBlank(r)));
  const setRow = (key, field, value) => {
    const exists = rows.some((r) => r.key === key);
    const blank = !exists && shown.find((r) => r.key === key);
    // Typing in a section's empty row makes it a real row; that section gets a new empty one.
    if (blank) delete blankKeys.current[blank.store || ""];
    const base = exists ? rows : [...rows, { ...blank }];
    update(base.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };
  const removeRow = (key) => update(rows.filter((r) => r.key !== key));

  // Stores to pick from: the catalog's, plus any already on this list.
  const knownStores = [...new Set([...regularStores(), ...products.map((p) => String(p.store || "").trim() || defaultStore()), ...stops])].sort();
  const addStop = (store) => {
    const name = String(store || "").replace(/\s+/g, " ").trim();
    if (!name) return;
    const match = knownStores.find((s) => s.toLowerCase() === name.toLowerCase()) || name;
    setStops((cur) => (cur.some((s) => s.toLowerCase() === match.toLowerCase()) ? cur : [...cur, match]));
  };
  const removeStop = async (store) => {
    const count = rows.filter((r) => r.store === store && !isBlank(r)).length;
    if (count) {
      const { isConfirmed } = await Swal.fire({
        ...ALERT,
        title: `Take ${store} off this trip?`,
        text: `Its ${count} item${count === 1 ? "" : "s"} come off the list too.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Take it off",
        focusCancel: true,
      });
      if (!isConfirmed) return;
    }
    setStops((cur) => cur.filter((s) => s !== store));
    setRows((cur) => cur.filter((r) => r.store !== store));
  };

  // Pasting several lines (e.g. a list texted by the boss) makes one row each.
  const onPasteName = (row) => (e) => {
    const text = e.clipboardData?.getData("text") || "";
    if (!/\n/.test(text.trim())) return;
    e.preventDefault();
    const parsed = itemsFromText(text).map((i) => ({ ...blankRow(row.store), ...i }));
    const kept = rows.filter((r) => r.key !== row.key || !isBlank(r));
    const at = kept.findIndex((r) => r.key === row.key);
    update(at >= 0 ? [...kept.slice(0, at + 1), ...parsed, ...kept.slice(at + 1)] : [...kept, ...parsed]);
  };

  // Enter moves to the next line of the same store.
  const onEnter = (row) => (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const same = shown.filter((r) => (r.store || "") === (row.store || ""));
    const next = same[same.findIndex((r) => r.key === row.key) + 1];
    if (next) document.getElementById(`item-${next.key}`)?.focus();
  };

  // Tapping a catalog product adds it (with its store as a stop), or one more
  // of it. Works from the latest rows, so quick taps all count.
  const pick = (product) => {
    const store = String(product.store || "").trim() || defaultStore();
    addStop(store);
    setRows((cur) => addProduct(cur, product).map((r) => (r.key ? r : { ...r, key: newKey() })));
  };
  const counts = {};
  for (const r of rows) if (r.productId) counts[r.productId] = Number(r.qty) > 0 ? Number(r.qty) : 1;

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const items = rows.filter((r) => r.name.trim()).map(({ key: _key, ...r }) => r);
    const name = (titleTyped && title.trim()) || autoTitle;
    if (!items.length) return Swal.fire({ ...ALERT, title: "Nothing to buy yet", text: "Add at least one thing to the list.", icon: "info" });
    setSaving(true);
    try {
      const payload = { title: name, assignedTo, notes, items };
      const res = list ? await editList(list.id, payload) : await createList(payload);
      onSaved(res.list);
    } catch (err) {
      fail("List not saved", err, "Couldn't save the list.");
    } finally {
      setSaving(false);
    }
  };

  // A list texted by the manager → stores (stops) and items, matched to the
  // catalog where it's clear. Adds to whatever is already on the list.
  const readPasted = () => {
    const sections = parseTextList(pasteText, { stores: knownStores, products, defaultStore: defaultStore() });
    const count = sections.reduce((n, s) => n + s.items.length, 0);
    if (!count) {
      Swal.fire({ ...ALERT, title: "Nothing to add", text: "Paste the list first: the store name on its own line, then one thing per line.", icon: "info" });
      return;
    }
    const named = sections.map((s) => s.store).filter(Boolean);
    named.forEach(addStop);
    setRows((cur) => [...cur, ...sections.flatMap((s) => s.items.map(({ typed: _typed, ...i }) => ({ ...i, store: s.store, key: newKey() })))]);
    setPasteText("");
    setPasteOpen(false);
    const matched = sections.reduce((n, s) => n + s.items.filter((i) => i.productId).length, 0);
    Swal.fire({
      ...ALERT,
      title: `Added ${count} item${count === 1 ? "" : "s"}`,
      text: `${named.length ? `From ${named.join(", ")}. ` : ""}${matched ? `${matched} matched to the catalog. ` : ""}Check the list below, then save.`,
      icon: "success",
      timer: 2600,
      showConfirmButton: false,
    });
  };

  const autoTitle = `${stops.length ? stops.join(" + ") : "Shopping"} · ${startedAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  const filled = rows.filter((r) => r.name.trim()).length;
  const grid = prices ? ROW_GRID : ROW_GRID_NO_PRICE;
  const pickable = people.some((p) => p.phone === assignedTo) || !assignedTo ? people : [...people, { phone: assignedTo, name: list?.assignedName || assignedTo }];
  const productsAt = (store) => (store ? products.filter((p) => (String(p.store || "").trim() || defaultStore()) === store) : stops.length ? [] : products);

  return (
    <form onSubmit={save} className="glass-card w-full max-w-md p-5 sm:p-6 flex flex-col gap-4" aria-labelledby="edit-h">
      <h2 id="edit-h" className="field-label !mb-0 justify-center">
        <i className={`fa-solid ${list ? "fa-pen" : "fa-plus"}`} aria-hidden="true"></i> {list ? "Change the list" : "New shopping list"}
      </h2>
      <div className="field-group !mb-0">
        <label htmlFor="list-title" className="field-label">
          <i className="fa-solid fa-tag" aria-hidden="true"></i> List name
        </label>
        <input
          id="list-title"
          className="input-3d"
          value={titleTyped ? title : autoTitle}
          onChange={(e) => {
            setTitle(e.target.value);
            // Clearing the box goes back to the automatic name.
            setTitleTyped(Boolean(e.target.value.trim()));
          }}
          autoComplete="off"
        />
        <p className="text-xs text-brand-navydeep/70 mt-1">{titleTyped ? "Clear it to go back to the automatic name." : "Filled in for you with the stores, date and time. Type to rename it."}</p>
      </div>
      <section className="glass-panel px-3 py-3 flex flex-col gap-2 min-w-0" aria-labelledby="paste-h">
        <button type="button" className="flex items-center justify-between text-sm font-semibold text-brand-navy text-left" aria-expanded={pasteOpen} aria-controls="paste-body" onClick={() => setPasteOpen((o) => !o)}>
          <span id="paste-h">
            <i className="fa-solid fa-paste" aria-hidden="true"></i> Got the list by text? Paste it here
          </span>
          <i className={`fa-solid fa-chevron-down text-xs transition-transform ${pasteOpen ? "rotate-180" : ""}`} aria-hidden="true"></i>
        </button>
        {pasteOpen && (
          <div id="paste-body" className="flex flex-col gap-2">
            <p className="text-xs text-brand-navydeep/75">Put each store&apos;s name on its own line (like <strong>{defaultStore()}:</strong> or <strong>BJ&apos;s</strong>), then one thing per line under it. Things from the catalog are matched by themselves.</p>
            <textarea
              aria-label="Paste the texted list"
              className="input-3d min-h-[9rem] font-mono text-sm"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={pasteExample()}
            />
            <button type="button" className="btn-3d justify-center disabled:opacity-60" disabled={!pasteText.trim()} onClick={readPasted}>
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Make the list from this
            </button>
          </div>
        )}
      </section>

      {manager ? (
        <div className="field-group !mb-0">
          <label htmlFor="list-who" className="field-label">
            <i className="fa-solid fa-user" aria-hidden="true"></i> Who&apos;s buying
          </label>
          <select id="list-who" className="input-3d" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Anyone with Shopping lists</option>
            {pickable.map((p) => (
              <option key={p.phone} value={p.phone}>
                {p.name}
              </option>
            ))}
          </select>
          {!people.length && <p className="text-xs text-brand-navydeep/70 mt-1">To give a list to one person, tick Shopping lists for them on the Team page.</p>}
        </div>
      ) : (
        <p className="text-sm text-brand-navydeep/80">
          <i className="fa-solid fa-user text-brand-teal" aria-hidden="true"></i> This list is for you.
        </p>
      )}

      <fieldset className="glass-panel px-3 py-3 flex flex-col gap-2 min-w-0">
        <legend className="field-label !mb-0 px-1">
          <i className="fa-solid fa-store" aria-hidden="true"></i> Where are they buying?
        </legend>
        <p className="text-xs text-brand-navydeep/70">Pick every store on this trip. Each one gets its own part of the list.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Stores on this trip">
          {knownStores.map((store) => {
            const on = stops.includes(store);
            return (
              <button
                key={store}
                type="button"
                aria-pressed={on}
                onClick={() => (on ? removeStop(store) : addStop(store))}
                className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-brand-teal bg-brand-teal/15 text-brand-teal font-semibold" : "border-brand-navydeep/30 text-brand-navydeep/85"}`}
              >
                <i className={`fa-solid ${on ? "fa-check" : "fa-plus"} text-xs`} aria-hidden="true"></i> {store}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <input
            aria-label="Another store"
            className="input-3d !py-2 min-w-0"
            value={newStore}
            onChange={(e) => setNewStore(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              addStop(newStore);
              setNewStore("");
            }}
            placeholder="Another store, e.g. Costco"
            autoComplete="off"
          />
          <button
            type="button"
            className={OUTLINE}
            disabled={!newStore.trim()}
            onClick={() => {
              addStop(newStore);
              setNewStore("");
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true"></i> Add
          </button>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4 min-w-0">
        <legend className="field-label">
          <i className="fa-solid fa-list-check" aria-hidden="true"></i> What to buy {filled ? `(${filled})` : ""}
        </legend>
        {sections.map((store) => {
          const sectionRows = shown.filter((r) => (r.store || "") === store);
          const count = sectionRows.filter((r) => !isBlank(r)).length;
          const atStore = productsAt(store);
          return (
            <section key={store || "other"} className={`flex flex-col gap-2 ${store || stops.length ? "border-t border-brand-navydeep/15 pt-3" : ""}`} aria-label={store || "Items"}>
              {(store || stops.length > 0) && (
                <h3 className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                  <i className={`fa-solid ${store ? "fa-store text-brand-teal" : "fa-list text-brand-navydeep/60"}`} aria-hidden="true"></i>
                  <span className="min-w-0 flex-1 truncate">{store || "Other items (any store)"}</span>
                  <span className="text-xs font-normal text-brand-navydeep/65">{count ? `${count} item${count === 1 ? "" : "s"}` : ""}</span>
                </h3>
              )}
              <CatalogPicker products={atStore} counts={counts} onPick={pick} />
              <div className={`${grid} text-[11px] uppercase tracking-wide text-brand-navydeep/70 px-1`}>
                <span>{atStore.length ? "Or type it" : "Item"}</span>
                <span>How many</span>
                {prices && <span>About $</span>}
                <span className="sr-only">Remove</span>
              </div>
              {sectionRows.map((r, index) => (
                <div key={r.key} className={`${grid} items-center`}>
                  <input
                    id={`item-${r.key}`}
                    aria-label={`${store || "Item"} ${index + 1}`}
                    className="input-3d !py-2 !px-3 min-w-0"
                    value={r.name}
                    onChange={(e) => setRow(r.key, "name", e.target.value)}
                    onPaste={onPasteName(r)}
                    onKeyDown={onEnter(r)}
                    placeholder={index === 0 ? "Tomatoes" : ""}
                    autoComplete="off"
                  />
                  <input aria-label={`How many ${r.name || ""}`} className="input-3d !py-2 !px-2 min-w-0" value={r.qty} onChange={(e) => setRow(r.key, "qty", e.target.value)} onKeyDown={onEnter(r)} placeholder={index === 0 ? "2 cases" : ""} autoComplete="off" />
                  {prices && <input aria-label={`Expected price for ${r.name || "this item"}`} className="input-3d !py-2 !px-2 min-w-0" inputMode="decimal" value={r.price} onChange={(e) => setRow(r.key, "price", e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={onEnter(r)} autoComplete="off" />}
                  {!isBlank(r) ? (
                    <button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove ${r.name || "line"}`} className="h-8 w-7 rounded-full text-brand-error">
                      <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </section>
          );
        })}
        <p className="text-xs text-brand-navydeep/70">Press Enter for the next line.{prices ? " About $ is optional; only managers and people allowed to see prices see it." : ""}</p>
      </fieldset>

      <div className="field-group !mb-0">
        <label htmlFor="list-notes" className="field-label">
          <i className="fa-solid fa-note-sticky" aria-hidden="true"></i> Notes (optional)
        </label>
        <textarea id="list-notes" className="input-3d min-h-[4.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Ask for the receipt. Get the ripe avocados." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" className={OUTLINE} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-3d justify-center disabled:opacity-60" disabled={saving} aria-busy={saving}>
          <i className={`fa-solid ${saving ? "fa-spinner fa-spin" : "fa-floppy-disk"}`} aria-hidden="true"></i> {saving ? "Saving…" : list ? "Save" : "Save list"}
        </button>
      </div>
    </form>
  );
}

// Which store (stop) something belongs to, on a trip with several.
function StoreSelect({ id, label, stores, value, onChange, className = "" }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <label htmlFor={id} className="text-xs text-brand-navydeep/75 shrink-0">
        <i className="fa-solid fa-store" aria-hidden="true"></i> {label}
      </label>
      <select id={id} className="input-3d !py-1.5 min-w-0 flex-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {stores.map((st) => (
          <option key={st} value={st}>
            {st}
          </option>
        ))}
      </select>
    </div>
  );
}

// What the AI read off one receipt photo, shown under the photos.
function ReceiptDetails({ details, label }) {
  const money = (n) => (n == null ? "" : dollars(Math.round(n * 100)));
  const date = details.date ? new Date(`${details.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const line = "flex justify-between gap-3";
  return (
    <div className="glass-panel px-3 py-3 text-sm text-brand-navydeep/90" aria-label={label}>
      <p className="flex items-center justify-between gap-2 mb-2">
        <span className="font-semibold text-brand-navy min-w-0 truncate">
          <i className="fa-solid fa-store text-brand-teal" aria-hidden="true"></i> {details.store || label}
        </span>
        {date && <span className="shrink-0 text-xs text-brand-navydeep/70">{date}</span>}
      </p>
      {details.items.length > 0 && (
        <ul className="flex flex-col gap-0.5 border-b border-dashed border-brand-navydeep/25 pb-2 mb-2">
          {details.items.map((item, i) => (
            <li key={i} className={line}>
              <span className="min-w-0 break-words">
                {item.qty && <span className="text-brand-navydeep/70">{item.qty} × </span>}
                {item.name}
              </span>
              <span className="shrink-0 tabular-nums">{money(item.price)}</span>
            </li>
          ))}
        </ul>
      )}
      {details.subtotal != null && (
        <p className={line}>
          <span>Subtotal</span>
          <span className="tabular-nums">{money(details.subtotal)}</span>
        </p>
      )}
      {details.tax != null && (
        <p className={line}>
          <span>Tax</span>
          <span className="tabular-nums">{money(details.tax)}</span>
        </p>
      )}
      {details.total != null && (
        <p className={`${line} font-semibold text-brand-navy`}>
          <span>Total</span>
          <span className="tabular-nums">{money(details.total)}</span>
        </p>
      )}
      {details.note && (
        <p className="mt-2 text-xs text-brand-gold">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> {details.note}
        </p>
      )}
      {details.catalog?.length > 0 && (
        <div className="mt-2 rounded-lg border border-brand-teal/40 px-2 py-1.5 text-xs" role="status">
          <p className="font-semibold text-brand-teal">
            <i className="fa-solid fa-tags" aria-hidden="true"></i> Catalog prices updated from this receipt
          </p>
          <ul>
            {details.catalog.map((c) => (
              <li key={c.name + c.field}>
                {c.name}: {c.field.toLowerCase()} ${c.to}
                {c.from ? <span className="text-brand-navydeep/65"> (was ${c.from})</span> : <span className="text-brand-navydeep/65"> (new)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] text-brand-navydeep/60">Read by AI from the photo. Check it against the paper receipt.</p>
    </div>
  );
}
