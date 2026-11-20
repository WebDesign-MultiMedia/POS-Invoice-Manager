import { useCallback, useState } from "react";
import { applyTheme, getTheme, nextTheme } from "../lib/theme.js";

export function useTheme() {
  const [theme, setTheme] = useState(getTheme);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = nextTheme(prev);
      applyTheme(next);
      return next;
    });
  }, []);

  // Pick one theme from the menu.
  const choose = useCallback((next) => {
    applyTheme(next);
    setTheme(next);
  }, []);

  return { theme, toggle, choose };
}
