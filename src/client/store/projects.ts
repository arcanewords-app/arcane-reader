/**
 * Projects store using @preact/signals
 * In-memory state for projects (no TTL — always fetch fresh from API on load)
 */

import { signal, computed } from '@preact/signals';
import type { ProjectListItem, Project, ProjectWithChapterList } from '../types';
import { api } from '../api/client';

export const projectsCache = signal<ProjectListItem[]>([]);
export const projectsLoading = signal(false);
export const projectsError = signal<string | null>(null);

/** Last fetched project snapshot — updated after API load or mutation, not used to skip fetches */
const projectCache = new Map<string, ProjectWithChapterList>();

export const projectsWithMetadata = computed(() => {
  return projectsCache.value.filter((p) => p.metadata);
});

export const projectsByType = computed(() => {
  const books = projectsCache.value.filter((p) => p.type === 'book');
  const texts = projectsCache.value.filter((p) => p.type === 'text' || !p.type);
  return { books, texts };
});

function syncProjectListItem(project: ProjectWithChapterList | Project): void {
  const index = projectsCache.value.findIndex((p) => p.id === project.id);
  if (index === -1) return;

  projectsCache.value = [
    ...projectsCache.value.slice(0, index),
    {
      ...projectsCache.value[index],
      name: project.name,
      type: project.type,
      chapterCount: project.chapters.length,
      translatedCount: project.chapters.filter((c) => c.status === 'completed').length,
      glossaryCount: project.glossary.length,
      originalReadingMode: project.settings?.originalReadingMode ?? false,
      updatedAt: project.updatedAt,
      metadata: project.metadata || projectsCache.value[index].metadata,
    },
    ...projectsCache.value.slice(index + 1),
  ];
}

export async function loadProjects(): Promise<void> {
  projectsLoading.value = true;
  projectsError.value = null;

  try {
    const projects = await api.getProjects();
    projectsCache.value = projects;
  } catch (error: unknown) {
    projectsError.value = error instanceof Error ? error.message : 'Ошибка загрузки проектов';
    console.error('Failed to load projects:', error);
  } finally {
    projectsLoading.value = false;
  }
}

export async function getProject(id: string): Promise<ProjectWithChapterList | null> {
  try {
    const project = await api.getProject(id);
    projectCache.set(id, project);
    syncProjectListItem(project);
    return project;
  } catch (error) {
    console.error('Failed to load project:', error);
    return null;
  }
}

/** Update in-memory project snapshot after a mutation (does not skip future API fetches). */
export function updateProjectCache(project: ProjectWithChapterList | Project): void {
  projectCache.set(project.id, project as ProjectWithChapterList);
  syncProjectListItem(project);
}

/** Drop local project snapshot so the next load refetches from API. */
export function invalidateProject(id: string): void {
  projectCache.delete(id);
}

export function clearCache(): void {
  projectsCache.value = [];
  projectCache.clear();
}
