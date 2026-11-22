/*
 * LR-20417 weekly data use (GB), synthetic pilot dataset (frontend/data/bundle-activity.json).
 * Weeks 1–8 are the customer's own baseline; weeks 9–12 are the current window.
 */
const WEEKS = [1.56, 1.43, 1.42, 1.48, 1.43, 1.62, 1.43, 1.63, 0.46, 0.44, 0.48, 0.45];
const BASELINE_WEEKS = 8;

const WIDTH = 640;
const HEIGHT = 240;
const LEFT = 14;
const RIGHT = 12;
const TOP = 18;
const BOTTOM = 208;
const MAX_GB = 2;

const y = (gb: number) => BOTTOM - (gb / MAX_GB) * (BOTTOM - TOP);
const slot = (WIDTH - LEFT - RIGHT) / WEEKS.length;
const barWidth = slot * 0.62;

export function UsageChart() {
  const baselineAverage = WEEKS.slice(0, BASELINE_WEEKS).reduce((sum, value) => sum + value, 0) / BASELINE_WEEKS;

  return (
    <figure className="lp-chart">
      <div className="lp-chart-head">
        <span>GB per week</span>
        <span className="lp-chart-window">Last 4 weeks</span>
      </div>
      <svg
        viewBox={"0 0 " + WIDTH + " " + HEIGHT}
        role="img"
        aria-label="Weekly data use for LR-20417: about 1.5 GB a week for eight weeks, then about 0.45 GB a week for the last four."
      >
        {WEEKS.map((gb, index) => (
          <rect
            key={index}
            x={LEFT + slot * index + (slot - barWidth) / 2}
            y={y(gb)}
            width={barWidth}
            height={BOTTOM - y(gb)}
            className={index < BASELINE_WEEKS ? "lp-bar-base" : "lp-bar-now"}
          />
        ))}
        <line
          x1={LEFT}
          x2={WIDTH - RIGHT}
          y1={y(baselineAverage)}
          y2={y(baselineAverage)}
          className="lp-chart-avg"
        />
      </svg>
      <figcaption>
        <span>LR-20417, weekly data use. Dashed line: their own 8-week average.</span>
        <span>Synthetic data</span>
      </figcaption>
    </figure>
  );
}
