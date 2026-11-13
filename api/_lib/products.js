import crypto from "node:crypto";
import { BadRequest, money } from "./shopping.js";

// The product catalog: things bought again and again, so a list can be made
// by tapping instead of typing. One row per product in the order sheet's
// "Products" tab:
//   ProductId | Store | Name | Size | Category | Bin | ItemNo | UPC |
//   Price | Unit | EstEach | CasePrice | CaseQty | PriceNote | Photo | UpdatedAt
// Price is per Unit ("each" or "lb"). EstEach is what one usually costs when
// sold by weight (e.g. a ~16 lb sirloin butt). Photo is either a picture
// shipped with the app ("/imgs/products/…") or a private photo uploaded
// from the app ("products/…" in Vercel Blob).

export const PRODUCTS_SHEET = "Products";
export const DEFAULT_STORE = "Restaurant Depot";
export const UNITS = ["each", "lb"];

export const newProductId = () => "p" + crypto.randomBytes(8).toString("hex");

export function cleanProductId(value) {
  const id = String(value ?? "").trim();
  if (!/^p[a-f0-9]{8,40}$/.test(id)) throw new BadRequest("Missing or invalid product id");
  return id;
}

const text = (v, max = 120) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const code = (v) => String(v ?? "").replace(/[^\dA-Za-z-]/g, "").slice(0, 20);

// A manager's product form → the sheet's fields (Photo and ids are set by the server).
export function productFields(p) {
  if (!p || typeof p !== "object") throw new BadRequest("Missing product");
  const name = text(p.name);
  if (!name) throw new BadRequest("Type the product's name.");
  const caseQty = String(p.caseQty ?? "").replace(/\D/g, "").slice(0, 4);
  return {
    Store: text(p.store, 60) || DEFAULT_STORE,
    Name: name,
    Size: text(p.size, 60),
    Category: text(p.category, 40),
    Bin: code(p.bin),
    ItemNo: code(p.itemNo),
    UPC: code(p.upc),
    Price: money(p.price),
    Unit: UNITS.includes(p.unit) ? p.unit : "each",
    EstEach: money(p.estEach),
    CasePrice: money(p.casePrice),
    CaseQty: caseQty,
    PriceNote: text(p.priceNote, 200),
  };
}

// A row as the app gets it. Prices are left out for logins without "prices".
export function publicProduct(row, { prices }) {
  const hide = (v) => (prices ? v || "" : "");
  return {
    id: row.ProductId,
    store: row.Store || DEFAULT_STORE,
    name: row.Name || "",
    size: row.Size || "",
    category: row.Category || "",
    bin: row.Bin || "",
    itemNo: row.ItemNo || "",
    upc: row.UPC || "",
    unit: UNITS.includes(row.Unit) ? row.Unit : "each",
    price: hide(row.Price),
    estEach: hide(row.EstEach),
    casePrice: hide(row.CasePrice),
    caseQty: row.CaseQty || "",
    priceNote: prices ? row.PriceNote || "" : "",
    photo: row.Photo || "",
  };
}

// Pictures shipped with the app are public files; uploaded ones are private.
export const isBundledPhoto = (photo) => /^\/imgs\/products\/[a-z0-9-]+\.(webp|png|jpg)$/.test(String(photo || ""));
export const isUploadedPhoto = (photo, id) => String(photo || "").startsWith(`products/${id}/`);
