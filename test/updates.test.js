import { describe, expect, it } from "vitest";
import { UPDATES, updatesFor } from "../src/pages/UpdatesPage.jsx";

// Each business is its own account and sees only its own updates.
describe("What's New per business", () => {
  it("the restaurant never sees Web Design updates", () => {
    const shown = updatesFor(false);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.some((u) => u.business === "web")).toBe(false);
    for (const u of shown) expect(`${u.title} ${u.body}`).not.toMatch(/web design|multimedia/i);
  });

  it("Web Design sees only its own (and shared) updates", () => {
    const shown = updatesFor(true);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((u) => u.business === "web" || u.business === "both")).toBe(true);
    expect(shown.some((u) => /order|invoice|shopping/i.test(u.title) && u.business !== "both")).toBe(false);
  });

  it("every update belongs to exactly one list or both", () => {
    expect(updatesFor(false).length + updatesFor(true).length).toBe(UPDATES.length + UPDATES.filter((u) => u.business === "both").length);
  });
});
