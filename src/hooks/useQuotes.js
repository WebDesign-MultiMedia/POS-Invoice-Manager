import { useCallback, useEffect, useRef, useState } from "react";
import { loadQuotes, saveQuotes } from "../lib/cateringQuotes.js";
import { deleteQuoteOnServer, listQuotes, saveQuoteToServer } from "../api/quotes.js";

const SAVE_DELAY_MS = 1500; // wait for typing to pause before saving
const RETRY_MS = 20000;

// The Catering Calculator's saved quotes.
//   mode "staff": logged in. The spreadsheet is the shared list: it's loaded
//                 on open (and when the page comes back into view), and
//                 every change is saved to it.
//   mode "link":  the no-login link. The employee's own quotes stay on their
//                 phone and are also sent to the spreadsheet for staff.
//                 Deleting only removes the phone's copy.
//   mode "local": the demo. Browser only, never the server.
//
// Each quote is saved on the device first (so nothing is lost offline) and
// marked `pending` until the server has it; pending quotes are retried.
export function useQuotes({ mode, link }) {
  const scope = mode === "link" ? "link" : "staff";
  const synced = mode !== "local";
  const [quotes, setQuotes] = useState(() => {
    const local = loadQuotes(scope);
    // Quotes saved on this device before sharing existed get uploaded.
    return synced ? local.map((q) => (q.synced || q.pending ? q : { ...q, pending: true })) : local;
  });
  const [status, setStatus] = useState({ loading: mode === "staff", error: null });

  const quotesRef = useRef(quotes);
  const setAndStore = useCallback(
    (fn) =>
      setQuotes((prev) => {
        const next = fn(prev);
        quotesRef.current = next;
        saveQuotes(next, scope);
        return next;
      }),
    [scope]
  );

  // ---- uploading ----
  const linkRef = useRef(link);
  linkRef.current = link;
  const timer = useRef(null);
  const busy = useRef(false);

  const uploadPending = useCallback(async () => {
    if (!synced || busy.current) return;
    busy.current = true;
    let failed = null;
    try {
      for (const q of quotesRef.current.filter((x) => x.pending)) {
        const version = q.updatedAt || q.createdAt;
        try {
          await saveQuoteToServer(q, mode === "link" ? linkRef.current : null);
          // Only clear `pending` if it wasn't edited again while saving.
          setAndStore((prev) => prev.map((x) => (x.id === q.id && (x.updatedAt || x.createdAt) === version ? { ...x, pending: false, synced: true } : x)));
        } catch (err) {
          failed = err;
        }
      }
    } finally {
      busy.current = false;
    }
    setStatus((s) => ({ ...s, error: failed ? "save" : s.error === "save" ? null : s.error }));
    if (failed) {
      clearTimeout(timer.current);
      timer.current = setTimeout(uploadPending, RETRY_MS);
    } else if (quotesRef.current.some((x) => x.pending)) {
      // Edited again during the upload: save that too.
      clearTimeout(timer.current);
      timer.current = setTimeout(uploadPending, SAVE_DELAY_MS);
    }
  }, [synced, mode, setAndStore]);

  const scheduleUpload = useCallback(
    (delay = SAVE_DELAY_MS) => {
      if (!synced) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(uploadPending, delay);
    },
    [synced, uploadPending]
  );

  // ---- staff: load the shared list ----
  const refresh = useCallback(async () => {
    if (mode !== "staff") return;
    setStatus((s) => ({ ...s, loading: true }));
    try {
      const server = await listQuotes();
      const serverIds = new Set(server.map((q) => q.id));
      setAndStore((prev) => {
        // Unsaved local changes win over the server copy until they're uploaded.
        const pending = new Map(prev.filter((q) => q.pending).map((q) => [q.id, q]));
        const merged = server.map((q) => pending.get(q.id) || q);
        for (const q of pending.values()) if (!serverIds.has(q.id)) merged.push(q);
        return merged;
      });
      setStatus({ loading: false, error: null });
    } catch {
      setStatus({ loading: false, error: "load" });
    }
  }, [mode, setAndStore]);

  useEffect(() => {
    if (!synced) return undefined;
    refresh();
    scheduleUpload(0);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
        scheduleUpload(0);
      }
    };
    const onOnline = () => scheduleUpload(0);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      clearTimeout(timer.current);
      // Leaving the page (e.g. Make invoice): send unsaved changes now. If
      // that fails they're still marked pending on this device and go up
      // on the next visit.
      if (quotesRef.current.some((q) => q.pending)) uploadPending();
    };
  }, [synced, refresh, scheduleUpload, uploadPending]);

  // ---- changes ----
  const stamp = (q) => ({ ...q, updatedAt: new Date().toISOString(), pending: synced });

  const addQuote = useCallback(
    (quote) => {
      setAndStore((prev) => [...prev, stamp(quote)]);
      scheduleUpload(0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setAndStore, scheduleUpload, synced]
  );

  const updateQuote = useCallback(
    (quote, { now = false } = {}) => {
      setAndStore((prev) => prev.map((q) => (q.id === quote.id ? stamp(quote) : q)));
      scheduleUpload(now ? 0 : SAVE_DELAY_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setAndStore, scheduleUpload, synced]
  );

  // Staff delete it everywhere; the link and the demo only on this device.
  const removeQuote = useCallback(
    async (id) => {
      const quote = quotesRef.current.find((q) => q.id === id);
      if (mode === "staff" && quote?.synced) await deleteQuoteOnServer(id);
      setAndStore((prev) => prev.filter((q) => q.id !== id));
    },
    [mode, setAndStore]
  );

  return { quotes, status, addQuote, updateQuote, removeQuote, refresh };
}
