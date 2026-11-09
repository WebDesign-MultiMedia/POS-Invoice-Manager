import { describe, expect, it } from "vitest";
import { cardPaymentsNewestFirst, findSubmittedOrder, newestOrder, ordersNewestFirst } from "../src/lib/recentOrder.js";

const rows = [
  { Id: "9", Date: "11/09/2026", Time: "10:00 AM", Name: "Ana", Contact: "555" },
  { Id: "12", Date: "11/09/2026", Time: "10:05 AM", Name: "Luis", Contact: "777" },
  { Id: "CP-261109-100500", Name: "Walk-up" },
  { Id: "10", Date: "11/09/2026", Time: "10:05 AM", Name: "Luis", Contact: "777" },
];

describe("recent orders", () => {
  it("the newest order is the highest Id, whatever the row order", () => {
    expect(newestOrder(rows).Id).toBe("12");
    expect(newestOrder([...rows].reverse()).Id).toBe("12");
    expect(newestOrder([])).toBeNull();
    expect(newestOrder([{ Id: "" }])).toBeNull();
  });

  it("lists every order newest first, skipping walk-up card sales", () => {
    expect(ordersNewestFirst(rows).map((r) => r.Id)).toEqual(["12", "10", "9"]);
  });

  it("finds the order just submitted by date, time, name and phone", () => {
    expect(findSubmittedOrder(rows, { Date: "11/09/2026", Time: "10:05 AM", Name: " Luis", Contact: "777" }).Id).toBe("12");
    expect(findSubmittedOrder(rows, { Date: "11/09/2026", Time: "10:00 AM", Name: "Ana", Contact: "555" }).Id).toBe("9");
    // Sheet showed the date differently: still the newest order for that customer.
    expect(findSubmittedOrder(rows, { Date: "2026-11-09", Time: "10:00", Name: "Ana", Contact: "555" }).Id).toBe("9");
    expect(findSubmittedOrder(rows, { Date: "11/09/2026", Time: "10:00 AM", Name: "Bea", Contact: "555" })).toBeNull();
  });
});

describe("recent card payments", () => {
  it("sorts by date and time, newest first", () => {
    const rows = [
      { InvoiceId: "a", Date: "11/08/2026", Time: "11:59 PM" },
      { InvoiceId: "b", Date: "11/09/2026", Time: "12:05 AM" },
      { InvoiceId: "c", Date: "11/09/2026", Time: "12:30 PM" },
      { InvoiceId: "d", Date: "11/09/2026", Time: "9:15 AM" },
      { InvoiceId: "e", Date: "", Time: "" },
    ];
    expect(cardPaymentsNewestFirst(rows).map((r) => r.InvoiceId)).toEqual(["c", "d", "b", "a", "e"]);
  });

  it("keeps the sheet's later row first within the same minute", () => {
    const rows = [
      { InvoiceId: "first", Date: "11/09/2026", Time: "1:00 PM" },
      { InvoiceId: "second", Date: "11/09/2026", Time: "1:00 PM" },
    ];
    expect(cardPaymentsNewestFirst(rows)[0].InvoiceId).toBe("second");
  });
});
