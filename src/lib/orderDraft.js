import { isDemo } from "./demo.js";

// A half-typed order is kept in sessionStorage (this tab only) until it's
// saved, so it survives a session timeout, the login screen, or a reload.
// Demo drafts use their own key so sample data never shows up after a real
// login. The Catering Calculator also writes a draft here to open the order
// form already filled in from a saved quote.
export const draftKey = () => (isDemo() ? "pim-order-draft-demo" : "pim-order-draft");

// Which catering quote the current draft came from (for the order form's
// "Filled in from Quote #N" note).
export const draftSourceKey = () => `${draftKey()}-source`;

// Nothing typed yet. Deposit starts at "0" on a new form, so a 0 deposit
// alone doesn't count as a draft.
export function isBlankForm(form) {
  return Object.entries(form).every(([key, v]) => {
    const value = String(v ?? "").trim();
    return !value || (key === "Deposit" && Number(value) === 0);
  });
}

export function readDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey()));
    if (saved && typeof saved === "object" && !isBlankForm(saved)) return saved;
  } catch {
    // Storage blocked or corrupt draft.
  }
  return null;
}

export function writeDraft(form, source = null) {
  try {
    if (isBlankForm(form)) {
      sessionStorage.removeItem(draftKey());
      sessionStorage.removeItem(draftSourceKey());
    } else {
      sessionStorage.setItem(draftKey(), JSON.stringify(form));
      if (source) sessionStorage.setItem(draftSourceKey(), source);
    }
  } catch {
    // Storage blocked: the form still works, just without a draft.
  }
}

export function readDraftSource() {
  try {
    return sessionStorage.getItem(draftSourceKey());
  } catch {
    return null;
  }
}

export const hasDraft = () => Boolean(readDraft());
