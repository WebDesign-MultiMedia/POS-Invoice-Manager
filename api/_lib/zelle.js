// Zelle "money received" alerts, read from Chase's email.
//
// Chase emails the account holder within seconds of a Zelle payment. A Gmail
// filter forwards only those emails to a private Resend receiving address
// (ZELLE_INBOUND_ADDRESS). While an Event Sales screen waits on a Zelle
// payment, it asks /api/zelle-alerts, which reads the newest received emails
// from Resend (RESEND_API_KEY) and keeps only real Chase Zelle emails:
//  - sent to our private address (not just any address at the subdomain),
//  - From an @chase.com address,
//  - and passing DKIM and DMARC (Gmail forwarding keeps Chase's DKIM
//    signature), so a look-alike email from anyone else is ignored.
// The app never connects to the bank; it only sees these emails.

const RESEND_API = "https://api.resend.com";

export const zelleConfigured = () => Boolean(process.env.RESEND_API_KEY && inboundAddress());
const inboundAddress = () => String(process.env.ZELLE_INBOUND_ADDRESS || "").trim().toLowerCase();

// "Chase <no.reply.alerts@chase.com>" → "no.reply.alerts@chase.com"
export function addressOf(value) {
  const s = String(value || "");
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

// Resend reports "pass" / "fail" (or an object with a result).
const passed = (v) => /^pass/i.test(String(v && typeof v === "object" ? (v.result ?? v.status ?? "") : (v ?? "")));

export function isGenuineChase(email) {
  const from = addressOf(email?.from);
  const a = email?.authentication || {};
  return /@([a-z0-9-]+\.)*chase\.com$/.test(from) && passed(a.dkim) && passed(a.dmarc);
}

export function sentToInbound(email, address = inboundAddress()) {
  if (!address) return false;
  return [...(email?.to || []), ...(email?.received_for || [])].map(addressOf).includes(address);
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|th|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#36;|&dollar;/gi, "$")
    .replace(/&reg;|&#174;/gi, "®")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}

// { amount, from } from a Chase "You received money with Zelle" email, or
// null when it isn't one (sent money, requests, other alerts).
export function parseZelleEmail({ subject = "", text = "", html = "" } = {}) {
  const body = text?.trim() ? text : htmlToText(html);
  const all = `${subject}\n${body}`;
  if (!/zelle/i.test(all)) return null;
  if (/\byou sent\b|\brequested\b|\brequest(ed)? (money|from)\b|\bpayment to\b/i.test(subject)) return null;
  if (!/\breceived\b|\bsent you\b|\bdeposited\b/i.test(all)) return null;
  const m = body.match(/amount[^$\d\n]{0,20}\$\s?([\d,]+\.\d{2})/i) || all.match(/\$\s?([\d,]+\.\d{2})/);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ""));
  if (!(amount > 0)) return null;
  const name =
    all.match(/(?:^|\n)\s*([^\n$]{2,60}?)\s+sent you\b/i)?.[1] ||
    all.match(/\bfrom\s+([A-Za-z][A-Za-z .,'&-]{1,60}?)\s*(?:\n|$|\.(?:\s|$)|\bon\b)/im)?.[1] ||
    "";
  return { amount, from: name.replace(/^(you received money with zelle®?|zelle®?)\s*/i, "").trim() };
}

async function resend(path) {
  const res = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  return res.json();
}

// Received emails never change, so each one is read and checked once per
// server instance. The list itself is cached briefly so several screens
// waiting at once don't each hit Resend.
const checked = new Map(); // id → alert | null
let listCache = { at: 0, data: [] };

async function checkEmail(id) {
  if (checked.has(id)) return checked.get(id);
  const email = await resend(`/emails/receiving/${encodeURIComponent(id)}`);
  let alert = null;
  if (sentToInbound(email) && isGenuineChase(email)) {
    const parsed = parseZelleEmail(email);
    if (parsed) alert = { id, amount: parsed.amount, from: parsed.from, receivedAt: email.created_at };
  }
  checked.set(id, alert);
  if (checked.size > 300) checked.delete(checked.keys().next().value);
  return alert;
}

// Zelle alerts received since `sinceMs`, newest first.
export async function recentZelleAlerts(sinceMs) {
  if (Date.now() - listCache.at > 3000) {
    const list = await resend("/emails/receiving?limit=20");
    listCache = { at: Date.now(), data: Array.isArray(list?.data) ? list.data : [] };
  }
  const fresh = listCache.data.filter((e) => Date.parse(e.created_at) >= sinceMs && sentToInbound(e));
  const alerts = [];
  for (const e of fresh) {
    const alert = await checkEmail(e.id);
    if (alert) alerts.push(alert);
  }
  return alerts.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
}

export function clearZelleCache() {
  checked.clear();
  listCache = { at: 0, data: [] };
}
