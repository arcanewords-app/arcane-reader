---
stale: true
status: archived
domain: meta
---

# рџЋЇ Header Navigation - Underline Tabs Implementation

## вњ… Р§С‚Рѕ СЂРµР°Р»РёР·РѕРІР°РЅРѕ

### **1. Active State СЃ Underline**

**Before:**

```
[Catalog] [Cabinet]
    в†“         в†“
  Р’СЃРµ РѕРґРёРЅР°РєРѕРІС‹Рµ, РЅРµРїРѕРЅСЏС‚РЅРѕ РіРґРµ С‚С‹
```

**After:**

```
[Catalog]  [Cabinet]
 в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
   в†‘ Active indicator
```

---

## рџ“‹ РР·РјРµРЅРµРЅРёСЏ

### **1. Header.tsx - State Management**

**Р”РѕР±Р°РІР»РµРЅРѕ:**

```tsx
const [currentPath, setCurrentPath] = useState(window.location.pathname);

useEffect(() => {
  const checkPath = () => {
    const path = window.location.pathname;
    setCurrentPath(path); // РћС‚СЃР»РµР¶РёРІР°РµРј С‚РµРєСѓС‰РёР№ РїСѓС‚СЊ
    setHasSidebar(path.startsWith('/projects/'));
  };
  // ...
}, []);
```

**Р РµР·СѓР»СЊС‚Р°С‚:** РљРѕРјРїРѕРЅРµРЅС‚ РѕС‚СЃР»РµР¶РёРІР°РµС‚ С‚РµРєСѓС‰РёР№ URL Рё РѕР±РЅРѕРІР»СЏРµС‚ СЃРѕСЃС‚РѕСЏРЅРёРµ.

---

### **2. Navigation Links - Active Class & aria-current**

**Before:**

```tsx
<a href="/" class="nav-link">
  {t('cabinet.catalog')}
</a>
```

**After:**

```tsx
<a
  href="/"
  class={`nav-link ${currentPath === '/' ? 'active' : ''}`}
  aria-current={currentPath === '/' ? 'page' : undefined}
>
  {t('cabinet.catalog')}
</a>
```

**Р РµР·СѓР»СЊС‚Р°С‚:**

- вњ… Р”РѕР±Р°РІР»РµРЅ РєР»Р°СЃСЃ `.active` РґР»СЏ С‚РµРєСѓС‰РµР№ СЃС‚СЂР°РЅРёС†С‹
- вњ… Р”РѕР±Р°РІР»РµРЅ `aria-current="page"` РґР»СЏ accessibility

---

### **3. CSS - Underline Tabs Pattern**

#### **Base Styles:**

```css
.nav-link {
  padding: 0.625rem 1rem;
  color: var(--text-secondary);
  border-bottom: 2px solid transparent; /* РќРѕРІРѕРµ */
  min-height: 44px; /* РќРѕРІРѕРµ */
  display: flex; /* РќРѕРІРѕРµ */
  align-items: center; /* РќРѕРІРѕРµ */
}
```

**РР·РјРµРЅРµРЅРёСЏ:**

- вњ… `border-bottom: 2px solid transparent` - РїРѕРґРіРѕС‚РѕРІРєР° РґР»СЏ underline
- вњ… `min-height: 44px` - accessibility touch target
- вњ… `display: flex` + `align-items: center` - РІРµСЂС‚РёРєР°Р»СЊРЅРѕРµ С†РµРЅС‚СЂРёСЂРѕРІР°РЅРёРµ

---

#### **Hover State:**

```css
.nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-bottom-color: var(--accent-dim); /* РќРѕРІРѕРµ */
}
```

**Р РµР·СѓР»СЊС‚Р°С‚:**

```
[Catalog]  [Cabinet]
 вЂѕвЂѕвЂѕвЂѕвЂѕвЂѕ
   в†‘ Hover preview (dim accent)
```

---

#### **Active State:**

```css
.nav-link.active {
  color: var(--accent);
  border-bottom-color: var(--accent); /* РќРѕРІРѕРµ */
  background: transparent;
}

.nav-link.active:hover {
  background: var(--bg-hover);
}
```

**Р РµР·СѓР»СЊС‚Р°С‚:**

```
[Catalog]  [Cabinet]
 в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
   в†‘ Active (accent color)
```

---

### **4. Mobile Styles**

#### **Mobile (в‰¤767px):**

```css
.nav-link {
  padding: 0.625rem 1rem;
  flex: 1;
  text-align: center;
  justify-content: center;
  min-height: 44px;
}

.nav-link.active {
  color: var(--accent);
  background: var(--accent-glow); /* Р¤РѕРЅ РЅР° mobile */
  border-bottom-color: var(--accent);
}
```

**Р’РёР·СѓР°Р»СЊРЅРѕ РЅР° mobile:**

```
[Catalog] [Cabinet]
 в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
   в†‘ Active СЃ С„РѕРЅРѕРј + underline
```

**РџРѕС‡РµРјСѓ С„РѕРЅ РЅР° mobile:**

- вњ… Underline РјРѕР¶РµС‚ Р±С‹С‚СЊ РјРµРЅРµРµ Р·Р°РјРµС‚РµРЅ РЅР° СѓР·РєРёС… СЌРєСЂР°РЅР°С…
- вњ… Background РґРµР»Р°РµС‚ active state Р±РѕР»РµРµ РѕС‡РµРІРёРґРЅС‹Рј
- вњ… РљРѕРјР±РёРЅР°С†РёСЏ underline + background = РјР°РєСЃРёРјР°Р»СЊРЅР°СЏ РІРёРґРёРјРѕСЃС‚СЊ

---

#### **Small Mobile (в‰¤480px):**

```css
.nav-link {
  min-height: 40px;
  font-size: 0.8125rem;
}
```

#### **Extra Small (в‰¤360px):**

```css
.nav-link {
  min-height: 36px;
  font-size: 0.75rem;
}
```

---

## рџ“± Responsive Behavior

### **Desktop (в‰Ґ768px):**

```
[Logo] [Catalog] [Cabinet] в”Ђв”Ђв”Ђ [Status] [Lang] [User]
        в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
         в†‘ Active indicator
```

- Underline С‚РѕР»СЊРєРѕ
- Background РЅР° hover
- Inline СЃ header

---

### **Mobile (в‰¤767px):**

```
[в°][Logo] в”Ђв”Ђв”Ђ [Status][Lang][User]
в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
[Catalog] [Cabinet]
 в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
   в†‘ Active СЃ С„РѕРЅРѕРј + underline
```

- РћС‚РґРµР»СЊРЅР°СЏ СЃС‚СЂРѕРєР° (full width)
- Underline + Background РґР»СЏ РІРёРґРёРјРѕСЃС‚Рё
- Equal width РґР»СЏ СЃРёРјРјРµС‚СЂРёРё

---

### **Small Mobile (в‰¤480px):**

```
[в°][L] в”Ђв”Ђв”Ђ [вЂў][LA][User]
в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
[Catalog] [Cabinet]
 в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
```

- РљРѕРјРїР°РєС‚РЅРµРµ (40px height)
- РњРµРЅСЊС€РёР№ С€СЂРёС„С‚ (0.8125rem)

---

### **Extra Small (в‰¤360px):**

```
[в°][L] в”Ђв”Ђв”Ђ [вЂў][L][U]
в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
[Cat] [Cab]
 в”Ѓв”Ѓв”Ѓ
```

- РњР°РєСЃРёРјР°Р»СЊРЅРѕ РєРѕРјРїР°РєС‚РЅРѕ (36px)
- РњРёРЅРёРјР°Р»СЊРЅС‹Р№ С€СЂРёС„С‚ (0.75rem)

---

## рџЋЁ Р’РёР·СѓР°Р»СЊРЅС‹Рµ СЃРѕСЃС‚РѕСЏРЅРёСЏ

### **1. Default (РЅРµ Р°РєС‚РёРІРЅР°):**

```
[Cabinet]
  color: var(--text-secondary)
  border-bottom: transparent
```

### **2. Hover (РЅРµ Р°РєС‚РёРІРЅР°):**

```
[Cabinet]
 вЂѕвЂѕвЂѕвЂѕвЂѕвЂѕ
  color: var(--text-primary)
  background: var(--bg-hover)
  border-bottom: var(--accent-dim)
```

### **3. Active (С‚РµРєСѓС‰Р°СЏ СЃС‚СЂР°РЅРёС†Р°):**

```
[Catalog]
 в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
  color: var(--accent)
  border-bottom: var(--accent)
  background: transparent
```

### **4. Active + Hover:**

```
[Catalog]
 в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
  color: var(--accent)
  background: var(--bg-hover)
  border-bottom: var(--accent)
```

### **5. Active РЅР° Mobile:**

```
в”Њв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”ђ
в”‚ Catalog  в”‚
в”‚ в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ  в”‚
в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”
  color: var(--accent)
  background: var(--accent-glow)
  border-bottom: var(--accent)
```

---

## в™ї Accessibility

### **1. aria-current**

```tsx
aria-current={currentPath === '/' ? 'page' : undefined}
```

- вњ… Screen readers РѕР±СЉСЏРІР»СЏСЋС‚ С‚РµРєСѓС‰СѓСЋ СЃС‚СЂР°РЅРёС†Сѓ
- вњ… РЎРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ W3C WAI СЃС‚Р°РЅРґР°СЂС‚Р°Рј

### **2. Touch Targets**

```css
min-height: 44px; /* Desktop & Mobile */
min-height: 40px; /* Small Mobile */
min-height: 36px; /* Extra Small */
```

- вњ… РЎРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ WCAG 2.1 Level AA (РјРёРЅРёРјСѓРј 44Г—44px РЅР° desktop)
- вњ… РђРґР°РїС‚РёРІРЅРѕ СѓРјРµРЅСЊС€Р°РµС‚СЃСЏ РЅР° РѕС‡РµРЅСЊ РјР°Р»РµРЅСЊРєРёС… СЌРєСЂР°РЅР°С…

### **3. Focus Visible**

```css
.nav-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- вњ… Keyboard navigation
- вњ… Р§РµС‚РєРёР№ focus indicator

### **4. Semantic HTML**

```html
<nav aria-label="Main navigation">
  <a href="/">...</a>
</nav>
```

- вњ… `<nav>` element
- вњ… `aria-label` РґР»СЏ РєРѕРЅС‚РµРєСЃС‚Р°

---

## рџ”Ќ РЎСЂР°РІРЅРµРЅРёРµ: Р”Рѕ vs РџРѕСЃР»Рµ

| РђСЃРїРµРєС‚          | Р”Рѕ                   | РџРѕСЃР»Рµ                          |
| --------------------- | ---------------------- | ----------------------------------- |
| **Active State**      | вќЊ РќРµС‚             | вњ… Underline + Color               |
| **Hover Preview**     | вљ пёЏ Background only | вњ… Background + Dim Underline      |
| **aria-current**      | вќЊ РќРµС‚             | вњ… Р”Р°                            |
| **Touch Target**      | вљ пёЏ ~40px           | вњ… 44px (desktop)                  |
| **Visual Pattern**    | вќЊ Custom             | вњ… Material Design Standard        |
| **Mobile Visibility** | вљ пёЏ РЎСЂРµРґРЅСЏСЏ  | вњ… РћС‚Р»РёС‡РЅР°СЏ (underline+bg) |

---

## рџ’Ў Design Decisions

### **РџРѕС‡РµРјСѓ Underline Tabs?**

1. вњ… **РРЅРґСѓСЃС‚СЂРёР°Р»СЊРЅС‹Р№ СЃС‚Р°РЅРґР°СЂС‚** - Material Design, GitHub, VSCode
2. вњ… **РњРёРЅРёРјР°Р»РёСЃС‚РёС‡РЅС‹Р№** - РЅРµ РїРµСЂРµРіСЂСѓР¶Р°РµС‚ UI
3. вњ… **Р§РµС‚РєРёР№ active state** - СЃСЂР°Р·Сѓ РІРёРґРЅРѕ РіРґРµ С‚С‹
4. вњ… **РќРµ РєРѕРЅС„Р»РёРєС‚СѓРµС‚** СЃ action buttons
5. вњ… **Accessibility** - Р»РµРіРєРѕ РґРѕР±Р°РІРёС‚СЊ aria-current

### **РџРѕС‡РµРјСѓ Background РЅР° Mobile?**

1. вњ… **Р’РёРґРёРјРѕСЃС‚СЊ** - underline РјРѕР¶РµС‚ Р±С‹С‚СЊ РЅРµР·Р°РјРµС‚РµРЅ РЅР° РјР°Р»РµРЅСЊРєРёС… СЌРєСЂР°РЅР°С…
2. вњ… **Touch feedback** - С„РѕРЅ РїРѕРєР°Р·С‹РІР°РµС‚ РєР»РёРєР°Р±РµР»СЊРЅСѓСЋ РѕР±Р»Р°СЃС‚СЊ
3. вњ… **РљРѕРјР±РёРЅР°С†РёСЏ** - underline + background = РјР°РєСЃРёРјР°Р»СЊРЅР°СЏ СЏСЃРЅРѕСЃС‚СЊ

### **РџРѕС‡РµРјСѓ 2px Border?**

1. вњ… **Р’РёРґРёРјРѕСЃС‚СЊ** - 1px РјРѕР¶РµС‚ Р±С‹С‚СЊ СЃР»РёС€РєРѕРј С‚РѕРЅРєРёРј
2. вњ… **РЎС‚Р°РЅРґР°СЂС‚** - Material Design РёСЃРїРѕР»СЊР·СѓРµС‚ 2px
3. вњ… **Р‘Р°Р»Р°РЅСЃ** - РЅРµ СЃР»РёС€РєРѕРј С‚РѕР»СЃС‚С‹Р№, РЅРµ СЃР»РёС€РєРѕРј С‚РѕРЅРєРёР№

---

## рџ§Є РџСЂРёРјРµСЂС‹ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёСЏ

### **РќР° СЃС‚СЂР°РЅРёС†Рµ Catalog:**

```tsx
// URL: /
currentPath === '/'  // true

<nav>
  <a class="nav-link active" aria-current="page">
    Catalog
  </a>
  <a class="nav-link">
    Cabinet
  </a>
</nav>
```

**Р’РёР·СѓР°Р»СЊРЅРѕ:**

```
[Catalog]  [Cabinet]
 в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
```

---

### **РќР° СЃС‚СЂР°РЅРёС†Рµ Cabinet:**

```tsx
// URL: /cabinet
currentPath === '/cabinet'  // true

<nav>
  <a class="nav-link">
    Catalog
  </a>
  <a class="nav-link active" aria-current="page">
    Cabinet
  </a>
</nav>
```

**Р’РёР·СѓР°Р»СЊРЅРѕ:**

```
[Catalog]  [Cabinet]
            в”Ѓв”Ѓв”Ѓв”Ѓв”Ѓв”Ѓ
```

---

## рџ“‹ Checklist

- [x] Р”РѕР±Р°РІР»РµРЅ state РґР»СЏ РѕС‚СЃР»РµР¶РёРІР°РЅРёСЏ currentPath
- [x] Р”РѕР±Р°РІР»РµРЅ РєР»Р°СЃСЃ `.active` РґР»СЏ С‚РµРєСѓС‰РµР№ СЃС‚СЂР°РЅРёС†С‹
- [x] Р”РѕР±Р°РІР»РµРЅ `aria-current="page"`
- [x] Р РµР°Р»РёР·РѕРІР°РЅ Underline Tabs pattern
- [x] РЈРІРµР»РёС‡РµРЅ min-height РґРѕ 44px
- [x] Р”РѕР±Р°РІР»РµРЅ hover preview СЃ dim underline
- [x] Р”РѕР±Р°РІР»РµРЅ background РґР»СЏ active state РЅР° mobile
- [x] РћР±РЅРѕРІР»РµРЅС‹ СЃС‚РёР»Рё РґР»СЏ РІСЃРµС… breakpoints
- [x] Focus-visible РґР»СЏ keyboard navigation
- [x] Semantic HTML СЃ <nav> Рё aria-label

---

## рџЋ‰ РС‚РѕРі

**Р РµР°Р»РёР·РѕРІР°РЅРѕ:**

- вњ… **Active State** - С‡РµС‚РєРёР№ visual indicator С‚РµРєСѓС‰РµР№ СЃС‚СЂР°РЅРёС†С‹
- вњ… **Underline Tabs** - РёРЅРґСѓСЃС‚СЂРёР°Р»СЊРЅС‹Р№ СЃС‚Р°РЅРґР°СЂС‚
- вњ… **Accessibility** - aria-current, touch targets, focus states
- вњ… **Responsive** - Р°РґР°РїС‚РёРІРЅРѕ РЅР° РІСЃРµС… СЌРєСЂР°РЅР°С…
- вњ… **UX** - hover preview, РїРѕРЅСЏС‚РЅР°СЏ РЅР°РІРёРіР°С†РёСЏ

**РЎРѕРѕС‚РІРµС‚СЃС‚РІРёРµ РіР°Р№РґР»Р°Р№РЅР°Рј:**

- вњ… Nielsen Norman Group - visible navigation, current page indicator
- вњ… W3C WAI - semantic HTML, aria-current
- вњ… Material Design - underline tabs pattern
- вњ… WCAG 2.1 Level AA - touch targets, contrast, focus states

---

**Р”Р°С‚Р° СЂРµР°Р»РёР·Р°С†РёРё:** 2026-02-01  
**РЎС‚Р°С‚СѓСЃ:** вњ… Р—Р°РІРµСЂС€РµРЅРѕ  
**РџР°С‚С‚РµСЂРЅ:** Underline Tabs (Material Design)
