import { describe, expect, it } from "vitest";
import { linkFor, matchesFilter, telLink, yesNo, businessTypes } from "../src/lib/leads.js";

describe("Web Design lead helpers", () => {
  it("reads Yes/No however it was typed", () => {
    expect(yesNo(" yes ")).toBe("Yes");
    expect(yesNo("Sí")).toBe("Yes");
    expect(yesNo("n")).toBe("No");
    expect(yesNo("maybe")).toBe("");
  });

  it("turns handles and bare sites into links", () => {
    expect(linkFor("Instagram", "@shop.nyc")).toBe("https://instagram.com/shop.nyc");
    expect(linkFor("TikTok", "shop")).toBe("https://www.tiktok.com/@shop");
    expect(linkFor("BusinessWebsite", "www.example.com")).toBe("https://www.example.com");
    expect(linkFor("BusinessWebsite", "https://example.com/a")).toBe("https://example.com/a");
    expect(linkFor("Others", "ask the owner")).toBe("");
    expect(linkFor("Others", "javascript:alert(1)")).toBe("");
  });

  it("only makes call links from real phone numbers", () => {
    expect(telLink("(555) 555-0101")).toBe("tel:5555550101");
    expect(telLink("ext 12")).toBe("");
  });

  it("filters", () => {
    expect(matchesFilter({ HasWebsite: "No" }, "noWebsite")).toBe(true);
    expect(matchesFilter({ HasWebsite: "", BusinessWebsite: "" }, "noWebsite")).toBe(true);
    expect(matchesFilter({ HasWebsite: "Yes" }, "noWebsite")).toBe(false);
    expect(matchesFilter({ AnswerPhone: "no" }, "noAnswer")).toBe(true);
  });

  it("lists business types once each", () => {
    expect(businessTypes([{ BusinessType: "Bakery" }, { BusinessType: "bakery " }, { BusinessType: "Barber" }])).toEqual(["Bakery", "Barber"]);
  });
});
