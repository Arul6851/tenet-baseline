import { useId, type CSSProperties } from "react";

export type HealthMetric = "architecture" | "intent";

export interface HealthChartPoint {
  label: string;
  architectureScore: number;
  intentScore: number;
  validatedAt: string;
}

export interface HealthChartProps {
  title: string;
  series: readonly HealthChartPoint[];
  metric: HealthMetric;
  accent?: "architecture" | "intent";
}

const chartWidth = 680;
const chartHeight = 184;
const chartPadding = {
  top: 18,
  right: 18,
  bottom: 30,
  left: 28,
};

const clampScore = (score: number): number => Math.max(0, Math.min(100, score));

const formatValidatedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

/**
 * A compact, deterministic SVG health trend. The caller supplies all series
 * data; this component intentionally has no fallback points or mock values.
 */
export function HealthChart({
  title,
  series,
  metric,
  accent = metric,
}: HealthChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const values = series.map((point) =>
    clampScore(
      metric === "architecture" ? point.architectureScore : point.intentScore,
    ),
  );

  if (series.length === 0) {
    return (
      <section
        className="health-chart health-chart--empty"
        aria-labelledby={titleId}
      >
        <div className="health-chart__header">
          <h3 id={titleId}>{title}</h3>
        </div>
        <p>No persisted health snapshots are available yet.</p>
      </section>
    );
  }

  const innerWidth = chartWidth - chartPadding.left - chartPadding.right;
  const innerHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const lowestScore = Math.min(...values);
  // Keep a 0–100 score meaning while giving real, small health changes enough
  // vertical room to be legible in a compact control-plane chart.
  const lowerBound = Math.max(0, Math.floor((lowestScore - 8) / 5) * 5);
  const upperBound = 100;
  const range = Math.max(1, upperBound - lowerBound);
  const xFor = (index: number) =>
    chartPadding.left +
    (series.length === 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
  const yFor = (value: number) =>
    chartPadding.top + ((upperBound - value) / range) * innerHeight;
  const coordinates = values.map((value, index) => ({
    value,
    x: xFor(index),
    y: yFor(value),
  }));
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${coordinates[coordinates.length - 1]?.x ?? chartPadding.left} ${chartPadding.top + innerHeight} L ${coordinates[0]?.x ?? chartPadding.left} ${chartPadding.top + innerHeight} Z`;
  const latestValue = values[values.length - 1] ?? 0;
  const metricLabel = metric === "architecture" ? "Architecture" : "Intent";
  const labelStep = Math.max(1, Math.ceil(series.length / 4));

  return (
    <section
      className={`health-chart health-chart--${accent}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="health-chart__header">
        <div>
          <p className="eyebrow">Persisted history</p>
          <h3 id={titleId}>{title}</h3>
        </div>
        <output className="health-chart__latest" aria-label={`Latest ${metricLabel} Health score`}>
          {latestValue}
          <span>/100</span>
        </output>
      </div>

      <p id={descriptionId} className="sr-only">
        {metricLabel} Health across {series.length} persisted validation run
        {series.length === 1 ? "" : "s"}. Each point includes a keyboard-focusable
        label with its score and validation time.
      </p>

      <div className="health-chart__canvas">
        <svg
          className="health-chart__svg"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
          aria-labelledby={titleId}
        >
          <defs>
            <linearGradient id={`${titleId.replace(/[^a-zA-Z0-9_-]/g, "")}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className="health-chart__fill-start" />
              <stop offset="100%" className="health-chart__fill-end" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((fraction) => {
            const y = chartPadding.top + innerHeight * fraction;
            const tickValue = Math.round(upperBound - range * fraction);
            return (
              <g key={fraction} className="health-chart__grid-line">
                <line
                  x1={chartPadding.left}
                  y1={y}
                  x2={chartWidth - chartPadding.right}
                  y2={y}
                />
                <text x={4} y={y + 4} aria-hidden="true">
                  {tickValue}
                </text>
              </g>
            );
          })}
          <path
            className="health-chart__area"
            d={areaPath}
            fill={`url(#${titleId.replace(/[^a-zA-Z0-9_-]/g, "")}-fill)`}
          />
          <path
            className="health-chart__line"
            d={linePath}
            fill="none"
            pathLength={1}
          />
          {coordinates.map((coordinate, index) => {
            const point = series[index];
            if (!point) {
              return null;
            }
            const accessibleLabel = `${point.label}: ${metricLabel} Health ${coordinate.value} out of 100, validated ${formatValidatedAt(point.validatedAt)}`;
            return (
              <g
                className="health-chart__point-group"
                key={`${point.label}-${point.validatedAt}-${index}`}
                style={{ "--motion-delay": `${index * 85}ms` } as CSSProperties}
              >
                <circle
                  className="health-chart__point-hit-area"
                  cx={coordinate.x}
                  cy={coordinate.y}
                  r="12"
                  tabIndex={0}
                  aria-label={accessibleLabel}
                >
                  <title>{accessibleLabel}</title>
                </circle>
                <circle
                  className="health-chart__point"
                  cx={coordinate.x}
                  cy={coordinate.y}
                  r="4.5"
                  aria-hidden="true"
                />
                {(index % labelStep === 0 || index === series.length - 1) && (
                  <text
                    className="health-chart__x-label"
                    x={coordinate.x}
                    y={chartHeight - 7}
                    textAnchor={
                      index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"
                    }
                    aria-hidden="true"
                  >
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
