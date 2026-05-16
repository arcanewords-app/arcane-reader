---
stale: true
status: archived
domain: meta
---

# РљСЂР°С‚РєРѕРµ СЂРµР·СЋРјРµ: Publication Endpoint Flow

## Р§С‚Рѕ РїСЂРѕРёСЃС…РѕРґРёС‚ РїСЂРё РѕС‚РєСЂС‹С‚РёРё РїСЂРѕРµРєС‚Р°?

```
РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РѕС‚РєСЂС‹РІР°РµС‚ РїСЂРѕРµРєС‚
    в†“
[ProjectInfo РєРѕРјРїРѕРЅРµРЅС‚ РјРѕРЅС‚РёСЂСѓРµС‚СЃСЏ]
    в†“
useEffect РІС‹Р·С‹РІР°РµС‚ api.getProjectPublication(projectId)
    в†“
GET /api/projects/{projectId}/publication (С‚СЂРµР±СѓРµС‚ auth)
    в†“
[Server]
1. РџСЂРѕРІРµСЂСЏРµС‚ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёСЋ (requireAuth)
2. Р’С‹Р·С‹РІР°РµС‚ getPublicationByProjectId(projectId, userId, token)
    в†“
[Database]
SELECT * FROM publications 
WHERE project_id = {projectId} AND user_id = {userId}
    в†“
[Р РµР·СѓР»СЊС‚Р°С‚С‹]
- Р•СЃР»Рё РїСѓР±Р»РёРєР°С†РёСЏ РЅР°Р№РґРµРЅР° в†’ РїСЂРµРѕР±СЂР°Р·СѓРµС‚ РІ Publication РѕР±СЉРµРєС‚ в†’ РІРѕР·РІСЂР°С‰Р°РµС‚
- Р•СЃР»Рё РЅРµ РЅР°Р№РґРµРЅР° в†’ РІРѕР·РІСЂР°С‰Р°РµС‚ null (404)
    в†“
[Client UI]
- setPublication(pub) РѕР±РЅРѕРІР»СЏРµС‚ СЃРѕСЃС‚РѕСЏРЅРёРµ
- publicationLoading = false
- Р РµРЅРґРµСЂРёС‚СЃСЏ UI РІ Р·Р°РІРёСЃРёРјРѕСЃС‚Рё РѕС‚ СЃС‚Р°С‚СѓСЃР°:
  * Loading в†’ "Р—Р°РіСЂСѓР·РєР°..."
  * Published в†’ "РћРїСѓР±Р»РёРєРѕРІР°РЅРѕ" + РєРЅРѕРїРєРё View/Update/Unpublish
  * Draft/Unpublished в†’ "РќРµ РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ" + РєРЅРѕРїРєР° Publish
```

## РљР»СЋС‡РµРІС‹Рµ С‚РѕС‡РєРё

| РљРѕРјРїРѕРЅРµРЅС‚ | Р¤СѓРЅРєС†РёСЏ | РџРѕРІРµРґРµРЅРёРµ |
|-----------|---------|----------|
| **Client** | `api.getProjectPublication()` | GET Р·Р°РїСЂРѕСЃ, РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚ 404 РєР°Рє null |
| **Server** | GET `/api/projects/:projectId/publication` | РўСЂРµР±СѓРµС‚ auth, РІС‹Р·С‹РІР°РµС‚ DB С„СѓРЅРєС†РёСЋ |
| **Database** | `getPublicationByProjectId()` | SELECT СЃ С„РёР»СЊС‚СЂРѕРј РїРѕ projectId Рё userId |
| **Transform** | `transformPublicationFromDB()` | snake_case в†’ camelCase |
| **UI State** | `publication` | null = РЅРµ РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ, Publication РѕР±СЉРµРєС‚ = РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ |

## РЎС‚Р°С‚СѓСЃС‹ РїСѓР±Р»РёРєР°С†РёРё

- **draft** в†’ Р§РµСЂРЅРѕРІРёРє (РЅРµ РІРёРґРЅРѕ РІ РєР°С‚Р°Р»РѕРіРµ)
- **published** в†’ РћРїСѓР±Р»РёРєРѕРІР°РЅРѕ (РІРёРґРЅРѕ РІ РєР°С‚Р°Р»РѕРіРµ)
- **unpublished** в†’ РЎРЅСЏС‚Рѕ СЃ РїСѓР±Р»РёРєР°С†РёРё (Р±С‹Р»Рѕ РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ)

## Р’РѕР·РІСЂР°С‰Р°РµРјС‹Рµ РґР°РЅРЅС‹Рµ

```typescript
Publication {
  id: UUID,
  projectId: UUID,
  userId: UUID,
  status: 'draft' | 'published' | 'unpublished',
  title: string | null,
  description: string | null,
  coverImageUrl: string | null,
  authorDisplay: string | null,
  sourceLanguage: string,     // РёР· РїСЂРѕРµРєС‚Р°
  targetLanguage: string,     // РёР· РїСЂРѕРµРєС‚Р°
  publishedAt: ISO timestamp | null,  // РґР°С‚Р° РїРµСЂРІРѕР№ РїСѓР±Р»РёРєР°С†РёРё
  createdAt: ISO timestamp,
  updatedAt: ISO timestamp
}
```

## Р”РµР№СЃС‚РІРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ

**Р•СЃР»Рё РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ**:
- рџ‘ЃпёЏ **View** в†’ РѕС‚РєСЂС‹С‚СЊ РїСѓР±Р»РёС‡РЅСѓСЋ СЃС‚СЂР°РЅРёС†Сѓ `/p/{id}`
- вњЏпёЏ **Update** в†’ РёР·РјРµРЅРёС‚СЊ title/description (published_at РЅРµ РёР·РјРµРЅСЏРµС‚СЃСЏ)
- вќЊ **Unpublish** в†’ РёР·РјРµРЅРёС‚СЊ СЃС‚Р°С‚СѓСЃ РЅР° 'unpublished'

**Р•СЃР»Рё РЅРµ РѕРїСѓР±Р»РёРєРѕРІР°РЅРѕ**:
- рџ“ў **Publish** в†’ РѕС‚РєСЂС‹С‚СЊ РјРѕРґР°Р»СЊРЅРѕРµ РѕРєРЅРѕ (С‚СЂРµР±СѓРµС‚СЃСЏ min 1 РіР»Р°РІР°)

## РџСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚СЊ

- вљЎ Р‘С‹СЃС‚СЂРѕ: РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РёРЅРґРµРєСЃ РЅР° `project_id`
- рџ”„ РЎРёРЅС…СЂРѕРЅРЅС‹Р№: Р·Р°РіСЂСѓР¶Р°РµС‚СЃСЏ СЃ РѕСЃС‚Р°Р»СЊРЅС‹РјРё РґР°РЅРЅС‹РјРё РїСЂРѕРµРєС‚Р°
- рџ’ѕ РќРµС‚ РєСЌС€Р°: РєР°Р¶РґС‹Р№ СЂР°Р· Р·Р°РїСЂР°С€РёРІР°РµС‚ Р‘Р” РїСЂРё РѕС‚РєСЂС‹С‚РёРё РїСЂРѕРµРєС‚Р°
