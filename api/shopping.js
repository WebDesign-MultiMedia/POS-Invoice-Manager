import { del, get, put } from "@vercel/blob";
import { requireAccess, sellerName } from "./_lib/auth.js";
import { listEmployees } from "./_lib/employees.js";
import { UnreadableReceipt, readReceipt, readerReady } from "./_lib/receiptReader.js";
import { parseAccess } from "./_lib/permissions.js";
import { PRODUCTS_SHEET, cleanProductId, isUploadedPhoto, newProductId, productFields, publicProduct } from "./_lib/products.js";
import { sheetdbBase, sheetdbHeaders } from "./_lib/sheetdb.js";
import {
  BadRequest,
  LIMITS,
  SHOPPING_SHEET as SHEET,
  canSee,
  cleanItems,
  cleanListId,
  decodeImage,
  isManager,
  itemsOf,
  money,
  newListId,
  publicList,
  receiptsOf,
  seesPrices,
} from "./_lib/shopping.js";

// Vercel serverless function: shopping lists and their receipt photos.
// Lists live in the order sheet's "Shopping" tab (api/_lib/shopping.js);
// photos in a private Vercel Blob store (BLOB_STORE_ID), which only
// this function can read, so a photo is never reachable by a public link.
//
// Everyone here needs the "shopping" section. Managers ("shopping" +
// "manage", or the owner) make, change and delete lists and see them all;
// everyone else sees only lists given to them or to anyone.
//
//   GET  ?action=list                    → { lists, products, people, manager, photos, reader, catalog }
//   GET  ?action=receipt&id=…&path=…     → the photo itself
//   GET  ?action=productPhoto&id=…       → an uploaded product picture
//   POST { action: "saveProduct", product, image? }   manager (new if no product.id)
//   POST { action: "deleteProduct", id }  manager
//   POST { action: "create", list }      manager
//   POST { action: "edit", id, list }    manager
//   POST { action: "delete", id }        manager (photos too)
//   POST { action: "reopen", id }        manager
//   POST { action: "item", id, itemId, got, out }
//   POST { action: "addItem", id, name, qty, store? }
//   POST { action: "receipt", id, image, store? }   image: data:image/jpeg;base64,…
//   POST { action: "readReceipt", id, path }  → reads the photo with Claude
//   POST { action: "removeReceipt", id, path }
//   POST { action: "finish", id, spent }

// Connecting the store in Vercel sets BLOB_STORE_ID (the SDK then signs in
// with the project's automatic OIDC token); older setups use a token.
const photosReady = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

async function sheetdb(path, init = {}, { notFoundOk = false } = {}) {
  const base = sheetdbBase();
  if (!base) throw new Error("SHEETDB_ID is not set");
  const response = await fetch(`${base}${path}`, { ...init, headers: sheetdbHeaders() });
  const payload = await response.json().catch(() => null);
  if (response.status === 404 && notFoundOk) return null;
  if (!response.ok) {
    console.error("shopping: SheetDB responded", response.status, payload);
    throw new Error("Sheet request failed");
  }
  return payload;
}

const rowPath = (id) => `/ListId/${encodeURIComponent(id)}?sheet=${SHEET}`;

async function allRows() {
  const rows = await sheetdb(`?sheet=${SHEET}`, { method: "GET" });
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.ListId);
}

async function findRow(id) {
  const rows = await sheetdb(`/search?ListId=${encodeURIComponent(id)}&sheet=${SHEET}`, { method: "GET" });
  return (Array.isArray(rows) ? rows : []).find((r) => r.ListId === id) || null;
}

async function patchRow(id, fields) {
  await sheetdb(rowPath(id), { method: "PATCH", body: JSON.stringify({ data: { ...fields, UpdatedAt: new Date().toISOString() } }) });
}

// The product catalog (api/_lib/products.js). null when the sheet has no
// Products tab yet, so lists still work without it.
async function productRows() {
  try {
    const rows = await sheetdb(`?sheet=${PRODUCTS_SHEET}`, { method: "GET" });
    return (Array.isArray(rows) ? rows : []).filter((r) => r && r.ProductId && r.Name);
  } catch {
    return null;
  }
}

async function findProduct(id) {
  const rows = await sheetdb(`/search?ProductId=${encodeURIComponent(id)}&sheet=${PRODUCTS_SHEET}`, { method: "GET" });
  return (Array.isArray(rows) ? rows : []).find((r) => r.ProductId === id) || null;
}

const productPath = (id) => `/ProductId/${encodeURIComponent(id)}?sheet=${PRODUCTS_SHEET}`;

class NotFound extends Error {}
class Forbidden extends Error {}

// The row, if it exists and this login may see it.
async function visibleRow(session, id) {
  const row = await findRow(id);
  if (!row || !canSee(session, row)) throw new NotFound();
  return row;
}

// Employees who can be given a list (they have Shopping lists ticked).
async function shoppers() {
  const rows = await listEmployees();
  return rows
    .filter((r) => String(r.Active ?? "").trim().toLowerCase() !== "no" && parseAccess(r.Access).includes("shopping"))
    .map((r) => ({ phone: r.Phone, name: String(r.Name || "").trim() || r.Phone }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Title, items, notes and who it's for, from a manager's form.
async function listFields(list) {
  if (!list || typeof list !== "object") throw new BadRequest("Missing list");
  const title = String(list.title ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.text);
  if (!title) throw new BadRequest("Give the list a name, e.g. \"Restaurant Depot Friday\".");
  const items = cleanItems(list.items);
  if (!items.length) throw new BadRequest("Add at least one thing to buy.");
  const assignedTo = String(list.assignedTo ?? "").replace(/\D/g, "").slice(-10);
  let assignedName = "";
  if (assignedTo) {
    const person = (await shoppers()).find((p) => p.phone === assignedTo);
    if (!person) throw new BadRequest("That employee can't use Shopping lists. Tick it for them on the Team page first.");
    assignedName = person.name;
  }
  return {
    Title: title,
    AssignedTo: assignedTo,
    AssignedName: assignedName,
    Items: JSON.stringify(items),
    Notes: String(list.notes ?? "").trim().slice(0, LIMITS.notes),
  };
}

async function sendPhoto(res, session, params) {
  const id = cleanListId(params.get("id"));
  const row = await visibleRow(session, id);
  const path = String(params.get("path") || "");
  if (!receiptsOf(row).some((r) => r.path === path)) throw new NotFound();
  const blob = await get(path, { access: "private" });
  if (!blob || blob.statusCode !== 200) throw new NotFound();
  res.statusCode = 200;
  res.setHeader("Content-Type", blob.blob.contentType || "image/jpeg");
  // Photos never change once taken (each has its own random name).
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  return res.end(Buffer.from(await new Response(blob.stream).arrayBuffer()));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const session = await requireAccess(req, res, ["shopping"]);
  if (!session) return;
  const manager = isManager(session);
  const managerOnly = () => {
    if (!manager) throw new Forbidden("Only a manager can make or change lists.");
  };

  try {
    if (req.method === "GET") {
      const params = new URL(req.url, "http://localhost").searchParams;
      const action = params.get("action");
      if (action === "receipt") return await sendPhoto(res, session, params);
      if (action === "productPhoto") {
        const product = await findProduct(cleanProductId(params.get("id")));
        if (!product || !isUploadedPhoto(product.Photo, product.ProductId)) throw new NotFound();
        const blob = await get(product.Photo, { access: "private" });
        if (!blob || blob.statusCode !== 200) throw new NotFound();
        res.statusCode = 200;
        res.setHeader("Content-Type", blob.blob.contentType || "image/webp");
        res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
        return res.end(Buffer.from(await new Response(blob.stream).arrayBuffer()));
      }
      if (action !== "list") throw new BadRequest("Unknown action");
      const [rows, products] = await Promise.all([allRows(), productRows()]);
      const people = manager ? await shoppers().catch(() => []) : [];
      const prices = seesPrices(session);
      return res.status(200).json({
        lists: rows.filter((r) => canSee(session, r)).map((r) => publicList(r, session)),
        products: (products || []).map((r) => publicProduct(r, { prices })).sort((a, b) => a.name.localeCompare(b.name)),
        catalog: products !== null,
        people,
        manager,
        photos: photosReady(),
        reader: photosReady() && readerReady(),
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = req.body || {};
    const who = await sellerName(session);
    const now = new Date().toISOString();

    if (body.action === "create") {
      managerOnly();
      const id = newListId();
      const row = { ListId: id, ...(await listFields(body.list)), Status: "Open", Spent: "", Receipts: "[]", CreatedBy: who, CreatedAt: now, UpdatedAt: now, DoneBy: "", DoneAt: "" };
      await sheetdb(`?sheet=${SHEET}`, { method: "POST", body: JSON.stringify({ data: [row] }) });
      return res.status(200).json({ ok: true, list: publicList(row, session) });
    }

    if (body.action === "saveProduct") {
      if (!manager) throw new Forbidden("Only a manager can change the catalog.");
      const fields = productFields(body.product);
      const existing = body.product?.id ? await findProduct(cleanProductId(body.product.id)) : null;
      if (body.product?.id && !existing) throw new NotFound();
      const id = existing ? existing.ProductId : newProductId();
      let photo = existing?.Photo || "";
      if (body.image) {
        if (!photosReady()) throw new BadRequest("Photo storage isn't set up yet.");
        const image = decodeImage(body.image);
        const blob = await put(`products/${id}/photo.${image.ext}`, image.buffer, { access: "private", contentType: image.contentType, addRandomSuffix: true });
        if (isUploadedPhoto(photo, id)) await del(photo).catch((err) => console.error("shopping: couldn't delete old product photo", err));
        photo = blob.pathname;
      }
      const row = { ...fields, Photo: photo, UpdatedAt: now };
      if (existing) await sheetdb(productPath(id), { method: "PATCH", body: JSON.stringify({ data: row }) });
      else await sheetdb(`?sheet=${PRODUCTS_SHEET}`, { method: "POST", body: JSON.stringify({ data: [{ ProductId: id, ...row }] }) });
      return res.status(200).json({ ok: true, product: publicProduct({ ProductId: id, ...row }, { prices: true }) });
    }

    if (body.action === "deleteProduct") {
      if (!manager) throw new Forbidden("Only a manager can change the catalog.");
      const product = await findProduct(cleanProductId(body.id));
      if (!product) throw new NotFound();
      if (isUploadedPhoto(product.Photo, product.ProductId) && photosReady()) await del(product.Photo).catch((err) => console.error("shopping: couldn't delete product photo", err));
      await sheetdb(productPath(product.ProductId), { method: "DELETE" }, { notFoundOk: true });
      return res.status(200).json({ ok: true });
    }

    const id = cleanListId(body.id);
    const row = await visibleRow(session, id);
    const reply = async (fields) => {
      await patchRow(id, fields);
      return res.status(200).json({ ok: true, list: publicList({ ...row, ...fields, UpdatedAt: new Date().toISOString() }, session) });
    };

    if (body.action === "edit") {
      managerOnly();
      // Check marks come from the sheet, not the manager's screen, so an
      // edit made while someone is at the store doesn't undo what they ticked.
      const fields = await listFields(body.list);
      const before = new Map(itemsOf(row).map((i) => [i.id, i]));
      const items = JSON.parse(fields.Items).map((i) => (before.has(i.id) ? { ...i, got: before.get(i.id).got === true, out: before.get(i.id).out === true } : { ...i, got: false, out: false }));
      return await reply({ ...fields, Items: JSON.stringify(items) });
    }

    if (body.action === "delete") {
      managerOnly();
      const paths = receiptsOf(row).map((r) => r.path);
      if (paths.length && photosReady()) await del(paths).catch((err) => console.error("shopping: couldn't delete photos", err));
      await sheetdb(rowPath(id), { method: "DELETE" }, { notFoundOk: true });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "reopen") {
      managerOnly();
      return await reply({ Status: "Open", DoneBy: "", DoneAt: "" });
    }

    // Everything below is the shopping trip itself.
    if (row.Status === "Done" && !manager) throw new BadRequest("This trip is already finished. Ask a manager to reopen it.");

    if (body.action === "item") {
      const items = itemsOf(row);
      const item = items.find((i) => i.id === body.itemId);
      if (!item) throw new NotFound();
      item.got = body.got === true;
      item.out = !item.got && body.out === true;
      return await reply({ Items: JSON.stringify(items) });
    }

    if (body.action === "addItem") {
      const items = itemsOf(row);
      if (items.length >= LIMITS.items) throw new BadRequest("This list is full.");
      const [added] = cleanItems([{ name: body.name, qty: body.qty, store: body.store, got: true, extra: true }]);
      if (!added) throw new BadRequest("Type what you bought.");
      return await reply({ Items: JSON.stringify([...items, added]) });
    }

    if (body.action === "receipt") {
      if (!photosReady()) throw new BadRequest("Receipt photos aren't set up yet. Ask the owner to connect photo storage.");
      const receipts = receiptsOf(row);
      if (receipts.length >= LIMITS.receipts) throw new BadRequest(`A trip can have up to ${LIMITS.receipts} receipt photos.`);
      const image = decodeImage(body.image);
      const blob = await put(`receipts/${id}/receipt.${image.ext}`, image.buffer, { access: "private", contentType: image.contentType, addRandomSuffix: true });
      const store = String(body.store ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      return await reply({ Receipts: JSON.stringify([...receipts, { path: blob.pathname, at: now, by: who, ...(store ? { store } : {}) }]) });
    }

    if (body.action === "readReceipt") {
      if (!readerReady()) throw new BadRequest("Receipt reading isn't set up yet.");
      const receipts = receiptsOf(row);
      const photo = receipts.find((r) => r.path === body.path);
      if (!photo) throw new NotFound();
      const blob = await get(photo.path, { access: "private" });
      if (!blob || blob.statusCode !== 200) throw new NotFound();
      const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
      let details;
      try {
        details = await readReceipt({ buffer, contentType: blob.blob.contentType || "image/jpeg" });
      } catch (err) {
        if (err instanceof UnreadableReceipt) throw new BadRequest("Couldn't read that receipt. Try a clearer photo, flat and in good light.");
        console.error("shopping: receipt reader failed", err);
        return res.status(502).json({ error: "The receipt reader isn't working right now. The photo is saved; press Read receipt again later." });
      }
      // Read the row again: someone may have checked items off meanwhile.
      const fresh = (await findRow(id)) || row;
      const updated = receiptsOf(fresh).map((r) => (r.path === photo.path ? { ...r, details } : r));
      await patchRow(id, { Receipts: JSON.stringify(updated) });
      return res.status(200).json({ ok: true, details, list: publicList({ ...fresh, Receipts: JSON.stringify(updated) }, session) });
    }

    if (body.action === "removeReceipt") {
      const receipts = receiptsOf(row);
      const photo = receipts.find((r) => r.path === body.path);
      if (!photo) throw new NotFound();
      if (!manager && photo.by !== who) throw new Forbidden("Only the person who took this photo, or a manager, can remove it.");
      if (photosReady()) await del(photo.path).catch((err) => console.error("shopping: couldn't delete photo", err));
      return await reply({ Receipts: JSON.stringify(receipts.filter((r) => r.path !== photo.path)) });
    }

    if (body.action === "finish") {
      const spent = money(body.spent);
      if (!spent) throw new BadRequest("Type the total from the receipt.");
      return await reply({ Status: "Done", Spent: spent, DoneBy: who, DoneAt: now });
    }

    throw new BadRequest("Unknown action");
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    if (err instanceof Forbidden) return res.status(403).json({ error: err.message });
    if (err instanceof NotFound) return res.status(404).json({ error: "That list or photo isn't there any more. Refresh the page." });
    console.error("shopping error:", err);
    return res.status(502).json({ error: "Couldn't reach the Shopping tab. Check that it exists in the sheet." });
  }
}
