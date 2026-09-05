import bondData from '../data/hydrogen-bond.json';

export type AtomicOrbital = '1s' | '2s' | '2p';
export const BOHR_ANGSTROM = bondData.constants.bohrAngstrom;
export const HARTREE_EV = bondData.constants.hartreeEv;
export const MAX_CLOUD_POINTS = 30_000;
export const HYDROGEN_BOND_MODEL = Object.freeze(bondData.model);
export const HYDROGEN_BOND_STEPS = bondData.steps;
export const EQUILIBRIUM_STEP_INDEX = bondData.equilibriumStepIndex;
export const HYDROGEN_BOND_PROVENANCE = bondData.provenance;

// Hydrogenic n=1,2 wavefunctions: MIT 5.61, lectures21–22, p.4.
// https://ocw.mit.edu/courses/5-61-physical-chemistry-fall-2007/c2078ff25c61c136e67ceb6fd8eb9b34_lecture21to22.pdf
// Infinite-nuclear-mass, nonrelativistic hydrogen; 2p means real 2p_z.
function checkOrbital(orbital: AtomicOrbital) {
  if (!['1s', '2s', '2p'].includes(orbital))
    throw new RangeError('Choose the hydrogen 1s, 2s, or 2p orbital.');
}

/** Signed orbital amplitude in Å^(-3/2); its square is probability per Å³. */
export function atomicOrbitalAmplitude(
  orbital: AtomicOrbital,
  x: number,
  y: number,
  z: number,
): number {
  checkOrbital(orbital);
  if (![x, y, z].every(Number.isFinite)) throw new RangeError('Coordinates must be finite.');
  const radius = Math.hypot(x, y, z) / BOHR_ANGSTROM;
  if (!Number.isFinite(radius)) return 0;
  if (orbital === '1s') return Math.exp(-radius) / Math.sqrt(Math.PI * BOHR_ANGSTROM ** 3);
  const polynomial = orbital === '2s' ? 2 - radius : z / BOHR_ANGSTROM;
  return (polynomial * Math.exp(-radius / 2)) / Math.sqrt(32 * Math.PI * BOHR_ANGSTROM ** 3);
}

export function atomicProbabilityDensity(
  orbital: AtomicOrbital,
  x: number,
  y: number,
  z: number,
): number {
  return atomicOrbitalAmplitude(orbital, x, y, z) ** 2;
}

function randomSource(seed: number) {
  if (!Number.isSafeInteger(seed)) throw new RangeError('Seed must be a finite safe integer.');
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return (((value ^ (value >>> 14)) >>> 0) + 0.5) / 4294967296;
  };
}

function checkCount(count: number) {
  if (!Number.isInteger(count) || count < 0 || count > MAX_CLOUD_POINTS)
    throw new RangeError(`Cloud count must be between 0 and ${MAX_CLOUD_POINTS}.`);
}

function gammaInteger(shape: number, random: () => number) {
  let value = 0;
  for (let i = 0; i < shape; i++) value -= Math.log(random());
  return value;
}

/**
 * Independent possible positions sampled from |ψ|², not simultaneous electrons.
 * 1s and2p use exact gamma radial distributions. 2s uses a positive gamma
 * mixture envelope and rejection, preserving the radial node without clipping.
 * There is no hard cloud edge; the point count and random work are bounded.
 */
export function generateAtomicCloud(orbital: AtomicOrbital, count = 6000, seed = 1): Float32Array {
  checkOrbital(orbital);
  checkCount(count);
  const random = randomSource(seed);
  const points = new Float32Array(count * 3);
  let produced = 0;
  for (let attempt = 0; produced < count && attempt < count * 128 + 128; attempt++) {
    let radius;
    if (orbital === '1s') radius = gammaInteger(3, random) / 2;
    else if (orbital === '2p') radius = gammaInteger(5, random);
    else {
      // Envelope x²(x+2)²e^-x has gamma weights24:24:8 and integral56.
      const choice = random() * 56;
      radius = gammaInteger(choice < 24 ? 5 : choice < 48 ? 4 : 3, random);
      if (random() > ((radius - 2) / (radius + 2)) ** 2) continue;
    }
    const cosine = orbital === '2p' ? Math.cbrt(2 * random() - 1) : 2 * random() - 1;
    const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
    const phi = 2 * Math.PI * random();
    radius *= BOHR_ANGSTROM;
    points[produced * 3] = radius * sine * Math.cos(phi);
    points[produced * 3 + 1] = radius * sine * Math.sin(phi);
    points[produced * 3 + 2] = radius * cosine;
    produced++;
  }
  if (produced !== count) throw new Error('Atomic sampling exceeded its bounded attempt limit.');
  return points;
}

function getStep(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= HYDROGEN_BOND_STEPS.length)
    throw new RangeError('Choose a calculated hydrogen separation step.');
  return HYDROGEN_BOND_STEPS[index];
}

function aoValue(radiusSquaredBohr: number) {
  return bondData.basis.exponentsBohr2.reduce(
    (value, exponent, i) =>
      value + bondData.basis.coefficients[i] * Math.exp(-exponent * radiusSquaredBohr),
    0,
  );
}

/** Actual FCI one-electron density, electrons/Å³, at this discrete geometry. */
export function bondElectronDensity(index: number, x: number, y: number, z: number): number {
  const step = getStep(index);
  if (![x, y, z].every(Number.isFinite)) throw new RangeError('Coordinates must be finite.');
  const a2 = BOHR_ANGSTROM ** 2;
  const half = step.distanceAngstrom / 2;
  const left = aoValue(((x + half) ** 2 + y * y + z * z) / a2);
  const right = aoValue(((x - half) ** 2 + y * y + z * z) / a2);
  const density = step.densityMatrixAO;
  return (
    Math.max(
      0,
      density[0][0] * left ** 2 +
        (density[0][1] + density[1][0]) * left * right +
        density[1][1] * right ** 2,
    ) /
    BOHR_ANGSTROM ** 3
  );
}

interface GaussianTerm {
  center: number;
  exponent: number;
  weight: number;
  cumulative: number;
}

function densityTerms(index: number) {
  const step = getStep(index);
  const centers = [
    -step.distanceAngstrom / (2 * BOHR_ANGSTROM),
    step.distanceAngstrom / (2 * BOHR_ANGSTROM),
  ];
  const exponents = bondData.basis.exponentsBohr2;
  const coefficients = bondData.basis.coefficients;
  const terms: GaussianTerm[] = [];
  let absoluteMass = 0;
  let signedMass = 0;
  let negative = false;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++) {
      for (let p = 0; p < exponents.length; p++)
        for (let q = 0; q < exponents.length; q++) {
          const alpha = exponents[p],
            beta = exponents[q],
            exponent = alpha + beta;
          const center = (alpha * centers[a] + beta * centers[b]) / exponent;
          const weight =
            step.densityMatrixAO[a][b] *
            coefficients[p] *
            coefficients[q] *
            Math.exp(((-alpha * beta) / exponent) * (centers[a] - centers[b]) ** 2) *
            (Math.PI / exponent) ** 1.5;
          if (weight === 0) continue;
          signedMass += weight;
          absoluteMass += Math.abs(weight);
          negative ||= weight < 0;
          terms.push({ center, exponent, weight, cumulative: absoluteMass });
        }
    }
  return { terms, absoluteMass, signedMass, negative };
}

const mixtures = HYDROGEN_BOND_STEPS.map((_, index) => densityTerms(index));

/** Analytic integral of the exported Gaussian density; must equal two electrons. */
export function integratedBondElectronCount(index: number): number {
  getStep(index);
  return mixtures[index].signedMass;
}

function normalSource(random: () => number) {
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) {
      const result = spare;
      spare = undefined;
      return result;
    }
    const radius = Math.sqrt(-2 * Math.log(random()));
    const angle = 2 * Math.PI * random();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/**
 * Draw from ρ/2 using the Gaussian product theorem. No live solve, interpolation,
 * artificial bond cloud, finite sampling box, or Metropolis burn-in is used.
 * Signed products, if present, use their absolute mixture as a rejection envelope.
 */
export function generateBondCloud(index: number, count = 6000, seed = 1): Float32Array {
  getStep(index);
  checkCount(count);
  const random = randomSource(seed);
  const normal = normalSource(random);
  const { terms, absoluteMass, negative } = mixtures[index];
  const points = new Float32Array(count * 3);
  let produced = 0;
  for (let attempt = 0; produced < count && attempt < count * 128 + 128; attempt++) {
    const choice = random() * absoluteMass;
    const term = terms.find((entry) => entry.cumulative >= choice) ?? terms[terms.length - 1];
    const sigma = 1 / Math.sqrt(2 * term.exponent);
    const x = term.center + sigma * normal(),
      y = sigma * normal(),
      z = sigma * normal();
    if (negative) {
      let signed = 0,
        envelope = 0;
      for (const entry of terms) {
        const shape =
          (entry.exponent / Math.PI) ** 1.5 *
          Math.exp(-entry.exponent * ((x - entry.center) ** 2 + y * y + z * z));
        signed += entry.weight * shape;
        envelope += Math.abs(entry.weight) * shape;
      }
      if (random() * envelope > Math.max(0, signed)) continue;
    }
    points[produced * 3] = x * BOHR_ANGSTROM;
    points[produced * 3 + 1] = y * BOHR_ANGSTROM;
    points[produced * 3 + 2] = z * BOHR_ANGSTROM;
    produced++;
  }
  if (produced !== count)
    throw new Error('Bond-density sampling exceeded its bounded attempt limit.');
  return points;
}
