// The Catering Calculator's math, kept free of React so it can be tested.
//
// The expression is a list of tokens:
//   { type: "dish", id, name, size, price }   a tapped dish (its tray price)
//   { type: "op", op }                         one of + − × ÷
//   { type: "result", value }                  what "=" left behind
//
// Dishes take the place of number keys: tapping one right after another
// dish (or after a result) adds it with an automatic "+", so tapping dishes
// one after another keeps a running sum. × and ÷ follow normal math order
// (they're worked out before + and −), like the iPhone calculator.

export const OPS = ["+", "−", "×", "÷"];

const isValue = (t) => t && (t.type === "dish" || t.type === "result");

export function pressDish(tokens, dish, size) {
  const token = { type: "dish", id: dish.id, name: dish.name, size, price: dish.prices[size] };
  const last = tokens[tokens.length - 1];
  return isValue(last) ? [...tokens, { type: "op", op: "+" }, token] : [...tokens, token];
}

export function pressOp(tokens, op) {
  const last = tokens[tokens.length - 1];
  if (!last) return tokens; // nothing to operate on yet
  if (last.type === "op") return [...tokens.slice(0, -1), { type: "op", op }]; // change your mind
  return [...tokens, { type: "op", op }];
}

export function pressDelete(tokens) {
  return tokens.slice(0, -1);
}

// The result remembers what it was made from (`from`), so the dish list on
// the display can still show those dishes after "=".
export function pressEquals(tokens) {
  if (!tokens.some((t) => t.type === "dish")) return tokens;
  return [{ type: "result", value: evaluate(tokens), from: tokens }];
}

// The dish list shown above the total, one line per entry:
//   { kind: "dish", op, qty, id, name, size, amount }   op is null or + − × ÷
//   { kind: "subtotal", value }                         where "=" was pressed
// When everything is just added up, the same dish and size are combined
// into one line ("2× Carnitas"). Once × − ÷ are used, the order matters,
// so each tap gets its own line with its operator in front.
export function dishLines(tokens) {
  const flat = flatten(tokens);
  const onlyAdding = flat.every((e) => e.kind === "subtotal" || !e.op || e.op === "+");

  if (onlyAdding) {
    const lines = [];
    const byKey = {};
    for (const e of flat) {
      if (e.kind === "subtotal") {
        lines.push(e);
        continue;
      }
      const key = `${e.id}:${e.size}`;
      if (byKey[key]) {
        byKey[key].qty += 1;
        byKey[key].amount = round2(byKey[key].amount + e.amount);
      } else {
        byKey[key] = { ...e, op: null };
        lines.push(byKey[key]);
      }
    }
    // When only adding, an earlier subtotal is just part of the running
    // order; show "=" only when it was the last thing pressed.
    const endedOnEquals = flat.length > 0 && flat[flat.length - 1].kind === "subtotal";
    return lines.filter((l) => l.kind !== "subtotal").concat(endedOnEquals ? [flat[flat.length - 1]] : []);
  }
  return flat;
}

function flatten(tokens) {
  const out = [];
  let op = null;
  for (const t of tokens) {
    if (t.type === "op") op = t.op;
    else if (t.type === "result") {
      out.push(...(t.from ? flatten(t.from) : []), { kind: "subtotal", value: t.value });
      op = null;
    } else {
      out.push({ kind: "dish", op, qty: 1, id: t.id, name: t.name, size: t.size, amount: t.price });
      op = null;
    }
  }
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Works out the expression; a trailing operator is ignored, so the total
// shown while you're mid-entry is what you have so far.
export function evaluate(tokens) {
  const parts = [...tokens];
  while (parts.length && parts[parts.length - 1].type === "op") parts.pop();
  if (!parts.length) return 0;

  // First pass: × and ÷. `terms` alternates value, op, value…
  const terms = [valueOf(parts[0])];
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i].op;
    const v = valueOf(parts[i + 1]);
    if (op === "×") terms[terms.length - 1] *= v;
    else if (op === "÷") terms[terms.length - 1] = v === 0 ? NaN : terms[terms.length - 1] / v;
    else terms.push(op, v);
  }
  // Second pass: + and −.
  let total = terms[0];
  for (let i = 1; i < terms.length; i += 2) total = terms[i] === "+" ? total + terms[i + 1] : total - terms[i + 1];
  return round2(total);
}

function valueOf(token) {
  return token.type === "result" ? token.value : token.price;
}

// How many times each dish/size is in the expression, for the badges on
// the dish buttons: { "carnitas:half": 2 }.
export function dishCounts(tokens) {
  const counts = {};
  for (const t of tokens) if (t.type === "dish") counts[`${t.id}:${t.size}`] = (counts[`${t.id}:${t.size}`] || 0) + 1;
  return counts;
}
