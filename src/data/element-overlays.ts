import { withheld, type ElementOverlay, type Quantity } from './element-properties';

export const CIAAW_HELIUM = 'https://ciaaw.org/helium.htm';
export const CIAAW_HYDROGEN = 'https://ciaaw.org/hydrogen.htm';
export const CIAAW_CARBON = 'https://ciaaw.org/carbon.htm';
export const CIAAW_NITROGEN = 'https://ciaaw.org/nitrogen.htm';
export const CIAAW_OXYGEN = 'https://ciaaw.org/oxygen.htm';
export const CIAAW_ABRIDGED = 'https://ciaaw.org/abridged-atomic-weights.htm';
export const RSC_HASSIUM = 'https://periodic-table.rsc.org/element/108/hassium';
export const RSC_COPERNICIUM = 'https://periodic-table.rsc.org/element/112/copernicium';

const heliumMass: Quantity<number> = {
  value: 4.002602,
  status: 'measured_evaluated',
  provenance: 'cited',
  source: CIAAW_HELIUM,
  context: {
    units: 'u',
    uncertainty: '0.000002',
    precisionNote:
      'CIAAW standard atomic weight Ar(He) = 4.002 602(2) since 1983. The inherited dump stored 4.0026022, which flattened the uncertainty notation into an extra digit.',
  },
};

/** Abridged SAW for interval-valued elements. The interval itself is not a scalar ±u. */
function ciaawAbridgedIntervalMass(input: {
  abridged: string;
  interval: string;
  uncertainty: string;
  value: number;
  displayDecimals: number;
  elementPage: string;
  inheritedDump: string;
}): Quantity<number> {
  return {
    value: input.value,
    status: 'measured_evaluated',
    provenance: 'cited',
    sources: [CIAAW_ABRIDGED, input.elementPage],
    context: {
      units: 'u',
      uncertainty: input.uncertainty,
      displayDecimals: input.displayDecimals,
      precisionNote: `CIAAW abridged standard atomic weight ${input.abridged} (Abridged Standard Atomic Weights 2024). The standard atomic weight itself is the interval ${input.interval} since 2009 because of natural isotopic variation; that interval is not a scalar measurement uncertainty and is not a midpoint invented here. The inherited dump stored ${input.inheritedDump} without citing either table.`,
    },
  };
}

const hydrogenMass = ciaawAbridgedIntervalMass({
  value: 1.008,
  displayDecimals: 4,
  uncertainty: '0.0002',
  abridged: 'Ar(H) = 1.0080 ± 0.0002',
  interval: '[1.00784, 1.00811]',
  elementPage: CIAAW_HYDROGEN,
  inheritedDump: '1.008',
});

const carbonMass = ciaawAbridgedIntervalMass({
  value: 12.011,
  displayDecimals: 3,
  uncertainty: '0.002',
  abridged: 'Ar(C) = 12.011 ± 0.002',
  interval: '[12.0096, 12.0116]',
  elementPage: CIAAW_CARBON,
  inheritedDump: '12.011',
});

const nitrogenMass = ciaawAbridgedIntervalMass({
  value: 14.007,
  displayDecimals: 3,
  uncertainty: '0.001',
  abridged: 'Ar(N) = 14.007 ± 0.001',
  interval: '[14.00643, 14.00728]',
  elementPage: CIAAW_NITROGEN,
  inheritedDump: '14.007',
});

const oxygenMass = ciaawAbridgedIntervalMass({
  value: 15.999,
  displayDecimals: 3,
  uncertainty: '0.001',
  abridged: 'Ar(O) = 15.999 ± 0.001',
  interval: '[15.99903, 15.99977]',
  elementPage: CIAAW_OXYGEN,
  inheritedDump: '15.999',
});

export const ELEMENT_OVERLAYS: Record<string, ElementOverlay> = {
  H: { mass: hydrogenMass },
  He: { mass: heliumMass },
  N: { mass: nitrogenMass },
  O: { mass: oxygenMass },
  Cn: {
    boil: withheld(
      'Inherited boiling point 3570 K is withheld. The Royal Society of Chemistry lists this property as unknown. No decimal correction or predicted value is inferred.',
      RSC_COPERNICIUM,
    ),
  },
  C: {
    mass: carbonMass,
    density: withheld(
      'Inherited density 1.821 had no allotrope. Graphite, diamond, and amorphous carbon differ, so a single density is not displayed.',
    ),
  },
  Hs: {
    melt: withheld(
      'Inherited melting point 126 K is withheld. The Royal Society of Chemistry currently lists the melting point of hassium as unknown. The inherited figure is not relabeled as predicted.',
      RSC_HASSIUM,
    ),
    density: withheld(
      'Inherited density 40.7 is withheld. The Royal Society of Chemistry currently lists the density of hassium as unknown.',
      RSC_HASSIUM,
    ),
  },
};
