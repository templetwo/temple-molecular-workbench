import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStructure } from '../src/lib/chemistry';
import { ELEMENTS } from '../src/data/elements';
import type { Bond, PlacedAtom } from '../src/state/store';

const atom = (id: string, sym: string): PlacedAtom => ({ id, sym, pos: [0, 0, 0] });
const bond = (a: string, b: string, order: Bond['order'] = 1): Bond => ({
  id: `${a}-${b}`,
  a,
  b,
  order,
});

test('coverage counts exactly the ten supported neutral-valence element keys', () => {
  const supported = ['H', 'B', 'C', 'N', 'O', 'F', 'Si', 'Cl', 'Br', 'I'];
  const checkedSymbols = ELEMENTS.filter(
    (element) => analyzeStructure([atom(element.sym, element.sym)], []).checkedAtoms === 1,
  ).map((element) => element.sym);
  assert.equal(checkedSymbols.length, 10);
  assert.deepEqual(checkedSymbols, supported);
  for (const symbol of supported) {
    const result = analyzeStructure([atom(symbol, symbol)], []);
    assert.equal(result.checkedAtoms, 1, symbol);
    assert.deepEqual(result.uncheckedSymbols, [], symbol);
    assert.match(result.warnings.join(' '), /commonly \d for a neutral covalent atom/);
  }
  const empty = analyzeStructure([], []);
  assert.equal(empty.checkedAtoms, 0);
  assert.deepEqual(empty.uncheckedSymbols, []);
  assert.deepEqual(empty.warnings, []);
});

test('lone sodium and a bonded helium pair are explicitly unchecked, not silently validated', () => {
  const sodium = analyzeStructure([atom('na', 'Na')], []);
  assert.equal(sodium.checkedAtoms, 0);
  assert.deepEqual(sodium.uncheckedSymbols, ['Na']);
  assert.deepEqual(sodium.warnings, []);
  const heliumPair = analyzeStructure([atom('he1', 'He'), atom('he2', 'He')], [bond('he1', 'he2')]);
  assert.equal(heliumPair.components, 1);
  assert.equal(heliumPair.checkedAtoms, 0);
  assert.deepEqual(heliumPair.uncheckedSymbols, ['He']);
  assert.deepEqual(heliumPair.warnings, []);
});

test('SF6 checks its fluorines but reports sulfur outside the advisory model', () => {
  const fluorines = Array.from({ length: 6 }, (_, i) => atom(`f${i}`, 'F'));
  const result = analyzeStructure(
    [atom('s', 'S'), ...fluorines],
    fluorines.map((fluorine) => bond('s', fluorine.id)),
  );
  assert.equal(result.components, 1);
  assert.equal(result.checkedAtoms, 6);
  assert.deepEqual(result.uncheckedSymbols, ['S']);
  assert.deepEqual(result.warnings, []);
});

test('CO and NH4 sketches receive neutral-convention flags, not invalid-molecule judgments', () => {
  const carbonMonoxide = analyzeStructure([atom('c', 'C'), atom('o', 'O')], [bond('c', 'o', 3)]);
  assert.equal(carbonMonoxide.checkedAtoms, 2);
  assert.deepEqual(carbonMonoxide.uncheckedSymbols, []);
  assert.equal(carbonMonoxide.warnings.length, 2);
  assert.match(carbonMonoxide.warnings.join(' '), /C: bond-order total 3, commonly 4/);
  assert.match(carbonMonoxide.warnings.join(' '), /O: bond-order total 3, commonly 2/);

  // Formal charge is not represented: this must not reject the ammonium ion.
  const hydrogens = Array.from({ length: 4 }, (_, i) => atom(`h${i}`, 'H'));
  const ammoniumSketch = analyzeStructure(
    [atom('n', 'N'), ...hydrogens],
    hydrogens.map((hydrogen) => bond('n', hydrogen.id)),
  );
  assert.equal(ammoniumSketch.checkedAtoms, 5);
  assert.deepEqual(ammoniumSketch.uncheckedSymbols, []);
  assert.equal(ammoniumSketch.warnings.length, 1);
  assert.match(ammoniumSketch.warnings[0], /N: bond-order total 4, commonly 3/);
  for (const warning of [...carbonMonoxide.warnings, ...ammoniumSketch.warnings]) {
    assert.match(warning, /for a neutral covalent atom/);
    assert.doesNotMatch(warning, /invalid|impossible|unstable|forbidden|incorrect/i);
  }
});

test('unchecked symbols are unique and sorted, without suppressing fragment warnings', () => {
  const result = analyzeStructure(
    ['S', 'Na', 'He', 'Na', 'He'].map((symbol, i) => atom(String(i), symbol)),
    [],
  );
  assert.equal(result.checkedAtoms, 0);
  assert.deepEqual(result.uncheckedSymbols, ['He', 'Na', 'S']);
  assert.equal(result.components, 5);
  assert.deepEqual(result.warnings, [
    '5 separate fragments are present; the formula totals the whole bench.',
  ]);
});
