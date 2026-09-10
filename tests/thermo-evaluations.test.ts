import test from 'node:test';
import assert from 'node:assert/strict';
import { bySpeciesId } from '../src/data/species';
import { balanceReaction, reactionThermo } from '../src/lib/reactions';

test('liquid water carries the CODATA 1984 evaluation tag with a matching precision note', () => {
  const liquid = bySpeciesId['water-l'];
  assert.equal(liquid.evaluation, 'codata-1984');
  assert.match(String(liquid.hf.context?.precisionNote), /CODATA/);
  assert.match(String(liquid.hf.context?.precisionNote), /1984/);
  assert.match(String(liquid.entropy.context?.precisionNote), /CODATA/);
  assert.match(String(liquid.entropy.context?.precisionNote), /1984/);
  assert.equal(liquid.hf.value, -285.83);
  assert.equal(liquid.entropy.value, 69.95);
  assert.equal(liquid.hf.sources?.[0], liquid.entropy.sources?.[0]);
  assert.match(String(liquid.hf.sources?.[0]), /webbook\.nist\.gov/);
});

test('methane combustion to liquid water keeps its enthalpy and now reports mixed evaluations', () => {
  const methane = bySpeciesId['methane-g'];
  const oxygen = bySpeciesId['oxygen-g'];
  const co2 = bySpeciesId['carbon-dioxide-g'];
  const liquid = bySpeciesId['water-l'];
  const balanced = balanceReaction([methane, oxygen], [co2, liquid]);
  assert.equal(balanced.kind, 'ok');
  if (balanced.kind !== 'ok') return;
  const thermo = reactionThermo([methane, oxygen], [co2, liquid], balanced.coefficients);
  assert.equal(thermo.dh.status, 'measured_evaluated');
  assert.ok(Math.abs((thermo.dh.value as number) - -890.31) < 0.005);
  assert.equal(thermo.mixedEvaluations, true);
});

test('methane combustion to gaseous water stays on a single evaluation family', () => {
  const methane = bySpeciesId['methane-g'];
  const oxygen = bySpeciesId['oxygen-g'];
  const co2 = bySpeciesId['carbon-dioxide-g'];
  const gas = bySpeciesId['water-g'];
  const balanced = balanceReaction([methane, oxygen], [co2, gas]);
  assert.equal(balanced.kind, 'ok');
  if (balanced.kind !== 'ok') return;
  const thermo = reactionThermo([methane, oxygen], [co2, gas], balanced.coefficients);
  assert.equal(thermo.mixedEvaluations, false);
});
