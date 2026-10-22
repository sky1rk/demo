import type { CSSProperties, HTMLAttributes } from "react";

/**
 * Google Material Symbols icon (ligature-based font glyph, stylesheet
 * loaded from fonts.googleapis.com in index.html). The child text — the
 * icon *name* — renders as the glyph; everything else is a normal span.
 *
 * `<MsIcon name="monitor_heart" className="text-xl text-theme-maroon" />`
 *
 * `fill`, `weight`, `grade`, and `optical` map to the variable axes; the
 * defaults match the `.ms` class, so pass props only to deviate.
 */
export default function MsIcon({
  name,
  fill = 0,
  weight = 400,
  grade = 0,
  optical = 24,
  className,
  style,
  ...rest
}: {
  name: string;
  /** 0 = outlined, 1 = filled (check icons, active states). */
  fill?: number;
  /** Variable stroke weight axis (100–700). */
  weight?: number;
  /** Emphasis axis (-50–200): higher = slimmer strokes. */
  grade?: number;
  /** Optical size axis (20–48); keep close to the rendered px size. */
  optical?: number;
  className?: string;
  style?: CSSProperties;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      translate="no"
      className={className != null && className.length > 0 ? `ms ${className}` : "ms"}
      style={{
        fontVariationSettings: `"FILL" ${fill}, "wght" ${weight}, "GRAD" ${grade}, "opsz" ${optical}`,
        ...style,
      }}
      {...rest}
    >
      {name}
    </span>
  );
}
