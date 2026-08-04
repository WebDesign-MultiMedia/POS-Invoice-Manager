// Read-only share links need to stop working when someone just edits the
// invoice number in the address bar (e.g. changing ?id=714 to ?id=80 to see
// a different customer's name/phone/address). Adding a real per-invoice
// secret would need a write to the SheetDB row for every invoice ever
// shared, but this account's single-row update endpoint isn't usable (every
// documented request shape returns "No results found" for this sheet, even
// though search/create work fine) — so instead the token is derived, not
// stored: a keyed hash of the invoice id that can't be guessed or
// incremented the way a sequential id can.
//
// This is NOT a cryptographic guarantee — the "secret" ships in the client
// JS bundle, so someone who reads the source could recompute a valid token
// for any id. It stops the actual reported threat (a customer casually
// editing a number in the URL), not a technically sophisticated attacker.
// Closing that fully would need a backend that never exposes the secret or
// the raw SheetDB endpoint to the browser at all.
const SHARE_SECRET = "blfm-invoice-share-v1-9f2c7a4e1d";

export async function generateShareToken(invoiceId) {
  const bytes = new TextEncoder().encode(`${SHARE_SECRET}:${invoiceId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 20);
}

export async function isValidShareToken(invoiceId, token) {
  if (!token || !invoiceId) return false;
  const expected = await generateShareToken(invoiceId);
  return token === expected;
}
