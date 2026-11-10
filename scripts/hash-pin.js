import { createInterface } from "node:readline";
import { hashPassword, normalizeIdentifier } from "../api/_lib/auth.js";

// Makes one EMPLOYEE_ACCOUNTS entry: an employee who logs in with their
// phone number and a PIN and can only use Event Sales. Run: npm run hash-pin
// The PIN is hidden while typing and never written anywhere; paste the
// printed value into EMPLOYEE_ACCOUNTS in Vercel → Settings → Environment
// Variables (and in .env.local for local dev).

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) process.stdout.write(text);
};
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value = "" } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  return value;
}

const phone = normalizeIdentifier(await ask("Employee's phone number: "));
const pin = (await ask("PIN (6 to 8 digits, hidden): ", { hidden: true })).trim();
const confirm = (await ask("Type it again: ", { hidden: true })).trim();
rl.close();

if (!/^\d{10}$/.test(phone)) {
  console.error("\nEnter a 10-digit phone number.");
  process.exit(1);
}
if (!/^\d{6,8}$/.test(pin)) {
  console.error("\nThe PIN must be 6 to 8 digits.");
  process.exit(1);
}
if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
  console.error("\nThat PIN is too easy to guess (all the same digit, or in a row). Pick another.");
  process.exit(1);
}
if (pin !== confirm) {
  console.error("\nThe two PINs don't match.");
  process.exit(1);
}

const entry = `"${phone}":"${hashPassword(pin)}"`;
console.log("\nOne employee — paste this whole line as the EMPLOYEE_ACCOUNTS value:\n");
console.log(`{${entry}}`);
console.log("\nSeveral employees — put each entry inside one pair of braces, separated by commas:");
console.log(`{${entry},"3475550199":"…"}`);
