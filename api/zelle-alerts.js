import { requireAccess } from "./_lib/auth.js";
import { recentZelleAlerts, zelleConfigured } from "./_lib/zelle.js";

// Vercel serverless function: GET ?since=<ms> → { enabled, alerts }
// Zelle payments received (from Chase's emails, see api/_lib/zelle.js)
// since the Event Sales Zelle screen opened. Event Sales access needed.
// Looks back at most 30 minutes.
const MAX_LOOKBACK_MS = 30 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = await requireAccess(req, res, ["event"]);
  if (!session) return;
  if (!zelleConfigured()) return res.status(200).json({ enabled: false, alerts: [] });

  const raw = Number(new URL(req.url, "http://localhost").searchParams.get("since"));
  const since = Math.max(Number.isFinite(raw) ? raw : 0, Date.now() - MAX_LOOKBACK_MS);
  try {
    return res.status(200).json({ enabled: true, alerts: await recentZelleAlerts(since) });
  } catch (err) {
    console.error("zelle-alerts error:", err);
    return res.status(502).json({ error: "Couldn't check for Zelle payments right now." });
  }
}
