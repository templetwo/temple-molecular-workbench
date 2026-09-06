import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  FlaskConical,
  Info,
  Rotate3D,
} from 'lucide-react';
import {
  EQUILIBRIUM_STEP_INDEX,
  HYDROGEN_BOND_MODEL,
  HYDROGEN_BOND_STEPS,
  type AtomicOrbital,
} from '@/lib/electrons';

const ElectronScene = lazy(() => import('./ElectronScene'));
const ORBITALS: Record<
  AtomicOrbital,
  { name: string; state: string; title: string; description: string; notice: string }
> = {
  '1s': {
    name: 'Spherical',
    state: 'GROUND STATE',
    title: 'One electron. No fixed path.',
    description:
      'The cloud is a map of where hydrogen’s electron could be detected. Denser regions mean a higher probability per unit volume—not more electrons.',
    notice:
      'A 1s orbital is spherical. Its probability density is greatest at the nucleus, but the electron is not confined to the center.',
  },
  '2s': {
    name: 'A shell within a shell',
    state: 'EXCITED STATE',
    title: 'A hidden gap in the cloud.',
    description:
      'The 2s state has a radial node: a spherical surface where the probability density is zero. The electron can be detected on either side of it.',
    notice:
      'The inner and outer regions belong to one orbital, occupied here by one electron. A node is not a wall or an electron’s track.',
  },
  '2p': {
    name: 'Two lobes, one state',
    state: 'EXCITED STATE',
    title: 'Two lobes. Still one electron.',
    description:
      'This 2p orbital points along the z axis. A nodal plane through the nucleus separates its two lobes; probability density is zero in that plane.',
    notice:
      'The two lobes are not two electrons. Other p orbitals can point along different axes. This view shows probability, not electric charge or wavefunction phase.',
  },
};

function EnergyCurve({ selected }: { selected: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(240, entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const height = 204;
  const left = 40,
    right = width - 14,
    top = 20,
    bottom = height - 34;
  const distances = HYDROGEN_BOND_STEPS.map((step) => step.distanceAngstrom);
  const energies = HYDROGEN_BOND_STEPS.map((step) => step.relativeEnergyEv);
  const minimumX = Math.min(...distances),
    maximumX = Math.max(...distances);
  const minimumY = Math.floor(Math.min(...energies) - 0.5),
    maximumY = Math.ceil(Math.max(0, ...energies) + 0.5);
  const x = (value: number) => left + ((value - minimumX) / (maximumX - minimumX)) * (right - left);
  const y = (value: number) =>
    bottom - ((value - minimumY) / (maximumY - minimumY)) * (bottom - top);
  const step = HYDROGEN_BOND_STEPS[selected];
  const curve = HYDROGEN_BOND_STEPS.map(
    (point, index) =>
      `${index ? 'L' : 'M'}${x(point.distanceAngstrom)},${y(point.relativeEnergyEv)}`,
  ).join(' ');
  const xTicks = [minimumX, minimumX + (maximumX - minimumX) / 2, maximumX];
  return (
    <div className="electron-energy-curve" ref={container}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Calculated H2 energy curve. Selected separation ${step.distanceAngstrom.toFixed(2)} ångströms, energy ${step.relativeEnergyEv.toFixed(3)} electronvolts relative to two separated hydrogen atoms.`}
      >
        <title>H₂ potential-energy curve</title>
        <desc>
          Points are discrete quantum-chemistry calculations. The line joins samples, not a fitted
          or live-calculated curve.
        </desc>
        <line x1={left} y1={top} x2={left} y2={bottom} className="energy-axis" />
        <line x1={left} y1={bottom} x2={right} y2={bottom} className="energy-axis" />
        {[minimumY, 0, maximumY].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              y1={y(tick)}
              x2={right}
              y2={y(tick)}
              className={tick === 0 ? 'energy-zero' : 'energy-grid'}
            />
            <text x={left - 8} y={y(tick) + 4} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        {xTicks.map((tick, index) => (
          <text
            key={tick}
            x={x(tick)}
            y={bottom + 18}
            textAnchor={index === 0 ? 'start' : index === 2 ? 'end' : 'middle'}
          >
            {tick.toFixed(2)}
          </text>
        ))}
        <text x={left} y={11} className="energy-axis-title">
          Relative energy / eV
        </text>
        <text
          x={(left + right) / 2}
          y={height - 1}
          textAnchor="middle"
          className="energy-axis-title"
        >
          Nuclear separation / Å
        </text>
        <path d={curve} className="energy-curve-line" />
        {HYDROGEN_BOND_STEPS.map((point, index) => (
          <circle
            key={index}
            cx={x(point.distanceAngstrom)}
            cy={y(point.relativeEnergyEv)}
            r="2"
            className="energy-sample"
          />
        ))}
        <line
          x1={x(step.distanceAngstrom)}
          y1={y(step.relativeEnergyEv)}
          x2={x(step.distanceAngstrom)}
          y2={bottom}
          className="energy-guide"
        />
        <circle
          cx={x(step.distanceAngstrom)}
          cy={y(step.relativeEnergyEv)}
          r="5"
          className="energy-selected"
          data-testid="energy-selected-point"
        />
      </svg>
    </div>
  );
}

function SceneFrame({
  mode,
  orbital,
  stepIndex,
  showNuclei,
}: {
  mode: 'atom' | 'bond';
  orbital: AtomicOrbital;
  stepIndex: number;
  showNuclei: boolean;
}) {
  return (
    <div className="electron-viewport">
      <div className="electron-viewport-label">
        <span className="live-dot" />{' '}
        {mode === 'atom' ? 'HYDROGEN / PROBABILITY DENSITY' : 'H₂ / ELECTRON DENSITY'}
      </div>
      <Suspense
        fallback={
          <div className="electron-loading" role="status">
            Preparing the probability cloud…
          </div>
        }
      >
        <ElectronScene
          mode={mode}
          orbital={orbital}
          stepIndex={stepIndex}
          showNuclei={showNuclei}
        />
      </Suspense>
      <div className="electron-viewport-footer">
        <span>
          <Rotate3D size={14} /> Drag to rotate · Scroll to zoom
        </span>
        <span>Coordinates in Å</span>
      </div>
    </div>
  );
}

export default function ElectronLab() {
  const [lesson, setLesson] = useState('atom');
  const bondTab = useRef<HTMLButtonElement>(null);
  const [orbital, setOrbital] = useState<AtomicOrbital>('1s');
  const [stepIndex, setStepIndex] = useState(HYDROGEN_BOND_STEPS.length - 1);
  const [showNuclei, setShowNuclei] = useState(true);
  const selectedOrbital = ORBITALS[orbital];
  const step = HYDROGEN_BOND_STEPS[stepIndex];
  const minimum = HYDROGEN_BOND_STEPS[EQUILIBRIUM_STEP_INDEX];
  const region =
    stepIndex < EQUILIBRIUM_STEP_INDEX
      ? 'close'
      : stepIndex === EQUILIBRIUM_STEP_INDEX
        ? 'minimum'
        : 'apart';
  const bondLesson =
    region === 'close'
      ? {
          title: 'Compressed configurations.',
          text: 'Below the sampled minimum separation, further compression raises this model’s total energy. Nuclear repulsion and electronic energy together set the shape of the curve.',
        }
      : region === 'minimum'
        ? {
            title: 'The lowest sampled energy.',
            text: 'This is the lowest-energy separation among the calculated samples. In this model, the bonded arrangement is lower in energy than two separated hydrogen atoms.',
          }
        : {
            title: 'Compare density and energy.',
            text: 'Each separation has its own calculated density. The curve—not cloud overlap alone—shows whether that arrangement has lower energy than separated H atoms in this model.',
          };
  return (
    <Tabs.Root value={lesson} onValueChange={setLesson} className="electron-lab">
      <div className="electron-navigation">
        <Tabs.List aria-label="Electron lessons" className="electron-tabs">
          <Tabs.Trigger value="atom">
            <span>01</span> Atomic orbitals
          </Tabs.Trigger>
          <Tabs.Trigger value="bond" ref={bondTab}>
            <span>02</span> H₂ bonding
          </Tabs.Trigger>
        </Tabs.List>
        <label className="electron-nuclei-toggle">
          <input
            type="checkbox"
            checked={showNuclei}
            onChange={(event) => setShowNuclei(event.currentTarget.checked)}
          />{' '}
          Show nuclei
        </label>
      </div>
      <Tabs.Content value="atom" className="electron-tab-panel">
        <div className="electron-lesson-layout">
          <div className="electron-visual-column electron-visual-column--atom">
            <div className="electron-scene-heading">
              <span className="eyebrow">ANALYTIC HYDROGEN ATOM</span>
              <h3>
                Hydrogen <span>/ {orbital} orbital</span>
              </h3>
              <p>A single electron, seen through the lens of probability.</p>
            </div>
            <SceneFrame
              mode="atom"
              orbital={orbital}
              stepIndex={stepIndex}
              showNuclei={showNuclei}
            />
            <div className="electron-cloud-key">
              <span>
                <i /> Dots sample possible detection locations
              </span>
              <span>Not electron paths · Nucleus enlarged</span>
            </div>
          </div>
          <aside className="electron-lesson-notes" aria-label="Atomic orbital lesson">
            <fieldset className="electron-orbital-picker">
              <legend>Choose a quantum state</legend>
              <div>
                {(['1s', '2s', '2p'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value} orbital`}
                    aria-pressed={orbital === value}
                    onClick={() => setOrbital(value)}
                  >
                    {value}
                    <span>{value === '1s' ? 'Ground' : 'Excited'}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="electron-state-note">
              Views are fitted separately. Switching states is not a simulated excitation.
            </p>
            <div className="electron-learning-copy" aria-live="polite">
              <span className="eyebrow">
                {selectedOrbital.state} · {selectedOrbital.name}
              </span>
              <h4>{selectedOrbital.title}</h4>
              <p>{selectedOrbital.description}</p>
              <div className="electron-insight">
                <Info size={17} />
                <p>{selectedOrbital.notice}</p>
              </div>
            </div>
            <div className="electron-model-note">
              <BookOpen size={16} />
              <p>
                These are analytic, nonrelativistic hydrogen orbitals with a fixed proton. Each
                cloud samples one electron’s probability distribution. Stationary states do not
                circulate like planets.
              </p>
            </div>
            <button
              type="button"
              className="electron-next-lesson"
              onClick={() => {
                setLesson('bond');
                bondTab.current?.focus();
              }}
            >
              Next: explore H₂ bonding <ArrowRight size={15} />
            </button>
          </aside>
        </div>
      </Tabs.Content>
      <Tabs.Content value="bond" className="electron-tab-panel">
        <div className="electron-lesson-layout">
          <div className="electron-visual-column">
            <div className="electron-scene-heading">
              <span className="eyebrow">A PRECOMPUTED QUANTUM-CHEMISTRY LESSON</span>
              <h3>
                H₂ bonding. <span>Density & energy.</span>
              </h3>
              <p data-testid="bond-static-note">
                Precomputed at fixed nuclear separations: stationary density, not a reaction
                trajectory.
              </p>
            </div>
            <SceneFrame
              mode="bond"
              orbital={orbital}
              stepIndex={stepIndex}
              showNuclei={showNuclei}
            />
            <div className="electron-cloud-key">
              <span>
                <i /> Total density of two electrons
              </span>
              <span>Dots are samples, not individual electrons</span>
            </div>
          </div>
          <aside
            className="electron-lesson-notes electron-bond-notes"
            aria-label="Hydrogen molecule bonding lesson"
          >
            <div className="electron-separation-control">
              <label htmlFor="electron-separation">
                Nuclear separation{' '}
                <strong>
                  <output htmlFor="electron-separation" data-testid="bond-distance">
                    {step.distanceAngstrom.toFixed(2)}
                  </output>{' '}
                  Å
                </strong>
              </label>
              <input
                id="electron-separation"
                type="range"
                min="0"
                max={HYDROGEN_BOND_STEPS.length - 1}
                step="1"
                value={stepIndex}
                aria-label="Nuclear separation"
                aria-valuetext={`${step.distanceAngstrom.toFixed(2)} ångströms`}
                onChange={(event) => setStepIndex(Number(event.currentTarget.value))}
              />
              <div className="electron-distance-endpoints">
                <span>{HYDROGEN_BOND_STEPS[0].distanceAngstrom.toFixed(2)} Å</span>
                <span>{HYDROGEN_BOND_STEPS.at(-1)!.distanceAngstrom.toFixed(2)} Å</span>
              </div>
              <p className="electron-state-note electron-step-note">
                25 calculated separations, with finer steps near the minimum.
              </p>
              <div className="electron-distance-presets">
                <button type="button" onClick={() => setStepIndex(0)}>
                  Too close
                </button>
                <button type="button" onClick={() => setStepIndex(EQUILIBRIUM_STEP_INDEX)}>
                  Lowest sampled energy
                </button>
                <button type="button" onClick={() => setStepIndex(HYDROGEN_BOND_STEPS.length - 1)}>
                  Far apart
                </button>
              </div>
            </div>
            <div className="electron-energy-value">
              <span>Energy vs separated H atoms</span>
              <strong>
                <output data-testid="bond-energy">
                  {(Math.abs(step.relativeEnergyEv) < 0.0005 ? 0 : step.relativeEnergyEv).toFixed(
                    3,
                  )}
                </output>{' '}
                <small>eV</small>
              </strong>
            </div>
            <EnergyCurve selected={stepIndex} />
            <p className="electron-chart-caption">
              {HYDROGEN_BOND_MODEL.method} / {HYDROGEN_BOND_MODEL.basis}. Each point is a
              calculation; the line joins samples.
            </p>
            <div className="electron-learning-copy" aria-live="polite">
              <h4>{bondLesson.title}</h4>
              <p>{bondLesson.text}</p>
            </div>
            <div className="electron-minimum-note">
              <Check size={14} />
              <span>
                Sampled minimum: {minimum.distanceAngstrom.toFixed(2)} Å ·{' '}
                {minimum.relativeEnergyEv.toFixed(3)} eV
                <br />
                <span data-testid="bond-energy-caveat">
                  Model result, not an experimental binding energy.
                </span>
              </span>
            </div>
          </aside>
        </div>
        <details className="electron-method-details">
          <summary>
            <FlaskConical size={15} /> Calculation method & limitations <ChevronRight size={15} />
          </summary>
          <p>
            <strong>
              {HYDROGEN_BOND_MODEL.method} / {HYDROGEN_BOND_MODEL.basis}
            </strong>{' '}
            · {HYDROGEN_BOND_MODEL.software}. Energy zero:{' '}
            {HYDROGEN_BOND_MODEL.referenceDescription}.
          </p>
          <p>
            Precomputed ground-state H₂ at fixed nuclear separations. The plotted energy includes
            nuclear repulsion. A compact basis set makes this a teaching model, not a high-precision
            prediction. The nuclei are moved by your slider; no time evolution or reaction
            trajectory is simulated.
          </p>
          <p>
            FCI means full configuration interaction: the electronic problem is solved within the
            chosen finite basis. STO-3G is a small set of functions used to describe the electrons,
            so these results still have substantial basis-set error.
          </p>
          <p>
            The electron density belongs to the selected calculated geometry. No quantum calculation
            is performed on your editable workbench.{' '}
            <a
              href="https://github.com/templetwo/temple-molecular-workbench/blob/main/docs/ELECTRON-SCIENCE.md"
              target="_blank"
              rel="noreferrer"
            >
              Scientific notes, reproducible generator & validation <ArrowRight size={11} />
            </a>
          </p>
        </details>
      </Tabs.Content>
      <div className="electron-lab-footer">
        <span>
          <Check size={13} /> Your workbench stays unchanged
        </span>
        <a href="https://goldbook.iupac.org/terms/view/M03996" target="_blank" rel="noreferrer">
          What is an orbital? <ArrowRight size={12} />
        </a>
      </div>
    </Tabs.Root>
  );
}
