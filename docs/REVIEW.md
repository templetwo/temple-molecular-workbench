# Project review and next steps

This document records the September 2026 upgrade of the original 3D chemistry simulator into Temple Molecular Workbench. It distinguishes implemented behavior from work that still needs scientific or browser validation.

## Findings addressed

| Finding in the starting project                                                                                                                     | Resulting change                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The bench opened empty, with no curated molecular examples or geometry lessons.                                                                     | Six reference molecules provide immediate starting points; benzene is the default. Each includes composition, connectivity, coordinates, and explanatory notes.                                            |
| Structural edits had no undo or redo history. Clearing or replacing a structure could not be reversed.                                              | A bounded 50-step history covers structural edits, preset loading, import, and clear. Atom dragging is coalesced into one step.                                                                            |
| Molecular state existed only in memory.                                                                                                             | Browser-local persistence and portable, versioned JSON import/export retain scenes and display settings. Unavailable or corrupt browser storage falls back safely.                                         |
| Mutation methods accepted symbols, coordinates, or identifiers without consistently validating them.                                                | Runtime checks enforce known elements, finite bounded coordinates, valid bond endpoints/orders, unique identifiers and pairs, and capacity limits. Invalid imports are rejected before live state changes. |
| Selection and bond-source inputs were trusted without checking membership in the current atom list.                                                 | Selection and bonding now validate atom membership; deletion retains graph cleanup, and history restoration clears transient selections.                                                                   |
| Dragging flattened atom positions onto a horizontal plane at their display radius, and the ray-plane intersection result was not checked correctly. | Dragging uses a camera-facing plane through the atom, retains the initial grab offset, and updates coordinates only after a successful intersection.                                                       |
| Each atom installed window-level pointer listeners and subscribed broadly to state updates.                                                         | A shared interaction hook handles dragging and cancellation; memoized meshes reduce unrelated updates.                                                                                                     |
| The renderer ran continuously and had no application-level WebGL failure or recovery view.                                                          | The workbench renders on demand when idle and provides a fallback with retry. The studio environment is generated in the scene without remote environment assets.                                          |
| The interface offered little distinction between a molecular sketch and scientific simulation.                                                      | Source-backed geometry lessons, coordinate units, explanatory benzene resonance text, and explicit model boundaries distinguish reference structures, measurements, and visual conventions.                |
| The graph had formula and mass helpers but no fragment or valence feedback.                                                                         | Structure analysis counts connected components and provides limited advisory checks for common neutral covalent valences.                                                                                  |
| The repository retained template documentation, a private inspection plugin reference, and dependency URLs tied to a private package mirror.        | Project documentation replaces the scaffold; the private Vite plugin was removed and lockfile URLs were normalized to the public npm registry.                                                             |

The interface now brings the molecule collection, workbench controls, periodic table, and property inspector into one studio. Display options include ball-and-stick, illustrative space-fill, wireframe, labels, a reference grid, and automatic rotation.

## Verification recorded

The chemistry/state suite contains **16 passing regression tests** at the time of this review. It verifies all six preset compositions; selected reference bond lengths and angles; benzene planarity and equal ring distances; ethanol geometry; formula and mass calculations; undo/redo behavior; drag coalescing; malformed import rejection; persistence recovery; and broken graph analysis. The full ESLint check, TypeScript compilation, and Vite production build pass.

The local server/launcher suite adds **13 passing regression tests**, for **29 chemistry/state and server/launcher tests** in total. It covers loopback binding, static asset MIME types, GET/HEAD behavior, traversal and symlink escape rejection, invalid build roots, app/version health checks, port conflicts, moved-bundle recovery, readiness files, browser-opening failure, and CLI startup and termination.

The development Playwright suite passes **13 real-browser workflows** in Chrome: all six distinct molecule renders; representations and controls; undo/redo; element search, category filters and keyboard focus; atom addition; valid/invalid import and export; typing guards; numeric coordinate editing; atom-list bonding/deletion; an actual canvas drag with one history entry; reload persistence; 390px mobile behavior; and a forced WebGL-unavailable fallback. A separate packaged-build suite passes **5 offline browser workflows**. Desktop and mobile screenshots were inspected visually. These tests use a software-rendered browser and do not establish performance on mobile hardware or cross-browser support.

The packaged macOS `.app` was successfully launched and relaunched locally. The distribution targets **Apple Silicon Macs running macOS 11 or later** and includes its own Node runtime and built site, so running the app does not require a separate Node or npm installation. The bundle is **unsigned and not notarized**; macOS may require explicit user approval before opening a downloaded copy. Local launch verification does not establish notarized distribution or support for Intel Macs.

The build retains a roughly 895 KB uncompressed shared Three/Fiber chunk (about 241 KB gzipped), loaded separately from the application shell. Vite flags it with a bundle-size advisory; this is a remaining performance consideration, not a failed build.

Use `npm test`, `npm run lint`, and `npm run build` to verify the current checkout. GitHub Actions repeats the automated checks and both browser suites on pushes to `main`; see the [live CI status](https://github.com/templetwo/temple-molecular-workbench/actions/workflows/ci.yml) for the current result. The counts above record completed local checks, not a claim that every browser interaction or every inherited scientific value has been verified.

## Scientific scope

The reference geometry sources are listed in [the README](../README.md#the-chemistry) and beside the data in [`src/data/molecules.ts`](../src/data/molecules.ts). They include [NIST CCCBDB](https://cccbdb.nist.gov/) and the [IUPAC definition of aromaticity](https://goldbook.iupac.org/terms/view/A00442).

The editor has no force field, optimization engine, quantum solver, formal-charge model, or reaction model. A manual arrangement is not an equilibrium calculation. Passing the advisory checks does not establish stability. Benzene bond orders encode one Kekulé drawing while its reference ring edges remain equal in length.

The original element dataset is retained and not independently verified. Its fields need a source and uncertainty audit. In particular, missing and predicted values must remain distinguishable from measured ones, and displayed precision must be justified by the source. Molar masses currently inherit those data limits. Electron-shell and lattice graphics are schematic illustrations.

## Roadmap

The following are proposed directions, not implemented features or release commitments.

1. **Audit element data.** Establish per-field references, units, uncertainty, prediction status, and a reproducible update path. Add checks for data completeness and internal consistency.
2. **Expand browser regression coverage.** Extend the existing Chrome workflows to Firefox and Safari, and add deeper pointer-cancellation/context-loss tests. Measure performance on representative mobile hardware before setting performance targets.
3. **Expand geometric editing tools.** Numeric coordinate editing is available. Consider explicit axis constraints and selection-based angle/dihedral measurement with clear units and undo behavior.
4. **Broaden chemical representation.** Design charge, isotope, radical, and aromatic-bond semantics before adding file formats or validation that depend on them. Keep the existing versioned workspace format compatible through explicit migrations.
5. **Develop guided lessons.** Add small, source-backed exercises for molecular shape, resonance representations, and conformations with observable learning outcomes.
6. **Evaluate calculated geometry as a separate capability.** An optional optimization engine would need declared methods, supported elements, error reporting, and validation against reference cases. Preserve the distinction between an editable drawing and a computed result.
