import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Atom,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  BookOpen,
  Box,
  Check,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  Focus,
  Grid2X2,
  Layers3,
  Link2,
  Menu,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  Rotate3D,
  Search,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import PeriodicTable from '@/components/PeriodicTable';
import { dropBridge } from '@/lib/dropBridge';
import { useBench, formulaOf, molarMassOf, atomColor, MAX_ATOMS, type Mode } from '@/state/store';
import { MOLECULE_PRESETS, byPresetId, type MoleculePreset } from '@/data/molecules';
import { bySymbol } from '@/data/elements';
import { presentQuantity } from '@/data/element-properties';
import PropertyStatus from '@/components/PropertyStatus';
import BondingGuide from '@/components/BondingGuide';
import ReactionLab from '@/components/ReactionLab';
import SpeciesCard from '@/components/SpeciesCard';
import UnitToggle from '@/components/UnitToggle';
import { loadUnits } from '@/lib/units';
import { speciesForPreset } from '@/data/species';
import { exportXyz, parseXyz } from '@/lib/xyz';
import { analyzeBonding, getBondingProgress } from '@/lib/bonding-guide';
import '@/components/reaction-lab.css';
import type { BenchViewMemory } from '@/components/Bench3D';
import { analyzeStructure } from '@/lib/chemistry';
import { addElementToBench } from '@/lib/element-library';
import '@/components/electron-lab.css';

const Bench3D = lazy(() => import('@/components/Bench3D'));
const ElementCard = lazy(() => import('@/components/ElementCard'));
const ElectronLab = lazy(() => import('@/components/ElectronLab'));
const MODES = [
  {
    id: 'move' as Mode,
    label: 'Move',
    key: '1',
    icon: MousePointer2,
    hint: 'Drag an atom to reshape. Drag empty space to orbit.',
  },
  {
    id: 'bond' as Mode,
    label: 'Bond',
    key: '2',
    icon: Link2,
    hint: 'Select two atoms to connect them. Click a bond in Move mode to cycle its order.',
  },
  {
    id: 'delete' as Mode,
    label: 'Erase',
    key: '3',
    icon: Trash2,
    hint: 'Select an atom or bond to remove it. Undo is always one click away.',
  },
];
function Formula({ value }: { value: string }) {
  return (
    <>
      {value
        .split(/(\d+)/)
        .map((part, i) => (/^\d+$/.test(part) ? <sub key={i}>{part}</sub> : part))}
    </>
  );
}
function MoleculeThumbnail({ preset }: { preset: MoleculePreset }) {
  const pts = preset.atoms.map((a) => ({
    x: a.pos[0] + a.pos[2] * 0.35,
    y: -a.pos[1] + a.pos[2] * 0.25,
  }));
  const minX = Math.min(...pts.map((p) => p.x)),
    maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)),
    maxY = Math.max(...pts.map((p) => p.y));
  const scale = 40 / Math.max(maxX - minX, maxY - minY, 1);
  const points = pts.map((p) => ({
    x: 30 + (p.x - (minX + maxX) / 2) * scale,
    y: 30 + (p.y - (minY + maxY) / 2) * scale,
  }));
  return (
    <svg viewBox="0 0 60 60" className="molecule-thumbnail" aria-hidden="true">
      {preset.bonds.map((b) => {
        const a = points[preset.atoms.findIndex((atom) => atom.id === b.a)],
          z = points[preset.atoms.findIndex((atom) => atom.id === b.b)];
        return a && z ? (
          <line
            key={b.id}
            x1={a.x}
            y1={a.y}
            x2={z.x}
            y2={z.y}
            stroke="currentColor"
            strokeWidth={b.order === 2 ? 2.5 : 1.5}
            opacity=".4"
          />
        ) : null;
      })}
      {preset.atoms.map((a, i) => (
        <circle
          key={a.id}
          cx={points[i].x}
          cy={points[i].y}
          r={a.sym === 'H' ? 2.6 : 4}
          fill={a.sym === 'C' ? '#99a2a4' : atomColor(a.sym)}
        />
      ))}
    </svg>
  );
}
export default function App() {
  const s = useBench();
  const [query, setQuery] = useState('');
  const [libraryTab, setLibraryTab] = useState<'molecules' | 'atoms'>('molecules');
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const [help, setHelp] = useState(false);
  const [electronLab, setElectronLab] = useState(false);
  const [reactionLab, setReactionLab] = useState(false);
  const [units, setUnits] = useState(loadUnits);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [explainedBondId, setExplainedBondId] = useState<string | null>(null);
  const [guidedPresetId, setGuidedPresetId] = useState<string | null>(null);
  const benchView = useRef<BenchViewMemory | null>(null);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const library = useRef<HTMLElement>(null);
  const preset = s.activePresetId ? byPresetId[s.activePresetId] : null;
  const species = preset ? speciesForPreset(preset.id) : undefined;
  const selected = s.atoms.find((a) => a.id === s.selectedId);
  const formula = formulaOf(s.atoms);
  const analysis = analyzeStructure(s.atoms, s.bonds);
  const bonding = useMemo(() => analyzeBonding(s.atoms, s.bonds), [s.atoms, s.bonds]);
  const guideProgress = useMemo(
    () => (guidedPresetId ? getBondingProgress(guidedPresetId, s.atoms, s.bonds) : null),
    [guidedPresetId, s.atoms, s.bonds],
  );
  const guidePaused = Boolean(
    guideProgress &&
    (guideProgress.missingAtomIds.length ||
      guideProgress.extraAtomIds.length ||
      guideProgress.status === 'invalid'),
  );
  const guideStep = guidePaused
    ? null
    : (guideProgress?.wrongBonds[0] ?? guideProgress?.missingBonds[0]);
  const highlightedAtoms = useMemo(
    () => (guideStep ? [guideStep.a, guideStep.b] : []),
    [guideStep],
  );
  const molarMass = molarMassOf(s.atoms);
  const molarMassView = presentQuantity(molarMass, {
    digits: 3,
    unitSuffix: '',
  });
  const visiblePresets = MOLECULE_PRESETS.filter((p) =>
    `${p.name} ${p.formula} ${p.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const modeHint = MODES.find((m) => m.id === s.mode)?.hint;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]') ||
        help ||
        electronLab ||
        reactionLab ||
        s.tableOpen ||
        mobileLibrary
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const mode = MODES.find((m) => m.key === e.key);
      if (mode) s.setMode(mode.id);
      if (e.key.toLowerCase() === 't') s.toggleTable();
      if (e.key.toLowerCase() === 'f') s.resetView();
      if (e.key === 'Escape') {
        s.select(null);
        s.setMode('move');
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        e.preventDefault();
        s.removeAtom(s.selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, help, mobileLibrary, electronLab, reactionLab]);
  useEffect(() => {
    if (!mobileLibrary) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    library.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (useBench.getState().tableOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileLibrary(false);
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(
        library.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]') ?? [],
      ).filter((node) => node.getClientRects().length);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [mobileLibrary]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  function addElement(sym: string) {
    if (s.atoms.length >= MAX_ATOMS) {
      setNotice(`This workspace supports up to ${MAX_ATOMS} atoms.`);
      return;
    }
    if (addElementToBench(sym)) {
      s.resetView();
      setNotice(`${bySymbol[sym].name} added to your workbench`);
    } else setNotice('There is no room to add this atom.');
  }
  function download() {
    const url = URL.createObjectURL(new Blob([s.exportScene()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `temple-${preset?.id ?? 'molecule'}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Workspace exported. Import it any time to continue.');
  }
  function startGuide(id: string) {
    s.startGuidedBuild(id);
    setGuidedPresetId(id);
    setExplainedBondId(null);
    setNotice(`${byPresetId[id].name} practice atoms ready. Each connection is undoable.`);
  }
  function applyGuideStep() {
    if (!guideProgress || guidePaused) return;
    const wrong = guideProgress.wrongBonds[0];
    const missing = guideProgress.missingBonds[0];
    if (wrong) {
      if (wrong.expectedOrder === null) {
        s.removeBond(wrong.bondId);
        setExplainedBondId(null);
      } else s.setBondOrder(wrong.a, wrong.b, wrong.expectedOrder);
    } else if (missing) s.setBondOrder(missing.a, missing.b, missing.order);
  }
  return (
    <div className="app-shell">
      <a href="#workbench" className="skip-link">
        Skip to workbench
      </a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <img
              src={`${import.meta.env.BASE_URL}temple-lab-mark.svg`}
              width="34"
              height="34"
              alt=""
            />
          </span>
          <span>
            TEMPLE<span className="brand-lab"> / LAB</span>
          </span>
        </div>
        <div className="header-divider" />
        <span className="header-title">
          Molecular Workbench <span className="version-badge">01</span>
        </span>
        <div className="header-actions">
          <span className="local-status">
            <i /> Local workspace
          </span>
          <UnitToggle units={units} onChange={setUnits} />
          <Dialog.Root open={reactionLab} onOpenChange={setReactionLab}>
            <Dialog.Trigger asChild>
              <button className="electron-launch-button" aria-label="Reaction lab">
                <FlaskConical size={16} />
                <span>Reaction lab</span>
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay electron-overlay" />
              <Dialog.Content className="electron-dialog">
                <div className="electron-dialog-heading">
                  <div className="electron-dialog-brand">
                    <span className="electron-brand-icon">
                      <FlaskConical size={23} strokeWidth={1.4} />
                    </span>
                    <div>
                      <span className="eyebrow">TEMPLE LAB / BOOKKEEPING</span>
                      <Dialog.Title>Reaction lab</Dialog.Title>
                    </div>
                  </div>
                  <Dialog.Close className="icon-button" aria-label="Close reaction lab">
                    <X size={21} />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="electron-dialog-description">
                  Declare reactants and products from the library. The app conserves, balances, and
                  totals cited data. It does not predict a reaction.
                </Dialog.Description>
                <div className="reaction-dialog-units">
                  <UnitToggle units={units} onChange={setUnits} />
                </div>
                <ReactionLab units={units} />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Dialog.Root open={electronLab} onOpenChange={setElectronLab}>
            <Dialog.Trigger asChild>
              <button className="electron-launch-button" aria-label="Electron lab">
                <Atom size={16} />
                <span>Electron lab</span>
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay electron-overlay" />
              <Dialog.Content className="electron-dialog">
                <div className="electron-dialog-heading">
                  <div className="electron-dialog-brand">
                    <span className="electron-brand-icon">
                      <Atom size={23} strokeWidth={1.4} />
                    </span>
                    <div>
                      <span className="eyebrow">TEMPLE LAB / GUIDED DISCOVERY</span>
                      <Dialog.Title>Electron lab</Dialog.Title>
                    </div>
                  </div>
                  <Dialog.Close className="icon-button" aria-label="Close electron lab">
                    <X size={21} />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="electron-dialog-description">
                  From one electron to a shared bond. Explore probability, shape, and energy.
                </Dialog.Description>
                <Suspense
                  fallback={
                    <div className="electron-loading" role="status">
                      Preparing your electron lab…
                    </div>
                  }
                >
                  <ElectronLab />
                </Suspense>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <button
            className="icon-button"
            title="Import workspace"
            aria-label="Import workspace"
            onClick={() => fileInput.current?.click()}
          >
            <ArrowUpFromLine size={17} />
          </button>
          <button className="export-button" aria-label="Export JSON" onClick={download}>
            <ArrowDownToLine size={15} />
            <span>Export JSON</span>
          </button>
          <button
            className="export-button"
            aria-label="Export XYZ"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([exportXyz(s.atoms, preset?.name ?? 'Temple Lab')], {
                  type: 'chemical/x-xyz',
                }),
              );
              const link = document.createElement('a');
              link.href = url;
              link.download = `temple-${preset?.id ?? 'molecule'}.xyz`;
              link.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              setNotice('XYZ exported. Bonds are not in XYZ; import comes back as unbonded atoms.');
            }}
          >
            <ArrowDownToLine size={15} />
            <span>XYZ</span>
          </button>
          <button
            className="icon-button"
            aria-label="Workbench guide"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={18} />
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.xyz,application/json,chemical/x-xyz"
          hidden
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!file) return;
            if (file.size > 256_000) {
              setNotice('Please choose a workspace smaller than 256 KB.');
              return;
            }
            try {
              const text = await file.text();
              if (file.name.toLowerCase().endsWith('.xyz')) {
                const { atoms, bonds } = parseXyz(text);
                const wrapped = JSON.stringify({
                  kind: 'molecule-studio',
                  schemaVersion: 1,
                  units: 'angstrom',
                  atoms,
                  bonds,
                });
                const result = s.importScene(wrapped);
                if (result.ok) {
                  setGuidedPresetId(null);
                  setExplainedBondId(null);
                }
                setNotice(
                  result.ok
                    ? 'XYZ imported as unbonded atoms. Your previous workspace can be restored with Undo.'
                    : (result.error ?? 'Could not import this XYZ file.'),
                );
                return;
              }
              const result = s.importScene(text);
              if (result.ok) {
                setGuidedPresetId(null);
                setExplainedBondId(null);
              }
              setNotice(
                result.ok
                  ? 'Workspace imported. Ready to explore.'
                  : (result.error ?? 'Could not import this workspace.'),
              );
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : 'This file could not be read. Your workspace is unchanged.',
              );
            }
          }}
        />
      </header>
      <main className="workspace-layout">
        <aside
          ref={library}
          className={`library-panel ${mobileLibrary ? 'mobile-open' : ''}`}
          aria-label="Molecule library"
          role={mobileLibrary ? 'dialog' : undefined}
          aria-modal={mobileLibrary || undefined}
        >
          <div className="panel-heading">
            <div>
              <span className="eyebrow">YOUR STARTING POINT</span>
              <h2>
                The collection<span className="heading-dot">.</span>
              </h2>
            </div>
            <button
              className="icon-button mobile-close"
              aria-label="Close collection"
              onClick={() => setMobileLibrary(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div className="library-tabs">
            <button
              aria-pressed={libraryTab === 'molecules'}
              className={libraryTab === 'molecules' ? 'active' : ''}
              onClick={() => setLibraryTab('molecules')}
            >
              <Layers3 size={14} />
              Molecules
            </button>
            <button
              aria-pressed={libraryTab === 'atoms'}
              className={libraryTab === 'atoms' ? 'active' : ''}
              onClick={() => setLibraryTab('atoms')}
            >
              <Atom size={14} />
              Your atoms<span>{s.atoms.length}</span>
            </button>
          </div>
          {libraryTab === 'molecules' ? (
            <>
              <label className="search-field">
                <Search size={15} />
                <input
                  aria-label="Search molecules"
                  placeholder="Find a molecule…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span>⌕</span>
              </label>
              <div className="library-section-label">
                <span>ESSENTIAL STRUCTURES</span>
                <span>{visiblePresets.length.toString().padStart(2, '0')}</span>
              </div>
              <div className="molecule-list">
                {visiblePresets.map((p) => (
                  <button
                    key={p.id}
                    className={`molecule-card ${p.id === s.activePresetId ? 'selected' : ''}`}
                    onClick={() => {
                      s.loadPreset(p.id);
                      setGuidedPresetId(null);
                      setExplainedBondId(null);
                      setMobileLibrary(false);
                    }}
                    aria-pressed={p.id === s.activePresetId}
                  >
                    <MoleculeThumbnail preset={p} />
                    <span className="molecule-card-copy">
                      <strong>{p.name}</strong>
                      <span>
                        <Formula value={p.formula} />
                        <i />
                        {p.category}
                      </span>
                    </span>
                    <ChevronRight size={15} className="card-chevron" />
                  </button>
                ))}
                {!visiblePresets.length && (
                  <p className="empty-copy">
                    No molecules found. Try a name or formula, such as H2O.
                  </p>
                )}
              </div>
              <div className="collection-note">
                <BookOpen size={16} />
                <p>
                  Small structures.
                  <br />
                  <span>Big discoveries.</span>
                </p>
                <span className="note-number">{String(MOLECULE_PRESETS.length).padStart(2, '0')}</span>
              </div>
            </>
          ) : (
            <div className="atom-list">
              {s.atoms.map((a, i) => (
                <button
                  key={a.id}
                  className={`atom-list-item ${s.selectedId === a.id ? 'active' : ''}`}
                  onClick={() => {
                    s.setCard(null);
                    if (s.mode === 'bond') s.clickAtomBond(a.id);
                    else if (s.mode === 'delete') s.removeAtom(a.id);
                    else {
                      s.select(a.id);
                      setMobileLibrary(false);
                    }
                  }}
                >
                  <span className="element-dot" style={{ background: atomColor(a.sym) }} />
                  <strong>{a.sym}</strong>
                  <span>{bySymbol[a.sym]?.name}</span>
                  <small>{String(i + 1).padStart(2, '0')}</small>
                </button>
              ))}
              {!s.atoms.length && (
                <p className="empty-copy">Your bench is clear. Add an element below to begin.</p>
              )}
            </div>
          )}
          <div className="library-bottom">
            <div className="library-section-label">
              <span>BUILD SOMETHING NEW</span>
              <Plus size={13} />
            </div>
            <div className="quick-elements">
              {['C', 'H', 'O', 'N', 'S', 'P'].map((sym) => (
                <button
                  key={sym}
                  aria-label={`Add ${bySymbol[sym].name}`}
                  onClick={() => addElement(sym)}
                >
                  <i style={{ background: atomColor(sym) }} />
                  {sym}
                </button>
              ))}
            </div>
            <button className="periodic-trigger" onClick={s.toggleTable}>
              <Grid2X2 size={16} />
              <span>Explore all 118 elements</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </aside>
        <section
          className="workbench-panel"
          id="workbench"
          tabIndex={-1}
          aria-label="3D molecular workbench"
        >
          <div className="workbench-heading">
            <div>
              <div className="eyebrow">
                <span className="live-dot" /> INTERACTIVE MOLECULAR STUDIO
              </div>
              <h1>
                {preset?.name ?? (s.atoms.length ? 'Your creation' : 'A fresh start')}
                <span className="title-formula">
                  <Formula value={preset?.formula ?? formula} />
                </span>
              </h1>
              <p>{preset?.description ?? 'A little curiosity. A whole world of possibilities.'}</p>
            </div>
            <button
              className="icon-button mobile-library-toggle"
              aria-label="Open collection"
              onClick={() => setMobileLibrary(true)}
            >
              <Menu size={20} />
            </button>
          </div>
          <div
            className="scene-viewport"
            ref={viewport}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('text/element')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const sym = e.dataTransfer.getData('text/element');
              if (sym && viewport.current)
                dropBridge.fn?.(
                  e.clientX,
                  e.clientY,
                  viewport.current.getBoundingClientRect(),
                  sym,
                );
            }}
          >
            <Suspense
              fallback={
                <div className="scene-loading">
                  <Atom size={32} />
                  <span>Preparing your workbench…</span>
                </div>
              }
            >
              {!electronLab && (
                <Bench3D
                  highlightedAtomIds={highlightedAtoms}
                  numberedLabels={Boolean(guidedPresetId)}
                  showMeasurements={showMeasurements}
                  explainedBondId={explainedBondId}
                  viewMemoryRef={benchView}
                />
              )}
            </Suspense>
            <div className="viewport-topline">
              <span>
                <i /> LIVE 3D VIEW
              </span>
              <div className="display-toggle" aria-label="Molecular representation">
                {(
                  [
                    { id: 'ball-stick', label: 'Ball & stick' },
                    { id: 'space-fill', label: 'Space fill' },
                    { id: 'wireframe', label: 'Wireframe' },
                  ] as const
                ).map((style) => (
                  <button
                    key={style.id}
                    className={s.displayStyle === style.id ? 'active' : ''}
                    aria-pressed={s.displayStyle === style.id}
                    onClick={() => s.setDisplayStyle(style.id)}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="scene-actions">
              <button
                className="scene-action"
                aria-label="Fit molecule to view"
                title="Fit to view · F"
                onClick={s.resetView}
              >
                <Focus size={18} />
              </button>
              <button
                className={`scene-action ${s.autoRotate ? 'active' : ''}`}
                aria-label={s.autoRotate ? 'Pause rotation' : 'Rotate molecule'}
                title="Auto-rotate"
                aria-pressed={s.autoRotate}
                onClick={s.toggleAutoRotate}
              >
                {s.autoRotate ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <span />
              <button
                className={`scene-action ${s.showLabels ? 'active' : ''}`}
                aria-label="Toggle atom labels"
                title="Atom labels"
                aria-pressed={s.showLabels}
                onClick={s.toggleLabels}
              >
                <Tag size={17} />
              </button>
              <button
                className={`scene-action ${showMeasurements ? 'active' : ''}`}
                aria-label="Toggle bond length callouts"
                title="Bond lengths (from current coordinates)"
                aria-pressed={showMeasurements}
                onClick={() => setShowMeasurements((value) => !value)}
              >
                <Link2 size={17} />
              </button>
              <button
                className={`scene-action ${s.showGrid ? 'active' : ''}`}
                aria-label="Toggle reference grid"
                title="Reference grid"
                aria-pressed={s.showGrid}
                onClick={s.toggleGrid}
              >
                <Grid2X2 size={17} />
              </button>
            </div>
            {!s.atoms.length && (
              <div className="empty-bench">
                <FlaskConical size={40} strokeWidth={1} />
                <h2>What will you discover?</h2>
                <p>
                  Choose a molecule from the collection,
                  <br />
                  or start with an element.
                </p>
                <button className="primary-button" onClick={s.toggleTable}>
                  <Plus size={15} /> Add your first atom
                </button>
              </div>
            )}
            {guidedPresetId && guideStep && (
              <div className="bonding-scene-hint" aria-hidden="true">
                <span>
                  GUIDED CONNECTION ·{' '}
                  {highlightedAtoms
                    .map((id) => {
                      const index = s.atoms.findIndex((atom) => atom.id === id);
                      return `${s.atoms[index]?.sym ?? '?'}${index + 1}`;
                    })
                    .join(' ↔ ')}
                  <small>Blue rings are a drawing hint, not a calculated interaction.</small>
                </span>
              </div>
            )}
            <div className="viewport-bottomline">
              <span>
                <Rotate3D size={15} />
                Drag to orbit <i />
                Scroll to zoom
              </span>
              <span className="scene-scale">
                Å <span>MODEL COORDINATES</span>
              </span>
            </div>
          </div>
          <div className="editor-toolbar">
            <div className="mode-controls">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  onClick={() => s.setMode(m.id)}
                  aria-pressed={s.mode === m.id}
                  className={s.mode === m.id ? 'active' : ''}
                >
                  <m.icon size={15} />
                  {m.label}
                  <kbd>{m.key}</kbd>
                </button>
              ))}
            </div>
            <div className="history-controls">
              <button
                className="icon-button"
                aria-label="Undo"
                title="Undo · ⌘/Ctrl Z"
                disabled={!s.past.length}
                onClick={s.undo}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Redo"
                title="Redo · ⌘/Ctrl Shift Z"
                disabled={!s.future.length}
                onClick={s.redo}
              >
                <Redo2 size={17} />
              </button>
              <span />
              <button
                className="clear-button"
                disabled={!s.atoms.length}
                onClick={() => {
                  s.clearAll();
                  setExplainedBondId(null);
                  setNotice('Workbench cleared. Undo to restore your molecule.');
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="mode-hint" aria-live="polite">
            <span className="hint-dot" />
            {s.bondSourceId
              ? 'First atom selected. Choose a second atom to draw a bond.'
              : modeHint}
          </div>
          <div className="stats-strip">
            <div>
              <span>COMPOSITION · HILL</span>
              <strong className="formula-stat">
                <Formula value={formula || '—'} />
              </strong>
            </div>
            <div>
              <span>ATOMS</span>
              <strong>{String(s.atoms.length).padStart(2, '0')}</strong>
            </div>
            <div>
              <span>BONDS</span>
              <strong>{String(s.bonds.length).padStart(2, '0')}</strong>
            </div>
            <div>
              <span>MOLAR MASS</span>
              <strong>
                {s.atoms.length ? molarMassView.text : '—'}
                <small>g/mol</small>
                {s.atoms.length ? <PropertyStatus presentation={molarMassView} compact /> : null}
              </strong>
            </div>
          </div>
        </section>
        <aside className="inspector-panel" aria-label="Structure inspector">
          <div className="inspector-heading">
            <span className="eyebrow">A CLOSER LOOK</span>
            <div>
              <h2>{s.cardSym ? 'Element explorer' : 'Structure insights'}</h2>
              <Box size={17} />
            </div>
          </div>
          {s.cardSym ? (
            <Suspense fallback={<p className="empty-copy">Opening element explorer…</p>}>
              <ElementCard />
            </Suspense>
          ) : (
            <div className="inspector-content">
              <BondingGuide
                analysis={bonding}
                atoms={s.atoms}
                guideId={guidedPresetId}
                progress={guideProgress}
                bondSourceId={s.bondSourceId}
                onStart={startGuide}
                onStop={() => setGuidedPresetId(null)}
                onStep={applyGuideStep}
                onAtom={(id) => {
                  if (useBench.getState().mode !== 'bond') s.setMode('bond');
                  s.clickAtomBond(id);
                }}
                onReference={(id) => {
                  s.loadPreset(id);
                  setGuidedPresetId(null);
                  setExplainedBondId(null);
                  setNotice('Reference geometry loaded. Undo restores your practice drawing.');
                }}
              />
              <div className="inspector-hero">
                <span className="inspector-formula">
                  <Formula value={preset?.formula ?? (formula || '—')} />
                </span>
                <span className="structure-type">{preset?.category ?? 'Custom structure'}</span>
              </div>
              {species ? <SpeciesCard species={species} units={units} /> : null}
              <div className="property-list">
                <div>
                  <span>Geometry</span>
                  <strong>{preset?.geometry ?? 'User-defined'}</strong>
                </div>
                <div>
                  <span>Connected groups</span>
                  <strong>{analysis.components}</strong>
                </div>
                <div>
                  <span>Elements present</span>
                  <strong>{new Set(s.atoms.map((a) => a.sym)).size}</strong>
                </div>
                <div>
                  <span>Coordinates</span>
                  <strong>Ångström (Å)</strong>
                </div>
              </div>
              {s.atoms.length > 0 && (
                <details className="mass-source-details">
                  <summary>Mass total · sources & precision</summary>
                  <PropertyStatus presentation={molarMassView} />
                </details>
              )}
              <section className="insight-card">
                <div>
                  <BookOpen size={15} />
                  <span>THE CHEMISTRY</span>
                </div>
                <p>
                  {preset?.lesson ??
                    'Connect atoms to explore molecular structure. Your arrangement is editable; moving atoms does not calculate a new equilibrium geometry.'}
                </p>
              </section>
              <section className="composition-section">
                <div className="section-title">
                  ELEMENT BREAKDOWN<span>{new Set(s.atoms.map((a) => a.sym)).size}</span>
                </div>
                {Array.from(new Set(s.atoms.map((a) => a.sym))).map((sym) => {
                  const massView = presentQuantity(bySymbol[sym].mass);
                  return (
                    <button className="composition-row" key={sym} onClick={() => s.setCard(sym)}>
                      <span className="element-square" style={{ color: atomColor(sym) }}>
                        {sym}
                      </span>
                      <span>
                        <strong>{bySymbol[sym]?.name}</strong>
                        <small>
                          {massView.text}
                          <PropertyStatus presentation={massView} compact />
                        </small>
                      </span>
                      <span className="composition-count">
                        ×{s.atoms.filter((a) => a.sym === sym).length}
                      </span>
                      <ChevronRight size={13} />
                    </button>
                  );
                })}
              </section>
              {selected && (
                <section className="selected-atom">
                  <div className="section-title">
                    SELECTED ATOM
                    <button
                      className="icon-button"
                      aria-label="Deselect atom"
                      onClick={() => s.select(null)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <strong>
                    {bySymbol[selected.sym]?.name} <span>{selected.sym}</span>
                  </strong>
                  <p className="coordinate-readout">
                    {selected.pos
                      .map((n, i) => `${['x', 'y', 'z'][i]} ${n.toFixed(2)}`)
                      .join(' · ')}{' '}
                    Å
                  </p>
                  <div className="coordinate-inputs">
                    {selected.pos.map((value, axis) => (
                      <label key={`${selected.id}-${axis}-${value}`}>
                        <span>{['X', 'Y', 'Z'][axis]}</span>
                        <input
                          type="number"
                          min={-100}
                          max={100}
                          step={0.05}
                          defaultValue={Number(value.toFixed(3))}
                          aria-label={`${['X', 'Y', 'Z'][axis]} position in ångströms`}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                          onBlur={(event) => {
                            const next = event.currentTarget.valueAsNumber;
                            if (!Number.isFinite(next) || Math.abs(next) > 100) {
                              event.currentTarget.value = value.toFixed(3);
                              setNotice('Coordinates must be between −100 and 100 Å.');
                              return;
                            }
                            if (next === Number(value.toFixed(3))) return;
                            const pos: [number, number, number] = [...selected.pos];
                            pos[axis] = next;
                            s.moveAtom(selected.id, pos);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <button className="text-link" onClick={() => s.setCard(selected.sym)}>
                    Explore this element <ArrowUpRight size={13} />
                  </button>
                </section>
              )}
              <details className="bond-details">
                <summary>
                  Bond measurements
                  <span>
                    {s.bonds.length}
                    <ChevronRight size={13} />
                  </span>
                </summary>
                <p className="measurement-note">
                  Drawn connections. Distances follow your model coordinates, not a predicted bond
                  length.
                  {explainedBondId
                    ? ' Other atoms are dimmed for focus; that is a visual cue, not a claim that those bonds are weaker.'
                    : ''}
                </p>
                {s.bonds.map((b) => {
                  const a = s.atoms.find((x) => x.id === b.a),
                    z = s.atoms.find((x) => x.id === b.b);
                  if (!a || !z) return null;
                  const length = Math.hypot(...a.pos.map((v, i) => v - z.pos[i]));
                  return (
                    <div className="bond-row" key={b.id}>
                      <span>
                        {a.sym} {['', '—', '=', '≡'][b.order]} {z.sym}
                      </span>
                      <strong>{length.toFixed(3)} Å</strong>
                      <button
                        aria-label={`Explain ${a.sym} to ${z.sym} bond`}
                        title="Explain this bond (others dimmed for focus)"
                        onClick={() =>
                          setExplainedBondId((current) => (current === b.id ? null : b.id))
                        }
                      >
                        <CircleHelp size={13} />
                      </button>
                      <button
                        aria-label={`Cycle ${a.sym} to ${z.sym} bond order`}
                        title="Cycle bond order"
                        onClick={() => s.cycleBond(b.id)}
                      >
                        <Link2 size={13} />
                      </button>
                      <button
                        aria-label={`Remove ${a.sym} to ${z.sym} bond`}
                        title="Remove bond"
                        onClick={() => {
                          s.removeBond(b.id);
                          setExplainedBondId(null);
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                {!s.bonds.length && (
                  <p className="measurement-note">Use Bond mode to connect two atoms.</p>
                )}
              </details>
              <div className={`structure-check ${analysis.warnings.length ? 'has-notes' : ''}`}>
                <div>
                  {analysis.warnings.length ||
                  analysis.uncheckedSymbols.length ||
                  !analysis.checkedAtoms ? (
                    <CircleHelp size={14} />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>
                    {analysis.warnings.length
                      ? `${analysis.warnings.length} bonding note${analysis.warnings.length === 1 ? '' : 's'}`
                      : s.atoms.length
                        ? analysis.checkedAtoms
                          ? `No flags among ${analysis.checkedAtoms} checked atoms`
                          : 'Common-valence checks apply to none of these atoms'
                        : 'Ready for your first atom'}
                  </span>
                </div>
                {analysis.uncheckedSymbols.length > 0 && (
                  <p>
                    {analysis.checkedAtoms} / {s.atoms.length} atoms checked.{' '}
                    {analysis.uncheckedSymbols.join(', ')} not checked by these neutral-valence
                    rules.
                  </p>
                )}
                {analysis.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
                <small>Educational checks; not a prediction of stability.</small>
              </div>
            </div>
          )}
          <div className="inspector-footnote">
            <FlaskConical size={14} />
            <span>A space to explore, one bond at a time.</span>
          </div>
        </aside>
      </main>
      <footer className="app-footer">
        <span>
          <i /> MADE FOR THE CURIOUS
        </span>
        <span>Idealized structures · Educational modeling</span>
        <button onClick={() => setHelp(true)}>
          Controls & model notes <ArrowUpRight size={12} />
        </button>
      </footer>
      <PeriodicTable />
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      <Dialog.Root open={help} onOpenChange={setHelp}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="guide-dialog">
            <div className="guide-top">
              <span className="brand-mark">
                <Atom size={24} />
              </span>
              <Dialog.Close className="icon-button" aria-label="Close guide">
                <X size={20} />
              </Dialog.Close>
            </div>
            <span className="eyebrow">WELCOME TO TEMPLE LAB</span>
            <Dialog.Title>A little curiosity goes a long way.</Dialog.Title>
            <Dialog.Description>
              Explore a molecule, build your own, and discover what gives a structure its shape.
            </Dialog.Description>
            <div className="guide-steps">
              <div>
                <span>01</span>
                <p>
                  <strong>Start with a structure.</strong>Choose a reference molecule or
                  add any element from the periodic table.
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>Make it yours.</strong>Orbit empty space, zoom with the wheel, and drag
                  atoms in Move mode. Bond mode connects two atoms. Click a bond in Move mode to
                  cycle its order.
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>Keep exploring.</strong>Your scene is stored in this browser when storage
                  is available. Export JSON or XYZ. Reaction lab totals cited formation data for
                  reactions you declare. Undo also restores cleared or replaced structures.
                </p>
              </div>
            </div>
            <div className="shortcut-grid">
              <span>
                <kbd>1</kbd> Move
              </span>
              <span>
                <kbd>2</kbd> Bond
              </span>
              <span>
                <kbd>3</kbd> Erase
              </span>
              <span>
                <kbd>T</kbd> Elements
              </span>
              <span>
                <kbd>F</kbd> Fit view
              </span>
              <span>
                <kbd>⌘ / Ctrl Z</kbd> Undo
              </span>
            </div>
            <div className="guide-note">
              <strong>About the model</strong>
              <p>
                This is an educational molecular editor. Presets use reference geometries; atom
                sizes and bond thicknesses are visual conventions. Space fill is illustrative. No
                energy minimization, reaction prediction, or live quantum calculation is performed
                on the editable bench. The separate Electron lab includes analytic hydrogen orbitals
                and a precomputed H₂ quantum-chemistry lesson. Reference geometry:{' '}
                <a href="https://cccbdb.nist.gov/" target="_blank" rel="noreferrer">
                  NIST CCCBDB
                </a>
                . Element properties are inherited from the original project and are not
                independently verified.
              </p>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
