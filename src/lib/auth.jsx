import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isDemo, startDemo, endDemo } from "./demo.js";
import { apiErrorFrom } from "./errors.js";
import { ALL_ACCESS } from "./permissions.js";

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
  if (!res.ok) throw await apiErrorFrom(res);
  return res.json();
}

export function AuthProvider({ children }) {
  // "loading" until the first session check answers, then "in" or "out" —
  // or "demo" while someone is trying the app on sample data (lib/demo.js).
  const [status, setStatus] = useState(() => (isDemo() ? "demo" : "loading"));
  const [user, setUser] = useState(() => (isDemo() ? "Demo" : null));
  // "staff" sees everything; "event" is an employee who may only use Event
  // Sales. The server enforces this on every request; the app just hides
  // what an employee can't use.
  const [role, setRole] = useState("staff");
  // Who sales are credited to: an employee's name, or the staff login.
  const [name, setName] = useState(() => (isDemo() ? "Demo" : ""));
  // The sections this login may use (lib/permissions.js). Staff: all.
  const [access, setAccess] = useState(ALL_ACCESS);
  // True when a logged-in session ran out mid-use (an API call got a 401),
  // so the login screen can say why it's back. Unsaved order drafts are
  // kept in sessionStorage by the order form, so nothing typed is lost.
  const [sessionExpired, setSessionExpired] = useState(false);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (isDemo()) return undefined;
    let cancelled = false;
    fetch("/api/auth")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((payload) => {
        if (cancelled) return;
        setUser(payload?.user || null);
        setRole(payload?.role === "event" ? "event" : "staff");
        setName(payload?.name || payload?.user || "");
        setAccess(Array.isArray(payload?.access) ? payload.access : ALL_ACCESS);
        setStatus(payload?.user ? "in" : "out");
      });

    const onExpired = () => {
      setUser(null);
      if (statusRef.current === "in") setSessionExpired(true);
      setStatus("out");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    };
  }, []);

  // Employees: when the app comes back into view, pick up any sections the
  // owner turned on or off (the server already enforces them).
  useEffect(() => {
    if (role !== "event" || status !== "in") return undefined;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/auth")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
        .then((payload) => {
          if (!payload?.user) return;
          setName(payload.name || payload.user);
          if (Array.isArray(payload.access)) setAccess(payload.access);
        });
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [role, status]);

  const login = useCallback(async (identifier, password) => {
    const { user: login, role: loginRole, name: loginName, access: loginAccess } = await postAuth({ action: "login", identifier, password });
    endDemo();
    setSessionExpired(false);
    setUser(login);
    setRole(loginRole === "event" ? "event" : "staff");
    setName(loginName || login);
    setAccess(Array.isArray(loginAccess) ? loginAccess : ALL_ACCESS);
    setStatus("in");
  }, []);

  const logout = useCallback(async () => {
    if (isDemo()) {
      endDemo();
    } else {
      await postAuth({ action: "logout" }).catch(() => {});
    }
    setSessionExpired(false);
    setUser(null);
    setRole("staff");
    setName("");
    setAccess(ALL_ACCESS);
    setStatus("out");
  }, []);

  // Demo: no server session at all, just the sample-data mode.
  const enterDemo = useCallback(() => {
    startDemo();
    setSessionExpired(false);
    setUser("Demo");
    setRole("staff");
    setName("Demo");
    setAccess(ALL_ACCESS);
    setStatus("demo");
  }, []);

  // can("pay"), can("manage"), can("staff"): what this login may use.
  // Staff (and the demo) can use everything; "staff" itself is owner-only.
  const can = useCallback((key) => role !== "event" || (key !== "staff" && access.includes(key)), [role, access]);

  return <AuthContext.Provider value={{ status, user, name, role, access, can, isEmployee: role === "event", sessionExpired, login, logout, enterDemo }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
