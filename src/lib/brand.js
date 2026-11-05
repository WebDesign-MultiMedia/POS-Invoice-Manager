import { isDemo, DEMO_BRAND, DEMO_MENU } from "./demo.js";
import { MENU } from "./menu.js";

// The business the app is showing: the real restaurant, or the fictional
// sample café while in demo mode (see lib/demo.js). Pages read names,
// taglines and the quick-pick menu from here instead of hardcoding them.
const REAL_BRAND = {
  name: "Buffet Lucia Fiesta Mexicana",
  tagline: "Auténtica Comida Mexicana • POS-Invoice-Manager",
  shortTagline: "Auténtica Comida Mexicana",
  location: "Bronx, NY",
  smsPrefix: "Buffet Lucia's Fiesta Mexicana: ",
};

export function getBrand() {
  return isDemo() ? { ...DEMO_BRAND, demo: true } : { ...REAL_BRAND, demo: false };
}

export function getMenu() {
  return isDemo() ? DEMO_MENU : MENU;
}
