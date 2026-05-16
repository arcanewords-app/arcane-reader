---
stale: true
status: archived
domain: meta
---

# вљЎ Р‘С‹СЃС‚СЂС‹Р№ СЃС‚Р°СЂС‚ РЅР° Vercel

## рџљЂ Р—Р° 5 РјРёРЅСѓС‚

### 1. РџРѕРґРіРѕС‚РѕРІРєР° (Р»РѕРєР°Р»СЊРЅРѕ)

```bash
cd arcane-reader
npm install
npm run build  # РџСЂРѕРІРµСЂРєР°, С‡С‚Рѕ РІСЃС‘ СЃРѕР±РёСЂР°РµС‚СЃСЏ
```

### 2. Р”РµРїР»РѕР№ С‡РµСЂРµР· Dashboard

1. **РћС‚РєСЂРѕР№С‚Рµ**: https://vercel.com/new
2. **РРјРїРѕСЂС‚РёСЂСѓР№С‚Рµ** СЂРµРїРѕР·РёС‚РѕСЂРёР№ СЃ `arcane-reader`
3. **Root Directory**: `arcane-reader` (РµСЃР»Рё РјРѕРЅРѕСЂРµРїРѕР·РёС‚РѕСЂРёР№) РёР»Рё РѕСЃС‚Р°РІСЊС‚Рµ РїСѓСЃС‚С‹Рј
4. **Build Settings**: РћСЃС‚Р°РІСЊС‚Рµ РїСѓСЃС‚С‹РјРё (РІСЃС‘ РІ `vercel.json`)
5. **Environment Variables**: Р”РѕР±Р°РІСЊС‚Рµ:
   ```
   OPENAI_API_KEY=sk-...
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
6. **Deploy!** рџЋ‰

### 3. РР»Рё С‡РµСЂРµР· CLI

```bash
# РЈСЃС‚Р°РЅРѕРІРёС‚СЊ CLI (РѕРґРёРЅ СЂР°Р·)
npm install -g vercel

# Р’РѕР№С‚Рё
vercel login

# Р”РµРїР»РѕР№
cd arcane-reader
vercel

# Production
vercel --prod
```

## вњ… РџСЂРѕРІРµСЂРєР°

РџРѕСЃР»Рµ РґРµРїР»РѕСЏ РїСЂРѕРІРµСЂСЊС‚Рµ:
- вњ… РџСЂРёР»РѕР¶РµРЅРёРµ РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ
- вњ… API СЂР°Р±РѕС‚Р°РµС‚: `https://your-app.vercel.app/api/status`
- вњ… Р›РѕРіРё Р±РµР· РѕС€РёР±РѕРє

## рџ”§ Р•СЃР»Рё С‡С‚Рѕ-С‚Рѕ РЅРµ СЂР°Р±РѕС‚Р°РµС‚

1. **РџСЂРѕРІРµСЂСЊС‚Рµ Р»РѕРіРё** РІ Vercel Dashboard
2. **РџСЂРѕРІРµСЂСЊС‚Рµ Environment Variables** - РІСЃРµ Р»Рё РґРѕР±Р°РІР»РµРЅС‹
3. **РџСЂРѕРІРµСЂСЊС‚Рµ Supabase** - СЃРѕР·РґР°РЅС‹ Р»Рё Р±Р°РєРµС‚С‹ Рё РїРѕР»РёС‚РёРєРё

---

**РџРѕРґСЂРѕР±РЅР°СЏ РёРЅСЃС‚СЂСѓРєС†РёСЏ**: СЃРј. `VERCEL_DEPLOY_GUIDE.md`
