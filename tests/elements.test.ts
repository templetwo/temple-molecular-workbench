import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileElement,
  compileElements,
  combineNumericQuantities,
  outerPopulation,
  presentQuantity,
  quantityError,
  type InheritedElement,
  type Quantity,
} from '../src/data/element-properties';
import { CIAAW_HELIUM, ELEMENT_OVERLAYS, RSC_HASSIUM } from '../src/data/element-overlays';
import { INHERITED_ELEMENTS, bySymbol, ELEMENTS } from '../src/data/elements';
import { molarMassOf } from '../src/state/store';
import type { PlacedAtom } from '../src/state/store';

const fixture: InheritedElement = {
  n: 2,
  sym: 'He',
  name: 'Helium',
  mass: 4.0026022,
  cat: 'noble gas',
  phase: 'Gas',
  density: 0.1786,
  melt: 0.95,
  boil: 4.222,
  config: '1s2',
  shells: [2],
  eneg: null,
  eaff: -48,
  ie1: 2372.3,
  x: 18,
  y: 1,
  cpk: 'd9ffff',
  appear: 'colorless gas',
  disc: 'Pierre Janssen',
  block: 's',
  period: 1,
  group: 18,
  lattice: 'HCP (solid, under pressure)',
  latkey: 'hcp',
};

function atom(sym: string): PlacedAtom {
  return { id: sym, sym, pos: [0, 0, 0] };
}

test('missing metadata cannot produce a measured-looking presentation', () => {
  const bare = presentQuantity({ value: 126 });
  assert.equal(bare.appearance, 'unavailable');
  assert.equal(bare.shownValue, null);
  assert.doesNotMatch(bare.text, /126/);
  assert.match(bare.reason ?? '', /status/i);

  const noProvenance = presentQuantity({
    value: 4.0026022,
    status: 'measured_evaluated',
  });
  assert.equal(noProvenance.appearance, 'unavailable');
  assert.equal(noProvenance.shownValue, null);
  assert.doesNotMatch(noProvenance.text, /4\.0026022/);
});

test('measured or predicted status without a cited source is rejected', () => {
  assert.match(
    quantityError({
      value: 126,
      status: 'calculated_predicted',
      provenance: 'inherited',
    }) ?? '',
    /cited provenance/,
  );
  assert.match(
    quantityError({
      value: 4.002602,
      status: 'measured_evaluated',
      provenance: 'cited',
    }) ?? '',
    /source/,
  );
  assert.equal(
    presentQuantity({
      value: 126,
      status: 'calculated_predicted',
      provenance: 'inherited',
    }).appearance,
    'unavailable',
  );
});

test('helium inherited mass flattened CIAAW uncertainty; compiled mass is the cited standard weight', () => {
  const inherited = INHERITED_ELEMENTS.find((el) => el.sym === 'He');
  assert.equal(inherited?.mass, 4.0026022);
  const helium = bySymbol.He.mass;
  assert.equal(helium.status, 'measured_evaluated');
  assert.equal(helium.provenance, 'cited');
  assert.equal(helium.source, CIAAW_HELIUM);
  assert.equal(helium.value, 4.002602);
  assert.equal(helium.context?.uncertainty, '0.000002');
  const view = presentQuantity(helium);
  assert.equal(view.appearance, 'measured_evaluated');
  assert.equal(view.shownValue, 4.002602);
  assert.equal(view.text, '4.002602(2) u');
  assert.match(helium.context?.precisionNote ?? '', /flattened/);
});

test('hassium melting point is withheld, not relabeled as predicted', () => {
  assert.equal(INHERITED_ELEMENTS.find((el) => el.sym === 'Hs')?.melt, 126);
  const melt = bySymbol.Hs.melt;
  assert.equal(melt.status, 'unavailable');
  assert.equal(melt.provenance, 'withheld');
  assert.equal(melt.value, null);
  assert.equal(melt.source, RSC_HASSIUM);
  const view = presentQuantity(melt);
  assert.equal(view.appearance, 'unavailable');
  assert.equal(view.shownValue, null);
  assert.doesNotMatch(view.text, /126/);
  assert.notEqual(melt.status, 'calculated_predicted');
  assert.match(melt.withheldReason ?? '', /unknown/);
});

test('carbon density is withheld until an allotrope is specified', () => {
  assert.equal(INHERITED_ELEMENTS.find((el) => el.sym === 'C')?.density, 1.821);
  const density = bySymbol.C.density;
  assert.equal(density.provenance, 'withheld');
  assert.equal(presentQuantity(density).shownValue, null);
  assert.match(density.withheldReason ?? '', /allotrope/i);
});

test('a leading asterisk does not promote a configuration to calculated/predicted', () => {
  const starred = INHERITED_ELEMENTS.filter((el) => el.config.startsWith('*'));
  assert.equal(starred.length, 14);
  for (const raw of starred) {
    const compiled = bySymbol[raw.sym];
    assert.equal(compiled.config.status, 'unverified');
    assert.equal(compiled.config.provenance, 'inherited');
    assert.ok(compiled.config.value && !compiled.config.value.startsWith('*'));
    assert.match(compiled.config.context?.precisionNote ?? '', /estimated/);
    assert.notEqual(compiled.config.status, 'calculated_predicted');
  }
});

test('a negative electron affinity is not inferred to be calculated or predicted', () => {
  const negatives = INHERITED_ELEMENTS.filter((el) => el.eaff !== null && el.eaff < 0);
  assert.equal(negatives.length, 20);
  for (const raw of negatives) {
    const affinity = bySymbol[raw.sym].eaff;
    assert.equal(affinity.status, 'unverified');
    assert.equal(affinity.provenance, 'inherited');
    assert.equal(affinity.value, raw.eaff);
    assert.notEqual(affinity.status, 'calculated_predicted');
    assert.equal(presentQuantity(affinity, { digits: 1 }).appearance, 'unverified');
  }
});

test('shell populations remain schematic and match Z', () => {
  for (const el of ELEMENTS) {
    assert.equal(el.shells.status, 'unverified');
    assert.deepEqual(
      el.shells.value?.reduce((sum, n) => sum + n, 0),
      el.n,
    );
    assert.match(el.shells.context?.precisionNote ?? '', /not a spectroscopic measurement/);
  }
});

test('phase and lattice labels carry status into their consumers', () => {
  const oxygen = presentQuantity(bySymbol.O.phase);
  assert.equal(oxygen.shownValue, 'Gas');
  assert.equal(oxygen.appearance, 'unverified');
  const carbonLattice = presentQuantity(bySymbol.C.lattice);
  assert.match(String(carbonLattice.shownValue), /Diamond/);
  assert.equal(carbonLattice.appearance, 'unverified');
  assert.equal(bySymbol.C.latkey, 'diamond');
});

test('molar-mass totals inherit the weakest mass status and go unavailable if any mass is withheld', () => {
  const water = molarMassOf([atom('H'), atom('H'), atom('O')]);
  assert.equal(water.status, 'unverified');
  assert.ok(water.value !== null);
  assert.ok(Math.abs(water.value - 18.015) < 0.001);
  assert.equal(presentQuantity(water, { digits: 3 }).appearance, 'unverified');

  const helium = molarMassOf([atom('He')]);
  assert.equal(helium.status, 'measured_evaluated');
  assert.equal(helium.value, 4.002602);

  const mixed = molarMassOf([atom('He'), atom('O')]);
  assert.equal(mixed.status, 'unverified');
  assert.ok(mixed.value !== null);

  const blocked = combineNumericQuantities([
    bySymbol.He.mass,
    {
      value: null,
      status: 'unavailable',
      provenance: 'withheld',
      withheldReason: 'fixture',
    },
  ]);
  assert.equal(blocked.status, 'unavailable');
  assert.equal(blocked.value, null);
  assert.equal(presentQuantity(blocked).shownValue, null);
});

test('compile overlays cannot smuggle an unsupported number in as predicted', () => {
  assert.throws(
    () =>
      compileElement(fixture, {
        melt: {
          value: 126,
          status: 'calculated_predicted',
          provenance: 'inherited',
        },
      }),
    /cited provenance/,
  );
});

test('non-finite measured numbers cannot look evaluated', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const record = {
      value,
      status: 'measured_evaluated' as const,
      provenance: 'cited' as const,
      source: 'https://example.org/n',
    };
    assert.match(quantityError(record) ?? '', /finite/);
    const view = presentQuantity(record);
    assert.equal(view.appearance, 'unavailable');
    assert.equal(view.shownValue, null);
    assert.equal(view.badge, 'Unavailable');
  }
});

test('cited calculated masses keep cited provenance when aggregated', () => {
  const part: Quantity<number> = {
    value: 1.5,
    status: 'calculated_predicted',
    provenance: 'cited',
    source: 'https://example.org/mass',
    context: { units: 'u' },
  };
  const total = combineNumericQuantities([part, part]);
  assert.equal(total.value, 3);
  assert.equal(total.status, 'calculated_predicted');
  assert.equal(total.provenance, 'cited');
  assert.equal(total.source, 'https://example.org/mass');
  const view = presentQuantity(total);
  assert.equal(view.appearance, 'calculated_predicted');
  assert.equal(view.shownValue, 3);
  assert.equal(view.source, 'https://example.org/mass');
});

test('outer-shell count keeps the parent shells scientific status', () => {
  const measured = outerPopulation({
    value: [2, 8, 1],
    status: 'measured_evaluated',
    provenance: 'cited',
    source: 'https://example.org/shells',
  });
  assert.equal(measured.value, 1);
  assert.equal(measured.status, 'measured_evaluated');
  assert.equal(measured.provenance, 'cited');
  assert.equal(presentQuantity(measured).appearance, 'measured_evaluated');
  assert.equal(presentQuantity(measured).badge, 'Measured/evaluated');
});

test('catalog compile keeps 118 elements and applies only named overlays', () => {
  const compiled = compileElements(INHERITED_ELEMENTS, ELEMENT_OVERLAYS);
  assert.equal(compiled.length, 118);
  assert.equal(compiled.filter((el) => el.mass.status === 'measured_evaluated').length, 1);
  assert.equal(bySymbol.He.mass.source, CIAAW_HELIUM);
});
