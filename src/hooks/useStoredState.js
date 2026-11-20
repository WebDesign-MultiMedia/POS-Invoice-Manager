import { useCallback, useState } from "react";

// useState that this phone remembers (localStorage), so a choice like a
// filter stays picked after a refresh or reopening the app. `allowed` drops
// a saved value that no longer makes sense (e.g. a filter that was
// removed). Storage can be blocked (private mode): then it works for this
// visit only.
export default function useStoredState(key, initial, allowed = () => true) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const saved = JSON.parse(raw);
      return allowed(saved) ? saved : initial;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next) =>
      setValue((prev) => {
        const v = typeof next === "function" ? next(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {
          // Storage blocked: it just won't be remembered.
        }
        return v;
      }),
    [key]
  );

  return [value, set];
}
