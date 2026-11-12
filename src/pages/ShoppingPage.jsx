import { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import { addExtraItem, addReceipt, createList, deleteList, editList, finishTrip, loadShopping, receiptSrc, removeReceipt, reopenList, setItem } from "../api/shopping.js";
import { useAuth } from "../lib/auth.jsx";
import { friendlyMessage } from "../lib/errors.js";
import { dollars, expectedCents, itemsFromText, monthKey, progress, shrinkPhoto, spendingByMonth, toCents } from "../lib/shopping.js";

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
  const [data, setData] = useState({ lists: [], people: [], manager: false, photos: false });
  const [state, setState] = useState({ loading: true, error: "" });
  // "home", { open: id } or { edit: id | null } (null = a new list).
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
      ) : editing ? (
        <ListEditor
          list={view.edit ? data.lists.find((l) => l.id === view.edit) : null}
          people={data.people}
          onCancel={() => (view.edit ? setView({ open: view.edit }) : goHome())}
          onSaved={(list) => {
            replace(list);
            setView({ open: list.id });
          }}
        />
      ) : openList ? (
        <TripView list={openList} manager={data.manager} prices={prices} photos={data.photos} onBack={goHome} onChange={replace} onEdit={() => setView({ edit: openList.id })} onDeleted={(id) => (drop(id), goHome())} />
      ) : (
        <Home data={data} prices={prices} onOpen={(id) => setView({ open: id })} onNew={() => setView({ edit: null })} onRefresh={load} />
      )}
    </Layout>
  );
}

// ---------- the list of lists ----------

function Home({ data, prices, onOpen, onNew, onRefresh }) {
  const open = data.lists.filter((l) => l.status === "Open").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const months = spendingByMonth(data.lists);
  const thisMonth = months.find((m) => m.key === monthKey(new Date().toISOString()));
  const [shown, setShown] = useState(1); // months of finished trips shown

  return (
    <div className="w-full max-w-md flex flex-col gap-6">
      {data.manager && (
        <div className="grid grid-cols-[1fr_auto] gap-3 stagger-in">
          <button type="button" className="btn-3d justify-center" onClick={onNew}>
            <i className="fa-solid fa-plus" aria-hidden="true"></i> New shopping list
          </button>
          <button type="button" className={OUTLINE} onClick={onRefresh} aria-label="Refresh lists" title="Refresh lists">
            <i className="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
          </button>
        </div>
      )}

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
          <p className="text-center text-sm text-brand-navydeep/80">{data.manager ? "No open lists. Make one with New shopping list." : "Nothing to buy right now."}</p>
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

function TripView({ list, manager, prices, photos, onBack, onChange, onEdit, onDeleted }) {
  const [busy, setBusy] = useState("");
  const [extra, setExtra] = useState({ name: "", qty: "" });
  const [spent, setSpent] = useState("");
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

  const addExtra = async (e) => {
    e.preventDefault();
    if (!extra.name.trim()) return;
    const res = await run("extra", () => addExtraItem(list.id, extra.name.trim(), extra.qty.trim()), "Not added", "Couldn't add it to the list.");
    if (res) setExtra({ name: "", qty: "" });
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
      const res = await run("photo", () => addReceipt(list.id, image), "Photo not saved", "Couldn't save the receipt photo.");
      if (!res) return;
    }
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

        <ul className="flex flex-col divide-y divide-brand-navydeep/15">
          {list.items.map((item) => (
            <li key={item.id} className="py-2 flex items-start gap-3">
              <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer py-1">
                <input
                  type="checkbox"
                  className="mt-0.5 h-6 w-6 shrink-0 accent-[rgb(var(--brand-teal))]"
                  checked={item.got}
                  disabled={locked}
                  onChange={() => mark(item, { got: !item.got, out: false })}
                />
                <span className="min-w-0">
                  <span className={`block text-brand-navy break-words ${item.got ? "line-through opacity-60" : ""} ${item.out ? "opacity-60" : ""}`}>
                    {item.qty && <span className="font-semibold">{item.qty} </span>}
                    {item.name}
                    {item.extra && <span className="ml-2 rounded-full border border-brand-gold/60 px-1.5 text-[10px] uppercase tracking-wide text-brand-gold">Extra</span>}
                    {item.out && <span className="ml-2 rounded-full border border-brand-error/60 px-1.5 text-[10px] uppercase tracking-wide text-brand-error">Out of stock</span>}
                  </span>
                  {item.note && <span className="block text-xs text-brand-navydeep/75">{item.note}</span>}
                  {prices && item.price && <span className="block text-xs text-brand-navydeep/70">About {dollars(toCents(item.price))}</span>}
                </span>
              </label>
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
          ))}
        </ul>
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
                  <img src={receiptSrc(list.id, r.path)} alt={`Receipt photo by ${r.by || "someone"}`} loading="lazy" className="w-full aspect-[3/4] object-cover object-top rounded-lg border border-brand-navydeep/20 bg-white" />
                </a>
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
        {!locked &&
          (photos ? (
            <>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={takePhoto} tabIndex={-1} aria-hidden="true" />
              <button type="button" className="btn-3d justify-center disabled:opacity-60" disabled={busy === "photo"} onClick={() => fileRef.current?.click()}>
                <i className={`fa-solid ${busy === "photo" ? "fa-spinner fa-spin" : "fa-camera"}`} aria-hidden="true"></i> {busy === "photo" ? "Saving photo…" : "Scan receipt"}
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
              <i className="fa-solid fa-dollar-sign" aria-hidden="true"></i> Receipt total
            </label>
            <input id="spent" className="input-3d" inputMode="decimal" autoComplete="off" value={spent} onChange={(e) => setSpent(e.target.value.replace(/[^\d.,$]/g, ""))} placeholder="e.g. 84.37" />
          </div>
          <button type="submit" className="btn-3d justify-center disabled:opacity-60" disabled={busy === "finish"}>
            <i className={`fa-solid ${busy === "finish" ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true"></i> {busy === "finish" ? "Saving…" : "Finish trip"}
          </button>
        </form>
      )}

      {manager && (
        <div className={`grid gap-2 ${done ? "grid-cols-3" : "grid-cols-2"}`}>
          <button type="button" className={OUTLINE} onClick={onEdit} disabled={!!busy}>
            <i className="fa-solid fa-pen" aria-hidden="true"></i> Edit
          </button>
          {done && (
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

const blankRow = () => ({ key: Math.random().toString(36).slice(2), name: "", qty: "", price: "" });

function ListEditor({ list, people, onCancel, onSaved }) {
  const [title, setTitle] = useState(list?.title || "");
  const [assignedTo, setAssignedTo] = useState(list?.assignedTo || "");
  const [notes, setNotes] = useState(list?.notes || "");
  const [rows, setRows] = useState(() => [...(list?.items || []).map((i) => ({ ...i, key: i.id })), blankRow()]);
  const [saving, setSaving] = useState(false);
  const focusKey = useRef(null);

  // There's always one empty row at the end to type the next thing into.
  const isBlank = (r) => !r.name.trim() && !r.qty && !r.price;
  const update = (next) => setRows(next.length && isBlank(next[next.length - 1]) ? next : [...next, blankRow()]);
  const setRow = (key, field, value) => update(rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  const removeRow = (key) => update(rows.filter((r) => r.key !== key));

  // Pasting several lines (e.g. a list texted by the boss) makes one row each.
  const onPasteName = (key) => (e) => {
    const text = e.clipboardData?.getData("text") || "";
    if (!/\n/.test(text.trim())) return;
    e.preventDefault();
    const parsed = itemsFromText(text).map((i) => ({ ...blankRow(), ...i }));
    const at = rows.findIndex((r) => r.key === key);
    update([...rows.slice(0, at + 1), ...parsed, ...rows.slice(at + 1)].filter((r) => !isBlank(r)));
  };

  const onEnter = (index) => (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = rows[index + 1];
    if (next) focusKey.current = next.key;
    else {
      const row = blankRow();
      focusKey.current = row.key;
      setRows([...rows, row]);
    }
  };
  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(`item-${focusKey.current}`)?.focus();
    focusKey.current = null;
  });

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const items = rows.filter((r) => r.name.trim()).map(({ key: _key, ...r }) => r);
    if (!title.trim()) return Swal.fire({ ...ALERT, title: "Name the list", text: "e.g. \"Restaurant Depot Friday\".", icon: "info" });
    if (!items.length) return Swal.fire({ ...ALERT, title: "Nothing to buy yet", text: "Add at least one thing to the list.", icon: "info" });
    setSaving(true);
    try {
      const payload = { title: title.trim(), assignedTo, notes, items };
      const res = list ? await editList(list.id, payload) : await createList(payload);
      onSaved(res.list);
    } catch (err) {
      fail("List not saved", err, "Couldn't save the list.");
    } finally {
      setSaving(false);
    }
  };

  const filled = rows.filter((r) => r.name.trim()).length;
  const pickable = people.some((p) => p.phone === assignedTo) || !assignedTo ? people : [...people, { phone: assignedTo, name: list?.assignedName || assignedTo }];

  return (
    <form onSubmit={save} className="glass-card w-full max-w-md p-5 sm:p-6 flex flex-col gap-4" aria-labelledby="edit-h">
      <h2 id="edit-h" className="field-label !mb-0 justify-center">
        <i className={`fa-solid ${list ? "fa-pen" : "fa-plus"}`} aria-hidden="true"></i> {list ? "Change the list" : "New shopping list"}
      </h2>
      <div className="field-group !mb-0">
        <label htmlFor="list-title" className="field-label">
          <i className="fa-solid fa-tag" aria-hidden="true"></i> List name
        </label>
        <input id="list-title" className="input-3d" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Restaurant Depot Friday" autoComplete="off" />
      </div>
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

      <fieldset className="flex flex-col gap-2">
        <legend className="field-label">
          <i className="fa-solid fa-list-check" aria-hidden="true"></i> What to buy {filled ? `(${filled})` : ""}
        </legend>
        <p className="text-xs text-brand-navydeep/70 -mt-1">Press Enter for the next line. You can paste a whole list too, one thing per line.</p>
        <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_3.5rem_1.75rem] sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_2rem] gap-1.5 sm:gap-2 text-[11px] uppercase tracking-wide text-brand-navydeep/70 px-1">
          <span>Item</span>
          <span>How many</span>
          <span>About $</span>
          <span className="sr-only">Remove</span>
        </div>
        {rows.map((r, index) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_4.25rem_3.5rem_1.75rem] sm:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_2rem] gap-1.5 sm:gap-2 items-center">
            <input id={`item-${r.key}`} aria-label={`Item ${index + 1}`} className="input-3d !py-2 !px-3 min-w-0" value={r.name} onChange={(e) => setRow(r.key, "name", e.target.value)} onPaste={onPasteName(r.key)} onKeyDown={onEnter(index)} placeholder={index === 0 ? "Tomatoes" : ""} autoComplete="off" />
            <input aria-label={`How many ${r.name || ""}`} className="input-3d !py-2 !px-2 min-w-0" value={r.qty} onChange={(e) => setRow(r.key, "qty", e.target.value)} onKeyDown={onEnter(index)} placeholder={index === 0 ? "2 cases" : ""} autoComplete="off" />
            <input aria-label={`Expected price for ${r.name || "this item"}`} className="input-3d !py-2 !px-2 min-w-0" inputMode="decimal" value={r.price} onChange={(e) => setRow(r.key, "price", e.target.value.replace(/[^\d.]/g, ""))} onKeyDown={onEnter(index)} placeholder="" autoComplete="off" />
            {r.name || r.qty || r.price ? (
              <button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove ${r.name || "line"}`} className="h-8 w-7 rounded-full text-brand-error">
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <p className="text-xs text-brand-navydeep/70">About $ is optional. Only managers and people allowed to see prices see it.</p>
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
