import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { bySymbol } from '@/data/elements';
import { MAX_ATOMS, useBench } from '@/state/store';
import BohrModel from './BohrModel';
import LatticeView from './LatticeView';
import { catColor, addElementToBench } from '@/lib/element-library';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 py-2.5 last:border-0">
      <dt className="text-[11px] leading-relaxed text-[#929d95]">{label}</dt>
      <dd className="max-w-[58%] text-right font-mono text-[11px] leading-relaxed text-[#d7ded5]">
        {value}
      </dd>
    </div>
  );
}

const fmt = (value: number | null, unit = '', digits = 2) =>
  value == null ? 'Not available' : `${Number(value.toFixed(digits))}${unit}`;

export default function ElementCard() {
  const sym = useBench((s) => s.cardSym);
  const setCard = useBench((s) => s.setCard);
  const atCapacity = useBench((s) => s.atoms.length >= MAX_ATOMS);
  const [view, setView] = useState<'overview' | 'structure'>('overview');
  if (!sym) return null;
  const el = bySymbol[sym];
  if (!el) return null;

  const color = catColor(el.cat);
  const cpk = el.cpk ? `#${el.cpk}` : '#a9bd85';
  const outerShell = el.shells.length ? el.shells[el.shells.length - 1] : null;
  const uncertain = el.n >= 104 || el.cat.startsWith('unknown');

  return (
    <section
      className="element-inspector flex h-full min-h-0 flex-col text-[#edf0e9]"
      aria-label={`${el.name} element inspector`}
    >
      <header className="shrink-0 px-5 pb-5 pt-5">
        <div className="mb-5 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8e998f]">
            Element inspector
          </p>
          <button
            type="button"
            onClick={() => setCard(null)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#929d95] hover:bg-white/5 hover:text-white"
            aria-label="Close element inspector"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex items-center gap-3.5">
          <div
            className="flex h-[66px] w-[60px] shrink-0 flex-col items-center justify-center rounded-lg"
            style={{ background: `${color}12`, border: `1px solid ${color}40`, color }}
          >
            <span className="font-mono text-[10px] leading-none">{el.n}</span>
            <span className="mt-1 text-[27px] font-medium leading-none">{el.sym}</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-medium tracking-tight">{el.name}</h2>
            <p className="mt-1 text-[10px] leading-relaxed" style={{ color }}>
              {el.cat}
            </p>
            <p className="mt-1 font-mono text-[10px] text-[#929d95]">
              {el.mass} u · {el.phase}
              {uncertain ? ' (reference)' : ''}
            </p>
          </div>
        </div>
      </header>

      <div
        className="mx-5 mb-4 flex shrink-0 rounded-lg border border-white/5 bg-black/15 p-1"
        aria-label="Element detail view"
      >
        {(['overview', 'structure'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={view === tab}
            onClick={() => setView(tab)}
            className={`h-8 flex-1 rounded-md text-[11px] transition-colors ${view === tab ? 'bg-white/[0.07] text-[#e1e9db]' : 'text-[#8e998f] hover:text-white'}`}
          >
            {tab === 'overview' ? 'Overview' : 'Atomic structure'}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {view === 'overview' ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['NUMBER', String(el.n)],
                ['PERIOD', String(el.period)],
                ['GROUP', el.group == null ? '—' : String(el.group)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-white/[0.06] px-2 py-3 text-center"
                >
                  <p className="font-mono text-[8px] tracking-wider text-[#8e998f]">{label}</p>
                  <p className="mt-1.5 text-base text-[#dce6d6]">{value}</p>
                </div>
              ))}
            </div>
            <p className="mb-1 mt-6 font-mono text-[9px] uppercase tracking-[0.15em] text-[#a1aa9d]">
              Physical & atomic properties
            </p>
            <dl>
              <Row label="Atomic mass" value={`${el.mass} u`} />
              <Row
                label="Electronegativity"
                value={fmt(el.eneg) + (el.eneg == null ? '' : ' (Pauling)')}
              />
              <Row label="1st ionization energy" value={fmt(el.ie1, ' kJ/mol', 1)} />
              <Row label="Electron affinity" value={fmt(el.eaff, ' kJ/mol', 1)} />
              <Row
                label="Density"
                value={fmt(el.density, el.phase === 'Gas' ? ' g/L' : ' g/cm³', 4)}
              />
              <Row label="Melting point" value={fmt(el.melt, ' K')} />
              <Row label="Boiling point" value={fmt(el.boil, ' K')} />
              <Row label="Block" value={el.block} />
            </dl>
            {(el.appear || el.disc) && (
              <details className="mt-4 rounded-lg border border-white/[0.06] px-3 py-2.5">
                <summary className="cursor-pointer text-[11px] text-[#aab5a8]">
                  Appearance & discovery
                </summary>
                <dl className="mt-2">
                  {el.appear && <Row label="Appearance" value={el.appear} />}
                  {el.disc && <Row label="Discovery credit" value={el.disc} />}
                </dl>
              </details>
            )}
          </>
        ) : (
          <>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-[#a1aa9d]">
              Electron shells
            </p>
            <div className="mt-3 flex justify-center rounded-xl border border-white/[0.05] bg-black/10 py-4">
              <BohrModel el={el} size={164} />
            </div>
            <p className="mt-3 break-words text-center font-mono text-[10px] leading-relaxed text-[#b1beaa]">
              {el.config}
            </p>
            <dl className="mt-2">
              <Row label="Shell population" value={el.shells.join(' · ')} />
              <Row
                label="Outer-shell electrons"
                value={outerShell == null ? 'Not available' : String(outerShell)}
              />
            </dl>
            <p className="mt-2 text-[10px] leading-relaxed text-[#89958a]">
              A shell schematic, not electron trajectories.
              {el.block === 'd' || el.block === 'f'
                ? ' Outer-shell count is not a complete valence-electron count for this element.'
                : ''}
            </p>

            <p className="mb-3 mt-6 font-mono text-[9px] uppercase tracking-[0.15em] text-[#a1aa9d]">
              Solid-state structure
            </p>
            {el.phase !== 'Solid' && (
              <p className="mb-3 rounded-lg bg-white/[0.035] px-3 py-2.5 text-[10px] leading-relaxed text-[#a8b3a3]">
                Reference phase: {el.phase.toLowerCase()}. The structure below describes a solid
                form under different temperature or pressure conditions.
              </p>
            )}
            {el.latkey ? (
              <>
                <div
                  className="h-[160px] overflow-hidden rounded-xl border border-white/[0.05]"
                  role="img"
                  aria-label={`${el.name}: ${el.lattice} structure schematic`}
                >
                  <LatticeView kind={el.latkey} color={cpk} />
                </div>
                <p className="mt-2 text-center text-[11px] text-[#b1beaa]">{el.lattice}</p>
                <p className="mt-1.5 text-center text-[9px] leading-relaxed text-[#89958a]">
                  Drag to rotate · illustrative unit cell · not to scale
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-white/[0.06] px-3 py-4 text-center text-[11px] leading-relaxed text-[#a8b3a3]">
                {el.lattice ?? 'Solid structure is not catalogued.'}
                {el.lattice ? (
                  <span className="mt-1 block text-[10px] text-[#89958a]">
                    No 3D preview for this structure.
                  </span>
                ) : null}
              </div>
            )}
          </>
        )}
        <p className="mt-5 border-t border-white/5 pt-3 text-[9px] leading-relaxed text-[#7f8b80]">
          Bundled reference data; values and discovery credits have not been independently verified.
          {uncertain
            ? ' Superheavy-element properties may be predicted or incomplete.'
            : ' Phase and material properties depend on conditions.'}
        </p>
      </div>

      <footer className="shrink-0 border-t border-white/[0.07] p-4">
        <button
          type="button"
          onClick={() => addElementToBench(el.sym)}
          disabled={atCapacity}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#d5f582] text-xs font-semibold text-[#20261a] enabled:hover:bg-[#e1f9a6] disabled:opacity-40"
        >
          <Plus size={15} />
          {atCapacity ? `${MAX_ATOMS} atom limit reached` : `Add ${el.sym} to canvas`}
        </button>
      </footer>
    </section>
  );
}
