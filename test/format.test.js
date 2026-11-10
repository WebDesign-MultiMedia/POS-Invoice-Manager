import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  toDateInput,
  time12Hour,
  getCurrentDateTime,
  toNumber,
  formatMoney,
  formatCardLabel,
  parseStoredDate,
  splitItems,
  getTotalQuantity,
  escapeRegex,
} from "../src/lib/format.js";

describe("currency", () => {
  it("formats dollars with cents and thousands separators", () => {
    expect(formatMoney(5)).toBe("$5.00");
    expect(formatMoney("1050.5")).toBe("$1,050.50");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("strips $ and commas typed into the sheet", () => {
    expect(formatMoney("$1,234.56")).toBe("$1,234.56");
    expect(toNumber("$1,234.56")).toBe(1234.56);
  });

  it("returns blank for missing or non-numeric values", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
    expect(formatMoney("abc")).toBe("");
  });

  it("keeps negatives (refund / deposit lines)", () => {
    expect(formatMoney(-12.5)).toBe("-$12.50");
  });
});

describe("dates and times", () => {
  afterEach(() => vi.useRealTimers());

  it("turns a date input (YYYY-MM-DD) into MM/DD/YYYY", () => {
    expect(formatDate("2026-11-06")).toBe("11/06/2026");
    expect(formatDate("")).toBe("");
  });

  it("toDateInput reverses formatDate for the date picker", () => {
    expect(toDateInput("11/06/2026")).toBe("2026-11-06");
    expect(toDateInput(formatDate("2026-01-09"))).toBe("2026-01-09");
    expect(toDateInput("1/9/2026")).toBe("2026-01-09");
    expect(toDateInput("")).toBe("");
    expect(toDateInput("next week")).toBe("");
  });

  it("converts 24-hour time to 12-hour", () => {
    expect(time12Hour("00:05")).toBe("12:05 AM");
    expect(time12Hour("09:30")).toBe("9:30 AM");
    expect(time12Hour("12:00")).toBe("12:00 PM");
    expect(time12Hour("18:45")).toBe("6:45 PM");
    expect(time12Hour("")).toBe("");
  });

  it("stamps the current date and time in the sheet's formats", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 3, 14, 7));
    expect(getCurrentDateTime()).toEqual({ date: "01/03/2026", time: "2:07 PM" });
  });

  it("parses stored MM/DD/YYYY dates into month and year", () => {
    expect(parseStoredDate("11/06/2026")).toEqual({ month: 11, year: 2026 });
    expect(parseStoredDate("")).toBeNull();
    expect(parseStoredDate("garbage")).toBeNull();
  });
});

describe("card labels", () => {
  it("shows brand and last 4", () => {
    expect(formatCardLabel("visa", "4242")).toBe("Visa •••• 4242");
    expect(formatCardLabel("amex", "0005")).toBe("Amex •••• 0005");
    expect(formatCardLabel("newbrand", "1111")).toBe("Newbrand •••• 1111");
    expect(formatCardLabel("", "1111")).toBe("Card •••• 1111");
  });

  it("is blank without a last 4", () => {
    expect(formatCardLabel("visa", "")).toBe("");
  });
});

describe("invoice items", () => {
  it("splits comma-separated items and reads the Nx quantity", () => {
    expect(splitItems("2x Ensalada de frutas, 1 char Chivo")).toEqual([
      { qty: 2, text: "Ensalada de frutas" },
      { qty: 1, text: "1 char Chivo" },
    ]);
  });

  it("prefers newlines and strips bullets and trailing commas", () => {
    expect(splitItems("•Carnitas,\n- 3X Tacos, extra salsa\n")).toEqual([
      { qty: 1, text: "Carnitas" },
      { qty: 3, text: "Tacos, extra salsa" },
    ]);
  });

  it("totals the quantity, defaulting to 1", () => {
    expect(getTotalQuantity("2x A, 3x B, C")).toBe(6);
    expect(getTotalQuantity("")).toBe(1);
  });

  it("escapes regex characters in search text", () => {
    expect(new RegExp(escapeRegex("(347) 555-0100")).test("(347) 555-0100")).toBe(true);
  });
});
