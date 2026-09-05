#!/usr/bin/env python3
"""Reproduce the discrete H2 FCI/STO-3G lesson; runtime needs only its JSON output.

Install PySCF in an isolated environment, then run this script from any directory.
Official APIs: https://pyscf.org/user/ci.html and https://pyscf.org/user/gto.html
"""
import argparse
import datetime
import hashlib
import json
import platform
from pathlib import Path

import numpy as np
import pyscf
from pyscf import dft, fci, gto, lib, scf

BOHR_ANGSTROM = 0.529177210544
HARTREE_EV = 27.211386245981
DISTANCES = [0.3, 0.4, 0.5, 0.6, 0.65, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 0.85, 0.9, 1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0]


def hydrogen_basis():
    shell = gto.basis.load('sto-3g', 'H')[0]
    assert shell[0] == 0
    exponents = np.array([primitive[0] for primitive in shell[1:]])
    contraction = np.array([primitive[1] for primitive in shell[1:]])
    coefficients = contraction * (2 * exponents / np.pi) ** 0.75
    overlap = (np.pi / (exponents[:, None] + exponents[None, :])) ** 1.5
    coefficients /= np.sqrt(coefficients @ overlap @ coefficients)
    return exponents, coefficients


def explicit_ao(coords, centers, exponents, coefficients):
    r2 = np.sum((coords[:, None, :] - centers[None, :, :]) ** 2, axis=2)
    return np.exp(-r2[:, :, None] * exponents[None, None, :]) @ coefficients


def calculate():
    lib.num_threads(1)
    atom = gto.M(atom='H 0 0 0', unit='Bohr', basis='sto-3g', spin=1, verbose=0)
    atom_hf = scf.UHF(atom).run(conv_tol=1e-13)
    assert atom_hf.converged, 'Isolated H UHF did not converge'
    atom_solver = fci.FCI(atom_hf)
    atom_energy, _ = atom_solver.kernel()
    assert atom_solver.converged, 'Isolated H FCI did not converge'
    reference = 2 * float(atom_energy)
    exponents, coefficients = hydrogen_basis()
    steps = []
    probes = np.array([[0, 0, 0], [0.4, 0, 0], [0, 0.7, 0], [0.8, 0.5, 0.3], [2, 1, -1]])
    for distance in DISTANCES:
        centers = np.array([[-distance / (2 * BOHR_ANGSTROM), 0, 0], [distance / (2 * BOHR_ANGSTROM), 0, 0]])
        mol = gto.M(atom=[('H', centers[0]), ('H', centers[1])], unit='Bohr', basis='sto-3g', spin=0, verbose=0)
        mean_field = scf.RHF(mol).run(conv_tol=1e-13)
        assert mean_field.converged, f'H2 RHF did not converge at {distance} Å'
        solver = fci.FCI(mean_field, singlet=True)
        solver.conv_tol = 1e-13
        energy, vector = solver.kernel()
        assert solver.converged, f'H2 FCI did not converge at {distance} Å'
        density_mo = solver.make_rdm1(vector, mol.nao_nr(), mol.nelec)
        density_ao = mean_field.mo_coeff @ density_mo @ mean_field.mo_coeff.T
        overlap = mol.intor('int1e_ovlp')
        electrons = np.einsum('ij,ji', density_ao, overlap)
        spin_squared = solver.spin_square(vector, mol.nao_nr(), mol.nelec)[0]
        assert abs(electrons - 2) < 1e-10
        assert abs(spin_squared) < 1e-9
        ao_reference = mol.eval_gto('GTOval_sph', probes / BOHR_ANGSTROM)
        ao_rebuilt = explicit_ao(probes / BOHR_ANGSTROM, centers, exponents, coefficients)
        ao_error = float(np.max(np.abs(ao_reference - ao_rebuilt)))
        assert ao_error < 1e-10, ao_error
        grid = dft.gen_grid.Grids(mol)
        grid.level = 5
        grid.build()
        ao_grid = mol.eval_gto('GTOval_sph', grid.coords)
        density_grid = np.einsum('pi,ij,pj->p', ao_grid, density_ao, ao_grid)
        integrated = float(density_grid @ grid.weights)
        assert abs(integrated - 2) < 1e-5, integrated
        density_probes = np.einsum('pi,ij,pj->p', ao_reference, density_ao, ao_reference) / BOHR_ANGSTROM ** 3
        nuclear_repulsion = float(mol.energy_nuc())
        steps.append({
            'distanceAngstrom': distance,
            'energyHartree': float(energy),
            'relativeEnergyEv': (float(energy) - reference) * HARTREE_EV,
            'electronicEnergyHartree': float(energy) - nuclear_repulsion,
            'nuclearRepulsionHartree': nuclear_repulsion,
            'densityMatrixAO': density_ao.tolist(),
            'overlapMatrixAO': overlap.tolist(),
            'naturalOccupations': np.linalg.eigvalsh(density_mo)[::-1].tolist(),
            'electronCount': float(electrons),
            'integratedElectronCount': integrated,
            'spinSquared': float(spin_squared),
            'aoReconstructionMaxError': ao_error,
            'densityProbesPerAngstrom3': density_probes.tolist(),
        })
        print(f'R={distance:.2f} Å  FCI={energy:.12f} Eh  ΔE={steps[-1]["relativeEnergyEv"]:.6f} eV  ∫ρ={integrated:.10f}')
    equilibrium = min(range(len(steps)), key=lambda index: steps[index]['energyHartree'])
    return {
        'schemaVersion': 1,
        'model': {
            'method': 'FCI (singlet)', 'basis': 'STO-3G', 'software': f'PySCF {pyscf.__version__}',
            'referenceDescription': '0 eV = two separated neutral H atoms calculated in the same STO-3G basis.',
            'atomicEnergyHartree': float(atom_energy), 'referenceEnergyHartree': reference,
            'nuclearRepulsionIncluded': True, 'electronCount': 2,
            'approximation': 'Nonrelativistic Born–Oppenheimer ground-state singlet; full configuration interaction within the minimal STO-3G basis. No nuclear motion, zero-point energy, relativistic correction, or complete-basis limit.',
            'sources': ['https://pyscf.org/user/ci.html', 'https://pyscf.org/user/gto.html', 'https://pyscf.org/_modules/pyscf/fci/direct_spin1.html', 'https://physics.nist.gov/cuu/Constants/Table/allascii.txt'],
        },
        'provenance': {
            'generatedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'generator': 'scripts/generate-hydrogen.py',
            'generatorSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'pythonVersion': platform.python_version(), 'pyscfVersion': pyscf.__version__, 'numpyVersion': np.__version__,
            'scfConvergenceHartree': 1e-13, 'fciConvergenceHartree': 1e-13,
            'densityValidation': 'Tr(P S)=2 and independent PySCF level-5 atom-centered grid integration; exported AO expansion checked against PySCF eval_gto at five probe points.',
        },
        'units': {'coordinates': 'angstrom', 'energy': 'hartree', 'relativeEnergy': 'eV', 'density': 'electrons/angstrom^3'},
        'constants': {'bohrAngstrom': BOHR_ANGSTROM, 'hartreeEv': HARTREE_EV, 'source': 'CODATA 2022, NIST'},
        'basis': {'exponentsBohr2': exponents.tolist(), 'coefficients': coefficients.tolist(), 'convention': 'chi_A(r) = sum_p coefficients[p] exp(-exponentsBohr2[p] |r_bohr-A_bohr|^2); all primitive and contraction normalizations included.'},
        'densityProbeCoordinatesAngstrom': probes.tolist(),
        'equilibriumStepIndex': equilibrium,
        'equilibriumDescription': 'Lowest energy among the sampled separations; not an optimized or experimental equilibrium distance.',
        'steps': steps,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'src/data/hydrogen-bond.json')
    args = parser.parse_args()
    data = calculate()
    args.output.write_text(json.dumps(data, indent=2, allow_nan=False) + '\n')
    print(f'Wrote {args.output}; minimum step={data["equilibriumStepIndex"]}')
