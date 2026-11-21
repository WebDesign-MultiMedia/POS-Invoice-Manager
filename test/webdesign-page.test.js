// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { startDemo, endDemo } from "../src/lib/demo.js";
import { AuthProvider } from "../src/lib/auth.jsx";
import WebDesignPage from "../src/pages/WebDesignPage.jsx";

// Renders the Web Design page on demo data: Leads, Answered + website and
// Deleted are tabs, and picked tabs and filters survive a refresh.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
let el;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no server in demo"))));
  // jsdom has no matchMedia (used by the theme toggle and tilt cards).
  window.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  startDemo();
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});

afterEach(() => {
  act(() => root.unmount());
  el.remove();
  endDemo();
  vi.unstubAllGlobals();
});

const page = () => h(MemoryRouter, { initialEntries: ["/webdesign"] }, h(AuthProvider, null, h(WebDesignPage)));
const chip = (label) => [...el.querySelectorAll("button[aria-pressed]")].find((b) => b.textContent.trim().startsWith(label));
const names = () => [...el.querySelectorAll("article h2")].map((x) => x.textContent);
async function reload() {
  act(() => root.unmount());
  root = createRoot(el);
  act(() => root.render(page()));
  await wait(400);
}
const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("Web Design leads page", () => {
  it("splits Leads, Answered + website and Deleted into tabs", async () => {
    act(() => root.render(page()));
    await wait(400);
    const sub = (label) => [...el.querySelectorAll('[role="tablist"][aria-label="Lead lists"] [role="tab"]')].find((t) => t.textContent.includes(label));
    expect(sub("Leads").getAttribute("aria-selected")).toBe("true");
    expect(sub("Answered + website").textContent).toMatch(/\(1\)/);
    expect(names()).not.toContain("Green Leaf Test Kitchen");
    expect(names()).toContain("Sunrise Sample Bakery");

    act(() => sub("Answered + website").click());
    expect(names()).toEqual(["Green Leaf Test Kitchen"]);

    act(() => sub("Deleted").click());
    expect(names()).toEqual([]);
    expect(el.querySelector('section[aria-label="Recently deleted businesses"] button[aria-label^="Restore"]')).not.toBeNull();

    // The picked tab is remembered on this phone.
    await reload();
    expect(sub("Deleted").getAttribute("aria-selected")).toBe("true");
    expect(JSON.parse(localStorage.getItem("pim-webdesign-view"))).toBe("deleted");
  });

  it("keeps the picked filter and business type after a refresh", async () => {
    act(() => root.render(page()));
    await wait(400);
    act(() => chip("No website").click());
    act(() => {
      const select = el.querySelector('select[aria-label="Business type"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
      setter.call(select, "Barber");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(names()).toEqual(["Fresh Fade Demo Barbers"]);

    await reload();
    expect(chip("No website").getAttribute("aria-pressed")).toBe("true");
    expect(el.querySelector('select[aria-label="Business type"]').value).toBe("Barber");
    expect(names()).toEqual(["Fresh Fade Demo Barbers"]);
  });

  it("forgets a saved choice that no longer exists", async () => {
    localStorage.setItem("pim-webdesign-filter", JSON.stringify("gone"));
    localStorage.setItem("pim-webdesign-type", JSON.stringify("Spaceship repair"));
    act(() => root.render(page()));
    await wait(400);
    expect(chip("All").getAttribute("aria-pressed")).toBe("true");
    expect(names().length).toBeGreaterThan(1);
  });

  it("remembers the Projects tab and its filter", async () => {
    act(() => root.render(page()));
    await wait(400);
    act(() => [...el.querySelectorAll('[role="tab"]')].find((t) => /Projects/.test(t.textContent)).click());
    await wait(400);
    act(() => chip("Live sites").click());
    await reload();
    expect([...el.querySelectorAll('[role="tab"]')].find((t) => t.getAttribute("aria-selected") === "true").textContent).toMatch(/Projects/);
    expect(chip("Live sites").getAttribute("aria-pressed")).toBe("true");
  });
});
