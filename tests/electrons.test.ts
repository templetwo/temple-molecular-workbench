import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import data from '../src/data/hydrogen-bond.json';
import {
  atomicOrbitalAmplitude,
  atomicProbabilityDensity,
  generateAtomicCloud,
  generateBondCloud,
  bondElectronDensity,
  integratedBondElectronCount,
  BOHR_ANGSTROM,
  HARTREE_EV,
  HYDROGEN_BOND_MODEL,
  HYDROGEN_BOND_STEPS,
  EQUILIBRIUM_STEP_INDEX,
  MAX_CLOUD_POINTS,
} from '../src/lib/electrons';
import type { AtomicOrbital } from '../src/lib/electrons';

function near(actual: number, expected: number, tolerance: number) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} differs from ${expected} by more than ${tolerance}`,
  );
}

function moments(points: Float32Array) {
  const count = points.length / 3;
  let r = 0,
    r2 = 0,
    cosine2 = 0;
  const mean = [0, 0, 0];
  for (let i = 0; i < points.length; i += 3) {
    const radius = Math.hypot(points[i], points[i + 1], points[i + 2]);
    r += radius;
    r2 += radius * radius;
    cosine2 += (points[i + 2] / radius) ** 2;
    for (let j = 0; j < 3; j++) mean[j] += points[i + j];
  }
  return {
    r: r / count,
    r2: r2 / count,
    cosine2: cosine2 / count,
    mean: mean.map((value) => value / count),
  };
}

test('analytic hydrogen densities normalize to one electron and preserve radial/angular nodes', () => {
  const dr = BOHR_ANGSTROM * 0.005;
  for (const orbital of ['1s', '2s', '2p'] as const) {
    let integral = 0;
    for (let i = 0; i < 8000; i++) {
      const r = (i + 0.5) * dr;
      // For p_z the exact spherical angular average is one third of the z-axis value.
      const average = atomicProbabilityDensity(orbital, 0, 0, r) / (orbital === '2p' ? 3 : 1);
      integral += 4 * Math.PI * r * r * average * dr;
    }
    near(integral, 1, 2e-6);
  }
  assert.equal(atomicProbabilityDensity('2s', 2 * BOHR_ANGSTROM, 0, 0), 0);
  assert.equal(atomicProbabilityDensity('2p', 0.4, 0.6, 0), 0);
  assert.ok(atomicProbabilityDensity('1s', 0, 0, 0) > 0);
  assert.ok(atomicProbabilityDensity('2s', 0, 0, 0) > 0);
  assert.ok(atomicOrbitalAmplitude('2s', 0, 0, 0) > 0);
  assert.ok(atomicOrbitalAmplitude('2s', 3 * BOHR_ANGSTROM, 0, 0) < 0);
  near(atomicOrbitalAmplitude('2p', 0, 0, 1), -atomicOrbitalAmplitude('2p', 0, 0, -1), 1e-15);
});

test('atomic point clouds reproduce independent hydrogen radial and angular moments', () => {
  const expected = { '1s': [1.5, 3, 1 / 3], '2s': [6, 42, 1 / 3], '2p': [5, 30, 3 / 5] };
  for (const orbital of ['1s', '2s', '2p'] as const) {
    const result = moments(generateAtomicCloud(orbital, 30_000, 48219));
    near(result.r / BOHR_ANGSTROM, expected[orbital][0], 0.08);
    near(result.r2 / BOHR_ANGSTROM ** 2, expected[orbital][1], 0.9);
    near(result.cosine2, expected[orbital][2], 0.012);
    result.mean.forEach((value) => near(value, 0, 0.055));
  }
});

test('clouds are deterministic, have finite coordinates, and reject unbounded input', () => {
  assert.deepEqual(generateAtomicCloud('2s', 500, 12), generateAtomicCloud('2s', 500, 12));
  assert.notDeepEqual(generateAtomicCloud('2s', 500, 12), generateAtomicCloud('2s', 500, 13));
  assert.deepEqual(generateBondCloud(7, 500, 12), generateBondCloud(7, 500, 12));
  for (const cloud of [
    generateAtomicCloud('1s'),
    generateAtomicCloud('2p'),
    generateBondCloud(0),
    generateBondCloud(24),
  ]) {
    assert.equal(cloud.length, 18_000);
    assert.ok(cloud.every(Number.isFinite));
  }
  assert.equal(generateAtomicCloud('1s', 0).length, 0);
  assert.equal(generateBondCloud(0, 0).length, 0);
  for (const count of [-1, Infinity, 0.5, MAX_CLOUD_POINTS + 1]) {
    assert.throws(() => generateAtomicCloud('1s', count), RangeError);
    assert.throws(() => generateBondCloud(0, count), RangeError);
  }
  assert.throws(() => generateAtomicCloud('3d' as AtomicOrbital), RangeError);
  assert.throws(() => generateAtomicCloud('1s', 2, NaN), RangeError);
  assert.throws(() => atomicProbabilityDensity('1s', Infinity, 0, 0), RangeError);
  assert.equal(atomicProbabilityDensity('2s', 1e308, 0, 0), 0);
  assert.throws(() => generateBondCloud(0.5), RangeError);
  assert.throws(() => generateBondCloud(-1), RangeError);
  assert.throws(() => generateBondCloud(HYDROGEN_BOND_STEPS.length), RangeError);
});

test('calculated H2 density integrates to two and agrees with independent PySCF probes', () => {
  HYDROGEN_BOND_STEPS.forEach((step, index) => {
    near(integratedBondElectronCount(index), 2, 1e-10);
    near(step.electronCount, 2, 1e-10);
    near(step.integratedElectronCount, 2, 1e-5);
    assert.ok(step.aoReconstructionMaxError < 1e-10);
    near(step.spinSquared, 0, 1e-9);
    data.densityProbeCoordinatesAngstrom.forEach(([x, y, z], probe) => {
      near(bondElectronDensity(index, x, y, z), step.densityProbesPerAngstrom3[probe], 1e-10);
      near(bondElectronDensity(index, x, y, z), bondElectronDensity(index, -x, y, z), 1e-9);
    });
  });
});

test('FCI energy includes nuclear repulsion and uses the separately calculated neutral-atom reference', () => {
  assert.equal(HYDROGEN_BOND_MODEL.method, 'FCI (singlet)');
  assert.equal(HYDROGEN_BOND_MODEL.basis, 'STO-3G');
  assert.match(HYDROGEN_BOND_MODEL.software, /^PySCF /);
  assert.equal(HYDROGEN_BOND_MODEL.nuclearRepulsionIncluded, true);
  assert.match(HYDROGEN_BOND_MODEL.referenceDescription, /separated neutral H/);
  assert.equal(
    HYDROGEN_BOND_MODEL.referenceEnergyHartree,
    2 * HYDROGEN_BOND_MODEL.atomicEnergyHartree,
  );
  assert.ok(
    HYDROGEN_BOND_MODEL.atomicEnergyHartree > -0.5,
    'Minimal basis is not the exact isolated H solution.',
  );
  for (const step of HYDROGEN_BOND_STEPS) {
    near(step.energyHartree, step.electronicEnergyHartree + step.nuclearRepulsionHartree, 1e-12);
    near(step.nuclearRepulsionHartree, BOHR_ANGSTROM / step.distanceAngstrom, 1e-12);
    near(
      step.relativeEnergyEv,
      (step.energyHartree - HYDROGEN_BOND_MODEL.referenceEnergyHartree) * HARTREE_EV,
      1e-12,
    );
  }
  assert.match(data.provenance.generatorSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    data.provenance.generatorSha256,
    createHash('sha256').update(readFileSync('scripts/generate-hydrogen.py')).digest('hex'),
    'Regenerate the scientific dataset whenever its generator changes.',
  );
  assert.ok(
    HYDROGEN_BOND_MODEL.sources.some((source) => source === 'https://pyscf.org/user/ci.html'),
  );
});

test('H2 has a plausible sampled minimum, repulsive compressed branch, and neutral dissociation limit', () => {
  const steps = HYDROGEN_BOND_STEPS;
  assert.equal(steps.length, 25);
  const minimum = steps[EQUILIBRIUM_STEP_INDEX];
  assert.ok(minimum.distanceAngstrom > 0.65 && minimum.distanceAngstrom < 0.85);
  assert.equal(minimum.energyHartree, Math.min(...steps.map((step) => step.energyHartree)));
  assert.ok(minimum.relativeEnergyEv < -3 && minimum.relativeEnergyEv > -8);
  assert.ok(steps[0].relativeEnergyEv > 0);
  for (let i = 1; i < steps.length; i++)
    assert.ok(steps[i].distanceAngstrom > steps[i - 1].distanceAngstrom);
  for (let i = EQUILIBRIUM_STEP_INDEX + 1; i < steps.length; i++)
    assert.ok(steps[i].energyHartree > steps[i - 1].energyHartree);
  const far = steps.at(-1)!;
  near(far.relativeEnergyEv, 0, 1e-5);
  far.naturalOccupations.forEach((occupation) => near(occupation, 1, 0.001));
  assert.ok(minimum.naturalOccupations[0] > 1.9 && minimum.naturalOccupations[1] < 0.1);
});

test('sampled H2 clouds follow each geometry and reproduce independently integrated density moments', () => {
  for (const index of [EQUILIBRIUM_STEP_INDEX, HYDROGEN_BOND_STEPS.length - 1]) {
    const cloud = generateBondCloud(index, 30_000, 9192);
    const result = moments(cloud);
    result.mean.forEach((value) => near(value, 0, 0.05));
    const half = HYDROGEN_BOND_STEPS[index].distanceAngstrom / 2;
    // The full radial second moment is independently integrated in cylindrical
    // coordinates around the molecular axis. Divide density by two for probability.
    const dx = 0.055,
      ds = 0.055,
      extent = half + 5;
    let expectedR2 = 0,
      electronIntegral = 0;
    for (let x = -extent + dx / 2; x < extent; x += dx)
      for (let s = ds / 2; s < 5; s += ds) {
        const weight = bondElectronDensity(index, x, s, 0) * 2 * Math.PI * s * dx * ds;
        electronIntegral += weight;
        expectedR2 += (weight * (x * x + s * s)) / 2;
      }
    near(electronIntegral, 2, 0.008);
    near(result.r2, expectedR2, index === EQUILIBRIUM_STEP_INDEX ? 0.03 : 0.12);
    if (index === HYDROGEN_BOND_STEPS.length - 1) {
      let nearNuclei = 0;
      for (let i = 0; i < cloud.length; i += 3)
        if (Math.abs(Math.abs(cloud[i]) - half) < 1.2) nearNuclei++;
      assert.ok(nearNuclei / (cloud.length / 3) > 0.9);
    }
  }
});
