import { isDemo } from "./demo.js";

// Shopping lists: small helpers for the page (pages/ShoppingPage.jsx).

// Where products come from when no store is filled in. The demo has its own
// made-up store, so nothing of the real restaurant shows there.
export const DEMO_STORE = "Demo Wholesale Club";
export const defaultStore = () => (isDemo() ? DEMO_STORE : "Restaurant Depot");

// The stores the business buys from regularly: always offered as buttons
// when making a list, even before they have catalog products.
const REGULAR_STORES = ["Restaurant Depot", "Lucero Produce", "Reyes Produce"];
const DEMO_REGULAR_STORES = [DEMO_STORE, "Corner Produce"];
export const regularStores = () => (isDemo() ? DEMO_REGULAR_STORES : REGULAR_STORES);

// Typed or pasted lines → items. "2 cases tomatoes", "Tomatoes - 2 cases",
// "2x Tomatoes" and "Tomatoes x2" all become { name, qty }. A line that's
// just a name has no qty. Bullets and numbering ("1.", "-", "•") are dropped.
export function itemsFromText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .map(parseLine);
}

export function parseLine(line) {
  const s = String(line ?? "").trim();
  let m = /^(.+?)\s+[-–—:]\s+(.+)$/.exec(s); // "Tomatoes - 2 cases"
  if (m) return { name: m[1].trim(), qty: m[2].trim() };
  m = /^(\d+(?:[.,/]\d+)?)\s*x\s+(.+)$/i.exec(s); // "2x Tomatoes"
  if (m) return { name: m[2].trim(), qty: m[1] };
  m = /^(.+?)\s+x\s*(\d+(?:[.,/]\d+)?)$/i.exec(s); // "Tomatoes x2"
  if (m) return { name: m[1].trim(), qty: m[2] };
  // "2 cases tomatoes", "1 bag (50 lb) onions": a number plus one unit word.
  m = /^(\d+(?:[.,/]\d+)?\s*(?:lbs?|pounds?|oz|kg|g|gal(?:lons?)?|cases?|boxe?s?|bags?|bunch(?:es)?|packs?|dozen|doz|cans?|bottles?|jars?|trays?|units?|pcs?|pieces?)\b(?:\s*\([^)]*\))?)\s+(.+)$/i.exec(s);
  if (m) return { name: m[2].trim(), qty: m[1].trim() };
  m = /^(\d+(?:[.,/]\d+)?)\s+(.+)$/.exec(s); // "6 avocados"
  if (m) return { name: m[2].trim(), qty: m[1] };
  return { name: s, qty: "" };
}

export const toCents = (v) => Math.round((Number(String(v ?? "").replace(/[$,\s]/g, "")) || 0) * 100);
export const dollars = (cents) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// How far along a trip is.
export function progress(list) {
  const items = list?.items || [];
  const planned = items.filter((i) => !i.extra);
  const got = planned.filter((i) => i.got).length;
  const out = planned.filter((i) => i.out).length;
  return { total: planned.length, got, out, left: planned.length - got - out, extras: items.length - planned.length };
}

// What the manager expected the list to cost: every priced line while it's
// open, only what was bought once it's done. Lines without a price don't count.
export function expectedCents(list) {
  const done = list?.status === "Done";
  return (list?.items || []).filter((i) => (done ? i.got : !i.out)).reduce((sum, i) => sum + toCents(i.price), 0);
}

// "2026-11" for a finished trip (by when it was finished).
export const monthKey = (iso) => String(iso || "").slice(0, 7);
export function monthLabel(key) {
  const [y, m] = String(key).split("-").map(Number);
  if (!y || !m) return "";
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Finished trips grouped by month, newest first: [{ key, label, cents, trips }].
export function spendingByMonth(lists) {
  const groups = new Map();
  for (const list of lists || []) {
    if (list.status !== "Done") continue;
    const key = monthKey(list.doneAt || list.updatedAt);
    if (!groups.has(key)) groups.set(key, { key, label: monthLabel(key), cents: 0, trips: [] });
    const g = groups.get(key);
    g.cents += toCents(list.spent);
    g.trips.push(list);
  }
  const out = [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
  for (const g of out) g.trips.sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
  return out;
}

// A phone photo shrunk to a sharp-enough JPEG (longest side ≤ 1800px), as a
// data URL. Keeps uploads small on mobile data and under the server limit.
// transparent: keep see-through backgrounds (product pictures) by saving as
// WebP, or PNG on browsers that can't make WebP.
export async function shrinkPhoto(file, { maxSide = 1800, quality = 0.72, transparent = false } = {}) {
  if (!file || !/^image\//.test(file.type || "image/")) throw new Error("not an image");
  const bitmap = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!transparent) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  if (!transparent) return canvas.toDataURL("image/jpeg", quality);
  const webp = canvas.toDataURL("image/webp", 0.8);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

async function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // Turns the photo the right way up on phones that save it sideways.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img>, which some browsers decode more formats with.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A catalog product → a shopping-list item. Sold by the pound: the usual
// cost of one piece. Picking the same product again adds one more.
export function itemFromProduct(product) {
  const price = product.unit === "lb" ? product.estEach : product.price;
  return { name: product.name, qty: "1", note: product.size || "", price: price || "", productId: product.id, store: String(product.store || "").trim() || defaultStore() };
}

export function addProduct(items, product) {
  const found = items.find((i) => i.productId === product.id);
  if (!found) return [...items, itemFromProduct(product)];
  const n = Number(found.qty);
  const each = toCents(found.price) / (Number.isFinite(n) && n > 0 ? n : 1);
  return items.map((i) => {
    if (i !== found) return i;
    const qty = Number.isFinite(n) && n > 0 ? String(n + 1) : i.qty;
    return { ...i, qty, price: each && qty !== i.qty ? ((each * Number(qty)) / 100).toFixed(2) : i.price };
  });
}

// "$22.65 each · case of 4 $79.99" / "$5.59/lb · about $89.44 each".
export function productPriceLine(p) {
  if (!p?.price) return "";
  const parts = [p.unit === "lb" ? `${dollars(toCents(p.price))}/lb` : `${dollars(toCents(p.price))} each`];
  if (p.unit === "lb" && p.estEach) parts.push(`about ${dollars(toCents(p.estEach))} each`);
  if (p.casePrice) parts.push(`case${p.caseQty ? ` of ${p.caseQty}` : ""} ${dollars(toCents(p.casePrice))}`);
  return parts.join(" · ");
}

// The stores (stops) a list covers, in the order they first appear.
export function storesOf(items) {
  return [...new Set((items || []).map((i) => String(i.store || "").trim()).filter(Boolean))];
}

// A trip's items in sections by store, in the order of the stops; items with
// no store ("Other items") last. Older items without a store take their
// catalog product's store.
export function groupItemsByStore(items, productById) {
  const groups = new Map();
  for (const item of items || []) {
    const product = productById.get(item.productId);
    const store = String(item.store || "").trim() || (product ? String(product.store || "").trim() || defaultStore() : "");
    if (!groups.has(store)) groups.set(store, []);
    groups.get(store).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : 0)).map(([store, list]) => ({ store, items: list }));
}

// ---------- a list texted by the manager, pasted in ----------
//
//   Restaurant Depot:
//   2 cases tomatoes
//   1 bbq sauce
//
//   BJ's
//   - paper towels
//   2x milk
//
// A line that names a store starts that store's part of the list: any line
// ending in ":" ("Jetro:"), or one that is just a store we know ("BJ's",
// "Restaurant Depot", "RD"), optionally after "at" / "from" / "en". Every
// other line is an item. Items are matched to the catalog when the name
// clearly points to one product at that store.

const COMMON_STORES = ["Restaurant Depot", "BJ's", "Costco", "Jetro", "Sam's Club", "Walmart", "Target", "ShopRite", "Stop & Shop", "Key Food", "C-Town", "Western Beef", "Food Bazaar", "Aldi", "Home Depot", "Amazon"];
const STORE_ALIASES = { rd: "Restaurant Depot", depot: "Restaurant Depot", bj: "BJ's", sams: "Sam's Club" };

// "BJ's" → "bjs", "Jalapeños" → "jalapenos".
const plain = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

function storeFromLine(line, knownStores) {
  let s = String(line ?? "")
    .replace(/^[\s*#>•\-–—]+|[\s*]+$/g, "")
    .replace(/^\p{Extended_Pictographic}+\s*/u, "")
    .trim();
  const heading = s.endsWith(":");
  s = s.replace(/:+$/, "").trim();
  s = s.replace(/^(?:at|from|en|para|@)\s+/i, "").trim();
  if (!s) return null;
  const key = plain(s);
  const all = [...knownStores, ...regularStores(), ...COMMON_STORES];
  const known = all.find((st) => plain(st) === key);
  if (known) return known;
  if (STORE_ALIASES[key]) return knownStores.find((st) => plain(st) === plain(STORE_ALIASES[key])) || STORE_ALIASES[key];
  // A store's first word alone ("Lucero", "Reyes") when only one store starts with it.
  const byFirstWord = [...new Set(all)].filter((st) => plain(st.split(/\s+/)[0]) === key && st.split(/\s+/).length > 1);
  if (byFirstWord.length === 1) return byFirstWord[0];
  // An unknown store is only trusted when written as a heading ("Jetro:"),
  // and never when it has a number in it ("2 cases tomatoes:").
  return heading && !/\d/.test(s) && s.length <= 40 && s.split(/\s+/).length <= 5 ? s : null;
}

const words = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !["of", "the", "and", "de", "la", "el", "lb", "lbs", "oz", "case", "cases", "box", "bag", "bags", "can", "cans"].includes(w))
    .map((w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));

// The one catalog product an item name points to, or null when there's no
// clear match (several equally good ones count as no match).
export function matchProduct(name, products) {
  const want = words(name);
  if (!want.length) return null;
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const p of products || []) {
    const have = new Set(words(p.name));
    const hits = want.filter((w) => have.has(w)).length;
    const score = hits / want.length;
    if (score > bestScore) {
      best = p;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore >= 0.6 && !tie ? best : null;
}

// Text → [{ store, items: [{ name, qty, ...catalog fields }] }], stores in
// the order they appear; items before any store heading have store "".
export function parseTextList(text, { stores = [], products = [], defaultStore: fallback = "" } = {}) {
  const sections = [];
  let current = null;
  const section = (store) => {
    let s = sections.find((x) => x.store === store);
    if (!s) sections.push((s = { store, items: [] }));
    return s;
  };
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const store = storeFromLine(raw, stores);
    if (store) {
      current = section(store);
      continue;
    }
    const line = raw
      .replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s+/, "")
      .replace(/^\s*\[\s?[xX ]?\s?\]\s*/, "")
      .replace(/:+\s*$/, "")
      .trim();
    if (!line) continue;
    const target = current || section("");
    const { name, qty } = parseLine(line);
    const atStore = products.filter((p) => (String(p.store || "").trim() || fallback) === target.store);
    const product = target.store ? matchProduct(name, atStore) : null;
    if (product) {
      const item = itemFromProduct(product);
      const n = Number(qty);
      const each = toCents(item.price);
      target.items.push({ ...item, qty: qty || "1", price: each && n > 0 ? ((each * n) / 100).toFixed(2) : item.price, typed: name });
    } else {
      target.items.push({ name, qty, note: "", price: "", productId: "", store: target.store });
    }
  }
  return sections.filter((s) => s.items.length);
}

// ---------- barcodes ----------
//
// Does a scanned barcode belong to a product with this UPC? Store listings
// often drop the leading 0 and/or the last (check) digit of the printed
// code, so both are tried. Meat sold by weight has the price inside its
// barcode ("2 07704 4 2678 5"): those match on the item part only.
const digitsOf = (v) => String(v ?? "").replace(/\D/g, "");
const noLeadingZeros = (s) => s.replace(/^0+/, "");

export function barcodeMatches(scanned, upc) {
  const a = digitsOf(scanned);
  const b = noLeadingZeros(digitsOf(upc));
  if (a.length < 6 || b.length < 6) return false;
  if (b.length === 11 && b.startsWith("2") && b.endsWith("0000")) {
    const item = b.slice(0, 6);
    return noLeadingZeros(a).startsWith(item);
  }
  // The scanned code always has its check digit; the store's number may not.
  return [noLeadingZeros(a), noLeadingZeros(a.slice(0, -1))].some((x) => x.length >= 6 && x === b);
}
