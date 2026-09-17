import { formatCompactNumber, formatShortDay } from "@/lib/format";

interface EngagementChartProps {
  series: { date: string; engagement: number; views: number }[];
  metric: "engagement" | "views";
}

/**
 * A plain CSS bar chart, matching the rest of the app: no charting library for
 * a single series of daily totals.
 */
function EngagementChart({ series, metric }: EngagementChartProps) {
  if (series.length === 0) {
    return <p className="text-sm text-muted">No readings in this range yet.</p>;
  }

  const peak = Math.max(...series.map((point) => point[metric]), 1);
  const total = series.reduce((sum, point) => sum + point[metric], 0);

  return (
    <div>
      <p className="text-2xl font-semibold tabular-nums">{formatCompactNumber(total)}</p>
      <p className="text-xs text-muted">
        total {metric} across {series.length} {series.length === 1 ? "day" : "days"}
      </p>
      <ul
        aria-label={`Daily ${metric}`}
        className="mt-4 flex h-32 items-end gap-1"
        // The list is summarised above for anyone not reading the bars.
      >
        {series.map((point) => (
          <li
            key={point.date}
            className="flex-1 rounded-t bg-primary/70"
            style={{ height: `${Math.max(2, (point[metric] / peak) * 100)}%` }}
            title={`${formatShortDay(point.date)}: ${point[metric].toLocaleString()} ${metric}`}
          />
        ))}
      </ul>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{formatShortDay(series[0].date)}</span>
        <span>{formatShortDay(series[series.length - 1].date)}</span>
      </div>
    </div>
  );
}

export default EngagementChart;
