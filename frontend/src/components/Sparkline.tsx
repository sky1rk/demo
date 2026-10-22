import type { VitalSeriesPoint } from "../lib/vitals.ts";

/**
 * Minimal trend line for the metric cards — a 32×16 polyline like the
 * legacy monitor's spark, normalised across the series' range (with padding
 * so the line never clips). Needs at least two points to draw, otherwise
 * it renders nothing.
 */
export default function Sparkline({ points }: { points: VitalSeriesPoint[] }) {
  if (points.length < 2) return null;

  const values = points.map((point) => point.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 30 + 1;
      const y = 14 - ((point.v - min) / span) * 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox="0 0 32 16"
      className="h-4 w-8 shrink-0"
      role="img"
      aria-label="Recent readings sparkline"
    >
      <polyline
        points={coords}
        className="fill-none stroke-theme-maroon"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
