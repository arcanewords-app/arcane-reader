import type { Role } from './types.js';

export const product = {
  name: 'Arcane Reader',
  tagline: 'Читалка и мастерская перевода: каталог книг, чтение, проекты автора и публикация.',
};

export const roles: { id: Role; label: string }[] = [
  { id: 'guest', label: 'Гость' },
  { id: 'user', label: 'Читатель' },
  { id: 'author', label: 'Автор' },
  { id: 'admin', label: 'Админ' },
];

/** Paths whose access is not implied by AuthorGate / AdminGate. */
export const roleByPath: Partial<Record<string, Role>> = {
  '/profile': 'user',
};

export interface AreaDef {
  id: string;
  title: string;
  blurb: string;
}

export const areas: AreaDef[] = [
  {
    id: 'catalog',
    title: 'Каталог',
    blurb: 'Витрина опубликованных книг, фильтры и свои работы.',
  },
  {
    id: 'reading',
    title: 'Чтение',
    blurb: 'Страница книги и режим чтения главы.',
  },
  {
    id: 'author',
    title: 'Мастерская',
    blurb: 'Проекты, главы, перевод, глоссарий и публикация.',
  },
  {
    id: 'account',
    title: 'Аккаунт',
    blurb: 'Профиль, история чтения и уровни доступа.',
  },
  {
    id: 'admin',
    title: 'Админка',
    blurb: 'Модерация каталога, новостей, проектов и пользователей.',
  },
  {
    id: 'info',
    title: 'О проекте',
    blurb: 'Новости, правила, контакты.',
  },
];

export function areaForPath(path: string): string {
  if (path === '/' || path === '/catalog') return 'catalog';
  if (path.startsWith('/p/')) return 'reading';
  if (path.startsWith('/projects') || path === '/translation-requests') return 'author';
  if (path === '/profile' || path === '/account-tiers') return 'account';
  if (path.startsWith('/admin')) return 'admin';
  return 'info';
}

/** Demo path for the pitch. Each entry must stay a real client route. */
export const spines: Record<Role, string[]> = {
  guest: ['/', '/p/:publicationId', '/p/:publicationId/chapters/:chapterId/reading'],
  user: ['/profile', '/p/:publicationId', '/p/:publicationId/chapters/:chapterId/reading'],
  author: ['/projects', '/projects/:projectId', '/projects/:projectId/chapters/:chapterId'],
  admin: ['/admin/publications', '/admin/projects', '/admin/users'],
};

/**
 * Chrome shared by every screen. Calls here stay on the shell card
 * instead of being copied onto each page.
 */
export const shellPrefixes = [
  'src/client/components/Header.tsx',
  'src/client/components/Auth/',
  'src/client/components/AnnouncementBanner.tsx',
  'src/client/components/ServiceStatusBanner.tsx',
  'src/client/contexts/AnnouncementContext.tsx',
  'src/client/contexts/TokenUsageContext.tsx',
  'src/client/contexts/ServiceHealthContext.tsx',
  'src/client/services/authService.ts',
];

export function isShellFile(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  return shellPrefixes.some((prefix) => norm === prefix || norm.startsWith(prefix));
}
