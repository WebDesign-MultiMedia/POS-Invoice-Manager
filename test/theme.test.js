// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, getTheme, initTheme, THEMES } from "../src/lib/theme.js";
import { readFileSync } from "node:fs";

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

  it("the developer themes are dark, with only their own class on", () => {
    for (const key of ["terminal", "code", "logo"]) {
      applyTheme(key);
      expect(html().contains("dark")).toBe(true);
      expect(html().contains(`theme-${key}`)).toBe(true);
      for (const other of ["blue", "green", "red", "gray", "terminal", "code", "logo"].filter((k) => k !== key)) {
        expect(html().contains(`theme-${other}`)).toBe(false);
      }
    }
    applyTheme("light");
    expect(html().contains("dark")).toBe(false);
    expect(html().contains("theme-logo")).toBe(false);
  });

  it("a picked developer theme is remembered", () => {
    applyTheme("code");
    document.documentElement.className = "";
    initTheme();
    expect(getTheme()).toBe("code");
  });

  it("every tinted theme has its colours in index.css", () => {
    const css = readFileSync(`${process.cwd()}/src/index.css`, "utf8");
    for (const t of THEMES.filter((t) => !["dark", "light"].includes(t.key))) {
      const blocks = css.match(new RegExp(`\\.theme-${t.key} \\{[^}]*\\}`, "g")) || [];
      expect(blocks.some((b) => b.includes("--page-bg"))).toBe(true);
      if (t.key !== "gray") expect(blocks.some((b) => b.includes("--ui-btn-from"))).toBe(true);
    }
  });

  it("every theme class is kept in the build (Tailwind safelist)", async () => {
    const { default: config } = await import("../tailwind.config.js");
    for (const t of THEMES.filter((t) => !["dark", "light"].includes(t.key))) expect(config.safelist).toContain(`theme-${t.key}`);
  });
});
