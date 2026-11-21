// Web Design & MultiMedia leads: shared helpers for the page and the demo.
// Field names match api/_lib/leads.js (the server maps them to the sheet's
// real headers).

export const LEAD_FIELDS = [
  { key: "BusinessName", label: "Business name", placeholder: "e.g. Corner Bakery" },
  { key: "BusinessType", label: "Business type", placeholder: "e.g. Bakery, Barber, Restaurant" },
  { key: "Location", label: "Location", placeholder: "Street, neighborhood" },
  { key: "Phone", label: "Phone number", type: "tel", placeholder: "(555) 555-0100" },
  { key: "Email", label: "Email", type: "email" },
  { key: "GoogleLocation", label: "Google location", type: "url", placeholder: "Google Maps link" },
  { key: "BusinessWebsite", label: "Business website", type: "url" },
  { key: "NewWebsite", label: "New website", type: "url", placeholder: "The site we made for them" },
  { key: "Instagram", label: "Instagram", placeholder: "@handle or link" },
  { key: "Facebook", label: "Facebook", placeholder: "Page link" },
  { key: "TikTok", label: "TikTok", placeholder: "@handle or link" },
  { key: "Yelp", label: "Yelp", type: "url" },
  { key: "Others", label: "Others" },
];
// Yes/No columns, shown as buttons.
export const YES_NO_FIELDS = [
  { key: "AnswerPhone", label: "Answered phone call?" },
  { key: "HasWebsite", label: "Has a website?" },
];

export const EMPTY_LEAD = Object.fromEntries([...LEAD_FIELDS, ...YES_NO_FIELDS, { key: "Notes" }, { key: "AiPrompt" }].map((f) => [f.key, ""]));

// "Yes", "yes ", "Y", "si" → "Yes"; "No", "n" → "No"; anything else → "".
export function yesNo(value) {
  const v = String(value ?? "").trim().toLowerCase();
  if (["yes", "y", "si", "sí", "true", "x"].includes(v)) return "Yes";
  if (["no", "n", "false"].includes(v)) return "No";
  return "";
}

// A link people typed by hand ("instagram.com/x", "@x", "www.site.com")
// → a full https link, or "" when it can't be one.
export function linkFor(kind, raw) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, "");
  const isHandle = /^@?[A-Za-z0-9._]+$/.test(value) && !value.includes(".com");
  if (isHandle && kind === "Instagram") return `https://instagram.com/${handle}`;
  if (isHandle && kind === "TikTok") return `https://www.tiktok.com/@${handle}`;
  if (isHandle && kind === "Facebook") return `https://facebook.com/${handle}`;
  if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(value)) return `https://${value}`;
  return "";
}

// "(347) 555-0100" → "tel:3475550100"; "" when there aren't enough digits.
export function telLink(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? `tel:${digits.length === 10 ? digits : `+${digits}`}` : "";
}

export const LEAD_FILTERS = [
  { key: "all", label: "All" },
  { key: "noWebsite", label: "No website" },
  { key: "noAnswer", label: "Didn't answer" },
  { key: "answered", label: "Answered" },
  { key: "newSite", label: "Has our site" },
];

// Answered the phone AND already has a website: kept in their own box on
// the page, apart from the rest of the list.
export const isAnsweredWithWebsite = (lead) => yesNo(lead.AnswerPhone) === "Yes" && yesNo(lead.HasWebsite) === "Yes";

export function matchesFilter(lead, filter) {
  switch (filter) {
    case "noWebsite":
      return yesNo(lead.HasWebsite) === "No" || (!yesNo(lead.HasWebsite) && !lead.BusinessWebsite);
    case "noAnswer":
      return yesNo(lead.AnswerPhone) === "No";
    case "answered":
      return yesNo(lead.AnswerPhone) === "Yes";
    case "newSite":
      return Boolean(String(lead.NewWebsite ?? "").trim());
    case "both":
      return isAnsweredWithWebsite(lead);
    default:
      return true;
  }
}

export function matchesSearch(lead, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  return [lead.BusinessName, lead.BusinessType, lead.Location, lead.Phone, lead.Email, lead.Notes].some((v) => String(v ?? "").toLowerCase().includes(q));
}

// Business types in the list, A–Z, for the type picker.
export function businessTypes(leads) {
  const seen = new Map();
  for (const lead of leads) {
    const type = String(lead.BusinessType ?? "").trim();
    if (type && !seen.has(type.toLowerCase())) seen.set(type.toLowerCase(), type);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// ---------- GitHub projects (Projects tab) ----------

// "littleLeadersGroupFamily-Daycare" → "Little Leaders Group Family Daycare"
export function projectTitle(name) {
  return String(name ?? "")
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export const PROJECT_FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live sites" },
  { key: "recent", label: "Last 30 days" },
];

export function matchesProject(project, { filter = "all", query = "", showOld = false, now = Date.now() } = {}) {
  if (!showOld && (project.archived || project.fork)) return false;
  if (filter === "live" && !project.homepage) return false;
  if (filter === "recent" && !(now - Date.parse(project.pushedAt) <= 30 * 86400000)) return false;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;
  return [project.name, projectTitle(project.name), project.description, project.language, project.homepage, ...(project.topics || [])].some((v) => String(v ?? "").toLowerCase().includes(q));
}

// "today", "yesterday", "5 days ago", "3 months ago", "2 years ago"
export function updatedAgo(iso, now = Date.now()) {
  const days = Math.floor((now - Date.parse(iso)) / 86400000);
  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years <= 1 ? "1 year ago" : `${years} years ago`;
}
