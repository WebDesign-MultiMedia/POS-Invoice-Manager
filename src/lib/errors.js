// Turns any failure from the network layer into one short sentence staff
// can act on. Raw text like "Response status: 502" or "Failed to fetch"
// never reaches the screen; the details still go to the console.

export class ApiError extends Error {
  constructor(status, serverMessage) {
    super(serverMessage || `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    // A message the server wrote for people (e.g. "Message content required").
    this.serverMessage = serverMessage || "";
  }
}

// Reads the JSON error body if there is one, and builds an ApiError.
export async function apiErrorFrom(res) {
  const payload = await res.json().catch(() => null);
  return new ApiError(res.status, typeof payload?.error === "string" ? payload.error : "");
}

const OFFLINE = "Couldn't reach the server. Check the internet connection and try again.";
const LOGGED_OUT = "Your login expired. Please log in again.";
const SERVER = "The server had a problem. Please try again in a minute.";

// `fallback` describes what failed, e.g. "Couldn't save the order."
export function friendlyMessage(err, fallback = "Something went wrong. Please try again.") {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE;
  // fetch() rejects with a TypeError when the network is down.
  if (err instanceof TypeError) return OFFLINE;
  if (err instanceof ApiError) {
    if (err.status === 401) return LOGGED_OUT;
    // 4xx messages from our own API are written for staff; 5xx ones aren't shown.
    if (err.status < 500 && err.serverMessage) return err.serverMessage;
    if (err.status >= 500) return `${fallback} ${SERVER}`;
  }
  return fallback;
}
