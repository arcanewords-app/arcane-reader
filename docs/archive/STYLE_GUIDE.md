---
stale: true
status: archived
domain: meta
---

# рџЋЁ Arcane Reader вЂ” Style Guide

> Р”РѕРєСѓРјРµРЅС‚Р°С†РёСЏ РїРѕ РґРёР·Р°Р№РЅ-СЃРёСЃС‚РµРјРµ Рё UI/UX СЃС‚Р°РЅРґР°СЂС‚Р°Рј РїСЂРѕРµРєС‚Р°  
> Р’РµСЂСЃРёСЏ: 2.0 (РѕР±РЅРѕРІР»РµРЅРѕ: 2026)  
> РЎРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚: WCAG 2.1 Level AA

---

## рџ“‹ РЎРѕРґРµСЂР¶Р°РЅРёРµ

1. [РџСЂРёРЅС†РёРїС‹ РґРёР·Р°Р№РЅР°](#РїСЂРёРЅС†РёРїС‹-РґРёР·Р°Р№РЅР°)
2. [Р¦РІРµС‚РѕРІР°СЏ РїР°Р»РёС‚СЂР°](#С†РІРµС‚РѕРІР°СЏ-РїР°Р»РёС‚СЂР°)
3. [РўРёРїРѕРіСЂР°С„РёРєР°](#С‚РёРїРѕРіСЂР°С„РёРєР°)
4. [РљРѕРјРїРѕРЅРµРЅС‚С‹](#РєРѕРјРїРѕРЅРµРЅС‚С‹)
5. [Spacing & Layout](#spacing--layout)
6. [Accessibility](#accessibility)
7. [Responsive Design](#responsive-design)
8. [Best Practices](#best-practices)

---

## рџЋЇ РџСЂРёРЅС†РёРїС‹ РґРёР·Р°Р№РЅР°

### 1. **Р§РёС‚Р°РµРјРѕСЃС‚СЊ РїСЂРµРІС‹С€Рµ РІСЃРµРіРѕ**
- РњРёРЅРёРјР°Р»СЊРЅС‹Р№ РєРѕРЅС‚СЂР°СЃС‚ С‚РµРєСЃС‚Р°: **4.5:1** (WCAG AA)
- Р Р°Р·РјРµСЂ РѕСЃРЅРѕРІРЅРѕРіРѕ С‚РµРєСЃС‚Р°: **в‰Ґ16px** (1rem)
- Р Р°Р·РјРµСЂ РІС‚РѕСЂРёС‡РЅРѕРіРѕ С‚РµРєСЃС‚Р°: **в‰Ґ15px** (0.9375rem)
- РњРёРЅРёРјР°Р»СЊРЅС‹Р№ СЂР°Р·РјРµСЂ: **14px** (0.875rem)

### 2. **РџСЂРѕСЃС‚РѕС‚Р° Рё СЏСЃРЅРѕСЃС‚СЊ**
- РЈР±СЂР°РЅС‹ СЃР»РѕР¶РЅС‹Рµ РіСЂР°РґРёРµРЅС‚С‹ Рё СЌС„С„РµРєС‚С‹
- Р§РёСЃС‚С‹Рµ, РїРѕРЅСЏС‚РЅС‹Рµ РёРЅС‚РµСЂС„РµР№СЃС‹
- РџСЂРµРґСЃРєР°Р·СѓРµРјРѕРµ РїРѕРІРµРґРµРЅРёРµ РєРѕРјРїРѕРЅРµРЅС‚РѕРІ

### 3. **Р”РѕСЃС‚СѓРїРЅРѕСЃС‚СЊ**
- Р’СЃРµ РёРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹: **в‰Ґ44Г—44px**
- Р’РёРґРёРјС‹Рµ focus states (`:focus-visible`)
- РљР»Р°РІРёР°С‚СѓСЂРЅР°СЏ РЅР°РІРёРіР°С†РёСЏ РІРµР·РґРµ
- РЎРµРјР°РЅС‚РёС‡РµСЃРєРёР№ HTML

### 4. **РџСЂРѕРёР·РІРѕРґРёС‚РµР»СЊРЅРѕСЃС‚СЊ**
- Variable Fonts (Inter)
- РњРёРЅРёРјСѓРј Р°РЅРёРјР°С†РёР№ (0.2s СЃС‚Р°РЅРґР°СЂС‚)
- Р›РµРіРєРёРµ С‚РµРЅРё Рё СЌС„С„РµРєС‚С‹

---

## рџЋЁ Р¦РІРµС‚РѕРІР°СЏ РїР°Р»РёС‚СЂР°

### Р‘Р°Р·РѕРІС‹Рµ С†РІРµС‚Р° UI

```css
/* Р¤РѕРЅС‹ */
--bg-primary: #0d0d12;      /* РћСЃРЅРѕРІРЅРѕР№ С„РѕРЅ */
--bg-secondary: #15151d;    /* Р’С‚РѕСЂРёС‡РЅС‹Рµ СЌР»РµРјРµРЅС‚С‹ */
--bg-card: #1d1d28;         /* РљР°СЂС‚РѕС‡РєРё, РёРЅРїСѓС‚С‹ */
--bg-hover: #25252f;        /* Hover СЃРѕСЃС‚РѕСЏРЅРёРµ */

/* РўРµРєСЃС‚ (WCAG AA+) */
--text-primary: #f0f0f3;    /* РћСЃРЅРѕРІРЅРѕР№ С‚РµРєСЃС‚ (14:1) */
--text-secondary: #b4b9c5;  /* Р’С‚РѕСЂРёС‡РЅС‹Р№ С‚РµРєСЃС‚ (8:1) */
--text-dim: #878d9a;        /* РўСѓСЃРєР»С‹Р№ С‚РµРєСЃС‚ (4.8:1) */

/* РђРєС†РµРЅС‚С‹ */
--accent: #9d6fff;          /* РћСЃРЅРѕРІРЅРѕР№ Р°РєС†РµРЅС‚ */
--accent-dim: #7c3aed;      /* РўРµРјРЅРµРµ */
--accent-bright: #b794ff;   /* РЎРІРµС‚Р»РµРµ (С…РѕРІРµСЂ) */
--accent-glow: rgba(157, 111, 255, 0.35);

/* Р“СЂР°РЅРёС†С‹ */
--border: rgba(255, 255, 255, 0.08);
--border-hover: rgba(157, 111, 255, 0.3);
--border-focus: rgba(157, 111, 255, 0.5);

/* РЎС‚Р°С‚СѓСЃС‹ */
--success: #22c55e;
--warning: #f59e0b;
--error: #ef4444;
```

### РџСЂРѕРІРµСЂРєР° РєРѕРЅС‚СЂР°СЃС‚Р°

РСЃРїРѕР»СЊР·СѓР№С‚Рµ [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/):

| РљРѕРјР±РёРЅР°С†РёСЏ | РљРѕРЅС‚СЂР°СЃС‚ | WCAG |
|------------|----------|------|
| `text-primary` РЅР° `bg-primary` | 14:1 | AAA вњ… |
| `text-secondary` РЅР° `bg-secondary` | 8:1 | AAA вњ… |
| `text-dim` РЅР° `bg-card` | 4.8:1 | AA вњ… |
| `white` РЅР° `accent` | 4.7:1 | AA вњ… |

### Р¦РІРµС‚Р° С‡РёС‚Р°Р»РєРё

```css
/* РўРµРјРЅР°СЏ С‚РµРјР° (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ) */
[data-reader-theme='dark'] {
  --reader-bg: #1a1a2e;
  --reader-text: #f0f0f3;
  --reader-text-dim: #b4b9c5;
  --reader-accent: #9d6fff;
}

/* РЎРІРµС‚Р»Р°СЏ С‚РµРјР° */
[data-reader-theme='light'] {
  --reader-bg: #fafafa;
  --reader-text: #1f1f1f;
  --reader-text-dim: #6b7280;
  --reader-accent: #7c3aed;
}

/* Sepia */
[data-reader-theme='sepia'] {
  --reader-bg: #f4ecd8;
  --reader-text: #5c4b37;
  --reader-text-dim: #8b7355;
  --reader-accent: #8b6914;
}

/* High Contrast */
[data-reader-theme='contrast'] {
  --reader-bg: #000000;
  --reader-text: #ffffff;
  --reader-text-dim: #cccccc;
  --reader-accent: #ffcc00;
}
```

---

## вњЌпёЏ РўРёРїРѕРіСЂР°С„РёРєР°

### РЁСЂРёС„С‚С‹

```css
/* UI С€СЂРёС„С‚С‹ */
--font-display: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Р§РёС‚Р°Р»РєР° */
--reader-font: 'Literata', Georgia, serif;
```

**РџРѕС‡РµРјСѓ Inter?**
- РћРїС‚РёРјРёР·РёСЂРѕРІР°РЅ РґР»СЏ UI Рё СЌРєСЂР°РЅРѕРІ
- РћС‚Р»РёС‡РЅР°СЏ С‡РёС‚Р°РµРјРѕСЃС‚СЊ РЅР° РІСЃРµС… СЂР°Р·РјРµСЂР°С…
- Р‘РѕР»СЊС€Р°СЏ x-height, РѕС‚РєСЂС‹С‚С‹Рµ Р°РїРµСЂС‚СѓСЂС‹
- РџРѕРґРґРµСЂР¶РєР° Variable Font

### Р Р°Р·РјРµСЂС‹ Рё РІРµСЃР°

```css
/* Р‘Р°Р·РѕРІС‹Р№ СЂР°Р·РјРµСЂ */
html {
  font-size: clamp(14px, 0.875rem + 0.25vw, 16px);
}

body {
  font-weight: 450; /* Inter Variable */
  line-height: 1.6;
}

/* Р—Р°РіРѕР»РѕРІРєРё */
h1 { 
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

h2 { 
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
  line-height: 1.2;
}

h3 { 
  font-size: clamp(1.25rem, 2.5vw, 1.5rem);
  font-weight: 700;
}

/* РџР°СЂР°РіСЂР°С„С‹ */
p {
  line-height: 1.65;
  color: var(--text-secondary);
}

/* Emphasis */
strong, b {
  font-weight: 650;
  color: var(--text-primary);
}

/* РљРЅРѕРїРєРё */
.btn {
  font-size: 1rem;
  font-weight: 550;
  line-height: 1.2;
}

.btn-sm {
  font-size: 0.9375rem;
}
```

### РРµСЂР°СЂС…РёСЏ С€СЂРёС„С‚РѕРІ

| Р­Р»РµРјРµРЅС‚ | Р Р°Р·РјРµСЂ | Р’РµСЃ | РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ |
|---------|--------|-----|--------------|
| H1 | 1.75-2.5rem | 700 | Р“Р»Р°РІРЅС‹Рµ Р·Р°РіРѕР»РѕРІРєРё СЃС‚СЂР°РЅРёС† |
| H2 | 1.5-2rem | 700 | РЎРµРєС†РёРё |
| H3 | 1.25-1.5rem | 700 | РџРѕРґСЃРµРєС†РёРё |
| Body | 1rem | 450 | РћСЃРЅРѕРІРЅРѕР№ С‚РµРєСЃС‚ |
| Secondary | 0.9375rem | 500 | Р’С‚РѕСЂРёС‡РЅР°СЏ РёРЅС„РѕСЂРјР°С†РёСЏ |
| Small | 0.875rem | 500 | Р›РµР№Р±Р»С‹, РїРѕРґРїРёСЃРё |
| Caption | 0.75rem | 550 | РљР°РїС€РµРЅС‹, РјРµС‚Р°РґР°РЅРЅС‹Рµ |

### Р§РёС‚Р°РµРјРѕСЃС‚СЊ С‚РµРєСЃС‚Р°

```css
/* Р§РёС‚Р°Р»РєР° - РѕРїС‚РёРјРёР·РёСЂРѕРІР°РЅРЅР°СЏ С‚РёРїРѕРіСЂР°С„РёРєР° */
.paragraph-text {
  font-family: var(--reader-font);
  font-size: clamp(1rem, 1.5vw, 1.125rem);
  line-height: 1.75;
  color: var(--reader-text);
}

/* Р”Р»РёРЅР° СЃС‚СЂРѕРєРё */
.reading-content {
  max-width: 65ch; /* 45-75 РѕРїС‚РёРјСѓРј */
}
```

---

## рџ§© РљРѕРјРїРѕРЅРµРЅС‚С‹

### 1. РљРЅРѕРїРєРё

#### Primary Button

```css
.btn-primary {
  background: var(--accent);
  color: white;
  border: 2px solid var(--accent);
  padding: 0.75rem 1.5rem;
  min-height: 44px;
  border-radius: var(--radius-md);
  font-weight: 550;
}

.btn-primary:hover {
  background: var(--accent-bright);
  transform: translateY(-1px);
}
```

**РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ:**
- РћСЃРЅРѕРІРЅС‹Рµ РґРµР№СЃС‚РІРёСЏ (Save, Submit, Create)
- РњР°РєСЃРёРјСѓРј РѕРґРЅР° РЅР° СЃС‚СЂР°РЅРёС†Рµ/СЃРµРєС†РёРё

#### Secondary Button

```css
.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 2px solid rgba(255, 255, 255, 0.15);
}

.btn-secondary:hover {
  border-color: var(--border-hover);
  color: var(--accent-bright);
}
```

**РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ:**
- Р’С‚РѕСЂРёС‡РЅС‹Рµ РґРµР№СЃС‚РІРёСЏ (Cancel, Back)
- РќР°РІРёРіР°С†РёРѕРЅРЅС‹Рµ РєРЅРѕРїРєРё

#### Р Р°Р·РјРµСЂС‹

```css
.btn-sm {
  padding: 0.625rem 1.25rem;
  min-height: 40px;
  font-size: 0.9375rem;
}

.btn-full {
  width: 100%;
}
```

#### Accessibility

```css
.btn:focus-visible {
  outline: 3px solid var(--accent-bright);
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

---

### 2. РРЅРїСѓС‚С‹ Рё С„РѕСЂРјС‹

```css
.form-input {
  padding: 0.875rem 1rem;
  min-height: 48px;
  background: var(--bg-card);
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 450;
}

.form-input:hover {
  border-color: var(--border-hover);
  background: var(--bg-hover);
}

.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

.form-label {
  color: var(--text-primary);
  font-size: 0.9375rem;
  font-weight: 550;
  margin-bottom: 0.5rem;
}
```

**РџСЂР°РІРёР»Р°:**
- Label РІСЃРµРіРґР° РЅР°Рґ input
- Placeholder - hints, РЅРµ РёРЅСЃС‚СЂСѓРєС†РёРё
- Error states: РєСЂР°СЃРЅР°СЏ СЂР°РјРєР° + СЃРѕРѕР±С‰РµРЅРёРµ
- Min-height: 48px

---

### 3. РљР°СЂС‚РѕС‡РєРё

```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
}

.card:hover {
  border-color: var(--border-hover);
  box-shadow: 0 4px 24px rgba(157, 111, 255, 0.15);
  transform: translateY(-2px);
}

.card-title {
  font-size: 1.125rem;
  font-weight: 650;
  color: var(--text-primary);
}
```

---

### 4. РњРѕРґР°Р»СЊРЅС‹Рµ РѕРєРЅР°

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 2rem;
  max-width: 800px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.modal-title {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
```

**Accessibility:**
- ESC Р·Р°РєСЂС‹РІР°РµС‚
- Focus trap РІРЅСѓС‚СЂРё РјРѕРґР°Р»РєРё
- Р—Р°РєСЂС‹С‚РёРµ РїРѕ РєР»РёРєСѓ РЅР° overlay

---

## рџ“ђ Spacing & Layout

### Spacing System

```css
--space-xs: 0.25rem;    /* 4px */
--space-sm: 0.5rem;     /* 8px */
--space-md: 1rem;       /* 16px */
--space-lg: 1.5rem;     /* 24px */
--space-xl: 2rem;       /* 32px */
```

**РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ:**
- `xs`: РјРµР¶РґСѓ РёРєРѕРЅРєРѕР№ Рё С‚РµРєСЃС‚РѕРј
- `sm`: РјРµР¶РґСѓ СЃРІСЏР·Р°РЅРЅС‹РјРё СЌР»РµРјРµРЅС‚Р°РјРё
- `md`: СЃС‚Р°РЅРґР°СЂС‚РЅС‹Р№ padding, gap
- `lg`: РјРµР¶РґСѓ СЃРµРєС†РёСЏРјРё
- `xl`: РјРµР¶РґСѓ РєСЂСѓРїРЅС‹РјРё Р±Р»РѕРєР°РјРё

### Border Radius

```css
--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 20px;
--radius-full: 9999px;
```

**РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ:**
- `sm`: РјРµР»РєРёРµ СЌР»РµРјРµРЅС‚С‹ (badges)
- `md`: РєРЅРѕРїРєРё, РёРЅРїСѓС‚С‹
- `lg`: РєР°СЂС‚РѕС‡РєРё
- `xl`: РјРѕРґР°Р»СЊРЅС‹Рµ РѕРєРЅР°
- `full`: pills, СЃС‚Р°С‚СѓСЃС‹

### Container Widths

```css
/* Mobile (в‰¤767px) */
--container-width-mobile: 100%;

/* Tablet (768px - 1023px) */
--container-width-tablet: 768px;

/* Desktop (в‰Ґ1024px) */
--container-width-desktop: 1200px;
```

---

## в™ї Accessibility

### WCAG 2.1 Level AA Compliance

#### 1. РљРѕРЅС‚СЂР°СЃС‚ С†РІРµС‚РѕРІ
- вњ… РўРµРєСЃС‚: РјРёРЅРёРјСѓРј **4.5:1**
- вњ… РљСЂСѓРїРЅС‹Р№ С‚РµРєСЃС‚ (18pt+): РјРёРЅРёРјСѓРј **3:1**
- вњ… UI СЌР»РµРјРµРЅС‚С‹: РјРёРЅРёРјСѓРј **3:1**

#### 2. РРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹
- вњ… РњРёРЅРёРјР°Р»СЊРЅС‹Р№ СЂР°Р·РјРµСЂ: **44Г—44px**
- вњ… Р’РёРґРёРјС‹Р№ focus state
- вњ… РљР»Р°РІРёР°С‚СѓСЂРЅР°СЏ РЅР°РІРёРіР°С†РёСЏ

#### 3. Focus States

```css
/* Р“Р»РѕР±Р°Р»СЊРЅС‹Р№ focus */
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* РљРЅРѕРїРєРё */
.btn:focus-visible {
  outline: 3px solid var(--accent-bright);
  outline-offset: 2px;
}

/* РРЅРїСѓС‚С‹ */
.form-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
  outline: none;
}
```

#### 4. РЎРµРјР°РЅС‚РёС‡РµСЃРєРёР№ HTML

```html
<!-- вњ… РҐРѕСЂРѕС€Рѕ -->
<button type="button" aria-label="Close">Г—</button>
<nav aria-label="Main navigation">
<label for="email">Email</label>
<input id="email" type="email">

<!-- вќЊ РџР»РѕС…Рѕ -->
<div onclick="close()">Г—</div>
<div class="nav">
<span>Email</span><input>
```

#### 5. РљР»Р°РІРёР°С‚СѓСЂРЅР°СЏ РЅР°РІРёРіР°С†РёСЏ

- `Tab` / `Shift+Tab` вЂ” РЅР°РІРёРіР°С†РёСЏ
- `Enter` / `Space` вЂ” Р°РєС‚РёРІР°С†РёСЏ
- `Esc` вЂ” Р·Р°РєСЂС‹С‚РёРµ РјРѕРґР°Р»РѕРє
- `Arrow keys` вЂ” РЅР°РІРёРіР°С†РёСЏ РІ СЃРїРёСЃРєР°С…

---

## рџ“± Responsive Design

### Breakpoints

```css
/* Mobile First */
/* Base: в‰¤767px */

/* Tablet: 768px - 1023px */
@media (min-width: 768px) and (max-width: 1023px) {
  /* Tablet styles */
}

/* Desktop: в‰Ґ1024px */
@media (min-width: 1024px) {
  /* Desktop styles */
}

/* Small mobile: в‰¤480px */
@media (max-width: 480px) {
  /* Extra small */
}
```

### Fluid Typography

```css
/* РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ clamp() РґР»СЏ Р°РґР°РїС‚РёРІРЅС‹С… СЂР°Р·РјРµСЂРѕРІ */
font-size: clamp(1rem, 1.5vw, 1.125rem);

/* min, preferred, max */
/* 1rem = РјРёРЅРёРјСѓРј РЅР° РјРѕР±РёР»СЊРЅС‹С… */
/* 1.5vw = РјР°СЃС€С‚Р°Р±РёСЂСѓРµС‚СЃСЏ СЃ СЌРєСЂР°РЅРѕРј */
/* 1.125rem = РјР°РєСЃРёРјСѓРј РЅР° РґРµСЃРєС‚РѕРїРµ */
```

### Touch Targets

```css
/* РњРёРЅРёРјСѓРј РґР»СЏ touch */
.interactive-element {
  min-height: 44px;
  min-width: 44px;
}

/* в‰¤480px - СѓРІРµР»РёС‡РёС‚СЊ */
@media (max-width: 480px) {
  .btn, .form-input {
    min-height: 48px;
  }
}
```

---

## вњЁ Best Practices

### 1. Transitions

```css
/* РЎС‚Р°РЅРґР°СЂС‚РЅС‹Рµ */
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-emphasized: cubic-bezier(0.4, 0, 0.2, 1);
--duration-fast: 0.15s;
--duration-normal: 0.2s;
--duration-slow: 0.3s;

/* РСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ */
transition: all var(--duration-normal) var(--ease-standard);
```

**Р§С‚Рѕ Р°РЅРёРјРёСЂРѕРІР°С‚СЊ:**
- `transform` вЂ” Р±С‹СЃС‚СЂРѕ, РЅРµ РІС‹Р·С‹РІР°РµС‚ reflow
- `opacity` вЂ” Р±С‹СЃС‚СЂРѕ
- `color`, `background` вЂ” РґРѕРїСѓСЃС‚РёРјРѕ
- вќЊ `width`, `height` вЂ” РјРµРґР»РµРЅРЅРѕ, РёР·Р±РµРіР°С‚СЊ

### 2. РўРµРЅРё

```css
/* Р›РµРіРєРёРµ С‚РµРЅРё */
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);

/* РЎСЂРµРґРЅРёРµ */
box-shadow: 0 4px 16px rgba(157, 111, 255, 0.2);

/* РўСЏР¶РµР»С‹Рµ (РјРѕРґР°Р»РєРё) */
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
```

### 3. Focus Management

```css
/* РЈР±СЂР°С‚СЊ outline РїСЂРё РєР»РёРєРµ РјС‹С€СЊСЋ */
*:focus:not(:focus-visible) {
  outline: none;
}

/* РџРѕРєР°Р·С‹РІР°С‚СЊ РїСЂРё РєР»Р°РІРёР°С‚СѓСЂРЅРѕР№ РЅР°РІРёРіР°С†РёРё */
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### 4. Hover states

```css
/* Р’СЃРµРіРґР° РґРѕР±Р°РІР»СЏС‚СЊ transition */
.element {
  transition: all var(--duration-normal) var(--ease-standard);
}

/* Р’РёР·СѓР°Р»СЊРЅР°СЏ РѕР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ */
.element:hover {
  transform: translateY(-2px);
  /* РёР»Рё scale(1.05) */
}
```

### 5. Loading States

```css
.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

---

## рџ“ќ Р§РµРєР»РёСЃС‚ РґР»СЏ СЂР°Р·СЂР°Р±РѕС‚С‡РёРєРѕРІ

### РџСЂРё СЃРѕР·РґР°РЅРёРё РЅРѕРІРѕРіРѕ РєРѕРјРїРѕРЅРµРЅС‚Р°:

- [ ] РљРѕРЅС‚СЂР°СЃС‚ С‚РµРєСЃС‚Р° в‰Ґ 4.5:1
- [ ] РРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рµ СЌР»РµРјРµРЅС‚С‹ в‰Ґ 44Г—44px
- [ ] Р”РѕР±Р°РІР»РµРЅ `:focus-visible`
- [ ] Р Р°Р±РѕС‚Р°РµС‚ СЃ РєР»Р°РІРёР°С‚СѓСЂС‹
- [ ] РЎРµРјР°РЅС‚РёС‡РµСЃРєРёР№ HTML
- [ ] Responsive (mobile-first)
- [ ] Transitions в‰¤ 0.3s
- [ ] РСЃРїРѕР»СЊР·РѕРІР°РЅС‹ CSS РїРµСЂРµРјРµРЅРЅС‹Рµ
- [ ] РџСЂРѕС‚РµСЃС‚РёСЂРѕРІР°РЅ РЅР° РјРѕР±РёР»СЊРЅС‹С…
- [ ] Lighthouse Accessibility в‰Ґ 95

### РџРµСЂРµРґ РєРѕРјРјРёС‚РѕРј:

- [ ] РќРµС‚ inline styles (РєСЂРѕРјРµ dynamic)
- [ ] CSS РєР»Р°СЃСЃС‹ СЃР»РµРґСѓСЋС‚ BEM РёР»Рё convention
- [ ] РќРµС‚ РјР°РіРёС‡РµСЃРєРёС… С‡РёСЃРµР» (РёСЃРїРѕР»СЊР·СѓРµРј РїРµСЂРµРјРµРЅРЅС‹Рµ)
- [ ] РљРѕРґ РѕС‚С„РѕСЂРјР°С‚РёСЂРѕРІР°РЅ
- [ ] РџСЂРѕРІРµСЂРµРЅ РєРѕРЅС‚СЂР°СЃС‚ РІ DevTools
- [ ] Р Р°Р±РѕС‚Р°РµС‚ РІ Firefox, Chrome, Safari

---

## рџ”— РџРѕР»РµР·РЅС‹Рµ СЃСЃС‹Р»РєРё

### РРЅСЃС‚СЂСѓРјРµРЅС‚С‹:
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE](https://wave.webaim.org/)

### РЎС‚Р°РЅРґР°СЂС‚С‹:
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)

### РЁСЂРёС„С‚С‹:
- [Inter](https://rsms.me/inter/)
- [Literata](https://fonts.google.com/specimen/Literata)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)

---

## рџ“Љ РњРµС‚СЂРёРєРё РєР°С‡РµСЃС‚РІР°

### Р¦РµР»РµРІС‹Рµ РїРѕРєР°Р·Р°С‚РµР»Рё (РґРѕСЃС‚РёРіРЅСѓС‚С‹):

- вњ… РљРѕРЅС‚СЂР°СЃС‚ С‚РµРєСЃС‚Р°: **4.5:1+** (WCAG AA)
- вњ… РњРёРЅРёРјР°Р»СЊРЅС‹Р№ СЂР°Р·РјРµСЂ С‚РµРєСЃС‚Р°: **14px**
- вњ… РўР°С‡-Р·РѕРЅС‹: **44Г—44px**
- вњ… Lighthouse Accessibility: **95+**
- вњ… WCAG 2.1 Level AA: **100%**

---

**РџРѕСЃР»РµРґРЅРµРµ РѕР±РЅРѕРІР»РµРЅРёРµ:** 2026-02-01  
**Р’РµСЂСЃРёСЏ:** 2.0  
**РђРІС‚РѕСЂС‹:** Arcane Team

