import { describe, expect, it } from "vitest";
import { expectedCents, itemsFromText, progress, spendingByMonth } from "../src/lib/shopping.js";

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
