import type { Page } from '@playwright/test';
import type { Persona } from './personas.js';
import type { ApiClient, AuthSession } from '../api/client.js';

export type Task = (actor: Actor) => Promise<void>;
export type Question = (actor: Actor) => Promise<void>;

export type Actor = {
  page: Page;
  persona: Persona | null;
  session: AuthSession | null;
  api: ApiClient;
  attemptsTo: (...tasks: Task[]) => Promise<void>;
  see: (question: Question) => Promise<void>;
};

export function createActor(
  page: Page,
  api: ApiClient,
  persona: Persona | null,
  session: AuthSession | null
): Actor {
  const actor: Actor = {
    page,
    persona,
    session,
    api,
    async attemptsTo(...tasks) {
      for (const task of tasks) {
        await task(actor);
      }
    },
    async see(question) {
      await question(actor);
    },
  };
  return actor;
}
