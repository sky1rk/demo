import type { CSSProperties } from "react";

/**
 * Renders an SVG asset (imported file) as a mask so its color can follow
 * `currentColor` via `background-color`. Icon files use black strokes on a
 * transparent background; alpha drives the mask, color comes from CSS.
 */
export default function Icon({ src, className }: { src: string; className?: string }) {
  const style: CSSProperties = {
    maskImage: `url(${src})`,
    WebkitMaskImage: `url(${src})`,
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "contain",
    WebkitMaskSize: "contain",
  };

  return (
    <span aria-hidden className={`inline-block bg-current ${className ?? ""}`} style={style} />
  );
}
