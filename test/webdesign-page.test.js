// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { startDemo, endDemo } from "../src/lib/demo.js";
import { AuthProvider } from "../src/lib/auth.jsx";
import WebDesignPage from "../src/pages/WebDesignPage.jsx";

// Renders the Web Design page on demo data: businesses that answered AND
// have a website sit in their own box, not in the main list.
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

const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

describe("Web Design leads page", () => {
  it("puts answered + has a website in its own box", async () => {
    act(() =>
      root.render(h(MemoryRouter, { initialEntries: ["/webdesign"] }, h(AuthProvider, null, h(WebDesignPage))))
    );
    await wait(400);
    const box = el.querySelector('section[aria-label="Answered and has a website"]');
    expect(box).not.toBeNull();
    expect(box.textContent).toMatch(/Answered \+ has a website \(1\)/);
    expect(box.textContent).toMatch(/Green Leaf Test Kitchen/);
    const outside = [...el.querySelectorAll("article h2")].filter((h) => !box.contains(h)).map((h) => h.textContent);
    expect(outside).not.toContain("Green Leaf Test Kitchen");
    expect(outside).toContain("Sunrise Sample Bakery");

    // Closing it is remembered on this phone.
    act(() => box.querySelector("button[aria-expanded]").click());
    expect(box.querySelector("article")).toBeNull();
    expect(localStorage.getItem("pim-webdesign-both-open")).toBe("0");
  });
});
