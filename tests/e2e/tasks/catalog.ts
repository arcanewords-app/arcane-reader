import { PERSONAS, SEED_PASSWORD } from '../actors/personas.js';
import type { Task } from '../actors/types.js';

export const openLoginModal: Task = async (actor) => {
  await actor.page.getByRole('button', { name: 'Log in' }).click();
  await actor.page.getByRole('heading', { name: 'Sign in' }).waitFor({ state: 'visible' });
};

export const loginAsReaderViaUi: Task = async (actor) => {
  await openLoginModal(actor);
  await actor.page.getByLabel('Email').fill(PERSONAS.reader.email);
  await actor.page.getByLabel('Password').fill(SEED_PASSWORD);
  await actor.page.getByRole('button', { name: 'Sign in' }).click();
  await actor.page.getByRole('button', { name: 'Log out' }).waitFor({ state: 'visible' });
};

export const logout: Task = async (actor) => {
  await actor.page.getByRole('button', { name: 'Log out' }).click();
  await actor.page.getByRole('button', { name: 'Log in' }).waitFor({ state: 'visible' });
};
