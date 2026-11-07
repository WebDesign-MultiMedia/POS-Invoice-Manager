import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { friendlyMessage } from "../lib/errors.js";
import ThemeToggle from "../components/ThemeToggle.jsx";

// Staff login screen. Shown in place of whatever page was requested, so
// after logging in the staff member lands right where they were going.
//
// Built from the same pieces as the pages behind it (glass-card,
// field-label, input-3d, btn-3d, round glass icons, the Geostar title),
// so it follows the chosen theme and logging in feels like one app rather
// than a separate splash page. Layout-only styles: .login-* in index.css.

// What the app does, as round glass icons like the app's own nav row.
const FEATURES = [
  { label: "Orders", icon: "fa-magnifying-glass" },
  { label: "Invoices", icon: "fa-file-invoice-dollar" },
  { label: "Card payments", icon: "fa-credit-card" },
  { label: "Customer texts", icon: "fa-bullhorn" },
];

export function AuthSplash() {
  return (
    <main className="relative z-10 flex min-h-[100dvh] items-center justify-center" aria-busy="true">
      <i className="fa-solid fa-circle-notch fa-spin text-4xl text-brand-gold" aria-label="Loading"></i>
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

  const handleChange = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    if (error) setError("");
  };

  const checkCapsLock = (event) => setCapsLock(Boolean(event.getModifierState?.("CapsLock")));

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
    <>
      <ThemeToggle />
      <main className="login-main relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8">
        {/* Same header as the app's pages: round mark, Geostar title, tracked subtitle. */}
        <header className="login-header flex flex-col items-center mb-5 stagger-in">
          <span className="login-mark glass-panel !rounded-full w-20 h-20 flex items-center justify-center" aria-hidden="true">
            <img src="/icons/icon-192.png" alt="" className="w-12 h-12 rounded-xl" />
          </span>
          <h1 className="font-headings text-2xl sm:text-4xl leading-snug shimmer-text text-center mt-3">POS Invoice Manager</h1>
          <p className="text-brand-navydeep/90 text-sm leading-relaxed tracking-widest uppercase text-center mt-2">Staff portal</p>
        </header>

        <ul className="login-features mb-6 stagger-in" aria-label="What you can do">
          {FEATURES.map(({ label, icon }) => (
            <li key={label} className="login-feature">
              <span className="glass-panel login-feature-icon" aria-hidden="true">
                <i className={`fa-solid ${icon} text-brand-gold`}></i>
              </span>
              {label}
            </li>
          ))}
        </ul>

        <section aria-labelledby="login-heading" className="login-card glass-card w-full max-w-md p-6 sm:p-8 stagger-in">
          <div className="flex items-center gap-2 mb-1 justify-center">
            <i className="fa-solid fa-right-to-bracket text-brand-gold text-xl" aria-hidden="true"></i>
            <h2 id="login-heading" className="text-xl sm:text-2xl font-semibold text-brand-navy">
              Staff Login
            </h2>
          </div>
          <p className="text-center text-sm text-brand-navydeep/80 mb-6">Sign in to take orders, payments and texts.</p>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
            <div className="field-group">
              <label htmlFor="identifier" className="field-label">
                <i className="fa-solid fa-user" aria-hidden="true"></i> Email or phone
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
                placeholder="you@example.com or phone"
                enterKeyHint="next"
                aria-invalid={Boolean(error)}
                aria-describedby="login-status"
                className={`input-3d ${error ? "field-error" : ""}`.trim()}
              />
            </div>

            <div className="field-group">
              <label htmlFor="password" className="field-label">
                <i className="fa-solid fa-lock" aria-hidden="true"></i> Password
              </label>
              <div className="relative">
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
                  className={`input-3d !pr-12 ${error ? "field-error" : ""}`.trim()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="login-eye"
                >
                  <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true"></i>
                </button>
              </div>
            </div>

            {/* Fixed minimum height so a message appearing doesn't shift the buttons. */}
            <div id="login-status" className="login-status text-sm" aria-live="polite">
              {error ? (
                <p role="alert" className="font-semibold text-brand-error">
                  <i className="fa-solid fa-circle-exclamation mr-1.5" aria-hidden="true"></i>
                  {error}
                </p>
              ) : (
                notice && (
                  <p className="text-brand-navydeep/90">
                    <i className="fa-solid fa-circle-info mr-1.5" aria-hidden="true"></i>
                    {notice}
                  </p>
                )
              )}
              {capsLock && (
                <p className="text-brand-navydeep/90">
                  <i className="fa-solid fa-arrow-up mr-1.5" aria-hidden="true"></i>Caps Lock is on
                </p>
              )}
            </div>

            <button type="submit" disabled={submitting} aria-busy={submitting} className="btn-3d w-full disabled:opacity-60">
              {submitting ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Logging in…
                </>
              ) : (
                <>
                  Log in <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </>
              )}
            </button>

            <p className="login-divider" aria-hidden="true">
              <span>or</span>
            </p>

            {/* Demo opens the app on made-up sample data only (lib/demo.js);
                it never touches the real orders or the server. */}
            <button type="button" onClick={enterDemo} className="glass-panel login-demo">
              <i className="fa-solid fa-play text-brand-gold" aria-hidden="true"></i> Try the demo
            </button>

            {/* No self sign-up: the manager adds staff accounts. */}
            <p className="text-center text-xs text-brand-navydeep/80">Need an account? Ask your manager to add you.</p>
          </form>
        </section>
      </main>
    </>
  );
}
