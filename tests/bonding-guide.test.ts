import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOLECULE_PRESETS,
  byPresetId,
  guidedPresets,
  type MoleculePreset,
} from '../src/data/molecules';
import { analyzeBonding, getBondingProgress } from '../src/lib/bonding-guide';
import { MAX_ATOMS, MAX_BONDS, type Bond, type PlacedAtom } from '../src/state/store';

const atom = (id: string, sym: string): PlacedAtom => ({ id, sym, pos: [0, 0, 0] });
const bond = (id: string, a: string, b: string, order: Bond['order'] = 1): Bond => ({
  id,
  a,
  b,
  order,
});

function renamed(preset: MoleculePreset, prefix = 'renamed') {
  const atomMap = Object.fromEntries(preset.atoms.map(({ id }, i) => [id, `${prefix}-a${i}`]));
  return {
    atomMap,
    atoms: preset.atoms
      .map((entry): PlacedAtom => ({
        ...entry,
        id: atomMap[entry.id],
        pos: [...entry.pos],
      }))
      .reverse(),
    bonds: preset.bonds
      .map((entry, i): Bond => ({
        ...entry,
        id: `${prefix}-b${i}`,
        a: atomMap[entry.b],
        b: atomMap[entry.a],
      }))
      .reverse(),
  };
}

test('recognition matches all labeled reference graphs regardless of atom IDs, order, or bond direction', () => {
  for (const preset of MOLECULE_PRESETS) {
    const scene = renamed(preset);
    const before = JSON.stringify(scene);
    const result = analyzeBonding(scene.atoms, scene.bonds);
    assert.equal(result.status, 'recognized', preset.id);
    assert.deepEqual(result.errors, []);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].presetId, preset.id);
    assert.deepEqual(new Set(result.matches[0].atomIds), new Set(scene.atoms.map(({ id }) => id)));
    assert.deepEqual(result.unmatchedAtomIds, []);
    assert.deepEqual(result.sameComposition, []);
    assert.equal(JSON.stringify(scene), before, 'recognition must not mutate the drawing');
  }
});

test('a connectivity match makes no claim about geometry or close atom positions', () => {
  const { atoms, bonds } = renamed(byPresetId.water);
  for (const entry of atoms) entry.pos = [0, 0, 0];
  assert.equal(analyzeBonding(atoms, bonds).matches[0].presetId, 'water');
  assert.equal(analyzeBonding(atoms, []).status, 'composition-only');
  atoms[0].pos = [99, -99, 99];
  assert.equal(analyzeBonding(atoms, bonds).matches[0].presetId, 'water');
});

test('carbon dioxide requires double bonds, not merely its formula or neutral-looking atoms', () => {
  const { atoms, bonds } = byPresetId['carbon-dioxide'];
  for (const wrongOrder of [1, 3] as const) {
    const result = analyzeBonding(
      atoms,
      bonds.map((entry) => ({ ...entry, order: wrongOrder })),
    );
    assert.deepEqual(result.matches, []);
    assert.equal(result.status, 'composition-only');
    assert.deepEqual(result.sameComposition, ['carbon-dioxide']);
  }
});

test('every reference loses recognition when any one bond is removed or its order is changed', () => {
  for (const preset of MOLECULE_PRESETS) {
    for (let i = 0; i < preset.bonds.length; i++) {
      const deleted = preset.bonds.filter((_, j) => i !== j);
      const changed = preset.bonds.map((entry, j): Bond => ({
        ...entry,
        order: i === j ? (entry.order === 1 ? 2 : 1) : entry.order,
      }));
      for (const bonds of [deleted, changed]) {
        const result = analyzeBonding(preset.atoms, bonds);
        assert.ok(!result.matches.some(({ presetId }) => presetId === preset.id));
        assert.ok(result.sameComposition.includes(preset.id));
        assert.notEqual(getBondingProgress(preset.id, preset.atoms, bonds).status, 'complete');
      }
    }
  }
});

test('benzene accepts the equivalent alternating Kekulé drawing but rejects incorrect ring orders', () => {
  const { atoms, bonds } = renamed(byPresetId.benzene);
  const carbonIds = new Set(atoms.filter(({ sym }) => sym === 'C').map(({ id }) => id));
  const alternate = bonds.map((entry): Bond => ({
    ...entry,
    order:
      carbonIds.has(entry.a) && carbonIds.has(entry.b) ? (entry.order === 1 ? 2 : 1) : entry.order,
  }));
  assert.equal(analyzeBonding(atoms, alternate).matches[0].presetId, 'benzene');
  assert.equal(getBondingProgress('benzene', atoms, alternate).status, 'complete');
  const allSingle = bonds.map((entry): Bond => ({ ...entry, order: 1 }));
  assert.equal(analyzeBonding(atoms, allSingle).status, 'composition-only');
  assert.deepEqual(analyzeBonding(atoms, allSingle).matches, []);

  // Same number of single/double ring edges, but adjacent doubles are not a Kekulé graph.
  const original = byPresetId.benzene;
  const adjacent = original.bonds.map((entry, i): Bond => ({
    ...entry,
    order: i < 3 ? 2 : 1,
  }));
  assert.deepEqual(analyzeBonding(original.atoms, adjacent).matches, []);
});

test('same-formula connectivity does not misidentify an ether drawing as ethanol', () => {
  const atoms = [
    atom('c1', 'C'),
    atom('c2', 'C'),
    atom('o', 'O'),
    ...Array.from({ length: 6 }, (_, i) => atom(`h${i}`, 'H')),
  ];
  const bonds = [
    bond('co1', 'c1', 'o'),
    bond('co2', 'c2', 'o'),
    ...Array.from({ length: 6 }, (_, i) => bond(`ch${i}`, i < 3 ? 'c1' : 'c2', `h${i}`)),
  ];
  const result = analyzeBonding(atoms, bonds);
  assert.equal(result.status, 'composition-only');
  assert.deepEqual(result.sameComposition, ['ethanol']);
  assert.deepEqual(result.matches, []);
});

test('recognition reports complete disconnected molecules and explicit unrelated fragments', () => {
  const water = renamed(byPresetId.water, 'water-copy');
  const methane = renamed(byPresetId.methane, 'methane-copy');
  const secondWater = renamed(byPresetId.water, 'water-two');
  const atoms = [...water.atoms, ...methane.atoms, ...secondWater.atoms, atom('xe', 'Xe')];
  const bonds = [...water.bonds, ...methane.bonds, ...secondWater.bonds];
  const result = analyzeBonding(atoms, bonds);
  assert.deepEqual(result.matches.map(({ presetId }) => presetId).sort(), [
    'methane',
    'water',
    'water',
  ]);
  assert.deepEqual(result.unmatchedAtomIds, ['xe']);
  assert.equal(result.status, 'recognized');

  const joined = analyzeBonding(atoms, [...bonds, bond('extra', water.atoms[0].id, 'xe')]);
  assert.equal(joined.matches.filter(({ presetId }) => presetId === 'water').length, 1);
  assert.ok(joined.unmatchedAtomIds.includes('xe'));
  assert.ok(
    water.atoms.every(({ id }) => joined.unmatchedAtomIds.includes(id)),
    'must not recognize a reference subgraph while ignoring an attached atom',
  );
});

test('inventory suggestions state missing/extra atoms and never imply unsupported atoms are impossible', () => {
  const partial = analyzeBonding([atom('o', 'O'), atom('h', 'H')], []);
  assert.equal(partial.status, 'inventory');
  const water = partial.suggestions.find(({ presetId }) => presetId === 'water')!;
  assert.deepEqual(water.missingAtoms, [{ sym: 'H', count: 1 }]);
  assert.equal(water.missingAtomCount, 1);
  assert.equal(water.extraAtomCount, 0);

  const inventory = analyzeBonding([...byPresetId.water.atoms, atom('xe', 'Xe')], []);
  const available = inventory.suggestions.find(({ presetId }) => presetId === 'water')!;
  assert.equal(available.missingAtomCount, 0);
  assert.equal(available.extraAtomCount, 1);
  assert.deepEqual(inventory.matches, []);

  const unsupported = analyzeBonding([atom('xe', 'Xe')], []);
  assert.equal(unsupported.status, 'outside-library');
  assert.deepEqual(unsupported.errors, []);
  assert.deepEqual(unsupported.suggestions, []);
  assert.deepEqual(unsupported.unmatchedAtomIds, ['xe']);
  assert.equal(analyzeBonding([], []).status, 'empty');
});

test('invalid graphs fail closed before recognition and provide no chemistry guesses', () => {
  const { atoms, bonds } = byPresetId.water;
  const invalid: Array<{ atoms: PlacedAtom[]; bonds: Bond[] }> = [
    { atoms: [...atoms, atoms[0]], bonds },
    { atoms: atoms.map((entry, i) => (i === 0 ? { ...entry, sym: 'Xx' } : entry)), bonds },
    { atoms: atoms.map((entry, i) => (i === 0 ? { ...entry, pos: [NaN, 0, 0] } : entry)), bonds },
    {
      atoms,
      bonds: [...bonds, { ...bonds[0], id: 'duplicate-pair', a: bonds[0].b, b: bonds[0].a }],
    },
    { atoms, bonds: [...bonds, bond('extra', atoms[0].id, 'missing')] },
    { atoms, bonds: [...bonds, bond('self', atoms[0].id, atoms[0].id)] },
    { atoms, bonds: bonds.map((entry) => ({ ...entry, order: 4 as Bond['order'] })) },
    { atoms, bonds: bonds.map((entry) => ({ ...entry, id: 'same-id' })) },
    { atoms, bonds: bonds.map((entry, i) => (i === 0 ? { ...entry, id: atoms[0].id } : entry)) },
  ];
  for (const scene of invalid) {
    const result = analyzeBonding(scene.atoms, scene.bonds);
    assert.equal(result.status, 'invalid');
    assert.ok(result.errors.length > 0);
    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.suggestions, []);
    assert.equal(getBondingProgress('water', scene.atoms, scene.bonds).status, 'invalid');
  }
});

test('work stays bounded for the maximum bench size and rejects larger graphs', () => {
  const atoms = Array.from({ length: MAX_ATOMS }, (_, i) => atom(`carbon-${i}`, 'C'));
  const chain = Array.from({ length: MAX_ATOMS - 1 }, (_, i) =>
    bond(`chain-${i}`, atoms[i].id, atoms[i + 1].id),
  );
  assert.equal(analyzeBonding(atoms, chain).matches.length, 0);
  assert.equal(analyzeBonding(atoms, []).matches.length, 0);
  assert.equal(analyzeBonding([...atoms, atom('extra-carbon', 'C')], []).status, 'invalid');
  assert.equal(
    analyzeBonding(
      atoms,
      Array.from({ length: MAX_BONDS + 1 }, (_, i) => bond(`b${i}`, 'carbon-0', 'carbon-1')),
    ).status,
    'invalid',
  );
});

test('guided water exposes actionable missing pairs and completes without changing its inputs', () => {
  const { atoms, bonds } = byPresetId.water;
  const before = JSON.stringify(atoms);
  const start = getBondingProgress('water', atoms, []);
  assert.equal(start.status, 'incomplete');
  assert.equal(start.correctBonds, 0);
  assert.equal(start.totalBonds, 2);
  assert.deepEqual(
    start.missingBonds,
    bonds.map(({ id, a, b, order }) => ({ a, b, order, templateBondId: id })),
  );
  assert.deepEqual(start.wrongBonds, []);
  const partial = getBondingProgress('water', atoms, [bonds[0]]);
  assert.equal(partial.correctBonds, 1);
  assert.equal(partial.missingBonds.length, 1);
  const complete = getBondingProgress('water', atoms, bonds);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.correctBonds, 2);
  assert.deepEqual(complete.missingBonds, []);
  assert.equal(JSON.stringify(atoms), before);
});

test('guided feedback separates a wrong bond order from an unexpected atom pair', () => {
  const { atoms, bonds } = byPresetId['carbon-dioxide'];
  const single = { ...bonds[0], order: 1 as const };
  const oxygenLink = bond('oxygen-link', atoms[1].id, atoms[2].id);
  const result = getBondingProgress('carbon-dioxide', atoms, [single, oxygenLink]);
  assert.equal(result.correctBonds, 0);
  assert.equal(result.missingBonds.length, 1);
  assert.deepEqual(
    result.wrongBonds.map(({ actualOrder, expectedOrder }) => ({ actualOrder, expectedOrder })),
    [
      { actualOrder: 1, expectedOrder: 2 },
      { actualOrder: 1, expectedOrder: null },
    ],
  );
});

test('guided progress reports missing and extra atoms without suggesting dangling bonds', () => {
  const { atoms } = byPresetId.water;
  const result = getBondingProgress('water', [atoms[0], atoms[1], atom('xe', 'Xe')], []);
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missingAtomIds, [atoms[2].id]);
  assert.deepEqual(result.extraAtomIds, ['xe']);
  assert.equal(result.missingBonds.length, 1);
  assert.ok(result.missingBonds.every(({ a, b }) => a !== atoms[2].id && b !== atoms[2].id));
  assert.equal(getBondingProgress('not-a-reference', atoms, []).status, 'invalid');
});

test('guided mapping supports renamed atoms and rejects ambiguous or wrong-element mappings', () => {
  const scene = renamed(byPresetId.water);
  const result = getBondingProgress('water', scene.atoms, [], scene.atomMap);
  assert.equal(result.missingBonds.length, 2);
  assert.ok(
    result.missingBonds.every(({ a, b }) => a.startsWith('renamed-') && b.startsWith('renamed-')),
  );
  assert.equal(
    getBondingProgress('water', scene.atoms, scene.bonds, scene.atomMap).status,
    'complete',
  );
  assert.equal(getBondingProgress('water', scene.atoms, scene.bonds).status, 'complete');

  const [oxygen, h1, h2] = byPresetId.water.atoms;
  const duplicate = { ...scene.atomMap, [h2.id]: scene.atomMap[h1.id] };
  assert.equal(getBondingProgress('water', scene.atoms, [], duplicate).status, 'invalid');
  const wrongElement = {
    ...scene.atomMap,
    [oxygen.id]: scene.atomMap[h1.id],
    [h1.id]: scene.atomMap[oxygen.id],
  };
  assert.equal(getBondingProgress('water', scene.atoms, [], wrongElement).status, 'invalid');
});

test('guides accept equivalent atom assignments only when the whole chosen reference is complete', () => {
  const scene = renamed(byPresetId.ethanol);
  assert.equal(getBondingProgress('ethanol', scene.atoms, scene.bonds).status, 'complete');
  const water = renamed(byPresetId.water);
  assert.equal(
    getBondingProgress('water', [...water.atoms, atom('extra', 'He')], water.bonds, water.atomMap)
      .status,
    'incomplete',
  );
});

test('the four diatomic gases are recognized like any other reference but are excluded from guided lessons', () => {
  const gasIds = ['hydrogen', 'nitrogen', 'oxygen', 'carbon-monoxide'];
  for (const id of gasIds) {
    const preset = byPresetId[id];
    assert.equal(preset.guidedLesson, false, `${id} must be tagged guidedLesson: false`);

    // Recognition (analyzeBonding) must keep matching every preset in MOLECULE_PRESETS,
    // regardless of guidedLesson.
    const scene = renamed(preset);
    const result = analyzeBonding(scene.atoms, scene.bonds);
    assert.equal(result.status, 'recognized', id);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].presetId, id);

    // Guided progress tracking itself still works for a gas if something drives it there
    // directly; the exclusion is only from the component's guided-build entry points.
    const progress = getBondingProgress(id, preset.atoms, []);
    assert.equal(progress.status, 'incomplete');
    assert.equal(progress.totalBonds, preset.bonds.length);
  }

  const guided = guidedPresets();
  for (const id of gasIds)
    assert.ok(
      !guided.some((preset) => preset.id === id),
      `${id} must not be offered as a guide by guidedPresets()`,
    );
});

test('guidedPresets returns every preset except those tagged guidedLesson: false, preserving order', () => {
  const guided = guidedPresets();
  assert.deepEqual(
    guided.map((preset) => preset.id),
    MOLECULE_PRESETS.filter((preset) => preset.guidedLesson !== false).map((preset) => preset.id),
  );
  assert.equal(guided.length, MOLECULE_PRESETS.length - 4);
  for (const preset of guided) assert.notEqual(preset.guidedLesson, false);

  // Original six guided lessons stay guided.
  for (const id of ['benzene', 'water', 'methane', 'ammonia', 'carbon-dioxide', 'ethanol'])
    assert.ok(
      guided.some((preset) => preset.id === id),
      `${id} must remain a guided lesson`,
    );
});
