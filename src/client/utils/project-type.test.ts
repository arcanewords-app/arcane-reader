import { describe, expect, it } from 'vitest';
import type { ProjectType } from '../types';
import {
  getProjectTypeColor,
  getProjectTypeDisplayName,
  getProjectTypeIcon,
} from './project-type.js';

describe('project type display', () => {
  it('names, icons, and colors the known types', () => {
    expect(getProjectTypeDisplayName('book')).toBe('Книга');
    expect(getProjectTypeDisplayName('text')).toBe('Текст');
    expect(getProjectTypeIcon('book')).toBe('menu_book');
    expect(getProjectTypeIcon('text')).toBe('description');
    expect(getProjectTypeColor('book')).toBe('var(--accent)');
    expect(getProjectTypeColor('text')).toBe('var(--text-secondary)');
  });

  it('falls back for a type the UI does not know yet', () => {
    const future = 'comic' as ProjectType;
    expect(getProjectTypeDisplayName(future)).toBe('comic');
    expect(getProjectTypeIcon(future)).toBe('folder');
    expect(getProjectTypeColor(future)).toBe('var(--accent-dim)');
  });
});
