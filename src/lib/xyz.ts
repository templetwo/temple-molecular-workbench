import { bySymbol } from '@/data/elements';
import { MAX_ATOMS, type Bond, type PlacedAtom } from '@/state/store';

const MAX_COORDINATE = 100;

const MAX_XYZ_BYTES = 256_000;

export function exportXyz(atoms: PlacedAtom[], title = 'Temple Lab workspace'): string {
  const lines = [
    String(atoms.length),
    title.replace(/\r?\n/g, ' '),
    ...atoms.map(
      (atom) =>
        `${atom.sym.padEnd(2, ' ')}  ${atom.pos[0].toFixed(6)}  ${atom.pos[1].toFixed(6)}  ${atom.pos[2].toFixed(6)}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function parseXyz(raw: string): { atoms: PlacedAtom[]; bonds: Bond[] } {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > MAX_XYZ_BYTES) {
    throw new Error('XYZ file is too large (maximum 256 KB).');
  }
  const lines = raw.replace(/\r/g, '').split('\n').filter((line, i, all) => i < all.length - 1 || line.trim());
  if (lines.length < 2) throw new Error('XYZ file is missing an atom count or comment line.');
  const countLine = lines[0].trim();
  if (!/^\d+$/.test(countLine)) {
    throw new Error(`XYZ atom count must be an integer from 0 to ${MAX_ATOMS}.`);
  }
  const count = Number(countLine);
  if (!Number.isSafeInteger(count) || count > MAX_ATOMS) {
    throw new Error(`XYZ atom count must be an integer from 0 to ${MAX_ATOMS}.`);
  }
  const body = lines.slice(2);
  if (body.length < count) throw new Error('XYZ file has fewer atom lines than its header count.');
  if (body.length > count) throw new Error('XYZ file has more atom lines than its header count.');
  const atoms: PlacedAtom[] = [];
  for (let i = 0; i < count; i++) {
    const parts = body[i].trim().split(/\s+/);
    if (parts.length < 4) throw new Error(`XYZ atom ${i + 1} is missing coordinates.`);
    const sym = parts[0];
    if (!Object.hasOwn(bySymbol, sym)) throw new Error(`XYZ atom ${i + 1} uses an unknown element.`);
    const pos: [number, number, number] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    if (pos.some((n) => !Number.isFinite(n) || Math.abs(n) > MAX_COORDINATE)) {
      throw new Error(`XYZ atom ${i + 1} has invalid coordinates (limit ±${MAX_COORDINATE} Å).`);
    }
    atoms.push({ id: `xyz-a${i + 1}`, sym, pos });
  }
  return { atoms, bonds: [] };
}
