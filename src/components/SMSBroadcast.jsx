import { useState } from "react";
import Swal from "sweetalert2";

// Manager-only: texts a weekend special / announcement to everyone who
// signed up for specials on the website, via api/send-broadcast.js. The password is
// checked server-side; it's only held in memory here, never stored.
const MAX_LENGTH = 480;
const PREFIX = "Buffet Lucia's Fiesta Mexicana: ";
const FOOTER = "\n\nReply STOP to unsubscribe.";

async function postBroadcast(password, body) {
  const res = await fetch("/api/send-broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Broadcast-Password": password },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `Response status: ${res.status}`);
  return payload;
}

export default function SMSBroadcast({ className = "" }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  // { sent, optedOut, failed, recipientCount } after a send, or { error }.
  const [result, setResult] = useState(null);

  const text = message.trim();

  const handleSend = async () => {
    if (!password || !text) {
      Swal.fire({ title: "Enter the password and a message", icon: "warning", theme: "dark", timer: 1400, showConfirmButton: false });
      return;
    }
    setSending(true);
    setResult(null);
    try {
      // Dry run first so the manager confirms against the real recipient
      // count — a broadcast can't be unsent.
      const { recipientCount } = await postBroadcast(password, { messageText: text, dryRun: true });
      if (!recipientCount) {
        setResult({ error: "No one has signed up for specials yet." });
        return;
      }
      const confirm = await Swal.fire({
        title: `Text ${recipientCount} customers?`,
        text: "This sends right away and can't be undone.",
        icon: "question",
        theme: "dark",
        showCancelButton: true,
        confirmButtonText: "Send",
      });
      if (!confirm.isConfirmed) return;

      const sent = await postBroadcast(password, { messageText: text });
      setResult(sent);
      // Kept on a partial failure so it can be fixed up and resent.
      if (!sent.failed) setMessage("");
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`w-full max-w-md glass-card p-6 sm:p-8 flex flex-col gap-4 ${className}`.trim()}>
      <div className="field-group">
        <span className="field-label">
          <i className="fa-solid fa-lock"></i> Manager password
        </span>
        <input
          type="password"
          autoComplete="current-password"
          className="input-3d"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div className="field-group">
        <span className="field-label">
          <i className="fa-solid fa-comment-sms"></i> Message
        </span>
        <textarea
          rows={5}
          maxLength={MAX_LENGTH}
          className="input-3d"
          placeholder="e.g. This weekend only: 2x tamales for $5! Party trays available for Saturday events."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <span className="text-xs text-brand-navydeep/60 self-end">
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

      <button className="btn-3d justify-center disabled:opacity-60" onClick={handleSend} disabled={sending}>
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
            {result.optedOut > 0 && <p className="text-brand-navydeep/70">Skipped (opted out): {result.optedOut}</p>}
            {result.failed > 0 && <p className="text-red-600">Failed: {result.failed}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
