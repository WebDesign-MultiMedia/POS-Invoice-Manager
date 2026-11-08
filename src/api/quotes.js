// Catering quotes on the server (api/quotes.js → the "Quotes" sheet tab).
import { apiErrorFrom } from "../lib/errors.js";
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { quoteFromRow, quotePayload } from "../lib/cateringQuotes.js";

const ENDPOINT = "/api/quotes";

// Staff: every quote, newest last (same order as the local list).
export async function listQuotes() {
  const res = await fetch(`${ENDPOINT}?action=list`);
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  const rows = await res.json();
  return rows
    .filter((r) => r && r.QuoteId)
    .map(quoteFromRow)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// Staff (session cookie), or the no-login link with its token and the
// employee's name.
export async function saveQuoteToServer(quote, link = null) {
  const body = { action: "save", quote: quotePayload(quote), ...(link ? { token: link.token, employeeName: link.employeeName } : {}) };
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    if (!link) reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
}

export async function deleteQuoteOnServer(id) {
  const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
}
