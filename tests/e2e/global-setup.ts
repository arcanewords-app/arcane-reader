import { AUTHED_PERSONAS } from './actors/personas.js';
import { publicApi } from './api/client.js';
import { API_ORIGIN, stampFailed, UI_ORIGIN } from './env.js';

async function probe(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  const healthOk = (await probe(API_ORIGIN)) || (await probe(UI_ORIGIN));
  if (!healthOk) {
    throw stampFailed(`Could not reach /api/health on ${API_ORIGIN} or ${UI_ORIGIN}.`);
  }

  const publications = await publicApi.listPublications(1);
  if (publications.length < 1) {
    throw stampFailed('Catalog is empty. Stamp data is missing.');
  }

  for (const persona of AUTHED_PERSONAS) {
    const { user, api } = await publicApi.login(persona).then(async ({ user, session }) => ({
      user,
      api: publicApi.withSession(session),
    }));
    if (user.role !== persona.role) {
      throw stampFailed(
        `Persona ${persona.email} has role "${user.role}", expected "${persona.role}".`
      );
    }
    if (user.email !== persona.email) {
      throw stampFailed(`Persona login email mismatch for ${persona.email}.`);
    }

    const projects = await api.listProjects();
    if (persona.id === 'author' && projects.length < 1) {
      throw stampFailed(
        'Author owns no projects after stamp. Dump remap should attach dump rows to author@local.test.'
      );
    }
    if (persona.id === 'reader' && projects.length > 0) {
      throw stampFailed(
        'Reader owns translation projects. Dump remapped to the wrong user; run stack:load.'
      );
    }
  }
}
