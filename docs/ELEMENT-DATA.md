# Element data: status, provenance, and withholding

The element inspector is a scientific display, not a dump of whatever the original file contained. Every displayed property has an explicit **scientific status** and a separate **provenance**. Missing metadata cannot look like a measured value.

This is the first cut of the element-data audit. It does not claim that every inherited number has been checked against a primary source.

## Scientific status

These four statuses are the only allowed claims:

| Status                   | Meaning                                                          | May show a number?                            |
| ------------------------ | ---------------------------------------------------------------- | --------------------------------------------- |
| **Measured/evaluated**   | An authoritative evaluation, with a citation.                    | Yes, only with cited provenance and a source. |
| **Calculated/predicted** | A calculated or predicted quantity, with a citation.             | Yes, only with cited provenance and a source. |
| **Unverified**           | A value from the inherited dataset. Not a reference measurement. | Yes, labeled unverified.                      |
| **Unavailable**          | No supported value. Includes withheld inherited figures.         | No.                                           |

Unverified is not predicted. A minus sign on electron affinity is not evidence that the value was computed. A leading `*` on an inherited electron configuration is a marker in the dump; it does not promote the configuration to calculated/predicted without an independent source.

## Provenance

Provenance answers _how this record got here_, not whether the number is true:

- **inherited** — copied from the original element file
- **cited** — replaced or confirmed against a named source
- **withheld** — an inherited figure was removed from the live value so it cannot be displayed

A withheld melting point stays unavailable. It is not shown as “126 K — predicted.”

## First-cut overlays

The inherited file is preserved as `INHERITED_ELEMENTS`. Live `ELEMENTS` are compiled from that file plus explicit overlays.

| Element     | Field         | Action                                                                                                                      | Source                                                 |
| ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Helium      | atomic mass   | Replaced. CIAAW _A__r(He) = 4.002 602(2) since 1983. The dump stored `4.0026022`, which flattened the uncertainty notation. | https://ciaaw.org/helium.htm                           |
| Hassium     | melting point | Withheld. Inherited `126` K is not displayed. RSC lists the melting point as unknown.                                       | https://periodic-table.rsc.org/element/108/hassium     |
| Hassium     | density       | Withheld. RSC lists density as unknown.                                                                                     | same RSC page                                          |
| Carbon      | density       | Withheld. Inherited `1.821` had no allotrope.                                                                               | none; unsupported as a single measured density         |
| Copernicium | boiling point | Withheld. Inherited `3570` K is unsupported; no decimal correction or prediction is inferred.                               | https://periodic-table.rsc.org/element/112/copernicium |

Fourteen inherited configurations beginning with `*` are shown without the star, as **unverified**, with a note that the dump marked them estimated. Twenty negative electron affinities remain **unverified**; their sign is not interpreted.

## Consumers

Molar-mass totals use the same status rules. The total is only measured/evaluated when every atom’s mass is. If any mass is unavailable or withheld, the total is not shown as a number. Shell populations remain schematic and are labeled unverified; they are not spectroscopic measurements. Phase and lattice strings are unverified inherited labels; lattice graphics stay illustrative.

The inspector renders a source link and context on each property that has them. Mass and phase keep separate status badges, so a measured mass cannot make an unverified phase look evaluated. Shell graphics and outer-shell counts use the same presenter; they do not read raw arrays.

Citations are independent, deduplicated HTTP(S) URLs, not joined strings used as one link. Compact badges inside buttons and decorative previews are noninteractive; complete citations remain in the inspector. The mass-total sources and arithmetic policy are available under **Mass total · sources & precision**.

Scalar sums retain the least precise supplied decimal place, avoiding binary floating-point display artifacts without inventing digits. Where all inputs provide numeric uncertainties at the same decimal resolution, uncertainties are added linearly, including repeated uses of the same quantity; the UI states that this assumes neither independent errors nor a new confidence level. Other sums do not invent an aggregate uncertainty. A sum is an arithmetic result, not a new measurement.

H/C/N/O still use inherited, unverified scalars. Their proposed CIAAW interval records have **not** been applied. An evaluated interval is not a scalar uncertainty or a midpoint: it needs explicit interval representation and an independently specified policy for educational molar-mass arithmetic. No workspace-schema change was made for this work.

Passing the chemistry and launcher suites does not establish reference-data accuracy. The element-data tests check status enforcement, the helium citation, withheld hassium and carbon figures, the two non-inference rules above, rendered citations, distinct mass/phase badges, finite-number rejection, and cited calculated mass totals.

## Remaining work

- Cite standard atomic weights for more elements (CIAAW), with uncertainty or interval notation preserved rather than flattened.
- Qualify remaining densities by allotrope, temperature, and pressure, or withhold them.
- Source electron affinities with an explicit sign convention before treating any negative value as a physical result.
- Keep Safari/Firefox browser verification on the roadmap before the next substantial lesson.
