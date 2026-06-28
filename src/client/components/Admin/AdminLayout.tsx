import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import './AdminLayout.css';

export type AdminTab = 'entities' | 'news' | 'publications' | 'users' | 'translationRequests';

interface AdminLayoutProps {
  activeTab: AdminTab;
  children: preact.ComponentChildren;
}

export function AdminLayout({ activeTab, children }: AdminLayoutProps) {
  const { t } = useTranslation();

  const tabs: Array<{ id: AdminTab; path: string; label: string }> = [
    { id: 'entities', path: '/admin/entities/tag', label: t('admin.tabs.entities') },
    { id: 'news', path: '/admin/news', label: t('admin.tabs.news') },
    { id: 'publications', path: '/admin/publications', label: t('admin.tabs.publications') },
    {
      id: 'translationRequests',
      path: '/translation-requests',
      label: t('admin.tabs.translationRequests'),
    },
    { id: 'users', path: '/admin/users', label: t('admin.tabs.users') },
  ];

  return (
    <div class="admin-layout">
      <header class="admin-layout-header">
        <h1>{t('admin.title')}</h1>
        <nav class="admin-tabs" aria-label={t('admin.tabs.aria')}>
          {tabs.map((tab) => (
            <a
              key={tab.id}
              href={tab.path}
              class={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                route(tab.path);
              }}
            >
              {tab.label}
            </a>
          ))}
        </nav>
      </header>
      <div class="admin-layout-content">{children}</div>
    </div>
  );
}
