import { describe, expect, it } from "vitest";
import { MENU, MENU_ITEMS, qtyStep, formatCartLine, parseCardPaymentOrder } from "../src/lib/menu.js";
import { invoiceBalance, cartTotal, cartDeals, toCents } from "../src/lib/totals.js";

describe("menu price lookups", () => {
  it("indexes every menu item by id", () => {
    const count = MENU.reduce((n, c) => n + c.items.length, 0);
    expect(Object.keys(MENU_ITEMS)).toHaveLength(count);
    expect(MENU_ITEMS["taco-chivo"]).toMatchObject({ name: "Taco de Chivo", price: 5 });
    expect(MENU_ITEMS["lb-chivo"]).toMatchObject({ price: 20, unit: "lb" });
  });

  it("has a positive price on every item", () => {
    for (const item of Object.values(MENU_ITEMS)) expect(item.price).toBeGreaterThan(0);
  });

  it("steps by-the-pound items in half pounds", () => {
    expect(qtyStep(MENU_ITEMS["lb-carnitas"])).toBe(0.5);
    expect(qtyStep(MENU_ITEMS["taco-carnitas"])).toBe(1);
  });

  it("writes cart lines in the invoice's Nx / lb format", () => {
    expect(formatCartLine(MENU_ITEMS["taco-chivo"], 2)).toBe("2x Taco de Chivo");
    expect(formatCartLine(MENU_ITEMS["lb-carnitas"], 1.5)).toBe("1.5 lb Carnitas");
  });
});

describe("cart totals", () => {
  it("prices a mixed cart", () => {
    // 2 tacos ($10) + 1.5 lb carnitas ($24) + 1 large consomé ($16)
    expect(cartTotal({ "taco-chivo": 2, "lb-carnitas": 1.5, "consome-large": 1 }, MENU_ITEMS)).toBe(50);
  });

  it("ignores items that are no longer on the menu", () => {
    expect(cartTotal({ "taco-chivo": 1, "retired-item": 3 }, MENU_ITEMS)).toBe(5);
  });

  it("is 0 for an empty cart", () => {
    expect(cartTotal({}, MENU_ITEMS)).toBe(0);
  });

  it("never shows float noise", () => {
    expect(cartTotal({ a: 1, b: 1 }, { a: { price: 0.1 }, b: { price: 0.2 } })).toBe(0.3);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe("invoice balance with deposits and card payments", () => {
  it("is the full cost with no deposit or payments", () => {
    expect(invoiceBalance({ Cost: "290.00", Deposit: "0" })).toMatchObject({ balanceDue: 290, hasDeposit: false, deposit: 0 });
  });

  it("subtracts a deposit", () => {
    expect(invoiceBalance({ Cost: "290.00", Deposit: "100" })).toMatchObject({ balanceDue: 190, hasDeposit: true, deposit: 100 });
  });

  it("subtracts earlier card payments' base amount, not their fee", () => {
    const payments = [{ Amount: "90.00", Fee: "2.70", Total: "92.70" }];
    expect(invoiceBalance({ Cost: "290", Deposit: "100" }, payments)).toMatchObject({ balanceDue: 100, cardPaid: 90 });
  });

  it("never goes below zero when overpaid", () => {
    expect(invoiceBalance({ Cost: "50", Deposit: "60" }).balanceDue).toBe(0);
  });

  it("reads amounts typed with $ and commas", () => {
    expect(invoiceBalance({ Cost: "$1,050.00", Deposit: "$50" }).balanceDue).toBe(1000);
  });

  it("treats a blank or junk deposit as none", () => {
    expect(invoiceBalance({ Cost: "20", Deposit: "" })).toMatchObject({ balanceDue: 20, hasDeposit: false });
    expect(invoiceBalance({ Cost: "20", Deposit: "n/a" })).toMatchObject({ balanceDue: 20, hasDeposit: false });
  });

  it("is zero with no order loaded", () => {
    expect(invoiceBalance(null).balanceDue).toBe(0);
  });
});

describe("reading logged card payment orders", () => {
  it("reads the current Items column with saved prices", () => {
    const row = { Items: "1x Taco de Chivo ($5.00)\n0.5 lb Carnitas ($8.00)", Note: "extra salsa" };
    expect(parseCardPaymentOrder(row)).toEqual({
      items: [
        { label: "1x Taco de Chivo", price: 5 },
        { label: "0.5 lb Carnitas", price: 8 },
      ],
      note: "extra salsa",
    });
  });

  it("falls back to current menu prices for old rows without prices", () => {
    const row = { Note: "2x Taco de Chivo, 0.5 lb Carnitas — extra salsa" };
    expect(parseCardPaymentOrder(row)).toEqual({
      items: [
        { label: "2x Taco de Chivo", price: 10 },
        { label: "0.5 lb Carnitas", price: 8 },
      ],
      note: "extra salsa",
    });
  });

  it("still splits older comma-separated rows that saved prices", () => {
    const row = { Note: "1x Taco de Chivo ($5.00), 2x Party tray ($1,050.00) — Note: pickup 3pm" };
    expect(parseCardPaymentOrder(row)).toEqual({
      items: [
        { label: "1x Taco de Chivo", price: 5 },
        { label: "2x Party tray", price: 1050 },
      ],
      note: "pickup 3pm",
    });
  });

  it("keeps a $1,050.00 price intact", () => {
    expect(parseCardPaymentOrder({ Items: "1x Party tray ($1,050.00)" }).items[0].price).toBe(1050);
  });

  it("treats a plain note as a note, not items", () => {
    expect(parseCardPaymentOrder({ Note: "street vending" })).toEqual({ items: [], note: "street vending" });
  });
});

describe("cans & water 3 for $5", () => {
  it("prices the new items", () => {
    expect(MENU_ITEMS["flautas"]).toMatchObject({ price: 3 });
    expect(MENU_ITEMS["lb-carnitas"]).toMatchObject({ price: 16 });
    for (const id of ["agua-limonada", "agua-horchata", "agua-sandia", "agua-tamarindo"]) {
      expect(MENU_ITEMS[id]).toMatchObject({ price: 5 });
      expect(MENU_ITEMS[id].deal).toBeUndefined();
    }
    for (const id of ["can-soda", "water"]) {
      expect(MENU_ITEMS[id]).toMatchObject({ price: 2, deal: "drinks" });
    }
  });

  it("charges $2 each below 3", () => {
    expect(cartTotal({ water: 2 }, MENU_ITEMS)).toBe(4);
    expect(cartDeals({ water: 2 }, MENU_ITEMS)).toEqual([]);
  });

  it("charges $5 for 3, mixing items", () => {
    expect(cartTotal({ water: 1, "can-soda": 2 }, MENU_ITEMS)).toBe(5);
    expect(cartDeals({ water: 1, "can-soda": 2 }, MENU_ITEMS)).toEqual([{ key: "drinks", label: "Cans & water 3 for $5", sets: 1, savings: 1 }]);
  });

  it("prices the leftovers at $2", () => {
    // 7 cans/waters = two sets ($10) + one at $2
    expect(cartTotal({ water: 4, "can-soda": 3 }, MENU_ITEMS)).toBe(12);
  });

  it("doesn't touch non-deal items", () => {
    expect(cartTotal({ "taco-chivo": 1, water: 3 }, MENU_ITEMS)).toBe(10);
    expect(cartTotal({ "soda-coke": 3 }, MENU_ITEMS)).toBe(15);
    expect(cartTotal({ "agua-horchata": 3 }, MENU_ITEMS)).toBe(15);
  });

  it("reads a saved deal line back with its negative price", () => {
    const { items } = parseCardPaymentOrder({ Items: "3x Water ($6.00)\nCans & water 3 for $5 (-$1.00)" });
    expect(items).toEqual([
      { label: "3x Water", price: 6 },
      { label: "Cans & water 3 for $5", price: -1 },
    ]);
  });
});
