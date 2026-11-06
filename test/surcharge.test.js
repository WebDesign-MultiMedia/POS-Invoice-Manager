import { describe, expect, it } from "vitest";
import { calcSurcharge, CREDIT_SURCHARGE_CAP_RATE } from "../src/lib/surcharge.js";
import { formatMoney } from "../src/lib/format.js";
import { toCents } from "../src/lib/totals.js";

describe("calcSurcharge", () => {
  it("adds nothing for debit, prepaid and unknown cards", () => {
    for (const funding of ["debit", "prepaid", "unknown", undefined]) {
      expect(calcSurcharge(10000, funding)).toEqual({ surchargeCents: 0, totalCents: 10000 });
    }
  });

  it("returns zero for a $0 charge", () => {
    expect(calcSurcharge(0, "credit")).toEqual({ surchargeCents: 0, totalCents: 0 });
  });

  it("treats negative or junk amounts as $0", () => {
    expect(calcSurcharge(-500, "credit")).toEqual({ surchargeCents: 0, totalCents: 0 });
    expect(calcSurcharge("abc", "credit")).toEqual({ surchargeCents: 0, totalCents: 0 });
  });

  it("caps small credit tickets at 3% (the flat 30¢ fee would exceed it)", () => {
    // $5.00: pass-through would be ~$0.46, the 3% cap is $0.15.
    expect(calcSurcharge(500, "credit")).toEqual({ surchargeCents: 15, totalCents: 515 });
  });

  it("applies the 3% cap on a typical $100 ticket", () => {
    // Pass-through would be (10000 + 30) / 0.971 - 10000 = 329.55¢; the cap is 300¢.
    expect(calcSurcharge(10000, "credit")).toEqual({ surchargeCents: 300, totalCents: 10300 });
  });

  it("uses the pass-through fee once it's under the 3% cap (large tickets)", () => {
    // $3,000: (300000 + 30) / 0.971 - 300000 = 8990.73¢ → 8991¢, under the 9000¢ cap.
    expect(calcSurcharge(300000, "credit")).toEqual({ surchargeCents: 8991, totalCents: 308991 });
  });

  it("never exceeds the network cap, for any amount", () => {
    for (let cents = 1; cents <= 200000; cents += 997) {
      const { surchargeCents, totalCents } = calcSurcharge(cents, "credit");
      expect(surchargeCents).toBeLessThanOrEqual(Math.round(cents * CREDIT_SURCHARGE_CAP_RATE));
      expect(totalCents).toBe(cents + surchargeCents);
    }
  });

  it("always returns whole cents", () => {
    for (const cents of [1, 33, 101, 1999, 12345, 99999]) {
      const { surchargeCents, totalCents } = calcSurcharge(cents, "credit");
      expect(Number.isInteger(surchargeCents)).toBe(true);
      expect(Number.isInteger(totalCents)).toBe(true);
    }
  });

  it("rounds fractional input to the nearest cent", () => {
    expect(calcSurcharge(1000.6, "debit").totalCents).toBe(1001);
  });

  it("handles large catering amounts", () => {
    // $25,000.00: pass-through (2500030 / 0.971 - 2500000 = 74696.19¢) is under the $750 cap.
    expect(calcSurcharge(2_500_000, "credit")).toEqual({ surchargeCents: 74696, totalCents: 2_574_696 });
  });
});

describe("amount shown vs amount sent to Stripe", () => {
  // PayPage shows formatMoney(totalDue) and sends toCents(totalDue); the
  // server charges calcSurcharge(sentCents).totalCents and the receipt shows
  // that back. These must agree to the cent.
  it.each([0.1 + 0.2, 19.99, 37, 1050.5, 1.005, 333.33])("matches for $%s", (dollars) => {
    const sent = toCents(dollars);
    expect(formatMoney(sent / 100)).toBe(formatMoney(Math.round(dollars * 100) / 100));
    const { surchargeCents, totalCents } = calcSurcharge(sent, "credit");
    expect(formatMoney(totalCents / 100)).toBe(formatMoney((sent + surchargeCents) / 100));
  });
});
