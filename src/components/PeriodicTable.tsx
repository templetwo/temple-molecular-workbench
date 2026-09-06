import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Plus, Search, X } from 'lucide-react';
import { ELEMENTS, bySymbol, type ElementData } from '@/data/elements';
import { presentQuantity } from '@/data/element-properties';
import { MAX_ATOMS, useBench } from '@/state/store';
import { CAT_COLORS, catColor, addElementToBench } from '@/lib/element-library';
import PropertyStatus from '@/components/PropertyStatus';

function Cell({
  el,
  dim,
  selected,
  onSelect,
}: {
  el: ElementData;
  dim: boolean;
  selected: boolean;
  onSelect: (sym: string) => void;
}) {
  const color = catColor(el.cat);
  return (
    <button
      type="button"
      disabled={dim}
      onClick={() => onSelect(el.sym)}
      aria-label={`${el.name}, ${el.sym}, atomic number ${el.n}`}
      aria-pressed={selected}
      className="relative flex h-12 w-11 flex-col items-center justify-center rounded-md transition-colors enabled:hover:bg-white/10 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d5f582] disabled:cursor-default"
      style={{
        gridColumn: el.x,
        gridRow: el.y,
        background: selected ? `${color}2b` : `${color}0e`,
        border: `1px solid ${selected ? color : `${color}40`}`,
        opacity: dim ? 0.15 : 1,
        color,
      }}
      title={`${el.name} · ${el.cat}`}
    >
      <span className="font-mono text-[9px] leading-none opacity-70">{el.n}</span>
      <span className="mt-0.5 text-base font-semibold leading-tight">{el.sym}</span>
    </button>
  );
}

export default function PeriodicTable() {
  const open = useBench((s) => s.tableOpen);
  const toggleTable = useBench((s) => s.toggleTable);
  const setCard = useBench((s) => s.setCard);
  const atCapacity = useBench((s) => s.atoms.length >= MAX_ATOMS);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedSym, setSelectedSym] = useState('C');
  const opener = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const query = q.trim().toLowerCase();
  const match = (el: ElementData) =>
    (category === 'all' ||
      el.cat === category ||
      (category === 'unknown' && el.cat.startsWith('unknown'))) &&
    (!query ||
      el.name.toLowerCase().includes(query) ||
      el.sym.toLowerCase().includes(query) ||
      String(el.n) === query);
  const matching = ELEMENTS.filter(match);
  const selected =
    matching.find((el) => el.sym === selectedSym) ?? matching[0] ?? bySymbol[selectedSym];
  const selectedMass = presentQuantity(selected.mass);

  function inspect() {
    setCard(selected.sym);
    toggleTable();
  }

  function addSelected() {
    if (matching.length && addElementToBench(selected.sym)) toggleTable();
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next !== open) toggleTable();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className="element-library fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-24px)] max-w-[1040px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1e20] text-[#edf0e9] shadow-2xl focus:outline-none"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            opener.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            searchInput.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-7">
            <div>
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#d5f582]">
                The building blocks
              </p>
              <Dialog.Title className="text-2xl font-medium tracking-tight">
                Element library
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-xs leading-relaxed text-[#a2aaa6]">
                Explore all 118 elements. Select one to inspect its properties or add an atom.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-[#a2aaa6] hover:bg-white/5 hover:text-white"
              aria-label="Close element library"
            >
              <X size={17} />
            </Dialog.Close>
          </header>

          <div className="flex shrink-0 flex-wrap items-center gap-3 px-5 pt-5 sm:px-7">
            <label className="relative min-w-[180px] flex-1">
              <span className="sr-only">Search elements by name, symbol, or atomic number</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8c9690]"
                size={15}
              />
              <input
                ref={searchInput}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search name, symbol, or atomic number…"
                className="h-10 w-full rounded-lg border border-white/10 bg-black/15 pl-9 pr-9 text-xs outline-none placeholder:text-[#7f8984] focus:border-[#d5f582]/60"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => {
                    setQ('');
                    searchInput.current?.focus();
                  }}
                  aria-label="Clear element search"
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-[#a2aaa6]"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <label>
              <span className="sr-only">Filter element category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 max-w-[210px] rounded-lg border border-white/10 bg-[#22272a] px-3 text-xs text-[#c8cec9] outline-none focus:border-[#d5f582]/60"
              >
                <option value="all">All categories</option>
                {Object.keys(CAT_COLORS).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat[0].toUpperCase() + cat.slice(1)}
                  </option>
                ))}
                <option value="unknown">Uncertain / predicted</option>
              </select>
            </label>
            <span aria-live="polite" className="font-mono text-[10px] tabular-nums text-[#9ca69f]">
              {matching.length} / 118
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 sm:px-7">
            {matching.length === 0 && (
              <p
                role="status"
                className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#c8cec9]"
              >
                No elements match. Try a different name or clear your category filter.
              </p>
            )}
            <div
              className="overflow-x-auto pb-3"
              tabIndex={0}
              aria-label="Periodic table, scroll horizontally to view all groups"
            >
              <div
                className="mx-auto grid w-max gap-1"
                style={{
                  gridTemplateColumns: 'repeat(18, 44px)',
                  gridTemplateRows: 'repeat(10, 48px)',
                }}
              >
                <div
                  className="pointer-events-none flex flex-col justify-end pb-4 pl-4"
                  style={{ gridColumn: '3 / 13', gridRow: '1 / 4' }}
                  aria-hidden="true"
                >
                  <span className="text-5xl font-light tracking-tight text-[#d5f582]">
                    {selected.sym}
                  </span>
                  <span className="mt-1 text-sm text-[#dce2da]">{selected.name}</span>
                  <span className="mt-1 font-mono text-[10px] text-[#88938b]">
                    {selectedMass.text} · {selected.cat}
                    <PropertyStatus presentation={selectedMass} compact />
                  </span>
                </div>
                <div
                  className="self-center text-right font-mono text-[9px] leading-relaxed text-[#88938b]"
                  style={{ gridColumn: '1 / 3', gridRow: 9 }}
                  aria-hidden="true"
                >
                  57–71
                  <br />
                  Lanthanides
                </div>
                <div
                  className="self-center text-right font-mono text-[9px] leading-relaxed text-[#88938b]"
                  style={{ gridColumn: '1 / 3', gridRow: 10 }}
                  aria-hidden="true"
                >
                  89–103
                  <br />
                  Actinides
                </div>
                {ELEMENTS.map((el) => (
                  <Cell
                    key={el.n}
                    el={el}
                    dim={!match(el)}
                    selected={selected.sym === el.sym}
                    onSelect={setSelectedSym}
                  />
                ))}
              </div>
            </div>
            <div
              className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/5 pt-4"
              aria-label="Category legend"
            >
              {Object.entries(CAT_COLORS).map(([cat, color]) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(category === cat ? 'all' : cat)}
                  aria-pressed={category === cat}
                  className={`flex items-center gap-1.5 text-[10px] ${category === cat ? 'text-white' : 'text-[#a2aaa6]'} hover:text-white`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                  {cat}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCategory(category === 'unknown' ? 'all' : 'unknown')}
                aria-pressed={category === 'unknown'}
                className="flex items-center gap-1.5 text-[10px] text-[#a2aaa6] hover:text-white"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#939b9b]" />
                uncertain / predicted
              </button>
            </div>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-white/10 bg-black/10 px-5 py-4 sm:px-7">
            <div className="mr-auto" aria-live="polite">
              <p className="text-sm font-medium">
                {selected.name}{' '}
                <span className="ml-1 font-mono text-xs text-[#8e998f]">{selected.sym}</span>
              </p>
              <p className="mt-1 text-[10px] text-[#9ca69f]">
                Atomic number {selected.n} · {selectedMass.text}
                <PropertyStatus presentation={selectedMass} />
              </p>
            </div>
            <button
              type="button"
              onClick={inspect}
              disabled={matching.length === 0}
              className="flex h-10 items-center gap-2 rounded-lg border border-white/15 px-4 text-xs text-[#d0d7cf] enabled:hover:bg-white/5 disabled:opacity-40"
            >
              Inspect <ArrowUpRight size={14} />
            </button>
            <button
              type="button"
              onClick={addSelected}
              disabled={atCapacity || matching.length === 0}
              className="flex h-10 items-center gap-2 rounded-lg bg-[#d5f582] px-4 text-xs font-semibold text-[#20261a] enabled:hover:bg-[#e1f9a6] disabled:opacity-40"
            >
              <Plus size={15} />
              {atCapacity ? `${MAX_ATOMS} atom limit reached` : `Add ${selected.sym} to canvas`}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
