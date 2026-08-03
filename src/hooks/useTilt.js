import { useEffect, useRef } from "react";

const DEFAULT_MAX_DEG = 10;

// 3D tilt-on-hover, ported from the old src/interactions.js bindTilt().
// Skips attaching listeners on touch devices, where mouse events never fire
// anyway and there's no hover affordance to replace.
export function useTilt(maxDeg = DEFAULT_MAX_DEG) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const handleMouseMove = (e) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (px - 0.5) * maxDeg * 2;
      const ry = (0.5 - py) * maxDeg * 2;
      el.style.setProperty("--rx", `${rx}deg`);
      el.style.setProperty("--ry", `${ry}deg`);
    };

    const handleMouseLeave = () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [maxDeg]);

  return ref;
}
