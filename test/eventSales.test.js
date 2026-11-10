import { describe, expect, it } from "vitest";
import { cashChange, newEventSaleId, quickCashOptions, saleEdit, summarizeSales } from "../src/lib/eventSales.js";
import { saleToOrderForm } from "../src/lib/saleToOrder.js";

describe("event sales", () => {
  it("makes EV- ids from the time", () => {
    expect(newEventSaleId(new Date(2026, 10, 9, 14, 5, 7))).toBe("EV-261109-140507");
  });

  it("works out the change, or null when short", () => {
    expect(cashChange(14.5, "20")).toBe(5.5);
    expect(cashChange(14.5, "14.50")).toBe(0);
    expect(cashChange(14.5, "10")).toBeNull();
    expect(cashChange(0.3, "0.30")).toBe(0); // no float noise
  });

  it("offers exact cash and the next bills up", () => {
    expect(quickCashOptions(14.5)).toEqual([14.5, 15, 20, 50, 100]);
    expect(quickCashOptions(20)).toEqual([20, 50, 100]);
    expect(quickCashOptions(0)).toEqual([]);
  });

  it("totals the day by method", () => {
    const s = summarizeSales([
      { Method: "Cash", Total: "29.00" },
      { Method: "Zelle", Total: "12.00" },
      { Method: "Card", Amount: "14.00", Total: "14.42" },
      { Method: "Card", Total: "5.10" },
    ]);
    expect(s.count).toBe(4);
    expect(s.total).toBe(60.52);
    expect(s.byMethod.Card).toEqual({ count: 2, total: 19.52 });
    expect(s.byMethod.Cash).toEqual({ count: 1, total: 29 });
  });
});

describe("editing a sale", () => {
  const cash = { SaleId: "EV-1", Method: "Cash", Total: "12.00", CashReceived: "20.00", Change: "8.00" };

  it("a card sale only changes name, items and note", () => {
    expect(saleEdit({ Method: "Card", Total: "9.00" }, { Name: " Pat ", Items: "1x Taco", Note: "", Total: "1.00", Method: "Cash" })).toEqual({
      Name: "Pat",
      Items: "1x Taco",
      Note: "",
    });
  });

  it("a cash sale's new total re-works the change", () => {
    expect(saleEdit(cash, { Method: "Cash", Total: "15" })).toMatchObject({ Amount: "15.00", Total: "15.00", CashReceived: "20.00", Change: "5.00" });
  });

  it("clears cash received when it no longer covers the total, or for Zelle", () => {
    expect(saleEdit(cash, { Method: "Cash", Total: "25" })).toMatchObject({ CashReceived: "", Change: "" });
    expect(saleEdit(cash, { Method: "Zelle", Total: "12" })).toMatchObject({ Method: "Zelle", CashReceived: "", Change: "" });
  });

  it("refuses a missing or zero total", () => {
    expect(() => saleEdit(cash, { Method: "Cash", Total: "" })).toThrow("Enter a total");
    expect(() => saleEdit(cash, { Method: "Cash", Total: "abc" })).toThrow("Enter a total");
  });
});

describe("making an invoice from a sale", () => {
  it("fills the order form as paid in full", () => {
    const form = saleToOrderForm(
      { Name: "Pat", Phone: "(555) 010-0000", Items: "1x Taco ($4.00)", Amount: "10.00", Fee: "0.30", Total: "10.30", Card: "Visa •••• 4242", Date: "11/09/2026", InvoiceId: "CP-261109-120000" },
      "Card"
    );
    expect(form).toMatchObject({ Name: "Pat", Contact: "(555) 010-0000", Cost: "10.00", Deposit: "10.00", Payment: "Card", Items: "1x Taco ($4.00)", PickupDelivery: "" });
    expect(form.Notes).toContain("Paid in full by card (Visa •••• 4242) on 11/09/2026.");
    expect(form.Notes).toContain("Card fee $0.30");
    expect(form.Notes).toContain("CP-261109-120000");
  });

  it("works for a cash event sale", () => {
    const form = saleToOrderForm({ SaleId: "EV-261109-120000", Total: "8.00", Amount: "8.00", Method: "Cash" }, "Cash");
    expect(form).toMatchObject({ Cost: "8.00", Deposit: "8.00", Payment: "Cash" });
    expect(form.Notes).toBe("Paid in full by cash. Sale EV-261109-120000.");
  });
});

describe("sales by person", () => {
  it("totals each seller, biggest first, and groups unnamed old sales", () => {
    const { bySeller } = summarizeSales([
      { SoldBy: "Carlos", Total: "10.00" },
      { SoldBy: "Ana", Total: "4.50" },
      { SoldBy: "Carlos", Total: "2.25" },
      { Total: "1.00" },
    ]);
    expect(bySeller).toEqual([
      { name: "Carlos", count: 2, total: 12.25 },
      { name: "Ana", count: 1, total: 4.5 },
      { name: "Not recorded", count: 1, total: 1 },
    ]);
  });
});
