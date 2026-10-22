import type { VitalSeriesPoint } from "../lib/vitals.ts";
import MsIcon from "./MsIcon.tsx";

/**
 * Full vital-sign trend chart (the legacy monitor's gridline + area + line
 * look) rendered from real observation data — no chart library, pure SVG.
 *
 * The y-domain is derived from the series with padding, the x-scale maps
 * recorded_at proportions across the observed window, and the x-axis shows
 * up to four labelled ticks (start, two spread points, end).
 */
export default function TrendChart({
  title,
  unit,
  points,
  emptyHint,
  icon,
}: {
  title: string;
  unit: string;
  points: VitalSeriesPoint[];
  emptyHint: string;
  /** Material Symbols glyph name for the card header (optional). */
  icon?: string;
}) {
  const header = (
    <h2 className="flex items-center gap-2 text-sm font-bold text-theme-ink">
      {icon != null ? (
        <MsIcon
          name={icon}
          className="text-[20px] text-theme-maroon"
          optical={20}
        />
      ) : null}
      {title}
      <span className="text-xs font-medium text-theme-gray">({unit})</span>
    </h2>
  );

  if (points.length < 2) {
    return (
      <article className="flex min-h-64 flex-col rounded-xl border border-theme-line bg-white p-5 shadow-sm">
        {header}
        <p className="mt-4 text-xs leading-5 text-theme-gray">{emptyHint}</p>
      </article>
    );
  }

  const values = points.map((point) => point.v);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin || rawMax * 0.1 || 1) * 0.15;
  const yMin = Math.max(0, rawMin - pad);
  const yMax = rawMax + pad;
  const ySpan = yMax - yMin || 1;

  const FIRST_Y = 14;
  const LAST_Y = 190;
  const LINE_RIGHT = 540;
  const LINE_LEFT = 56;
  const xSpan = Math.max(points[points.length - 1].t - points[0].t, 1);

  function y(value: number): number {
    return LAST_Y - ((value - yMin) / ySpan) * (LAST_Y - FIRST_Y);
  }
  function x(t: number): number {
    return LINE_LEFT + ((t - points[0].t) / xSpan) * (LINE_RIGHT - LINE_LEFT);
  }

  const linePoints = points
    .map((point) => `${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`)
    .join(" ");

  const gridYs = [0, 1, 2, 3, 4].map(
    (tick) => LAST_Y - (tick / 4) * (LAST_Y - FIRST_Y),
  );
  const gridLabels = [0, 1, 2, 3, 4].map((tick) => yMin + (tick / 4) * ySpan);

  // Up to four x labels, even indices: start … end.
  const labelIndices = [0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1].filter(
    (index, position, all) => all.indexOf(index) === position,
  );
  const timeFormat = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article className="flex flex-col rounded-xl border border-theme-line bg-white p-5 shadow-sm">
      {header}
      <svg
        viewBox="0 0 560 220"
        className="mt-3 w-full"
        role="img"
        aria-label={`${title} trend chart`}
      >
        {gridYs.map((gridY) => (
          <line
            key={gridY}
            x1={LINE_LEFT}
            y1={gridY}
            x2={LINE_RIGHT}
            y2={gridY}
            className="stroke-theme-line"
            strokeWidth="1"
          />
        ))}
        {gridYs.map((gridY, tick) => (
          <text
            key={`label-${gridY}`}
            x={tick === 4 ? 32 : 40}
            y={gridY + 4}
            className="fill-theme-gray text-xs"
          >
            {roundLabel(gridLabels[tick])}
          </text>
        ))}
        <polygon
          points={`${LINE_LEFT},${LAST_Y} ${linePoints} ${LINE_RIGHT},${LAST_Y}`}
          className="fill-theme-maroon/10"
          stroke="none"
        />
        <polyline
          points={linePoints}
          className="fill-none stroke-theme-maroon"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-1.5 flex justify-between px-9 text-xs text-theme-gray">
        {labelIndices.map((index) => (
          <span key={`${points[index].t}`}>
            {timeFormat.format(points[index].t)}
          </span>
        ))}
      </div>
      <p className="mt-1 text-right text-xs text-theme-gray">{unit}</p>
    </article>
  );
}

function roundLabel(value: number): string {
  if (value >= 100) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}
