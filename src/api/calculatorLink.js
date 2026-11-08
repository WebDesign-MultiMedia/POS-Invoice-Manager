// The Catering Calculator's no-login employee link (api/calculator-link.js).
import { isDemo } from "../lib/demo.js";
import { apiErrorFrom } from "../lib/errors.js";
import { reportIfLoggedOut } from "../lib/auth.jsx";

const ENDPOINT = "/api/calculator-link";

// Staff: the signed token for the link. The demo has no server access, so
// its link only works in the same browser.
export async function getCalculatorToken() {
  if (isDemo()) return "demo";
  const res = await fetch(`${ENDPOINT}?action=token`);
  if (!res.ok) {
    reportIfLoggedOut(res);
    throw await apiErrorFrom(res);
  }
  return (await res.json()).token;
}

// Public: whether a link's token is still valid. Network trouble throws, so
// the page can say "check your connection" rather than "link not valid".
export async function checkCalculatorToken(token) {
  if (isDemo()) return token === "demo";
  const res = await fetch(`${ENDPOINT}?${new URLSearchParams({ action: "check", token: token || "" })}`);
  if (res.status === 403) return false;
  if (!res.ok) throw await apiErrorFrom(res);
  return true;
}

export function calculatorLinks(token) {
  const base = `${window.location.origin}/catering`;
  return { staff: base, public: `${base}?${new URLSearchParams({ share: "1", token })}` };
}
