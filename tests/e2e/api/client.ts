import { API_ORIGIN, stampFailed } from '../env.js';
import { PERSONAS, SEED_PASSWORD, type Persona, type PersonaId } from '../actors/personas.js';

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
};

export type AuthUser = {
  id: string;
  email: string;
  role: string;
};

type Json = Record<string, unknown>;

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class ApiClient {
  constructor(
    readonly origin: string,
    readonly session: AuthSession | null = null
  ) {}

  withSession(session: AuthSession): ApiClient {
    return new ApiClient(this.origin, session);
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    if (this.session?.access_token) {
      headers.set('Authorization', `Bearer ${this.session.access_token}`);
    }
    return headers;
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = this.headers(init.headers);
    if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${this.origin}${path}`, { ...init, headers });
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetch(path, init);
    const body = await parseJson(res);
    if (!res.ok) {
      throw stampFailed(
        `API ${init.method ?? 'GET'} ${path} → ${res.status}: ${JSON.stringify(body)}`
      );
    }
    return body as T;
  }

  async login(persona: Persona): Promise<{ user: AuthUser; session: AuthSession }> {
    const res = await this.fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: persona.email, password: SEED_PASSWORD }),
    });
    const body = (await parseJson(res)) as {
      user?: AuthUser;
      session?: AuthSession | null;
      error?: string;
    };
    if (!res.ok || !body?.user || !body.session?.access_token) {
      throw stampFailed(
        `Seed persona ${persona.email} could not log in (${res.status}): ${body?.error ?? JSON.stringify(body)}`
      );
    }
    return { user: body.user, session: body.session };
  }

  async me(): Promise<AuthUser> {
    const body = await this.json<{ user: AuthUser }>('/api/auth/me');
    return body.user;
  }

  async listPublications(limit = 1): Promise<Array<{ id: string; title?: string; slug?: string }>> {
    const list = await this.json<unknown>(`/api/publications?limit=${limit}`);
    return Array.isArray(list)
      ? (list as Array<{ id: string; title?: string; slug?: string }>)
      : [];
  }

  async listProjects(): Promise<Array<{ id: string; name: string }>> {
    const res = await this.fetch('/api/projects');
    const body = await parseJson(res);
    if (res.status === 403) return [];
    if (!res.ok) {
      throw stampFailed(`GET /api/projects → ${res.status}: ${JSON.stringify(body)}`);
    }
    return Array.isArray(body) ? (body as Array<{ id: string; name: string }>) : [];
  }

  async getProject(projectId: string): Promise<{
    id: string;
    name: string;
    glossary?: unknown[];
    chapters?: Array<{ id: string; title?: string; number?: number }>;
  }> {
    return this.json(`/api/projects/${projectId}`);
  }

  async chaptersSummary(
    projectId: string
  ): Promise<Array<{ id: string; title?: string; number?: number; status?: string }>> {
    const summary = await this.json<unknown>(`/api/projects/${projectId}/chapters/summary`);
    return Array.isArray(summary)
      ? (summary as Array<{ id: string; title?: string; number?: number; status?: string }>)
      : [];
  }

  async createProject(name: string): Promise<{ id: string; name: string }> {
    return this.json('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, sourceLanguage: 'en', targetLanguage: 'ru' }),
    });
  }

  async uploadTxtChapter(projectId: string, title: string, text: string): Promise<{ id: string }> {
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/plain' }), 'e2e-chapter.txt');
    form.append('title', title);
    form.append('filename', 'e2e-chapter.txt');
    const res = await this.fetch(`/api/projects/${projectId}/chapters`, {
      method: 'POST',
      body: form,
    });
    const body = (await parseJson(res)) as Json & {
      id?: string;
      chapters?: Array<{ id: string }>;
    };
    if (!res.ok) {
      throw stampFailed(`Upload chapter → ${res.status}: ${JSON.stringify(body)}`);
    }
    const id = body.id ?? body.chapters?.[0]?.id;
    if (!id) {
      throw stampFailed(`Upload chapter returned no id: ${JSON.stringify(body)}`);
    }
    return { id };
  }

  async markAsTranslated(projectId: string, chapterId: string): Promise<void> {
    await this.json(`/api/projects/${projectId}/chapters/${chapterId}/mark-as-translated`, {
      method: 'POST',
    });
  }

  async translateChapter(projectId: string, chapterId: string): Promise<unknown> {
    const started = await this.json(`/api/projects/${projectId}/chapters/${chapterId}/translate`, {
      method: 'POST',
      body: JSON.stringify({
        stages: ['translation'],
        translateChapterTitles: false,
      }),
    });
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      const chapter = await this.getChapter(projectId, chapterId);
      if (chapter.status && chapter.status !== 'pending' && chapter.status !== 'translating') {
        return chapter;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw stampFailed(
      `Translation did not finish for chapter ${chapterId} (started: ${JSON.stringify(started)}).`
    );
  }

  async getChapter(
    projectId: string,
    chapterId: string
  ): Promise<{
    id: string;
    status?: string;
    paragraphs?: Array<{ originalText?: string; translatedText?: string }>;
  }> {
    return this.json(`/api/projects/${projectId}/chapters/${chapterId}`);
  }

  async publicationChapters(publicationId: string): Promise<{
    publication?: { id: string; title?: string; slug?: string | null };
    chapters?: Array<{ id: string; number?: number; title?: string; hasTranslation?: boolean }>;
  }> {
    return this.json(`/api/publications/${publicationId}/chapters`);
  }

  async findReadablePublication(): Promise<{
    id: string;
    path: string;
    chapterId: string;
  }> {
    const pubs = await this.listPublications(50);
    for (const pub of pubs) {
      const detail = await this.publicationChapters(pub.id);
      const chapter = detail.chapters?.find((item) => item.hasTranslation);
      if (!chapter) continue;
      const slug = pub.slug || detail.publication?.slug;
      return { id: pub.id, path: slug || pub.id, chapterId: chapter.id };
    }
    throw stampFailed('No stamped publication has a translated chapter.');
  }

  async updateReadProgress(
    publicationId: string,
    chapterNumber: number,
    mode: 'complete' | 'set' = 'complete'
  ): Promise<void> {
    await this.json(`/api/publications/${publicationId}/read-progress`, {
      method: 'PATCH',
      body: JSON.stringify({ chapterNumber, mode }),
    });
  }

  async readingHistory(): Promise<{
    items?: Array<{ publicationId?: string; lastReadChapterNumber?: number; title?: string }>;
  }> {
    const body = await this.json<unknown>('/api/user/reading-history');
    if (Array.isArray(body)) {
      return { items: body as Array<{ publicationId?: string; lastReadChapterNumber?: number }> };
    }
    return body as {
      items?: Array<{ publicationId?: string; lastReadChapterNumber?: number; title?: string }>;
    };
  }
}

export const publicApi = new ApiClient(API_ORIGIN);

export async function loginPersona(persona: Persona): Promise<{
  user: AuthUser;
  session: AuthSession;
  api: ApiClient;
}> {
  const { user, session } = await publicApi.login(persona);
  return { user, session, api: publicApi.withSession(session) };
}

export async function loginPersonaId(id: PersonaId): Promise<{
  user: AuthUser;
  session: AuthSession;
  api: ApiClient;
}> {
  return loginPersona(PERSONAS[id]);
}
