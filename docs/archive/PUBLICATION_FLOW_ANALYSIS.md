---
stale: true
status: archived
domain: meta
---

# Publication Flow Analysis
## `/api/projects/{projectId}/publication` Endpoint

**Date**: 2026-02-01  
**Context**: РђРЅР°Р»РёР· Р»РѕРіРёРєРё СЂР°Р±РѕС‚С‹ СЌРЅРґРїРѕРёРЅС‚Р° РїРѕР»СѓС‡РµРЅРёСЏ РїСѓР±Р»РёРєР°С†РёРё РїСЂРё РѕС‚РєСЂС‹С‚РёРё РїСЂРѕРµРєС‚Р°

---

## 1. Р’С‹Р·РѕРІ СЌРЅРґРїРѕРёРЅС‚Р°

### Р“РґРµ РІС‹Р·С‹РІР°РµС‚СЃСЏ
**Р¤Р°Р№Р»**: `src/client/components/ProjectInfo.tsx` (СЃС‚СЂРѕРєР° 59)

```typescript
useEffect(() => {
  let cancelled = false;
  api.getProjectPublication(project.id)
    .then((pub) => { if (!cancelled) setPublication(pub ?? null); })
    .catch(() => { if (!cancelled) setPublication(null); })
    .finally(() => { if (!cancelled) setPublicationLoading(false); });
  return () => { cancelled = true; };
}, [project.id]);
```

**РљРѕРіРґР°**: РЎСЂР°Р±Р°С‚С‹РІР°РµС‚ РїСЂРё РѕС‚РєСЂС‹С‚РёРё ProjectInfo РєРѕРјРїРѕРЅРµРЅС‚Р° (РѕС‚РєСЂС‹С‚РёРµ РїСЂРѕРµРєС‚Р°)  
**Р—Р°РІРёСЃРёРјРѕСЃС‚СЊ**: `project.id` - РїРµСЂРµР·Р°РіСЂСѓР¶Р°РµС‚СЃСЏ РµСЃР»Рё ID РїСЂРѕРµРєС‚Р° РёР·РјРµРЅРёР»СЃСЏ  
**РћС‚РјРµРЅР°**: РСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ `cancelled` С„Р»Р°Рі РґР»СЏ РёР·Р±РµР¶Р°РЅРёСЏ СѓС‚РµС‡РµРє РїР°РјСЏС‚Рё РїСЂРё СЂР°Р·РјРѕРЅС‚РёСЂРѕРІР°РЅРёРё

---

## 2. API РљР»РёРµРЅС‚

### РњРµС‚РѕРґ
**Р¤Р°Р№Р»**: `src/client/api/client.ts` (СЃС‚СЂРѕРєР° 552)

```typescript
async getProjectPublication(projectId: string): Promise<Publication | null> {
  try {
    return await fetchJson(`/api/projects/${projectId}/publication`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
```

**Р›РѕРіРёРєР°**:
- РћС‚РїСЂР°РІР»СЏРµС‚ GET Р·Р°РїСЂРѕСЃ Рє `/api/projects/{projectId}/publication`
- РўСЂРµР±СѓРµС‚ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРё (РѕС‚РїСЂР°РІР»СЏРµС‚ С‚РѕРєРµРЅ РІ Р·Р°РіРѕР»РѕРІРєРµ)
- Р’РѕР·РІСЂР°С‰Р°РµС‚ `Publication | null`
- Р•СЃР»Рё 404 - РІРѕР·РІСЂР°С‰Р°РµС‚ `null`, РѕСЃС‚Р°Р»СЊРЅС‹Рµ РѕС€РёР±РєРё РїСЂРѕР±СЂР°СЃС‹РІР°СЋС‚СЃСЏ

---

## 3. Server Endpoint

### РњР°СЂС€СЂСѓС‚
**Р¤Р°Р№Р»**: `src/server.ts` (СЃС‚СЂРѕРєР° 3354)

```typescript
app.get('/api/projects/:projectId/publication', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const token = req.token!;
    const projectId = req.params.projectId;
    const pub = await getPublicationByProjectId(projectId, userId, token);
    if (!pub) {
      return res.status(404).json({ error: 'Publication not found' });
    }
    res.json(pub);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to get publication';
    res.status(500).json({ error: msg });
  }
});
```

**Р›РѕРіРёРєР°**:
1. РўСЂРµР±СѓРµС‚ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРё (`requireAuth` middleware)
2. РР·РІР»РµРєР°РµС‚ `userId`, `token`, `projectId` РёР· Р·Р°РїСЂРѕСЃР°
3. Р’С‹Р·С‹РІР°РµС‚ `getPublicationByProjectId()`
4. Р•СЃР»Рё РїСѓР±Р»РёРєР°С†РёРё РЅРµС‚ - РІРѕР·РІСЂР°С‰Р°РµС‚ 404
5. Р•СЃР»Рё РѕС€РёР±РєР° Р‘Р” - РІРѕР·РІСЂР°С‰Р°РµС‚ 500 СЃ СЃРѕРѕР±С‰РµРЅРёРµРј

---

## 4. Database Service

### Р¤СѓРЅРєС†РёСЏ
**Р¤Р°Р№Р»**: `src/services/supabaseDatabase.ts` (СЃС‚СЂРѕРєР° 1826)

```typescript
export async function getPublicationByProjectId(
  projectId: string,
  userId: string,
  token: string
): Promise<ReturnType<typeof transformPublicationFromDB> | null> {
  validateToken(token);
  const client = createClientWithToken(token);

  const { data, error } = await client
    .from('publications')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    if (error?.code === 'PGRST116') return null;  // No rows returned
    if (error) throw new Error(`Failed to get publication: ${error.message}`);
    return null;
  }
  return transformPublicationFromDB(data as PublicationRow);
}
```

**SQL Query СЌРєРІРёРІР°Р»РµРЅС‚**:
```sql
SELECT * FROM publications 
WHERE project_id = $1 AND user_id = $2
LIMIT 1;
```

**Р›РѕРіРёРєР°**:
1. Р’Р°Р»РёРґРёСЂСѓРµС‚ С‚РѕРєРµРЅ
2. РЎРѕР·РґР°РµС‚ Supabase РєР»РёРµРЅС‚ СЃ С‚РѕРєРµРЅРѕРј РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
3. Р’С‹РїРѕР»РЅСЏРµС‚ Р·Р°РїСЂРѕСЃ СЃ `.single()` - РѕР¶РёРґР°РµС‚ 0 РёР»Рё 1 СЂРµР·СѓР»СЊС‚Р°С‚
4. Р•СЃР»Рё 0 СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ - РІРѕР·РІСЂР°С‰Р°РµС‚ `null`
5. РўСЂР°РЅСЃС„РѕСЂРјРёСЂСѓРµС‚ СЂРµР·СѓР»СЊС‚Р°С‚ С‡РµСЂРµР· `transformPublicationFromDB()`

### РўСЂР°РЅСЃС„РѕСЂРјР°С†РёСЏ РґР°РЅРЅС‹С…
**Р¤Р°Р№Р»**: `src/services/supabaseDatabase.ts` (СЃС‚СЂРѕРєР° 1507)

```typescript
function transformPublicationFromDB(row: PublicationRow): {
  id: string;
  projectId: string;
  userId: string;
  status: PublicationStatus;
  title: string | null;
  description: string | null;
  coverImageUrl: string | null;
  authorDisplay: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    status: row.status as PublicationStatus,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url,
    authorDisplay: row.author_display,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

РџСЂРµРѕР±СЂР°Р·СѓРµС‚ snake_case РёР· Р‘Р” РІ camelCase РґР»СЏ РєР»РёРµРЅС‚Р°.

---

## 5. Publication Data Model

### РўРёРї `Publication`
**Р¤Р°Р№Р»**: `src/client/types/index.ts` (СЃС‚СЂРѕРєР° 266)

```typescript
export interface Publication {
  id: string;                      // UUID
  projectId: string;               // UUID of project
  userId: string;                  // UUID of user
  status: PublicationStatus;       // 'draft' | 'published' | 'unpublished'
  title: string | null;            // Р—Р°РіРѕР»РѕРІРѕРє РїСѓР±Р»РёРєР°С†РёРё
  description: string | null;      // РћРїРёСЃР°РЅРёРµ РґР»СЏ РєР°С‚Р°Р»РѕРіР°
  coverImageUrl: string | null;    // URL РѕР±Р»РѕР¶РєРё
  authorDisplay: string | null;    // РРјСЏ Р°РІС‚РѕСЂР° РґР»СЏ РєР°С‚Р°Р»РѕРіР°
  sourceLanguage: string;          // РЇР·С‹Рє РѕСЂРёРіРёРЅР°Р»Р°
  targetLanguage: string;          // РЇР·С‹Рє РїРµСЂРµРІРѕРґР°
  publishedAt: string | null;      // ISO timestamp РїРµСЂРІРѕР№ РїСѓР±Р»РёРєР°С†РёРё
  createdAt: string;               // ISO timestamp СЃРѕР·РґР°РЅРёСЏ Р·Р°РїРёСЃРё
  updatedAt: string;               // ISO timestamp РїРѕСЃР»РµРґРЅРµРіРѕ РѕР±РЅРѕРІР»РµРЅРёСЏ
}

export type PublicationStatus = 'draft' | 'published' | 'unpublished';
```

### Р‘Р°Р·Р° РґР°РЅРЅС‹С… С‚Р°Р±Р»РёС†Р°
**Р¤Р°Р№Р»**: `docs/migrations/publications.sql`

```sql
CREATE TABLE IF NOT EXISTS publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  title TEXT,
  description TEXT,
  cover_image_url TEXT,
  author_display TEXT,
  source_language TEXT,
  target_language TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id)  -- РћРґРЅР° РїСѓР±Р»РёРєР°С†РёСЏ РЅР° РїСЂРѕРµРєС‚
);
```

**РћРіСЂР°РЅРёС‡РµРЅРёСЏ**:
- `UNIQUE(project_id)` - РѕРґРЅР° Р·Р°РїРёСЃСЊ РїСѓР±Р»РёРєР°С†РёРё РЅР° РѕРґРёРЅ РїСЂРѕРµРєС‚
- РљР°СЃРєР°РґРЅРѕРµ СѓРґР°Р»РµРЅРёРµ РїСЂРё СѓРґР°Р»РµРЅРёРё РїСЂРѕРµРєС‚Р°
- RLS РїРѕР»РёС‚РёРєРё РґР»СЏ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё РґРѕСЃС‚СѓРїР°

---

## 6. РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ РґР°РЅРЅС‹С… РІ UI

### ProjectInfo РєРѕРјРїРѕРЅРµРЅС‚
**Р¤Р°Р№Р»**: `src/client/components/ProjectInfo.tsx` (СЃС‚СЂРѕРєР° 870)

РџРѕСЃР»Рµ Р·Р°РіСЂСѓР·РєРё РїСѓР±Р»РёРєР°С†РёРё, СЃРѕСЃС‚РѕСЏРЅРёРµ РѕС‚РѕР±СЂР°Р¶Р°РµС‚ UI РІ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё РѕС‚ СЃС‚Р°С‚СѓСЃР°:

#### РЎС‚Р°С‚СѓСЃ: Loading
```typescript
{publicationLoading ? (
  <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
    {t('common.loading')}
  </div>
)
```

#### РЎС‚Р°С‚СѓСЃ: Published
```typescript
: publication?.status === 'published' ? (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    <p>{t('projectInfo.publicationPublished')}</p>
    <p>{t('projectInfo.publicationUpdatesHint')}</p>
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
      <Button variant="secondary" size="sm" 
        onClick={() => window.open(`/p/${publication.id}`, '_blank')}>
        {t('projectInfo.publicationView')}
      </Button>
      <Button variant="secondary" size="sm" 
        onClick={handleUpdatePublication} 
        disabled={updatingPublication}>
        {t('projectInfo.updatePublication')}
      </Button>
      <Button variant="secondary" size="sm" 
        onClick={handleUnpublish} 
        disabled={unpublishing}>
        {t('projectInfo.unpublish')}
      </Button>
    </div>
  </div>
)
```

**Р”РѕСЃС‚СѓРїРЅС‹Рµ РґРµР№СЃС‚РІРёСЏ**:
1. **View** - РѕС‚РєСЂС‹РІР°РµС‚ РїСѓР±Р»РёС‡РЅСѓСЋ СЃС‚СЂР°РЅРёС†Сѓ `/p/{publicationId}`
2. **Update** - РѕР±РЅРѕРІР»СЏРµС‚ РјРµС‚Р°РґР°РЅРЅС‹Рµ РїСѓР±Р»РёРєР°С†РёРё (title, description)
3. **Unpublish** - РјРµРЅСЏРµС‚ СЃС‚Р°С‚СѓСЃ РЅР° 'unpublished'

#### РЎС‚Р°С‚СѓСЃ: Not Published (draft/unpublished)
```typescript
: (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    <p>{t('projectInfo.publicationNotPublished')}</p>
    <Button variant="primary" size="sm" 
      onClick={openPublishModal} 
      disabled={stats.chapters === 0}>
      {t('projectInfo.publish')}
    </Button>
    {stats.chapters === 0 && (
      <p>{t('projectInfo.publishRequiresChapters')}</p>
    )}
  </div>
)
```

**Р”РѕСЃС‚СѓРїРЅРѕРµ РґРµР№СЃС‚РІРёРµ**:
1. **Publish** - РѕС‚РєСЂС‹РІР°РµС‚ РјРѕРґР°Р»СЊРЅРѕРµ РѕРєРЅРѕ РґР»СЏ РїСѓР±Р»РёРєР°С†РёРё (РѕС‚РєР»СЋС‡РµРЅРѕ РµСЃР»Рё РЅРµС‚ РіР»Р°РІ)

---

## 7. РџРѕР»РЅС‹Р№ Р¶РёР·РЅРµРЅРЅС‹Р№ С†РёРєР»

### 1. РћС‚РєСЂС‹С‚РёРµ РїСЂРѕРµРєС‚Р°
```
[ProjectInfo mount]
  в†’ api.getProjectPublication(projectId)
    в†’ GET /api/projects/{projectId}/publication
      в†’ getPublicationByProjectId()
        в†’ SELECT * FROM publications WHERE project_id = ? AND user_id = ?
          в†’ transformPublicationFromDB()
            в†’ setPublication(pub)
              в†’ Render UI СЃ РїСѓР±Р»РёРєР°С†РёРµР№
```

### 2. РџРµСЂРІР°СЏ РїСѓР±Р»РёРєР°С†РёСЏ
```
[РќР°Р¶Р°С‚Р° РєРЅРѕРїРєР° "Publish"]
  в†’ openPublishModal() Р·Р°РїРѕР»РЅСЏРµС‚ С„РѕСЂРјСѓ
  в†’ handlePublish() РѕС‚РїСЂР°РІР»СЏРµС‚ РґР°РЅРЅС‹Рµ
    в†’ api.publishProject(projectId, data)
      в†’ POST /api/projects/{projectId}/publish
        в†’ createOrUpdatePublication()
          в†’ INSERT INTO publications (...)
          в†’ setPublication(pub)
            в†’ UI РїРµСЂРµС…РѕРґРёС‚ РІ "Published" СЃРѕСЃС‚РѕСЏРЅРёРµ
```

### 3. РћР±РЅРѕРІР»РµРЅРёРµ РїСѓР±Р»РёРєР°С†РёРё
```
[РќР°Р¶Р°С‚Р° РєРЅРѕРїРєР° "Update"]
  в†’ handleUpdatePublication()
    в†’ api.publishProject(projectId, updatedData)
      в†’ POST /api/projects/{projectId}/publish
        в†’ createOrUpdatePublication()
          в†’ UPDATE publications SET ... WHERE project_id = ? AND user_id = ?
          в†’ published_at РѕСЃС‚Р°РµС‚СЃСЏ РЅРµРёР·РјРµРЅРЅРѕР№ (РґР°С‚Р° РїРµСЂРІРѕР№ РїСѓР±Р»РёРєР°С†РёРё)
          в†’ setPublication(pub)
            в†’ UI РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ СЃ РЅРѕРІС‹РјРё РґР°РЅРЅС‹РјРё
```

### 4. РћС‚РјРµРЅР° РїСѓР±Р»РёРєР°С†РёРё
```
[РќР°Р¶Р°С‚Р° РєРЅРѕРїРєР° "Unpublish"]
  в†’ handleUnpublish()
    в†’ api.unpublishProject(projectId)
      в†’ DELETE /api/projects/{projectId}/publish
        в†’ unpublishProject()
          в†’ UPDATE publications SET status = 'unpublished' WHERE ...
          в†’ setPublication(null)
            в†’ UI РїРµСЂРµС…РѕРґРёС‚ РІ "Not Published" СЃРѕСЃС‚РѕСЏРЅРёРµ
```

---

## 8. РЎС‚Р°С‚СѓСЃС‹ РїСѓР±Р»РёРєР°С†РёРё

| РЎС‚Р°С‚СѓСЃ | РћРїРёСЃР°РЅРёРµ | Р’РёРґРЅР° РІ РєР°С‚Р°Р»РѕРіРµ | Р”РѕСЃС‚СѓРїРЅС‹Рµ РґРµР№СЃС‚РІРёСЏ |
|--------|---------|------------------|-------------------|
| `draft` | Р§РµСЂРЅРѕРІРёРє, РЅРµ РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ | вќЊ РќРµС‚ | Publish |
| `published` | РћРїСѓР±Р»РёРєРѕРІР°РЅРѕ Рё РІРёРґРЅРѕ РІ РєР°С‚Р°Р»РѕРіРµ | вњ… Р”Р° | Update, Unpublish, View |
| `unpublished` | Р‘С‹Р»Рѕ РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ, РїРѕС‚РѕРј СЃРЅСЏС‚Рѕ | вќЊ РќРµС‚ | Publish |

**RLS РџРѕР»РёС‚РёРєРё**:
- Р’СЃРµ РјРѕРіСѓС‚ С‡РёС‚Р°С‚СЊ РїСѓР±Р»РёРєР°С†РёРё СЃРѕ СЃС‚Р°С‚СѓСЃРѕРј `published`
- РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС† РјРѕР¶РµС‚ РІРёРґРµС‚СЊ СЃРІРѕРё РїСѓР±Р»РёРєР°С†РёРё Р»СЋР±РѕРіРѕ СЃС‚Р°С‚СѓСЃР°
- РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС† РјРѕР¶РµС‚ СЃРѕР·РґР°РІР°С‚СЊ, РёР·РјРµРЅСЏС‚СЊ Рё СѓРґР°Р»СЏС‚СЊ СЃРІРѕРё РїСѓР±Р»РёРєР°С†РёРё

---

## 9. Р›РѕРі Р·Р°РїСЂРѕСЃРѕРІ РїСЂРё РѕС‚РєСЂС‹С‚РёРё РїСЂРѕРµРєС‚Р°

```
GET /api/projects/{projectId}/publication
  Headers:
    Authorization: Bearer {token}
  
  Response (РµСЃР»Рё РїСѓР±Р»РёРєР°С†РёСЏ СЃСѓС‰РµСЃС‚РІСѓРµС‚):
  {
    "id": "uuid",
    "projectId": "uuid",
    "userId": "uuid",
    "status": "published|draft|unpublished",
    "title": "РќР°Р·РІР°РЅРёРµ",
    "description": "РћРїРёСЃР°РЅРёРµ",
    "coverImageUrl": "https://...",
    "authorDisplay": "РђРІС‚РѕСЂ",
    "sourceLanguage": "en",
    "targetLanguage": "ru",
    "publishedAt": "2026-01-15T10:30:00Z",
    "createdAt": "2026-01-15T10:30:00Z",
    "updatedAt": "2026-01-20T14:45:00Z"
  }
  
  Response (РµСЃР»Рё РїСѓР±Р»РёРєР°С†РёРё РЅРµС‚):
  404 { "error": "Publication not found" }
```

---

## 10. Performance Considerations

1. **РљСЌС€РёСЂРѕРІР°РЅРёРµ**: РќРµС‚ СЃРїРµС†РёР°Р»СЊРЅРѕРіРѕ РєСЌС€РёСЂРѕРІР°РЅРёСЏ, РєР°Р¶РґС‹Р№ СЂР°Р· РґРµР»Р°РµС‚СЃСЏ Р·Р°РїСЂРѕСЃ Рє Р‘Р”
2. **РРЅРґРµРєСЃС‹**: Р’ Р‘Р” СЃРѕР·РґР°РЅ РёРЅРґРµРєСЃ `idx_publications_project_id`
3. **РџР°СЂР°Р»Р»РµР»СЊРЅС‹Рµ Р·Р°РїСЂРѕСЃС‹**: 
   - Р’С‹Р·С‹РІР°РµС‚СЃСЏ РѕРґРЅРѕРІСЂРµРјРµРЅРЅРѕ СЃ РґСЂСѓРіРёРјРё Р·Р°РїСЂРѕСЃР°РјРё РїСЂРё РѕС‚РєСЂС‹С‚РёРё ProjectInfo
   - РќРµ Р±Р»РѕРєРёСЂСѓРµС‚ РѕС‚СЂРёСЃРѕРІРєСѓ РѕСЃС‚Р°Р»СЊРЅРѕРіРѕ UI
4. **Timeout**: РЎС‚Р°РЅРґР°СЂС‚РЅС‹Р№ timeout РґР»СЏ API Р·Р°РїСЂРѕСЃРѕРІ

---

## 11. Р’РѕР·РјРѕР¶РЅС‹Рµ СѓР»СѓС‡С€РµРЅРёСЏ

1. **РљСЌС€РёСЂРѕРІР°РЅРёРµ РІ РїР°РјСЏС‚Рё** - СЃРѕС…СЂР°РЅСЏС‚СЊ РґР°РЅРЅС‹Рµ Рѕ РїСѓР±Р»РёРєР°С†РёРё РЅР° СѓСЂРѕРІРЅРµ store
2. **Batch loading** - РїСЂРё РѕС‚РєСЂС‹С‚РёРё РЅРµСЃРєРѕР»СЊРєРёС… РїСЂРѕРµРєС‚РѕРІ Р·Р°РіСЂСѓР¶Р°С‚СЊ РїСѓР±Р»РёРєР°С†РёРё РѕРґРЅРёРј Р·Р°РїСЂРѕСЃРѕРј
3. **WebSocket updates** - РµСЃР»Рё РїСѓР±Р»РёРєР°С†РёСЏ РѕР±РЅРѕРІР»РµРЅР° РІ РґСЂСѓРіРѕР№ РІРєР»Р°РґРєРµ, РѕР±РЅРѕРІРёС‚СЊ РІ СЂРµР°Р»СЊРЅРѕРј РІСЂРµРјРµРЅРё
4. **Optimistic UI** - РїРѕРєР°Р·Р°С‚СЊ UI РёР·РјРµРЅРµРЅРёР№ РґРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ СЃРµСЂРІРµСЂРѕРј
5. **Error boundaries** - Р±РѕР»РµРµ graceful РѕР±СЂР°Р±РѕС‚РєР° РѕС€РёР±РѕРє Р·Р°РіСЂСѓР·РєРё

