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
  /**
   * Omitted (or any value other than false) means this preset is one of the
   * original guided-build lessons. `false` marks a preset that recognition
   * still matches but that guided-build entry points (the "Start guided
   * build" select and the inventory suggestion list) must not offer.
   */
  guidedLesson?: false;
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
  hydrogen: 'https://cccbdb.nist.gov/exp2x.asp?casno=1333740&charge=0',
  nitrogen: 'https://cccbdb.nist.gov/exp2x.asp?casno=7727379&charge=0',
  oxygen: 'https://cccbdb.nist.gov/exp2x.asp?casno=7782447&charge=0',
  'carbon-monoxide': 'https://cccbdb.nist.gov/exp2x.asp?casno=630080&charge=0',
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
  {
    id: 'hydrogen',
    name: 'Hydrogen',
    formula: 'H2',
    category: 'Diatomic',
    description: 'Two hydrogen nuclei share a single bond.',
    geometry: 'Linear · 0.741 Å',
    lesson:
      'This is the experimental H–H distance from CCCBDB (0.741 Å). The Electron Lab H₂ curve is a separate calculated lesson and is not this drawing.',
    guidedLesson: false,
    ...structure(
      'hydrogen',
      [
        ['H', 0, 0, 0],
        ['H', 0, 0, 0.7414],
      ],
      [[1, 2]],
    ),
  },
  {
    id: 'nitrogen',
    name: 'Nitrogen',
    formula: 'N2',
    category: 'Diatomic',
    description: 'A triple bond holds two nitrogen atoms.',
    geometry: 'Linear · 1.098 Å',
    lesson:
      'The experimental N≡N distance here is 1.098 Å from CCCBDB. Air is mostly this molecule.',
    guidedLesson: false,
    ...structure(
      'nitrogen',
      [
        ['N', 0, 0, 0.5488],
        ['N', 0, 0, -0.5488],
      ],
      [[1, 2, 3]],
    ),
  },
  {
    id: 'oxygen',
    name: 'Oxygen',
    formula: 'O2',
    category: 'Diatomic',
    description: 'Two oxygen atoms share a double bond in this Lewis drawing.',
    geometry: 'Linear · 1.208 Å',
    lesson:
      'The experimental O=O distance is 1.208 Å from CCCBDB. The double stick is a Lewis drawing; O₂ is a diradical in a fuller description.',
    guidedLesson: false,
    ...structure(
      'oxygen',
      [
        ['O', 0, 0, 0],
        ['O', 0, 0, 1.2075],
      ],
      [[1, 2, 2]],
    ),
  },
  {
    id: 'carbon-monoxide',
    name: 'Carbon monoxide',
    formula: 'CO',
    category: 'Diatomic',
    description: 'Carbon and oxygen share a triple bond in this Lewis drawing.',
    geometry: 'Linear · 1.128 Å',
    lesson:
      'The experimental C≡O distance is 1.128 Å from CCCBDB. The common-valence checker flags this sketch because a triple bond does not match the simple C=4 / O=2 count.',
    guidedLesson: false,
    ...structure(
      'carbon-monoxide',
      [
        ['C', 0, 0, 0],
        ['O', 0, 0, 1.1282],
      ],
      [[1, 2, 3]],
    ),
  },
];

export const byPresetId: Record<string, MoleculePreset> = Object.fromEntries(
  MOLECULE_PRESETS.map((preset) => [preset.id, preset]),
);

/**
 * Presets offered as guided-build lessons: everything except those tagged
 * `guidedLesson: false`. Recognition (bonding-guide.ts) keeps matching every
 * preset in MOLECULE_PRESETS regardless of this filter; only guided-build
 * entry points (the "Start guided build" select and the inventory suggestion
 * list) should call this instead of using MOLECULE_PRESETS directly.
 */
export function guidedPresets(): MoleculePreset[] {
  return MOLECULE_PRESETS.filter((preset) => preset.guidedLesson !== false);
}
