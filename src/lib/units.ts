export type TemperatureUnit = 'K' | 'C' | 'F';
export type EnergyUnit = 'kJ/mol' | 'kcal/mol' | 'Btu/lbmol';
export type DensityUnit = 'g/cm3' | 'lb/ft3';
export type PressureUnit = 'Pa' | 'kPa' | 'bar' | 'atm' | 'psi';

export interface UnitSystem {
  temperature: TemperatureUnit;
  energy: EnergyUnit;
  density: DensityUnit;
  pressure: PressureUnit;
}

export const SI_UNITS: UnitSystem = {
  temperature: 'K',
  energy: 'kJ/mol',
  density: 'g/cm3',
  pressure: 'Pa',
};

export const UNIT_STORAGE_KEY = 'molecule-studio:units:v1';

const KCAL_PER_KJ = 1 / 4.184;
const BTU_LBMOL_PER_KJ_MOL = 429.9226 / 1000; // 1 kJ/mol = 0.4299226 Btu/lbmol
const LB_FT3_PER_G_CM3 = 62.42796;
const KPA = 1e-3;
const BAR = 1e-5;
const ATM = 1 / 101325;
const PSI = 1 / 6894.757;

export function toKelvin(value: number, from: TemperatureUnit): number {
  if (from === 'K') return value;
  if (from === 'C') return value + 273.15;
  return ((value - 32) * 5) / 9 + 273.15;
}

export function fromKelvin(value: number, to: TemperatureUnit): number {
  if (to === 'K') return value;
  if (to === 'C') return value - 273.15;
  return ((value - 273.15) * 9) / 5 + 32;
}

export function fromKjPerMol(value: number, to: EnergyUnit): number {
  if (to === 'kJ/mol') return value;
  if (to === 'kcal/mol') return value * KCAL_PER_KJ;
  return value * BTU_LBMOL_PER_KJ_MOL;
}

export function fromGPerCm3(value: number, to: DensityUnit): number {
  return to === 'g/cm3' ? value : value * LB_FT3_PER_G_CM3;
}

export function fromPa(value: number, to: PressureUnit): number {
  if (to === 'Pa') return value;
  if (to === 'kPa') return value * KPA;
  if (to === 'bar') return value * BAR;
  if (to === 'atm') return value * ATM;
  return value * PSI;
}

export function parseUnitSystem(raw: unknown): UnitSystem {
  if (!raw || typeof raw !== 'object') return { ...SI_UNITS };
  const data = raw as Record<string, unknown>;
  const next = { ...SI_UNITS };
  if (data.temperature === 'K' || data.temperature === 'C' || data.temperature === 'F')
    next.temperature = data.temperature;
  if (data.energy === 'kJ/mol' || data.energy === 'kcal/mol' || data.energy === 'Btu/lbmol')
    next.energy = data.energy;
  if (data.density === 'g/cm3' || data.density === 'lb/ft3') next.density = data.density;
  if (
    data.pressure === 'Pa' ||
    data.pressure === 'kPa' ||
    data.pressure === 'bar' ||
    data.pressure === 'atm' ||
    data.pressure === 'psi'
  )
    next.pressure = data.pressure;
  return next;
}

export function loadUnits(): UnitSystem {
  try {
    const raw = localStorage.getItem(UNIT_STORAGE_KEY);
    return raw ? parseUnitSystem(JSON.parse(raw)) : { ...SI_UNITS };
  } catch {
    return { ...SI_UNITS };
  }
}

export function saveUnits(units: UnitSystem) {
  try {
    localStorage.setItem(UNIT_STORAGE_KEY, JSON.stringify(units));
  } catch {
    /* storage may be unavailable */
  }
}
