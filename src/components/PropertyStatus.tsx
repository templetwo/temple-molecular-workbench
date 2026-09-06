import { safeSourceUrl, type Presentation } from '@/data/element-properties';

function sourceLabel(source: string): string {
  try {
    return new URL(source).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

export default function PropertyStatus({
  presentation,
  compact = false,
}: {
  presentation: Presentation;
  /** Badge only: safe inside another control or an accessibility-hidden preview. */
  compact?: boolean;
}) {
  const sources = [...new Set(presentation.sources)].filter(safeSourceUrl);
  return (
    <span className="property-meta">
      <span className="property-status" data-appearance={presentation.appearance}>
        {presentation.badge}
      </span>
      {!compact &&
        sources.map((source) => (
          <a
            key={source}
            className="property-source"
            href={source}
            target="_blank"
            rel="noreferrer"
            aria-label={`Source: ${source}`}
          >
            {sourceLabel(source)}
          </a>
        ))}
      {!compact && presentation.detail ? (
        <span className="property-detail">{presentation.detail}</span>
      ) : null}
    </span>
  );
}
