import { bySymbol } from '@/data/elements';
import { combineNumericQuantities, weakestStatus, type Quantity, type ScientificStatus } from '@/data/element-properties';
import {
  R_J_PER_MOL_K,
  STANDARD_T_K,
  atomCountMap,
  type Species,
} from '@/data/molecule-properties';

export const COEFFICIENT_BOUND = 16;

export type BalanceFailure =
  | { kind: 'not-conserved'; detail: string }
  | { kind: 'unbalanceable'; detail: string }
  | { kind: 'bound-exceeded'; detail: string }
  | { kind: 'empty'; detail: string };

export interface BalanceSuccess {
  kind: 'ok';
  coefficients: number[];
}

export type BalanceResult = BalanceSuccess | BalanceFailure;

export interface ReactionSide {
  species: Species;
  moles: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function gcdAll(values: number[]): number {
  return values.reduce((acc, value) => gcd(acc, value), values[0] ?? 1);
}

function composition(species: Species[]): Map<string, number[]> {
  const elements = new Set<string>();
  for (const item of species) for (const el of Object.keys(item.atoms)) elements.add(el);
  const matrix = new Map<string, number[]>();
  for (const el of elements) {
    matrix.set(
      el,
      species.map((item) => item.atoms[el] ?? 0),
    );
  }
  return matrix;
}

function residual(matrix: Map<string, number[]>, nu: number[], signs: number[]): number {
  let score = 0;
  for (const row of matrix.values()) {
    let sum = 0;
    for (let i = 0; i < nu.length; i++) sum += signs[i] * nu[i] * row[i];
    score += Math.abs(sum);
  }
  return score;
}

export function balanceReaction(reactants: Species[], products: Species[]): BalanceResult {
  if (!reactants.length || !products.length) {
    return { kind: 'empty', detail: 'Choose at least one reactant and one product.' };
  }
  const species = [...reactants, ...products];
  const signs = [...reactants.map(() => -1), ...products.map(() => 1)];
  const matrix = composition(species);
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  for (const item of reactants)
    for (const [el, n] of atomCountMap(item.atoms)) left.set(el, (left.get(el) ?? 0) + n);
  for (const item of products)
    for (const [el, n] of atomCountMap(item.atoms)) right.set(el, (right.get(el) ?? 0) + n);
  const elements = new Set([...left.keys(), ...right.keys()]);
  for (const el of elements) {
    if ((left.get(el) ?? 0) === 0 || (right.get(el) ?? 0) === 0) {
      return {
        kind: 'not-conserved',
        detail: `Element ${el} appears on only one side. The declaration is incomplete.`,
      };
    }
  }

  const n = species.length;
  // Partial-residual pruning: for each element row, find the last species index that
  // actually contributes to it. Once that index is assigned, the row's total is final
  // for this branch (no later species can change it) — so a nonzero row can be rejected
  // immediately instead of exhausting every assignment of the remaining species.
  const finalizedAt: string[][] = Array.from({ length: n }, () => []);
  for (const [el, row] of matrix) {
    let lastIndex = -1;
    for (let i = 0; i < n; i++) if (row[i] !== 0) lastIndex = i;
    if (lastIndex >= 0) finalizedAt[lastIndex].push(el);
  }
  const start = Date.now();
  let best: number[] | null = null;
  const search = (index: number, current: number[]) => {
    if (Date.now() - start > 80) return;
    if (index === n) {
      if (residual(matrix, current, signs) !== 0) return;
      const scale = gcdAll(current);
      const reduced = current.map((value) => value / scale);
      if (!best || reduced.reduce((a, b) => a + b, 0) < best.reduce((a, b) => a + b, 0))
        best = reduced;
      return;
    }
    for (let value = 1; value <= COEFFICIENT_BOUND; value++) {
      current[index] = value;
      let pruned = false;
      for (const el of finalizedAt[index]) {
        const row = matrix.get(el)!;
        let sum = 0;
        for (let i = 0; i <= index; i++) sum += signs[i] * current[i] * row[i];
        if (sum !== 0) {
          pruned = true;
          break;
        }
      }
      if (!pruned) search(index + 1, current);
      if (best) return;
    }
  };
  search(0, Array(n).fill(1));
  if (Date.now() - start > 80 && !best) {
    return {
      kind: 'bound-exceeded',
      detail: `No integer balance was found within ${COEFFICIENT_BOUND} and the search time bound.`,
    };
  }
  if (!best) {
    return {
      kind: 'unbalanceable',
      detail: 'No small-integer balance exists for this conserved declaration.',
    };
  }
  return { kind: 'ok', coefficients: best };
}

export type StoichAmounts =
  | {
      kind: 'ok';
      limitingIndex: number;
      theoreticalMoles: number[];
      /** Mass of the first listed product over the mass of all reactants, balanced equation. */
      atomEconomy: number;
    }
  | { kind: 'no-amounts'; detail: string };

export function stoichFromMoles(
  species: Species[],
  coefficients: number[],
  reactantCount: number,
  suppliedMoles: number[],
): StoichAmounts {
  let limitingIndex = -1;
  let minExtent = Infinity;
  for (let i = 0; i < reactantCount; i++) {
    const supplied = suppliedMoles[i];
    if (!Number.isFinite(supplied) || supplied <= 0) continue;
    const extent = supplied / coefficients[i];
    if (extent < minExtent) {
      minExtent = extent;
      limitingIndex = i;
    }
  }
  if (limitingIndex === -1) {
    return {
      kind: 'no-amounts',
      detail: 'Enter a positive amount for at least one reactant.',
    };
  }
  const theoreticalMoles = coefficients.map((nu) => nu * minExtent);
  // Atom economy (Trost): mass of the desired product over the mass of all reactants,
  // for the balanced equation. The first listed product is taken as the desired one.
  // Summing every product would always give 1 for a balanced equation and measure nothing.
  let desiredProductMass = 0;
  let reactantMass = 0;
  for (let i = 0; i < species.length; i++) {
    let mass = 0;
    for (const [el, n] of Object.entries(species[i].atoms)) {
      mass += n * (bySymbol[el]?.mass.value ?? 0);
    }
    const term = coefficients[i] * mass;
    if (i < reactantCount) reactantMass += term;
    else if (i === reactantCount) desiredProductMass = term;
  }
  return {
    kind: 'ok',
    limitingIndex,
    theoreticalMoles,
    atomEconomy: reactantMass > 0 ? desiredProductMass / reactantMass : 0,
  };
}

export interface ReactionThermo {
  dh: Quantity<number>;
  ds: Quantity<number>;
  dg: Quantity<number>;
  k: Quantity<number>;
  mixedEvaluations: boolean;
}

function signedSum(
  species: Species[],
  coefficients: number[],
  signs: number[],
  pick: (species: Species) => Quantity<number>,
  units: string,
): Quantity<number> {
  const parts: Quantity<number>[] = [];
  for (let i = 0; i < species.length; i++) {
    const quantity = pick(species[i]);
    if (quantity.status === 'unavailable' || quantity.value === null) {
      return {
        value: null,
        status: 'unavailable',
        provenance: 'inherited',
        withheldReason: 'A reaction total is not shown when any participating species lacks a cited value. Missing formation data is never treated as zero.',
      };
    }
    parts.push({
      ...quantity,
      value: signs[i] * coefficients[i] * (quantity.value as number),
    });
  }
  const combined = combineNumericQuantities(parts);
  return {
    ...combined,
    context: {
      ...combined.context,
      units,
      temperatureK: STANDARD_T_K,
      pressurePa: 100_000,
      precisionNote:
        'Arithmetic over cited formation data at 298.15 K and 1 bar, not a predicted process enthalpy. Standard-state arithmetic, not equilibrium at plant conditions.',
    },
  };
}

export function reactionThermo(
  reactants: Species[],
  products: Species[],
  coefficients: number[],
): ReactionThermo {
  const species = [...reactants, ...products];
  const signs = [...reactants.map(() => -1), ...products.map(() => 1)];
  const mixedEvaluations = new Set(species.map((item) => item.evaluation)).size > 1;
  const dh = signedSum(species, coefficients, signs, (item) => item.hf, 'kJ/mol');
  const ds = signedSum(species, coefficients, signs, (item) => item.entropy, 'J/mol·K');
  let dg: Quantity<number>;
  if (dh.status === 'unavailable' || ds.status === 'unavailable' || dh.value === null || ds.value === null) {
    dg = {
      value: null,
      status: 'unavailable',
      provenance: 'inherited',
      withheldReason: 'ΔrG° needs both cited ΔfH° and S° for every participating species.',
    };
  } else {
    const value = (dh.value as number) - (STANDARD_T_K * (ds.value as number)) / 1000;
    const status = weakestStatus([dh.status, ds.status] as ScientificStatus[]);
    dg = {
      value,
      status,
      provenance: dh.provenance === 'cited' && ds.provenance === 'cited' ? 'cited' : 'inherited',
      sources: [...new Set([...(dh.sources ?? []), ...(ds.sources ?? [])])],
      context: {
        units: 'kJ/mol',
        temperatureK: STANDARD_T_K,
        pressurePa: 100_000,
        displayDecimals: 2,
        precisionNote: 'ΔrG° = ΔrH° − TΔrS° at 298.15 K using cited formation data.',
      },
    };
  }
  let k: Quantity<number>;
  if (dg.status === 'unavailable' || dg.value === null) {
    k = {
      value: null,
      status: 'unavailable',
      provenance: 'inherited',
      withheldReason: 'K(298.15 K) is not shown without a cited ΔrG°.',
    };
  } else {
    const exponent = (-(dg.value as number) * 1000) / (R_J_PER_MOL_K * STANDARD_T_K);
    const value = Math.exp(exponent);
    k = {
      value: Number.isFinite(value) ? value : null,
      status: Number.isFinite(value) ? dg.status : 'unavailable',
      provenance: dg.provenance,
      sources: dg.sources,
      context: {
        temperatureK: STANDARD_T_K,
        pressurePa: 100_000,
        precisionNote: 'K = exp(−ΔrG°/RT) at 298.15 K with the CODATA 2018 gas constant. Not a process equilibrium constant.',
      },
      withheldReason: Number.isFinite(value) ? undefined : 'K overflowed the finite numeric range.',
    };
  }
  return { dh, ds, dg, k, mixedEvaluations };
}
