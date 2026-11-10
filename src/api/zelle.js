// Zelle payments received, read from Chase's alert emails by
// api/zelle-alerts.js. Returns { enabled, alerts: [{ id, amount, from,
// receivedAt }] }; enabled is false until the Resend setup is done.
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { isDemo } from "../lib/demo.js";
import { apiErrorFrom } from "../lib/errors.js";

const DEMO_DELAY_MS = 6000;

// since: only payments received after this time (ms). The demo pretends
// the customer's Zelle arrives a few seconds after the screen opens.
export async function fetchZelleAlerts({ since, startedAt, amount }) {
  if (isDemo()) {
    const arrived = Date.now() - startedAt > DEMO_DELAY_MS;
    return { enabled: true, alerts: arrived ? [{ id: `demo-${startedAt}`, amount, from: "Demo Customer", receivedAt: new Date().toISOString() }] : [] };
  }
  const res = await fetch(`/api/zelle-alerts?since=${encodeURIComponent(since)}`);
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}
