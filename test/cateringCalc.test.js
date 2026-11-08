import { describe, expect, it } from "vitest";
import { pressDish, pressOp, pressDelete, pressEquals, evaluate, dishCounts, dishLines } from "../src/lib/cateringCalc.js";
import { CATERING_MENU, CATERING_DISHES } from "../src/lib/cateringMenu.js";

const dish = (name, half, whole = half * 2) => ({ id: name.toLowerCase(), name, prices: { half, whole } });
const A = dish("A", 100);
const B = dish("B", 40);
const C = dish("C", 10);

const run = (...steps) => steps.reduce((tokens, step) => step(tokens), []);
const d = (x, size = "half") => (t) => pressDish(t, x, size);
const op = (o) => (t) => pressOp(t, o);

describe("catering calculator", () => {
  it("adds dishes tapped one after another", () => {
    const tokens = run(d(A), d(B), d(C));
    expect(tokens.map((t) => t.op || t.name)).toEqual(["A", "+", "B", "+", "C"]);
    expect(evaluate(tokens)).toBe(150);
  });

  it("uses the selected tray size's price", () => {
    expect(evaluate(run(d(A, "whole"), d(B)))).toBe(240);
  });

  it("does × and ÷ before + and −", () => {
    expect(evaluate(run(d(A), op("+"), d(B), op("×"), d(C)))).toBe(500);
    expect(evaluate(run(d(A), op("−"), d(B), op("÷"), d(C)))).toBe(96);
  });

  it("ignores a trailing operator in the running total", () => {
    expect(evaluate(run(d(A), op("×")))).toBe(100);
  });

  it("replaces an operator tapped right after another", () => {
    expect(run(d(A), op("+"), op("−")).map((t) => t.op || t.name)).toEqual(["A", "−"]);
  });

  it("ignores an operator with nothing before it", () => {
    expect(run(op("+"))).toEqual([]);
  });

  it("collapses to the result on =, and keeps adding after it", () => {
    const after = run(d(A), d(B), pressEquals);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ type: "result", value: 140 });
    expect(evaluate(pressDish(after, C, "half"))).toBe(150);
  });

  it("deletes the last thing entered", () => {
    expect(evaluate(run(d(A), d(B), pressDelete, pressDelete))).toBe(100);
    expect(run(d(A), pressDelete)).toEqual([]);
  });

  it("rounds to cents", () => {
    expect(evaluate(run(d(A), op("÷"), d(dish("Three", 3))))).toBe(33.33);
  });

  it("counts each dish and size for the button badges", () => {
    expect(dishCounts(run(d(A), d(A), d(A, "whole")))).toEqual({ "a:half": 2, "a:whole": 1 });
  });
});

describe("dish list on the display", () => {
  const show = (tokens) => dishLines(tokens).map((l) => (l.kind === "subtotal" ? `= ${l.value}` : `${l.op || ""}${l.qty}x ${l.name} ${l.size} ${l.amount}`));

  it("is empty with nothing picked", () => {
    expect(dishLines([])).toEqual([]);
  });

  it("combines the same dish and size when only adding", () => {
    expect(show(run(d(A, "whole"), d(B), d(A, "whole"), d(A)))).toEqual(["2x A whole 400", "1x B half 40", "1x A half 100"]);
  });

  it("lists each tap in order with its operator once × − ÷ are used", () => {
    expect(show(run(d(A), d(B), op("×"), d(C)))).toEqual(["1x A half 100", "+1x B half 40", "×1x C half 10"]);
  });

  it("keeps the dishes listed after =, with the subtotal", () => {
    expect(show(run(d(A), d(B), pressEquals))).toEqual(["1x A half 100", "1x B half 40", "= 140"]);
    expect(show(run(d(A), pressEquals, d(A)))).toEqual(["2x A half 200"]);
    expect(show(run(d(A), d(B), pressEquals, op("÷"), d(C)))).toEqual(["1x A half 100", "+1x B half 40", "= 140", "÷1x C half 10"]);
  });
});

describe("catering menu", () => {
  it("has every dish from the website with half and whole prices", () => {
    const dishes = CATERING_MENU.flatMap((c) => c.dishes);
    expect(dishes).toHaveLength(52);
    expect(Object.keys(CATERING_DISHES)).toHaveLength(52); // ids are unique
    for (const x of dishes) {
      expect(x.prices.half).toBeGreaterThan(0);
      expect(x.prices.whole).toBeGreaterThan(x.prices.half);
    }
  });
});
