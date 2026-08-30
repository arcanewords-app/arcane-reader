import type { Task } from '../actors/types.js';

export const openCatalog: Task = async (actor) => {
  await actor.page.goto('/');
  await actor.page.locator('header').waitFor({ state: 'visible' });
};

export const openPath =
  (path: string): Task =>
  async (actor) => {
    await actor.page.goto(path);
  };

export const openAccountTiers: Task = async (actor) => {
  await actor.page.goto('/account-tiers');
};

export const openNews: Task = async (actor) => {
  await actor.page.goto('/news');
};

export const openProjects: Task = async (actor) => {
  await actor.page.goto('/projects');
};

export const openProfile: Task = async (actor) => {
  await actor.page.goto('/profile');
};

export const openAdminUsers: Task = async (actor) => {
  await actor.page.goto('/admin/users');
};

export const openAdminPublications: Task = async (actor) => {
  await actor.page.goto('/admin/publications');
};
