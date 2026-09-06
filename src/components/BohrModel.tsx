import type { Presentation } from '@/data/element-properties';

/** A schematic shell population diagram, not physical electron trajectories. */
export default function BohrModel({
  name,
  symbol,
  color,
  shells,
  size = 150,
}: {
  name: string;
  symbol: string;
  color: string;
  shells: Presentation;
  size?: number;
}) {
  const counts = Array.isArray(shells.shownValue) ? shells.shownValue : [];
  const c = size / 2;
  const maxR = c - 8;
  const ringGap = maxR / Math.max(1, counts.length);
  const rings = counts.map((count, i) => {
    const r = ringGap * (i + 1);
    const dots = Array.from({ length: count }, (_, k) => {
      const a = (k / count) * Math.PI * 2;
      return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
    });
    return { r, dots, dur: 12 + i * 7 };
  });
  const label =
    counts.length > 0
      ? `${name} electron-shell schematic: ${counts.join(', ')} electrons in successive shells`
      : `${name} electron-shell schematic unavailable`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="select-none"
      role="img"
      aria-label={label}
    >
      <circle
        cx={c}
        cy={c}
        r={Math.max(11, ringGap * 0.52)}
        fill={color}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={1.2}
      />
      <text
        x={c}
        y={c + 3.5}
        textAnchor="middle"
        fontSize={11}
        fontFamily="'Fira Code', monospace"
        fill="#e8eaee"
      >
        {symbol}
      </text>
      {rings.map((ring, i) => (
        <g key={i}>
          <circle
            cx={c}
            cy={c}
            r={ring.r}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={0.8}
          />
          <g
            className="shell-ring"
            style={{
              transformOrigin: `${c}px ${c}px`,
              animationDuration: `${ring.dur}s`,
              animationDirection: i % 2 ? 'reverse' : 'normal',
            }}
          >
            {ring.dots.map((d, k) => (
              <circle key={k} cx={d.x} cy={d.y} r={2.1} fill="#d5f582" fillOpacity={0.95} />
            ))}
          </g>
        </g>
      ))}
    </svg>
  );
}
