// Copies text, resolving true/false within ~1.5s. Some browsers hold the
// clipboard request open while they ask for permission (or never answer
// it), which left buttons like Share doing nothing at all; callers fall
// back to showing the text for manual copying instead.
export async function copyText(text, timeoutMs = 1500) {
  if (!navigator.clipboard?.writeText) return false;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
  const write = navigator.clipboard.writeText(text).then(
    () => true,
    () => false
  );
  return Promise.race([write, timeout]);
}
