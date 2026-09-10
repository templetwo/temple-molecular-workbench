import test from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, bySpeciesId, speciesForPreset } from '../src/data/species';
import {
  casChecksum,
  formatCas,
  isCas,
  isInchiKey,
  speciesError,
} from '../src/data/molecule-properties';
import { quantityError } from '../src/data/element-properties';
import { balanceReaction, reactionThermo, stoichFromMoles } from '../src/lib/reactions';
import { exportXyz, parseXyz } from '../src/lib/xyz';
import { fromKelvin, fromKjPerMol, fromPa, parseUnitSystem, SI_UNITS, toKelvin } from '../src/lib/units';

test('CAS checksum rejects a transposed check digit', () => {
  assert.equal(formatCas('7732185'), '7732-18-5');
  assert.equal(casChecksum('7732-18'), 5);
  assert.equal(isCas('7732-18-5'), true);
  assert.equal(isCas('7732-18-4'), false);
  assert.equal(isCas('71432'), false);
});

test('InChIKey requires the 14-10-1 block form', () => {
  assert.equal(isInchiKey('XLYOFNOQVPJJNP-UHFFFAOYSA-N'), true);
  assert.equal(isInchiKey('XLYOFNOQVPJJNPUHFFFAOYSA N'), false);
});

test('every species record is internally valid and water has distinct gas and liquid rows', () => {
  assert.equal(SPECIES.filter((species) => speciesError(species)).length, 0);
  for (const species of SPECIES) {
    assert.equal(quantityError(species.hf), null);
    assert.equal(quantityError(species.entropy), null);
  }
  assert.notEqual(bySpeciesId['water-g'].hf.value, bySpeciesId['water-l'].hf.value);
  assert.equal(bySpeciesId['water-l'].presetId, undefined);
  assert.equal(speciesForPreset('water')?.id, 'water-g');
});

test('elemental gases have identically zero formation enthalpy', () => {
  for (const id of ['hydrogen-g', 'nitrogen-g', 'oxygen-g']) {
    assert.equal(bySpeciesId[id].hf.value, 0);
    assert.equal(bySpeciesId[id].hf.status, 'measured_evaluated');
  }
});

test('methane combustion balances and does not treat missing data as zero', () => {
  const methane = bySpeciesId['methane-g'];
  const oxygen = bySpeciesId['oxygen-g'];
  const co2 = bySpeciesId['carbon-dioxide-g'];
  const steam = bySpeciesId['water-g'];
  const liquid = bySpeciesId['water-l'];
  const gas = balanceReaction([methane, oxygen], [co2, steam]);
  assert.equal(gas.kind, 'ok');
  if (gas.kind !== 'ok') return;
  assert.deepEqual(gas.coefficients, [1, 2, 1, 2]);
  const gasThermo = reactionThermo([methane, oxygen], [co2, steam], gas.coefficients);
  assert.equal(gasThermo.dh.status, 'measured_evaluated');
  assert.ok(Math.abs((gasThermo.dh.value as number) - -802.31) < 0.05);
  const wet = reactionThermo([methane, oxygen], [co2, liquid], gas.coefficients);
  assert.ok((wet.dh.value as number) < (gasThermo.dh.value as number));
  const incomplete = balanceReaction([methane], [co2]);
  assert.equal(incomplete.kind, 'not-conserved');
});

test('Haber and water-gas shift close with the new gas species', () => {
  const haber = balanceReaction(
    [bySpeciesId['nitrogen-g'], bySpeciesId['hydrogen-g']],
    [bySpeciesId['ammonia-g']],
  );
  assert.equal(haber.kind, 'ok');
  if (haber.kind === 'ok') assert.deepEqual(haber.coefficients, [1, 3, 2]);
  const shift = balanceReaction(
    [bySpeciesId['carbon-monoxide-g'], bySpeciesId['water-g']],
    [bySpeciesId['carbon-dioxide-g'], bySpeciesId['hydrogen-g']],
  );
  assert.equal(shift.kind, 'ok');
  if (shift.kind === 'ok') assert.deepEqual(shift.coefficients, [1, 1, 1, 1]);
});

test('limiting reagent and atom economy are arithmetic on supplied moles', () => {
  const species = [
    bySpeciesId['methane-g'],
    bySpeciesId['oxygen-g'],
    bySpeciesId['carbon-dioxide-g'],
    bySpeciesId['water-g'],
  ];
  const result = stoichFromMoles(species, [1, 2, 1, 2], 2, [1, 1]);
  assert.equal(result.kind, 'ok');
  if (result.kind !== 'ok') return;
  assert.equal(result.limitingIndex, 1);
  assert.ok(Math.abs(result.theoreticalMoles[2] - 0.5) < 1e-12);
  // Atom economy is the first product's mass share of the reactants: CO2 44.009 u over
  // CH4 16.043 u + 2 O2 63.996 u. A balanced sum over every product would always be 1.
  assert.ok(Math.abs(result.atomEconomy - 44.009 / 80.039) < 1e-3);
  assert.ok(result.atomEconomy < 0.6);
});

test('stoichFromMoles reports no-amounts when no reactant has a usable amount', () => {
  const species = [
    bySpeciesId['methane-g'],
    bySpeciesId['oxygen-g'],
    bySpeciesId['carbon-dioxide-g'],
    bySpeciesId['water-g'],
  ];
  const none = stoichFromMoles(species, [1, 2, 1, 2], 2, [NaN, NaN]);
  assert.equal(none.kind, 'no-amounts');
  if (none.kind === 'no-amounts') assert.match(none.detail, /positive amount/);

  // A non-finite/non-positive reactant is excluded from the limiting-reagent comparison,
  // not treated as zero and not allowed to win the comparison.
  const partial = stoichFromMoles(species, [1, 2, 1, 2], 2, [NaN, 1]);
  assert.equal(partial.kind, 'ok');
  if (partial.kind === 'ok') {
    assert.equal(partial.limitingIndex, 1);
    assert.ok(Math.abs(partial.theoreticalMoles[2] - 0.5) < 1e-12);
  }

  const zeroed = stoichFromMoles(species, [1, 2, 1, 2], 2, [0, -1]);
  assert.equal(zeroed.kind, 'no-amounts');
});

test('benzene and ethanol combustion still balance correctly with partial-residual pruning', () => {
  const benzene = balanceReaction(
    [bySpeciesId['benzene-g'], bySpeciesId['oxygen-g']],
    [bySpeciesId['carbon-dioxide-g'], bySpeciesId['water-g']],
  );
  assert.equal(benzene.kind, 'ok');
  if (benzene.kind === 'ok') assert.deepEqual(benzene.coefficients, [2, 15, 12, 6]);

  const ethanol = balanceReaction(
    [bySpeciesId['ethanol-g'], bySpeciesId['oxygen-g']],
    [bySpeciesId['carbon-dioxide-g'], bySpeciesId['water-g']],
  );
  assert.equal(ethanol.kind, 'ok');
  if (ethanol.kind === 'ok') assert.deepEqual(ethanol.coefficients, [1, 3, 2, 3]);

  const methane = balanceReaction(
    [bySpeciesId['methane-g'], bySpeciesId['oxygen-g']],
    [bySpeciesId['carbon-dioxide-g'], bySpeciesId['water-g']],
  );
  assert.equal(methane.kind, 'ok');
  if (methane.kind === 'ok') assert.deepEqual(methane.coefficients, [1, 2, 1, 2]);
});

test('an element appearing on only one side still fails to balance under pruning', () => {
  const impossible = balanceReaction(
    [bySpeciesId['hydrogen-g'], bySpeciesId['nitrogen-g']],
    [bySpeciesId['oxygen-g']],
  );
  assert.notEqual(impossible.kind, 'ok');
});

test('benzene without quoted ΔfH makes reaction enthalpy unavailable, never zero', () => {
  const thermo = reactionThermo(
    [bySpeciesId['benzene-g'], bySpeciesId['oxygen-g']],
    [bySpeciesId['carbon-dioxide-g'], bySpeciesId['water-l']],
    [1, 15, 6, 3],
  );
  assert.equal(thermo.dh.status, 'unavailable');
  assert.equal(thermo.dh.value, null);
});

test('unit conversions round-trip temperature and scale energy and pressure', () => {
  assert.ok(Math.abs(toKelvin(25, 'C') - 298.15) < 1e-12);
  assert.ok(Math.abs(fromKelvin(298.15, 'C') - 25) < 1e-12);
  assert.ok(Math.abs(fromKjPerMol(4.184, 'kcal/mol') - 1) < 1e-12);
  assert.ok(Math.abs(fromPa(101325, 'atm') - 1) < 1e-9);
  assert.deepEqual(parseUnitSystem({ temperature: 'C', energy: 'nope' }), {
    ...SI_UNITS,
    temperature: 'C',
  });
});

test('XYZ export/import round-trips coordinates and rejects unknown elements', () => {
  const atoms = [
    { id: 'a1', sym: 'C', pos: [0, 1.4, 0] as [number, number, number] },
    { id: 'a2', sym: 'O', pos: [1.16, 1.4, 0] as [number, number, number] },
  ];
  const parsed = parseXyz(exportXyz(atoms, 'test'));
  assert.equal(parsed.atoms.length, 2);
  assert.equal(parsed.bonds.length, 0);
  assert.equal(parsed.atoms[0].sym, 'C');
  assert.throws(() => parseXyz('1\n\nXx 0 0 0\n'), /unknown element/);
});
