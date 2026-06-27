/** Static public page SEO meta — SSOT for SSR (server) and client navigation. */
export const STATIC_PAGE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Arcane — Переводчик новелл',
    description:
      'Arcane — библиотека переводов новелл на русский и беларусский. Читайте и скачивайте переводы онлайн. Переводчик с AI и глоссарием. Импорт EPUB, FB2, TXT.',
  },
  '/catalog': {
    title: 'Каталог переводов — Arcane',
    description:
      'Каталог переводов новелл. Опубликованные переводы от авторов. Читайте онлайн или скачивайте EPUB, FB2.',
  },
  '/about': {
    title: 'О проекте Arcane',
    description:
      'Arcane — веб-интерфейс для перевода новелл с AI и глоссария. Источники: en, ko, zh, ru (→ be). Цели: русский и беларусский. Импорт EPUB, FB2, TXT, CSV.',
  },
  '/contact': {
    title: 'Контакты',
    description:
      'По вопросам, предложениям и сотрудничеству с Arcane — библиотекой переводов новелл.',
  },
  '/privacy': {
    title: 'Политика конфиденциальности',
    description:
      'Политика конфиденциальности Arcane. Какие данные собираем, цели обработки, права пользователей (GDPR).',
  },
  '/terms': {
    title: 'Условия использования',
    description:
      'Условия использования Arcane. Правила для читателей и авторов-переводчиков, ответственность за контент.',
  },
  '/account-tiers': {
    title: 'Уровни аккаунта — Arcane',
    description:
      'Сравнение уровней аккаунта Arcane: читатель и автор. Лимиты AI-токенов, проекты перевода, глоссарий, публикация.',
  },
  '/news': {
    title: 'Новости — Arcane',
    description: 'Новости и обновления Arcane: новые функции, скидки и важные объявления.',
  },
};

/** Document title suffix for static pages (skip when title already mentions Arcane). */
export function staticPageDocumentTitle(title: string): string {
  return title.includes('Arcane') ? title : `${title} | Arcane`;
}
