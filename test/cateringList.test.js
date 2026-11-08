import { describe, expect, it } from "vitest";
import { priceList, readLine, splitLines, findDish } from "../src/lib/cateringList.js";
import { CATERING_MENU, CATERING_DISHES as D } from "../src/lib/cateringMenu.js";

const DISHES = CATERING_MENU.flatMap((c) => c.dishes);
const match = (name) => findDish(name, DISHES).dish?.name ?? null;

describe("reading a line", () => {
  it.each([
    ["2 carnitas", 2, null, "carnitas"],
    ["2x Carnitas", 2, null, "carnitas"],
    ["carnitas x3", 3, null, "carnitas"],
    ["Carnitas (4)", 4, null, "carnitas"],
    ["• Chivo (media charola)", 1, "half", "chivo charola"],
    ["- Chivo (charola entera)", 1, "whole", "chivo charola"],
    ["1/2 charola de pernil", 1, "half", "charola de pernil"],
    ["½ pernil", 1, "half", "pernil"],
    ["2 whole trays mole poblano", 2, "whole", "trays mole poblano"],
    ["1. Frijoles", 1, null, "frijoles"],
  ])("%s", (line, qty, size, name) => {
    expect(readLine(line)).toEqual({ qty, size, name });
  });

  it("splits on new lines and commas, but not commas inside parentheses", () => {
    expect(splitLines("Carnitas, Pernil\nFlautas (Queso, Pollo o Papas)\n\n")).toEqual(["Carnitas", "Pernil", "Flautas (Queso, Pollo o Papas)"]);
  });
});

describe("finding the dish", () => {
  it.each([
    ["chivo", "Chivo"],
    ["CARNITAS", "Carnitas"],
    ["albondigas al gusto", "Albóndigas al Gusto"],
    ["arroz blanco", "Arroz Blanco"],
    ["arroz blanco con frijoles", "Arroz Blanco con Frijoles"],
    ["costillas en salsa verde", "Costillas en Salsa Verde"],
    ["mole poblano", "Mole Poblano de Pollo"],
    ["costilla bbq", "Costillas en BBQ"],
    ["macaroni cheese", "Macaroni and Cheese"],
    ["penne vodka", "Pasta Penne Vodka"],
    ["carnitaz", "Carnitas"], // one typo
    ["flautas", "Flautas (Queso, Pollo o Papas)"],
  ])("%s → %s", (typed, name) => {
    expect(match(typed)).toBe(name);
  });

  it("returns the choices when a name is too vague", () => {
    const { dish, options } = findDish("mole", DISHES);
    expect(dish).toBeNull();
    expect(options.map((d) => d.name)).toEqual(["Mole Poblano de Pollo", "Mole Estilo Mi Rancho"]);
  });

  it("finds nothing for a dish that isn't on the menu", () => {
    expect(findDish("pizza", DISHES)).toEqual({ dish: null, options: [] });
  });
});

describe("pricing a list", () => {
  it("adds up quantities and tray sizes, using the default size when none is typed", () => {
    const { lines, total, unmatched } = priceList("2 carnitas entera\n• Chivo (media charola)\nfrijoles", DISHES, "half");
    expect(lines.map((l) => [l.dish.id, l.size, l.qty])).toEqual([
      ["carnitas", "whole", 2],
      ["chivo", "half", 1],
      ["frijoles", "half", 1],
    ]);
    expect(total).toBe(D.carnitas.prices.whole * 2 + D.chivo.prices.half + D.frijoles.prices.half);
    expect(unmatched).toBe(0);
  });

  it("leaves unknown and vague lines out of the total and flags them", () => {
    const { total, unmatched, lines } = priceList("pizza\nmole\npernil", DISHES, "whole");
    expect(total).toBe(D.pernil.prices.whole);
    expect(unmatched).toBe(2);
    expect(lines[1].options).toHaveLength(2);
  });

  it("is 0 for an empty list", () => {
    expect(priceList("  \n ", DISHES)).toEqual({ lines: [], total: 0, unmatched: 0 });
  });
});
