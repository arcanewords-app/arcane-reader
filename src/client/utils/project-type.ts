/**
 * Client-side utilities for project types
 */

import type { ProjectType } from '../types';

/**
 * Get display name for project type
 */
export function getProjectTypeDisplayName(type: ProjectType): string {
  switch (type) {
    case 'book':
      return 'Книга';
    case 'text':
      return 'Текст';
    default:
      return type; // For future types, return as-is
  }
}

/**
 * Get Material Symbol icon name for project type
 */
export function getProjectTypeIcon(type: ProjectType): string {
  switch (type) {
    case 'book':
      return 'menu_book';
    case 'text':
      return 'description';
    default:
      return 'folder'; // Default icon
  }
}

/**
 * Get color/accent for project type (CSS variable or color)
 */
export function getProjectTypeColor(type: ProjectType): string {
  switch (type) {
    case 'book':
      return 'var(--accent)'; // Purple accent
    case 'text':
      return 'var(--text-secondary)'; // Gray
    default:
      return 'var(--accent-dim)'; // Dim accent
  }
}
