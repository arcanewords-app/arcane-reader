---
stale: true
status: archived
domain: meta
---

# РџСЂРѕРІРµСЂРєР° Рё РјРёРіСЂР°С†РёСЏ Р‘Р” РґР»СЏ СЃС‚Р°С‚СѓСЃР° РіР»Р°РІ `draft`

РЎС‚Р°С‚СѓСЃ `draft` (С‡РµСЂРЅРѕРІРёРє РїРµСЂРµРІРѕРґР° Р±РµР· СЂРµРґР°РєС‚СѓСЂС‹) РґРѕР±Р°РІР»РµРЅ РІ РїСЂРёР»РѕР¶РµРЅРёРµ. Р§С‚РѕР±С‹ Р‘Р” РµРіРѕ РїСЂРёРЅРёРјР°Р»Р°, РЅСѓР¶РЅРѕ РїСЂРѕРІРµСЂРёС‚СЊ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ РЅР° РєРѕР»РѕРЅРєСѓ `chapters.status`.

---

## 1. РљР°РєРѕРµ С…СЂР°РЅРёР»РёС‰Рµ Сѓ РІР°СЃ

- **Р›РѕРєР°Р»СЊРЅС‹Рµ JSON-С„Р°Р№Р»С‹** (РєР°С‚Р°Р»РѕРі `PROJECTS_DIR`, Р±РµР· Supabase): РѕРіСЂР°РЅРёС‡РµРЅРёР№ РЅР° Р·РЅР°С‡РµРЅРёРµ `status` РЅРµС‚, РјРµРЅСЏС‚СЊ РЅРёС‡РµРіРѕ РЅРµ РЅСѓР¶РЅРѕ.
- **Supabase (PostgreSQL)**: РєРѕР»РѕРЅРєР° `chapters.status` РјРѕР¶РµС‚ Р±С‹С‚СЊ РѕРіСЂР°РЅРёС‡РµРЅР° `CHECK` РёР»Рё С‚РёРїРѕРј `enum`. РўРѕРіРґР° Р·РЅР°С‡РµРЅРёРµ `'draft'` РЅСѓР¶РЅРѕ СЏРІРЅРѕ СЂР°Р·СЂРµС€РёС‚СЊ.

Р’ РєРѕРґРµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ Supabase, РµСЃР»Рё РЅР°СЃС‚СЂРѕРµРЅС‹ `SUPABASE_URL` Рё РєР»СЋС‡Рё (СЃРј. [DEPLOYMENT.md](./DEPLOYMENT.md)).

---

## 2. РљР°Рє РїСЂРѕРІРµСЂРёС‚СЊ Supabase

### Р’Р°СЂРёР°РЅС‚ A: Р§РµСЂРµР· SQL Editor РІ Supabase Dashboard

1. РћС‚РєСЂРѕР№С‚Рµ **Supabase Dashboard** в†’ РІР°С€ РїСЂРѕРµРєС‚ в†’ **SQL Editor**.
2. Р’С‹РїРѕР»РЅРёС‚Рµ Р·Р°РїСЂРѕСЃ вЂ” РµСЃС‚СЊ Р»Рё РѕРіСЂР°РЅРёС‡РµРЅРёСЏ РЅР° `chapters.status`:

```sql
-- РћРіСЂР°РЅРёС‡РµРЅРёСЏ РЅР° С‚Р°Р±Р»РёС†Сѓ chapters (CHECK, РІ С‚.С‡. РїРѕ status)
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.chapters'::regclass
  AND contype = 'c';
```

Р•СЃР»Рё РІ СЂРµР·СѓР»СЊС‚Р°С‚Рµ РµСЃС‚СЊ СЃС‚СЂРѕРєР° СЃ РѕРїСЂРµРґРµР»РµРЅРёРµРј, РіРґРµ СѓРїРѕРјРёРЅР°РµС‚СЃСЏ `status` (РЅР°РїСЂРёРјРµСЂ `(status = ANY (ARRAY['pending'::text, 'translating'::text, ...]))`), Р·РЅР°С‡РёС‚ СЃРїРёСЃРѕРє РґРѕРїСѓСЃС‚РёРјС‹С… Р·РЅР°С‡РµРЅРёР№ Р·Р°РґР°РЅ вЂ” РІ РЅРµРіРѕ РЅСѓР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ `'draft'`.

Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅРѕ РјРѕР¶РЅРѕ РїРѕСЃРјРѕС‚СЂРµС‚СЊ С‚РёРї РєРѕР»РѕРЅРєРё:

```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'chapters' AND column_name = 'status';
```

Р•СЃР»Рё `data_type = 'USER-DEFINED'` Рё `udt_name` вЂ” РёРјСЏ enum (РЅР°РїСЂРёРјРµСЂ `chapter_status`), С‚Рѕ СЌС‚РѕС‚ enum РЅСѓР¶РЅРѕ СЂР°СЃС€РёСЂРёС‚СЊ Р·РЅР°С‡РµРЅРёРµРј `draft`.

### Р’Р°СЂРёР°РЅС‚ B: РџСЂРѕР±РЅС‹Р№ UPDATE

Р’ **SQL Editor** РІС‹РїРѕР»РЅРёС‚Рµ (РїРѕРґСЃС‚Р°РІСЊС‚Рµ СЂРµР°Р»СЊРЅС‹Р№ `id` Р»СЋР±РѕР№ РіР»Р°РІС‹):

```sql
-- Р’СЂРµРјРµРЅРЅРѕ РѕР±РЅРѕРІРёС‚СЊ РѕРґРЅСѓ РіР»Р°РІСѓ РІ draft (РґР»СЏ РїСЂРѕРІРµСЂРєРё)
UPDATE public.chapters SET status = 'draft' WHERE id = 'РєР°РєРѕР№-РЅРёР±СѓРґСЊ-uuid-РіР»Р°РІС‹' RETURNING id, status;
```

- **РЈСЃРїРµС…**: РѕРіСЂР°РЅРёС‡РµРЅРёР№, РјРµС€Р°СЋС‰РёС… `draft`, РЅРµС‚ (РёР»Рё РѕРЅРё СѓР¶Рµ РІРєР»СЋС‡Р°СЋС‚ `draft`). РњРѕР¶РЅРѕ РѕС‚РєР°С‚РёС‚СЊ: `UPDATE public.chapters SET status = 'pending' WHERE id = '...';`
- **РћС€РёР±РєР°** РІРёРґР° `new row for relation "chapters" violates check constraint` РёР»Рё `invalid input value for enum` вЂ” РЅСѓР¶РЅРѕ РїСЂРёРјРµРЅРёС‚СЊ РјРёРіСЂР°С†РёСЋ РёР· СЂР°Р·РґРµР»Р° 3.

---

## 3. РњРёРіСЂР°С†РёСЏ: СЂР°Р·СЂРµС€РёС‚СЊ `draft`

РџСЂРёРјРµРЅСЏР№С‚Рµ РІ **Supabase SQL Editor** РІ РїРѕСЂСЏРґРєРµ РЅРёР¶Рµ.

### РЎР»СѓС‡Р°Р№ 1: CHECK-РѕРіСЂР°РЅРёС‡РµРЅРёРµ РЅР° `status`

РЈ РІР°СЃ РѕРіСЂР°РЅРёС‡РµРЅРёРµ РІРёРґР°  
`CHECK ((status = ANY (ARRAY['pending', 'translating', 'analyzed', 'completed', 'error'])))`  
вЂ” РІ РЅС‘Рј РЅРµС‚ `'draft'`. РќРёР¶Рµ РґРІР° РІР°СЂРёР°РЅС‚Р°.

**Р’Р°СЂРёР°РЅС‚ A: РѕРґРёРЅ СЃРєСЂРёРїС‚ (РЅР°Р№С‚Рё РёРјСЏ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ Рё Р·Р°РјРµРЅРёС‚СЊ)**

Р’С‹РїРѕР»РЅРёС‚Рµ РІ SQL Editor С†РµР»РёРєРѕРј:

```sql
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.chapters'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
  LIMIT 1;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.chapters DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE public.chapters ADD CONSTRAINT chapters_status_check
    CHECK (status IN ('pending', 'translating', 'analyzed', 'draft', 'completed', 'error'));
END $$;
```

**Р’Р°СЂРёР°РЅС‚ B: РїРѕ С€Р°РіР°Рј**

1. РЈР·РЅР°С‚СЊ РёРјСЏ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.chapters'::regclass AND contype = 'c';
```

2. РџРѕРґСЃС‚Р°РІРёС‚СЊ РїРѕР»СѓС‡РµРЅРЅРѕРµ РёРјСЏ РІРјРµСЃС‚Рѕ `РёРјСЏ_РѕРіСЂР°РЅРёС‡РµРЅРёСЏ` Рё РІС‹РїРѕР»РЅРёС‚СЊ:
```sql
ALTER TABLE public.chapters DROP CONSTRAINT РёРјСЏ_РѕРіСЂР°РЅРёС‡РµРЅРёСЏ;

ALTER TABLE public.chapters ADD CONSTRAINT chapters_status_check
  CHECK (status IN ('pending', 'translating', 'analyzed', 'draft', 'completed', 'error'));
```

### РЎР»СѓС‡Р°Р№ 2: РўРёРї ENUM РґР»СЏ `status`

Р•СЃР»Рё РєРѕР»РѕРЅРєР° РёРјРµРµС‚ С‚РёРї enum (РЅР°РїСЂРёРјРµСЂ `chapter_status`):

```sql
-- Р”РѕР±Р°РІРёС‚СЊ Р·РЅР°С‡РµРЅРёРµ РІ enum (PostgreSQL)
ALTER TYPE public.chapter_status ADD VALUE IF NOT EXISTS 'draft';
```

РРјСЏ С‚РёРїР° СЃРјРѕС‚СЂРёС‚Рµ РІ РІС‹РІРѕРґРµ `information_schema.columns` (РїРѕР»Рµ `udt_name`) РґР»СЏ РєРѕР»РѕРЅРєРё `chapters.status`.

### РЎР»СѓС‡Р°Р№ 3: РќРµС‚ РЅРё CHECK, РЅРё enum

Р•СЃР»Рё Р·Р°РїСЂРѕСЃ РёР· Рї. 2 РЅРµ РїРѕРєР°Р·Р°Р» РѕРіСЂР°РЅРёС‡РµРЅРёР№ Рё С‚РёРї РєРѕР»РѕРЅРєРё `text`/`varchar`, С‚Рѕ РјРµРЅСЏС‚СЊ РЅРёС‡РµРіРѕ РЅРµ РЅСѓР¶РЅРѕ вЂ” Р‘Р” СѓР¶Рµ РїСЂРёРјРµС‚ `'draft'`.

---

## 4. РџСЂРѕРІРµСЂРєР° РїРѕСЃР»Рµ РјРёРіСЂР°С†РёРё

1. РџРѕРІС‚РѕСЂРёС‚Рµ РїСЂРѕР±РЅС‹Р№ `UPDATE` РёР· Рї. 2 (Р’Р°СЂРёР°РЅС‚ B): РѕРґРЅР° РіР»Р°РІР° РІ `status = 'draft'` Р±РµР· РѕС€РёР±РєРё.
2. Р’ РїСЂРёР»РѕР¶РµРЅРёРё: Р·Р°РїСѓСЃС‚РёС‚Рµ РїРµСЂРµРІРѕРґ РіР»Р°РІС‹ СЃ РІРєР»СЋС‡С‘РЅРЅРѕР№ СЂРµРґР°РєС‚СѓСЂРѕР№; РїРѕСЃР»Рµ СЃС‚Р°РґРёРё РїРµСЂРµРІРѕРґР° (РґРѕ СЂРµРґР°РєС‚СѓСЂС‹) РіР»Р°РІР° РґРѕР»Р¶РЅР° СЃРѕС…СЂР°РЅСЏС‚СЊСЃСЏ СЃРѕ СЃС‚Р°С‚СѓСЃРѕРј В«Р§РµСЂРЅРѕРІРёРєВ» Рё РѕС‚РѕР±СЂР°Р¶Р°С‚СЊСЃСЏ РІ UI Р±РµР· РѕС€РёР±РѕРє.

---

## 5. РЎРІРѕРґРєР°

| РҐСЂР°РЅРёР»РёС‰Рµ        | Р”РµР№СЃС‚РІРёРµ |
|------------------|----------|
| РўРѕР»СЊРєРѕ JSON-С„Р°Р№Р»С‹ | РќРёС‡РµРіРѕ РЅРµ РґРµР»Р°С‚СЊ |
| Supabase, РєРѕР»РѕРЅРєР° Р±РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№ | РќРёС‡РµРіРѕ РЅРµ РґРµР»Р°С‚СЊ |
| Supabase, CHECK РЅР° `status` | Р”РѕР±Р°РІРёС‚СЊ `'draft'` РІ CHECK (СЃРј. Рї. 3, СЃР»СѓС‡Р°Р№ 1) |
| Supabase, enum РґР»СЏ `status` | Р”РѕР±Р°РІРёС‚СЊ Р·РЅР°С‡РµРЅРёРµ `'draft'` РІ enum (Рї. 3, СЃР»СѓС‡Р°Р№ 2) |

РЎРІСЏР·Р°РЅРЅС‹Рµ РґРѕРєСѓРјРµРЅС‚С‹: [ENGINE_REFACTOR_PLAN.md](./ENGINE_REFACTOR_PLAN.md) (Рї. 2.1 вЂ” С‡РµСЂРЅРѕРІРёРє РїРѕСЃР»Рµ Stage 2), [DEPLOYMENT.md](./DEPLOYMENT.md) (РЅР°СЃС‚СЂРѕР№РєР° Supabase).
