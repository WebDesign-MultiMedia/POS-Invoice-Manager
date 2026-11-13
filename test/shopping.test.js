import { describe, expect, it } from "vitest";
import { addProduct, expectedCents, itemsFromText, productPriceLine, progress, spendingByMonth } from "../src/lib/shopping.js";

describe("itemsFromText", () => {
  it("splits a pasted list into names and amounts", () => {
    expect(itemsFromText("- 2 cases tomatoes\n1. Onions - 1 bag\n2x Limes\nCilantro x6\n6 avocados\n\nNapkins")).toEqual([
      { name: "tomatoes", qty: "2 cases" },
      { name: "Onions", qty: "1 bag" },
      { name: "Limes", qty: "2" },
      { name: "Cilantro", qty: "6" },
      { name: "avocados", qty: "6" },
      { name: "Napkins", qty: "" },
    ]);
  });
});

describe("trip math", () => {
  const list = {
    status: "Open",
    items: [
      { name: "a", price: "10.00", got: true },
      { name: "b", price: "5.50", out: true },
      { name: "c", price: "" },
      { name: "d", price: "", got: true, extra: true },
    ],
  };
  it("counts planned items, not extras", () => {
    expect(progress(list)).toEqual({ total: 3, got: 1, out: 1, left: 1, extras: 1 });
  });
  it("expected cost skips what was out of stock", () => {
    expect(expectedCents(list)).toBe(1000);
  });
  it("groups finished trips by month, newest first", () => {
    const months = spendingByMonth([
      { status: "Done", spent: "10.10", doneAt: "2026-10-03T12:00:00Z" },
      { status: "Done", spent: "20.25", doneAt: "2026-11-02T12:00:00Z" },
      { status: "Done", spent: "1.00", doneAt: "2026-11-09T12:00:00Z" },
      { status: "Open", spent: "", doneAt: "" },
    ]);
    expect(months.map((m) => [m.key, m.cents, m.trips.length])).toEqual([
      ["2026-11", 2125, 2],
      ["2026-10", 1010, 1],
    ]);
  });
});

describe("catalog products on a list", () => {
  const sauce = { id: "p1", name: "Open Pit BBQ Sauce", size: "1 gallon", unit: "each", price: "22.65", casePrice: "79.99", caseQty: "4" };
  const beef = { id: "p2", name: "Beef Top Sirloin Butts", size: "About 16 lb each", unit: "lb", price: "5.59", estEach: "89.44" };
  it("adds a product, then one more each tap", () => {
    let items = addProduct([], sauce);
    expect(items).toEqual([{ name: "Open Pit BBQ Sauce", qty: "1", note: "1 gallon", price: "22.65", productId: "p1" }]);
    items = addProduct(items, sauce);
    expect(items[0]).toMatchObject({ qty: "2", price: "45.30" });
  });
  it("uses the usual cost of one piece for things sold by the pound", () => {
    expect(addProduct([], beef)[0].price).toBe("89.44");
  });
  it("describes prices", () => {
    expect(productPriceLine(sauce)).toBe("$22.65 each · case of 4 $79.99");
    expect(productPriceLine(beef)).toBe("$5.59/lb · about $89.44 each");
  });
});
