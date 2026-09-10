# Bonding coach: recognition, not reaction prediction

Bonding coach answers two limited questions: “Does my drawn bond pattern match a reference?” and “How do I draw one of these reference molecules?” It does not predict the products of mixing substances, spontaneity, stability, reaction conditions, or yields. Reaction bookkeeping lives in Reaction lab.

## Explore your drawing

The coach compares complete connected components against ten references: water, methane, ammonia, carbon dioxide, ethanol, benzene, hydrogen (H₂), nitrogen (N₂), oxygen (O₂), and carbon monoxide (CO). Atom symbols and bond orders must match. IDs, array order, endpoint direction, and coordinates do not determine recognition.

- **Connectivity matches:** a complete component has the same labeled bond graph as a reference. Extra, unmatched atoms are reported separately. A recognized graph at distorted or coincident coordinates is not validated geometry.
- **Atom counts match; bonds do not:** the whole bench has a reference composition but different or incomplete connections. Formula alone cannot identify a molecule: ethanol and dimethyl ether are a standard counterexample. See [IUPAC constitution](https://goldbook.iupac.org/terms/view/C01282) and [constitutional isomerism](https://goldbook.iupac.org/terms/view/C01285).
- **Reference possibilities:** inventory-only comparisons list missing or leftover atoms. Existing bonds and real chemical reactivity are not used to predict a transformation.
- **No match:** outside this ten-reference library, not evidence that a structure cannot exist. The app has no charge, radical, isotope, or stereochemical representation.

Reference geometry sources remain the NIST CCCBDB links in [`src/data/molecules.ts`](../src/data/molecules.ts). Recognition does not restore `activePresetId`, which is reserved for the actual, unchanged reference drawing.

## Guided practice

Guided lessons cover the original six references only: water, methane, ammonia, carbon dioxide, ethanol, and benzene. Hydrogen, nitrogen, oxygen, and carbon monoxide are recognized above but are not offered by **Start guided build** or by reference-possibility suggestions—a diatomic gas has one bond and little to practice, and the exclusion is a presentation choice (`guidedLesson: false` in [`src/data/molecules.ts`](../src/data/molecules.ts)), not a change to what recognition matches.

Choose a reference and select **Start guided build**. This explicitly replaces the current bench with an unbonded atom set in an expanded reference layout. The layout is chosen for editing, not calculated as an equilibrium. Starting a guide is one undoable structural action.

Blue rings and numbered atom labels identify the next suggested pair. Draw connections with two atom clicks, use the numbered keyboard-accessible controls, or select **Add suggested bond**. Each assisted addition or bond-order correction is one undoable change. Existing coordinates are not moved when a bond is drawn. A connection “not the suggested pair for this exercise” differs from the numbered plan, not from chemistry: equivalent atoms such as the hydrogens on one carbon are interchangeable, and a completed drawing is accepted whenever its whole graph matches the reference.

After matching the reference bond pattern, **Load reference geometry** is an explicit, separate replacement. Undo restores the practice drawing. Guide selection itself is transient UI state, not a new workspace-schema field; saved/exported atoms and bonds remain schema version 1. Reloading keeps the drawing but ends the guide. Loading a collection reference or successfully importing a workspace also ends the guide. Other changes to the guide's atom set pause its hints; Undo can restore it.

The main bench camera survives opening/closing Electron Lab at the same viewport size. Explicit fit, structural resets, and viewport resizing still refit the drawing. These camera details do not modify molecular coordinates or exported files.

## Method and tests

The ten reference graphs are trees (including the four single-edge diatomics) or a single ring with branches (benzene). The matcher uses exact canonical labeled tree/unicyclic signatures, not a permissive formula lookup or an unbounded permutation search. Benzene's equivalent alternating Kekulé drawings match; an altered bond order does not. Attached extra atoms cannot be silently dropped to match a subgraph. Work is bounded by the existing 128-atom and 384-bond limits.

Tests include renamed/reordered reference graphs, every single-bond deletion/order mutation in all ten references, ether versus ethanol connectivity, multiple waters, unrelated fragments, unsupported elements, malformed graphs, inventory suggestions, guided progress, and that the four diatomic gases are recognized while `guidedPresets()` excludes them from guided-build entry points. Store tests cover undo/redo, atomic connection edits, rejected no-ops, and unchanged coordinates/schema. Browser tests use actual controls, local saved state, real rendered camera comparisons, mobile layout, and forced WebGL failure; external network access is blocked.

Common-valence advice remains separate. It covers only the ten listed neutral-covalent element rules and now reports checked-atom counts and unsupported symbols. No flags is not a claim of chemical validity or stability.
