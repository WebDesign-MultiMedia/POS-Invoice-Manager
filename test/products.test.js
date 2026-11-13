import { describe, expect, it } from "vitest";
import { priceUpdatesFromReceipt } from "../api/_lib/products.js";

// Catalog prices kept up to date from scanned receipts.
const rows = [
  { ProductId: "pqueso0001", Name: "Livi's Queso Oaxaca", Unit: "each", Price: "", Size: "", PriceNote: "" },
  { ProductId: "psauce0001", Name: "Open Pit BBQ Sauce", Unit: "each", Price: "22.65", CasePrice: "79.99", CaseQty: "4", Size: "1 gallon", PriceNote: "$0.18/fl oz" },
  { ProductId: "pshoulder1", Name: "Pork Shoulder", Unit: "lb", Price: "1.19", EstEach: "23.80", PriceNote: "Final cost by weight." },
];
const update = (items) => priceUpdatesFromReceipt({ items }, rows, { date: "2026-11-14" });

describe("prices from a receipt", () => {
  it("fills an empty price, and the size if the receipt shows it", () => {
    const [u] = update([{ productId: "pqueso0001", qty: "2", price: 31.98, size: "5 lb" }]);
    expect(u).toMatchObject({ name: "Livi's Queso Oaxaca", field: "Price", from: "", to: "15.99" });
    expect(u.fields).toEqual({ Price: "15.99", Size: "5 lb", PriceNote: "Price from the 2026-11-14 receipt." });
  });

  it("updates a changed price and keeps the old one in the note", () => {
    const [u] = update([{ productId: "psauce0001", qty: "1", price: 23.49 }]);
    expect(u.fields).toEqual({ Price: "23.49", PriceNote: "Price was $22.65 before the 2026-11-14 receipt. $0.18/fl oz" });
  });

  it("a line that costs about a case updates the case price", () => {
    const [u] = update([{ productId: "psauce0001", qty: "1", price: 76.5 }]);
    expect(u).toMatchObject({ field: "Case price", from: "79.99", to: "76.50" });
  });

  it("by the pound: divides by the weight on the line, or skips without one", () => {
    expect(update([{ productId: "pshoulder1", qty: "21.6 lb", price: 26.78 }])[0]).toMatchObject({ field: "Price per lb", to: "1.24" });
    expect(update([{ productId: "pshoulder1", qty: "1", price: 26.78 }])).toEqual([]);
  });

  it("skips wild jumps, unchanged prices, unknown products and repeats", () => {
    expect(update([{ productId: "psauce0001", qty: "1", price: 5 }])).toEqual([]);
    expect(update([{ productId: "psauce0001", qty: "1", price: 22.65 }])).toEqual([]);
    expect(update([{ productId: "pother0001", qty: "1", price: 5 }])).toEqual([]);
    expect(update([{ productId: "pqueso0001", qty: "1", price: 15 }, { productId: "pqueso0001", qty: "1", price: 16 }])).toHaveLength(1);
  });

  it("doesn't pile up old receipt notes", () => {
    const once = update([{ productId: "psauce0001", qty: "1", price: 23.49 }])[0].fields.PriceNote;
    const twice = priceUpdatesFromReceipt({ items: [{ productId: "psauce0001", qty: "1", price: 24 }] }, [{ ...rows[1], Price: "23.49", PriceNote: once }], { date: "2026-11-20" });
    expect(twice[0].fields.PriceNote).toBe("Price was $23.49 before the 2026-11-20 receipt. $0.18/fl oz");
  });
});
