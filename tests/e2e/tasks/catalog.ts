import { PERSONAS, SEED_PASSWORD } from '../actors/personas.js';
import type { Task } from '../actors/types.js';
import {
  emailField,
  logIn,
  logOut,
  passwordField,
  signInHeading,
  signInSubmit,
} from '../targets/auth.js';

export const openLoginModal: Task = async (actor) => {
  await logIn(actor.page).click();
  await signInHeading(actor.page).waitFor({ state: 'visible' });
};

export const loginAsReaderViaUi: Task = async (actor) => {
  await openLoginModal(actor);
  await emailField(actor.page).fill(PERSONAS.reader.email);
  await passwordField(actor.page).fill(SEED_PASSWORD);
  await signInSubmit(actor.page).click();
  await logOut(actor.page).waitFor({ state: 'visible' });
};

export const logout: Task = async (actor) => {
  await logOut(actor.page).click();
  await logIn(actor.page).waitFor({ state: 'visible' });
};
