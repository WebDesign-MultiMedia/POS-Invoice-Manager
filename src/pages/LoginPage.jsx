import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth.jsx";

// Staff login screen. Shown in place of whatever page was requested, so
// after logging in the staff member lands right where they were going.
//
// Based on the "POS Invoice Manager" login design (fixed 1440px canvas),
// rebuilt as a fluid layout so it also works on phones. The design's
// image assets weren't available, so the shapes are drawn in CSS and the
// illustrations are Font Awesome icons.

const FEATURES = ["Track & Search Orders", "Generate Invoice", "Card Payments", "Text Announcements"];

// Decorative icons scattered around the edges (the design's illustrations).
const DECOR = [
  { icon: "fa-file-invoice", className: "top-[33%] left-[6%] text-7xl lg:text-8xl" },
  { icon: "fa-credit-card", className: "top-[4%] right-[4%] text-7xl lg:text-8xl" },
  { icon: "fa-mobile-screen-button", className: "top-[74%] left-[13%] text-7xl" },
  { icon: "fa-cash-register", className: "top-[36%] right-[9%] text-8xl lg:text-9xl" },
  { icon: "fa-comment-sms", className: "top-[69%] right-[12%] text-7xl lg:text-8xl" },
  { icon: "fa-receipt", className: "top-[84%] left-[27%] text-6xl" },
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
    <main className="login-bg login-shell relative flex min-h-[100dvh] flex-col items-center overflow-hidden px-4 pb-14 pt-10 text-white sm:pb-16 sm:pt-16">
      {/* Background shapes */}
      <div aria-hidden="true" className="login-polygon absolute left-0 top-0 aspect-[669/617] w-[70vw] max-w-[669px] sm:w-[46vw]" />
      <div aria-hidden="true" className="absolute -bottom-[140px] -right-[120px] h-[300px] w-[330px] rounded-[50%] bg-[#171e6d] sm:-bottom-[110px] sm:-right-[90px] sm:h-[438px] sm:w-[485px]" />
      {DECOR.map(({ icon, className }) => (
        <i key={icon} aria-hidden="true" className={`fa-solid ${icon} login-decor absolute hidden min-[1440px]:block ${className}`}></i>
      ))}

      <header className="login-header relative z-10 max-w-5xl text-center">
        <h1 className="font-login-title text-[2.5rem] leading-tight min-[360px]:text-5xl sm:text-7xl lg:text-8xl">POS Invoice Manager</h1>
        {/* Phones/tablets: tidy chips (a wrapped "||" list would start lines
            with a stray separator). Large screens: the design's "||" line. */}
        <ul className="font-login-sub mt-4 flex flex-wrap justify-center gap-2 text-lg text-neutral-50 sm:mt-6 sm:text-2xl lg:gap-x-3 lg:gap-y-1 lg:text-[40px] lg:leading-tight">
          {FEATURES.map((feature, i) => (
            <li key={feature} className="flex items-center gap-x-3 rounded-full bg-white/10 px-3 py-0.5 lg:bg-transparent lg:p-0">
              {i > 0 && <span aria-hidden="true" className="hidden opacity-70 lg:inline">||</span>}
              {feature}
            </li>
          ))}
        </ul>
      </header>

      <section aria-labelledby="login-heading" className="login-form relative z-10 mt-10 w-full max-w-[501px] sm:mt-16">
        <form onSubmit={handleSubmit} noValidate>
          <h2 id="login-heading" className="font-login-ui mb-6 text-center sm:mb-8 text-3xl font-bold sm:text-[40px]">
            USER LOGIN
          </h2>

          {/* Email / phone */}
          <div className="login-pill relative">
            <span aria-hidden="true" className="login-badge left-0 sm:-left-[52px]">
              <i className="fa-solid fa-user"></i>
            </span>
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
              aria-describedby="login-error"
              className="login-input badge-left"
            />
          </div>

          {/* Password — the round badge doubles as show/hide */}
          <div className="login-pill relative mt-6">
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
              aria-describedby="login-error"
              className="login-input badge-right"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="login-badge right-0 cursor-pointer sm:-right-[19px]"
            >
              <i className={`fa-solid ${showPassword ? "fa-lock-open" : "fa-lock"}`}></i>
            </button>
          </div>

          {/* Fixed height so a message appearing doesn't shove the button. */}
          <div className="login-feedback font-login-ui mt-4 min-h-[3.5rem] text-center">
            <p id="login-error" role="alert" className="text-base font-semibold text-amber-200 sm:text-lg">
              {error && (
                <>
                  <i className="fa-solid fa-circle-exclamation mr-2" aria-hidden="true"></i>
                  {error}
                </>
              )}
            </p>
            {capsLock && (
              <p className="mt-1 text-sm font-medium text-white/90">
                <i className="fa-solid fa-arrow-up mr-1.5" aria-hidden="true"></i>Caps Lock is on
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="font-login-ui mt-2 h-[64px] w-full rounded-full bg-white text-3xl font-extrabold tracking-wide text-[#2447d6] shadow-[0_10px_30px_-8px_rgba(10,20,90,0.6)] transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/70 disabled:opacity-70 sm:h-[78px] sm:text-4xl"
          >
            {submitting ? <i className="fa-solid fa-circle-notch fa-spin" aria-label="Logging in"></i> : "LOGIN"}
          </button>
        </form>

        {/* No self sign-up: anyone who could create an account could read
            every customer's details. Accounts are added by the manager. */}
        <p className="font-login-ui mt-8 text-center text-base font-bold text-white/95 sm:mt-10 sm:text-2xl">Need an account? Ask the manager.</p>
      </section>
    </main>
  );
}
