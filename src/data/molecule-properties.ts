import { quantityError, type PropertyContext, type Quantity } from '@/data/element-properties';

export type Phase = 'g' | 'l';

export const STANDARD_T_K = 298.15;
export const STANDARD_P_PA = 100_000;
/** CODATA 2018 molar gas constant. https://physics.nist.gov/cgi-bin/cuu/Value?r */
export const R_J_PER_MOL_K = 8.314462618;
export const R_SOURCE = 'https://physics.nist.gov/cgi-bin/cuu/Value?r';
export const RETRIEVED_ON = '2026-09-06';
export const CHASE_1998 =
  'Chase, M.W., Jr., NIST-JANAF Thermochemical Tables, 4th ed., J. Phys. Chem. Ref. Data, Monograph 9, 1998. Quoted from NIST Chemistry WebBook SRD 69, retrieved 2026-09-06.';
export const CODATA_1984 =
  'Cox, J.D.; Wagman, D.D.; Medvedev, V.A., CODATA Key Values for Thermodynamics, Hemisphere, 1984. Quoted from NIST Chemistry WebBook SRD 69, retrieved 2026-09-06.';

const CAS_FULL = /^(\d{2,7})-(\d{2})-(\d)$/;
const INCHI_KEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;

export function formatCas(digits: string): string {
  const compact = digits.replace(/\D/g, '');
  if (compact.length < 5 || compact.length > 10) {
    throw new Error('CAS body must be 5 to 10 digits including the check digit.');
  }
  return `${compact.slice(0, -3)}-${compact.slice(-3, -1)}-${compact.slice(-1)}`;
}

export function casChecksum(bodyWithoutCheck: string): number {
  const digits = bodyWithoutCheck.replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += Number(digits[digits.length - 1 - i]) * (i + 1);
  return sum % 10;
}

export function isCas(value: unknown): value is string {
  if (typeof value !== 'string' || !CAS_FULL.test(value)) return false;
  const [, first, second, check] = value.match(CAS_FULL)!;
  return casChecksum(`${first}-${second}`) === Number(check);
}

export function isInchiKey(value: unknown): value is string {
  return typeof value === 'string' && INCHI_KEY.test(value);
}

export function casError(value: unknown): string | null {
  if (typeof value !== 'string' || !CAS_FULL.test(value)) return 'CAS must use the hyphenated registry form.';
  if (!isCas(value)) return 'CAS check digit does not match the registry checksum.';
  return null;
}

export function inchiKeyError(value: unknown): string | null {
  if (!isInchiKey(value)) return 'InChIKey must be the 14-10-1 hyphenated block form.';
  return null;
}

export function unavailableQuantity(reason: string, sources: string[] = []): Quantity<number> {
  return {
    value: null,
    status: 'unavailable',
    provenance: 'inherited',
    sources,
    withheldReason: reason,
  };
}

export function citedScalar(
  value: number,
  sources: string[],
  context: PropertyContext,
): Quantity<number> {
  return {
    value,
    status: 'measured_evaluated',
    provenance: 'cited',
    sources,
    context,
  };
}

export interface SpeciesIdentity {
  cas: string;
  inchiKey: string;
  pubchemCid: string;
  webbookUrl: string;
  cccbdbUrl?: string;
}

export interface Species {
  id: string;
  name: string;
  formula: string;
  phase: Phase;
  atoms: Readonly<Record<string, number>>;
  identity: SpeciesIdentity;
  /** Optional 3D collection preset. Liquid water has none. */
  presetId?: string;
  evaluation: string;
  hf: Quantity<number>;
  entropy: Quantity<number>;
  cp: Quantity<number>;
}

export function speciesError(input: unknown): string | null {
  if (!input || typeof input !== 'object') return 'Species record is missing.';
  const species = input as Species;
  if (typeof species.id !== 'string' || !species.id) return 'Species id is required.';
  if (species.phase !== 'g' && species.phase !== 'l') return 'Species phase must be g or l.';
  const cas = casError(species.identity?.cas);
  if (cas) return cas;
  const key = inchiKeyError(species.identity?.inchiKey);
  if (key) return key;
  for (const field of [species.hf, species.entropy, species.cp] as const) {
    const error = quantityError(field);
    if (error) return error;
  }
  return null;
}

export function atomCountMap(atoms: Readonly<Record<string, number>>): Map<string, number> {
  return new Map(Object.entries(atoms).filter(([, count]) => count > 0));
}
