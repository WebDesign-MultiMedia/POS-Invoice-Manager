import { describe, expect, it } from "vitest";
import { orderTypeGroup, orderYears, typeTotals } from "../src/lib/orderTotals.js";

const orders = [
  { Date: "01/10/2025", Name: "Ana", PickupDelivery: "Catering", Cost: "300", Deposit: "100", Payment: "Zelle", DueDate: "01/12/2025" },
  { Date: "11/01/2026", Name: "ana", PickupDelivery: "Catering - Setup & pickup later", Cost: "$500.00", Deposit: "200", Payment: "Pending", DueDate: "11/20/2026" },
  { Date: "11/02/2026", Name: "Ben", PickupDelivery: "Catering - Drop-off", Cost: "250", Deposit: "0", Payment: "Pending", DueDate: "11/16/2026" },
  { Date: "03/05/2026", Name: "Cy", PickupDelivery: "Delivery", Cost: "40", Payment: "Cash" },
  { Date: "04/05/2025", Name: "Di", PickupDelivery: "Pick-up", Cost: "15.5", Payment: "Card" },
  { Date: "04/06/2026", Name: "Di", PickupDelivery: "Pick-up", Cost: "TBD", Payment: "Card" },
  { Date: "05/05/2026", Name: "Ev", PickupDelivery: "Event", Cost: "99", Payment: "Cash" },
];

describe("order type totals", () => {
  it("sorts types into the three cards", () => {
    expect(orderTypeGroup("Catering - Setup & pickup later")).toBe("catering");
    expect(orderTypeGroup("Pick-up")).toBe("pickup");
    expect(orderTypeGroup("Delivery")).toBe("delivery");
    expect(orderTypeGroup("Event")).toBe(null);
  });

  it("adds every year together", () => {
    const t = typeTotals(orders, { today: "2026-11-14" });
    expect(t.catering).toMatchObject({ count: 3, total: 1050, average: 350, pendingCount: 2, pendingOwed: 550, setupCount: 1 });
    expect(t.catering.upcoming.map((u) => u.due)).toEqual(["2026-11-16", "2026-11-20"]);
    expect(t.catering.topCustomer).toEqual({ name: "Ana", count: 2 });
    expect(t.delivery).toMatchObject({ count: 1, total: 40, topCustomer: null });
    expect(t.pickup).toMatchObject({ count: 2, total: 15.5 });
  });

  it("or one year", () => {
    const t = typeTotals(orders, { year: 2025, today: "2026-11-14" });
    expect(t.catering).toMatchObject({ count: 1, total: 300, upcoming: [] });
    expect(t.delivery.count).toBe(0);
    expect(orderYears(orders)).toEqual([2026, 2025]);
  });
});
