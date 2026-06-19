import type { GlossarySnapshotEntry } from '../api/client';

const PREVIEW_LIMIT = 20;

interface Props {
  entries: GlossarySnapshotEntry[];
  includeGlossary: boolean;
}

export function RunGlossarySection({ entries, includeGlossary }: Props) {
  const count = entries.length;
  const preview = entries.slice(0, PREVIEW_LIMIT);
  const remaining = count - preview.length;

  return (
    <div class="pl-glossary-section">
      <p class="pl-muted">
        {count === 0
          ? includeGlossary
            ? 'Include glossary was on, but no entries were saved.'
            : 'No glossary snapshot saved for this run.'
          : includeGlossary
            ? `${count} entries included in the prompt.`
            : `${count} entries in snapshot, but include glossary was off.`}
      </p>
      {count > 0 ? (
        <ul class="pl-glossary-list">
          {preview.map((entry, i) => (
            <li key={`${entry.original}-${i}`} class="pl-glossary-list__item">
              {entry.type ? <span class="pl-glossary-list__type">{entry.type}</span> : null}
              <span class="pl-glossary-list__original">{entry.original}</span>
              {entry.translated ? (
                <>
                  <span class="pl-glossary-list__arrow">→</span>
                  <span class="pl-glossary-list__translated">{entry.translated}</span>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {remaining > 0 ? <p class="pl-muted">+{remaining} more entries</p> : null}
    </div>
  );
}
