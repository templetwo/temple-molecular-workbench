# Reaction lab: bookkeeping, not prediction

Reaction lab lets you declare reactants and products from the species library. The app checks atom conservation, finds a small-integer balance, computes limiting reagent / theoretical moles / atom economy from amounts you type (atom economy is the first listed product's mass over the mass of all reactants in the balanced equation, so list the product you care about first), and sums cited formation enthalpies and entropies at 298.15 K and 1 bar.

It does **not** predict products, rates, conversion, or equilibrium at process conditions.

## Failures

- **Declaration not conserved** — an element is on only one side.
- **No small-integer balance** — the declaration is conserved but no coefficients within the search bound exist.
- **Bound exceeded** — the integer search hit its time or coefficient cap.
- **Unavailable thermo** — any participating species lacks a cited ΔfH° or S°. Missing formation data is never treated as zero.

## Water

Water (gas) and water (liquid) are different species. Methane combustion to steam and to liquid water are different standard-state totals.

## Methods

Coefficients are positive integers ≤ 16. ΔrG° = ΔrH° − TΔrS° at 298.15 K. K = exp(−ΔrG°/RT) with the CODATA 2018 gas constant.
