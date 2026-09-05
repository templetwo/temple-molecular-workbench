import { bySymbol } from '@/data/elements';
import { MAX_ATOMS, atomRadius, useBench, type PlacedAtom } from '@/state/store';

export const CAT_COLORS: Record<string, string> = {
  'diatomic nonmetal': '#7cd8be',
  'polyatomic nonmetal': '#a1c97e',
  'noble gas': '#b6a0dc',
  'alkali metal': '#e3ba70',
  'alkaline earth metal': '#dc9e79',
  metalloid: '#d5f582',
  'post-transition metal': '#a5b6bc',
  'transition metal': '#8db5e5',
  lanthanide: '#d6a0ba',
  actinide: '#bd9acc',
};

export function catColor(category: string): string {
  return CAT_COLORS[category] ?? '#939b9b';
}

/** Search outward from the canvas center, keeping display spheres separated. */
export function findAtomPlacement(
  atoms: PlacedAtom[],
  sym: string,
): [number, number, number] | null {
  const radius = atomRadius(sym);
  for (let i = 0; i < 2000; i++) {
    const distance = 2.2 * Math.sqrt(i);
    const angle = i * 2.399963229728653;
    const pos: [number, number, number] = [
      Math.cos(angle) * distance,
      0,
      Math.sin(angle) * distance,
    ];
    if (
      atoms.every(
        (atom) =>
          Math.hypot(atom.pos[0] - pos[0], atom.pos[1] - pos[1], atom.pos[2] - pos[2]) >=
          radius + atomRadius(atom.sym) + 0.35,
      )
    )
      return pos;
  }
  return null;
}

/** Add from any library control; returns false if the scene cannot accept it. */
export function addElementToBench(sym: string): boolean {
  const bench = useBench.getState();
  if (!Object.hasOwn(bySymbol, sym) || bench.atoms.length >= MAX_ATOMS) return false;
  const pos = findAtomPlacement(bench.atoms, sym);
  if (!pos) return false;
  bench.addAtom(sym, pos);
  if (useBench.getState().atoms.length !== bench.atoms.length + 1) return false;
  bench.setCard(sym);
  bench.resetView();
  return true;
}
