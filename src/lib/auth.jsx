import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isDemo, startDemo, endDemo } from "./demo.js";

// Staff login state for the whole app. The session itself is an HttpOnly
// cookie set by api/auth.js, so this only tracks who is logged in;
// nothing secret is kept in the browser.

const AUTH_EXPIRED_EVENT = "pim:auth-expired";
const AuthContext = createContext(null);

// API helpers call this on a 401 so an expired session shows the login
// screen again instead of a confusing error.
export function reportIfLoggedOut(res) {
  if (res.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function postAuth(body) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `Response status: ${res.status}`);
  return payload;
}

export function AuthProvider({ children }) {
  // "loading" until the first session check answers, then "in" or "out" —
  // or "demo" while someone is trying the app on sample data (lib/demo.js).
  const [status, setStatus] = useState(() => (isDemo() ? "demo" : "loading"));
  const [user, setUser] = useState(() => (isDemo() ? "Demo" : null));

  useEffect(() => {
    if (isDemo()) return undefined;
    let cancelled = false;
    fetch("/api/auth")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((payload) => {
        if (cancelled) return;
        setUser(payload?.user || null);
        setStatus(payload?.user ? "in" : "out");
      });

    const onExpired = () => {
      setUser(null);
      setStatus("out");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, []);

  const login = useCallback(async (identifier, password) => {
    const { user: login } = await postAuth({ action: "login", identifier, password });
    endDemo();
    setUser(login);
    setStatus("in");
  }, []);

  const logout = useCallback(async () => {
    if (isDemo()) {
      endDemo();
    } else {
      await postAuth({ action: "logout" }).catch(() => {});
    }
    setUser(null);
    setStatus("out");
  }, []);

  // Demo: no server session at all, just the sample-data mode.
  const enterDemo = useCallback(() => {
    startDemo();
    setUser("Demo");
    setStatus("demo");
  }, []);

  return <AuthContext.Provider value={{ status, user, login, logout, enterDemo }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
