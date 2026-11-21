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

import { matchesProject, projectTitle, updatedAgo } from "../src/lib/leads.js";

describe("GitHub project helpers", () => {
  it("makes repo names readable", () => {
    expect(projectTitle("littleLeadersGroupFamily-Daycare")).toBe("Little Leaders Group Family Daycare");
    expect(projectTitle("POS-Invoice-Manager")).toBe("POS Invoice Manager");
    expect(projectTitle("V-Tracker_Capstone")).toBe("V Tracker Capstone");
  });

  it("filters live sites, recent ones, and hides archived/forks unless asked", () => {
    const now = Date.parse("2026-11-20T00:00:00Z");
    const live = { name: "a", homepage: "https://x.com", pushedAt: "2026-11-10T00:00:00Z" };
    const old = { name: "b", homepage: "", pushedAt: "2024-01-01T00:00:00Z", archived: true };
    expect(matchesProject(live, { filter: "live", now })).toBe(true);
    expect(matchesProject({ ...live, homepage: "" }, { filter: "live", now })).toBe(false);
    expect(matchesProject(live, { filter: "recent", now })).toBe(true);
    expect(matchesProject(old, { now })).toBe(false);
    expect(matchesProject(old, { showOld: true, now })).toBe(true);
    expect(matchesProject({ name: "sulysSweets", pushedAt: "" }, { query: "sulys sweets", now })).toBe(true);
  });

  it("says how long ago", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(updatedAgo("2026-11-20T01:00:00Z", now)).toBe("today");
    expect(updatedAgo("2026-11-19T01:00:00Z", now)).toBe("yesterday");
    expect(updatedAgo("2026-09-01T00:00:00Z", now)).toBe("2 months ago");
    expect(updatedAgo("2023-01-01T00:00:00Z", now)).toBe("3 years ago");
  });
});

import { isAnsweredWithWebsite, isNoAnswerNoWebsite } from "../src/lib/leads.js";

describe("answered + has a website", () => {
  it("no answer + no website needs both to be No", () => {
    expect(isNoAnswerNoWebsite({ AnswerPhone: "no ", HasWebsite: "N" })).toBe(true);
    expect(isNoAnswerNoWebsite({ AnswerPhone: "No", HasWebsite: "" })).toBe(false);
    expect(isNoAnswerNoWebsite({ AnswerPhone: "Yes", HasWebsite: "No" })).toBe(false);
  });

  it("needs both to be Yes, however it was typed", () => {
    expect(isAnsweredWithWebsite({ AnswerPhone: "yes ", HasWebsite: "Y" })).toBe(true);
    expect(isAnsweredWithWebsite({ AnswerPhone: "Yes", HasWebsite: "No" })).toBe(false);
    expect(isAnsweredWithWebsite({ AnswerPhone: "", HasWebsite: "Yes" })).toBe(false);
    expect(matchesFilter({ AnswerPhone: "Yes", HasWebsite: "Yes" }, "both")).toBe(true);
  });
});
