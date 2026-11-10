import { describe, expect, it } from "vitest";
import { receiptMessage, smsHref, smsNumber } from "../src/lib/textReceipt.js";

const sale = {
  Date: "11/10/2026",
  Time: "10:42 AM",
  SaleId: "EV-261110-104200",
  Items: "3x Water ($6.00)\nCans & water 3 for $5 (-$1.00)\n2x Taco de Chivo ($10.00)",
  Amount: "15.00",
  Fee: "0.47",
  Total: "15.47",
  Method: "Card",
  Card: "Visa •4242",
};

describe("text receipt", () => {
  it("lists items, deal, fee, total, the invoice link and the card receipt link", () => {
    const text = receiptMessage({ brandName: "Buffet Lucia", sale, invoiceUrl: "https://x.test/invoice?id=EV-1", receiptUrl: "https://pay.stripe.com/receipts/abc" });
    expect(text).toBe(
      [
        "Buffet Lucia — Receipt",
        "Order EV-261110-104200 · 11/10/2026 10:42 AM",
        "",
        "3x Water — $6.00",
        "Cans & water 3 for $5 — -$1.00",
        "2x Taco de Chivo — $10.00",
        "Card fee — $0.47",
        "",
        "Total paid: $15.47 by card (Visa •4242)",
        "",
        "Invoice: https://x.test/invoice?id=EV-1",
        "Card receipt: https://pay.stripe.com/receipts/abc",
        "",
        "Thank you! ¡Gracias!",
      ].join("\n"),
    );
  });

  it("works for a cash sale with no items", () => {
    const text = receiptMessage({ brandName: "Buffet Lucia", sale: { SaleId: "EV-1", Total: "20.00", Method: "Cash" } });
    expect(text).toBe(["Buffet Lucia — Receipt", "Order EV-1", "", "Total paid: $20.00 by cash", "", "Thank you! ¡Gracias!"].join("\n"));
  });

  it("formats US numbers for the Messages link", () => {
    expect(smsNumber("(555) 123-4567")).toBe("+15551234567");
    expect(smsNumber("1 555 123 4567")).toBe("+15551234567");
    expect(smsNumber("")).toBe("");
    expect(smsHref("5551234567", "Hi & bye")).toBe("sms:+15551234567?&body=Hi%20%26%20bye");
  });
});
