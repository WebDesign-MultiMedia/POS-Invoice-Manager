import { describe, expect, it } from "vitest";
import { cashChange, newEventSaleId, quickCashOptions, summarizeSales } from "../src/lib/eventSales.js";

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
