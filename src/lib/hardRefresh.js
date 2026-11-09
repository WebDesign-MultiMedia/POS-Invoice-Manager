// "Refresh app": what a hard refresh does in a browser, for the installed
// home-screen app, which has no browser reload button.
// Clears any cached copies of the app, re-downloads the page past the HTTP
// cache, then reloads. Drafts and saved quotes live in session/local storage,
// which this leaves alone.
export async function hardRefresh() {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if (navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    // Refresh the HTTP cache's copy of the page (and with it, which
    // script/style files the new version uses).
    await fetch(window.location.href, { cache: "reload", credentials: "same-origin" });
  } catch {
    // Offline or blocked: a normal reload is still the best we can do.
  }
  window.location.reload();
}
