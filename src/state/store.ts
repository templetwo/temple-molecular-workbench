import { create } from 'zustand';
import { bySymbol } from '@/data/elements';
import { combineNumericQuantities, type Quantity } from '@/data/element-properties';
import { byPresetId } from '@/data/molecules';

export interface PlacedAtom {
  id: string;
  sym: string;
  pos: [number, number, number];
}

export interface Bond {
  id: string;
  a: string;
  b: string;
  order: 1 | 2 | 3;
}

export type Mode = 'move' | 'bond' | 'delete';
export type DisplayStyle = 'ball-stick' | 'space-fill' | 'wireframe';
export interface SceneSnapshot {
  atoms: PlacedAtom[];
  bonds: Bond[];
  activePresetId: string | null;
}
interface DisplaySettings {
  displayStyle: DisplayStyle;
  showLabels: boolean;
  showGrid: boolean;
  autoRotate: boolean;
}

export interface BenchState extends SceneSnapshot, DisplaySettings {
  mode: Mode;
  selectedId: string | null;
  bondSourceId: string | null;
  cardSym: string | null;
  tableOpen: boolean;
  past: SceneSnapshot[];
  future: SceneSnapshot[];
  resetViewToken: number;
  setMode: (m: Mode) => void;
  setCard: (sym: string | null) => void;
  toggleTable: () => void;
  addAtom: (sym: string, pos: [number, number, number]) => void;
  moveAtom: (id: string, pos: [number, number, number]) => void;
  beginMove: () => void;
  endMove: () => void;
  removeAtom: (id: string) => void;
  select: (id: string | null) => void;
  clickAtomBond: (id: string) => void;
  removeBond: (id: string) => void;
  cycleBond: (id: string) => void;
  clearAll: () => void;
  undo: () => void;
  redo: () => void;
  loadPreset: (id: string) => void;
  setDisplayStyle: (style: DisplayStyle) => void;
  toggleLabels: () => void;
  toggleGrid: () => void;
  toggleAutoRotate: () => void;
  resetView: () => void;
  importScene: (raw: string) => { ok: boolean; error?: string };
  exportScene: () => string;
}

export const MAX_ATOMS = 128;
export const MAX_BONDS = 384;
export const HISTORY_LIMIT = 50;
export const SCENE_STORAGE_KEY = 'molecule-studio:scene:v1';
const MAX_SCENE_BYTES = 256_000;
const MAX_COORDINATE = 100;
const defaultDisplay: DisplaySettings = {
  displayStyle: 'ball-stick',
  showLabels: true,
  showGrid: true,
  autoRotate: false,
};
type SceneStorage = Pick<Storage, 'getItem' | 'setItem'>;

const validSymbol = (sym: unknown): sym is string =>
  typeof sym === 'string' && Object.hasOwn(bySymbol, sym);
const validPosition = (pos: unknown): pos is PlacedAtom['pos'] =>
  Array.isArray(pos) &&
  pos.length === 3 &&
  pos.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE);
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validStyle = (style: unknown): style is DisplayStyle =>
  ['ball-stick', 'space-fill', 'wireframe'].includes(style as string);

function snapshot(scene: SceneSnapshot): SceneSnapshot {
  return {
    atoms: scene.atoms.map((atom) => ({ ...atom, pos: [...atom.pos] })),
    bonds: scene.bonds.map((bond) => ({ ...bond })),
    activePresetId: scene.activePresetId,
  };
}
const sameScene = (a: SceneSnapshot, b: SceneSnapshot) => JSON.stringify(a) === JSON.stringify(b);
const presetScene = (id: string): SceneSnapshot =>
  snapshot({ ...byPresetId[id], activePresetId: id });

/** Parse into fresh, allowlisted values before touching live state or history. */
export function parseScene(raw: string): SceneSnapshot & DisplaySettings {
  if (
    typeof raw !== 'string' ||
    raw.length > MAX_SCENE_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_SCENE_BYTES
  )
    throw new Error('Scene file is too large (maximum 256 KB).');
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (
    !isRecord(data) ||
    data.schemaVersion !== 1 ||
    data.kind !== 'molecule-studio' ||
    data.units !== 'angstrom'
  ) {
    throw new Error(
      'Expected a Molecule Studio scene, schema version 1, with angstrom coordinates.',
    );
  }
  if (!Array.isArray(data.atoms) || data.atoms.length > MAX_ATOMS)
    throw new Error(`A scene must contain an atom list with at most ${MAX_ATOMS} atoms.`);
  if (!Array.isArray(data.bonds) || data.bonds.length > MAX_BONDS)
    throw new Error(`A scene must contain a bond list with at most ${MAX_BONDS} bonds.`);
  const ids = new Set<string>();
  const atoms: PlacedAtom[] = data.atoms.map((atom, i) => {
    if (
      !isRecord(atom) ||
      !validId(atom.id) ||
      ids.has(atom.id) ||
      !validSymbol(atom.sym) ||
      !validPosition(atom.pos)
    ) {
      throw new Error(
        `Atom ${i + 1} has an invalid or duplicate ID, unknown element, or invalid coordinates (limit ±100 Å).`,
      );
    }
    ids.add(atom.id);
    return { id: atom.id, sym: atom.sym, pos: [...atom.pos] };
  });
  const atomIds = new Set(ids);
  const pairs = new Set<string>();
  const bonds: Bond[] = data.bonds.map((bond, i) => {
    if (
      !isRecord(bond) ||
      !validId(bond.id) ||
      ids.has(bond.id) ||
      typeof bond.a !== 'string' ||
      typeof bond.b !== 'string' ||
      !atomIds.has(bond.a) ||
      !atomIds.has(bond.b) ||
      bond.a === bond.b ||
      ![1, 2, 3].includes(bond.order as number)
    ) {
      throw new Error(`Bond ${i + 1} has an invalid ID, endpoint, or order.`);
    }
    const pair = JSON.stringify([bond.a, bond.b].sort());
    if (pairs.has(pair)) throw new Error(`Bond ${i + 1} duplicates an existing atom pair.`);
    pairs.add(pair);
    ids.add(bond.id);
    return { id: bond.id, a: bond.a, b: bond.b, order: bond.order as Bond['order'] };
  });
  let activePresetId: string | null = null;
  if (data.activePresetId !== undefined && data.activePresetId !== null) {
    if (typeof data.activePresetId !== 'string' || !Object.hasOwn(byPresetId, data.activePresetId))
      throw new Error('Unknown molecule preset.');
    // A changed structure must never inherit a reference molecule's identity.
    if (
      sameScene(
        { atoms, bonds, activePresetId: data.activePresetId },
        presetScene(data.activePresetId),
      )
    )
      activePresetId = data.activePresetId;
  }
  const display = { ...defaultDisplay };
  if (data.display !== undefined) {
    if (!isRecord(data.display)) throw new Error('Invalid display settings.');
    if (data.display.style !== undefined) {
      if (!validStyle(data.display.style)) throw new Error('Unknown display style.');
      display.displayStyle = data.display.style;
    }
    for (const [key, target] of [
      ['labels', 'showLabels'],
      ['grid', 'showGrid'],
      ['autoRotate', 'autoRotate'],
    ] as const) {
      if (data.display[key] !== undefined) {
        if (typeof data.display[key] !== 'boolean') throw new Error(`Invalid ${key} setting.`);
        display[target] = data.display[key];
      }
    }
  }
  return { atoms, bonds, activePresetId, ...display };
}

function serializeScene(scene: SceneSnapshot & DisplaySettings): string {
  return JSON.stringify(
    {
      kind: 'molecule-studio',
      schemaVersion: 1,
      units: 'angstrom',
      ...snapshot(scene),
      display: {
        style: scene.displayStyle,
        labels: scene.showLabels,
        grid: scene.showGrid,
        autoRotate: scene.autoRotate,
      },
    },
    null,
    2,
  );
}
function browserStorage(): SceneStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Injectable storage also lets the non-visual behavior run in Node tests. */
export function createBenchStore(storage: SceneStorage | null = browserStorage()) {
  let initial = { ...presetScene('benzene'), ...defaultDisplay };
  try {
    const saved = storage?.getItem(SCENE_STORAGE_KEY);
    if (saved) initial = parseScene(saved);
  } catch {
    /* Corrupt data or blocked storage must not prevent opening the lab. */
  }
  let moveStart: SceneSnapshot | null = null;
  let sequence = 0;
  const store = create<BenchState>((set, get) => {
    const newId = () => {
      let id: string;
      do {
        id = `item-${Date.now().toString(36)}-${++sequence}`;
      } while (get().atoms.some((a) => a.id === id) || get().bonds.some((b) => b.id === id));
      return id;
    };
    const endMove = () => {
      const start = moveStart;
      moveStart = null;
      if (start) {
        const current = snapshot(get());
        if (sameScene(start, { ...current, activePresetId: start.activePresetId })) {
          // Moving away and back is a no-op; retain the preset and redo branch.
          set({ activePresetId: start.activePresetId });
        } else {
          set((state) => ({ past: [...state.past, start].slice(-HISTORY_LIMIT), future: [] }));
        }
      }
    };
    const commit = (next: SceneSnapshot, resetSelection = false) => {
      endMove();
      const state = get();
      const current = snapshot(state);
      if (sameScene(current, next)) {
        if (resetSelection) set({ selectedId: null, bondSourceId: null, cardSym: null });
        return;
      }
      set({
        ...snapshot(next),
        past: [...state.past, current].slice(-HISTORY_LIMIT),
        future: [],
        selectedId:
          !resetSelection && next.atoms.some((a) => a.id === state.selectedId)
            ? state.selectedId
            : null,
        bondSourceId:
          !resetSelection && next.atoms.some((a) => a.id === state.bondSourceId)
            ? state.bondSourceId
            : null,
        ...(resetSelection ? { cardSym: null } : {}),
      });
    };
    return {
      ...initial,
      mode: 'move',
      selectedId: null,
      bondSourceId: null,
      cardSym: null,
      tableOpen: false,
      past: [],
      future: [],
      resetViewToken: 0,
      setMode: (mode) => {
        if (['move', 'bond', 'delete'].includes(mode)) {
          endMove();
          set({ mode, bondSourceId: null, selectedId: null });
        }
      },
      setCard: (sym) => {
        if (sym === null || validSymbol(sym)) set({ cardSym: sym });
      },
      toggleTable: () => set((state) => ({ tableOpen: !state.tableOpen })),
      setDisplayStyle: (displayStyle) => {
        if (validStyle(displayStyle)) set({ displayStyle });
      },
      toggleLabels: () => set((state) => ({ showLabels: !state.showLabels })),
      toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
      toggleAutoRotate: () => set((state) => ({ autoRotate: !state.autoRotate })),
      resetView: () => set((state) => ({ resetViewToken: state.resetViewToken + 1 })),
      select: (id) =>
        set({ selectedId: id && get().atoms.some((atom) => atom.id === id) ? id : null }),
      addAtom: (sym, pos) => {
        const state = get();
        if (!validSymbol(sym) || !validPosition(pos) || state.atoms.length >= MAX_ATOMS) return;
        commit({
          atoms: [...state.atoms, { id: newId(), sym, pos: [...pos] }],
          bonds: state.bonds,
          activePresetId: null,
        });
      },
      beginMove: () => {
        if (!moveStart) moveStart = snapshot(get());
      },
      endMove,
      moveAtom: (id, pos) => {
        const state = get();
        const atom = state.atoms.find((entry) => entry.id === id);
        if (!atom || !validPosition(pos) || atom.pos.every((n, i) => n === pos[i])) return;
        const next: SceneSnapshot = {
          atoms: state.atoms.map((entry) =>
            entry.id === id ? { ...entry, pos: [...pos] } : entry,
          ),
          bonds: state.bonds,
          activePresetId: null,
        };
        if (moveStart) set(next);
        else commit(next);
      },
      removeAtom: (id) => {
        const state = get();
        if (!state.atoms.some((atom) => atom.id === id)) return;
        commit({
          atoms: state.atoms.filter((atom) => atom.id !== id),
          bonds: state.bonds.filter((bond) => bond.a !== id && bond.b !== id),
          activePresetId: null,
        });
      },
      clickAtomBond: (id) => {
        const state = get();
        if (!state.atoms.some((atom) => atom.id === id)) return;
        if (!state.bondSourceId) {
          set({ bondSourceId: id });
          return;
        }
        if (
          state.bondSourceId !== id &&
          state.bonds.length < MAX_BONDS &&
          !state.bonds.some(
            (bond) =>
              (bond.a === state.bondSourceId && bond.b === id) ||
              (bond.a === id && bond.b === state.bondSourceId),
          )
        ) {
          commit({
            atoms: state.atoms,
            bonds: [...state.bonds, { id: newId(), a: state.bondSourceId, b: id, order: 1 }],
            activePresetId: null,
          });
        }
        set({ bondSourceId: null });
      },
      removeBond: (id) => {
        const state = get();
        if (!state.bonds.some((bond) => bond.id === id)) return;
        commit({
          atoms: state.atoms,
          bonds: state.bonds.filter((bond) => bond.id !== id),
          activePresetId: null,
        });
      },
      cycleBond: (id) => {
        const state = get();
        if (!state.bonds.some((bond) => bond.id === id)) return;
        commit({
          atoms: state.atoms,
          bonds: state.bonds.map((bond) =>
            bond.id === id ? { ...bond, order: ((bond.order % 3) + 1) as Bond['order'] } : bond,
          ),
          activePresetId: null,
        });
      },
      clearAll: () => commit({ atoms: [], bonds: [], activePresetId: null }, true),
      loadPreset: (id) => {
        if (!Object.hasOwn(byPresetId, id)) return;
        commit(presetScene(id), true);
        set((state) => ({ resetViewToken: state.resetViewToken + 1 }));
      },
      undo: () => {
        endMove();
        const state = get();
        const previous = state.past.at(-1);
        if (previous)
          set({
            ...snapshot(previous),
            past: state.past.slice(0, -1),
            future: [...state.future, snapshot(state)].slice(-HISTORY_LIMIT),
            selectedId: null,
            bondSourceId: null,
            cardSym: null,
            resetViewToken: state.resetViewToken + 1,
          });
      },
      redo: () => {
        endMove();
        const state = get();
        const next = state.future.at(-1);
        if (next)
          set({
            ...snapshot(next),
            past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
            future: state.future.slice(0, -1),
            selectedId: null,
            bondSourceId: null,
            cardSym: null,
            resetViewToken: state.resetViewToken + 1,
          });
      },
      exportScene: () => serializeScene(get()),
      importScene: (raw) => {
        try {
          const parsed = parseScene(raw);
          commit(snapshot(parsed), true);
          set((state) => ({
            displayStyle: parsed.displayStyle,
            showLabels: parsed.showLabels,
            showGrid: parsed.showGrid,
            autoRotate: parsed.autoRotate,
            resetViewToken: state.resetViewToken + 1,
          }));
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'The scene could not be imported.',
          };
        }
      },
    };
  });
  let lastSaved = serializeScene(store.getState());
  store.subscribe((state) => {
    if (moveStart) return;
    const serialized = serializeScene(state);
    if (serialized === lastSaved) return;
    try {
      storage?.setItem(SCENE_STORAGE_KEY, serialized);
      lastSaved = serialized;
    } catch {
      /* Private mode or full storage: the live scene and export still work. */
    }
  });
  return store;
}

export const useBench = createBenchStore();

/** Covalent-radius-inspired display radius; not a measured atomic boundary. */
export function atomRadius(sym: string): number {
  const el = bySymbol[sym];
  const shells = el?.shells.value?.length ?? 1;
  return el ? 0.46 + 0.09 * (shells - 1) : 0.6;
}

export function atomColor(sym: string): string {
  return bySymbol[sym]?.cpk ? `#${bySymbol[sym].cpk}` : '#e879f9';
}

/** Hill-system formula: without carbon all symbols, including H, sort alphabetically. */
export function formulaOf(atoms: PlacedAtom[]): string {
  const counts = new Map<string, number>();
  atoms.forEach((atom) => counts.set(atom.sym, (counts.get(atom.sym) ?? 0) + 1));
  const keys = [...counts.keys()];
  const ordered = counts.has('C')
    ? [
        'C',
        ...(counts.has('H') ? ['H'] : []),
        ...keys.filter((key) => key !== 'C' && key !== 'H').sort(),
      ]
    : keys.sort();
  return ordered.map((key) => key + (counts.get(key)! > 1 ? counts.get(key) : '')).join('');
}

export function molarMassOf(atoms: PlacedAtom[]): Quantity<number> {
  return combineNumericQuantities(atoms.map((atom) => bySymbol[atom.sym].mass));
}
