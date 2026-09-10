# Molecule and species data

Status is not provenance. The same four scientific statuses and three provenance kinds used for elements apply to molecule-level quantities. See [element data notes](ELEMENT-DATA.md).

## Teaching presets vs species

A **preset** is a 3D drawing in the collection and bonding coach. A **species** is a named chemical identity for bookkeeping: formula, phase, CAS, and cited thermochemistry.

Liquid water is a species without a preset. The water drawing is the CCCBDB gas-phase geometry.

Preset ids, once shipped, are permanent.

## Evaluation family

Reaction totals that need ΔfH° and S° quote **Chase, M.W., Jr., NIST-JANAF Thermochemical Tables, 4th ed., J. Phys. Chem. Ref. Data, Monograph 9, 1998**, as listed on NIST Chemistry WebBook SRD 69 pages retrieved 2026-09-06.

Ethanol gas ΔfH° is the WebBook average of nine values, not Chase. Mixing it with Chase species is labeled as mixed-evaluation arithmetic.

Benzene has identity and geometry in this cut; its ΔfH° is unavailable until a named evaluation is quoted. Unavailable is never treated as zero.

## Library count

`tests/chemistry.test.ts` asserts `MOLECULE_PRESETS.length === 10`. That is a named exception from the 1.2.0 value of 6, for the added H₂, N₂, O₂, and CO drawings.
