import type { AnalysisOutput } from '../api/client.js';

interface Props {
  analysis: AnalysisOutput;
}

export function AnalysisResultView({ analysis }: Props) {
  return (
    <div class="pl-entity-grid">
      <section>
        <h3 class="pl-pane-title">Summary</h3>
        <p>{analysis.chapterSummary || '—'}</p>
        {analysis.mood ? <p class="pl-muted">Mood: {analysis.mood}</p> : null}
        {analysis.styleNotes ? <p class="pl-muted">Style: {analysis.styleNotes}</p> : null}
        {analysis.keyEvents?.length ? (
          <ul>
            {analysis.keyEvents.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <EntitySection
        title="Characters"
        items={analysis.foundCharacters.map((c) => ({
          key: c.name ?? '',
          title: c.name ?? '',
          isNew: c.isNew,
          translation: c.suggestedTranslation,
          extra: c.context,
        }))}
      />
      <EntitySection
        title="Locations"
        items={analysis.foundLocations.map((c) => ({
          key: c.name ?? '',
          title: c.name ?? '',
          isNew: c.isNew,
          translation: c.suggestedTranslation,
        }))}
      />
      <EntitySection
        title="Terms"
        items={analysis.foundTerms.map((c) => ({
          key: c.term ?? '',
          title: c.term ?? '',
          isNew: c.isNew,
          translation: c.suggestedTranslation,
          extra: c.category,
        }))}
      />
    </div>
  );
}

function EntitySection({
  title,
  items,
}: {
  title: string;
  items: Array<{
    key: string;
    title: string;
    isNew: boolean;
    translation?: string;
    extra?: string;
  }>;
}) {
  if (!items.length) {
    return (
      <section>
        <h3 class="pl-pane-title">{title}</h3>
        <p class="pl-muted">None found</p>
      </section>
    );
  }
  return (
    <section>
      <h3 class="pl-pane-title">
        {title} ({items.length})
      </h3>
      <div class="pl-entity-grid">
        {items.map((item) => (
          <div class="pl-entity-card" key={item.key}>
            <h4>
              {item.title}
              {item.isNew ? <span class="pl-badge new">new</span> : null}
            </h4>
            {item.translation ? <div class="meta">→ {item.translation}</div> : null}
            {item.extra ? <div class="meta">{item.extra}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
