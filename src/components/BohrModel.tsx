import type { ElementData } from '@/data/elements';

/** A schematic shell population diagram, not physical electron trajectories. */
export default function BohrModel({ el, size = 150 }: { el: ElementData; size?: number }) {
  const shells = el.shells;
  const c = size / 2;
  const maxR = c - 8;
  const ringGap = maxR / Math.max(1, shells.length);
  const cpk = el.cpk ? `#${el.cpk}` : '#e879f9';

  const rings = shells.map((count, i) => {
    const r = ringGap * (i + 1);
    const dots = Array.from({ length: count }, (_, k) => {
      const a = (k / count) * Math.PI * 2;
      return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
    });
    return { r, dots, dur: 12 + i * 7 };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none" role="img" aria-label={`${el.name} electron-shell schematic: ${shells.join(', ')} electrons in successive shells`}>
      {/* nucleus */}
      <circle cx={c} cy={c} r={Math.max(11, ringGap * 0.52)} fill={cpk} fillOpacity={0.22} stroke={cpk} strokeWidth={1.2} />
      <text
        x={c}
        y={c + 3.5}
        textAnchor="middle"
        fontSize={11}
        fontFamily="'Fira Code', monospace"
        fill="#e8eaee"
      >
        {el.sym}
      </text>
      {rings.map((ring, i) => (
        <g key={i}>
          <circle cx={c} cy={c} r={ring.r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={0.8} />
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
