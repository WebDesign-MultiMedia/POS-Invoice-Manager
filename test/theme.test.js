// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, getTheme, initTheme } from "../src/lib/theme.js";

const html = () => document.documentElement.classList;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

describe("theme", () => {
  it("starts blue when nothing was picked", () => {
    initTheme();
    expect(getTheme()).toBe("blue");
    expect(html().contains("theme-blue")).toBe(true);
  });

  it("remembers the picked theme for the next visit / login screen", () => {
    applyTheme("green");
    document.documentElement.className = "";
    initTheme();
    expect(getTheme()).toBe("green");
    expect(html().contains("theme-green")).toBe(true);
    expect(html().contains("dark")).toBe(true);
  });

  it("ignores a stored value that isn't a theme", () => {
    localStorage.setItem("pim-theme", "purple");
    initTheme();
    expect(getTheme()).toBe("blue");
  });
});
