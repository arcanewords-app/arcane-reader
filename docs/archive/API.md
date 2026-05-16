---
stale: true
status: archived
domain: meta
---

# API Reference

## Р‘Р°Р·РѕРІС‹Р№ URL

- **Development**: `http://localhost:3000`
- **Production**: `https://your-domain.com`

## РђСѓС‚РµРЅС‚РёС„РёРєР°С†РёСЏ

Р‘РѕР»СЊС€РёРЅСЃС‚РІРѕ endpoints С‚СЂРµР±СѓСЋС‚ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРё. РСЃРїРѕР»СЊР·СѓР№С‚Рµ JWT С‚РѕРєРµРЅ РІ Р·Р°РіРѕР»РѕРІРєРµ:

```
Authorization: Bearer <token>
```

РўРѕРєРµРЅ РїРѕР»СѓС‡Р°РµС‚СЃСЏ С‡РµСЂРµР· `/api/auth/login` РёР»Рё `/api/auth/register`.

## Endpoints

### РђСѓС‚РµРЅС‚РёС„РёРєР°С†РёСЏ

#### POST `/api/auth/register`

Р РµРіРёСЃС‚СЂР°С†РёСЏ РЅРѕРІРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**:
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com"
  }
}
```

#### POST `/api/auth/login`

Р’С…РѕРґ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response**:
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com"
  },
  "session": {
    "access_token": "jwt-token",
    "refresh_token": "refresh-token",
    "expires_at": "2024-01-01T00:00:00Z"
  }
}
```

#### POST `/api/auth/logout`

Р’С‹С…РѕРґ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.

**Response**:
```json
{
  "success": true
}
```

#### GET `/api/auth/me`

РџРѕР»СѓС‡РёС‚СЊ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com"
  }
}
```

### РЎРёСЃС‚РµРјР°

#### GET `/api/status`

РџРѕР»СѓС‡РёС‚СЊ СЃС‚Р°С‚СѓСЃ СЃРёСЃС‚РµРјС‹.

**Response**:
```json
{
  "version": "0.1.0",
  "ready": true,
  "ai": {
    "provider": "OpenAI",
    "model": "gpt-4-turbo-preview",
    "configured": true
  },
  "config": {
    "valid": true,
    "errors": []
  },
  "storage": "supabase"
}
```

### РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ С‚РѕРєРµРЅРѕРІ

#### GET `/api/user/token-usage`

РџРѕР»СѓС‡РёС‚СЊ С‚РµРєСѓС‰РµРµ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ С‚РѕРєРµРЅРѕРІ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ Р·Р° СЃРµРіРѕРґРЅСЏ.

**Headers**: `Authorization: Bearer <token>`

**Query Parameters** (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ):
- `date` - Р”Р°С‚Р° РІ С„РѕСЂРјР°С‚Рµ YYYY-MM-DD (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ СЃРµРіРѕРґРЅСЏ)

**Response**:
```json
{
  "date": "2026-01-29",
  "tokensUsed": 12500,
  "tokensLimit": 50000,
  "tokensRemaining": 37500,
  "percentageUsed": 25,
  "tokensByStage": {
    "analysis": 2000,
    "translation": 5000,
    "editing": 5500
  },
  "warning": false
}
```

#### GET `/api/user/token-usage/history`

РџРѕР»СѓС‡РёС‚СЊ РёСЃС‚РѕСЂРёСЋ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ С‚РѕРєРµРЅРѕРІ Р·Р° РїРѕСЃР»РµРґРЅРёРµ N РґРЅРµР№.

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
- `days` (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ, РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ `7`) - РљРѕР»РёС‡РµСЃС‚РІРѕ РґРЅРµР№ РёСЃС‚РѕСЂРёРё

**Response**:
```json
{
  "history": [
    {
      "date": "2026-01-29",
      "tokensUsed": 12500,
      "tokensLimit": 50000
    },
    {
      "date": "2026-01-28",
      "tokensUsed": 48000,
      "tokensLimit": 50000
    }
  ]
}
```

### РџСЂРѕРµРєС‚С‹

#### GET `/api/projects`

РџРѕР»СѓС‡РёС‚СЊ СЃРїРёСЃРѕРє РІСЃРµС… РїСЂРѕРµРєС‚РѕРІ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
[
  {
    "id": "project-id",
    "name": "Project Name",
    "type": "book",
    "chapterCount": 10,
    "translatedCount": 5,
    "glossaryCount": 20,
    "originalReadingMode": false,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "metadata": {
      "title": "Book Title",
      "coverImageUrl": "https://..."
    }
  }
]
```

#### POST `/api/projects`

РЎРѕР·РґР°С‚СЊ РЅРѕРІС‹Р№ РїСЂРѕРµРєС‚.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "name": "Project Name",
  "sourceLanguage": "en",
  "targetLanguage": "ru"
}
```

**Response**: РџРѕР»РЅС‹Р№ РѕР±СЉРµРєС‚ РїСЂРѕРµРєС‚Р°

#### GET `/api/projects/:id`

РџРѕР»СѓС‡РёС‚СЊ РїСЂРѕРµРєС‚ РїРѕ ID.

**Headers**: `Authorization: Bearer <token>`

**Response**: РџРѕР»РЅС‹Р№ РѕР±СЉРµРєС‚ РїСЂРѕРµРєС‚Р° СЃРѕ РІСЃРµРјРё РіР»Р°РІР°РјРё Рё РіР»РѕСЃСЃР°СЂРёРµРј

#### DELETE `/api/projects/:id`

РЈРґР°Р»РёС‚СЊ РїСЂРѕРµРєС‚.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true
}
```

#### PUT `/api/projects/:id/settings`

РћР±РЅРѕРІРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё РїСЂРѕРµРєС‚Р°.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "stageModels": {
    "analysis": "gpt-4o-mini",
    "translation": "gpt-4-turbo-preview",
    "editing": "gpt-4o-mini"
  },
  "temperature": 0.7,
  "enableAnalysis": true,
  "enableTranslation": true,
  "enableEditing": true,
  "originalReadingMode": false
}
```

**Response**: РћР±РЅРѕРІР»РµРЅРЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё

### Р“Р»Р°РІС‹

#### POST `/api/projects/:id/chapters`

Р—Р°РіСЂСѓР·РёС‚СЊ РіР»Р°РІСѓ РІ РїСЂРѕРµРєС‚.

**Headers**: `Authorization: Bearer <token>`

**Request**: `multipart/form-data`
- `file`: Р¤Р°Р№Р» (TXT, EPUB, FB2)

**Response**:
```json
{
  "id": "chapter-id",
  "number": 1,
  "title": "Chapter Title",
  "originalText": "...",
  "paragraphs": [...],
  "status": "pending"
}
```

РР»Рё РґР»СЏ РјРЅРѕР¶РµСЃС‚РІРµРЅРЅС‹С… РіР»Р°РІ (EPUB/FB2):
```json
{
  "chapters": [...],
  "count": 5,
  "warnings": []
}
```

#### GET `/api/projects/:projectId/chapters/:chapterId`

РџРѕР»СѓС‡РёС‚СЊ РіР»Р°РІСѓ.

**Headers**: `Authorization: Bearer <token>`

**Response**: РџРѕР»РЅС‹Р№ РѕР±СЉРµРєС‚ РіР»Р°РІС‹

#### DELETE `/api/projects/:projectId/chapters/:chapterId`

РЈРґР°Р»РёС‚СЊ РіР»Р°РІСѓ.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true
}
```

#### PUT `/api/projects/:projectId/chapters/:chapterId/title`

РћР±РЅРѕРІРёС‚СЊ РЅР°Р·РІР°РЅРёРµ РіР»Р°РІС‹.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "title": "New Chapter Title"
}
```

**Response**: РћР±РЅРѕРІР»РµРЅРЅР°СЏ РіР»Р°РІР°

#### PUT `/api/projects/:projectId/chapters/:chapterId/number`

РР·РјРµРЅРёС‚СЊ РЅРѕРјРµСЂ РіР»Р°РІС‹.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "number": 5
}
```

**Response**: РћР±РЅРѕРІР»РµРЅРЅС‹Р№ РїСЂРѕРµРєС‚ СЃРѕ РІСЃРµРјРё РіР»Р°РІР°РјРё

### РџРµСЂРµРІРѕРґ

#### POST `/api/projects/:projectId/chapters/:chapterId/translate`

Р—Р°РїСѓСЃС‚РёС‚СЊ РїРµСЂРµРІРѕРґ РіР»Р°РІС‹.

**Headers**: `Authorization: Bearer <token>`

**Request Body** (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ):
```json
{
  "translateOnlyEmpty": false
}
```

**Response** (СѓСЃРїРµС…):
```json
{
  "status": "started",
  "chapterId": "chapter-id"
}
```

**Response** (РїСЂРµРІС‹С€РµРЅ Р»РёРјРёС‚ С‚РѕРєРµРЅРѕРІ - HTTP 429):
```json
{
  "error": "Token limit exceeded",
  "message": "Р”РЅРµРІРЅРѕР№ Р»РёРјРёС‚ С‚РѕРєРµРЅРѕРІ РёСЃС‡РµСЂРїР°РЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ Р·Р°РІС‚СЂР°.",
  "currentUsage": 50000,
  "limit": 50000,
  "estimatedTokens": 25000,
  "resetAt": "2026-01-30T00:00:00Z"
}
```

**РџСЂРёРјРµС‡Р°РЅРёСЏ**:
- РџРµСЂРµРІРѕРґ РІС‹РїРѕР»РЅСЏРµС‚СЃСЏ Р°СЃРёРЅС…СЂРѕРЅРЅРѕ. РЎС‚Р°С‚СѓСЃ РіР»Р°РІС‹ РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ С‡РµСЂРµР· `status` РїРѕР»Рµ.
- РџРµСЂРµРґ Р·Р°РїСѓСЃРєРѕРј РїРµСЂРµРІРѕРґР° РїСЂРѕРІРµСЂСЏРµС‚СЃСЏ РґРЅРµРІРЅРѕР№ Р»РёРјРёС‚ С‚РѕРєРµРЅРѕРІ (50,000 С‚РѕРєРµРЅРѕРІ РІ РґРµРЅСЊ).
- Р•СЃР»Рё Р»РёРјРёС‚ РїСЂРµРІС‹С€РµРЅ, РІРѕР·РІСЂР°С‰Р°РµС‚СЃСЏ РѕС€РёР±РєР° 429 Рё РїРµСЂРµРІРѕРґ РЅРµ Р·Р°РїСѓСЃРєР°РµС‚СЃСЏ.
- РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ С‚РѕРєРµРЅРѕРІ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ РїРѕСЃР»Рµ СѓСЃРїРµС€РЅРѕРіРѕ Р·Р°РІРµСЂС€РµРЅРёСЏ РїРµСЂРµРІРѕРґР°.

#### POST `/api/projects/:projectId/chapters/:chapterId/translate/cancel`

РћС‚РјРµРЅРёС‚СЊ РїРµСЂРµРІРѕРґ (СЃР±СЂРѕСЃРёС‚СЊ СЃС‚Р°С‚СѓСЃ `translating` в†’ `pending`).

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "message": "Translation cancelled"
}
```

#### POST `/api/projects/:projectId/chapters/:chapterId/translate/sync`

Р СѓС‡РЅР°СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ РїРµСЂРµРІРµРґРµРЅРЅС‹С… С‡Р°РЅРєРѕРІ СЃ РїР°СЂР°РіСЂР°С„Р°РјРё (РґР»СЏ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ).

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "message": "Translation synchronized",
  "syncedParagraphs": 50,
  "totalParagraphs": 100,
  "recovered": true
}
```

#### POST `/api/projects/:projectId/chapters/:chapterId/upload-translation`

Р—Р°РіСЂСѓР·РёС‚СЊ РіРѕС‚РѕРІС‹Р№ РїРµСЂРµРІРѕРґ РіР»Р°РІС‹ (Р±РµР· РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ AI). РўРµРєСЃС‚ СЂР°Р·Р±РёРІР°РµС‚СЃСЏ РїРѕ Р°Р±Р·Р°С†Р°Рј (`\n\n`) Рё СЃРѕРїРѕСЃС‚Р°РІР»СЏРµС‚СЃСЏ СЃ РїР°СЂР°РіСЂР°С„Р°РјРё.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "translatedText": "РўРµРєСЃС‚ РїРµСЂРµРІРѕРґР°..."
}
```

**Response** (СѓСЃРїРµС…): РїРѕР»РЅС‹Р№ РѕР±СЉРµРєС‚ РіР»Р°РІС‹ (Chapter) СЃ РѕР±РЅРѕРІР»С‘РЅРЅС‹РјРё РїР°СЂР°РіСЂР°С„Р°РјРё Рё `status: "completed"`.

**Response** (РѕС€РёР±РєРё):
- `400` вЂ” РіР»Р°РІР° РІ РїСЂРѕС†РµСЃСЃРµ РїРµСЂРµРІРѕРґР°, РЅРµС‚ РїР°СЂР°РіСЂР°С„РѕРІ РёР»Рё РїСѓСЃС‚РѕР№ С‚РµРєСЃС‚
- `404` вЂ” РїСЂРѕРµРєС‚ РёР»Рё РіР»Р°РІР° РЅРµ РЅР°Р№РґРµРЅС‹

**РџСЂРёРјРµС‡Р°РЅРёСЏ**:
- РўРѕРєРµРЅС‹ РЅРµ СЃРїРёСЃС‹РІР°СЋС‚СЃСЏ.
- РЎСѓС‰РµСЃС‚РІСѓСЋС‰РёР№ РїРµСЂРµРІРѕРґ РїРѕР»РЅРѕСЃС‚СЊСЋ Р·Р°РјРµРЅСЏРµС‚СЃСЏ.
- `translationMeta.source` СѓСЃС‚Р°РЅР°РІР»РёРІР°РµС‚СЃСЏ РІ `"uploaded"`.

#### POST `/api/projects/:projectId/chapters/:chapterId/mark-as-translated`

РџРѕРјРµС‚РёС‚СЊ РіР»Р°РІСѓ РєР°Рє РїРµСЂРµРІРµРґС‘РЅРЅСѓСЋ. РўРµРєСѓС‰РёР№ С‚РµРєСЃС‚ РіР»Р°РІС‹ (РІ `originalText`) С‚СЂР°РєС‚СѓРµС‚СЃСЏ РєР°Рє РіРѕС‚РѕРІС‹Р№ РїРµСЂРµРІРѕРґ Рё РєРѕРїРёСЂСѓРµС‚СЃСЏ РІ `translatedText`. РћРґРёРЅ РєР»РёРє, Р±РµР· РІРІРѕРґР° С‚РµРєСЃС‚Р°.

**Headers**: `Authorization: Bearer <token>`

**Request Body**: РЅРµС‚

**Response** (СѓСЃРїРµС…): РїРѕР»РЅС‹Р№ РѕР±СЉРµРєС‚ РіР»Р°РІС‹ (Chapter) СЃ `status: "completed"` Рё `translationMeta.source: "uploaded"`.

**Response** (РѕС€РёР±РєРё):
- `400` вЂ” РіР»Р°РІР° РІ РїСЂРѕС†РµСЃСЃРµ РїРµСЂРµРІРѕРґР° РёР»Рё РЅРµС‚ РїР°СЂР°РіСЂР°С„РѕРІ
- `404` вЂ” РїСЂРѕРµРєС‚ РёР»Рё РіР»Р°РІР° РЅРµ РЅР°Р№РґРµРЅС‹

**РџСЂРёРјРµС‡Р°РЅРёСЏ**:
- РўРѕРєРµРЅС‹ РЅРµ СЃРїРёСЃС‹РІР°СЋС‚СЃСЏ.
- РўРµРєСЃС‚ РёР· `originalText` РєРѕРїРёСЂСѓРµС‚СЃСЏ РІ `translatedText`, `originalText` РѕС‡РёС‰Р°РµС‚СЃСЏ.

### РџР°СЂР°РіСЂР°С„С‹

#### PUT `/api/projects/:projectId/chapters/:chapterId/paragraphs/:paragraphId`

РћР±РЅРѕРІРёС‚СЊ РїР°СЂР°РіСЂР°С„.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "translatedText": "РџРµСЂРµРІРµРґРµРЅРЅС‹Р№ С‚РµРєСЃС‚",
  "status": "edited"
}
```

**Response**: РћР±РЅРѕРІР»РµРЅРЅС‹Р№ РїР°СЂР°РіСЂР°С„

#### POST `/api/projects/:projectId/chapters/:chapterId/paragraphs/bulk-status`

РњР°СЃСЃРѕРІРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ СЃС‚Р°С‚СѓСЃРѕРІ РїР°СЂР°РіСЂР°С„РѕРІ.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "paragraphIds": ["id1", "id2", "id3"],
  "status": "approved"
}
```

**Response**:
```json
{
  "updated": 3,
  "paragraphs": [...]
}
```

#### GET `/api/projects/:projectId/chapters/:chapterId/stats`

РџРѕР»СѓС‡РёС‚СЊ СЃС‚Р°С‚РёСЃС‚РёРєСѓ РїРѕ РїР°СЂР°РіСЂР°С„Р°Рј РіР»Р°РІС‹.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "total": 100,
  "pending": 20,
  "translated": 50,
  "edited": 25,
  "approved": 5,
  "progress": 80
}
```

### Р“Р»РѕСЃСЃР°СЂРёР№

#### GET `/api/projects/:id/glossary`

РџРѕР»СѓС‡РёС‚СЊ РіР»РѕСЃСЃР°СЂРёР№ РїСЂРѕРµРєС‚Р°.

**Headers**: `Authorization: Bearer <token>`

**Response**: РњР°СЃСЃРёРІ Р·Р°РїРёСЃРµР№ РіР»РѕСЃСЃР°СЂРёСЏ

#### POST `/api/projects/:id/glossary`

Р”РѕР±Р°РІРёС‚СЊ Р·Р°РїРёСЃСЊ РІ РіР»РѕСЃСЃР°СЂРёР№.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "type": "character",
  "original": "John",
  "translated": "Р”Р¶РѕРЅ",
  "gender": "male",
  "description": "Main character",
  "notes": "User notes"
}
```

**Response**: РЎРѕР·РґР°РЅРЅР°СЏ Р·Р°РїРёСЃСЊ

#### PUT `/api/projects/:projectId/glossary/:entryId`

РћР±РЅРѕРІРёС‚СЊ Р·Р°РїРёСЃСЊ РіР»РѕСЃСЃР°СЂРёСЏ.

**Headers**: `Authorization: Bearer <token>`

**Request Body**: Р§Р°СЃС‚РёС‡РЅС‹Рµ РїРѕР»СЏ РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ

**Response**: РћР±РЅРѕРІР»РµРЅРЅР°СЏ Р·Р°РїРёСЃСЊ

#### DELETE `/api/projects/:projectId/glossary/:entryId`

РЈРґР°Р»РёС‚СЊ Р·Р°РїРёСЃСЊ РіР»РѕСЃСЃР°СЂРёСЏ.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true
}
```

#### POST `/api/projects/:projectId/glossary/:entryId/image`

Р—Р°РіСЂСѓР·РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РґР»СЏ Р·Р°РїРёСЃРё РіР»РѕСЃСЃР°СЂРёСЏ.

**Headers**: `Authorization: Bearer <token>`

**Request**: `multipart/form-data`
- `image`: Р¤Р°Р№Р» РёР·РѕР±СЂР°Р¶РµРЅРёСЏ (JPEG, PNG, GIF, WebP)

**Response**:
```json
{
  "imageUrl": "https://...",
  "imageUrls": ["https://..."],
  "entry": {...}
}
```

#### DELETE `/api/projects/:projectId/glossary/:entryId/image/:imageIndex`

РЈРґР°Р»РёС‚СЊ РєРѕРЅРєСЂРµС‚РЅРѕРµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РёР· РіР°Р»РµСЂРµРё.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "imageUrls": [...]
}
```

### РћР±Р»РѕР¶РєРё РїСЂРѕРµРєС‚РѕРІ

#### POST `/api/projects/:projectId/cover`

Р—Р°РіСЂСѓР·РёС‚СЊ РѕР±Р»РѕР¶РєСѓ РїСЂРѕРµРєС‚Р°.

**Headers**: `Authorization: Bearer <token>`

**Request**: `multipart/form-data`
- `image`: Р¤Р°Р№Р» РёР·РѕР±СЂР°Р¶РµРЅРёСЏ

**Response**:
```json
{
  "coverImageUrl": "https://...",
  "project": {...}
}
```

#### DELETE `/api/projects/:projectId/cover`

РЈРґР°Р»РёС‚СЊ РѕР±Р»РѕР¶РєСѓ РїСЂРѕРµРєС‚Р°.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "success": true,
  "project": {...}
}
```

### РќР°СЃС‚СЂРѕР№РєРё С‡С‚РµРЅРёСЏ

#### GET `/api/projects/:id/settings/reader`

РџРѕР»СѓС‡РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё С‡С‚РµРЅРёСЏ.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "fontFamily": "literary",
  "fontSize": 18,
  "lineHeight": 1.7,
  "colorScheme": "dark",
  "paragraphSpacing": 1.2
}
```

#### PUT `/api/projects/:id/settings/reader`

РћР±РЅРѕРІРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё С‡С‚РµРЅРёСЏ.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "fontFamily": "serif",
  "fontSize": 20,
  "lineHeight": 1.8,
  "colorScheme": "light",
  "paragraphSpacing": 1.5
}
```

**Response**: РћР±РЅРѕРІР»РµРЅРЅС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё

### Р­РєСЃРїРѕСЂС‚

#### POST `/api/projects/:id/export`

Р­РєСЃРїРѕСЂС‚РёСЂРѕРІР°С‚СЊ РїСЂРѕРµРєС‚ РІ EPUB РёР»Рё FB2.

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "format": "epub",
  "author": "Author Name"
}
```

**Response**: Р¤Р°Р№Р» (binary)

**Content-Type**: 
- `application/epub+zip` РґР»СЏ EPUB
- `application/xml` РґР»СЏ FB2

### РџСѓР±Р»РёРєР°С†РёРё (РєР°С‚Р°Р»РѕРі)

#### GET `/api/publications`

РЎРїРёСЃРѕРє РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅС‹С… РїСЂРѕРёР·РІРµРґРµРЅРёР№ (РїСѓР±Р»РёС‡РЅС‹Р№, Р±РµР· Р°РІС‚РѕСЂРёР·Р°С†РёРё).

**Query Parameters** (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ):
- `limit` вЂ” Р»РёРјРёС‚ (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ 50, РјР°РєСЃ. 100)
- `offset` вЂ” СЃРјРµС‰РµРЅРёРµ
- `orderBy` вЂ” `published_at` (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ) РёР»Рё `created_at`
- `orderAsc` вЂ” `true` РґР»СЏ РІРѕР·СЂР°СЃС‚Р°РЅРёСЏ

**Response**: РјР°СЃСЃРёРІ РєР°СЂС‚РѕС‡РµРє РїСѓР±Р»РёРєР°С†РёР№ (id, projectId, status, title, description, coverImageUrl, authorDisplay, sourceLanguage, targetLanguage, publishedAt, createdAt, updatedAt).

#### GET `/api/publications/:id`

РћРґРЅР° РїСѓР±Р»РёРєР°С†РёСЏ РїРѕ ID (РїСѓР±Р»РёС‡РЅС‹Р№).

**Response**: РѕР±СЉРµРєС‚ РїСѓР±Р»РёРєР°С†РёРё.

#### GET `/api/publications/:id/chapters`

РџСѓР±Р»РёРєР°С†РёСЏ СЃРѕ СЃРїРёСЃРєРѕРј РіР»Р°РІ (РґР»СЏ СЃС‚СЂР°РЅРёС†С‹ С‡С‚РµРЅРёСЏ). РџСѓР±Р»РёС‡РЅС‹Р№.

**Response**:
```json
{
  "publication": { ... },
  "chapters": [
    { "id": "...", "number": 1, "title": "...", "hasTranslation": true }
  ]
}
```

#### GET `/api/publications/:id/chapters/:chapterId`

РљРѕРЅС‚РµРЅС‚ РѕРґРЅРѕР№ РіР»Р°РІС‹ РґР»СЏ СЂРµР¶РёРјР° С‡С‚РµРЅРёСЏ (С‚РѕР»СЊРєРѕ РїРµСЂРµРІРµРґС‘РЅРЅС‹Р№ С‚РµРєСЃС‚). РџСѓР±Р»РёС‡РЅС‹Р№.

**Response**:
```json
{
  "id": "...",
  "number": 1,
  "title": "...",
  "translatedText": "..."
}
```

#### POST `/api/projects/:projectId/publish`

РћРїСѓР±Р»РёРєРѕРІР°С‚СЊ РїСЂРѕРµРєС‚ (С‚СЂРµР±СѓРµС‚СЃСЏ Р°РІС‚РѕСЂРёР·Р°С†РёСЏ).

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "status": "published",
  "title": "РќР°Р·РІР°РЅРёРµ РґР»СЏ РєР°С‚Р°Р»РѕРіР°",
  "description": "РљСЂР°С‚РєРѕРµ РѕРїРёСЃР°РЅРёРµ",
  "coverImageUrl": "https://...",
  "authorDisplay": "РРјСЏ Р°РІС‚РѕСЂР°"
}
```

**Response**: РѕР±СЉРµРєС‚ РїСѓР±Р»РёРєР°С†РёРё.

#### DELETE `/api/projects/:projectId/publish`

РЎРЅСЏС‚СЊ СЃ РїСѓР±Р»РёРєР°С†РёРё (С‚СЂРµР±СѓРµС‚СЃСЏ Р°РІС‚РѕСЂРёР·Р°С†РёСЏ).

**Headers**: `Authorization: Bearer <token>`

**Response**: `{ "success": true }`

#### GET `/api/user/publications`

РЎРїРёСЃРѕРє РїСѓР±Р»РёРєР°С†РёР№ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (РІСЃРµ СЃС‚Р°С‚СѓСЃС‹). РўСЂРµР±СѓРµС‚СЃСЏ Р°РІС‚РѕСЂРёР·Р°С†РёСЏ.

**Response**: РјР°СЃСЃРёРІ РїСѓР±Р»РёРєР°С†РёР№.

#### GET `/api/projects/:projectId/publication`

РџСѓР±Р»РёРєР°С†РёСЏ РїРѕ РїСЂРѕРµРєС‚Сѓ (С‚РѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†). РўСЂРµР±СѓРµС‚СЃСЏ Р°РІС‚РѕСЂРёР·Р°С†РёСЏ.

**Response**: РѕР±СЉРµРєС‚ РїСѓР±Р»РёРєР°С†РёРё РёР»Рё 404.

## РљРѕРґС‹ РѕС€РёР±РѕРє

- `400` вЂ” РќРµРІРµСЂРЅС‹Р№ Р·Р°РїСЂРѕСЃ
- `401` вЂ” РќРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ
- `404` вЂ” Р РµСЃСѓСЂСЃ РЅРµ РЅР°Р№РґРµРЅ
- `500` вЂ” Р’РЅСѓС‚СЂРµРЅРЅСЏСЏ РѕС€РёР±РєР° СЃРµСЂРІРµСЂР°

## Р¤РѕСЂРјР°С‚С‹ РѕС€РёР±РѕРє

```json
{
  "error": "Error message",
  "details": "Additional details"
}
```
