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
