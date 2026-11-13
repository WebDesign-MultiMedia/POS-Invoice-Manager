// Shopping lists: small pure helpers for the page (pages/ShoppingPage.jsx).

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
  return { name: product.name, qty: "1", note: product.size || "", price: price || "", productId: product.id };
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
