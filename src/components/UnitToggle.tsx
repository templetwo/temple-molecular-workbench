import { saveUnits, type UnitSystem } from '@/lib/units';

export default function UnitToggle({
  units,
  onChange,
}: {
  units: UnitSystem;
  onChange: (units: UnitSystem) => void;
}) {
  const set = <K extends keyof UnitSystem>(key: K, value: UnitSystem[K]) => {
    const next = { ...units, [key]: value };
    saveUnits(next);
    onChange(next);
  };
  return (
    <fieldset className="unit-toggle" aria-label="Unit system">
      <legend>Units</legend>
      <label>
        T
        <select
          value={units.temperature}
          onChange={(event) => set('temperature', event.target.value as UnitSystem['temperature'])}
        >
          <option value="K">K</option>
          <option value="C">°C</option>
          <option value="F">°F</option>
        </select>
      </label>
      <label>
        E
        <select
          value={units.energy}
          onChange={(event) => set('energy', event.target.value as UnitSystem['energy'])}
        >
          <option value="kJ/mol">kJ/mol</option>
          <option value="kcal/mol">kcal/mol</option>
          <option value="Btu/lbmol">Btu/lbmol</option>
        </select>
      </label>
      <label>
        P
        <select
          value={units.pressure}
          onChange={(event) => set('pressure', event.target.value as UnitSystem['pressure'])}
        >
          <option value="Pa">Pa</option>
          <option value="kPa">kPa</option>
          <option value="bar">bar</option>
          <option value="atm">atm</option>
          <option value="psi">psi</option>
        </select>
      </label>
    </fieldset>
  );
}
