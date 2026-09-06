/**
 * Scientific status is not provenance.
 * Unverified inherited values are not predicted values.
 * Predicted/evaluated numbers require a cited source before they may look measured.
 */

export const SCIENTIFIC_STATUSES = [
  'measured_evaluated',
  'calculated_predicted',
  'unverified',
  'unavailable',
] as const;
export type ScientificStatus = (typeof SCIENTIFIC_STATUSES)[number];

export const PROVENANCE_KINDS = ['inherited', 'cited', 'withheld'] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export const STATUS_LABEL: Record<ScientificStatus, string> = {
  measured_evaluated: 'Measured/evaluated',
  calculated_predicted: 'Calculated/predicted',
  unverified: 'Unverified',
  unavailable: 'Unavailable',
};

const STATUS_RANK: Record<ScientificStatus, number> = {
  unavailable: 0,
  unverified: 1,
  calculated_predicted: 2,
  measured_evaluated: 3,
};

export interface PropertyContext {
  units?: string;
  /** Scalar absolute uncertainty only; intervals require a separate future representation. */
  uncertainty?: string;
  /** Decimal places retained from the supplied values, not a claim of new precision. */
  displayDecimals?: number;
  precisionNote?: string;
  temperatureK?: number;
  pressurePa?: number;
  allotrope?: string;
  isotope?: string;
}

export interface Quantity<T> {
  value: T | null;
  status: ScientificStatus;
  provenance: ProvenanceKind;
  /** Legacy input form. Compiled records and derived quantities use sources instead. */
  source?: string;
  sources?: string[];
  context?: PropertyContext;
  withheldReason?: string;
}

export interface InheritedElement {
  n: number;
  sym: string;
  name: string;
  mass: number;
  cat: string;
  phase: string;
  density: number | null;
  melt: number | null;
  boil: number | null;
  config: string;
  shells: number[];
  eneg: number | null;
  eaff: number | null;
  ie1: number | null;
  x: number;
  y: number;
  cpk: string | null;
  appear: string | null;
  disc: string | null;
  block: string;
  period: number;
  group: number | null;
  lattice: string | null;
  latkey: string | null;
}

export interface ElementData {
  n: number;
  sym: string;
  name: string;
  cat: string;
  x: number;
  y: number;
  block: string;
  period: number;
  group: number | null;
  cpk: string | null;
  latkey: string | null;
  mass: Quantity<number>;
  density: Quantity<number>;
  melt: Quantity<number>;
  boil: Quantity<number>;
  eneg: Quantity<number>;
  eaff: Quantity<number>;
  ie1: Quantity<number>;
  config: Quantity<string>;
  shells: Quantity<number[]>;
  phase: Quantity<string>;
  lattice: Quantity<string>;
  appear: Quantity<string>;
  disc: Quantity<string>;
}

export type ElementOverlay = Partial<
  Pick<
    ElementData,
    | 'mass'
    | 'density'
    | 'melt'
    | 'boil'
    | 'eneg'
    | 'eaff'
    | 'ie1'
    | 'config'
    | 'shells'
    | 'phase'
    | 'lattice'
    | 'appear'
    | 'disc'
    | 'latkey'
  >
>;

export type PresentationAppearance = ScientificStatus;

export interface Presentation {
  appearance: PresentationAppearance;
  badge: string;
  text: string;
  shownValue: number | string | number[] | null;
  sources: string[];
  detail?: string;
  reason?: string;
}

export interface PresentOptions {
  digits?: number;
  unitSuffix?: string;
}

const QUANTITY_FIELDS = [
  'mass',
  'density',
  'melt',
  'boil',
  'eneg',
  'eaff',
  'ie1',
  'config',
  'shells',
  'phase',
  'lattice',
  'appear',
  'disc',
] as const;

function isStatus(value: unknown): value is ScientificStatus {
  return SCIENTIFIC_STATUSES.includes(value as ScientificStatus);
}
function isProvenance(value: unknown): value is ProvenanceKind {
  return PROVENANCE_KINDS.includes(value as ProvenanceKind);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keep citation targets independently addressable and safe to render as links. */
export function safeSourceUrl(input: unknown): input is string {
  if (typeof input !== 'string' || !/^https?:\/\//i.test(input) || /\s/.test(input)) return false;
  try {
    const url = new URL(input);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
    );
  } catch {
    return false;
  }
}

function sourcesOf(input: { source?: string; sources?: string[] }): string[] {
  return [...new Set([...(input.sources ?? []), ...(input.source ? [input.source] : [])])];
}

function canonicalQuantity<T>(input: Quantity<T>): Quantity<T> {
  const quantity = { ...input, sources: sourcesOf(input) };
  delete quantity.source;
  return quantity;
}

export function quantityError(input: unknown): string | null {
  if (!isRecord(input)) return 'Property metadata is missing.';
  if (!isStatus(input.status)) return 'Scientific status is missing or unknown.';
  if (!isProvenance(input.provenance)) return 'Provenance is missing or unknown.';
  if (input.source !== undefined && !safeSourceUrl(input.source)) {
    return 'Each source must be a separate, valid HTTP(S) citation URL.';
  }
  if (
    input.sources !== undefined &&
    (!Array.isArray(input.sources) || !input.sources.every(safeSourceUrl))
  ) {
    return 'Each source must be a separate, valid HTTP(S) citation URL.';
  }
  if (input.context !== undefined) {
    if (!isRecord(input.context)) return 'Property context must be an object.';
    const decimals = input.context.displayDecimals;
    if (
      decimals !== undefined &&
      (typeof decimals !== 'number' ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > 100)
    ) {
      return 'Display decimal places must be an integer from 0 to 100.';
    }
    const uncertainty = input.context.uncertainty;
    if (
      uncertainty !== undefined &&
      (typeof uncertainty !== 'string' ||
        !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(uncertainty) ||
        !Number.isFinite(Number(uncertainty)) ||
        Number(uncertainty) < 0)
    ) {
      return 'Numeric uncertainty must be finite and nonnegative.';
    }
  }
  if (input.provenance === 'withheld') {
    if (input.status !== 'unavailable') return 'Withheld properties must be unavailable.';
    if (input.value !== null && input.value !== undefined) {
      return 'Withheld properties must not keep a displayable value.';
    }
  }
  if (typeof input.value === 'number' && !Number.isFinite(input.value)) {
    return 'Numeric values must be finite.';
  }
  if (
    Array.isArray(input.value) &&
    input.value.some((item) => typeof item === 'number' && !Number.isFinite(item))
  ) {
    return 'Numeric values must be finite.';
  }
  if (input.status === 'measured_evaluated' || input.status === 'calculated_predicted') {
    if (input.provenance !== 'cited') {
      return `${input.status} requires cited provenance, not ${input.provenance}.`;
    }
    if (sourcesOf(input as unknown as Quantity<unknown>).length === 0) {
      return `${input.status} requires at least one source.`;
    }
    if (input.value === null || input.value === undefined) {
      return `${input.status} requires a value.`;
    }
  }
  return null;
}

export function inheritNumber(
  value: number | null | undefined,
  context?: PropertyContext,
): Quantity<number> {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { value: null, status: 'unavailable', provenance: 'inherited', context };
  }
  return { value, status: 'unverified', provenance: 'inherited', context };
}

export function inheritText(
  value: string | null | undefined,
  context?: PropertyContext,
): Quantity<string> {
  if (value === null || value === undefined || value === '') {
    return { value: null, status: 'unavailable', provenance: 'inherited', context };
  }
  return { value, status: 'unverified', provenance: 'inherited', context };
}

export function inheritShells(value: number[] | null | undefined): Quantity<number[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return {
      value: null,
      status: 'unavailable',
      provenance: 'inherited',
      context: {
        precisionNote: 'Schematic shell population; not a spectroscopic measurement.',
      },
    };
  }
  return {
    value: [...value],
    status: 'unverified',
    provenance: 'inherited',
    context: {
      precisionNote:
        'Schematic shell population from the inherited dataset, not a spectroscopic measurement.',
    },
  };
}

export function withheld(reason: string, source?: string): Quantity<number> {
  return {
    value: null,
    status: 'unavailable',
    provenance: 'withheld',
    sources: source ? [source] : [],
    withheldReason: reason,
  };
}

function formatNumber(value: number, digits?: number, uncertainty?: string): string {
  if (uncertainty) {
    const match = uncertainty.match(/^0\.0*([1-9]\d*)$/);
    if (match) {
      const decimals = uncertainty.split('.')[1]?.length ?? 0;
      return `${value.toFixed(decimals)}(${match[1]})`;
    }
    return `${value} ± ${uncertainty}`;
  }
  if (typeof digits === 'number') return value.toFixed(digits);
  return String(value);
}

function detailOf(quantity: Quantity<unknown>): string | undefined {
  const parts: string[] = [];
  if (quantity.context?.precisionNote) parts.push(quantity.context.precisionNote);
  if (quantity.context?.allotrope) parts.push(`Allotrope: ${quantity.context.allotrope}.`);
  if (quantity.context?.isotope) parts.push(`Isotope: ${quantity.context.isotope}.`);
  if (quantity.context?.temperatureK != null) parts.push(`T = ${quantity.context.temperatureK} K.`);
  if (quantity.context?.pressurePa != null) parts.push(`p = ${quantity.context.pressurePa} Pa.`);
  if (quantity.withheldReason) parts.push(quantity.withheldReason);
  return parts.length ? parts.join(' ') : undefined;
}

export function presentQuantity(input: unknown, options: PresentOptions = {}): Presentation {
  const error = quantityError(input);
  if (error) {
    return {
      appearance: 'unavailable',
      badge: STATUS_LABEL.unavailable,
      text: 'Not available',
      shownValue: null,
      sources: [],
      reason: error,
    };
  }
  const quantity = input as Quantity<number | string | number[]>;
  if (
    quantity.status === 'unavailable' ||
    quantity.provenance === 'withheld' ||
    quantity.value === null ||
    quantity.value === undefined
  ) {
    return {
      appearance: 'unavailable',
      badge: STATUS_LABEL.unavailable,
      text: 'Not available',
      shownValue: null,
      sources: sourcesOf(quantity),
      detail: detailOf(quantity),
      reason: quantity.withheldReason ?? 'No supported value is available.',
    };
  }

  const unit =
    options.unitSuffix ??
    (quantity.context?.units && !String(quantity.value).includes(quantity.context.units)
      ? quantity.context.units
      : '');
  let text: string;
  if (typeof quantity.value === 'number') {
    text = formatNumber(
      quantity.value,
      quantity.context?.displayDecimals ?? options.digits,
      quantity.context?.uncertainty,
    );
    if (unit) text = `${text} ${unit}`.trim();
  } else if (Array.isArray(quantity.value)) {
    text = quantity.value.join(' · ');
  } else {
    text = quantity.value;
    if (unit) text = `${text} ${unit}`.trim();
  }

  return {
    appearance: quantity.status,
    badge: STATUS_LABEL[quantity.status],
    text,
    shownValue: quantity.value,
    sources: sourcesOf(quantity),
    detail: detailOf(quantity),
  };
}

export function weakestStatus(statuses: ScientificStatus[]): ScientificStatus {
  if (!statuses.length) return 'unavailable';
  return statuses.reduce((weakest, status) =>
    STATUS_RANK[status] < STATUS_RANK[weakest] ? status : weakest,
  );
}

function decimalPlaces(value: number | string): number {
  const [coefficient, exponent = '0'] = String(value).toLowerCase().split('e');
  return Math.max(0, Math.min(100, (coefficient.split('.')[1]?.length ?? 0) - Number(exponent)));
}

function sumContext(parts: Quantity<number>[]): PropertyContext {
  const displayDecimals = Math.min(
    ...parts.map((part) => {
      if (part.context?.displayDecimals !== undefined) return part.context.displayDecimals;
      return decimalPlaces(
        part.context?.uncertainty && Number(part.context.uncertainty) > 0
          ? part.context.uncertainty
          : (part.value as number),
      );
    }),
  );
  const allUncertainties = parts.every((part) => part.context?.uncertainty !== undefined);
  const sameUncertaintyResolution =
    allUncertainties &&
    new Set(parts.map((part) => decimalPlaces(part.context!.uncertainty!))).size === 1;
  // Repeated atoms share the same source quantity: do not assume independent errors
  // and shrink the uncertainty by using a root-sum-of-squares calculation.
  const uncertainty = sameUncertaintyResolution
    ? parts.reduce((sum, part) => sum + Number(part.context!.uncertainty), 0)
    : undefined;
  const uncertaintyNote =
    uncertainty !== undefined && Number.isFinite(uncertainty)
      ? 'Uncertainties are added linearly, including repeated uses of the same atomic mass; no independence assumption or new confidence level is assigned.'
      : allUncertainties
        ? 'No total uncertainty is assigned to inputs with different uncertainty resolutions; consult the individual source records.'
        : 'No total uncertainty is supplied because not every input provides a numeric uncertainty.';
  return {
    units: 'u',
    displayDecimals,
    ...(uncertainty !== undefined && Number.isFinite(uncertainty)
      ? { uncertainty: uncertainty.toFixed(displayDecimals) }
      : {}),
    precisionNote: `Arithmetic sum of supplied atomic masses, not a new measurement. Display rounded to the least precise supplied decimal place; extra precision is not inferred. ${uncertaintyNote}`,
  };
}

export function combineNumericQuantities(parts: Quantity<number>[]): Quantity<number> {
  if (!parts.length) {
    return { value: 0, status: 'unavailable', provenance: 'inherited' };
  }
  for (const part of parts) {
    const error = quantityError(part);
    if (error || part.status === 'unavailable' || part.value === null) {
      return {
        value: null,
        status: 'unavailable',
        provenance: parts.some((item) => item.provenance === 'withheld') ? 'withheld' : 'inherited',
        withheldReason: 'A mass total is not shown when any atom lacks a supported mass.',
      };
    }
  }
  const value = parts.reduce((sum, part) => sum + (part.value as number), 0);
  if (!Number.isFinite(value)) {
    return {
      value: null,
      status: 'unavailable',
      provenance: 'inherited',
      withheldReason: 'The mass total is outside the supported finite numeric range.',
    };
  }
  const status = weakestStatus(parts.map((part) => part.status));
  const cited = parts.every((part) => part.provenance === 'cited');
  const sources = [...new Set(parts.flatMap(sourcesOf))];
  return {
    value,
    status,
    provenance: cited ? 'cited' : 'inherited',
    context: sumContext(parts),
    sources,
  };
}

/** Outer-shell count inherits the parent shells quantity's status and provenance. */
export function outerPopulation(shells: Quantity<number[]>): Quantity<number> {
  const error = quantityError(shells);
  if (error) {
    return { value: null, status: 'unavailable', provenance: 'inherited' };
  }
  if (!Array.isArray(shells.value) || shells.value.length === 0) {
    return {
      value: null,
      status: 'unavailable',
      provenance: shells.provenance,
      sources: sourcesOf(shells),
      context: shells.context,
      withheldReason: shells.withheldReason,
    };
  }
  return {
    ...canonicalQuantity(shells),
    value: shells.value[shells.value.length - 1],
  };
}

function configFromInherited(config: string): Quantity<string> {
  const estimated = config.startsWith('*');
  const value = estimated ? config.slice(1).trim() : config;
  return inheritText(value, {
    precisionNote: estimated
      ? 'Inherited dataset marked this configuration as estimated (*). That marker is not an independently sourced prediction.'
      : undefined,
  });
}

export function compileElement(raw: InheritedElement, overlay: ElementOverlay = {}): ElementData {
  const compiled: ElementData = {
    n: raw.n,
    sym: raw.sym,
    name: raw.name,
    cat: raw.cat,
    x: raw.x,
    y: raw.y,
    block: raw.block,
    period: raw.period,
    group: raw.group,
    cpk: raw.cpk,
    latkey: raw.latkey,
    mass: inheritNumber(raw.mass, { units: 'u' }),
    density: inheritNumber(raw.density),
    melt: inheritNumber(raw.melt, { units: 'K' }),
    boil: inheritNumber(raw.boil, { units: 'K' }),
    eneg: inheritNumber(raw.eneg, { units: 'Pauling' }),
    eaff: inheritNumber(raw.eaff, { units: 'kJ/mol' }),
    ie1: inheritNumber(raw.ie1, { units: 'kJ/mol' }),
    config: configFromInherited(raw.config),
    shells: inheritShells(raw.shells),
    phase: inheritText(raw.phase),
    lattice: inheritText(raw.lattice, {
      precisionNote: 'Illustrative structure label from the inherited dataset; not to scale.',
    }),
    appear: inheritText(raw.appear),
    disc: inheritText(raw.disc),
  };
  for (const field of QUANTITY_FIELDS) {
    const next = overlay[field];
    if (next) compiled[field] = next as never;
  }
  if (overlay.latkey !== undefined) compiled.latkey = overlay.latkey;
  for (const field of QUANTITY_FIELDS) {
    const error = quantityError(compiled[field]);
    if (error) throw new Error(`${raw.sym}.${field}: ${error}`);
    compiled[field] = canonicalQuantity(compiled[field] as Quantity<unknown>) as never;
  }
  return compiled;
}

export function compileElements(
  inherited: InheritedElement[],
  overlays: Record<string, ElementOverlay> = {},
): ElementData[] {
  return inherited.map((raw) => compileElement(raw, overlays[raw.sym] ?? {}));
}
