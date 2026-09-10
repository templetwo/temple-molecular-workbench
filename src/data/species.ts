import {
  CHASE_1998,
  CODATA_1984,
  RETRIEVED_ON,
  STANDARD_P_PA,
  STANDARD_T_K,
  citedScalar,
  unavailableQuantity,
  type Species,
} from '@/data/molecule-properties';

const T = STANDARD_T_K;
const P = STANDARD_P_PA;

function webbook(id: string, mask = 1): string {
  return `https://webbook.nist.gov/cgi/cbook.cgi?ID=${id}&Units=SI&Mask=${mask}`;
}
function cccbdb(casno: string): string {
  return `https://cccbdb.nist.gov/exp2x.asp?casno=${casno}&charge=0`;
}

function chaseHf(value: number, source: string, decimals: number, extra?: string) {
  return citedScalar(value, [source], {
    units: 'kJ/mol',
    temperatureK: T,
    pressurePa: P,
    displayDecimals: decimals,
    precisionNote: extra ?? CHASE_1998,
  });
}

function chaseS(value: number, source: string, decimals: number, extra?: string) {
  return citedScalar(value, [source], {
    units: 'J/mol·K',
    temperatureK: T,
    pressurePa: P,
    displayDecimals: decimals,
    precisionNote: extra ?? CHASE_1998,
  });
}

function cccbdbCp(value: number, source: string, decimals: number) {
  return citedScalar(value, [source], {
    units: 'J/mol·K',
    temperatureK: T,
    displayDecimals: decimals,
    precisionNote: `Scalar Cp(298.15 K) from CCCBDB experimental table (Gurvich/CODATA), retrieved ${RETRIEVED_ON}. Not a Shomate evaluation.`,
  });
}

const ELEMENTAL =
  'Standard-state elemental form; ΔfH° is identically zero in the Chase 1998 / CODATA evaluation. Quoted from NIST Chemistry WebBook SRD 69, retrieved 2026-09-06.';

export const SPECIES: Species[] = [
  {
    id: 'hydrogen-g',
    name: 'Hydrogen',
    formula: 'H2',
    phase: 'g',
    atoms: { H: 2 },
    identity: {
      cas: '1333-74-0',
      inchiKey: 'UFHFLCQGNIYNRP-UHFFFAOYSA-N',
      pubchemCid: '783',
      webbookUrl: webbook('C1333740'),
      cccbdbUrl: cccbdb('1333740'),
    },
    presetId: 'hydrogen',
    evaluation: 'chase-1998',
    hf: chaseHf(0, webbook('C1333740'), 0, ELEMENTAL),
    entropy: chaseS(130.68, webbook('C1333740'), 2),
    cp: cccbdbCp(28.84, cccbdb('1333740'), 2),
  },
  {
    id: 'nitrogen-g',
    name: 'Nitrogen',
    formula: 'N2',
    phase: 'g',
    atoms: { N: 2 },
    identity: {
      cas: '7727-37-9',
      inchiKey: 'IJGRMHOSHXDMSA-UHFFFAOYSA-N',
      pubchemCid: '947',
      webbookUrl: webbook('C7727379'),
      cccbdbUrl: cccbdb('7727379'),
    },
    presetId: 'nitrogen',
    evaluation: 'chase-1998',
    hf: chaseHf(0, webbook('C7727379'), 0, ELEMENTAL),
    entropy: chaseS(191.61, webbook('C7727379'), 2),
    cp: cccbdbCp(29.12, cccbdb('7727379'), 2),
  },
  {
    id: 'oxygen-g',
    name: 'Oxygen',
    formula: 'O2',
    phase: 'g',
    atoms: { O: 2 },
    identity: {
      cas: '7782-44-7',
      inchiKey: 'MYMOFIZGZYHOMD-UHFFFAOYSA-N',
      pubchemCid: '977',
      webbookUrl: webbook('C7782447'),
      cccbdbUrl: cccbdb('7782447'),
    },
    presetId: 'oxygen',
    evaluation: 'chase-1998',
    hf: chaseHf(0, webbook('C7782447'), 0, ELEMENTAL),
    entropy: chaseS(205.15, webbook('C7782447'), 2),
    cp: cccbdbCp(29.38, cccbdb('7782447'), 2),
  },
  {
    id: 'carbon-monoxide-g',
    name: 'Carbon monoxide',
    formula: 'CO',
    phase: 'g',
    atoms: { C: 1, O: 1 },
    identity: {
      cas: '630-08-0',
      inchiKey: 'UGFAIRIUMAVXCW-UHFFFAOYSA-N',
      pubchemCid: '281',
      webbookUrl: webbook('C630080'),
      cccbdbUrl: cccbdb('630080'),
    },
    presetId: 'carbon-monoxide',
    evaluation: 'chase-1998',
    hf: chaseHf(-110.53, webbook('C630080'), 2),
    entropy: chaseS(197.66, webbook('C630080'), 2),
    cp: cccbdbCp(29.14, cccbdb('630080'), 2),
  },
  {
    id: 'carbon-dioxide-g',
    name: 'Carbon dioxide',
    formula: 'CO2',
    phase: 'g',
    atoms: { C: 1, O: 2 },
    identity: {
      cas: '124-38-9',
      inchiKey: 'CURLTUGMZLYLDI-UHFFFAOYSA-N',
      pubchemCid: '280',
      webbookUrl: webbook('C124389'),
      cccbdbUrl: cccbdb('124389'),
    },
    presetId: 'carbon-dioxide',
    evaluation: 'chase-1998',
    hf: chaseHf(-393.52, webbook('C124389'), 2),
    entropy: chaseS(213.79, webbook('C124389'), 2),
    cp: unavailableQuantity('No scalar Cp(298.15 K) is quoted here; WebBook lists a Shomate polynomial instead of a single 298.15 K checkpoint on this page.'),
  },
  {
    id: 'water-g',
    name: 'Water (gas)',
    formula: 'H2O',
    phase: 'g',
    atoms: { H: 2, O: 1 },
    identity: {
      cas: '7732-18-5',
      inchiKey: 'XLYOFNOQVPJJNP-UHFFFAOYSA-N',
      pubchemCid: '962',
      webbookUrl: webbook('C7732185'),
      cccbdbUrl: cccbdb('7732185'),
    },
    presetId: 'water',
    evaluation: 'chase-1998',
    hf: chaseHf(-241.83, webbook('C7732185'), 2),
    entropy: chaseS(188.84, webbook('C7732185'), 2),
    cp: unavailableQuantity('No scalar Cp(298.15 K) is quoted here; WebBook lists a Shomate polynomial instead of a single 298.15 K checkpoint on this page.'),
  },
  {
    id: 'water-l',
    name: 'Water (liquid)',
    formula: 'H2O',
    phase: 'l',
    atoms: { H: 2, O: 1 },
    identity: {
      cas: '7732-18-5',
      inchiKey: 'XLYOFNOQVPJJNP-UHFFFAOYSA-N',
      pubchemCid: '962',
      webbookUrl: webbook('C7732185', 2),
      cccbdbUrl: cccbdb('7732185'),
    },
    evaluation: 'codata-1984',
    hf: chaseHf(-285.83, webbook('C7732185', 2), 2, CODATA_1984),
    entropy: chaseS(69.95, webbook('C7732185', 2), 2, CODATA_1984),
    cp: unavailableQuantity('No scalar Cp(298.15 K) is quoted here; WebBook lists a liquid Shomate polynomial instead of a single 298.15 K checkpoint on this page.'),
  },
  {
    id: 'methane-g',
    name: 'Methane',
    formula: 'CH4',
    phase: 'g',
    atoms: { C: 1, H: 4 },
    identity: {
      cas: '74-82-8',
      inchiKey: 'VNWKTOKETHGBQD-UHFFFAOYSA-N',
      pubchemCid: '297',
      webbookUrl: webbook('C74828'),
      cccbdbUrl: cccbdb('74828'),
    },
    presetId: 'methane',
    evaluation: 'chase-1998',
    hf: chaseHf(-74.87, webbook('C74828'), 2),
    entropy: chaseS(186.25, webbook('C74828'), 2),
    cp: unavailableQuantity('WebBook lists several Cp(T) tables for methane; no single Chase 1998 scalar at 298.15 K is quoted here.'),
  },
  {
    id: 'ammonia-g',
    name: 'Ammonia',
    formula: 'NH3',
    phase: 'g',
    atoms: { N: 1, H: 3 },
    identity: {
      cas: '7664-41-7',
      inchiKey: 'QGZKDVFQNNGYKY-UHFFFAOYSA-N',
      pubchemCid: '222',
      webbookUrl: webbook('C7664417'),
      cccbdbUrl: cccbdb('7664417'),
    },
    presetId: 'ammonia',
    evaluation: 'chase-1998',
    hf: chaseHf(-45.9, webbook('C7664417'), 1),
    entropy: chaseS(192.77, webbook('C7664417'), 2),
    cp: unavailableQuantity('WebBook lists a Shomate polynomial for ammonia; no scalar Cp(298.15 K) is quoted here.'),
  },
  {
    id: 'ethanol-g',
    name: 'Ethanol (gas)',
    formula: 'C2H6O',
    phase: 'g',
    atoms: { C: 2, H: 6, O: 1 },
    identity: {
      cas: '64-17-5',
      inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N',
      pubchemCid: '702',
      webbookUrl: webbook('C64175'),
      cccbdbUrl: cccbdb('64175'),
    },
    presetId: 'ethanol',
    evaluation: 'webbook-hfg-average',
    hf: citedScalar(-234, [webbook('C64175')], {
      units: 'kJ/mol',
      temperatureK: T,
      pressurePa: P,
      displayDecimals: 0,
      uncertainty: '2',
      precisionNote: `WebBook average of 9 ΔfH°gas values (−234 ± 2 kJ/mol), not Chase 1998. Retrieved ${RETRIEVED_ON}. Mixing this with Chase species is arithmetic over mixed evaluations.`,
    }),
    entropy: unavailableQuantity('No Chase 1998 S° is quoted for ethanol gas on the retrieved WebBook page.'),
    cp: citedScalar(65.21, [webbook('C64175')], {
      units: 'J/mol·K',
      temperatureK: T,
      displayDecimals: 2,
      uncertainty: '0.14',
      precisionNote: `TRC recommended Cp,gas at 298.15 K from NIST WebBook, retrieved ${RETRIEVED_ON}.`,
    }),
  },
  {
    id: 'benzene-g',
    name: 'Benzene',
    formula: 'C6H6',
    phase: 'g',
    atoms: { C: 6, H: 6 },
    identity: {
      cas: '71-43-2',
      inchiKey: 'UHOVQNZJYSORNB-UHFFFAOYSA-N',
      pubchemCid: '241',
      webbookUrl: webbook('C71432'),
      cccbdbUrl: cccbdb('71432'),
    },
    presetId: 'benzene',
    evaluation: 'identity-only',
    hf: unavailableQuantity('No Chase 1998 ΔfH° is quoted for benzene in this first cut. Identity and 3D geometry still ship.'),
    entropy: unavailableQuantity('No Chase 1998 S° is quoted for benzene in this first cut.'),
    cp: unavailableQuantity('No scalar Cp(298.15 K) is quoted for benzene in this first cut.'),
  },
];

export const bySpeciesId: Record<string, Species> = Object.fromEntries(
  SPECIES.map((species) => [species.id, species]),
);

export function speciesForPreset(presetId: string): Species | undefined {
  return SPECIES.find((species) => species.presetId === presetId && species.phase === 'g');
}

export function pubchemUrl(cid: string): string {
  return `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;
}
