import { useMemo, useState } from 'react';
import PropertyStatus from '@/components/PropertyStatus';
import { presentQuantity } from '@/data/element-properties';
import { SPECIES } from '@/data/species';
import type { Species } from '@/data/molecule-properties';
import {
  balanceReaction,
  reactionThermo,
  stoichFromMoles,
} from '@/lib/reactions';
import { fromKjPerMol, type UnitSystem } from '@/lib/units';

function pickLabel(species: Species) {
  return `${species.name} (${species.phase})`;
}

export default function ReactionLab({ units }: { units: UnitSystem }) {
  const [reactantIds, setReactantIds] = useState<string[]>(['methane-g', 'oxygen-g']);
  const [productIds, setProductIds] = useState<string[]>(['carbon-dioxide-g', 'water-l']);
  const [moles, setMoles] = useState<number[]>([1, 2]);

  const reactants = useMemo(
    () =>
      reactantIds
        .map((id) => SPECIES.find((species) => species.id === id))
        .filter((species): species is Species => Boolean(species)),
    [reactantIds],
  );
  const products = useMemo(
    () =>
      productIds
        .map((id) => SPECIES.find((species) => species.id === id))
        .filter((species): species is Species => Boolean(species)),
    [productIds],
  );

  // Balancing and thermo are keyed on the reactant/product identities only, so typing
  // an amount (which only changes `moles`) never re-runs the coefficient search.
  const balance = useMemo(() => balanceReaction(reactants, products), [reactants, products]);
  const thermo = useMemo(
    () => (balance.kind === 'ok' ? reactionThermo(reactants, products, balance.coefficients) : null),
    [balance, reactants, products],
  );
  const stoich = useMemo(
    () =>
      balance.kind === 'ok'
        ? stoichFromMoles([...reactants, ...products], balance.coefficients, reactants.length, moles)
        : null,
    [balance, reactants, products, moles],
  );

  const setSide = (side: 'reactants' | 'products', index: number, id: string) => {
    const ids = side === 'reactants' ? [...reactantIds] : [...productIds];
    ids[index] = id;
    if (side === 'reactants') setReactantIds(ids);
    else setProductIds(ids);
  };

  const addSide = (side: 'reactants' | 'products') => {
    const fallback = SPECIES[0].id;
    if (side === 'reactants') {
      setReactantIds([...reactantIds, fallback]);
      setMoles([...moles, 1]);
    } else setProductIds([...productIds, fallback]);
  };

  const equation =
    balance.kind === 'ok'
      ? [...reactants.map((species, i) => `${balance.coefficients[i]} ${species.formula}(${species.phase})`),
        ]
          .join(' + ')
          .concat(' → ')
          .concat(
            products
              .map(
                (species, i) =>
                  `${balance.coefficients[reactants.length + i]} ${species.formula}(${species.phase})`,
              )
              .join(' + '),
          )
      : null;

  return (
    <div className="reaction-lab">
      <p className="reaction-lab-rule">
        You declare the reaction. The app checks conservation and totals cited formation data. It
        does not predict products, rates, or plant conditions.
      </p>
      <div className="reaction-columns">
        <section>
          <h3>Reactants</h3>
          {reactantIds.map((id, index) => (
            <div className="reaction-pick" key={`r-${index}`}>
              <select
                aria-label={`Reactant ${index + 1}`}
                value={id}
                onChange={(event) => setSide('reactants', index, event.target.value)}
              >
                {SPECIES.map((species) => (
                  <option key={species.id} value={species.id}>
                    {pickLabel(species)}
                  </option>
                ))}
              </select>
              <label>
                mol
                <input
                  type="number"
                  aria-label={`Moles of reactant ${index + 1}`}
                  min={0}
                  step={0.1}
                  value={moles[index] ?? 1}
                  onChange={(event) => {
                    const next = [...moles];
                    next[index] = event.currentTarget.valueAsNumber;
                    setMoles(next);
                  }}
                />
              </label>
            </div>
          ))}
          <button type="button" className="text-link" onClick={() => addSide('reactants')}>
            Add reactant
          </button>
        </section>
        <section>
          <h3>Products</h3>
          {productIds.map((id, index) => (
            <div className="reaction-pick" key={`p-${index}`}>
              <select
                aria-label={`Product ${index + 1}`}
                value={id}
                onChange={(event) => setSide('products', index, event.target.value)}
              >
                {SPECIES.map((species) => (
                  <option key={species.id} value={species.id}>
                    {pickLabel(species)}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button type="button" className="text-link" onClick={() => addSide('products')}>
            Add product
          </button>
        </section>
      </div>
      {equation ? <p className="reaction-equation">{equation}</p> : null}
      {balance.kind !== 'ok' ? (
        <p className="reaction-failure" data-kind={balance.kind}>
          {balance.detail}
        </p>
      ) : null}
      {stoich && stoich.kind === 'no-amounts' ? (
        <p className="reaction-lab-rule">{stoich.detail}</p>
      ) : null}
      {stoich && stoich.kind === 'ok' ? (
        <dl className="reaction-stoich">
          <div>
            <dt>Limiting reagent</dt>
            <dd>{reactants[stoich.limitingIndex]?.name}</dd>
          </div>
          <div>
            <dt>Theoretical product moles</dt>
            <dd>
              {products
                .map(
                  (species, index) =>
                    `${stoich.theoreticalMoles[reactants.length + index]?.toFixed(3)} ${species.formula}(${species.phase})`,
                )
                .join(', ')}
            </dd>
          </div>
          <div>
            <dt>Atom economy (first product)</dt>
            <dd>{(stoich.atomEconomy * 100).toFixed(1)}%</dd>
          </div>
        </dl>
      ) : null}
      {thermo ? (
        <div className="reaction-thermo">
          <h3>298.15 K standard-state totals</h3>
          <p>
            ΔrH°{' '}
            {thermo.dh.value === null
              ? 'Not available'
              : `${fromKjPerMol(thermo.dh.value, units.energy).toFixed(2)} ${units.energy}`}
            <PropertyStatus presentation={presentQuantity(thermo.dh)} />
          </p>
          <p>
            ΔrG°{' '}
            {thermo.dg.value === null
              ? 'Not available'
              : `${fromKjPerMol(thermo.dg.value, units.energy).toFixed(2)} ${units.energy}`}
            <PropertyStatus presentation={presentQuantity(thermo.dg)} />
          </p>
          <p>
            K {thermo.k.value === null ? 'Not available' : thermo.k.value.toExponential(3)}
            <PropertyStatus presentation={presentQuantity(thermo.k)} />
          </p>
          {thermo.mixedEvaluations ? (
            <p className="measurement-note">
              These totals mix more than one thermochemical evaluation. They are arithmetic over the
              cited numbers, not a single-table recommendation.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
