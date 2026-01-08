/**
 * Database layer using LowDB
 * 
 * LowDB - простая JSON база данных для Node.js
 * Данные сохраняются в файл и переживают перезапуск сервера
 */

import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';

// Types
export interface Project {
  id: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  chapters: Chapter[];
  glossary: GlossaryEntry[];
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  originalText: string;
  translatedText?: string;
  status: 'pending' | 'translating' | 'completed' | 'error';
  translationMeta?: {
    tokensUsed: number;
    duration: number;
    model: string;
    translatedAt: string;
  };
}

export interface GlossaryEntry {
  id: string;
  type: 'character' | 'location' | 'term';
  original: string;
  translated: string;
  gender?: 'male' | 'female' | 'neutral';
  declensions?: {
    nominative: string;
    genitive: string;
    dative: string;
    accusative: string;
    instrumental: string;
    prepositional: string;
  };
  notes?: string;
  autoDetected?: boolean;
}

export interface ProjectSettings {
  model: string;
  temperature: number;
  skipEditing: boolean;
}

export interface DatabaseSchema {
  projects: Project[];
  settings: {
    lastOpenedProject?: string;
  };
}

// Default data
const defaultData: DatabaseSchema = {
  projects: [],
  settings: {},
};

// Database instance
let db: Low<DatabaseSchema> | null = null;

/**
 * Initialize database
 */
export async function initDatabase(dataDir: string = './data'): Promise<Low<DatabaseSchema>> {
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const dbPath = path.join(dataDir, 'arcane-db.json');
  const adapter = new JSONFile<DatabaseSchema>(dbPath);
  db = new Low(adapter, defaultData);
  
  // Read existing data
  await db.read();
  
  // Initialize with defaults if empty
  db.data ||= defaultData;
  
  console.log(`📦 База данных инициализирована: ${dbPath}`);
  console.log(`   Проектов: ${db.data.projects.length}`);
  
  return db;
}

/**
 * Get database instance
 */
export function getDb(): Low<DatabaseSchema> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// ============ Project Operations ============

export async function getAllProjects(): Promise<Project[]> {
  const db = getDb();
  return db.data.projects;
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = getDb();
  return db.data.projects.find(p => p.id === id);
}

export async function createProject(data: {
  name: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}): Promise<Project> {
  const db = getDb();
  
  const project: Project = {
    id: generateId(),
    name: data.name || 'Новый проект',
    sourceLanguage: data.sourceLanguage || 'en',
    targetLanguage: data.targetLanguage || 'ru',
    chapters: [],
    glossary: [],
    settings: {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      skipEditing: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  db.data.projects.push(project);
  await db.write();
  
  console.log(`📁 Создан проект: ${project.name} (${project.id})`);
  
  return project;
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === id);
  
  if (!project) return undefined;
  
  Object.assign(project, updates, { updatedAt: new Date().toISOString() });
  await db.write();
  
  return project;
}

export async function deleteProject(id: string): Promise<boolean> {
  const db = getDb();
  const index = db.data.projects.findIndex(p => p.id === id);
  
  if (index === -1) return false;
  
  const [removed] = db.data.projects.splice(index, 1);
  await db.write();
  
  console.log(`🗑️ Удалён проект: ${removed.name}`);
  
  return true;
}

// ============ Chapter Operations ============

export async function addChapter(
  projectId: string,
  data: { title: string; originalText: string }
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  
  if (!project) return undefined;
  
  const chapter: Chapter = {
    id: generateId(),
    number: project.chapters.length + 1,
    title: data.title,
    originalText: data.originalText,
    status: 'pending',
  };
  
  project.chapters.push(chapter);
  project.updatedAt = new Date().toISOString();
  await db.write();
  
  console.log(`📖 Добавлена глава: ${chapter.title} -> ${project.name}`);
  
  return chapter;
}

export async function updateChapter(
  projectId: string,
  chapterId: string,
  updates: Partial<Chapter>
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return undefined;
  
  const chapter = project.chapters.find(c => c.id === chapterId);
  if (!chapter) return undefined;
  
  Object.assign(chapter, updates);
  project.updatedAt = new Date().toISOString();
  await db.write();
  
  return chapter;
}

export async function getChapter(
  projectId: string,
  chapterId: string
): Promise<Chapter | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return undefined;
  
  return project.chapters.find(c => c.id === chapterId);
}

// ============ Glossary Operations ============

export async function addGlossaryEntry(
  projectId: string,
  entry: Omit<GlossaryEntry, 'id'>
): Promise<GlossaryEntry | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  
  if (!project) return undefined;
  
  const glossaryEntry: GlossaryEntry = {
    id: generateId(),
    ...entry,
  };
  
  project.glossary.push(glossaryEntry);
  project.updatedAt = new Date().toISOString();
  await db.write();
  
  return glossaryEntry;
}

export async function updateGlossaryEntry(
  projectId: string,
  entryId: string,
  updates: Partial<GlossaryEntry>
): Promise<GlossaryEntry | undefined> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return undefined;
  
  const entry = project.glossary.find(e => e.id === entryId);
  if (!entry) return undefined;
  
  Object.assign(entry, updates);
  project.updatedAt = new Date().toISOString();
  await db.write();
  
  return entry;
}

export async function deleteGlossaryEntry(
  projectId: string,
  entryId: string
): Promise<boolean> {
  const db = getDb();
  const project = db.data.projects.find(p => p.id === projectId);
  if (!project) return false;
  
  const index = project.glossary.findIndex(e => e.id === entryId);
  if (index === -1) return false;
  
  project.glossary.splice(index, 1);
  project.updatedAt = new Date().toISOString();
  await db.write();
  
  return true;
}

// ============ Helpers ============

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

