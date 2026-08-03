import { useTilt } from "../hooks/useTilt.js";

// Replaces the old [data-tilt] markup: wraps children in .tilt-wrap/.tilt
// (see .tilt-wrap/.tilt in src/index.css) and binds the tilt-on-hover effect.
export default function TiltCard({
  as: Tag = "div",
  maxDeg,
  className = "",
  wrapClassName = "",
  style,
  delayMs,
  children,
  ...rest
}) {
  const tiltRef = useTilt(maxDeg);
  const mergedStyle = delayMs != null ? { ...style, animationDelay: `${delayMs}ms` } : style;

  return (
    <div className={`tilt-wrap ${wrapClassName}`.trim()}>
      <Tag ref={tiltRef} className={`tilt ${className}`.trim()} style={mergedStyle} {...rest}>
        {children}
      </Tag>
    </div>
  );
}
