import crypto from "node:crypto";
import twilio from "twilio";
import { requireStaff } from "./_lib/auth.js";

// Vercel serverless function: texts a promo/announcement to every customer
// who opted in to specials on the website's /sms-consent/ form. Twilio
// credentials and the SheetDB id/credentials stay server-side.
//
// Recipients come only from the sheet's "SMSSignups" tab, which the website's
// consent Worker fills in — never from the order or card payment phone
// numbers, since buying from us isn't consent to promo texts. Each row is
// signed by the Worker with SIGNUP_SIGNING_KEY; rows typed into the sheet by
// hand don't verify and are skipped.
//
// The rest of the app has no login, so this endpoint is gated by its own
// manager password (BROADCAST_PASSWORD, sent as the X-Broadcast-Password
// header). Without it, anyone who found the URL could text every customer.
//
//   POST { messageText, dryRun: true }  → { recipientCount } (nothing sent)
//   POST { messageText }                → { recipientCount, sent, optedOut, failed }

const PREFIX = "Buffet Lucia's Fiesta Mexicana: ";
const FOOTER = "\n\nReply STOP to unsubscribe.";
const MAX_MESSAGE_LENGTH = 480;
// Twilio queues messages per sender; sending in small batches keeps us under
// its API concurrency limit instead of firing hundreds of requests at once.
const BATCH_SIZE = 10;
// Twilio's error for a recipient who replied STOP. Twilio enforces the
// opt-out itself, so these are expected and not real failures.
const OPTED_OUT_CODE = 21610;

const SIGNUPS_PATH = "?sheet=SMSSignups";

function sheetdbHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (process.env.SHEETDB_USER && process.env.SHEETDB_PASS) {
    const creds = Buffer.from(`${process.env.SHEETDB_USER}:${process.env.SHEETDB_PASS}`).toString("base64");
    headers.Authorization = `Basic ${creds}`;
  }
  return headers;
}

// The Worker writes phones as "(347) 555-0100" (Sheets mangles a leading +),
// so they're normalized back to E.164 for Twilio and for the signature check.
function toE164(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return local.length === 10 ? `+1${local}` : null;
}

function passwordMatches(given) {
  const expected = process.env.BROADCAST_PASSWORD || "";
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return expected.length > 0 && crypto.timingSafeEqual(a, b);
}

// Must match copySignupToSheet() in the BLFM website's consent Worker.
function signatureMatches(row, phoneE164) {
  const given = String(row.Signature || "");
  const expected = crypto
    .createHmac("sha256", process.env.SIGNUP_SIGNING_KEY)
    .update(`${row.ConsentId}|${phoneE164}|${row.Specials}`)
    .digest("hex");
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

async function fetchRecipients() {
  const url = `https://sheetdb.io/api/v1/${encodeURIComponent(process.env.SHEETDB_ID)}${SIGNUPS_PATH}`;
  const response = await fetch(url, { headers: sheetdbHeaders() });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) {
    throw new Error(`SheetDB responded ${response.status}`);
  }
  // A Set because someone who signs up twice still gets one text.
  const numbers = new Set();
  let skipped = 0;
  for (const row of rows) {
    if (row.Specials !== "Yes") continue;
    const number = toE164(row.Phone);
    if (number && row.ConsentId && signatureMatches(row, number)) numbers.add(number);
    else skipped++;
  }
  if (skipped) console.warn(`send-broadcast: skipped ${skipped} SMSSignups rows that don't verify`);
  return [...numbers];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Staff login first, then the separate manager password below.
  if (!requireStaff(req, res)) return;

  const sender = process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER;
  if (!process.env.BROADCAST_PASSWORD || !process.env.SHEETDB_ID || !process.env.SIGNUP_SIGNING_KEY || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !sender) {
    console.error("send-broadcast: missing BROADCAST_PASSWORD, SHEETDB_ID, SIGNUP_SIGNING_KEY, or Twilio env vars");
    return res.status(500).json({ error: "Server is not configured" });
  }

  if (!passwordMatches(req.headers["x-broadcast-password"])) {
    return res.status(401).json({ error: "Wrong manager password" });
  }

  const { messageText, dryRun } = req.body || {};
  const text = typeof messageText === "string" ? messageText.trim() : "";
  if (!text) return res.status(400).json({ error: "Message content required" });
  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
  }

  try {
    const recipients = await fetchRecipients();
    if (dryRun) return res.status(200).json({ recipientCount: recipients.length });

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // A2P 10DLC campaigns are attached to a Messaging Service, so it's
    // preferred over a bare From number when both are configured.
    const from = process.env.TWILIO_MESSAGING_SERVICE_SID
      ? { messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID }
      : { from: process.env.TWILIO_PHONE_NUMBER };
    const body = `${PREFIX}${text}${FOOTER}`;

    let sent = 0;
    let optedOut = 0;
    let failed = 0;
    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      // allSettled so one bad number doesn't stop the rest of the broadcast.
      const results = await Promise.allSettled(batch.map((to) => client.messages.create({ ...from, to, body })));
      for (const result of results) {
        if (result.status === "fulfilled") sent++;
        else if (result.reason?.code === OPTED_OUT_CODE) optedOut++;
        else {
          failed++;
          console.error("send-broadcast: send failed", result.reason?.code, result.reason?.message);
        }
      }
    }

    return res.status(200).json({ recipientCount: recipients.length, sent, optedOut, failed });
  } catch (err) {
    console.error("send-broadcast error:", err);
    return res.status(500).json({ error: "Broadcast failed" });
  }
}
