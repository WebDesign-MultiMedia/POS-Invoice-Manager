// Catering menu for the Catering Calculator page (/catering), taken from the
// dish list on buffetluciasfiestamexicana.com. Every dish is sold by the
// tray: a half tray (media charola) or a whole tray (charola entera).
//
// ⚠️ DEMO PRICES. The website doesn't list prices, so these are placeholders
// for testing. To set real prices, edit `half` / `whole` on a category (every
// dish in it uses those) or give one dish its own `half` / `whole`, then set
// DEMO_PRICES to false so the "Demo prices" badge goes away.
export const DEMO_PRICES = true;

export const TRAY_SIZES = [
  { id: "half", label: "Half tray", short: "Half" },
  { id: "whole", label: "Whole tray", short: "Whole" },
];

const CATEGORIES = [
  { category: "Chivo", half: 180, whole: 350, dishes: ["Chivo"] },
  {
    category: "Puerco",
    half: 90,
    whole: 170,
    dishes: [
      "Carnitas",
      "Pernil",
      "Costillas Fritas",
      "Costillas en Salsa Verde",
      "Costillas de Puerco en Salsa Verde",
      "Costillas en BBQ",
      "Costillas en Salsa Roja",
      "Adobo de Puerco",
      "Guisado de Puerco",
    ],
  },
  {
    category: "Pollo",
    half: 80,
    whole: 150,
    dishes: [
      "Pollo Enchilado",
      "Pollo Rostizado",
      "Mixiotes de Pollo",
      "Mixiotes de Pollo con Nopales",
      "Mole Poblano de Pollo",
      "Adobo de Pollo",
      "Guisado de Pollo",
      "Tinga de Pollo",
      "Alas en BBQ",
      "Pechuga Empanizada",
      "Piernas de Pollo Empanizadas",
      "Pollo a la Francesa",
    ],
  },
  { category: "Res", half: 95, whole: 180, dishes: ["Mixiotes de Res", "Bistec a la Mexicana", "Bistec Encebollado", "Adobo de Res"] },
  { category: "Mariscos", half: 110, whole: 210, dishes: ["Camarones a la Diabla", "Camarones Fritos"] },
  { category: "Ensaladas", half: 50, whole: 90, dishes: ["Ensalada de Nopales", "Ensalada Mixta", "Ensalada de Frutas", "Ensalada de Papas"] },
  {
    category: "Arroz, Frijoles y Tortillas",
    half: 40,
    whole: 75,
    dishes: [
      "Arroz Mexicano",
      "Arroz Blanco",
      "Arroz Blanco con Frijoles",
      "Arroz con Gandules",
      "Arroz con Vegetales",
      "Frijoles",
      { name: "Tortillas Hechas a Mano", half: 30, whole: 55 },
    ],
  },
  {
    category: "Pastas",
    half: 60,
    whole: 110,
    dishes: ["Espagueti a la Mexicana", "Espagueti Estilo Marisol", "Espagueti con Crema y Queso", "Macaroni and Cheese", "Pasta Penne Vodka", "Lasagna"],
  },
  { category: "Antojitos y Vegetarianos", half: 70, whole: 130, dishes: ["Chiles Rellenos", "Chilaquiles", "Flautas (Queso, Pollo o Papas)"] },
  { category: "Para los Niños", half: 50, whole: 90, dishes: ["Hot Dogs", "Chicken Tenders"] },
  { category: "Especialidades de la Casa", half: 90, whole: 170, dishes: ["Mole Estilo Mi Rancho", "Albóndigas al Gusto"] },
];

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const CATERING_MENU = CATEGORIES.map(({ category, half, whole, dishes }) => ({
  category,
  dishes: dishes.map((d) => {
    const dish = typeof d === "string" ? { name: d } : d;
    return { id: slug(dish.name), name: dish.name, prices: { half: dish.half ?? half, whole: dish.whole ?? whole } };
  }),
}));

export const CATERING_DISHES = Object.fromEntries(CATERING_MENU.flatMap((c) => c.dishes).map((d) => [d.id, d]));
