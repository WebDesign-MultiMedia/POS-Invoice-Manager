// Web Design & MultiMedia leads, through /api/sheets (api/_lib/leads.js).
// The server holds that sheet's SheetDB id; the browser never sees it.
// In demo mode everything is answered from made-up sample leads.
import { reportIfLoggedOut } from "../lib/auth.jsx";
import { isDemo, DEMO_RESET_EVENT } from "../lib/demo.js";
import { apiErrorFrom, ApiError } from "../lib/errors.js";
import { DEMO_LEADS } from "../lib/demoLeads.js";

const SHEETS_API = "/api/sheets";

async function check(res) {
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return res.json();
}

// ---------- demo (in memory only; starts over with each demo) ----------
let demoLeads = null;
const demoList = () => (demoLeads ||= DEMO_LEADS.map((l) => ({ ...l })));
if (typeof window !== "undefined") window.addEventListener(DEMO_RESET_EVENT, () => (demoLeads = null));
const later = (v) => new Promise((resolve) => setTimeout(() => resolve(JSON.parse(JSON.stringify(v))), 250));

// { leads: [...], canEdit } — canEdit is false until the sheet has an Id column.
export async function fetchLeads() {
  if (isDemo()) return later({ leads: demoList(), canEdit: true });
  return check(await fetch(`${SHEETS_API}?action=leads`));
}

async function post(body) {
  return check(
    await fetch(SHEETS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

export function createLead(data) {
  if (isDemo()) {
    const id = `WD-DEMO-${demoList().length + 1}`;
    demoList().push({ ...data, Id: id });
    return later({ ok: true, id });
  }
  return post({ action: "createLead", data });
}

export function updateLead(id, data) {
  if (isDemo()) {
    const lead = demoList().find((l) => l.Id === id);
    if (!lead) return Promise.reject(new ApiError(404, "That business isn't in the list any more."));
    Object.assign(lead, data, { Id: id });
    return later({ ok: true });
  }
  return post({ action: "updateLead", id, data });
}
