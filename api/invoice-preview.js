import { isValidShareToken } from "./_lib/auth.js";
import { sheetdbBase, sheetdbHeaders } from "./_lib/sheetdb.js";

// Vercel serverless function: the page a customer's invoice link
// (/invoice?id=…&token=…&share=1) is served from, so a text message's
// link preview shows the invoice instead of just the app's name.
// vercel.json rewrites only those share links here.
//
// Message apps build the preview from the page's <meta> tags without
// running any JavaScript, so this returns the app's normal index.html with
// the title and Open Graph tags filled in for that invoice. The page then
// loads exactly like any other visit. The customer's name and total are
// only added when the link's signed token is valid; otherwise the preview
// is just the business name.

const BUSINESS = "Buffet Lucia Fiesta Mexicana";
const ID_RE = /^[A-Za-z0-9-]{1,40}$/;

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function money(value) {
  const raw = String(value ?? "").trim();
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return raw && Number.isFinite(n) ? `$${n.toFixed(2)}` : "";
}

async function findInvoice(id) {
  const base = sheetdbBase();
  if (!base) return null;
  const response = await fetch(`${base}/search?Id=${encodeURIComponent(id)}`, { method: "GET", headers: sheetdbHeaders() });
  if (!response.ok) throw new Error(`SheetDB responded ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows.find((row) => String(row.Id) === id) || null : null;
}

// What the preview says for this link.
export function previewFor(invoice, id) {
  if (!invoice) return { title: `${BUSINESS} · Invoice`, description: `Your invoice from ${BUSINESS}` };
  const name = String(invoice.Name || "").trim();
  const total = money(invoice.Cost);
  return {
    title: `Invoice #${id}${name ? ` · ${name}` : ""}`,
    description: [BUSINESS, total && `Total ${total}`].filter(Boolean).join(" · "),
  };
}

export function withPreview(html, { title, description, url, image }) {
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(BUSINESS)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    url && `<meta property="og:url" content="${escapeHtml(url)}" />`,
    image && `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].filter(Boolean);
  return html
    .replace(/<meta (property="og:[^"]*"|name="description"|name="twitter:card")[^>]*>\s*/g, "")
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
}

export default async function handler(req, res) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const origin = `https://${host}`;
  const params = new URL(req.url, origin).searchParams;
  const id = String(params.get("id") || "").trim();

  let html;
  try {
    // The built app page (a static file, so this isn't rewritten back here).
    const page = await fetch(`${origin}/index.html`);
    if (!page.ok) throw new Error(`index.html responded ${page.status}`);
    html = await page.text();
  } catch (err) {
    console.error("invoice-preview: couldn't load the app page:", err);
    return res.status(502).end("Please try again in a moment.");
  }

  let invoice = null;
  if (ID_RE.test(id) && isValidShareToken(id, params.get("token"))) {
    try {
      invoice = await findInvoice(id);
    } catch (err) {
      // The link still opens; the preview just says less.
      console.error("invoice-preview: invoice lookup failed:", err);
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Customer details: never kept by shared caches.
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).end(
    withPreview(html, {
      ...previewFor(invoice, id),
      url: `${origin}${req.url}`,
      image: `${origin}/icons/apple-touch-icon.png`,
    })
  );
}
