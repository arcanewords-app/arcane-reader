---
stale: true
status: archived
domain: meta
---

# Р­РєСЃРїРѕСЂС‚ EPUB/FB2 вЂ” РїСѓС‚СЊ e2e Рё РёСЃРїСЂР°РІР»РµРЅРёРµ EROFS

## РџСѓС‚СЊ СЌРєСЃРїРѕСЂС‚Р° (e2e)

1. **Р¤СЂРѕРЅС‚**: РєРЅРѕРїРєР° В«Р­РєСЃРїРѕСЂС‚ EPUB/FB2В» в†’ `api.exportProject(projectId, format, author)`.
2. **API**: `POST /api/projects/:id/export` (requireAuth).
3. **РЎРµСЂРІРµСЂ** (`src/server.ts`):
   - `tmpDir = process.env.VERCEL ? '/tmp' : os.tmpdir()` (РЅР° Vercel С‚РѕР»СЊРєРѕ `/tmp` РґРѕСЃС‚СѓРїРµРЅ РґР»СЏ Р·Р°РїРёСЃРё).
   - РђРІС‚РѕРѕС‡РёСЃС‚РєР° СЃС‚Р°СЂС‹С… СЌРєСЃРїРѕСЂС‚РѕРІ РІ Supabase Storage (bucket `exports`) вЂ” РїРѕ РІРѕР·СЂР°СЃС‚Сѓ Рё РїРѕ РєРѕР»РёС‡РµСЃС‚РІСѓ РЅР° РїСЂРѕРµРєС‚.
   - Р’С‹Р·РѕРІ `exportProject(project, { format, outputDir: tmpDir, filename, author })`.
   - Р§С‚РµРЅРёРµ СЃРіРµРЅРµСЂРёСЂРѕРІР°РЅРЅРѕРіРѕ С„Р°Р№Р»Р° РІ buffer, Р·Р°РіСЂСѓР·РєР° РІ Storage `exports`, СЃРѕР·РґР°РЅРёРµ signed URL.
   - РћС‚РІРµС‚ JSON: `{ success, format, filename, url, publicUrl }`.
4. **Р­РєСЃРїРѕСЂС‚** (`src/services/export/index.ts`): РїРѕ `format` РІС‹Р·С‹РІР°РµС‚СЃСЏ `exportToEpub` РёР»Рё `exportToFb2`.
5. **EPUB** (`src/services/export/epub.ts`): РіРµРЅРµСЂР°С†РёСЏ РІ **РїР°РјСЏС‚Рё** С‡РµСЂРµР· `epub-gen-memory`, Р·Р°С‚РµРј Р·Р°РїРёСЃСЊ РІ `outputPath` (С‚.Рµ. РІ `tmpDir`).
6. **FB2** (`src/services/export/fb2.ts`): РіРµРЅРµСЂР°С†РёСЏ XML Рё Р·Р°РїРёСЃСЊ РІ `outputPath` (С‚РѕР»СЊРєРѕ `tmpDir` Рё РґРёСЃРє, Р±РµР· temp РІРЅСѓС‚СЂРё node_modules).
7. **Р¤СЂРѕРЅС‚**: РїРѕ РѕС‚РІРµС‚Сѓ РѕС‚РєСЂС‹РІР°РµС‚/СЃРєР°С‡РёРІР°РµС‚ РїРѕ `result.url` (signed URL).

## РџСЂРѕР±Р»РµРјР° EROFS РЅР° Vercel

- РћС€РёР±РєР°: `EROFS: read-only file system, mkdir '/var/task/node_modules/epub-gen/tempDir'`.
- РџСЂРёС‡РёРЅР°: РїР°РєРµС‚ **epub-gen** СЃРѕР·РґР°С‘С‚ РІСЂРµРјРµРЅРЅСѓСЋ РїР°РїРєСѓ РІРЅСѓС‚СЂРё `node_modules`; РЅР° Vercel С„Р°Р№Р»РѕРІР°СЏ СЃРёСЃС‚РµРјР° `/var/task` (РІ С‚.С‡. `node_modules`) С‚РѕР»СЊРєРѕ РґР»СЏ С‡С‚РµРЅРёСЏ.
- Р РµС€РµРЅРёРµ: Р·Р°РјРµРЅРёС‚СЊ **epub-gen** РЅР° **epub-gen-memory**, РєРѕС‚РѕСЂС‹Р№ РіРµРЅРµСЂРёСЂСѓРµС‚ EPUB РІ РїР°РјСЏС‚Рё (Buffer) Рё РЅРµ РїРёС€РµС‚ РІРѕ РІСЂРµРјРµРЅРЅС‹Рµ РєР°С‚Р°Р»РѕРіРё. Р РµР·СѓР»СЊС‚Р°С‚ Р·Р°С‚РµРј Р·Р°РїРёСЃС‹РІР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РІ `outputPath` (РЅР° Vercel СЌС‚Рѕ `/tmp/...`), РєСѓРґР° РїРёСЃР°С‚СЊ СЂР°Р·СЂРµС€РµРЅРѕ.

## Р§С‚Рѕ СЃРґРµР»Р°РЅРѕ

- Р’ **EPUB-СЌРєСЃРїРѕСЂС‚Рµ** РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ **epub-gen-memory**: РіРµРЅРµСЂР°С†РёСЏ РІ Buffer, Р·Р°С‚РµРј `fs.writeFileSync(outputPath, buffer)`. РџСѓС‚СЊ `outputPath` РІСЃРµРіРґР° РІ `tmpDir` (`/tmp` РЅР° Vercel).
- Р—Р°РІРёСЃРёРјРѕСЃС‚СЊ: РІ `package.json` СЃС‚РѕРёС‚ `epub-gen-memory` РІРјРµСЃС‚Рѕ `epub-gen`.
- FB2 РїРѕ-РїСЂРµР¶РЅРµРјСѓ С‚РѕР»СЊРєРѕ РїРёС€РµС‚ РІ `outputPath` (Р±РµР· temp РІ node_modules), РёР·РјРµРЅРµРЅРёР№ РЅРµ С‚СЂРµР±РѕРІР°Р»РѕСЃСЊ.

## Р’Р°Р¶РЅРѕ РґР»СЏ РґРµРїР»РѕСЏ

- РќР° Vercel РїРµСЂРµРјРµРЅРЅР°СЏ `VERCEL` Р·Р°РґР°С‘С‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё; `tmpDir` СЃС‚Р°РЅРѕРІРёС‚СЃСЏ `/tmp`.
- Bucket **exports** РІ Supabase Storage РґРѕР»Р¶РµРЅ СЃСѓС‰РµСЃС‚РІРѕРІР°С‚СЊ; РїСЂРё СЌРєСЃРїРѕСЂС‚Рµ С„Р°Р№Р»С‹ РєР»Р°РґСѓС‚СЃСЏ РІ `exports/{projectId}/{filename}.epub|.fb2`.
- Р”Р»СЏ СЃРєР°С‡РёРІР°РЅРёСЏ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ signed URL РёР· РѕС‚РІРµС‚Р° API; bucket РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСЂРёРІР°С‚РЅС‹Рј.
