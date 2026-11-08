// "Type a list" mode of the Catering Calculator: turns a typed or pasted
// list of dishes into priced lines and a total.
//
// One dish per line (or comma-separated). Each line can carry:
//   - a quantity: "2 carnitas", "2x carnitas", "carnitas x2", "carnitas (2)"
//   - a tray size: half / media / medio / ½ / 1/2, or whole / entera / full /
//     completa; lines without one use the default size picked on the page
// Bullets ("•", "-", "*", "1.") are ignored, so the party list the catering
// website sends on WhatsApp ("• Chivo (media charola)") pastes straight in.
// Dish names are matched without caring about accents, capitals, plurals
// or a one-letter typo.

const HALF_WORDS = new Set(["half", "media", "medio", "medias", "medios", "mitad", "½", "1/2"]);
const WHOLE_WORDS = new Set(["whole", "entera", "entero", "enteras", "enteros", "full", "completa", "completo", "grande"]);
// Words that say nothing about which dish it is.
const FILLER = new Set(["de", "del", "la", "las", "el", "los", "en", "con", "a", "al", "y", "o", "e", "of", "the", "and", "with", "tray", "trays", "charola", "charolas", "bandeja", "bandejas", "pan", "pans", "order", "orden", "size", "tamano"]);

export const normalize = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const singular = (w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

const tokenize = (s) =>
  normalize(s)
    .replace(/[^a-z0-9½/]+/g, " ")
    .split(" ")
    .filter(Boolean);

const dishTokens = (name) => tokenize(name).filter((w) => !FILLER.has(w)).map(singular);

// Splits on new lines, and on commas/semicolons outside parentheses (so
// "Flautas (Queso, Pollo o Papas)" stays one line).
export function splitLines(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    let depth = 0;
    let current = "";
    for (const ch of raw) {
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if ((ch === "," || ch === ";") && depth === 0) {
        lines.push(current);
        current = "";
      } else current += ch;
    }
    lines.push(current);
  }
  return lines.map((l) => l.trim()).filter(Boolean);
}

// Pulls the quantity and size out of one line; what's left is the dish name.
export function readLine(line) {
  let text = normalize(line)
    .replace(/^\s*(?:[•·*\-–—]+|\d+[.)](?=\s))\s*/, "") // bullet or "1." numbering
    .trim();

  let qty = 1;
  const qtyPatterns = [/^(\d+)\s*x\b\s*/, /^x\s*(\d+)\s+/, /\s+x\s*(\d+)\s*$/, /\s*\((\d+)\)\s*$/, /\s+(\d+)\s*x\s*$/, /^(\d+)\s+(?!\/)/];
  for (const re of qtyPatterns) {
    const m = text.match(re);
    if (m && !/^1\/2/.test(text)) {
      qty = Number(m[1]);
      text = text.replace(re, " ").trim();
      break;
    }
  }

  let size = null;
  const words = tokenize(text);
  const nameWords = [];
  for (const w of words) {
    if (HALF_WORDS.has(w)) size = "half";
    else if (WHOLE_WORDS.has(w)) size = "whole";
    else nameWords.push(w);
  }
  return { qty, size, name: nameWords.join(" ") };
}

// Same word, a plural, a prefix of 4+ letters, or one typo in a 5+ letter word.
function wordsMatch(q, d) {
  if (q === d) return true;
  if (q.length >= 4 && d.startsWith(q)) return true;
  if (q.length >= 5 && d.length >= 5 && Math.abs(q.length - d.length) <= 1 && editDistance(q, d) <= 1) return true;
  return false;
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Finds the dish a name means. Every word typed has to match a word of the
// dish. If only one dish fits, or one fits exactly ("arroz blanco" is Arroz
// Blanco, not Arroz Blanco con Frijoles), that's it. Otherwise the name is
// too vague ("mole", "arroz") and the candidates come back to choose from,
// rather than guessing and quietly pricing the wrong dish.
export function findDish(name, dishes) {
  const query = tokenize(name).filter((w) => !FILLER.has(w)).map(singular);
  if (!query.length) return { dish: null, options: [] };

  const scored = [];
  for (const dish of dishes) {
    const words = dishTokens(dish.name);
    const used = new Set();
    const allFound = query.every((q) => {
      const i = words.findIndex((d, idx) => !used.has(idx) && wordsMatch(q, d));
      if (i === -1) return false;
      used.add(i);
      return true;
    });
    if (allFound) scored.push({ dish, extra: words.length - used.size });
  }
  if (!scored.length) return { dish: null, options: [] };

  if (scored.length === 1) return { dish: scored[0].dish, options: [] };
  const exact = scored.filter((s) => s.extra === 0);
  if (exact.length === 1) return { dish: exact[0].dish, options: [] };
  scored.sort((a, b) => a.extra - b.extra);
  return { dish: null, options: scored.map((s) => s.dish) };
}

// The whole list → priced lines and a total. Unmatched or vague lines are
// left out of the total and come back flagged.
export function priceList(text, dishes, defaultSize = "whole") {
  const lines = splitLines(text).map((raw) => {
    const { qty, size: typedSize, name } = readLine(raw);
    const { dish, options } = findDish(name, dishes);
    const size = typedSize || defaultSize;
    const sizeTyped = Boolean(typedSize);
    if (!dish) return { raw, qty, size, sizeTyped, dish: null, options, lineTotal: 0 };
    return { raw, qty, size, sizeTyped, dish, options, unitPrice: dish.prices[size], lineTotal: dish.prices[size] * qty };
  });
  const total = Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;
  return { lines, total, unmatched: lines.filter((l) => !l.dish).length };
}
