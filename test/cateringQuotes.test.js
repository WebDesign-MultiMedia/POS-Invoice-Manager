import { describe, expect, it } from "vitest";
import { makeQuote, updateQuoteDishes, quoteItemsText, quoteToOrderForm, quoteCode, quoteLabel, quotePayload, quoteFromRow } from "../src/lib/cateringQuotes.js";
import { dishLines, pressDish, pressEquals, pressOp } from "../src/lib/cateringCalc.js";
import { CATERING_DISHES as D } from "../src/lib/cateringMenu.js";
import { splitItems, getTotalQuantity } from "../src/lib/format.js";

const run = (...steps) => steps.reduce((tokens, step) => step(tokens), []);
const d = (dish, size = "whole") => (t) => pressDish(t, dish, size);

describe("catering quotes", () => {
  const tokens = run(d(D.carnitas), d(D.chivo), d(D.carnitas), d(D.frijoles, "half"), pressEquals);
  const quote = makeQuote(dishLines(tokens), tokens[0].value, new Date(2026, 10, 8, 14, 53));

  it("saves the dishes and total, with empty client details", () => {
    expect(quote.code).toBe("1108-1453");
    expect(quoteLabel(quote)).toBe("Quote 1108-1453");
    expect(quote.id).toMatch(/^q[a-z0-9]{12}$/);
    expect(quote.total).toBe(170 + 350 + 170 + 40);
    expect(quote.lines.map((l) => `${l.qty} ${l.id} ${l.size}`)).toEqual(["2 carnitas whole", "1 chivo whole", "1 frijoles half"]);
    expect(quote.lines.some((l) => l.kind)).toBe(false); // no subtotal lines
    expect(quote).toMatchObject({ name: "", phone: "", address: "", eventDate: "", notes: "" });
  });

  it("gives every quote its own random id, and labels older quotes by number", () => {
    expect(makeQuote([], 0).id).not.toBe(makeQuote([], 0).id);
    expect(quoteCode(new Date(2026, 0, 5, 9, 4))).toBe("0105-0904");
    expect(quoteLabel({ number: 3 })).toBe("Quote #3");
  });

  it("round-trips through a spreadsheet row", () => {
    const filled = { ...quote, name: "Ana", phone: "555-0101", eventDate: "2026-11-20", sentAt: "2026-11-09T10:00:00.000Z" };
    const p = quotePayload(filled);
    expect(p.itemsText).toBe("2x Carnitas (Whole tray)\n1x Chivo (Whole tray)\n1x Frijoles (Half tray)");
    // What api/quotes.js writes for that payload:
    const row = {
      QuoteId: p.id, Code: p.code, CreatedAt: p.createdAt, UpdatedAt: "2026-11-09T10:00:00.000Z", Source: "link", CreatedBy: "Maria",
      ClientName: p.name, Phone: p.phone, Address: p.address, EventDate: p.eventDate, Notes: p.notes, Items: p.itemsText,
      Total: p.total.toFixed(2), Lines: JSON.stringify(p.lines), SentAt: p.sentAt,
    };
    expect(quoteFromRow(row)).toMatchObject({
      id: quote.id, code: "1108-1453", source: "link", createdBy: "Maria", name: "Ana", total: 730, lines: quote.lines, eventDate: "2026-11-20", synced: true,
    });
  });

  it("reads rows edited by hand in the sheet", () => {
    expect(quoteFromRow({ QuoteId: "qabcdefgh1234", Total: "$1,050.00", Lines: "not json" })).toMatchObject({ total: 1050, lines: [], source: "staff", name: "" });
  });

  it("updates the dishes of a quote, keeping its details", () => {
    const named = { ...quote, name: "Ana" };
    const more = run(d(D.chivo), pressEquals);
    const updated = updateQuoteDishes(named, dishLines(more), 350);
    expect(updated).toMatchObject({ id: quote.id, code: "1108-1453", name: "Ana", total: 350 });
    expect(updated.lines).toHaveLength(1);
  });

  it("writes items in the invoice's Nx format, combining repeats", () => {
    // With × used, dishLines keeps each tap separate; items still combine.
    const q = makeQuote(dishLines(run(d(D.carnitas), (x) => pressOp(x, "×"), d(D.carnitas), d(D.pernil))), 1);
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
      Deposit: "0",
      Items: "2x Carnitas (Whole tray)\n1x Chivo (Whole tray)\n1x Frijoles (Half tray)",
      DueDate: "2026-11-20",
      Notes: "Party at 6",
    });
  });
});
