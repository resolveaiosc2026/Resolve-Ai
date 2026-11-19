/*
 * LR-20417 weekly data use (GB), synthetic pilot dataset (frontend/data/bundle-activity.json).
 * Weeks 1–8 are the customer's own baseline, weeks 9–12 the current window.
 */
const WEEKS = [1.56, 1.43, 1.42, 1.48, 1.43, 1.62, 1.43, 1.63, 0.46, 0.44, 0.48, 0.45];
const BASELINE_WEEKS = 8;

const W = 640;
const H = 340;
const LEFT = 44;
const RIGHT = 12;
const TOP = 34;
const BOTTOM = 290;
const MAX_GB = 2;

const y = (gb: number) => BOTTOM - (gb / MAX_GB) * (BOTTOM - TOP);
const slot = (W - LEFT - RIGHT) / WEEKS.length;
const barW = slot * 0.62;

export function UsageChart() {
  const baselineAvg = WEEKS.slice(0, BASELINE_WEEKS).reduce((s, v) => s + v, 0) / BASELINE_WEEKS;
  const currentAvg = WEEKS.slice(BASELINE_WEEKS).reduce((s, v) => s + v, 0) / (WEEKS.length - BASELINE_WEEKS);
  const splitX = LEFT + slot * BASELINE_WEEKS;

  return (
    <figure className="lp-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Weekly data use for LR-20417: about 1.5 GB a week for eight weeks, then about 0.45 GB a week for the last four."
      >
        {[0, 0.5, 1, 1.5, 2].map((gb) => (
          <g key={gb}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(gb)} y2={y(gb)} className="lp-chart-grid" />
            <text x={LEFT - 8} y={y(gb) + 4} textAnchor="end" className="lp-chart-axis">
              {gb === 0 ? "0" : gb.toFixed(1)}
            </text>
          </g>
        ))}

        <rect x={splitX} y={TOP - 22} width={W - RIGHT - splitX} height={BOTTOM - TOP + 22} className="lp-chart-window" />

        {WEEKS.map((gb, i) => (
          <rect
            key={i}
            x={LEFT + slot * i + (slot - barW) / 2}
            y={y(gb)}
            width={barW}
            height={BOTTOM - y(gb)}
            className={i < BASELINE_WEEKS ? "lp-bar-base" : "lp-bar-now"}
          />
        ))}

        <line x1={LEFT} x2={splitX} y1={y(baselineAvg)} y2={y(baselineAvg)} className="lp-chart-avg" />
        <line x1={splitX} x2={W - RIGHT} y1={y(baselineAvg)} y2={y(baselineAvg)} className="lp-chart-avg lp-chart-avg-ghost" />

        <text x={LEFT} y={TOP - 10} className="lp-chart-label">
          GB per week
        </text>
        <text x={splitX + 10} y={TOP - 6} className="lp-chart-label lp-chart-label-strong">
          Last 4 weeks
        </text>
        <text x={splitX + 10} y={y(currentAvg) - 40} className="lp-chart-drop">
          −69%
        </text>

        <text x={LEFT} y={BOTTOM + 22} className="lp-chart-axis">
          12 Aug
        </text>
        <text x={splitX} y={BOTTOM + 22} textAnchor="middle" className="lp-chart-axis">
          7 Oct
        </text>
        <text x={W - RIGHT} y={BOTTOM + 22} textAnchor="end" className="lp-chart-axis">
          28 Oct
        </text>
      </svg>
      <figcaption>
        <span>LR-20417, weekly data use. Dashed line: their own 8-week average.</span>
        <span>Synthetic data</span>
      </figcaption>
    </figure>
  );
}
