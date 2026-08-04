import { useCallback, useState } from "react";
import { applyTheme, getStoredTheme } from "../lib/theme.js";

export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
