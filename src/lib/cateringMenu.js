import { isDemo } from "./demo.js";

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

const build = (categories) =>
  categories.map(({ category, half, whole, dishes }) => ({
    category,
    dishes: dishes.map((d) => {
      const dish = typeof d === "string" ? { name: d } : d;
      return { id: slug(dish.name), name: dish.name, prices: { half: dish.half ?? half, whole: dish.whole ?? whole } };
    }),
  }));

export const CATERING_MENU = build(CATEGORIES);
export const CATERING_DISHES = Object.fromEntries(CATERING_MENU.flatMap((c) => c.dishes).map((d) => [d.id, d]));

// The demo's fictional café caters its own made-up menu, so nothing of the
// real restaurant shows in the demo.
const DEMO_CATEGORIES = [
  { category: "Mains", half: 85, whole: 160, dishes: ["Slider Burgers", "Veggie Sliders", "Chicken Wraps", "BBQ Pulled Pork", "Lemon Herb Chicken"] },
  { category: "Pasta", half: 60, whole: 110, dishes: ["Baked Ziti", "Mac and Cheese", "Pasta Primavera"] },
  { category: "Salads", half: 45, whole: 85, dishes: ["Garden Salad", "Caesar Salad", "Fruit Salad", "Potato Salad"] },
  { category: "Sides", half: 35, whole: 65, dishes: ["Fries", "Roasted Vegetables", "Rice Pilaf", { name: "Dinner Rolls", half: 20, whole: 35 }] },
  { category: "Desserts", half: 40, whole: 75, dishes: ["Brownies", "Cookie Platter", "Lemon Bars"] },
];
export const DEMO_CATERING_MENU = build(DEMO_CATEGORIES);

// What the Catering Calculator shows: the demo's menu while in demo mode.
export const getCateringMenu = () => (isDemo() ? DEMO_CATERING_MENU : CATERING_MENU);
