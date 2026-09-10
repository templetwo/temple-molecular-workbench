import PropertyStatus from '@/components/PropertyStatus';
import { presentQuantity } from '@/data/element-properties';
import type { Species } from '@/data/molecule-properties';
import { pubchemUrl } from '@/data/species';
import { fromKjPerMol, type UnitSystem } from '@/lib/units';

function Row({
  label,
  presentation,
}: {
  label: string;
  presentation: ReturnType<typeof presentQuantity>;
}) {
  return (
    <div className="species-row">
      <span>{label}</span>
      <strong>
        {presentation.text}
        <PropertyStatus presentation={presentation} />
      </strong>
    </div>
  );
}

export default function SpeciesCard({ species, units }: { species: Species; units: UnitSystem }) {
  const hf = presentQuantity(species.hf);
  const entropy = presentQuantity(species.entropy);
  const cp = presentQuantity(species.cp);
  const hfText =
    species.hf.value !== null && species.hf.status !== 'unavailable'
      ? `${fromKjPerMol(species.hf.value, units.energy).toFixed(species.hf.context?.displayDecimals ?? 2)} ${units.energy}`
      : hf.text;
  return (
    <section className="species-card" aria-label={`${species.name} identity and thermochemistry`}>
      <div className="section-title">
        SPECIES CARD
        <span>{species.phase === 'l' ? 'liquid' : 'gas'} · 298.15 K · 1 bar</span>
      </div>
      <div className="species-identity">
        <div>
          <span>CAS</span>
          <strong>{species.identity.cas}</strong>
        </div>
        <div>
          <span>InChIKey</span>
          <strong className="species-inchi">{species.identity.inchiKey}</strong>
        </div>
      </div>
      <p className="species-links">
        <a href={species.identity.webbookUrl} target="_blank" rel="noreferrer">
          NIST WebBook
        </a>
        {species.identity.cccbdbUrl ? (
          <a href={species.identity.cccbdbUrl} target="_blank" rel="noreferrer">
            CCCBDB
          </a>
        ) : null}
        <a href={pubchemUrl(species.identity.pubchemCid)} target="_blank" rel="noreferrer">
          PubChem
        </a>
      </p>
      <Row label={`ΔfH° (${units.energy})`} presentation={{ ...hf, text: hfText }} />
      <Row label="S°" presentation={entropy} />
      <Row label="Cp°" presentation={cp} />
      <p className="measurement-note">
        Quoted from the named evaluation on each field. A missing number stays unavailable; it is
        never treated as zero.
      </p>
    </section>
  );
}
