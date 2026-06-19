import type { GlossarySnapshotEntry, LabRun } from '../api/client';

export type GlossaryRunStatus = 'none' | 'empty' | 'off' | 'on';
export type GlossaryRunFilter = '' | GlossaryRunStatus;

export function glossarySnapshotCount(run: LabRun): number {
  return run.inputSnapshot.glossarySnapshot?.length ?? 0;
}

export function glossaryRunStatus(run: LabRun): GlossaryRunStatus {
  const count = glossarySnapshotCount(run);
  if (count === 0) {
    return run.params.includeGlossary === false ? 'none' : 'empty';
  }
  if (run.params.includeGlossary === false) return 'off';
  return 'on';
}

export function glossaryRunLabel(status: GlossaryRunStatus, count: number): string {
  switch (status) {
    case 'on':
      return `glossary ${count}`;
    case 'off':
      return `glossary off (${count})`;
    case 'empty':
      return 'glossary on (0)';
    case 'none':
      return 'no glossary';
  }
}

export function glossaryRunTitle(status: GlossaryRunStatus): string {
  switch (status) {
    case 'on':
      return 'Glossary entries were included in the prompt';
    case 'off':
      return 'Glossary snapshot was saved but not included in the prompt';
    case 'empty':
      return 'Include glossary was on but no entries were imported';
    case 'none':
      return 'No glossary snapshot on this run';
  }
}

export function glossaryEntries(run: LabRun): GlossarySnapshotEntry[] {
  return run.inputSnapshot.glossarySnapshot ?? [];
}
