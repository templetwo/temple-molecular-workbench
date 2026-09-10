import test from 'node:test';
import assert from 'node:assert/strict';
import { exportXyz, parseXyz } from '../src/lib/xyz';
import { MAX_ATOMS } from '../src/state/store';
import type { PlacedAtom } from '../src/state/store';

test('a whitespace-only count line throws', () => {
  assert.throws(() => parseXyz('   \ncomment\nH 0 0 0\n'), /atom count/i);
});

test('an empty count line throws', () => {
  assert.throws(() => parseXyz('\ncomment\nH 0 0 0\n'), /atom count/i);
});

test('a signed or decimal count line throws', () => {
  assert.throws(() => parseXyz('+1\ncomment\nH 0 0 0\n'), /atom count/i);
  assert.throws(() => parseXyz('1.0\ncomment\nH 0 0 0\n'), /atom count/i);
  assert.throws(() => parseXyz('-1\ncomment\nH 0 0 0\n'), /atom count/i);
});

test('more atom lines than the declared count throws', () => {
  assert.throws(
    () => parseXyz('1\ncomment\nH 0 0 0\nO 1 1 1\n'),
    /more atom lines/i,
  );
});

test('a valid two-atom file round-trips through exportXyz then parseXyz', () => {
  const atoms: PlacedAtom[] = [
    { id: 'a1', sym: 'H', pos: [0, 0, 0] },
    { id: 'a2', sym: 'O', pos: [1.5, -2.25, 0.125] },
  ];
  const exported = exportXyz(atoms, 'round trip');
  const { atoms: parsed, bonds } = parseXyz(exported);
  assert.equal(parsed.length, 2);
  assert.deepEqual(bonds, []);
  assert.equal(parsed[0].sym, 'H');
  assert.deepEqual(parsed[0].pos, [0, 0, 0]);
  assert.equal(parsed[1].sym, 'O');
  assert.deepEqual(parsed[1].pos, [1.5, -2.25, 0.125]);
});

test('an atom count above MAX_ATOMS still throws', () => {
  const tooMany = MAX_ATOMS + 1;
  const lines = [
    String(tooMany),
    'too many atoms',
    ...Array.from({ length: tooMany }, () => 'H 0 0 0'),
  ];
  assert.throws(() => parseXyz(`${lines.join('\n')}\n`), /atom count/i);
});

test('a coordinate outside the allowed range still throws', () => {
  assert.throws(
    () => parseXyz('1\ncomment\nH 0 0 999\n'),
    /invalid coordinates/i,
  );
});

test('CRLF line endings parse', () => {
  const raw = '2\r\ncrlf comment\r\nH 0 0 0\r\nO 1 1 1\r\n';
  const { atoms } = parseXyz(raw);
  assert.equal(atoms.length, 2);
  assert.equal(atoms[0].sym, 'H');
  assert.deepEqual(atoms[0].pos, [0, 0, 0]);
  assert.equal(atoms[1].sym, 'O');
  assert.deepEqual(atoms[1].pos, [1, 1, 1]);
});
