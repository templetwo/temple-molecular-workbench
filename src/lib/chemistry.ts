import type { Bond, PlacedAtom } from '@/state/store';

// Advisory bond-order totals for a deliberately limited set of common neutral
// covalent atoms. Charges, radicals, hypervalence and metal coordination require
// more information than this sketch format contains.
const COMMON_NEUTRAL_VALENCE: Readonly<Record<string, number>> = {
  H: 1,
  B: 3,
  C: 4,
  N: 3,
  O: 2,
  F: 1,
  Si: 4,
  Cl: 1,
  Br: 1,
  I: 1,
};

export function analyzeStructure(
  atoms: PlacedAtom[],
  bonds: Bond[],
): { components: number; warnings: string[] } {
  const warnings: string[] = [];
  const adjacency = new Map(atoms.map((atom) => [atom.id, new Set<string>()]));
  const totals = new Map(atoms.map((atom) => [atom.id, 0]));
  const pairs = new Set<string>();
  const bondIds = new Set<string>();
  if (adjacency.size !== atoms.length)
    warnings.push('Duplicate atom identifiers make this graph ambiguous.');

  for (const bond of bonds) {
    if (bondIds.has(bond.id)) warnings.push('Duplicate bond identifiers were found.');
    bondIds.add(bond.id);
    if (!adjacency.has(bond.a) || !adjacency.has(bond.b)) {
      warnings.push('A bond refers to an atom that is missing.');
      continue;
    }
    if (bond.a === bond.b) {
      warnings.push('An atom cannot bond to itself in this model.');
      continue;
    }
    if (![1, 2, 3].includes(bond.order)) {
      warnings.push('A bond has an unsupported bond order.');
      continue;
    }
    const pair = JSON.stringify([bond.a, bond.b].sort());
    if (pairs.has(pair)) {
      warnings.push('More than one bond record connects the same pair of atoms.');
      continue;
    }
    pairs.add(pair);
    adjacency.get(bond.a)!.add(bond.b);
    adjacency.get(bond.b)!.add(bond.a);
    totals.set(bond.a, totals.get(bond.a)! + bond.order);
    totals.set(bond.b, totals.get(bond.b)! + bond.order);
  }

  let components = 0;
  const visited = new Set<string>();
  for (const id of adjacency.keys()) {
    if (visited.has(id)) continue;
    components++;
    const pending = [id];
    while (pending.length) {
      const current = pending.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of adjacency.get(current)!) if (!visited.has(next)) pending.push(next);
    }
  }
  if (components > 1)
    warnings.push(
      `${components} separate fragments are present; the formula totals the whole bench.`,
    );

  const unusual = new Map<string, number>();
  for (const atom of atoms) {
    if (!Object.hasOwn(COMMON_NEUTRAL_VALENCE, atom.sym)) continue;
    const usual = COMMON_NEUTRAL_VALENCE[atom.sym];
    const total = totals.get(atom.id)!;
    if (total !== usual) {
      const message = `${atom.sym}: bond-order total ${total}, commonly ${usual} for a neutral covalent atom.`;
      unusual.set(message, (unusual.get(message) ?? 0) + 1);
    }
  }
  for (const [message, count] of unusual)
    warnings.push(count > 1 ? `${count} atoms — ${message}` : message);
  return { components, warnings: [...new Set(warnings)] };
}
