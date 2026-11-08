import { describe, expect, it } from "vitest";
import { makeQuote, updateQuoteDishes, quoteItemsText, quoteToOrderForm } from "../src/lib/cateringQuotes.js";
import { dishLines, pressDish, pressEquals, pressOp } from "../src/lib/cateringCalc.js";
import { CATERING_DISHES as D } from "../src/lib/cateringMenu.js";
import { splitItems, getTotalQuantity } from "../src/lib/format.js";

const run = (...steps) => steps.reduce((tokens, step) => step(tokens), []);
const d = (dish, size = "whole") => (t) => pressDish(t, dish, size);

describe("catering quotes", () => {
  const tokens = run(d(D.carnitas), d(D.chivo), d(D.carnitas), d(D.frijoles, "half"), pressEquals);
  const quote = makeQuote(dishLines(tokens), tokens[0].value, []);

  it("saves the dishes and total, with empty client details", () => {
    expect(quote.number).toBe(1);
    expect(quote.total).toBe(170 + 350 + 170 + 40);
    expect(quote.lines.map((l) => `${l.qty} ${l.id} ${l.size}`)).toEqual(["2 carnitas whole", "1 chivo whole", "1 frijoles half"]);
    expect(quote.lines.some((l) => l.kind)).toBe(false); // no subtotal lines
    expect(quote).toMatchObject({ name: "", phone: "", address: "", eventDate: "", notes: "" });
  });

  it("numbers quotes one after another", () => {
    expect(makeQuote([], 0, [quote, { ...quote, number: 7 }]).number).toBe(8);
  });

  it("updates the dishes of a quote, keeping its details", () => {
    const named = { ...quote, name: "Ana" };
    const more = run(d(D.chivo), pressEquals);
    const updated = updateQuoteDishes(named, dishLines(more), 350);
    expect(updated).toMatchObject({ id: quote.id, number: 1, name: "Ana", total: 350 });
    expect(updated.lines).toHaveLength(1);
  });

  it("writes items in the invoice's Nx format, combining repeats", () => {
    // With × used, dishLines keeps each tap separate; items still combine.
    const q = makeQuote(dishLines(run(d(D.carnitas), (x) => pressOp(x, "×"), d(D.carnitas), d(D.pernil))), 1, []);
    expect(quoteItemsText(q)).toBe("2x Carnitas (Whole tray)\n1x Pernil (Whole tray)");
    expect(splitItems(quoteItemsText(quote))).toEqual([
      { qty: 2, text: "Carnitas (Whole tray)" },
      { qty: 1, text: "Chivo (Whole tray)" },
      { qty: 1, text: "Frijoles (Half tray)" },
    ]);
    expect(getTotalQuantity(quoteItemsText(quote))).toBe(4);
  });

  it("fills in the order form as a catering order, leaving payment and deposit", () => {
    const form = quoteToOrderForm({ ...quote, name: " Ana López ", phone: "555-0101", address: "1 Main St", eventDate: "2026-11-20", notes: "Party at 6" });
    expect(form).toEqual({
      Name: "Ana López",
      Contact: "555-0101",
      Address: "1 Main St",
      PickupDelivery: "Catering",
      Cost: "730.00",
      Payment: "",
      Deposit: "",
      Items: "2x Carnitas (Whole tray)\n1x Chivo (Whole tray)\n1x Frijoles (Half tray)",
      DueDate: "2026-11-20",
      Notes: "Party at 6",
    });
  });
});
