---
stale: true
status: archived
domain: meta
---

# рџ”§ РСЃРїСЂР°РІР»РµРЅРёРµ РјРѕР±РёР»СЊРЅРѕРіРѕ РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ ChapterView

## Р’РµСЂСЃРёСЏ 1.1 - Settings РІ РЅР°РІРёРіР°С†РёРё + Responsive

### рџ“Ќ РџРµСЂРµРјРµС‰РµРЅРёРµ РєРЅРѕРїРєРё Settings

**РњРѕС‚РёРІР°С†РёСЏ:** РљРЅРѕРїРєР° РЅР°СЃС‚СЂРѕРµРє (вљ™пёЏ) Р»РѕРіРёС‡РµСЃРєРё РѕС‚РЅРѕСЃРёС‚СЃСЏ Рє РЅР°РІРёРіР°С†РёРё Рё СѓРїСЂР°РІР»РµРЅРёСЋ РїСЂРµРґСЃС‚Р°РІР»РµРЅРёРµРј РіР»Р°РІС‹, Р° РЅРµ Рє РґРµР№СЃС‚РІРёСЏРј РЅР°Рґ РєРѕРЅС‚РµРЅС‚РѕРј (Read/Translate).

#### **Р‘С‹Р»Рѕ:**

```tsx
<div class="chapter-nav">
  <button>в—Ђ</button>
  <h2>Chapter Title</h2>
  <button>в–¶</button>
</div>

<div class="chapter-actions">
  <StatusBadge />
  <Button>рџ“– Read</Button>
  <Button>рџ”® Translate</Button>
  <Button>вљ™пёЏ</Button>  в†ђ Settings С‚СѓС‚
</div>
```

#### **РЎС‚Р°Р»Рѕ:**

```tsx
<div class="chapter-nav">
  <button>в—Ђ</button>
  <h2>Chapter Title</h2>
  <button>в–¶</button>
  <button>вљ™пёЏ</button>  в†ђ Settings Р·РґРµСЃСЊ
</div>

<div class="chapter-actions">
  <StatusBadge />
  <Button>рџ“– Read</Button>
  <Button>рџ”® Translate</Button>
</div>
```

---

### вњЁ РџСЂРµРёРјСѓС‰РµСЃС‚РІР°

#### **1. Р›РѕРіРёС‡РµСЃРєР°СЏ РіСЂСѓРїРїРёСЂРѕРІРєР°**

```
Navigation (chapter-nav):
  [в—Ђ] - РџСЂРµРґС‹РґСѓС‰Р°СЏ РіР»Р°РІР°
  [в–¶] - РЎР»РµРґСѓСЋС‰Р°СЏ РіР»Р°РІР°
  [вљ™пёЏ] - РќР°СЃС‚СЂРѕР№РєРё РѕС‚РѕР±СЂР°Р¶РµРЅРёСЏ
  в””в”Ђв”Ђ РЈРїСЂР°РІР»РµРЅРёРµ РїСЂРµРґСЃС‚Р°РІР»РµРЅРёРµРј РіР»Р°РІС‹ в”Ђв”Ђв”

Actions (chapter-actions):
  [Status] - РЎС‚Р°С‚СѓСЃ РіР»Р°РІС‹
  [рџ“– Read] - Р РµР¶РёРј С‡С‚РµРЅРёСЏ
  [рџ”® Translate] - РџРµСЂРµРІРѕРґ
  в””в”Ђв”Ђ Р”РµР№СЃС‚РІРёСЏ РЅР°Рґ РєРѕРЅС‚РµРЅС‚РѕРј в”Ђв”Ђв”
```

#### **2. РЈР»СѓС‡С€РµРЅРЅР°СЏ РґРѕСЃС‚СѓРїРЅРѕСЃС‚СЊ**

- Settings РІСЃРµРіРґР° РІРёРґРЅР°, РґР°Р¶Рµ РєРѕРіРґР° actions РїРµСЂРµРЅРѕСЃСЏС‚СЃСЏ РЅР° mobile
- Р›РѕРіРёС‡РµСЃРєРё СЃРІСЏР·Р°РЅР° СЃ РЅР°РІРёРіР°С†РёРµР№ (в—Ђ Title в–¶ вљ™пёЏ)
- Р‘Р»РёР¶Рµ Рє Р·Р°РіРѕР»РѕРІРєСѓ, РєРѕС‚РѕСЂС‹Рј СѓРїСЂР°РІР»СЏРµС‚

#### **3. РљРѕРјРїР°РєС‚РЅРѕСЃС‚СЊ РЅР° РјРѕР±РёР»СЊРЅС‹С…**

```
Desktop:
[в—Ђ] [Chapter Title] [в–¶] [вљ™пёЏ] в”Ђв”Ђв”Ђ [Status] [Read] [Translate]

Mobile:
[в—Ђ] [Title] [в–¶] [вљ™пёЏ]
в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
[Status] [Read] [Translate]
```

вњ… Settings РѕСЃС‚Р°С‘С‚СЃСЏ РЅР° РїРµСЂРІРѕР№ СЃС‚СЂРѕРєРµ
вњ… Actions РїРµСЂРµРЅРѕСЃСЏС‚СЃСЏ РЅР° РІС‚РѕСЂСѓСЋ

---

### рџЋЁ CSS РёР·РјРµРЅРµРЅРёСЏ

#### **1. Navigation Р·Р°РЅРёРјР°РµС‚ РІСЃС‘ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ:**

```css
.chapter-nav {
  display: flex;
  flex: 1; /* Р—Р°РЅРёРјР°РµРј РІСЃС‘ РґРѕСЃС‚СѓРїРЅРѕРµ РїСЂРѕСЃС‚СЂР°РЅСЃС‚РІРѕ */
}
```

#### **2. Settings РїСЂРёР±РёС‚Р° Рє РїСЂР°РІРѕРјСѓ РєСЂР°СЋ:**

```css
.chapter-settings-btn {
  margin-left: auto; /* РџСЂРёР±РёРІР°РµРј Рє РїСЂР°РІРѕРјСѓ РєСЂР°СЋ РЅР° Р’РЎР•РҐ СѓСЃС‚СЂРѕР№СЃС‚РІР°С… */
}
```

#### **3. Title Р°РґР°РїС‚РёРІРЅС‹Р№ СЃ ellipsis:**

```css
.chapter-title-wrapper {
  flex: 1;
  min-width: 0; /* РџРѕР·РІРѕР»СЏРµРј СЃР¶РёРјР°С‚СЊСЃСЏ */
}

.chapter-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap; /* РќР° РѕРґРЅРѕР№ СЃС‚СЂРѕРєРµ */
}
```

**Р РµР·СѓР»СЊС‚Р°С‚ РЅР° РІСЃРµС… СѓСЃС‚СЂРѕР№СЃС‚РІР°С…:**

```
Desktop (С€РёСЂРѕРєРёР№):
[в—Ђ] [Chapter Title] [в–¶] в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ [вљ™пёЏ]
в””в”Ђ Nav в”Ђв” в””в”Ђ Title в”Ђв”                    в””в”Ђ Settings в”Ђв”

Desktop (СѓР·РєРёР№):
[в—Ђ] [Chapter Ti...] [в–¶] в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ [вљ™пёЏ]
в””в”Ђ Nav в”Ђв” в””в”Ђ Ellipsis в”Ђв”             в””в”Ђ Settings в”Ђв”

Mobile:
[в—Ђ] [Title] [в–¶] в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ [вљ™пёЏ]
в””в”Ђ Nav в”Ђв” в””в”Ђ Title в”Ђв”      в””в”Ђ Settings в”Ђв”

Small Mobile:
[в—Ђ][Ti...][в–¶] в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ [вљ™пёЏ]
в””в”Ђ Nav в”Ђв” в””в”Ђ Ellipsis в”Ђв” в””в”Ђ Settings в”Ђв”
```

вњ… **Settings РІСЃРµРіРґР° СЃРїСЂР°РІР°, РЅРµР·Р°РІРёСЃРёРјРѕ РѕС‚ С€РёСЂРёРЅС‹ СЌРєСЂР°РЅР°**  
вњ… **Title Р°РґР°РїС‚РёРІРЅРѕ СЃР¶РёРјР°РµС‚СЃСЏ СЃ ellipsis**  
вњ… **РќР°РІРёРіР°С†РёРѕРЅРЅС‹Рµ РєРЅРѕРїРєРё РІСЃРµРіРґР° РІРёРґРЅС‹**

---

## вќЊ РћР±РЅР°СЂСѓР¶РµРЅРЅС‹Рµ РїСЂРѕР±Р»РµРјС‹ (v1.0)

РџРѕСЃР»Рµ СЂРµС„Р°РєС‚РѕСЂРёРЅРіР° UI/UX РІ РєРѕРјРїРѕРЅРµРЅС‚Р°С… ChapterView Р±С‹Р»Рё РѕР±РЅР°СЂСѓР¶РµРЅС‹ **РїСЂРѕР±Р»РµРјС‹ СЃ РјРѕР±РёР»СЊРЅС‹Рј РѕС‚РѕР±СЂР°Р¶РµРЅРёРµРј**:

#### **1. ChapterHeader**

```
Desktop: [в—Ђ][Chapter Title][в–¶] в”Ђв”Ђв”Ђв”Ђв”Ђ [Status][Read][Translate][вљ™пёЏ]
                                     в””в”Ђв”Ђ Р’СЃС‘ РІ РѕРґРЅСѓ СЃС‚СЂРѕРєСѓ в”Ђв”Ђв”

Mobile:  [в—Ђ][Chapter Title........][в–¶][Status][Read][Tra...
         в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ РќРђРЎР›РћР•РќРР• Р РћР‘Р Р•Р—РђРќРР• в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”
```

**РџСЂРѕР±Р»РµРјС‹:**

- вќЊ РљРЅРѕРїРєРё actions РЅРµ Р°РґР°РїС‚РёСЂРѕРІР°Р»РёСЃСЊ РїРѕРґ mobile
- вќЊ РќРµС‚ flex-wrap РґР»СЏ chapter-actions
- вќЊ РљРЅРѕРїРєРё РЅР°Р»РµР·Р°Р»Рё РґСЂСѓРі РЅР° РґСЂСѓРіР°
- вќЊ РўРµРєСЃС‚ РЅР° РєРЅРѕРїРєР°С… РѕР±СЂРµР·Р°Р»СЃСЏ

#### **2. TranslationPanel**

```
Desktop: [Full Chapter в—‹] [Empty only в—‹] [Selected в—‹] | [Analysis][Translation][Editing] | [Translate]
         в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ Scope в”Ђв”Ђв”Ђв”Ђв”Ђв” в””в”Ђв”Ђв”Ђв”Ђв”Ђ Stages в”Ђв”Ђв”Ђв”Ђв”Ђв” в””в”Ђ Actions в”Ђв”

Mobile:  [Full в—‹][Empty в—‹][Selected в—‹][Analysis][Translation][Editing][Translate]
         в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ Р’РЎРЃ РЎР›РРЁРљРћРњ РџР›РћРўРќРћ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”
```

**РџСЂРѕР±Р»РµРјС‹:**

- вќЊ Р­Р»РµРјРµРЅС‚С‹ СЃР»РёС€РєРѕРј Р±Р»РёР·РєРѕ РЅР° СѓР·РєРёС… СЌРєСЂР°РЅР°С…
- вќЊ РљРЅРѕРїРєРё stages СЃР»РёС€РєРѕРј РєСЂСѓРїРЅС‹Рµ
- вќЊ РќРµ Р°РґР°РїС‚РёСЂРѕРІР°РЅС‹ СЂР°Р·РјРµСЂС‹ С€СЂРёС„С‚РѕРІ

#### **3. ReaderSettings**

```
Desktop: [Grid 2 columns] в†’ [Font options] [Sliders] [Theme selector]
         в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ РЈРґРѕР±РЅРѕРµ СЂР°СЃРїРѕР»РѕР¶РµРЅРёРµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”

Mobile:  [Grid 2 columns] в†’ Р­Р»РµРјРµРЅС‚С‹ СЃР¶Р°С‚С‹, РЅРµСѓРґРѕР±РЅРѕ
         в””в”Ђв”Ђв”Ђ Р”РћР›Р–РќРђ Р‘Р«РўР¬ 1 РљРћР›РћРќРљРђ в”Ђв”Ђв”Ђв”
```

**РџСЂРѕР±Р»РµРјС‹:**

- вќЊ Grid РѕСЃС‚Р°РІР°Р»СЃСЏ 2-РєРѕР»РѕРЅРѕС‡РЅС‹Рј
- вќЊ Font options Р±С‹Р»Рё СЃР»РёС€РєРѕРј РєСЂСѓРїРЅС‹РјРё
- вќЊ Stages РІ РІРёРґРµ row, Р·Р°РЅРёРјР°Р»Рё РјРЅРѕРіРѕ РјРµСЃС‚Р°

---

## вњ… Р РµС€РµРЅРёСЏ

### **1. ChapterHeader - РџРѕР»РЅРѕС†РµРЅРЅР°СЏ Р°РґР°РїС‚РёРІРЅРѕСЃС‚СЊ**

#### **Desktop (в‰Ґ768px):**

```css
.chapter-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap; /* Р”РѕР±Р°РІР»РµРЅРѕ */
}
```

#### **Mobile (в‰¤767px):**

```css
.chapter-header {
  padding: 0 0.75rem;
  gap: 0.75rem;
}

.chapter-nav-btn {
  width: 40px;
  height: 40px;
  font-size: 0.9rem;
}

.chapter-actions {
  gap: 0.5rem;
  width: 100%;
  order: 3; /* РџРµСЂРµРЅРѕСЃРёРј РЅР° РЅРѕРІСѓСЋ СЃС‚СЂРѕРєСѓ */
}

.chapter-actions .btn {
  font-size: 0.8125rem;
  padding: 0.5rem 0.75rem;
  min-height: 40px;
}
```

#### **Small Mobile (в‰¤480px):**

```css
.chapter-nav-btn {
  width: 36px;
  height: 36px;
  font-size: 0.875rem;
}

.chapter-actions {
  gap: 0.375rem;
}

.chapter-actions .btn {
  font-size: 0.75rem;
  padding: 0.375rem 0.625rem;
  min-height: 36px;
}
```

#### **Extra Small (в‰¤360px):**

```css
.chapter-nav-btn {
  width: 32px;
  height: 32px;
  font-size: 0.8rem;
}

.chapter-actions .btn {
  font-size: 0.7rem;
  padding: 0.25rem 0.5rem;
  min-height: 32px;
}
```

---

### **2. TranslationPanel - РљРѕРјРїР°РєС‚РЅС‹Рµ СЌР»РµРјРµРЅС‚С‹**

#### **Mobile (в‰¤767px):**

```css
.translation-panel {
  padding: 0.875rem;
}

.translation-panel-scope {
  gap: 0.5rem;
}

.translation-panel-radio {
  font-size: 0.8125rem;
}

.translation-panel-stages {
  gap: 0.375rem;
}

.translation-panel-stage-btn {
  padding: 0.375rem 0.625rem;
  font-size: 0.8rem;
}

.translation-panel-buttons .btn {
  font-size: 0.8125rem;
  padding: 0.5rem 0.75rem;
  min-height: 40px;
}
```

#### **Small Mobile (в‰¤480px):**

```css
.translation-panel {
  padding: 0.75rem;
}

.translation-panel-stage-btn {
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
}

.translation-panel-buttons .btn {
  font-size: 0.75rem;
  padding: 0.375rem 0.625rem;
  min-height: 36px;
}
```

#### **Extra Small (в‰¤360px):**

```css
.translation-panel {
  padding: 0.625rem;
}

.translation-panel-buttons .btn {
  font-size: 0.7rem;
  padding: 0.25rem 0.5rem;
  min-height: 32px;
}
```

---

### **3. ReaderSettings - 1-РєРѕР»РѕРЅРѕС‡РЅС‹Р№ layout**

#### **Mobile (в‰¤767px):**

```css
.reader-settings-panel {
  padding: 1rem;
  grid-template-columns: 1fr; /* Р‘С‹Р»Рѕ 2 РєРѕР»РѕРЅРєРё */
}

.font-option {
  padding: 0.375rem 0.625rem;
  min-width: 50px;
}

.settings-panel {
  grid-template-columns: 1fr; /* Р‘С‹Р»Рѕ 2 РєРѕР»РѕРЅРєРё */
}

.stages-grid {
  gap: 0.375rem;
}

.stage-toggle {
  padding: 0.625rem 0.375rem;
}
```

#### **Small Mobile (в‰¤480px):**

```css
.stages-grid {
  flex-direction: column; /* Р’Р°Р¶РЅРѕ! */
}

.stage-toggle {
  flex-direction: row; /* Р“РѕСЂРёР·РѕРЅС‚Р°Р»СЊРЅС‹Р№ layout */
  justify-content: flex-start;
  padding: 0.75rem 1rem;
  gap: 0.75rem;
}

.stage-icon {
  margin-bottom: 0; /* РЈР±РёСЂР°РµРј РІРµСЂС‚РёРєР°Р»СЊРЅС‹Р№ РѕС‚СЃС‚СѓРї */
}

.stage-name {
  text-align: left; /* Р‘С‹Р»Рѕ center */
}

.stage-checkbox {
  position: static; /* Р‘С‹Р»Рѕ absolute */
  margin-left: auto;
}
```

---

## рџ“± Responsive Breakpoints - ChapterView

### **Desktop (в‰Ґ768px):**

**ChapterHeader:**

```
[в—Ђ][Chapter Title][в–¶] в”Ђв”Ђв”Ђв”Ђв”Ђ [Status][рџ“– Read][рџ”® Translate][вљ™пёЏ]
```

- Р’СЃС‘ РІ РѕРґРЅСѓ СЃС‚СЂРѕРєСѓ
- РџРѕР»РЅС‹Рµ С‚РµРєСЃС‚С‹ РєРЅРѕРїРѕРє
- РљРЅРѕРїРєРё 44Г—44px

**TranslationPanel:**

```
[Full Chapter в—‹] [Empty only в—‹] [Selected в—‹]
[Analysis] [Translation] [Editing]
[рџ”® Translate Chapter] [вќЊ Cancel]
```

- РЈРґРѕР±РЅС‹Рµ СЂР°СЃСЃС‚РѕСЏРЅРёСЏ
- РљСЂСѓРїРЅС‹Рµ РєРЅРѕРїРєРё
- Р§РёС‚Р°РµРјС‹Рµ С‚РµРєСЃС‚С‹

**ReaderSettings:**

```
[Font: Aa Sans Serif Literary]
[Size: в”Ѓв”Ѓв”Ѓв—Џв”Ѓв”Ѓв”Ѓ 18]
[Line Height: в”Ѓв”Ѓв—Џв”Ѓв”Ѓв”Ѓ 1.7]
```

- 2-3 РєРѕР»РѕРЅРєРё grid
- Stages РІ row
- РљСЂСѓРїРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹

---

### **Mobile (в‰¤767px):**

**ChapterHeader:**

```
[в—Ђ][Chapter Title][в–¶]
в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
[Status][Read][Translate][вљ™пёЏ]
```

- Actions РЅР° РЅРѕРІРѕР№ СЃС‚СЂРѕРєРµ
- РљРѕРјРїР°РєС‚РЅС‹Рµ РєРЅРѕРїРєРё 40Г—40px
- РњРµРЅСЊС€РёРµ С€СЂРёС„С‚С‹

**TranslationPanel:**

```
[Full в—‹] [Empty в—‹] [Selected в—‹]
[Analysis][Translation][Editing]
[Translate] [Cancel]
```

- РЈРјРµРЅСЊС€РµРЅРЅС‹Рµ gaps
- РљРЅРѕРїРєРё 40Г—40px min-height
- РљРѕРјРїР°РєС‚РЅС‹Рµ stage buttons

**ReaderSettings:**

```
[Font: Aa Sans Serif]
[Size: в”Ѓв”Ѓв—Џв”Ѓв”Ѓ 18]
[Line: в”Ѓв—Џв”Ѓв”Ѓ 1.7]
```

- 1 РєРѕР»РѕРЅРєР° grid
- РљРѕРјРїР°РєС‚РЅС‹Рµ font options
- Stages РІ column

---

### **Small Mobile (в‰¤480px):**

**ChapterHeader:**

```
[в—Ђ][Title][в–¶]
в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
[S][R][T][вљ™]
```

- РљРЅРѕРїРєРё 36Г—36px
- РљРѕСЂРѕС‚РєРёРµ С‚РµРєСЃС‚С‹
- font-size: 0.75rem

**TranslationPanel:**

```
[Fв—‹][Eв—‹][Sв—‹]
[A][T][E]
[T][C]
```

- РњРёРЅРёРјР°Р»СЊРЅС‹Рµ gaps
- РљРЅРѕРїРєРё 36Г—36px
- font-size: 0.75rem

**ReaderSettings:**

```
[рџ“– Literary в”Ѓв—Џв”Ѓв”Ѓ 18]
[рџ“ђ Line Height в”Ѓв—Џв”Ѓ 1.7]
[рџЋЁ Dark рџЊџ Light]
```

- Stages РєР°Рє rows
- РРєРѕРЅРєРё СЃР»РµРІР°, С‚РµРєСЃС‚ СЃРїСЂР°РІР°
- Checkbox СЃРїСЂР°РІР°

---

### **Extra Small (в‰¤360px):**

**ChapterHeader:**

```
[в—Ђ][Ti][в–¶]
в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
[S][R][T]
```

- РљРЅРѕРїРєРё 32Г—32px
- font-size: 0.7rem
- РњРёРЅРёРјР°Р»СЊРЅС‹Рµ paddings

**TranslationPanel:**

```
[F][E][S]
[A][T][E]
[T]
```

- РљРЅРѕРїРєРё 32Г—32px
- font-size: 0.7rem
- РњР°РєСЃРёРјР°Р»СЊРЅР°СЏ РєРѕРјРїР°РєС‚РЅРѕСЃС‚СЊ

---

## рџ“Љ Р Р°Р·РјРµСЂС‹ СЌР»РµРјРµРЅС‚РѕРІ РїРѕ breakpoints

### **РљРЅРѕРїРєРё Navigation (ChapterHeader):**

| Breakpoint | WidthГ—Height | Font Size | Padding |
| ---------- | ------------- | --------- | ------- |
| в‰Ґ768px   | 44Г—44px      | 1rem      | -       |
| в‰¤767px   | 40Г—40px      | 0.9rem    | -       |
| в‰¤480px   | 36Г—36px      | 0.875rem  | -       |
| в‰¤360px   | 32Г—32px      | 0.8rem    | -       |

### **РљРЅРѕРїРєРё Actions (ChapterHeader):**

| Breakpoint | Min-Height | Font Size | Padding           |
| ---------- | ---------- | --------- | ----------------- |
| в‰Ґ768px   | 44px       | 0.875rem  | 0.5rem 1rem       |
| в‰¤767px   | 40px       | 0.8125rem | 0.5rem 0.75rem    |
| в‰¤480px   | 36px       | 0.75rem   | 0.375rem 0.625rem |
| в‰¤360px   | 32px       | 0.7rem    | 0.25rem 0.5rem    |

### **Stage Buttons (TranslationPanel):**

| Breakpoint | Padding           | Font Size | Gap      |
| ---------- | ----------------- | --------- | -------- |
| в‰Ґ768px   | 0.4rem 0.75rem    | 0.85rem   | 0.5rem   |
| в‰¤767px   | 0.375rem 0.625rem | 0.8rem    | 0.375rem |
| в‰¤480px   | 0.3rem 0.5rem     | 0.75rem   | 0.25rem  |
| в‰¤360px   | 0.25rem 0.375rem  | 0.7rem    | 0.25rem  |

### **Gaps РјРµР¶РґСѓ СЌР»РµРјРµРЅС‚Р°РјРё:**

| Р­Р»РµРјРµРЅС‚            | в‰Ґ768px | в‰¤767px | в‰¤480px | в‰¤360px |
| ------------------------- | -------- | -------- | -------- | -------- |
| chapter-actions           | 0.75rem  | 0.5rem   | 0.375rem | 0.25rem  |
| translation-panel-buttons | 0.5rem   | 0.375rem | 0.25rem  | 0.25rem  |
| translation-panel-stages  | 0.5rem   | 0.375rem | 0.25rem  | 0.25rem  |

---

## рџЋЇ РљР»СЋС‡РµРІС‹Рµ СѓР»СѓС‡С€РµРЅРёСЏ

### **1. Flex-wrap Рё Order**

```css
.chapter-actions {
  flex-wrap: wrap; /* РџРѕР·РІРѕР»СЏРµРј РїРµСЂРµРЅРѕСЃ */
  width: 100%;
  order: 3; /* РќР° РЅРѕРІСѓСЋ СЃС‚СЂРѕРєСѓ РЅР° РјРѕР±РёР»СЊРЅС‹С… */
}
```

### **2. РђРґР°РїС‚РёРІРЅС‹Рµ СЂР°Р·РјРµСЂС‹ РєРЅРѕРїРѕРє**

```css
/* Desktop */
.btn {
  min-height: 44px;
  padding: 0.5rem 1rem;
}

/* Mobile */
.btn {
  min-height: 40px;
  padding: 0.5rem 0.75rem;
}

/* Small Mobile */
.btn {
  min-height: 36px;
  padding: 0.375rem 0.625rem;
}

/* Extra Small */
.btn {
  min-height: 32px;
  padding: 0.25rem 0.5rem;
}
```

### **3. Grid в†’ Single Column**

```css
/* Desktop */
.reader-settings-panel {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

/* Mobile */
.reader-settings-panel {
  grid-template-columns: 1fr;
}
```

### **4. Stages Layout Change**

```css
/* Desktop */
.stages-grid {
  display: flex;
  flex-direction: row;
}

/* Small Mobile */
.stages-grid {
  flex-direction: column;
}

.stage-toggle {
  flex-direction: row; /* РР· column РІ row */
}
```

---

## вњ… Р РµР·СѓР»СЊС‚Р°С‚С‹

### **Р”Рѕ:**

```
ChapterHeader:
[в—Ђ][Very Long Chapter Title............][в–¶][Status][рџ“– R...][рџ”® Tra...][вљ™пёЏ]
в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ РќРђРЎР›РћР•РќРР• Р РћР‘Р Р•Р—РђРќРР• в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”

TranslationPanel:
[Full в—‹][Empty в—‹][Selected в—‹][Analysis][Translation][Editing][Translate]
в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ РЎР›РРЁРљРћРњ РџР›РћРўРќРћ, РќРђР›Р•Р—РђР•Рў в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”

ReaderSettings:
[Aa][Sans][Literary]  [Size в—Џ]
[Line в—Џ]              [Theme]
в””в”Ђв”Ђ 2 РљРћР›РћРќРљР РќРђ РњРћР‘РР›Р¬РќР«РҐ = РЎР–РђРўРћ в”Ђв”Ђв”
```

**РџСЂРѕР±Р»РµРјС‹:**

- вќЊ Р­Р»РµРјРµРЅС‚С‹ РЅР°Р»РµР·Р°СЋС‚ РґСЂСѓРі РЅР° РґСЂСѓРіР°
- вќЊ РўРµРєСЃС‚ РѕР±СЂРµР·Р°РµС‚СЃСЏ
- вќЊ РљРЅРѕРїРєРё СЃР»РёС€РєРѕРј Р±Р»РёР·РєРѕ
- вќЊ РќРµСѓРґРѕР±РЅРѕ С‚Р°РїР°С‚СЊ РЅР° РјРѕР±РёР»СЊРЅС‹С…

---

### **РџРѕСЃР»Рµ:**

```
ChapterHeader:
[в—Ђ][Chapter Title][в–¶]
в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
[Status] [рџ“– Read] [рџ”® Translate] [вљ™пёЏ]

TranslationPanel:
[Full в—‹] [Empty в—‹] [Selected в—‹]
[Analysis] [Translation] [Editing]
[рџ”® Translate] [вќЊ Cancel]

ReaderSettings:
[Aa Sans Serif Literary]
[Size: в”Ѓв”Ѓв—Џв”Ѓв”Ѓв”Ѓ 18]
[Line Height: в”Ѓв”Ѓв—Џв”Ѓв”Ѓв”Ѓ 1.7]
[рџ“– Literary в”Ѓв”Ѓв”Ѓ вњ“]
```

**РЈР»СѓС‡С€РµРЅРёСЏ:**

- вњ… Actions РЅР° РѕС‚РґРµР»СЊРЅРѕР№ СЃС‚СЂРѕРєРµ
- вњ… РЈРґРѕР±РЅС‹Рµ СЂР°СЃСЃС‚РѕСЏРЅРёСЏ РјРµР¶РґСѓ СЌР»РµРјРµРЅС‚Р°РјРё
- вњ… РљРЅРѕРїРєРё Р»РµРіРєРѕ С‚Р°РїР°С‚СЊ (min 32Г—32px)
- вњ… Р’СЃС‘ РІРёРґРЅРѕ, РЅРёС‡РµРіРѕ РЅРµ РѕР±СЂРµР·Р°РµС‚СЃСЏ
- вњ… 1-РєРѕР»РѕРЅРѕС‡РЅС‹Р№ layout РЅР° mobile
- вњ… Р§РёС‚Р°РµРјС‹Рµ С€СЂРёС„С‚С‹ (в‰Ґ0.7rem)

---

## рџ“‹ РћР±РЅРѕРІР»РµРЅРЅС‹Рµ С„Р°Р№Р»С‹

### **ChapterHeader:**

- вњ… `ChapterHeader.css` - РґРѕР±Р°РІР»РµРЅС‹ responsive СЃС‚РёР»Рё РґР»СЏ в‰¤767px, в‰¤480px, в‰¤360px
- вњ… РЈРґР°Р»РµРЅС‹ РґСѓР±Р»РёСЂСѓСЋС‰РёРµСЃСЏ СЃС‚Р°СЂС‹Рµ breakpoints (768-1023px, в‰Ґ1024px)
- вњ… Р”РѕР±Р°РІР»РµРЅ `flex-wrap: wrap` РґР»СЏ `.chapter-actions`
- вњ… Р”РѕР±Р°РІР»РµРЅ `order: 3` РґР»СЏ РїРµСЂРµРЅРѕСЃР° РЅР° РЅРѕРІСѓСЋ СЃС‚СЂРѕРєСѓ

### **TranslationPanel:**

- вњ… `TranslationPanel.css` - РґРѕР±Р°РІР»РµРЅС‹ responsive СЃС‚РёР»Рё РґР»СЏ РІСЃРµС… breakpoints
- вњ… РђРґР°РїС‚РёРІРЅС‹Рµ СЂР°Р·РјРµСЂС‹ РєРЅРѕРїРѕРє, gaps, paddings
- вњ… РЈРјРµРЅСЊС€РµРЅС‹ С€СЂРёС„С‚С‹ РґР»СЏ РєРѕРјРїР°РєС‚РЅРѕСЃС‚Рё

### **ReaderSettings:**

- вњ… `ReaderSettings.css` - РїРѕР»РЅРѕСЃС‚СЊСЋ РїРµСЂРµСЂР°Р±РѕС‚Р°РЅС‹ responsive СЃС‚РёР»Рё
- вњ… Grid в†’ 1 column РЅР° mobile
- вњ… Stages: row в†’ column layout РЅР° в‰¤480px
- вњ… Stage toggle: column в†’ row РЅР° в‰¤480px
- вњ… РђРґР°РїС‚РёРІРЅС‹Рµ СЂР°Р·РјРµСЂС‹ РІСЃРµС… СЌР»РµРјРµРЅС‚РѕРІ

---

## рџЋЁ РџР°С‚С‚РµСЂРЅС‹ РґР»СЏ РґСЂСѓРіРёС… РєРѕРјРїРѕРЅРµРЅС‚РѕРІ

### **1. Responsive Button Sizes:**

```css
/* Base */
.btn {
  min-height: 44px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

/* Mobile */
@media (max-width: 767px) {
  .btn {
    min-height: 40px;
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
  }
}

/* Small Mobile */
@media (max-width: 480px) {
  .btn {
    min-height: 36px;
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
  }
}

/* Extra Small */
@media (max-width: 360px) {
  .btn {
    min-height: 32px;
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
  }
}
```

### **2. Flex-wrap РґР»СЏ РіСЂСѓРїРї РєРЅРѕРїРѕРє:**

```css
.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

@media (max-width: 767px) {
  .button-group {
    gap: 0.5rem;
    width: 100%;
  }
}
```

### **3. Grid в†’ Single Column:**

```css
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

@media (max-width: 767px) {
  .settings-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
}
```

### **4. РђРґР°РїС‚РёРІРЅС‹Рµ gaps:**

```css
/* Desktop */
gap: 1rem;

/* Mobile */
@media (max-width: 767px) {
  gap: 0.5rem;
}

/* Small */
@media (max-width: 480px) {
  gap: 0.375rem;
}

/* Extra Small */
@media (max-width: 360px) {
  gap: 0.25rem;
}
```

---

## рџ“ќ Р§РµРє-Р»РёСЃС‚ РґР»СЏ mobile

- [x] РљРЅРѕРїРєРё в‰Ґ32Г—32px (в‰Ґ40Г—40px preferred)
- [x] РЁСЂРёС„С‚С‹ в‰Ґ0.7rem (в‰Ґ0.75rem preferred)
- [x] РСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ flex-wrap РґР»СЏ РїРµСЂРµРЅРѕСЃР°
- [x] Grid Р°РґР°РїС‚РёСЂСѓРµС‚СЃСЏ Рє 1 РєРѕР»РѕРЅРєРµ
- [x] Gaps СѓРјРµРЅСЊС€Р°СЋС‚СЃСЏ РЅР° СѓР·РєРёС… СЌРєСЂР°РЅР°С…
- [x] Paddings Р°РґР°РїС‚РёСЂСѓСЋС‚СЃСЏ
- [x] РќРµС‚ РіРѕСЂРёР·РѕРЅС‚Р°Р»СЊРЅРѕРіРѕ СЃРєСЂРѕР»Р»Р°
- [x] Р­Р»РµРјРµРЅС‚С‹ РЅРµ РЅР°Р»РµР·Р°СЋС‚ РґСЂСѓРі РЅР° РґСЂСѓРіР°
- [x] РўРµРєСЃС‚ РЅРµ РѕР±СЂРµР·Р°РµС‚СЃСЏ РЅРµРєСЂР°СЃРёРІРѕ
- [x] РџСЂРѕС‚РµСЃС‚РёСЂРѕРІР°РЅРѕ РЅР° 360px, 480px, 767px

---

**Р”Р°С‚Р° РёСЃРїСЂР°РІР»РµРЅРёСЏ:** 2026-02-01  
**Р’РµСЂСЃРёСЏ:** v1.0  
**РЎС‚Р°С‚СѓСЃ:** вњ… РџРѕР»РЅРѕСЃС‚СЊСЋ СЂР°Р±РѕС‚Р°РµС‚  
**РљРѕРјРїРѕРЅРµРЅС‚С‹:** ChapterHeader, TranslationPanel, ReaderSettings
