import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PropertyStatus from '../src/components/PropertyStatus';
import { combineNumericQuantities, presentQuantity } from '../src/data/element-properties';

const presentation = presentQuantity(
  combineNumericQuantities([
    {
      value: 1,
      status: 'measured_evaluated',
      provenance: 'cited',
      sources: ['https://example.org/first'],
    },
    {
      value: 2,
      status: 'calculated_predicted',
      provenance: 'cited',
      sources: ['https://example.org/second', 'https://example.org/first'],
    },
  ]),
);

test('property citation renderer gives distinct sources distinct links and labels', () => {
  const html = renderToStaticMarkup(createElement(PropertyStatus, { presentation }));
  assert.equal([...html.matchAll(/<a /g)].length, 2);
  assert.match(html, /href="https:\/\/example.org\/first"/);
  assert.match(html, /href="https:\/\/example.org\/second"/);
  assert.match(html, /aria-label="Source: https:\/\/example.org\/first"/);
  assert.match(html, /aria-label="Source: https:\/\/example.org\/second"/);
  assert.match(html, /Arithmetic sum/);
  assert.doesNotMatch(html, /href="[^"]* · /);
});

test('compact property metadata has no interactive descendants or long context', () => {
  const html = renderToStaticMarkup(createElement(PropertyStatus, { presentation, compact: true }));
  assert.match(html, /Calculated\/predicted/);
  assert.doesNotMatch(html, /<a |<button|tabindex|property-source|property-detail/);
  assert.doesNotMatch(html, /Arithmetic sum/);
});

test('property renderer rejects unsafe citation URLs even if presentation is injected directly', () => {
  const html = renderToStaticMarkup(
    createElement(PropertyStatus, {
      presentation: {
        ...presentation,
        sources: ['javascript:alert(1)', 'data:text/html,test', 'https://example.org/safe'],
      },
    }),
  );
  assert.equal([...html.matchAll(/<a /g)].length, 1);
  assert.match(html, /href="https:\/\/example.org\/safe"/);
  assert.doesNotMatch(html, /javascript:|data:text/);
});
