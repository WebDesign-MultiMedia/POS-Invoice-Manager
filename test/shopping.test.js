import { describe, expect, it } from "vitest";
import { addProduct, expectedCents, groupItemsByStore, parseTextList, storesOf, itemsFromText, productPriceLine, progress, spendingByMonth } from "../src/lib/shopping.js";

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
    expect(items).toEqual([{ name: "Open Pit BBQ Sauce", qty: "1", note: "1 gallon", price: "22.65", productId: "p1", store: "Restaurant Depot" }]);
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

describe("grouping a trip by store", () => {
  const products = new Map([
    ["p1", { id: "p1", store: "Restaurant Depot" }],
    ["p2", { id: "p2", store: "Jetro" }],
    ["p3", { id: "p3", store: "" }],
  ]);
  it("keeps the order of the stops, typed items for a store with it, and no-store items last", () => {
    const items = [
      { name: "Ice" },
      { name: "Sauce", productId: "p1", store: "Restaurant Depot" },
      { name: "Limes", store: "Restaurant Depot" },
      { name: "Rice", productId: "p2", store: "Jetro" },
      { name: "Paper towels", store: "Costco" },
    ];
    expect(groupItemsByStore(items, products).map((g) => [g.store, g.items.map((i) => i.name)])).toEqual([
      ["Restaurant Depot", ["Sauce", "Limes"]],
      ["Jetro", ["Rice"]],
      ["Costco", ["Paper towels"]],
      ["", ["Ice"]],
    ]);
    expect(storesOf(items)).toEqual(["Restaurant Depot", "Jetro", "Costco"]);
  });
  it("older items without a store use their product's store", () => {
    expect(groupItemsByStore([{ name: "Beef", productId: "p3" }], products)[0].store).toBe("Restaurant Depot");
  });
  it("a catalog product brings its store onto the list", () => {
    expect(addProduct([], { id: "p2", name: "Rice", store: "Jetro", unit: "each", price: "1" })[0].store).toBe("Jetro");
  });
});

describe("pasting a list texted by the manager", () => {
  const products = [
    { id: "p1", store: "Restaurant Depot", name: "Open Pit BBQ Sauce", size: "1 gallon", unit: "each", price: "22.65" },
    { id: "p2", store: "Restaurant Depot", name: "Tomatoes, 5x6 (Extra Large)", size: "25 lb case", unit: "each", price: "59.95" },
    { id: "p3", store: "Restaurant Depot", name: "La Morena Sliced Jalapeños", size: "#10 can", unit: "each", price: "10.49" },
    { id: "p4", store: "Restaurant Depot", name: "La Morena Whole Pickled Jalapeños", size: "#10 can", unit: "each", price: "8.49" },
    { id: "p5", store: "Restaurant Depot", name: "Jumbo Chicken Leg Quarters", unit: "lb", price: "0.60", estEach: "24.00" },
  ];
  const stores = ["Restaurant Depot"];
  const read = (text) => parseTextList(text, { stores, products, defaultStore: "Restaurant Depot" });

  it("splits the text into stores and items", () => {
    const sections = read("Restaurant Depot:\n2 bbq sauce\n- tomatoes\n\nBJ's\n• paper towels\n2x milk\n\nJetro:\n1. rice 50 lb");
    expect(sections.map((s) => [s.store, s.items.map((i) => [i.name, i.qty])])).toEqual([
      ["Restaurant Depot", [["Open Pit BBQ Sauce", "2"], ["Tomatoes, 5x6 (Extra Large)", "1"]]],
      ["BJ's", [["paper towels", ""], ["milk", "2"]]],
      ["Jetro", [["rice 50 lb", ""]]],
    ]);
  });

  it("brings the catalog's price, size and picture link along", () => {
    const [rd] = read("RD\n2 bbq sauce\n1 chicken leg quarters");
    expect(rd.store).toBe("Restaurant Depot");
    expect(rd.items[0]).toMatchObject({ productId: "p1", price: "45.30", note: "1 gallon", store: "Restaurant Depot" });
    expect(rd.items[1]).toMatchObject({ productId: "p5", price: "24.00" });
  });

  it("doesn't guess when the name fits two products", () => {
    const [rd] = read("Restaurant Depot:\njalapenos");
    expect(rd.items[0]).toMatchObject({ name: "jalapenos", productId: "" });
    expect(read("Restaurant Depot:\nsliced jalapenos")[0].items[0].productId).toBe("p3");
  });

  it("knows store names however they're written", () => {
    expect(read("bjs\nx")[0].store).toBe("BJ's");
    expect(read("At Costco:\nx")[0].store).toBe("Costco");
    expect(read("🛒 Restaurant depot\nx")[0].store).toBe("Restaurant Depot");
  });

  it("items before any store go under no store, and item lines are never stores", () => {
    const sections = read("ice\n2 cases tomatoes:\nonions");
    expect(sections).toEqual([{ store: "", items: [expect.objectContaining({ name: "ice" }), expect.objectContaining({ name: "tomatoes", qty: "2 cases" }), expect.objectContaining({ name: "onions" })] }]);
  });
});

describe("the business's regular stores", () => {
  it("are recognized when pasting, by full name or first word", () => {
    const read = (text) => parseTextList(text, { stores: [], products: [] }).map((s) => s.store);
    expect(read("Lucero Produce:\ncilantro\nReyes\nlimes")).toEqual(["Lucero Produce", "Reyes Produce"]);
    expect(read("lucero\nonions")).toEqual(["Lucero Produce"]);
  });
});
