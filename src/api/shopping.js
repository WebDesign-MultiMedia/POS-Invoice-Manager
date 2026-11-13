// Shopping lists and receipt photos (api/shopping.js → the "Shopping" sheet
// tab + private photo storage). In the demo, everything stays in this tab.
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { DEMO_RESET_EVENT, isDemo } from "../lib/demo.js";
import { DEMO_STORE } from "../lib/shopping.js";
import { ApiError, apiErrorFrom } from "../lib/errors.js";

const API = "/api/shopping";

async function call(init, query = "") {
  const res = await fetch(`${API}${query}`, init);
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}

const post = (body) => (isDemo() ? demo(body) : call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

// { lists, people, manager, photos }
export const loadShopping = () => (isDemo() ? demo({ action: "list" }) : call({ method: "GET" }, "?action=list"));

// The <img src> for a receipt photo. Same-origin, so the login cookie goes with it.
export function receiptSrc(listId, path) {
  if (isDemo()) return demoPhotos.get(path) || "";
  return `${API}?action=receipt&id=${encodeURIComponent(listId)}&path=${encodeURIComponent(path)}`;
}

export const createList = (list) => post({ action: "create", list });
export const editList = (id, list) => post({ action: "edit", id, list });
export const deleteList = (id) => post({ action: "delete", id });
export const reopenList = (id) => post({ action: "reopen", id });
export const setItem = (id, itemId, { got, out }) => post({ action: "item", id, itemId, got, out });
export const addExtraItem = (id, name, qty, store = "") => post({ action: "addItem", id, name, qty, store });
export const addReceipt = (id, image, store = "") => post({ action: "receipt", id, image, store });
export const removeReceipt = (id, path) => post({ action: "removeReceipt", id, path });
// Product catalog (managers). image: an optional new picture as a data URL.
export const saveProduct = (product, image) => post({ action: "saveProduct", product, image });
export const deleteProduct = (id) => post({ action: "deleteProduct", id });

// A product's picture: shipped with the app ("/imgs/products/…"), or
// uploaded from the app and served privately.
export function productSrc(product) {
  const photo = product?.photo || "";
  if (!photo) return "";
  if (photo.startsWith("/") || photo.startsWith("data:")) return photo;
  return `${API}?action=productPhoto&id=${encodeURIComponent(product.id)}&v=${encodeURIComponent(photo.slice(-12))}`;
}

// Reads a saved photo with AI → { details, list }.
export const readReceipt = (id, path) => post({ action: "readReceipt", id, path });
export const finishTrip = (id, spent) => post({ action: "finish", id, spent });

// ---------- demo: same answers as the server, kept in memory ----------

const demoPhotos = new Map();
let demoLists = null;
let demoProducts = null;
// A new demo starts with fresh sample lists and products.
if (typeof window !== "undefined") {
  window.addEventListener(DEMO_RESET_EVENT, () => {
    demoLists = null;
    demoProducts = null;
    demoPhotos.clear();
  });
}
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
const clone = (v) => JSON.parse(JSON.stringify(v));
const later = (v) => new Promise((resolve) => setTimeout(() => resolve(clone(v)), 200));

function seedLists() {
  const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const item = (name, qty, price, extra = {}) => ({ id: `i${hex(10)}`, name, qty, note: "", price, got: false, out: false, extra: false, ...extra });
  return [
    {
      id: `s${hex(20)}`,
      title: "Market run for Saturday",
      assignedTo: "",
      assignedName: "",
      status: "Open",
      items: [item("Roma Tomatoes", "2", "49.98", { got: true, note: "25 lb case", productId: "pdemo00000002" }), item("Yellow Onions", "1", "21.49", { note: "50 lb bag", productId: "pdemo00000003" }), item("Limes", "1 case", "30.00"), item("Cilantro", "6 bunches", "6.00", { note: "Fresh, not wilted" })],
      notes: "Get the receipt for everything.",
      spent: "",
      receipts: [],
      createdBy: "Demo",
      createdAt: ago(0),
      updatedAt: ago(0),
      doneBy: "",
      doneAt: "",
    },
    {
      id: `s${hex(20)}`,
      title: "Paper goods",
      assignedTo: "5550100123",
      assignedName: "Sample Employee",
      status: "Done",
      items: [item("To-go containers", "2 boxes", "45.00", { got: true }), item("Napkins", "1 case", "18.00", { got: true }), item("Forks", "1 box", "12.00", { out: true })],
      notes: "",
      spent: "68.47",
      receipts: [],
      createdBy: "Demo",
      createdAt: ago(6),
      updatedAt: ago(5),
      doneBy: "Sample Employee",
      doneAt: ago(5),
    },
  ];
}

// The demo's catalog: made-up products at a made-up store, with simple
// drawn pictures, so nothing of the real restaurant shows in the demo.
const demoPicture = (emoji) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="58" font-size="72" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`)}`;
const seedProducts = () => {
  const p = (id, name, size, category, bin, itemNo, unit, price, extra = {}) => ({ id, store: DEMO_STORE, name, size, category, bin, itemNo, upc: "", unit, price, estEach: "", casePrice: "", caseQty: "", priceNote: "", photo: "", ...extra });
  return [
    p("pdemo00000001", "Tomato Sauce", "#10 can (6 lb)", "Canned goods", "1204", "50011", "each", "6.49", { casePrice: "36.99", caseQty: "6", photo: demoPicture("🥫") }),
    p("pdemo00000002", "Roma Tomatoes", "25 lb case", "Produce", "210", "50012", "each", "24.99", { photo: demoPicture("🍅") }),
    p("pdemo00000003", "Yellow Onions", "50 lb bag", "Produce", "214", "50013", "each", "21.49", { photo: demoPicture("🧅") }),
    p("pdemo00000004", "Chicken Breast", "About 10 lb pack", "Meat", "6010", "50014", "lb", "2.99", { estEach: "29.90", priceNote: "Final cost by weight.", photo: demoPicture("🍗") }),
    p("pdemo00000005", "Paper Napkins", "Case of 6,000", "Paper goods", "880", "50015", "each", "42.00", { photo: demoPicture("🧻") }),
  ];
};

function demo(body) {
  if (!demoLists) demoLists = seedLists();
  if (!demoProducts) demoProducts = seedProducts();
  const people = [{ phone: "5550100123", name: "Sample Employee" }];
  if (body.action === "list") return later({ lists: demoLists, products: demoProducts, catalog: true, people, manager: true, photos: true, reader: true });
  if (body.action === "saveProduct") {
    if (!String(body.product?.name || "").trim()) return Promise.reject(new ApiError(400, "Type the product's name."));
    const old = demoProducts.find((p) => p.id === body.product.id);
    const product = { ...(old || {}), ...body.product, id: old?.id || `p${hex(16)}`, photo: body.image || old?.photo || "" };
    demoProducts = old ? demoProducts.map((p) => (p === old ? product : p)) : [...demoProducts, product];
    return later({ ok: true, product });
  }
  if (body.action === "deleteProduct") {
    demoProducts = demoProducts.filter((p) => p.id !== body.id);
    return later({ ok: true });
  }
  const now = new Date().toISOString();
  const cleanItems = (items) =>
    (items || []).filter((i) => String(i.name || "").trim()).map((i) => ({ id: i.id || `i${hex(10)}`, name: i.name.trim(), qty: i.qty || "", note: i.note || "", price: i.price ? Number(i.price).toFixed(2) : "", got: !!i.got, out: !!i.out && !i.got, extra: !!i.extra, productId: i.productId || "", store: i.store || "" }));
  const fields = (l) => ({ title: l.title.trim(), assignedTo: l.assignedTo || "", assignedName: people.find((p) => p.phone === l.assignedTo)?.name || "", items: cleanItems(l.items), notes: l.notes || "" });
  if (body.action === "create") {
    if (!String(body.list?.title || "").trim()) return Promise.reject(new ApiError(400, "Give the list a name, e.g. \"Restaurant Depot Friday\"."));
    const list = { id: `s${hex(20)}`, ...fields(body.list), status: "Open", spent: "", receipts: [], createdBy: "Demo", createdAt: now, updatedAt: now, doneBy: "", doneAt: "" };
    if (!list.items.length) return Promise.reject(new ApiError(400, "Add at least one thing to buy."));
    demoLists.push(list);
    return later({ ok: true, list });
  }
  const list = demoLists.find((l) => l.id === body.id);
  if (!list) return Promise.reject(new ApiError(404, "That list isn't there any more."));
  if (body.action === "delete") {
    demoLists = demoLists.filter((l) => l !== list);
    return later({ ok: true });
  }
  if (body.action === "edit") Object.assign(list, fields(body.list));
  if (body.action === "reopen") Object.assign(list, { status: "Open", doneBy: "", doneAt: "" });
  if (body.action === "item") {
    const item = list.items.find((i) => i.id === body.itemId);
    if (item) Object.assign(item, { got: !!body.got, out: !body.got && !!body.out });
  }
  if (body.action === "addItem") list.items.push(...cleanItems([{ name: body.name, qty: body.qty, store: body.store, got: true, extra: true }]));
  if (body.action === "receipt") {
    const path = `receipts/${list.id}/demo-${hex(8)}.jpg`;
    demoPhotos.set(path, body.image);
    list.receipts.push({ path, at: now, by: "Demo", store: body.store || "" });
  }
  if (body.action === "readReceipt") {
    // The demo can't really read photos, so it shows a made-up receipt.
    const details = {
      store: DEMO_STORE,
      date: now.slice(0, 10),
      items: [
        { name: "Roma Tomatoes, 25 lb case", qty: "2", price: 49.98 },
        { name: "Yellow Onions, 50 lb bag", qty: "1", price: 21.49 },
        { name: "Ice, bag", qty: "2", price: 4.5 },
      ],
      subtotal: 75.97,
      tax: 0,
      total: 75.97,
      note: "Sample receipt: the demo doesn't read real photos.",
    };
    list.receipts = list.receipts.map((r) => (r.path === body.path ? { ...r, details } : r));
    return new Promise((resolve) => setTimeout(() => resolve(clone({ ok: true, details, list })), 1200));
  }
  if (body.action === "removeReceipt") list.receipts = list.receipts.filter((r) => r.path !== body.path);
  if (body.action === "finish") {
    const spent = Number(String(body.spent || "").replace(/[$,\s]/g, ""));
    if (!String(body.spent || "").trim() || !Number.isFinite(spent) || spent < 0) return Promise.reject(new ApiError(400, "Type the total from the receipt."));
    Object.assign(list, { status: "Done", spent: spent.toFixed(2), doneBy: "Demo", doneAt: now });
  }
  list.updatedAt = now;
  return later({ ok: true, list });
}
