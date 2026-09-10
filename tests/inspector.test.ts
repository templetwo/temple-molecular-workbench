import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElementInspector } from '../src/components/ElementCard';
import BohrModel from '../src/components/BohrModel';
import { presentQuantity } from '../src/data/element-properties';
import { CIAAW_ABRIDGED, CIAAW_HELIUM, CIAAW_HYDROGEN } from '../src/data/element-overlays';
import { bySymbol } from '../src/data/elements';
import type { ElementData } from '../src/data/elements';

function renderInspector(el: ElementData, tab: 'overview' | 'structure' = 'overview') {
  return renderToStaticMarkup(
    createElement(ElementInspector, {
      el,
      tab,
      onTab: () => {},
      onClose: () => {},
      atCapacity: false,
      onAdd: () => {},
    }),
  );
}

test('helium inspector cites CIAAW on mass and keeps phase as a separate unverified badge', () => {
  const html = renderInspector(bySymbol.He);
  const mass = html.match(/data-property="mass"[\s\S]*?data-property="phase"/)?.[0] ?? '';
  const phase = html.match(/data-property="phase"[\s\S]*?<\/p>/)?.[0] ?? '';
  const massRow = html.match(/data-property-row="Atomic mass"[\s\S]*?<\/div>/)?.[0] ?? '';

  assert.match(mass, /4\.002602\(2\)/);
  assert.match(mass, /data-appearance="measured_evaluated"/);
  assert.match(mass, /Measured\/evaluated/);
  assert.match(mass, new RegExp(CIAAW_HELIUM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(mass, /aria-label="Source: https:\/\/ciaaw.org\/helium.htm"/);

  assert.match(phase, /gas/);
  assert.match(phase, /data-appearance="unverified"/);
  assert.match(phase, /Unverified/);
  assert.doesNotMatch(phase, /measured_evaluated/);

  assert.match(massRow, new RegExp(CIAAW_HELIUM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(massRow, /flattened/);
});

test('hydrogen inspector cites abridged CIAAW mass and keeps phase unverified', () => {
  const html = renderInspector(bySymbol.H);
  const mass = html.match(/data-property="mass"[\s\S]*?data-property="phase"/)?.[0] ?? '';
  const phase = html.match(/data-property="phase"[\s\S]*?<\/p>/)?.[0] ?? '';
  const massRow = html.match(/data-property-row="Atomic mass"[\s\S]*?<\/div>/)?.[0] ?? '';

  assert.match(mass, /1\.0080\(2\)/);
  assert.match(mass, /data-appearance="measured_evaluated"/);
  assert.match(mass, /Measured\/evaluated/);
  assert.match(mass, new RegExp(CIAAW_ABRIDGED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(mass, new RegExp(CIAAW_HYDROGEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.match(phase, /gas/);
  assert.match(phase, /data-appearance="unverified"/);
  assert.doesNotMatch(phase, /measured_evaluated/);

  assert.match(massRow, /\[1\.00784, 1\.00811\]/);
  assert.match(massRow, /not a midpoint invented here/);
});

test('hassium inspector withholds 126 K and still exposes the RSC citation', () => {
  const html = renderInspector(bySymbol.Hs);
  const meltRow = html.match(/data-property-row="Melting point"[\s\S]*?<\/div>/)?.[0] ?? '';
  assert.match(meltRow, /Not available/);
  assert.doesNotMatch(meltRow, />126/);
  assert.match(meltRow, /periodic-table\.rsc\.org\/element\/108\/hassium/);
});

test('shell schematic uses presented counts, not a raw bypass', () => {
  const unavailable = presentQuantity({
    value: null,
    status: 'unavailable',
    provenance: 'withheld',
  });
  const empty = renderToStaticMarkup(
    createElement(BohrModel, {
      name: 'Hassium',
      symbol: 'Hs',
      color: '#ffffff',
      shells: unavailable,
    }),
  );
  assert.match(empty, /schematic unavailable/);
  assert.equal([...empty.matchAll(/<circle /g)].length, 1);

  const helium = renderToStaticMarkup(
    createElement(BohrModel, {
      name: 'Helium',
      symbol: 'He',
      color: '#ffffff',
      shells: presentQuantity(bySymbol.He.shells),
    }),
  );
  assert.match(helium, /2 electrons in successive shells/);
});
