// Keeps the installed home-screen app on the newest version. A home-screen
// app can stay open in the background for days without reloading, so after
// a deploy it kept running (and printing with) the old version.
//
// Each build's page names its own script file (/assets/index-<hash>.js).
// Whenever the app comes back on screen (at most once a minute), the live
// page is checked; if it names a different script, a new version is out
// and the app reloads. Coming back on screen is a safe moment: drafts and
// quotes are in session/local storage and survive the reload.
const CHECK_EVERY_MS = 60 * 1000;

const scriptOf = (html) => (html.match(/\/assets\/index-[\w-]+\.js/) || [])[0] || null;

export function startAutoUpdate() {
  const running = scriptOf(document.documentElement.innerHTML);
  if (!running) return; // dev server: no built assets
  let lastCheck = Date.now();

  const check = async () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < CHECK_EVERY_MS) return;
    lastCheck = Date.now();
    try {
      const res = await fetch("/", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return;
      const live = scriptOf(await res.text());
      if (live && live !== running) window.location.reload();
    } catch {
      // Offline: check again next time.
    }
  };

  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);
}

export { scriptOf };
