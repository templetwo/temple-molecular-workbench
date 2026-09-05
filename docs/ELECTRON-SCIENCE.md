# Electron Lab: science and reproducibility

Electron Lab contains two separate lessons: analytic hydrogen atom orbitals and precomputed molecular hydrogen electron density. Neither lesson applies a calculated cloud to an arbitrary edited workbench structure.

## What the points mean

Points are independent samples of possible electron positions. An atomic cloud samples the normalized probability density |ψ|² of one electron. The H₂ cloud samples its spin-summed one-electron density divided by two; the physical density itself integrates to two electrons. Thousands of points therefore do not mean thousands of simultaneous electrons. These views show spatial distributions, not trajectories or time-resolved motion.

For a stationary state, the probability density is stationary. Camera rotation helps inspect its shape. If the two signs of a real orbital amplitude receive different colors, they denote wavefunction phase, not positive and negative electric charge.

## Analytic hydrogen atom

The atomic lesson uses the nonrelativistic hydrogen solutions with a fixed, infinitely massive nucleus. With `a = a₀`, `q = r/a`, and coordinates in ångströms:

```text
ψ(1s)   = exp(-q) / sqrt(π a³)
ψ(2s)   = (2-q) exp(-q/2) / sqrt(32π a³)
ψ(2p_z) = (z/a) exp(-q/2) / sqrt(32π a³)
```

The 2s radial node is at `r = 2a₀`, about 1.05835 Å. The displayed 2p is the real `2p_z` orbital, with a nodal plane at `z = 0`. Hydrogen 1s has no radial or angular node. These equations and their normalization follow [MIT 5.61, lectures 21–22, page 4](https://ocw.mit.edu/courses/5-61-physical-chemistry-fall-2007/c2078ff25c61c136e67ceb6fd8eb9b34_lecture21to22.pdf). Finite nuclear mass, fine structure, relativistic effects, and radiative corrections are outside this lesson.

The sampler draws exact radial/angular distributions: gamma radial distributions for 1s and 2p, and a gamma-mixture rejection envelope for 2s. The p angular distribution is proportional to cos²θ. No finite box or artificial outer edge truncates the cloud. Seeded pseudorandom sampling makes a given view reproducible; point count and sampling attempts are bounded.

## Calculated H₂ bond lesson

[`scripts/generate-hydrogen.py`](../scripts/generate-hydrogen.py) computes 25 discrete separations from 0.30 to 6.00 Å using **PySCF 2.14.0, singlet full configuration interaction (FCI), and the STO-3G basis**. RHF supplies an orbital basis for the FCI calculation; the displayed density and energy are the resulting FCI quantities. FCI diagonalizes the many-electron Hamiltonian within the chosen finite basis. See [PySCF's CI documentation](https://pyscf.org/user/ci.html) and [basis/geometry documentation](https://pyscf.org/user/gto.html).

The exported total energy includes electron kinetic energy, electron–nuclear attraction, electron–electron interaction, and nuclear repulsion. The zero of the relative-energy curve is **two separately calculated neutral hydrogen atoms in the same STO-3G basis**:

```text
relativeEnergyEv = [E(H₂, R) - 2 E(H, STO-3G)] × hartreeEv
```

The lowest sampled energy occurs at 0.74 Å: approximately −1.137283834484 hartree, or −5.554392 eV relative to that atomic reference. This is the minimum among the sampled points, not a geometry optimization or an experimental dissociation energy. No zero-point vibrational energy is included.

FCI treats the electronic correlation available in this two-orbital basis and approaches two neutral H atoms at large separation. **STO-3G is still a severe minimal-basis approximation.** It lacks basis flexibility and accurate long-range behavior; its isolated-atom energy is not the exact −0.5-hartree hydrogen value. Basis errors and basis-set superposition affect the calculated binding curve. The analytic atomic lesson and minimal-basis molecular lesson intentionally use different levels of approximation.

## Density representation and validation

The JSON stores each geometry's spin-summed AO density matrix `P`, overlap matrix `S`, natural occupations, energy components, and validation results. Its normalized contracted Gaussian functions are exported explicitly:

```text
χ_A(r) = Σ_p c_p exp[-α_p |r_bohr - A_bohr|²]
ρ(r)   = Σ_AB P_AB χ_A(r) χ_B(r)
```

The runtime converts the resulting density from electrons/bohr³ to electrons/Å³. Nuclear positions are `x = ±R/2`. A Gaussian-product mixture samples `ρ/2` directly, with an absolute-mixture rejection envelope if a product weight is negative. This uses the calculated density at the selected step, with no interpolation or browser-side quantum solver.

Generation checks `Tr(P S) = 2`, singlet spin, independent PySCF level-5 grid integration, and agreement of the exported Gaussian functions with PySCF's AO evaluator. Five independent density probes at every separation let JavaScript tests verify unit conversion and reconstruction. Regression tests also check nodes, normalization, cloud moments, symmetry, bounded deterministic sampling, energy components, and the separated-atom limit. The FCI one-particle density-matrix API is documented in [PySCF's implementation reference](https://pyscf.org/_modules/pyscf/fci/direct_spin1.html).

## Reproduce the data

Use an isolated Python environment. The recorded generation used Python 3.14.6, PySCF 2.14.0, and NumPy 2.5.2; exact versions, generation time, and a generator SHA-256 hash are included in [`hydrogen-bond.json`](../src/data/hydrogen-bond.json).

```sh
python3 -m venv .venv-electrons
.venv-electrons/bin/python -m pip install pyscf==2.14.0 numpy==2.5.2
.venv-electrons/bin/python scripts/generate-hydrogen.py
```

Python and PySCF are only needed to regenerate the small data file; the browser and packaged app use its JSON and dependency-free TypeScript sampling code. Generation fails if its scientific validation checks fail.

Unit constants come from [NIST CODATA 2022](https://physics.nist.gov/cuu/Constants/Table/allascii.txt): `a₀ = 0.529177210544 Å` and `1 hartree = 27.211386245981 eV`. Input geometries are explicitly passed to PySCF in bohr using that same conversion.

Water polarity, hydrogen bonding, benzene π-density, and arbitrary-molecule calculations remain possible future lessons. They are not calculated by this release.
