import { withheld, type ElementOverlay, type Quantity } from './element-properties';

export const CIAAW_HELIUM = 'https://ciaaw.org/helium.htm';
export const RSC_HASSIUM = 'https://periodic-table.rsc.org/element/108/hassium';

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

export const ELEMENT_OVERLAYS: Record<string, ElementOverlay> = {
  He: { mass: heliumMass },
  C: {
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
