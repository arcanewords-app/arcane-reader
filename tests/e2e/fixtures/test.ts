import { devices, test as base, expect, type Browser, type Page } from '@playwright/test';
import { createActor, type Actor } from '../actors/types.js';
import { PERSONAS, type Persona } from '../actors/personas.js';
import { ApiClient, loginPersona, publicApi, type AuthSession } from '../api/client.js';
import { API_ORIGIN, UI_ORIGIN } from '../env.js';

function consentRecord() {
  return {
    status: 'rejected' as const,
    at: new Date().toISOString(),
    policyVersion: 1,
  };
}

type SessionPayload = {
  locale: string;
  consent: ReturnType<typeof consentRecord>;
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    user: { id: string; email: string; role: string };
  };
};

async function applyBootstrap(page: Page, payload: SessionPayload): Promise<void> {
  await page.addInitScript((data: SessionPayload) => {
    localStorage.setItem('app.locale', data.locale);
    localStorage.setItem('arcane:cookie-consent', JSON.stringify(data.consent));
    if (data.session) {
      localStorage.setItem('arcane_auth_token', data.session.access_token);
      localStorage.setItem('arcane_auth_refresh', data.session.refresh_token);
      localStorage.setItem('arcane_user', JSON.stringify(data.session.user));
      if (data.session.expires_at != null) {
        localStorage.setItem('arcane_auth_expires', String(data.session.expires_at));
      }
    }
  }, payload);
}

async function guestActor(page: Page): Promise<Actor> {
  await applyBootstrap(page, { locale: 'en', consent: consentRecord() });
  return createActor(page, publicApi, null, null);
}

async function authedActor(
  browser: Browser,
  persona: Persona
): Promise<{ actor: Actor; page: Page }> {
  const { user, session } = await loginPersona(persona);
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    locale: 'en-US',
    baseURL: UI_ORIGIN,
  });
  const page = await context.newPage();
  await applyBootstrap(page, {
    locale: 'en',
    consent: consentRecord(),
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user,
    },
  });
  const api = new ApiClient(API_ORIGIN, session);
  return { actor: createActor(page, api, persona, session), page };
}

type ActorFixtures = {
  guest: Actor;
  reader: Actor;
  author: Actor;
  authorPlus: Actor;
  admin: Actor;
};

export const test = base.extend<ActorFixtures>({
  guest: async ({ page }, use) => {
    await use(await guestActor(page));
  },
  reader: async ({ browser }, use) => {
    const { actor, page } = await authedActor(browser, PERSONAS.reader);
    await use(actor);
    await page.context().close();
  },
  author: async ({ browser }, use) => {
    const { actor, page } = await authedActor(browser, PERSONAS.author);
    await use(actor);
    await page.context().close();
  },
  authorPlus: async ({ browser }, use) => {
    const { actor, page } = await authedActor(browser, PERSONAS.authorPlus);
    await use(actor);
    await page.context().close();
  },
  admin: async ({ browser }, use) => {
    const { actor, page } = await authedActor(browser, PERSONAS.admin);
    await use(actor);
    await page.context().close();
  },
});

export { expect };
export type { Actor, AuthSession };
