import { useCallback, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { getBrand } from "../lib/brand.js";
import { apiErrorFrom, friendlyMessage } from "../lib/errors.js";

// Texts a weekend special / announcement to everyone who signed up for
// specials on the website, via api/send-broadcast.js (staff login required).
const MAX_LENGTH = 480;
const FOOTER = "\n\nReply STOP to unsubscribe.";

// Demo mode: pretend there are 128 subscribers and that every text went out.
const DEMO_SUBSCRIBERS = 128;
async function postBroadcast(body) {
  if (getBrand().demo) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (body.countOnly) return { recipientCount: DEMO_SUBSCRIBERS, latestSignup: new Date(Date.now() - 2 * 864e5).toISOString() };
    return body.dryRun
      ? { recipientCount: DEMO_SUBSCRIBERS }
      : { sent: DEMO_SUBSCRIBERS - 3, optedOut: 3, failed: 0, recipientCount: DEMO_SUBSCRIBERS };
  }
  const res = await fetch("/api/send-broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}

export default function SMSBroadcast({ className = "" }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  // { sent, optedOut, failed, recipientCount } after a send, or { error }.
  const [result, setResult] = useState(null);
  // Guards against a double tap starting two broadcasts.
  const sendingRef = useRef(false);
  // Subscriber count: { status: "idle" | "loading" | "ok" | "error", count, latestSignup, error }.
  const [subscribers, setSubscribers] = useState({ status: "idle" });

  const text = message.trim();
  const brand = getBrand();
  const PREFIX = brand.smsPrefix;

  // Asks the server how many customers are signed up (nothing is sent).
  // Runs when the page opens and when ↻ is pressed.
  const loadSubscribers = useCallback(
    async () => {
      setSubscribers((s) => ({ ...s, status: "loading" }));
      try {
        const { recipientCount, latestSignup } = await postBroadcast({ countOnly: true });
        setSubscribers({ status: "ok", count: recipientCount, latestSignup });
      } catch (err) {
        console.error("Subscriber count failed:", err);
        setSubscribers({ status: "error", error: friendlyMessage(err, "Couldn't count subscribers.") });
      }
    },
    []
  );

  useEffect(() => {
    loadSubscribers();
  }, [loadSubscribers]);

  const handleSend = async () => {
    if (sendingRef.current) return;
    if (!text) {
      Swal.fire({ title: "Write a message first", icon: "warning", theme: "dark", timer: 1400, showConfirmButton: false });
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setResult(null);
    try {
      // Dry run first so staff confirm against the real recipient
      // count — a broadcast can't be unsent.
      const { recipientCount } = await postBroadcast({ messageText: text, dryRun: true });
      if (!recipientCount) {
        setResult({ error: "No one has signed up for specials yet." });
        return;
      }
      const confirm = await Swal.fire({
        title: `Text ${recipientCount} customers?`,
        text: brand.demo ? "Demo: nothing is really sent." : "This sends right away and can't be undone.",
        icon: "question",
        theme: "dark",
        showCancelButton: true,
        confirmButtonText: "Send",
      });
      if (!confirm.isConfirmed) return;

      const sent = await postBroadcast({ messageText: text });
      setResult(sent);
      // Kept on a partial failure so it can be fixed up and resent.
      if (!sent.failed) setMessage("");
    } catch (err) {
      console.error("Broadcast failed:", err);
      // 4xx messages from the server (e.g. "Message content required") come through as-is.
      setResult({ error: friendlyMessage(err, "The texts weren't sent.") });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className={`w-full max-w-md glass-card p-6 sm:p-8 flex flex-col gap-4 ${className}`.trim()}>
      {/* How many customers would get a text, and when the last one signed up. */}
      <div className="glass-panel p-3 text-sm flex items-center gap-3" aria-live="polite">
        <i className="fa-solid fa-users text-brand-teal text-lg" aria-hidden="true"></i>
        <div className="flex-1 min-w-0">
          {(subscribers.status === "idle" || subscribers.status === "loading") && <p className="text-brand-navydeep/80">Counting subscribers…</p>}
          {subscribers.status === "error" && <p className="text-brand-error font-semibold">{subscribers.error}</p>}
          {subscribers.status === "ok" && (
            <>
              <p className="font-semibold">
                {subscribers.count} {subscribers.count === 1 ? "customer" : "customers"} signed up for specials
              </p>
              {subscribers.latestSignup && (
                <p className="text-brand-navydeep/80 text-xs">
                  Newest sign-up: {new Date(subscribers.latestSignup).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          className="btn-3d !px-3 !py-1.5 text-xs disabled:opacity-60"
          onClick={loadSubscribers}
          disabled={subscribers.status === "loading"}
          aria-label="Refresh subscriber count"
          title="Refresh"
        >
          <i className={`fa-solid fa-rotate-right ${subscribers.status === "loading" ? "fa-spin" : ""}`} aria-hidden="true"></i>
        </button>
      </div>

      <div className="field-group">
        <label htmlFor="broadcast-message" className="field-label">
          <i className="fa-solid fa-comment-sms" aria-hidden="true"></i> Message
        </label>
        <textarea
          id="broadcast-message"
          rows={5}
          maxLength={MAX_LENGTH}
          className="input-3d"
          placeholder="e.g. This weekend only: 2x tamales for $5! Party trays available for Saturday events."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <span className="text-xs text-brand-navydeep/75 self-end">
          {message.length}/{MAX_LENGTH}
        </span>
      </div>

      {text && (
        <div className="glass-panel p-4 text-sm whitespace-pre-wrap break-words">
          <p className="text-xs uppercase tracking-widest text-brand-teal font-semibold mb-1.5">Preview</p>
          {PREFIX}
          {text}
          {FOOTER}
        </div>
      )}

      <button type="button" className="btn-3d justify-center disabled:opacity-60" onClick={handleSend} disabled={sending} aria-busy={sending}>
        <i className={`fa-solid ${sending ? "fa-spinner fa-spin" : "fa-bullhorn"}`}></i> {sending ? "Broadcasting…" : "Text Specials Subscribers"}
      </button>

      <div aria-live="polite">
        {result?.error && (
          <div className="glass-panel p-4 text-sm border-2 border-red-500/60">
            <p className="font-semibold text-red-600">
              <i className="fa-solid fa-circle-xmark"></i> Broadcast failed
            </p>
            <p className="text-brand-navydeep/80">{result.error}</p>
          </div>
        )}
        {result && !result.error && (
          <div className={`glass-panel p-4 text-sm border-2 ${result.failed ? "border-amber-500/60" : "border-emerald-500/60"}`}>
            <p className="font-semibold mb-1">
              <i className={`fa-solid ${result.failed ? "fa-triangle-exclamation text-amber-600" : "fa-circle-check text-emerald-600"}`}></i>{" "}
              Reached {result.sent} of {result.recipientCount} customers
            </p>
            {result.optedOut > 0 && <p className="text-brand-navydeep/80">Skipped (opted out): {result.optedOut}</p>}
            {result.failed > 0 && <p className="text-red-600">Failed: {result.failed}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
