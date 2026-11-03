const W = 340;
const H = 132;
const PAD = { top: 14, right: 12, bottom: 18, left: 12 };

type Point = { label: string; value: number };

function scale(values: number[]) {
  const max = Math.max(...values) * 1.12;
  const inner = H - PAD.top - PAD.bottom;
  const span = W - PAD.left - PAD.right;
  return {
    x: (i: number, n: number) => PAD.left + (n === 1 ? span / 2 : (i / (n - 1)) * span),
    y: (v: number) => PAD.top + inner - (v / max) * inner,
    max,
  };
}

/**
 * Baseline sparkline: the customer's own 12 weekly bundle volumes, their
 * normal range as a grey band, the current point in orange.
 */
export function BaselineSparkline({
  weeks,
  bandLow,
  bandHigh,
  splitAt,
  changePct,
}: {
  weeks: { week_start: string; gb: number }[];
  bandLow: number;
  bandHigh: number;
  splitAt: number;
  changePct: number;
}) {
  const values = weeks.map((w) => w.gb);
  const { x, y } = scale([...values, bandHigh]);
  const line = weeks.map((w, i) => `${x(i, weeks.length)},${y(w.gb)}`).join(" ");
  const last = weeks.length - 1;
  const splitX = x(splitAt - 0.5, weeks.length);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weekly bundle volume, ${changePct}% against baseline`}>
      <rect
        x={PAD.left}
        y={y(bandHigh)}
        width={W - PAD.left - PAD.right}
        height={Math.max(2, y(bandLow) - y(bandHigh))}
        fill="#f0f0f0"
      />
      <line x1={splitX} y1={PAD.top} x2={splitX} y2={H - PAD.bottom} stroke="#999999" strokeDasharray="3 3" />
      <polyline points={line} fill="none" stroke="#000000" strokeWidth={2} />
      <circle cx={x(last, weeks.length)} cy={y(values[last])} r={4.5} fill="#ff7900" stroke="#000000" strokeWidth={1} />
      <text x={splitX + 4} y={PAD.top + 8} fontSize="9" fill="#595959" fontFamily="inherit">
        last 4 weeks
      </text>
      <text x={PAD.left} y={H - 5} fontSize="9" fill="#595959" fontFamily="inherit">
        {weeks[0].week_start.slice(5)}
      </text>
      <text x={W - PAD.right} y={H - 5} fontSize="9" fill="#595959" textAnchor="end" fontFamily="inherit">
        {weeks[last].week_start.slice(5)}
      </text>
    </svg>
  );
}

/** Pre / post chart for the Measure screen. */
export function PrePostChart({
  pre,
  post,
  bandLow,
  bandHigh,
  appliedLabel,
}: {
  pre: Point[];
  post: Point[];
  bandLow: number;
  bandHigh: number;
  appliedLabel: string;
}) {
  const all = [...pre, ...post].map((p) => p.value);
  const { x, y } = scale([...all, bandHigh]);
  const n = pre.length + post.length;
  const path = (pts: Point[], offset: number) =>
    pts.map((p, i) => `${x(i + offset, n)},${y(p.value)}`).join(" ");
  const splitX = x(pre.length - 0.5, n);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Usage before and after the action">
      <rect
        x={PAD.left}
        y={y(bandHigh)}
        width={W - PAD.left - PAD.right}
        height={Math.max(2, y(bandLow) - y(bandHigh))}
        fill="#f0f0f0"
      />
      <line x1={splitX} y1={PAD.top} x2={splitX} y2={H - PAD.bottom} stroke="#000000" strokeWidth={1} />
      <polyline points={path(pre, 0)} fill="none" stroke="#000000" strokeWidth={2} />
      <polyline points={path(post, pre.length)} fill="none" stroke="#ff7900" strokeWidth={2} strokeDasharray="4 3" />
      <text x={splitX + 4} y={PAD.top + 8} fontSize="9" fill="#000000" fontFamily="inherit">
        {appliedLabel}
      </text>
      <text x={PAD.left} y={H - 5} fontSize="9" fill="#595959" fontFamily="inherit">
        before
      </text>
      <text x={W - PAD.right} y={H - 5} fontSize="9" fill="#595959" textAnchor="end" fontFamily="inherit">
        after
      </text>
    </svg>
  );
}

export function StackedBand({
  segments,
}: {
  segments: { key: string; label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="stacked">
        {segments.map((s) => (
          <span
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.value.toLocaleString()}`}
          />
        ))}
      </div>
      <div className="legend">
        {segments.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label} <span className="num">{s.value.toLocaleString()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
