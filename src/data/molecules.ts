import type { Bond, PlacedAtom } from '@/state/store';

export interface MoleculePreset {
  id: string;
  name: string;
  formula: string;
  category: string;
  description: string;
  geometry: string;
  lesson: string;
  atoms: PlacedAtom[];
  bonds: Bond[];
}

/**
 * Educational reference structures, not force-field or quantum calculations.
 * One scene unit is one Å. Coordinates are translated/rotated for the bench;
 * display sphere radii do not represent measured atom boundaries.
 * Geometries and bond lengths checked against NIST CCCBDB, SRD 101:
 * https://cccbdb.nist.gov/exp2x.asp?casno=7732185&charge=0 (water)
 * https://cccbdb.nist.gov/exp2x.asp?casno=74828&charge=0 (methane)
 * https://cccbdb.nist.gov/exp2x.asp?casno=7664417&charge=0 (ammonia)
 * https://cccbdb.nist.gov/exp2x.asp?casno=124389&charge=0 (carbon dioxide)
 * https://cccbdb.nist.gov/exp2x.asp?casno=64175&charge=0 (ethanol)
 * https://cccbdb.nist.gov/exp2x.asp?casno=71432&charge=0 (benzene)
 * Benzene bond integers encode one Kekulé drawing; they do not imply alternating
 * experimental C–C distances. Every ring edge has the same reference length.
 * Delocalization terminology: https://goldbook.iupac.org/terms/view/A00442
 */
export const PRESET_SOURCES = {
  water: 'https://cccbdb.nist.gov/exp2x.asp?casno=7732185&charge=0',
  methane: 'https://cccbdb.nist.gov/exp2x.asp?casno=74828&charge=0',
  ammonia: 'https://cccbdb.nist.gov/exp2x.asp?casno=7664417&charge=0',
  'carbon-dioxide': 'https://cccbdb.nist.gov/exp2x.asp?casno=124389&charge=0',
  ethanol: 'https://cccbdb.nist.gov/exp2x.asp?casno=64175&charge=0',
  benzene: 'https://cccbdb.nist.gov/exp2x.asp?casno=71432&charge=0',
};

type AtomInput = [string, number, number, number];
type BondInput = [number, number, (1 | 2 | 3)?];

function structure(id: string, points: AtomInput[], edges: BondInput[]) {
  const centerX = points.reduce((sum, atom) => sum + atom[1], 0) / points.length;
  const centerZ = points.reduce((sum, atom) => sum + atom[3], 0) / points.length;
  const minY = Math.min(...points.map((atom) => atom[2]));
  const atoms: PlacedAtom[] = points.map(([sym, x, y, z], i) => ({
    id: `${id}-a${i + 1}`,
    sym,
    pos: [x - centerX, y - minY + 1.4, z - centerZ],
  }));
  const bonds: Bond[] = edges.map(([a, b, order = 1], i) => ({
    id: `${id}-b${i + 1}`,
    a: atoms[a - 1].id,
    b: atoms[b - 1].id,
    order,
  }));
  return { atoms, bonds };
}

const methaneOffset = 1.087 / Math.sqrt(3);
const waterHalfAngle = (104.4776 * Math.PI) / 360;
const ammoniaAxial = Math.sqrt((Math.cos((106.67 * Math.PI) / 180) + 0.5) / 1.5);
const ammoniaRadial = Math.sqrt(1 - ammoniaAxial ** 2);

const benzenePoints: AtomInput[] = [1.397, 2.481].flatMap((radius, shell) =>
  Array.from({ length: 6 }, (_, i): AtomInput => {
    const angle = (i * Math.PI) / 3;
    return [shell ? 'H' : 'C', radius * Math.cos(angle), radius * Math.sin(angle), 0];
  }),
);

export const MOLECULE_PRESETS: MoleculePreset[] = [
  {
    id: 'benzene',
    name: 'Benzene',
    formula: 'C6H6',
    category: 'Aromatic',
    description: 'A six-carbon ring with a shared π-electron system.',
    geometry: 'Planar · 120°',
    lesson:
      'All six C–C bonds have equal reference lengths. Alternating single and double sticks show one Kekulé representation; the π electrons are delocalized around the ring.',
    ...structure('benzene', benzenePoints, [
      ...Array.from({ length: 6 }, (_, i): BondInput => [i + 1, ((i + 1) % 6) + 1, i % 2 ? 1 : 2]),
      ...Array.from({ length: 6 }, (_, i): BondInput => [i + 1, i + 7]),
    ]),
  },
  {
    id: 'water',
    name: 'Water',
    formula: 'H2O',
    category: 'Bent',
    description: 'Two O–H bonds meet at a distinctive angle.',
    geometry: 'Bent · 104.5°',
    lesson:
      'Water has a bent molecular shape. Two lone pairs on oxygen are omitted from this model; its H–O–H angle is about 104.5°.',
    ...structure(
      'water',
      [
        ['O', 0, 0, 0],
        ['H', 0.958 * Math.sin(waterHalfAngle), 0.958 * Math.cos(waterHalfAngle), 0],
        ['H', -0.958 * Math.sin(waterHalfAngle), 0.958 * Math.cos(waterHalfAngle), 0],
      ],
      [
        [1, 2],
        [1, 3],
      ],
    ),
  },
  {
    id: 'methane',
    name: 'Methane',
    formula: 'CH4',
    category: 'Tetrahedral',
    description: 'Four equal bonds reach into three dimensions.',
    geometry: 'Tetrahedral · 109.5°',
    lesson:
      'The four hydrogens occupy the corners of a tetrahedron around carbon. Rotate the model to see why a flat cross cannot describe this arrangement.',
    ...structure(
      'methane',
      [
        ['C', 0, 0, 0],
        ...[
          [1, 1, 1],
          [1, -1, -1],
          [-1, 1, -1],
          [-1, -1, 1],
        ].map(([x, y, z]): AtomInput => [
          'H',
          x * methaneOffset,
          y * methaneOffset,
          z * methaneOffset,
        ]),
      ],
      [
        [1, 2],
        [1, 3],
        [1, 4],
        [1, 5],
      ],
    ),
  },
  {
    id: 'ammonia',
    name: 'Ammonia',
    formula: 'NH3',
    category: 'Pyramidal',
    description: 'A nitrogen atom rises above three hydrogens.',
    geometry: 'Trigonal pyramidal · ≈107°',
    lesson:
      'Three N–H bonds form a trigonal pyramid. The nitrogen lone pair is not drawn; the H–N–H reference angle here is 106.67°.',
    ...structure(
      'ammonia',
      [
        ['N', 0, 0, 0],
        ...Array.from({ length: 3 }, (_, i): AtomInput => [
          'H',
          1.012 * ammoniaRadial * Math.cos((i * 2 * Math.PI) / 3),
          -1.012 * ammoniaAxial,
          1.012 * ammoniaRadial * Math.sin((i * 2 * Math.PI) / 3),
        ]),
      ],
      [
        [1, 2],
        [1, 3],
        [1, 4],
      ],
    ),
  },
  {
    id: 'carbon-dioxide',
    name: 'Carbon dioxide',
    formula: 'CO2',
    category: 'Linear',
    description: 'Two carbon–oxygen double bonds share one axis.',
    geometry: 'Linear · 180°',
    lesson:
      'Each C=O double bond is one electron domain around carbon. Two domains give a linear O=C=O arrangement with an angle of 180°.',
    ...structure(
      'carbon-dioxide',
      [
        ['C', 0, 0, 0],
        ['O', -1.162, 0, 0],
        ['O', 1.162, 0, 0],
      ],
      [
        [1, 2, 2],
        [1, 3, 2],
      ],
    ),
  },
  {
    id: 'ethanol',
    name: 'Ethanol',
    formula: 'C2H6O',
    category: 'Alcohol',
    description: 'An ethyl group joins an oxygen–hydrogen group.',
    geometry: 'Tetrahedral carbons · bent oxygen',
    lesson:
      'Follow the C–C–O–H chain and identify the hydroxyl group. The carbons are approximately tetrahedral. This reference conformer is one of several arrangements possible by bond rotation.',
    ...structure(
      'ethanol',
      [
        ['C', 1.1879, -0.3829, 0],
        ['C', 0, 0.5526, 0],
        ['O', -1.1867, -0.2472, 0],
        ['H', -1.9237, 0.385, 0],
        ['H', 2.0985, 0.2306, 0],
        ['H', 1.1184, -1.0093, 0.8869],
        ['H', 1.1184, -1.0093, -0.8869],
        ['H', -0.0227, 1.1812, 0.8852],
        ['H', -0.0227, 1.1812, -0.8852],
      ],
      [
        [1, 2],
        [2, 3],
        [3, 4],
        [1, 5],
        [1, 6],
        [1, 7],
        [2, 8],
        [2, 9],
      ],
    ),
  },
];

export const byPresetId: Record<string, MoleculePreset> = Object.fromEntries(
  MOLECULE_PRESETS.map((preset) => [preset.id, preset]),
);
