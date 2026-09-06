import { bySymbol } from '@/data/elements';
import { MOLECULE_PRESETS, byPresetId } from '@/data/molecules';
import { MAX_ATOMS, MAX_BONDS, type Bond, type PlacedAtom } from '@/state/store';

export interface BondingMatch {
  presetId: string;
  /** One complete connected component; never a subgraph with omitted attachments. */
  atomIds: string[];
}

export interface InventorySuggestion {
  presetId: string;
  missingAtoms: Array<{ sym: string; count: number }>;
  missingAtomCount: number;
  extraAtomCount: number;
}

export interface BondingAnalysis {
  status: 'invalid' | 'empty' | 'recognized' | 'composition-only' | 'inventory' | 'outside-library';
  errors: string[];
  matches: BondingMatch[];
  /** Whole-bench composition only, with nonmatching or unfinished connectivity. */
  sameComposition: string[];
  /** Inventory comparisons ignore current bonds: these are not reaction predictions. */
  suggestions: InventorySuggestion[];
  unmatchedAtomIds: string[];
}

export interface MissingGuideBond {
  a: string;
  b: string;
  order: Bond['order'];
  templateBondId: string;
}

export interface WrongGuideBond {
  bondId: string;
  a: string;
  b: string;
  actualOrder: Bond['order'];
  /** null means this pair does not occur in the chosen template mapping. */
  expectedOrder: Bond['order'] | null;
}

export interface BondingProgress {
  status: 'invalid' | 'incomplete' | 'complete';
  errors: string[];
  correctBonds: number;
  totalBonds: number;
  missingBonds: MissingGuideBond[];
  wrongBonds: WrongGuideBond[];
  /** Template IDs, since a corresponding live atom may not exist. */
  missingAtomIds: string[];
  /** Live IDs not assigned to the chosen template. */
  extraAtomIds: string[];
}

type Edge = { to: string; order: Bond['order'] };
type Graph = { symbols: Map<string, string>; adjacency: Map<string, Edge[]> };

const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);

function graphErrors(atoms: readonly PlacedAtom[], bonds: readonly Bond[]): string[] {
  if (atoms.length > MAX_ATOMS || bonds.length > MAX_BONDS)
    return [`Recognition supports at most ${MAX_ATOMS} atoms and ${MAX_BONDS} bonds.`];
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const atom of atoms) {
    if (!atom || !validId(atom.id) || ids.has(atom.id))
      errors.push('An atom identifier is invalid or duplicated.');
    if (!atom || typeof atom.sym !== 'string' || !Object.hasOwn(bySymbol, atom.sym))
      errors.push('An atom has an unknown element symbol.');
    if (
      !atom ||
      !Array.isArray(atom.pos) ||
      atom.pos.length !== 3 ||
      atom.pos.some((value) => !Number.isFinite(value) || Math.abs(value) > 100)
    )
      errors.push('An atom has invalid coordinates.');
    if (atom) ids.add(atom.id);
  }
  const atomIds = new Set(ids);
  const pairs = new Set<string>();
  for (const bond of bonds) {
    if (!bond || !validId(bond.id) || ids.has(bond.id))
      errors.push('A bond identifier is invalid or duplicated.');
    if (!bond) continue;
    ids.add(bond.id);
    if (!atomIds.has(bond.a) || !atomIds.has(bond.b) || bond.a === bond.b)
      errors.push('A bond has a missing endpoint or connects an atom to itself.');
    if (![1, 2, 3].includes(bond.order)) errors.push('A bond has an unsupported order.');
    const pair = pairKey(bond.a, bond.b);
    if (pairs.has(pair)) errors.push('An atom pair has more than one bond record.');
    pairs.add(pair);
  }
  return [...new Set(errors)];
}

function makeGraph(atoms: readonly PlacedAtom[], bonds: readonly Bond[]): Graph {
  const graph: Graph = {
    symbols: new Map(atoms.map((atom) => [atom.id, atom.sym])),
    adjacency: new Map(atoms.map((atom) => [atom.id, []])),
  };
  for (const bond of bonds) {
    graph.adjacency.get(bond.a)!.push({ to: bond.b, order: bond.order });
    graph.adjacency.get(bond.b)!.push({ to: bond.a, order: bond.order });
  }
  return graph;
}

function components(graph: Graph): string[][] {
  const seen = new Set<string>();
  const result: string[][] = [];
  for (const id of graph.symbols.keys()) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const pending = [id];
    seen.add(id);
    while (pending.length) {
      const current = pending.pop()!;
      group.push(current);
      for (const { to } of graph.adjacency.get(current)!) {
        if (seen.has(to)) continue;
        seen.add(to);
        pending.push(to);
      }
    }
    result.push(group);
  }
  return result;
}

/**
 * Exact labeled, bond-order-aware signatures for the six reference graphs.
 * Five are trees and benzene is unicyclic. Canonical rooted-tree encodings and
 * both directions/rotations of a cycle avoid factorial isomorphism searches.
 * Other graph classes deliberately return no reference signature. Coordinates
 * do not enter recognition: a match establishes connectivity, not geometry,
 * stability, identity including charge/isotopes, or a reaction outcome.
 */
function signature(graph: Graph, ids: string[]): string | null {
  if (!ids.length || ids.length > 12) return null;
  const edgeCount = ids.reduce((sum, id) => sum + graph.adjacency.get(id)!.length, 0) / 2;
  if (edgeCount !== ids.length - 1 && edgeCount !== ids.length) return null;

  const rooted = (id: string, parent: string | null, blocked: Set<string>): string => {
    const children = graph.adjacency
      .get(id)!
      .filter(({ to }) => to !== parent && !blocked.has(to))
      .map(({ to, order }) => JSON.stringify([order, rooted(to, id, blocked)]))
      .sort();
    return JSON.stringify([graph.symbols.get(id), children]);
  };

  if (edgeCount === ids.length - 1)
    return `tree:${ids.map((id) => rooted(id, null, new Set())).sort()[0]}`;

  // Peel all attached trees, leaving the unique cycle of a connected graph.
  const degree = new Map(ids.map((id) => [id, graph.adjacency.get(id)!.length]));
  const pending = ids.filter((id) => degree.get(id) === 1);
  while (pending.length) {
    const id = pending.pop()!;
    degree.set(id, 0);
    for (const { to } of graph.adjacency.get(id)!) {
      const current = degree.get(to)!;
      if (!current) continue;
      degree.set(to, current - 1);
      if (current === 2) pending.push(to);
    }
  }
  const cycle = new Set(ids.filter((id) => degree.get(id)! > 0));
  if (cycle.size < 3 || [...cycle].some((id) => degree.get(id) !== 2)) return null;
  const encodings: string[] = [];
  for (const start of cycle) {
    for (const first of graph.adjacency.get(start)!.filter(({ to }) => cycle.has(to))) {
      const sequence: string[] = [];
      let current = start;
      let next = first;
      do {
        sequence.push(JSON.stringify([rooted(current, null, cycle), next.order]));
        const previous = current;
        current = next.to;
        next = graph.adjacency.get(current)!.find(({ to }) => cycle.has(to) && to !== previous)!;
      } while (current !== start);
      encodings.push(JSON.stringify(sequence));
    }
  }
  return `cycle:${encodings.sort()[0]}`;
}

function counts(atoms: readonly Pick<PlacedAtom, 'sym'>[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const { sym } of atoms) result.set(sym, (result.get(sym) ?? 0) + 1);
  return result;
}

const references = MOLECULE_PRESETS.map((preset) => ({
  id: preset.id,
  atomCount: preset.atoms.length,
  counts: counts(preset.atoms),
  signature: signature(
    makeGraph(preset.atoms, preset.bonds),
    preset.atoms.map(({ id }) => id),
  ),
}));

/** Compare a drawing with the finite reference library, never predict chemistry. */
export function analyzeBonding(
  atoms: readonly PlacedAtom[],
  bonds: readonly Bond[],
): BondingAnalysis {
  const errors = graphErrors(atoms, bonds);
  const result: BondingAnalysis = {
    status: errors.length ? 'invalid' : atoms.length ? 'outside-library' : 'empty',
    errors,
    matches: [],
    sameComposition: [],
    suggestions: [],
    unmatchedAtomIds: atoms.map((atom) => atom?.id).filter((id) => typeof id === 'string'),
  };
  if (errors.length || !atoms.length) return result;

  const graph = makeGraph(atoms, bonds);
  for (const atomIds of components(graph)) {
    const candidates = references.filter((reference) => reference.atomCount === atomIds.length);
    if (!candidates.length) continue;
    const key = signature(graph, atomIds);
    const reference = candidates.find((candidate) => key !== null && candidate.signature === key);
    if (reference) result.matches.push({ presetId: reference.id, atomIds });
  }
  const matched = new Set(result.matches.flatMap(({ atomIds }) => atomIds));
  result.unmatchedAtomIds = atoms.filter(({ id }) => !matched.has(id)).map(({ id }) => id);

  const inventory = counts(atoms);
  for (const reference of references) {
    let extraAtomCount = 0;
    let shared = 0;
    const missingAtoms: InventorySuggestion['missingAtoms'] = [];
    for (const sym of new Set([...reference.counts.keys(), ...inventory.keys()])) {
      const needed = reference.counts.get(sym) ?? 0;
      const available = inventory.get(sym) ?? 0;
      shared += Math.min(needed, available);
      extraAtomCount += Math.max(0, available - needed);
      if (needed > available) missingAtoms.push({ sym, count: needed - available });
    }
    const missingAtomCount = missingAtoms.reduce((sum, atom) => sum + atom.count, 0);
    const sameComposition = missingAtomCount === 0 && extraAtomCount === 0;
    if (sameComposition && !result.matches.some((match) => match.presetId === reference.id))
      result.sameComposition.push(reference.id);
    if (shared > 0 && (missingAtomCount === 0 || extraAtomCount === 0))
      result.suggestions.push({
        presetId: reference.id,
        missingAtoms,
        missingAtomCount,
        extraAtomCount,
      });
  }
  result.suggestions.sort(
    (a, b) => a.missingAtomCount - b.missingAtomCount || a.extraAtomCount - b.extraAtomCount,
  );
  result.status = result.matches.length
    ? 'recognized'
    : result.sameComposition.length
      ? 'composition-only'
      : result.suggestions.length
        ? 'inventory'
        : 'outside-library';
  return result;
}

/**
 * Hints for an explicit guided reference build. The default mapping uses the
 * reference atom IDs; atomMap can map template IDs to renamed live atom IDs.
 * Partial hints target that mapping, not a claim that every alternate partial
 * drawing is chemically wrong. A completed isomorphic graph is accepted even
 * when equivalent atoms or the alternate benzene Kekulé drawing are used.
 * This function never changes the drawing or its coordinates.
 */
export function getBondingProgress(
  presetId: string,
  atoms: readonly PlacedAtom[],
  bonds: readonly Bond[],
  atomMap?: Readonly<Record<string, string>>,
): BondingProgress {
  const preset = Object.hasOwn(byPresetId, presetId) ? byPresetId[presetId] : undefined;
  const result: BondingProgress = {
    status: 'invalid',
    errors: graphErrors(atoms, bonds),
    correctBonds: 0,
    totalBonds: preset?.bonds.length ?? 0,
    missingBonds: [],
    wrongBonds: [],
    missingAtomIds: [],
    extraAtomIds: [],
  };
  if (!preset) result.errors.push('This guide is outside the six-reference library.');
  if (!preset || result.errors.length) return result;

  const live = new Map(atoms.map((atom) => [atom.id, atom]));
  const mapping = new Map<string, string>();
  const assigned = new Set<string>();
  for (const template of preset.atoms) {
    const id = atomMap ? atomMap[template.id] : template.id;
    if (id === undefined || !live.has(id)) {
      result.missingAtomIds.push(template.id);
      continue;
    }
    if (assigned.has(id))
      result.errors.push('The guide maps more than one template atom to one live atom.');
    if (live.get(id)!.sym !== template.sym)
      result.errors.push('A mapped atom has the wrong element for the guide.');
    assigned.add(id);
    mapping.set(template.id, id);
  }
  result.extraAtomIds = atoms.filter(({ id }) => !assigned.has(id)).map(({ id }) => id);
  if (result.errors.length) return result;

  // Completion is independent of the chosen atom numbering and coordinates.
  const analysis = analyzeBonding(atoms, bonds);
  if (
    analysis.unmatchedAtomIds.length === 0 &&
    analysis.matches.length === 1 &&
    analysis.matches[0].presetId === presetId
  ) {
    result.status = 'complete';
    result.correctBonds = result.totalBonds;
    result.missingAtomIds = [];
    result.extraAtomIds = [];
    return result;
  }

  const actual = new Map(bonds.map((bond) => [pairKey(bond.a, bond.b), bond]));
  const expected = new Map<string, Bond['order']>();
  for (const bond of preset.bonds) {
    const a = mapping.get(bond.a);
    const b = mapping.get(bond.b);
    if (!a || !b) continue;
    const key = pairKey(a, b);
    expected.set(key, bond.order);
    const present = actual.get(key);
    if (!present) result.missingBonds.push({ a, b, order: bond.order, templateBondId: bond.id });
    else if (present.order === bond.order) result.correctBonds++;
  }
  for (const bond of bonds) {
    const expectedOrder = expected.get(pairKey(bond.a, bond.b)) ?? null;
    if (expectedOrder !== bond.order)
      result.wrongBonds.push({
        bondId: bond.id,
        a: bond.a,
        b: bond.b,
        actualOrder: bond.order,
        expectedOrder,
      });
  }
  result.status = 'incomplete';
  return result;
}
