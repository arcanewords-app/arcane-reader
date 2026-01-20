/**
 * Project type detection and utilities
 * Determines project type based on file format
 */

import type { ImportFormat } from './types.js';
import type { ProjectType } from '../../storage/database.js';

/**
 * Map file format to project type
 */
export function getProjectTypeFromFormat(format: ImportFormat): ProjectType {
  switch (format) {
    case 'epub':
    case 'fb2':
      return 'book';
    case 'txt':
      return 'text';
    default:
      // Future: add more formats here
      return 'text'; // Default fallback
  }
}

/**
 * Determine if project type supports metadata extraction
 */
export function supportsMetadata(type: ProjectType): boolean {
  return type === 'book';
}

/**
 * Determine if project type supports cover images
 */
export function supportsCoverImage(type: ProjectType): boolean {
  return type === 'book';
}

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
 * Get icon for project type
 */
export function getProjectTypeIcon(type: ProjectType): string {
  switch (type) {
    case 'book':
      return '📚';
    case 'text':
      return '📄';
    default:
      return '📁'; // Default icon
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
