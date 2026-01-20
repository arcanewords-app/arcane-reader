/**
 * Projects store using @preact/signals
 * Global state management for projects cache
 */

import { signal, computed } from '@preact/signals';
import type { ProjectListItem, Project } from '../types';
import { api } from '../api/client';

// Projects cache
export const projectsCache = signal<ProjectListItem[]>([]);
export const projectsLoading = signal(false);
export const projectsError = signal<string | null>(null);

// Individual project cache (full project data)
const projectCache = new Map<string, { project: Project; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Computed: projects with metadata
export const projectsWithMetadata = computed(() => {
  return projectsCache.value.filter(p => p.metadata);
});

// Computed: projects by type
export const projectsByType = computed(() => {
  const books = projectsCache.value.filter(p => p.type === 'book');
  const texts = projectsCache.value.filter(p => p.type === 'text' || !p.type);
  return { books, texts };
});

// Load projects list
export async function loadProjects(): Promise<void> {
  projectsLoading.value = true;
  projectsError.value = null;
  
  try {
    const projects = await api.getProjects();
    projectsCache.value = projects;
  } catch (error: any) {
    projectsError.value = error.message || 'Ошибка загрузки проектов';
    console.error('Failed to load projects:', error);
  } finally {
    projectsLoading.value = false;
  }
}

// Get project from cache or API
export async function getProject(id: string, forceRefresh = false): Promise<Project | null> {
  const cached = projectCache.get(id);
  
  // Return cached if valid and not forced refresh
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.project;
  }
  
  try {
    const project = await api.getProject(id);
    projectCache.set(id, { project, timestamp: Date.now() });
    
    // Update project in list cache
    const index = projectsCache.value.findIndex(p => p.id === id);
    if (index !== -1) {
      projectsCache.value = [
        ...projectsCache.value.slice(0, index),
        {
          ...projectsCache.value[index],
          name: project.name,
          type: project.type,
          chapterCount: project.chapters.length,
          translatedCount: project.chapters.filter(c => c.status === 'completed').length,
          glossaryCount: project.glossary.length,
          originalReadingMode: project.settings?.originalReadingMode ?? false,
          updatedAt: project.updatedAt,
          // Update metadata if project has it
          metadata: project.metadata || projectsCache.value[index].metadata,
        },
        ...projectsCache.value.slice(index + 1),
      ];
    }
    
    return project;
  } catch (error) {
    console.error('Failed to load project:', error);
    return null;
  }
}

// Invalidate project cache
export function invalidateProject(id: string): void {
  projectCache.delete(id);
  const index = projectsCache.value.findIndex(p => p.id === id);
  if (index !== -1) {
    // Trigger update by creating new array
    projectsCache.value = [...projectsCache.value];
  }
}

// Clear all caches
export function clearCache(): void {
  projectsCache.value = [];
  projectCache.clear();
}
