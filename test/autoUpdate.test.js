import { describe, expect, it } from "vitest";
import { scriptOf } from "../src/lib/autoUpdate.js";

describe("auto update", () => {
  it("reads which build a page runs", () => {
    expect(scriptOf('<script type="module" crossorigin src="/assets/index-Dht7IXUW.js"></script>')).toBe("/assets/index-Dht7IXUW.js");
    expect(scriptOf('<script type="module" src="/src/main.jsx"></script>')).toBeNull();
  });
});
