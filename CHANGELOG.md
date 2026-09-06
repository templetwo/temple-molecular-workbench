# Changelog

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
