import { useState } from 'react';
import { ArrowUpRight, Check, Compass, Link2, Sparkles } from 'lucide-react';
import { MOLECULE_PRESETS, PRESET_SOURCES, byPresetId, guidedPresets } from '@/data/molecules';
import { bySymbol } from '@/data/elements';
import { atomColor, type PlacedAtom } from '@/state/store';
import type { analyzeBonding, getBondingProgress } from '@/lib/bonding-guide';
import './bonding-guide.css';

type Analysis = ReturnType<typeof analyzeBonding>;
type Progress = ReturnType<typeof getBondingProgress>;

export default function BondingGuide({
  analysis,
  atoms,
  guideId,
  progress,
  bondSourceId,
  onStart,
  onStop,
  onStep,
  onAtom,
  onReference,
}: {
  analysis: Analysis;
  atoms: PlacedAtom[];
  guideId: string | null;
  progress: Progress | null;
  bondSourceId: string | null;
  onStart: (id: string) => void;
  onStop: () => void;
  onStep: () => void;
  onAtom: (id: string) => void;
  onReference: (id: string) => void;
}) {
  const [choice, setChoice] = useState('water');
  const reference = guideId ? byPresetId[guideId] : null;
  const guided = guidedPresets();
  const namedMatches = new Map<string, number>();
  for (const match of analysis.matches)
    namedMatches.set(match.presetId, (namedMatches.get(match.presetId) ?? 0) + 1);
  const label = (id: string) => {
    const index = atoms.findIndex((atom) => atom.id === id);
    return index < 0 ? 'missing atom' : `${atoms[index].sym}${index + 1}`;
  };
  const wrong = progress?.wrongBonds[0];
  const next = progress?.missingBonds[0];
  const paused = Boolean(
    progress &&
    (progress.missingAtomIds.length ||
      progress.extraAtomIds.length ||
      progress.status === 'invalid'),
  );
  const orderName = (order: number) => (order === 1 ? 'single' : order === 2 ? 'double' : 'triple');
  const stepText = wrong
    ? wrong.expectedOrder === null
      ? `Remove ${label(wrong.a)}–${label(wrong.b)}; it is not the suggested pair for this exercise.`
      : `Change ${label(wrong.a)}–${label(wrong.b)} to a ${orderName(wrong.expectedOrder)} bond.`
    : next
      ? `Connect ${label(next.a)} to ${label(next.b)} with a ${orderName(next.order)} bond.`
      : '';

  return (
    <section className="bonding-coach" aria-label="Bonding coach">
      <div className="bonding-coach-heading">
        <span className="bonding-coach-mark">
          <Compass size={18} />
        </span>
        <div>
          <span className="eyebrow">CONNECT / DISCOVER</span>
          <h3>Bonding coach</h3>
        </div>
        <span className="bonding-library-count">
          {String(MOLECULE_PRESETS.length).padStart(2, '0')} refs
        </span>
      </div>

      <div className="bonding-recognition" aria-live="polite" aria-atomic="true">
        {namedMatches.size > 0 ? (
          <>
            <span className="bonding-status">
              <Check size={13} /> Connectivity matches
            </span>
            {Array.from(namedMatches).map(([id, count]) => (
              <div className="bonding-match" key={id}>
                <strong>
                  {byPresetId[id].name}
                  {count > 1 ? ` × ${count}` : ''}
                </strong>
                <a
                  href={PRESET_SOURCES[id as keyof typeof PRESET_SOURCES]}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${byPresetId[id].name} reference source`}
                >
                  NIST <ArrowUpRight size={11} />
                </a>
              </div>
            ))}
            <p>
              Same atoms and bond pattern as the reference—not a geometry or stability calculation.
            </p>
            {analysis.unmatchedAtomIds.length > 0 && (
              <p>
                {analysis.unmatchedAtomIds.length} additional{' '}
                {analysis.unmatchedAtomIds.length === 1 ? 'atom is' : 'atoms are'} not part of a
                recognized molecule.
              </p>
            )}
          </>
        ) : analysis.status === 'composition-only' ? (
          <>
            <span className="bonding-status is-caution">Atom counts match; bonds do not</span>
            <strong>{analysis.sameComposition.map((id) => byPresetId[id].name).join(' / ')}</strong>
            <p>
              A formula alone cannot identify a molecule. Connections and bond orders matter too.
            </p>
          </>
        ) : analysis.status === 'empty' ? (
          <>
            <strong>What could you build?</strong>
            <p>Add atoms to explore reference possibilities, or choose a guided build below.</p>
          </>
        ) : analysis.status === 'invalid' ? (
          <>
            <strong>Unable to check this graph</strong>
            <p>{analysis.errors[0]}</p>
          </>
        ) : (
          <>
            <strong>No connectivity match yet</strong>
            <p>
              Outside this reference library does not mean impossible. Reactions and stability are
              not predicted.
            </p>
          </>
        )}
      </div>

      {!guideId && analysis.suggestions.length > 0 && analysis.matches.length === 0 && (
        <div className="bonding-suggestions">
          <span className="bonding-label">REFERENCE POSSIBILITIES · ATOM COUNTS ONLY</span>
          {analysis.suggestions
            .filter((suggestion) => byPresetId[suggestion.presetId].guidedLesson !== false)
            .slice(0, 3)
            .map((suggestion) => (
              <button
                key={suggestion.presetId}
                onClick={() => setChoice(suggestion.presetId)}
                aria-label={`Choose ${byPresetId[suggestion.presetId].name} guide`}
              >
                <span>
                  {byPresetId[suggestion.presetId].name}
                  <small>
                    {suggestion.missingAtomCount
                      ? `Needs ${suggestion.missingAtoms.map(({ sym, count }) => `${count} ${sym}`).join(', ')}`
                      : suggestion.extraAtomCount
                        ? `${suggestion.extraAtomCount} atoms left over`
                        : 'All required atoms present'}
                  </small>
                </span>
                <span>{byPresetId[suggestion.presetId].formula}</span>
              </button>
            ))}
        </div>
      )}

      {reference && progress ? (
        <div className="bonding-practice">
          <div className="bonding-practice-title">
            <span>BUILDING {reference.name.toUpperCase()}</span>
            <button onClick={onStop}>End guide</button>
          </div>
          <progress
            value={progress.correctBonds}
            max={progress.totalBonds}
            aria-label="Reference bonds completed"
          />
          <p className="bonding-progress-label">
            {progress.correctBonds} / {progress.totalBonds} reference bonds
          </p>
          {paused ? (
            <p role="status">
              This guide needs its original atom set. Undo your change or start a new guided build
              below.
            </p>
          ) : progress.status === 'complete' ? (
            <div className="bonding-complete" role="status">
              <Sparkles size={17} />
              <strong>Bond pattern complete</strong>
              <p>{reference.lesson}</p>
              <button className="bonding-primary" onClick={() => onReference(reference.id)}>
                Load reference geometry
              </button>
              <small>
                Replaces the practice drawing with the sourced geometry. Undo restores your drawing.
              </small>
            </div>
          ) : (
            <>
              <p className="bonding-next" role="status">
                {stepText}
              </p>
              <p>
                Connect atoms in 3D or use the numbered controls. Blue rings mark the suggested
                pair.
              </p>
              <div className="bonding-atom-buttons" aria-label="Guided atom controls">
                {atoms.map((atom, index) => (
                  <button
                    key={atom.id}
                    onClick={() => onAtom(atom.id)}
                    aria-pressed={bondSourceId === atom.id}
                    aria-label={`Bond with ${bySymbol[atom.sym]?.name ?? atom.sym} atom ${index + 1}`}
                  >
                    <i style={{ background: atomColor(atom.sym) }} />
                    {atom.sym}
                    {index + 1}
                  </button>
                ))}
              </div>
              {(wrong || next) && (
                <button className="bonding-primary" onClick={onStep}>
                  <Link2 size={13} />
                  {wrong ? 'Apply suggested change' : 'Add suggested bond'}
                </button>
              )}
            </>
          )}
          <p className="bonding-layout-note">
            Practice atoms start in a layout expanded for editing. It is not an equilibrium geometry
            or a simulated reaction.
          </p>
        </div>
      ) : null}

      <div className="bonding-start">
        <label htmlFor="bonding-reference">
          {guideId ? 'Start another guide' : 'Try a guided build'}
        </label>
        <select
          id="bonding-reference"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          {guided.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} · {preset.formula}
            </option>
          ))}
        </select>
        <button className="bonding-primary" onClick={() => onStart(choice)}>
          <Compass size={14} />
          Start guided build
        </button>
        <small>Replaces the bench with practice atoms. Undo restores the previous structure.</small>
      </div>
      <p className="bonding-limit">
        Known examples, not reaction predictions. Charges, radicals, stereochemistry, and reaction
        conditions are outside this model.
      </p>
    </section>
  );
}
