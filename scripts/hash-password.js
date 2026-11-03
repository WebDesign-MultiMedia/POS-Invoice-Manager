import { createInterface } from "node:readline";
import { hashPassword, normalizeIdentifier } from "../api/_lib/auth.js";

// Makes one STAFF_ACCOUNTS entry. Run: npm run hash-password
// The password is hidden while typing and never written anywhere; paste the
// printed value into STAFF_ACCOUNTS in Vercel → Settings → Environment
// Variables (and in .env.local for local dev).

// One readline for all questions; `muted` hides typing for passwords.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) process.stdout.write(text);
};

// Lines are read through an async iterator, which buffers them, so this
// works both typed in a terminal and with input piped in.
const lines = rl[Symbol.asyncIterator]();

async function ask(question, { hidden = false } = {}) {
  process.stdout.write(question);
  muted = hidden;
  const { value = "" } = await lines.next();
  muted = false;
  if (hidden) process.stdout.write("\n");
  return value;
}

const login = normalizeIdentifier(await ask("Staff email or phone number: "));
const password = await ask("Password (12+ characters, hidden): ", { hidden: true });
const confirm = await ask("Type it again: ", { hidden: true });
rl.close();

if (!login || password.length < 12) {
  console.error("\nNeed a login and a password of at least 12 characters.");
  process.exit(1);
}
if (password !== confirm) {
  console.error("\nThe two passwords don't match.");
  process.exit(1);
}

const entry = `"${login}":"${hashPassword(password)}"`;
console.log("\nOne account — paste this whole line as the STAFF_ACCOUNTS value:\n");
console.log(`{${entry}}`);
console.log("\nSeveral accounts — put each entry inside one pair of braces, separated by commas:");
console.log(`{${entry},"other@example.com":"…"}`);
