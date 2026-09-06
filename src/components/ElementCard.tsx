import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { bySymbol, type ElementData } from '@/data/elements';
import { outerPopulation, presentQuantity, type Presentation } from '@/data/element-properties';
import { MAX_ATOMS, useBench } from '@/state/store';
import BohrModel from './BohrModel';
import LatticeView from './LatticeView';
import PropertyStatus from './PropertyStatus';
import { catColor, addElementToBench } from '@/lib/element-library';

function Row({ label, presentation }: { label: string; presentation: Presentation }) {
  return (
    <div
      data-property-row={label}
      className="flex items-start justify-between gap-3 border-b border-white/5 py-2.5 last:border-0"
    >
      <dt className="text-[11px] leading-relaxed text-[#929d95]">{label}</dt>
      <dd className="max-w-[62%] text-right font-mono text-[11px] leading-relaxed text-[#d7ded5]">
        <span>{presentation.text}</span>
        <PropertyStatus presentation={presentation} />
      </dd>
    </div>
  );
}

export function ElementInspector({
  el,
  tab,
  onTab,
  onClose,
  atCapacity,
  onAdd,
}: {
  el: ElementData;
  tab: 'overview' | 'structure';
  onTab: (tab: 'overview' | 'structure') => void;
  onClose: () => void;
  atCapacity: boolean;
  onAdd: () => void;
}) {
  const color = catColor(el.cat);
  const cpk = el.cpk ? `#${el.cpk}` : '#a9bd85';
  const mass = presentQuantity(el.mass);
  const phase = presentQuantity(el.phase);
  const densityUnit = phase.shownValue === 'Gas' ? 'g/L' : 'g/cm³';
  const density = presentQuantity(el.density, { digits: 4, unitSuffix: densityUnit });
  const melt = presentQuantity(el.melt, { digits: 2 });
  const boil = presentQuantity(el.boil, { digits: 2 });
  const eneg = presentQuantity(el.eneg, { digits: 2 });
  const ie1 = presentQuantity(el.ie1, { digits: 1 });
  const eaff = presentQuantity(el.eaff, { digits: 1 });
  const config = presentQuantity(el.config);
  const shellPop = presentQuantity(el.shells);
  const outer = presentQuantity(outerPopulation(el.shells));
  const lattice = presentQuantity(el.lattice);
  const appear = presentQuantity(el.appear);
  const disc = presentQuantity(el.disc);
  const phaseValue = typeof phase.shownValue === 'string' ? phase.shownValue : null;

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
            onClick={onClose}
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
              <span data-property="mass">
                {mass.text}
                <PropertyStatus presentation={mass} />
              </span>
              {phaseValue ? (
                <span data-property="phase">
                  {' · '}
                  {phaseValue.toLowerCase()}
                  <PropertyStatus presentation={phase} />
                </span>
              ) : null}
            </p>
          </div>
        </div>
      </header>

      <div
        className="mx-5 mb-4 flex shrink-0 rounded-lg border border-white/5 bg-black/15 p-1"
        aria-label="Element detail view"
      >
        {(['overview', 'structure'] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => onTab(id)}
            className={`h-8 flex-1 rounded-md text-[11px] transition-colors ${tab === id ? 'bg-white/[0.07] text-[#e1e9db]' : 'text-[#8e998f] hover:text-white'}`}
          >
            {id === 'overview' ? 'Overview' : 'Atomic structure'}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {tab === 'overview' ? (
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
              <Row label="Atomic mass" presentation={mass} />
              <Row label="Electronegativity" presentation={eneg} />
              <Row label="1st ionization energy" presentation={ie1} />
              <Row label="Electron affinity" presentation={eaff} />
              <Row label="Density" presentation={density} />
              <Row label="Melting point" presentation={melt} />
              <Row label="Boiling point" presentation={boil} />
              <Row
                label="Block"
                presentation={{
                  appearance: 'unverified',
                  badge: 'Unverified',
                  text: el.block,
                  shownValue: el.block,
                }}
              />
            </dl>
            {(appear.shownValue || disc.shownValue) && (
              <details className="mt-4 rounded-lg border border-white/[0.06] px-3 py-2.5">
                <summary className="cursor-pointer text-[11px] text-[#aab5a8]">
                  Appearance & discovery
                </summary>
                <dl className="mt-2">
                  {appear.shownValue ? <Row label="Appearance" presentation={appear} /> : null}
                  {disc.shownValue ? <Row label="Discovery credit" presentation={disc} /> : null}
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
              <BohrModel name={el.name} symbol={el.sym} color={cpk} shells={shellPop} size={164} />
            </div>
            <p className="mt-3 break-words text-center font-mono text-[10px] leading-relaxed text-[#b1beaa]">
              {config.text}
            </p>
            <p className="mt-1 text-center">
              <PropertyStatus presentation={config} />
            </p>
            <dl className="mt-2">
              <Row label="Shell population" presentation={shellPop} />
              <Row label="Outer-shell electrons" presentation={outer} />
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
            {phaseValue && phaseValue !== 'Solid' && (
              <p className="mb-3 rounded-lg bg-white/[0.035] px-3 py-2.5 text-[10px] leading-relaxed text-[#a8b3a3]">
                Reference phase: {phaseValue.toLowerCase()}. The structure below describes a solid
                form under different temperature or pressure conditions.
                <PropertyStatus presentation={phase} />
              </p>
            )}
            {el.latkey ? (
              <>
                <div
                  className="h-[160px] overflow-hidden rounded-xl border border-white/[0.05]"
                  role="img"
                  aria-label={`${el.name}: ${lattice.text} structure schematic`}
                >
                  <LatticeView kind={el.latkey} color={cpk} />
                </div>
                <p className="mt-2 text-center text-[11px] text-[#b1beaa]">{lattice.text}</p>
                <p className="mt-1.5 text-center text-[9px] leading-relaxed text-[#89958a]">
                  Drag to rotate · illustrative unit cell · not to scale
                  <PropertyStatus presentation={lattice} />
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-white/[0.06] px-3 py-4 text-center text-[11px] leading-relaxed text-[#a8b3a3]">
                {lattice.shownValue ?? 'Solid structure is not catalogued.'}
                {lattice.shownValue ? (
                  <span className="mt-1 block text-[10px] text-[#89958a]">
                    No 3D preview for this structure.
                  </span>
                ) : null}
                <PropertyStatus presentation={lattice} />
              </div>
            )}
          </>
        )}
        <p className="mt-5 border-t border-white/5 pt-3 text-[9px] leading-relaxed text-[#7f8b80]">
          Each property has an explicit scientific status. Measured/evaluated values cite a source.
          Unverified values are inherited and are not reference measurements. Unsupported numbers
          are withheld rather than guessed.
        </p>
      </div>

      <footer className="shrink-0 border-t border-white/[0.07] p-4">
        <button
          type="button"
          onClick={onAdd}
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

export default function ElementCard() {
  const sym = useBench((s) => s.cardSym);
  const setCard = useBench((s) => s.setCard);
  const atCapacity = useBench((s) => s.atoms.length >= MAX_ATOMS);
  const [tab, setTab] = useState<'overview' | 'structure'>('overview');
  if (!sym) return null;
  const el = bySymbol[sym];
  if (!el) return null;
  return (
    <ElementInspector
      el={el}
      tab={tab}
      onTab={setTab}
      onClose={() => setCard(null)}
      atCapacity={atCapacity}
      onAdd={() => addElementToBench(el.sym)}
    />
  );
}
