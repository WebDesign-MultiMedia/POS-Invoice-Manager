import { readSession } from "./_lib/auth.js";

// Vercel serverless function: GET → 302 redirect to the order spreadsheet.
// The order form's "Open spreadsheet" button points here instead of holding
// the Google Sheets URL itself, so the sheet's address never ships in the
// public JavaScript bundle. Staff only. The URL lives in the server env var
// GOOGLE_SHEET_URL.
const SHEETS_PREFIX = "https://docs.google.com/spreadsheets/";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!readSession(req)) return sendPage(res, 401, "Please log in to the POS Invoice Manager first.");

  const url = process.env.GOOGLE_SHEET_URL || "";
  if (!url.startsWith(SHEETS_PREFIX)) {
    console.error("sheet-link: GOOGLE_SHEET_URL is not set to a Google Sheets link");
    return sendPage(res, 500, "The spreadsheet link isn't set up on the server yet.");
  }

  res.statusCode = 302;
  res.setHeader("Location", url);
  res.setHeader("Cache-Control", "no-store");
  return res.end();
}

// Opened in a new tab, so errors are a readable page rather than JSON.
function sendPage(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Spreadsheet</title><p style="font-family:system-ui;padding:2rem">${message}</p>`);
}
