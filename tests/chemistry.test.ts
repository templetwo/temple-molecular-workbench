import test from 'node:test';
import assert from 'node:assert/strict';
import { MOLECULE_PRESETS, byPresetId } from '../src/data/molecules';
import { analyzeStructure } from '../src/lib/chemistry';
import {
  createBenchStore,
  formulaOf,
  molarMassOf,
  parseScene,
  MAX_ATOMS,
  HISTORY_LIMIT,
  SCENE_STORAGE_KEY,
} from '../src/state/store';
import type { Bond, PlacedAtom } from '../src/state/store';

function near(actual: number, expected: number, tolerance = 0.001) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} should be within ${tolerance} of ${expected}`,
  );
}
function distance(a: PlacedAtom, b: PlacedAtom) {
  return Math.hypot(...a.pos.map((n, i) => n - b.pos[i]));
}
function angle(a: PlacedAtom, center: PlacedAtom, b: PlacedAtom) {
  const u = a.pos.map((n, i) => n - center.pos[i]);
  const v = b.pos.map((n, i) => n - center.pos[i]);
  return (
    (Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          u.reduce((sum, n, i) => sum + n * v[i], 0) / (Math.hypot(...u) * Math.hypot(...v)),
        ),
      ),
    ) *
      180) /
    Math.PI
  );
}
function atomCounts(atoms: PlacedAtom[]) {
  const result: Record<string, number> = {};
  for (const atom of atoms) result[atom.sym] = (result[atom.sym] ?? 0) + 1;
  return result;
}
function memoryStorage(seed: string | null = null) {
  let value = seed;
  let writes = 0;
  return {
    getItem: (key: string) => {
      assert.equal(key, SCENE_STORAGE_KEY);
      return value;
    },
    setItem: (key: string, next: string) => {
      assert.equal(key, SCENE_STORAGE_KEY);
      value = next;
      writes++;
    },
    value: () => value,
    writes: () => writes,
  };
}

test('six presets have their stated composition, one connected graph, and common neutral valences', () => {
  assert.equal(MOLECULE_PRESETS.length, 6);
  const expected: Record<string, Record<string, number>> = {
    water: { O: 1, H: 2 },
    methane: { C: 1, H: 4 },
    ammonia: { N: 1, H: 3 },
    'carbon-dioxide': { C: 1, O: 2 },
    ethanol: { C: 2, O: 1, H: 6 },
    benzene: { C: 6, H: 6 },
  };
  for (const preset of MOLECULE_PRESETS) {
    assert.deepEqual(atomCounts(preset.atoms), expected[preset.id]);
    assert.deepEqual(analyzeStructure(preset.atoms, preset.bonds), { components: 1, warnings: [] });
    near(
      preset.atoms.reduce((sum, atom) => sum + atom.pos[0], 0),
      0,
    );
    near(
      preset.atoms.reduce((sum, atom) => sum + atom.pos[2], 0),
      0,
    );
    near(Math.min(...preset.atoms.map((atom) => atom.pos[1])), 1.4);
  }
});

test('water, methane, ammonia and CO₂ preserve reference bond lengths and angles', () => {
  const [o, h1, h2] = byPresetId.water.atoms;
  near(distance(o, h1), 0.958);
  near(distance(o, h2), 0.958);
  near(angle(h1, o, h2), 104.4776);
  const [c, ...hydrogens] = byPresetId.methane.atoms;
  for (const h of hydrogens) near(distance(c, h), 1.087);
  for (let i = 0; i < hydrogens.length; i++)
    for (let j = i + 1; j < hydrogens.length; j++) {
      near(angle(hydrogens[i], c, hydrogens[j]), 109.47122);
    }
  const [n, ...ammoniaH] = byPresetId.ammonia.atoms;
  for (const h of ammoniaH) near(distance(n, h), 1.012);
  near(angle(ammoniaH[0], n, ammoniaH[1]), 106.67);
  assert.ok(n.pos[1] > ammoniaH[0].pos[1]);
  const [carbon, left, right] = byPresetId['carbon-dioxide'].atoms;
  near(distance(carbon, left), 1.162);
  near(angle(left, carbon, right), 180);
  assert.deepEqual(
    byPresetId['carbon-dioxide'].bonds.map((bond) => bond.order),
    [2, 2],
  );
});

test('benzene is planar with equal C–C distances and an explicit resonance limitation', () => {
  const preset = byPresetId.benzene;
  assert.ok(preset.atoms.every((atom) => atom.pos[2] === 0));
  for (let i = 0; i < 6; i++) {
    near(distance(preset.atoms[i], preset.atoms[(i + 1) % 6]), 1.397);
    near(distance(preset.atoms[i], preset.atoms[i + 6]), 1.084);
    near(angle(preset.atoms[(i + 5) % 6], preset.atoms[i], preset.atoms[(i + 1) % 6]), 120);
  }
  assert.equal(preset.bonds.filter((bond) => bond.order === 2).length, 3);
  assert.match(preset.lesson, /delocalized/);
});

test('ethanol includes nonplanar hydrogens, correct hydroxyl connectivity, and reference lengths', () => {
  const { atoms, bonds } = byPresetId.ethanol;
  near(distance(atoms[0], atoms[1]), 1.512, 0.002);
  near(distance(atoms[1], atoms[2]), 1.431, 0.002);
  near(distance(atoms[2], atoms[3]), 0.971, 0.002);
  near(angle(atoms[0], atoms[1], atoms[2]), 107.8, 0.01);
  assert.ok(atoms.some((atom) => atom.pos[2] > 0.8));
  assert.ok(atoms.some((atom) => atom.pos[2] < -0.8));
  assert.equal(bonds.filter((bond) => bond.a === atoms[2].id || bond.b === atoms[2].id).length, 2);
});

test('Hill formulas and molar masses are calculated from all atoms', () => {
  assert.equal(formulaOf([]), '');
  assert.equal(formulaOf(byPresetId.ethanol.atoms), 'C2H6O');
  assert.equal(formulaOf(byPresetId.ammonia.atoms), 'H3N');
  near(molarMassOf(byPresetId.water.atoms).value ?? Number.NaN, 18.015);
  near(molarMassOf(byPresetId.benzene.atoms).value ?? Number.NaN, 78.114);
  assert.equal(molarMassOf(byPresetId.water.atoms).status, 'unverified');
});

test('defaults show benzene and retain isolated copies of presets', () => {
  const store = createBenchStore(null);
  assert.equal(store.getState().activePresetId, 'benzene');
  assert.equal(store.getState().tableOpen, false);
  assert.equal(store.getState().showLabels, true);
  assert.equal(store.getState().showGrid, true);
  assert.equal(store.getState().autoRotate, false);
  assert.notEqual(store.getState().atoms[0].pos, byPresetId.benzene.atoms[0].pos);
});

test('load, clear and import are undoable; redo restores the full bond graph', () => {
  const store = createBenchStore(null);
  const initial = store.getState().exportScene();
  store.getState().loadPreset('water');
  const water = store.getState().exportScene();
  store.getState().clearAll();
  assert.equal(store.getState().atoms.length, 0);
  store.getState().undo();
  assert.equal(store.getState().exportScene(), water);
  store.getState().redo();
  assert.equal(store.getState().atoms.length, 0);
  assert.deepEqual(store.getState().importScene(initial), { ok: true });
  assert.equal(store.getState().atoms.length, 12);
  store.getState().undo();
  assert.equal(store.getState().atoms.length, 0);
  store.getState().redo();
  assert.equal(store.getState().exportScene(), initial);
});

test('a drag is one undo step, persists once, and direct moves remain undoable', () => {
  const storage = memoryStorage();
  const store = createBenchStore(storage);
  const atom = store.getState().atoms[0];
  store.getState().beginMove();
  for (let x = 1; x <= 20; x++) store.getState().moveAtom(atom.id, [x, 2, 1]);
  assert.equal(store.getState().past.length, 0);
  assert.equal(storage.writes(), 0);
  store.getState().endMove();
  assert.equal(store.getState().past.length, 1);
  assert.equal(storage.writes(), 1);
  assert.equal(store.getState().activePresetId, null);
  store.getState().undo();
  assert.deepEqual(store.getState().atoms[0].pos, atom.pos);
  assert.equal(store.getState().activePresetId, 'benzene');
  store.getState().redo();
  assert.deepEqual(store.getState().atoms[0].pos, [20, 2, 1]);
  store.getState().moveAtom(atom.id, [21, 2, 1]);
  store.getState().undo();
  assert.deepEqual(store.getState().atoms[0].pos, [20, 2, 1]);
});

test('a drag returning to its starting point preserves redo and preset identity', () => {
  const store = createBenchStore(null);
  store.getState().loadPreset('water');
  store.getState().undo();
  const atom = store.getState().atoms[0];
  store.getState().beginMove();
  store.getState().moveAtom(atom.id, [0, 0, 0]);
  store.getState().moveAtom(atom.id, atom.pos);
  store.getState().endMove();
  assert.equal(store.getState().past.length, 0);
  assert.equal(store.getState().future.length, 1);
  assert.equal(store.getState().activePresetId, 'benzene');
});

test('branching edits clear redo, and history is bounded', () => {
  const store = createBenchStore(null);
  store.getState().loadPreset('water');
  store.getState().undo();
  store.getState().removeAtom(store.getState().atoms[0].id);
  assert.equal(store.getState().future.length, 0);
  const atomId = store.getState().atoms[0].id;
  for (let x = 0; x < HISTORY_LIMIT + 10; x++) store.getState().moveAtom(atomId, [x, 2, 0]);
  assert.equal(store.getState().past.length, HISTORY_LIMIT);
});

test('deletion and history never leave stale selection or bond endpoints', () => {
  const store = createBenchStore(null);
  store.getState().loadPreset('water');
  const oxygen = store.getState().atoms[0].id;
  store.getState().select(oxygen);
  store.getState().clickAtomBond(oxygen);
  store.getState().removeAtom(oxygen);
  assert.equal(store.getState().selectedId, null);
  assert.equal(store.getState().bondSourceId, null);
  assert.equal(store.getState().bonds.length, 0);
  store.getState().undo();
  assert.equal(store.getState().bonds.length, 2);
  assert.equal(store.getState().selectedId, null);
  assert.equal(store.getState().bondSourceId, null);
  store.getState().select('missing');
  store.getState().clickAtomBond('missing');
  assert.equal(store.getState().selectedId, null);
  assert.equal(store.getState().bondSourceId, null);
});

test('bond creation prevents self and duplicate edges, and cycling is undoable', () => {
  const store = createBenchStore(null);
  store.getState().clearAll();
  store.getState().addAtom('C', [0, 1, 0]);
  store.getState().addAtom('O', [1, 1, 0]);
  const [a, b] = store.getState().atoms;
  store.getState().clickAtomBond(a.id);
  store.getState().clickAtomBond(a.id);
  assert.equal(store.getState().bonds.length, 0);
  store.getState().clickAtomBond(a.id);
  store.getState().clickAtomBond(b.id);
  const bondId = store.getState().bonds[0].id;
  store.getState().clickAtomBond(b.id);
  store.getState().clickAtomBond(a.id);
  assert.equal(store.getState().bonds.length, 1);
  store.getState().cycleBond(bondId);
  assert.equal(store.getState().bonds[0].order, 2);
  store.getState().undo();
  assert.equal(store.getState().bonds[0].order, 1);
  store.getState().removeBond(bondId);
  assert.equal(store.getState().bonds.length, 0);
  store.getState().undo();
  assert.equal(store.getState().bonds[0].id, bondId);
});

test('invalid imports are atomic and do not destroy a redo branch', () => {
  const store = createBenchStore(null);
  const valid = JSON.parse(store.getState().exportScene());
  store.getState().loadPreset('water');
  store.getState().undo();
  const before = store.getState().exportScene();
  const rejected = [
    '{',
    'null',
    JSON.stringify({ ...valid, schemaVersion: 2 }),
    JSON.stringify({ ...valid, units: 'nanometer' }),
    JSON.stringify({ ...valid, atoms: [...valid.atoms, valid.atoms[0]] }),
    JSON.stringify({ ...valid, atoms: [{ ...valid.atoms[0], sym: '__proto__' }] }),
    JSON.stringify({ ...valid, atoms: [{ ...valid.atoms[0], pos: [null, 0, 0] }] }),
    JSON.stringify({ ...valid, atoms: [{ ...valid.atoms[0], pos: [101, 0, 0] }] }),
    JSON.stringify({ ...valid, bonds: [{ ...valid.bonds[0], a: 'missing' }] }),
    JSON.stringify({ ...valid, bonds: [{ ...valid.bonds[0], b: valid.bonds[0].a }] }),
    JSON.stringify({ ...valid, bonds: [{ ...valid.bonds[0], order: 4 }] }),
    JSON.stringify({
      ...valid,
      bonds: [
        valid.bonds[0],
        { ...valid.bonds[0], id: 'duplicate-pair', a: valid.bonds[0].b, b: valid.bonds[0].a },
      ],
    }),
    JSON.stringify({ ...valid, display: { labels: 'yes' } }),
    JSON.stringify({ ...valid, activePresetId: '__proto__' }),
    JSON.stringify({
      ...valid,
      atoms: Array.from({ length: MAX_ATOMS + 1 }, (_, i) => ({
        id: `a${i}`,
        sym: 'H',
        pos: [0, 0, 0],
      })),
    }),
    ' '.repeat(256_001),
  ];
  for (const input of rejected) {
    const result = store.getState().importScene(input);
    assert.equal(result.ok, false, input.slice(0, 200));
    assert.ok(result.error);
    assert.equal(store.getState().exportScene(), before);
    assert.equal(store.getState().future.length, 1);
  }
});

test('local persistence round-trips structure and settings, handles corrupt/unavailable storage', () => {
  const storage = memoryStorage();
  const store = createBenchStore(storage);
  store.getState().loadPreset('ethanol');
  store.getState().setDisplayStyle('space-fill');
  store.getState().toggleLabels();
  store.getState().toggleGrid();
  store.getState().toggleAutoRotate();
  const reloaded = createBenchStore(storage);
  assert.equal(reloaded.getState().exportScene(), store.getState().exportScene());
  assert.equal(reloaded.getState().past.length, 0);
  assert.equal(createBenchStore(memoryStorage('{broken')).getState().activePresetId, 'benzene');
  const unavailable = createBenchStore({
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota');
    },
  });
  assert.doesNotThrow(() => unavailable.getState().loadPreset('water'));
  assert.equal(unavailable.getState().activePresetId, 'water');
});

test('changed imported structures lose preset identity; invalid API mutations are no-ops', () => {
  const store = createBenchStore(null);
  const edited = JSON.parse(store.getState().exportScene());
  edited.atoms[0].pos[0] += 1;
  assert.equal(parseScene(JSON.stringify(edited)).activePresetId, null);
  const before = store.getState().exportScene();
  store.getState().addAtom('Unobtainium', [0, 0, 0]);
  store.getState().addAtom('C', [Infinity, 0, 0]);
  store.getState().moveAtom(store.getState().atoms[0].id, [NaN, 0, 0]);
  store.getState().loadPreset('constructor');
  store.getState().removeAtom('missing');
  store.getState().cycleBond('missing');
  assert.equal(store.getState().exportScene(), before);
  assert.equal(store.getState().past.length, 0);
});

test('structure analysis handles disconnected and broken graphs without making stability claims', () => {
  const atoms: PlacedAtom[] = [
    { id: 'c', sym: 'C', pos: [0, 0, 0] },
    { id: 'h', sym: 'H', pos: [1, 0, 0] },
    { id: 'fe', sym: 'Fe', pos: [3, 0, 0] },
  ];
  const bonds: Bond[] = [
    { id: 'one', a: 'c', b: 'h', order: 2 },
    { id: 'missing', a: 'c', b: 'absent', order: 1 },
    { id: 'self', a: 'c', b: 'c', order: 1 },
    { id: 'duplicate', a: 'h', b: 'c', order: 1 },
  ];
  const result = analyzeStructure(atoms, bonds);
  assert.equal(result.components, 2);
  assert.match(result.warnings.join(' '), /missing/);
  assert.match(result.warnings.join(' '), /cannot bond to itself/);
  assert.match(result.warnings.join(' '), /same pair/);
  assert.match(result.warnings.join(' '), /H: bond-order total 2/);
  assert.doesNotMatch(result.warnings.join(' '), /Fe:|unstable|stable/);
  assert.deepEqual(analyzeStructure([], []), { components: 0, warnings: [] });
});
