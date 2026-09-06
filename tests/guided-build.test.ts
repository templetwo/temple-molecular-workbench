import test from 'node:test';
import assert from 'node:assert/strict';
import { createBenchStore } from '../src/state/store';
import { byPresetId } from '../src/data/molecules';
import { analyzeBonding, getBondingProgress } from '../src/lib/bonding-guide';
import { bySymbol } from '../src/data/elements';
import { presentQuantity } from '../src/data/element-properties';
import { RSC_COPERNICIUM } from '../src/data/element-overlays';

test('starting a guided build stages a real 3D reference layout in one undo step', () => {
  const store = createBenchStore(null);
  const before = store.getState().exportScene();
  const original = JSON.stringify(byPresetId.methane);
  store.getState().startGuidedBuild('methane');
  const practice = store.getState();
  assert.equal(practice.activePresetId, null);
  assert.equal(practice.mode, 'bond');
  assert.equal(practice.bonds.length, 0);
  assert.equal(practice.atoms.length, 5);
  assert.ok(new Set(practice.atoms.map((atom) => atom.pos[1])).size > 1);
  assert.ok(new Set(practice.atoms.map((atom) => atom.pos[2])).size > 1);
  assert.equal(practice.past.length, 1);
  assert.equal(JSON.stringify(byPresetId.methane), original);
  store.getState().undo();
  assert.equal(store.getState().exportScene(), before);
  store.getState().redo();
  assert.equal(store.getState().atoms.length, 5);
  assert.equal(store.getState().bonds.length, 0);
});

test('each guided connection and order correction is one undoable drawing change', () => {
  const store = createBenchStore(null);
  store.getState().startGuidedBuild('carbon-dioxide');
  const positions = structuredClone(store.getState().atoms);
  const progress = getBondingProgress('carbon-dioxide', positions, []);
  const first = progress.missingBonds[0];
  const history = store.getState().past.length;
  store.getState().setBondOrder(first.a, first.b, first.order);
  assert.equal(store.getState().past.length, history + 1);
  assert.equal(store.getState().bonds[0].order, 2);
  assert.deepEqual(store.getState().atoms, positions);
  store.getState().setBondOrder(first.a, first.b, 1);
  assert.equal(store.getState().past.length, history + 2);
  assert.equal(
    getBondingProgress('carbon-dioxide', positions, store.getState().bonds).wrongBonds[0]
      .expectedOrder,
    2,
  );
  store.getState().undo();
  assert.equal(store.getState().bonds[0].order, 2);
  store.getState().undo();
  assert.equal(store.getState().bonds.length, 0);
});

test('guided bond edits reject self, missing endpoints, bad order, and no-op changes', () => {
  const store = createBenchStore(null);
  store.getState().startGuidedBuild('water');
  const [a, b] = store.getState().atoms;
  const before = store.getState().past.length;
  store.getState().setBondOrder(a.id, a.id, 1);
  store.getState().setBondOrder(a.id, 'missing', 1);
  store.getState().setBondOrder(a.id, b.id, 4 as 1);
  store.getState().startGuidedBuild('not-a-reference');
  assert.equal(store.getState().past.length, before);
  store.getState().setBondOrder(a.id, b.id, 1);
  store.getState().setBondOrder(b.id, a.id, 1);
  assert.equal(store.getState().past.length, before + 1);
  assert.equal(store.getState().bonds.length, 1);
});

test('a complete guide is recognized without granting experimental geometry identity', () => {
  const store = createBenchStore(null);
  store.getState().startGuidedBuild('water');
  for (const bond of byPresetId.water.bonds)
    store.getState().setBondOrder(bond.a, bond.b, bond.order);
  const state = store.getState();
  assert.equal(analyzeBonding(state.atoms, state.bonds).matches[0].presetId, 'water');
  assert.equal(state.activePresetId, null);
  assert.notDeepEqual(state.atoms, byPresetId.water.atoms);
  const exported = JSON.parse(state.exportScene());
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.kind, 'molecule-studio');
  assert.equal(Object.hasOwn(exported, 'guidedPresetId'), false);
});

test('unsupported copernicium boiling point is withheld without a decimal guess', () => {
  const view = presentQuantity(bySymbol.Cn.boil);
  assert.equal(view.shownValue, null);
  assert.equal(view.appearance, 'unavailable');
  assert.deepEqual(view.sources, [RSC_COPERNICIUM]);
  assert.doesNotMatch(view.text, /357/);
});
