# Contributing to Temple Molecular Workbench

Help make chemistry easier to explore and the underlying model easier to trust. Useful contributions include reproducible bug reports, sourced data corrections, focused teaching tools, and improvements to interaction and accessibility.

## Set up

Use Node.js 22 and npm. Fork or clone the repository, create a branch for your change, then run:

```sh
npm ci
npm run dev
```

Before submitting a pull request, run the checks relevant to the change:

```sh
npm test
npm run lint
npm run build
```

The regression suite checks molecular geometry, graph validation, history, and persistence. Passing it does not verify the 3D interface. For interaction changes, also exercise the affected behavior in a browser and include the browser, viewport size, and results in the pull request.

## Make a focused change

Explain the user problem and resulting behavior. Keep unrelated formatting and dependency changes out of the same patch. Add a regression test when it protects a meaningful behavior, especially input validation, graph invariants, or history. UI changes benefit from before-and-after screenshots and a narrow-viewport check.

For editor changes, check that a drag creates one undo step, camera controls recover after pointer cancellation, invalid imports leave the scene intact, and deleting an atom removes its connected bonds. For dialogs and controls, check visible keyboard focus, labels, and Escape behavior.

## Scientific changes need sources

Keep one model coordinate unit equal to one ångström. Record authoritative sources beside new preset data, including which geometry or conformer is represented. Check composition, connectivity, distances, and angles with a test when adding a reference molecule. Describe approximations in the lesson or model notes.

Use NIST data, IUPAC terminology, primary literature, or another clearly identified authoritative source. Do not infer that a graph is stable because it passes the common-valence checks. Charges, radicals, resonance, coordination chemistry, and calculated energetics need an explicit model before they can be claimed as supported.

Element fields have an explicit scientific status and a separate provenance. A correction should identify the original field, replacement value, units, reference, and status (`measured_evaluated`, `calculated_predicted`, `unverified`, or `unavailable`). Do not relabel an unsupported inherited number as predicted. Do not infer predicted or calculated status from a minus sign. Add a regression test when changing status rules or overlays. See [element data notes](docs/ELEMENT-DATA.md).

## Reports and pull requests

Use the repository's bug or feature form. A useful bug report includes a short reproduction, expected and actual behavior, browser/OS details, and a small exported workspace when relevant. An exported scene may reveal what you are working on; share only material you intend to include in the report.

For a substantial feature, describe the learning task and proposed interaction in an issue before investing in a large implementation. The [review and roadmap](docs/REVIEW.md) lists current gaps and possible directions. Be considerate in reviews and make disagreements about the code or scientific evidence concrete.

Contributions are made under the repository's [MIT License](LICENSE).
