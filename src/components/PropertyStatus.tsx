import type { Presentation } from '@/data/element-properties';

function sourceLabel(source: string): string {
  try {
    return new URL(source).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

export default function PropertyStatus({ presentation }: { presentation: Presentation }) {
  return (
    <span className="property-meta">
      <span className="property-status" data-appearance={presentation.appearance}>
        {presentation.badge}
      </span>
      {presentation.source ? (
        <a
          className="property-source"
          href={presentation.source}
          target="_blank"
          rel="noreferrer"
          aria-label={`Source: ${presentation.source}`}
        >
          {sourceLabel(presentation.source)}
        </a>
      ) : null}
      {presentation.detail ? <span className="property-detail">{presentation.detail}</span> : null}
    </span>
  );
}
