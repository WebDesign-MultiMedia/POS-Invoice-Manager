import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { friendlyMessage } from "../lib/errors.js";

// Staff login screen. Shown in place of whatever page was requested, so
// after logging in the staff member lands right where they were going.
//
// Desktop (1024px+) follows the "POS Invoice Manager" login design, a
// 1440×1024 canvas. Every position and size is written in design pixels
// times --u (see .login-stage in index.css), so the whole composition
// scales with the window like the mock-up instead of drifting apart.
//
// Phones/tablets (under 1024px) follow the separate "iPhone Pro Max" login
// design (402×874), modernised: blue backdrop with soft glows, the four
// features as glass tiles, and the form in a navy bottom sheet with
// labelled fields. Same markup, restyled in index.css; the
// parts only one layout uses are toggled with .login-desktop-only /
// .login-mobile-only.
//
// Illustrations are the design's own exports (public/imgs/login): top-left
// corner (x, y), width (w) and height (h) in design pixels. The design's
// announcement and receipt illustrations weren't supplied, so they're
// left out rather than substituted.
const DECOR = [
  { x: 140, y: 275, w: 130, h: 167, src: "/imgs/login/invoice.png" },
  { x: 1113, y: 288, w: 169, h: 141, src: "/imgs/login/payment-card.png" },
  { x: 156, y: 704, w: 97, h: 152, src: "/imgs/login/phone.png" },
  { x: 1090, y: 644, w: 248, h: 190, src: "/imgs/login/text-notification.png" },
];

// Mobile feature grid, in the design's reading order (line breaks are the
// design's). Icons are drawn larger than the design's ~35px so they're
// readable; size is set in index.css (.login-features img).
// Desktop shows the same four as compact chips (label + icon) under the
// tagline.
const FEATURES = [
  { lines: ["Track & Search", "Orders"], label: "Track & search orders", icon: "fa-magnifying-glass", src: "/imgs/login/phone.png" },
  { lines: ["Generate", "Invoice"], label: "Generate invoices", icon: "fa-file-invoice-dollar", src: "/imgs/login/invoice.png" },
  { lines: ["Text", "Announcements"], label: "Text announcements", icon: "fa-bullhorn", src: "/imgs/login/text-notification.png" },
  { lines: ["Card", "Payments"], label: "Card payments", icon: "fa-credit-card", src: "/imgs/login/payment-card.png" },
];

export function AuthSplash() {
  return (
    <main className="login-bg flex min-h-[100dvh] items-center justify-center" aria-busy="true">
      <i className="fa-solid fa-circle-notch fa-spin text-4xl text-white/80" aria-label="Loading"></i>
    </main>
  );
}

export default function LoginPage() {
  const { login, enterDemo, sessionExpired } = useAuth();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(sessionExpired ? "Your session expired. Please log in again." : "");
  const [capsLock, setCapsLock] = useState(false);
  const identifierRef = useRef(null);

  // Jump straight to the first field on desktops/laptops. Skipped on touch
  // devices, where it would pop the keyboard over the page on arrival.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) identifierRef.current?.focus();
  }, []);

  // Lets index.css turn off page scrolling on phones while this screen is
  // up (it fits one screen), and keep the page behind it in the login's
  // own colours whatever theme was picked; removed once the app takes over.
  useEffect(() => {
    document.documentElement.classList.add("login-open");
    // The browser bar / status bar colour follows this tag on phones; match
    // the login screen instead of whatever theme was picked before logging out.
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const previousThemeColor = themeMeta?.getAttribute("content");
    themeMeta?.setAttribute("content", "#2447d6");
    return () => {
      document.documentElement.classList.remove("login-open");
      if (themeMeta && previousThemeColor) themeMeta.setAttribute("content", previousThemeColor);
    };
  }, []);

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    if (error) setError("");
  };

  const checkCapsLock = (event) => setCapsLock(Boolean(event.getModifierState?.("CapsLock")));

  const showNotice = (message) => {
    setError("");
    setNotice(message);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setNotice("");
    if (!form.identifier.trim() || !form.password) {
      setError("Enter your email or phone number and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await login(form.identifier, form.password);
    } catch (err) {
      // The server's own login messages ("Wrong email/phone or password",
      // "Too many attempts…") are written for staff, so they're shown as-is.
      setError(err.serverMessage || friendlyMessage(err, "Couldn't log in. Please try again."));
      setForm((current) => ({ ...current, password: "" }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-bg login-shell text-white">
      {/* Background shapes, pinned to the window corners */}
      <img src="/imgs/login/polygon.png" alt="" aria-hidden="true" className="login-polygon" />
      <img src="/imgs/login/ellipse.png" alt="" aria-hidden="true" className="login-ellipse" />

      <div className="login-stage">
        {DECOR.map(({ x, y, w, h, src }) => (
          <img key={src} src={src} alt="" aria-hidden="true" className="login-decor" style={{ "--x": x, "--y": y, "--w": w, "--h": h }} />
        ))}

        <header className="login-header text-center">
          {/* Eyebrow → title → one-line promise → features: a clear
              reading order that says whose screen this is and what it does. */}
          <span className="login-eyebrow">
            <span className="login-eyebrow-dot" aria-hidden="true"></span>
            Staff portal
          </span>
          <h1 className="font-login-title">POS Invoice Manager</h1>
          <p className="login-tagline">Orders, invoices, card payments and customer texts — all in one place.</p>
          <ul className="login-chips login-desktop-only" aria-label="Features">
            {FEATURES.map(({ label, icon }) => (
              <li key={label}>
                <i className={`fa-solid ${icon}`} aria-hidden="true"></i>
                {label}
              </li>
            ))}
          </ul>
          <ul className="login-features login-mobile-only font-login-sub" aria-label="Features">
            {FEATURES.map(({ lines, src }) => (
              <li key={src}>
                <span>
                  {lines[0]}
                  <br />
                  {lines[1]}
                </span>
                <img src={src} alt="" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </header>

        <section aria-labelledby="login-heading" className="login-card">
          <h2 id="login-heading" className="font-login-heading">
            USER LOGIN
          </h2>
          <p className="login-card-sub login-mobile-only">Sign in to manage orders, invoices &amp; payments.</p>

          <form onSubmit={handleSubmit} noValidate className="login-form">
            {/* Email / phone */}
            <div className="login-field">
              <i className="fa-solid fa-user login-field-icon" aria-hidden="true"></i>
              <label htmlFor="identifier" className="login-label">
                Email or phone number
              </label>
              <input
                ref={identifierRef}
                id="identifier"
                name="identifier"
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                value={form.identifier}
                onChange={handleChange("identifier")}
                placeholder="Email/ Phone Number"
                enterKeyHint="next"
                aria-invalid={Boolean(error)}
                aria-describedby="login-status"
                className="login-input"
              />
            </div>

            {/* Password — on desktop the lock doubles as show/hide; on
                phones the lock is just an icon and an eye on the right
                does it. */}
            <div className="login-field">
              <i className="fa-solid fa-lock login-field-icon login-mobile-only" aria-hidden="true"></i>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="login-field-icon login-field-toggle"
              >
                <i className={`fa-solid login-desktop-only ${showPassword ? "fa-lock-open" : "fa-lock"}`} aria-hidden="true"></i>
                <i className={`fa-solid login-mobile-only ${showPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true"></i>
              </button>
              <label htmlFor="password" className="login-label">
                Password
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange("password")}
                onKeyDown={checkCapsLock}
                onKeyUp={checkCapsLock}
                onBlur={() => setCapsLock(false)}
                placeholder="Password"
                enterKeyHint="go"
                aria-invalid={Boolean(error)}
                aria-describedby="login-status"
                className="login-input"
              />
            </div>

            <button type="submit" disabled={submitting} className="login-submit font-login-button">
              {submitting ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-label="Logging in"></i>
              ) : (
                <>
                  <span className="login-desktop-only">LOGIN</span>
                  <span className="login-mobile-only">
                    Log in <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
                  </span>
                </>
              )}
            </button>

            <p className="login-divider login-mobile-only">
              <span>New here?</span>
            </p>

            {/* No self sign-up: accounts are added by the manager. Demo opens
                the app on made-up sample data only (lib/demo.js) — it never
                touches the real orders or the server. */}
            <div className="login-secondary font-login-small">
              <button type="button" className="login-btn-create" onClick={() => showNotice("Accounts are set up by the manager — ask them.")}>
                <span className="login-desktop-only">Create an Account</span>
                <span className="login-mobile-only">
                  <i className="fa-solid fa-user-plus" aria-hidden="true"></i> Sign up
                </span>
              </button>
              <button type="button" className="login-btn-demo" onClick={enterDemo}>
                <i className="fa-solid fa-play login-mobile-only" aria-hidden="true"></i> Demo
              </button>
            </div>

            {/* Fixed height so a message appearing doesn't shift the card. */}
            <div id="login-status" className="login-status font-login-small" aria-live="polite">
              {error ? (
                <p role="alert" className="font-semibold text-amber-200">
                  <i className="fa-solid fa-circle-exclamation mr-1.5" aria-hidden="true"></i>
                  {error}
                </p>
              ) : (
                notice && <p>{notice}</p>
              )}
              {capsLock && (
                <p className="text-white/90">
                  <i className="fa-solid fa-arrow-up mr-1" aria-hidden="true"></i>Caps Lock is on
                </p>
              )}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
