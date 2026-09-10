# Changelog

## 1.3.0 — 2026-09-10

- Species library separate from 3D presets: the original six plus H₂, N₂, O₂, and CO drawings, and liquid water as a bookkeeping species without a 3D model.
- Inspector species card: hyphenated CAS, InChIKey, NIST WebBook / CCCBDB / PubChem links, and quoted Chase 1998 (JANAF) ΔfH° and S° where those values were retrieved from WebBook on 2026-09-06.
- Reaction lab: user-declared reactants and products, conservation check, integer balance, limiting reagent, atom economy, and 298.15 K ΔrH°/ΔrG°/K. Missing formation data stays unavailable.
- Unit toggle for temperature, energy, and pressure. Scene JSON stays schema version 1.
- Bond-length callouts and an explain-this-bond focus dim, both default off. XYZ export/import of coordinates (no bonds).
- Hazardous gases (Cl₂, SO₂, HCl) are not in this cut.
- H, C, N, and O atomic masses cite CIAAW abridged standard atomic weights (1.0080 ± 0.0002, 12.011 ± 0.002, 14.007 ± 0.001, 15.999 ± 0.001). The interval standard atomic weights are named in the notes; they are not stored as scalar ±u or as a midpoint. Water, methane, and the other H/C/N/O molar-mass badges are measured/evaluated arithmetic of those cited masses. Lithium and the rest of the table stay unverified.
- Atom economy is the first listed product’s mass over the mass of all reactants in the balanced equation. The earlier product-sum form was 100% for every balanced equation and measured nothing.
- The header keeps its controls inside a 390 px viewport: below 700 px the unit toggle lives in the Reaction lab dialog and the export buttons go icon-only with accessible names. The Reaction lab dialog carries a unit toggle at every width.
- Review fixes before release: the balancer no longer re-runs on every keystroke; a cleared or zero amount reads as a missing amount instead of Infinity; liquid water's thermochemistry is tagged CODATA 1984 so a Hess sum that mixes it with Chase 1998 values says so; a stale explain-this-bond selection no longer dims the next molecule; XYZ import rejects a blank count line and extra atom lines; the four gases are recognized by the bonding coach but are not offered as guided lessons.
- Reaction lab selects and mole inputs have accessible names. A Reaction lab browser workflow checks methane combustion totals, the water-phase switch, unavailable propagation, limiting reagent, an unbalanceable declaration, dialog isolation, unit conversion and persistence, and the 390 px layout.

## 1.2.0 — 2026-09-06

- Added Bonding coach: six-reference connectivity recognition, inventory-only suggestions, and guided 3D builds with numbered atoms, next-pair rings, and undoable bond/order edits. Reference geometry loading remains explicit; no reaction prediction or workspace-schema change.
- Fixed scalar mass-sum display precision, separate citation links, and nested/hidden citation controls. Copernicium's unsupported inherited boiling point is withheld with its RSC source.
- Preserved the bench camera across Electron Lab visits; common-valence summaries now expose coverage. H₂ stationary-calculation and nonexperimental-energy caveats are always visible.
- Added safe successful-stage cleanup and package/server version-parity guards; recovery backups are preserved.

- Element properties now carry an explicit scientific status (measured/evaluated, calculated/predicted, unverified, unavailable) separate from provenance (inherited, cited, withheld).
- The inspector and molar-mass total cannot present a number as measured unless the record is cited. Missing metadata is unavailable.
- Helium’s atomic mass uses the CIAAW standard weight 4.002 602(2). The inherited `4.0026022` is kept in the dump as evidence that uncertainty notation had been flattened.
- Hassium’s inherited melting point 126 K and density 40.7 are withheld. RSC currently lists both as unknown; they are not relabeled as predicted.
- Carbon’s inherited density 1.821 is withheld until an allotrope is specified.
- Starred electron configurations and negative electron affinities stay unverified. Neither marker is treated as a calculation or prediction.
- README credit: created by The Temple of Two in collaboration with Astra (OpenAI Codex).
- Inspector citations: each property can show its source link and context. Helium mass links to CIAAW.
- Header mass and phase are separate badges. Shell graphics and outer-shell counts use the validated presenter.
- Cited calculated mass totals keep cited provenance. Non-finite numbers cannot look measured.

## 1.1.0 — 2026-09-05

- A separate Electron Lab with rotatable hydrogen 1s, 2s, and 2p probability clouds, radial/angular node explanations, and optional enlarged nucleus markers.
- A guided H₂ bonding lesson links electron density, nuclear separation, and a 25-point calculated energy curve. Keyboard-accessible controls compare close, lowest-sampled-energy, and separated-atom configurations.
- Reproducible PySCF 2.14.0 singlet FCI/STO-3G data includes total energy, AO density matrices, a same-basis separated-neutral-H reference, generator provenance, and numerical validation.
- Demand-rendered clouds, responsive lessons, focus handling, and useful scientific content when WebGL is unavailable. The main workbench canvas is suspended while the lab is open; its graph and history stay separate.

These are stationary probability/density views and precomputed fixed-nuclei calculations, not electron trajectories, live reactions, or quantum calculations on edited structures. The compact molecular basis is an educational approximation. See [Electron Lab scientific notes](docs/ELECTRON-SCIENCE.md).

## 1.0.0 — 2026-09-05

Temple Molecular Workbench turns the original chemistry prototype into an interactive learning studio.

- Graphite-and-lime interface with a molecule collection, 3D editing viewport, and structure inspector.
- Six NIST-grounded reference structures: benzene, water, methane, ammonia, carbon dioxide, and ethanol.
- Glossy CPK-colored atoms and split-color bonds, three representations, camera fitting, labels, grid, and rotation controls.
- True 3D dragging, keyboard coordinate editing, and atom-list bonding/deletion.
- Undo/redo, local persistence, and validated JSON workspace import/export.
- Searchable 118-element library with keyboard/touch addition and schematic atomic and crystal views.
- Formula, molar mass, bond distances, fragment counts, and limited neutral-valence notes.
- Responsive layouts, dialog focus handling, and a recoverable WebGL-unavailable view.
- Public-registry dependency lockfile, automated checks, source references, contribution templates, and MIT licensing.
- A one-click macOS app with its own Node runtime, an offline loopback server, and an architecture-specific ZIP bundle.
- Temple Lab vector and PNG logos, a native macOS icon, and reproducible branding assets.

The downloadable Mac bundle targets Apple Silicon and macOS 11 or later. It is not yet Developer ID signed or notarized.

This release models and explains molecular structures. It does not calculate reactions, equilibrium geometries, or quantum behavior. The inherited elemental-property data remains subject to a provenance audit.
