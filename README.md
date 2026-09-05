![Temple Lab — Molecular Workbench, a little curiosity and a whole world of possibilities](docs/banner.svg)

<div align="center">
  <img src="public/temple-lab-mark.png" width="80" height="80" alt="Temple Lab molecular mark" />
  <h1>Temple Molecular Workbench</h1>
  <p><strong>A space to explore, one bond at a time.</strong></p>
  <p>An interactive 3D chemistry studio for the curious.<br />Explore reference molecules, build structures, and see chemistry take shape.</p>
  <p>
    <a href="https://github.com/templetwo/temple-molecular-workbench/actions/workflows/ci.yml"><img src="https://github.com/templetwo/temple-molecular-workbench/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-d5f582?labelColor=202629" alt="MIT license" /></a>
    <a href="package.json"><img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=61dafb&labelColor=202629" alt="React 19" /></a>
    <a href="src/components/Bench3D.tsx"><img src="https://img.shields.io/badge/Three.js-3D-white?logo=threedotjs&labelColor=202629" alt="Three.js" /></a>
    <a href="tsconfig.app.json"><img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white&labelColor=202629" alt="TypeScript 5.9" /></a>
  </p>
  <p><a href="#get-started">Get started</a> · <a href="#controls">Controls</a> · <a href="#the-chemistry">The chemistry</a> · <a href="CONTRIBUTING.md">Contribute</a></p>
</div>

![Temple Molecular Workbench showing benzene, the molecule collection, 3D editing controls, and structure insights](docs/workbench.png)

<details>
<summary>Designed for smaller screens, too</summary>
<p align="center"><img src="docs/workbench-mobile.png" width="330" alt="The mobile workbench with a 3D benzene model and structure insights" /></p>
</details>

## A workbench for discovery

Start with benzene's ring, rotate methane's tetrahedron, or build a structure from the periodic table. A focused studio layout keeps the collection, the molecule, and its properties together.

- **Six reference molecules.** Benzene, water, methane, ammonia, carbon dioxide, and ethanol, with geometry notes and source-backed coordinates.
- **118 elements to explore.** Search by name, symbol, or atomic number; filter categories; inspect element properties and schematic atomic views.
- **An editable 3D bench.** Move atoms, connect bonds, cycle single/double/triple bonds, and switch between ball-and-stick, illustrative space-fill, and wireframe views.
- **Structure insights.** Formula, molar mass, composition, connected fragments, bond distances, and advisory checks for common neutral valences.
- **Room to experiment.** Undo and redo up to 50 structural edits, including atom drags, imported molecules, preset changes, and a cleared bench.
- **Your workspace, in your browser.** Local saving when browser storage is available, plus portable JSON import and export. No account or molecular-data backend is required.

## Get started

### One click on macOS

Download the [Apple Silicon Mac bundle](https://github.com/templetwo/temple-molecular-workbench/releases/latest/download/Temple-Lab-macOS-arm64.zip), unzip it, and double-click **Temple Lab.app**. The bundle includes the simulator and its runtime. No terminal commands, Node installation, npm installation, or internet connection are needed to use the bundled workbench.

The current bundle is for Apple Silicon Macs running macOS 11 or later. It is not yet Developer ID signed or notarized; downloaded copies may require approval in macOS Privacy & Security. See [launcher notes](docs/LAUNCHER.md) for details and source-build instructions.

### Run from source

Use **Node.js 22.12 or newer** and npm. The 3D view requires a browser with WebGL 2 support.

```sh
git clone https://github.com/templetwo/temple-molecular-workbench.git
cd temple-molecular-workbench
npm ci
npm run dev
```

Open the address printed by Vite, normally **http://127.0.0.1:5173**. Choose a molecule from the collection or open the element library to add an atom.

| Command            | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `npm run dev`      | Start the local development server                           |
| `npm test`         | Run chemistry, workspace-state, and launcher regression tests |
| `npm run lint`     | Check the source with ESLint                                 |
| `npm run build`    | Type-check and produce the static site in `dist/`            |
| `npm run preview`  | Preview the production build locally                         |
| `npm run check`    | Run regression tests, lint, and the production build          |
| `npm run test:e2e` | Verify real browser workflows against a running local server |
| `npm run test:packaged` | Verify the offline production app at `127.0.0.1:5178`   |

For browser tests, start `npm run dev` in another terminal. The test runner uses locally installed Google Chrome when available; otherwise run `npx playwright install chromium` once. Failure screenshots are written to `test-results/`. To refresh the README screenshots, use `npm run test:e2e -- --screenshot`.

Use `npm start` to open an existing production build, `npm run bundle:mac` to create the app and ZIP for the current Mac architecture, and `npm run icons` to regenerate the PNG logos and native icon from the SVG artwork.

## Controls

| Action                             | Input                                                           |
| ---------------------------------- | --------------------------------------------------------------- |
| Orbit the molecule                 | Drag empty space                                                |
| Zoom                               | Scroll the wheel                                                |
| Move an atom                       | Select **Move**, then drag the atom                             |
| Connect atoms                      | Select **Bond**, then select two atoms                          |
| Change bond order                  | Click a bond in Move mode, or use the bond-measurement controls |
| Remove an atom or bond             | Select **Erase**, then select the object                        |
| Switch Move / Bond / Erase         | `1` / `2` / `3`                                                 |
| Open the element library           | `T`                                                             |
| Fit the molecule to the viewport   | `F`                                                             |
| Undo                               | `⌘/Ctrl Z`                                                      |
| Redo                               | `⌘/Ctrl Shift Z` or `⌘/Ctrl Y`                                  |
| Remove the selected atom           | `Delete` or `Backspace`                                         |
| Clear selection and return to Move | `Esc`                                                           |

The viewport also has controls for automatic rotation, labels, and the reference grid. Keyboard editing shortcuts pause while typing or using a dialog. Atom dragging follows a plane facing the camera; orbit first to edit from another direction.

For keyboard editing, open **Your atoms** and choose an atom. Its X/Y/Z fields apply on Enter or when leaving the field. In Bond or Erase mode, the same atom-list buttons connect or remove atoms.

## The chemistry

The six presets use educational reference geometries derived from the **NIST Computational Chemistry Comparison and Benchmark Database (CCCBDB, SRD 101)**. Coordinates are translated or rotated for presentation without changing their relative distances. One model coordinate unit is **one ångström (Å)**.

| Molecule       | Formula | Reference geometry                                           | Source                                                           |
| -------------- | ------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Benzene        | C₆H₆    | Planar ring; 120°; equal 1.397 Å C–C edges                   | [NIST](https://cccbdb.nist.gov/exp2x.asp?casno=71432&charge=0)   |
| Water          | H₂O     | Bent; approximately 104.5°                                   | [NIST](https://cccbdb.nist.gov/exp2x.asp?casno=7732185&charge=0) |
| Methane        | CH₄     | Tetrahedral; approximately 109.5°                            | [NIST](https://cccbdb.nist.gov/exp2x.asp?casno=74828&charge=0)   |
| Ammonia        | NH₃     | Trigonal pyramidal; 106.67° in this reference                | [NIST](https://cccbdb.nist.gov/exp2x.asp?casno=7664417&charge=0) |
| Carbon dioxide | CO₂     | Linear; 180°                                                 | [NIST](https://cccbdb.nist.gov/exp2x.asp?casno=124389&charge=0)  |
| Ethanol        | C₂H₆O   | A reference conformer with approximately tetrahedral carbons | [NIST](https://cccbdb.nist.gov/exp2x.asp?casno=64175&charge=0)   |

Benzene's alternating bond sticks depict one Kekulé representation. Its π electrons are delocalized; the preset uses equal ring-edge lengths. See the [IUPAC definition of aromaticity](https://goldbook.iupac.org/terms/view/A00442).

### Model boundaries

This is an **educational molecular editor**. It does not perform energy minimization, molecular dynamics, reaction prediction, or quantum calculations. Moving atoms changes the drawing; it does not find an equilibrium geometry.

Atom radii, bond thicknesses, and the space-fill display are visual conventions. Electron-shell and lattice views are schematic. Bond distances measure the current coordinates. Common-valence notes are limited to selected neutral covalent atoms and do not determine chemical stability, formal charge, aromaticity, or metal coordination.

Element properties in [`src/data/elements.ts`](src/data/elements.ts) were inherited from the original project and have **not been independently verified**. Some properties are missing or predicted. Molar masses use that dataset. A future data audit should establish per-property provenance, units, and uncertainty before these values are used as reference measurements.

Custom formulas use Hill ordering and total the entire bench, including disconnected fragments. Reference cards retain familiar formulas such as NH₃; the same custom composition is H₃N in Hill order.

## Workspace files

**Export** creates a `.json` file that can be imported to continue later. Imports are validated before the current structure changes. The format uses `kind: "molecule-studio"`, `schemaVersion: 1`, and `units: "angstrom"`; it contains atoms, bonds, preset identity when applicable, and display preferences.

A workspace supports **128 atoms**, **384 bond records**, and coordinates within **±100 Å** on each axis. Import files are limited to **256 KB**. Local saving uses the browser's storage for the current site; clearing browser data removes that local copy. Export provides a copy you control. Structural history lasts for the current session; display preferences are saved independently.

## Inside the project

| Area                                                       | Responsibility                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`src/App.tsx`](src/App.tsx)                               | Studio layout, collection, inspector, commands, import/export UI                   |
| [`src/components/Bench3D.tsx`](src/components/Bench3D.tsx) | Three.js scene, camera, representations, pointer interaction, WebGL fallback       |
| [`src/state/store.ts`](src/state/store.ts)                 | Zustand state, history, validation, local persistence, formula and mass helpers    |
| [`src/data/molecules.ts`](src/data/molecules.ts)           | Reference molecules, lesson text, source links                                     |
| [`src/data/elements.ts`](src/data/elements.ts)             | Inherited periodic-table dataset                                                   |
| [`src/lib/chemistry.ts`](src/lib/chemistry.ts)             | Fragment analysis and advisory valence checks                                      |
| [`tests/chemistry.test.ts`](tests/chemistry.test.ts)       | Reference geometry, graph validation, history, and persistence regression coverage |

Built with React 19, TypeScript, Three.js, React Three Fiber, Drei, Zustand, Radix UI, and Vite. The production output is a static site.

## Contribute

Chemistry corrections, focused interaction improvements, and accessible learning tools are welcome. Start with [the contribution guide](CONTRIBUTING.md) and [the review and roadmap](docs/REVIEW.md). Please include an authoritative source when changing scientific data or claims.

Licensed under the [MIT License](LICENSE). © 2026 The Temple of Two.

The bundled Node.js runtime retains its own license and third-party notices. The [logo kit](docs/BRANDING.md) includes editable SVG artwork and PNG exports.
