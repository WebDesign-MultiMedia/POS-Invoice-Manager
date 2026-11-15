// Shared SheetDB plumbing for the /api functions.

// Sent once Basic Auth is switched on in SheetDB's API settings; until
// then the id alone works.
export function sheetdbHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (process.env.SHEETDB_USER && process.env.SHEETDB_PASS) {
    const creds = Buffer.from(`${process.env.SHEETDB_USER}:${process.env.SHEETDB_PASS}`).toString("base64");
    headers.Authorization = `Basic ${creds}`;
  }
  return headers;
}

export function sheetdbBase() {
  const id = process.env.SHEETDB_ID;
  return id ? `https://sheetdb.io/api/v1/${encodeURIComponent(id)}` : null;
}

// SheetDB's plan has a monthly request cap; past it every call gets 429
// until the plan renews or is upgraded. Shown to staff as is.
export const SHEETDB_LIMIT_MESSAGE = "The Google Sheet connection (SheetDB) used up its request limit for now. Try again later, or upgrade the SheetDB plan.";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// fetch() for SheetDB that tries a read once more when Google Sheets was
// briefly slow: SheetDB passes that on as a 5xx, or as a 400 saying the
// connection "timed out". Writes are never repeated (a repeat could save a
// row twice).
export async function sheetdbFetch(url, init = {}) {
  const response = await fetch(url, init);
  const method = String(init.method || "GET").toUpperCase();
  if (method !== "GET" || response.ok || !(await isTransient(response))) return response;
  await wait(600);
  return fetch(url, init);
}

async function isTransient(response) {
  if (response.status >= 500) return true;
  if (response.status !== 400) return false;
  const text = await response.clone().text().catch(() => "");
  return /timed out|timeout|cURL error 28/i.test(text);
}
