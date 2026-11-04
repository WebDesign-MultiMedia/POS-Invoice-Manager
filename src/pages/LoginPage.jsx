import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth.jsx";

// Staff login screen. Shown in place of whatever page was requested, so
// after logging in the staff member lands right where they were going.
//
// Desktop (1024px+) follows the "POS Invoice Manager" login design, a
// 1440×1024 canvas. Every position and size is written in design pixels
// times --u (see .login-stage in index.css), so the whole composition
// scales with the window like the mock-up instead of drifting apart.
//
// Phones/tablets (under 1024px) follow the separate "iPhone Pro Max" login
// design (402×874): solid blue, a 2×2 feature grid with small icons, and
// the form in a navy bottom sheet. Same markup, restyled in index.css; the
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
const FEATURES = [
  { lines: ["Track & Search", "Orders"], src: "/imgs/login/phone.png" },
  { lines: ["Generate", "Invoice"], src: "/imgs/login/invoice.png" },
  { lines: ["Text", "Announcements"], src: "/imgs/login/text-notification.png" },
  { lines: ["Card", "Payments"], src: "/imgs/login/payment-card.png" },
];

export function AuthSplash() {
  return (
    <main className="login-bg flex min-h-[100dvh] items-center justify-center" aria-busy="true">
      <i className="fa-solid fa-circle-notch fa-spin text-4xl text-white/80" aria-label="Loading"></i>
    </main>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const identifierRef = useRef(null);

  // Jump straight to the first field on desktops/laptops. Skipped on touch
  // devices, where it would pop the keyboard over the page on arrival.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) identifierRef.current?.focus();
  }, []);

  // Lets index.css turn off page scrolling on phones while this screen is
  // up (it fits one screen); removed again once the app takes over.
  useEffect(() => {
    document.documentElement.classList.add("login-open");
    return () => document.documentElement.classList.remove("login-open");
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
      setError(err.message);
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
          <h1 className="font-login-title">POS Invoice Manager</h1>
          <p className="font-login-sub login-desktop-only text-neutral-50">
            Track &amp; Search Orders <span aria-hidden="true">||</span> Generate Invoice
            <br />
            Card Payments <span aria-hidden="true">||</span> Text Announcements
          </p>
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

          <form onSubmit={handleSubmit} noValidate className="login-form">
            {/* Email / phone */}
            <div className="login-field">
              <i className="fa-solid fa-user login-field-icon" aria-hidden="true"></i>
              <label htmlFor="identifier" className="sr-only">
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
              {/* Mobile design's in-field label; hides once typing starts. */}
              <span aria-hidden="true" className="login-field-label font-login-mono">
                Email / Phone #
              </span>
            </div>

            {/* Password — the lock doubles as show/hide */}
            <div className="login-field">
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="login-field-icon login-field-toggle"
              >
                <i className={`fa-solid ${showPassword ? "fa-lock-open" : "fa-lock"}`} aria-hidden="true"></i>
              </button>
              <label htmlFor="password" className="sr-only">
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
              <span aria-hidden="true" className="login-field-label font-login-mono">
                Password
              </span>
            </div>

            <button type="submit" disabled={submitting} className="login-submit font-login-button">
              {submitting ? <i className="fa-solid fa-circle-notch fa-spin" aria-label="Logging in"></i> : "LOGIN"}
            </button>

            {/* No self sign-up or demo login: either would let anyone read
                every customer's details. Accounts are added by the manager. */}
            <div className="login-secondary font-login-small">
              <button type="button" className="login-btn-create" onClick={() => showNotice("Accounts are set up by the manager — ask them.")}>
                <span className="login-desktop-only">Create an Account</span>
                <span className="login-mobile-only">Signup</span>
              </button>
              <button type="button" className="login-btn-demo" onClick={() => showNotice("No demo login — customer data is private.")}>
                Demo
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
