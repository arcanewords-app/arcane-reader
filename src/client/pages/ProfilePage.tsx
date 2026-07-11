import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { ReadingHistorySection } from '../components/Cabinet/ReadingHistorySection';
import { ReaderSettingsPanel } from '../components/ChapterView/ReaderSettings';
import { api } from '../api/client';
import { authService } from '../services/authService';
import { useUserRole } from '../hooks/useUserRole';
import { Button, Icon } from '../components/ui';
import { UpgradeRequestActions } from '../components/UpgradeRequest';
import { canRequestTierUpgrade } from '../../shared/accountTiers';
import type { ReaderSettings } from '../types';
import type { UserRole } from '../../types/roles';
import { DEFAULT_READER_SETTINGS, LEGACY_FONT_MAP } from '../types';
import { TranslatorPseudonymsSection } from '../components/TranslatorPseudonym/TranslatorPseudonymsSection';
import {
  buildProfileUrl,
  getRawProfileTabFromUrl,
  isProfileTab,
  parseProfileTabFromUrl,
  type ProfileTab,
} from '../utils/profileRoutes';
import { useUrlSync } from '../hooks/useUrlSync';
import '../components/TranslatorPseudonym/TranslatorPseudonymsSection.css';
import './ProfilePage.css';

const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  guest: 'profile.roleUser',
  user: 'profile.roleUser',
  author: 'profile.roleAuthor',
  author_plus: 'profile.roleAuthorPlus',
  super_author: 'profile.roleSuperAuthor',
  admin: 'profile.roleAdmin',
};

const ACCENT_ROLE_BADGES = new Set<UserRole>(['author', 'author_plus', 'super_author']);

function getInitials(email: string): string {
  const part = email.split('@')[0];
  if (!part) return '?';
  const match = part.match(/^([a-zA-Zа-яА-ЯёЁ])/);
  return match ? match[1].toUpperCase() : '?';
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, role, isAtLeast } = useUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { state: activeTab, setState: setActiveTab } = useUrlSync<ProfileTab>({
    parse: parseProfileTabFromUrl,
    build: buildProfileUrl,
    pathnameGuard: () => window.location.pathname === '/profile',
    historyMode: 'push',
  });
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => ({
    ...DEFAULT_READER_SETTINGS,
  }));
  const [readerSettingsLoaded, setReaderSettingsLoaded] = useState(false);

  const showUpgrade = user != null && canRequestTierUpgrade(role);

  useEffect(() => {
    const raw = getRawProfileTabFromUrl();
    if (raw && !isProfileTab(raw)) {
      route(buildProfileUrl('reading'), true);
      setActiveTab('reading', { syncUrl: false });
    }
  }, [setActiveTab]);

  const handleTabClick = useCallback(
    (tab: ProfileTab) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
    },
    [activeTab, setActiveTab]
  );

  useEffect(() => {
    let cancelled = false;
    api
      .getUserReaderSettings()
      .then((userSettings) => {
        if (!cancelled && userSettings) {
          let fontFamily = userSettings.fontFamily ?? DEFAULT_READER_SETTINGS.fontFamily;
          const legacy = LEGACY_FONT_MAP[fontFamily as keyof typeof LEGACY_FONT_MAP];
          if (legacy) fontFamily = legacy;
          setReaderSettings({ ...DEFAULT_READER_SETTINGS, ...userSettings, fontFamily });
        }
        if (!cancelled) setReaderSettingsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setReaderSettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReaderSettingsChange = async (updates: Partial<ReaderSettings>) => {
    const newSettings = { ...readerSettings, ...updates };
    setReaderSettings(newSettings);
    await api.updateUserReaderSettings(newSettings).catch(() => {});
  };

  const handleAvatarUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !user) return;
    setAvatarUploading(true);
    try {
      const { avatarUrl } = await api.uploadAvatar(file);
      authService.updateUserCache({ avatarUrl: avatarUrl ?? undefined });
    } catch {
      // Error handled by API client
    } finally {
      setAvatarUploading(false);
      input.value = '';
    }
  };

  const tabs: { id: ProfileTab; labelKey: string }[] = [
    { id: 'reading', labelKey: 'profile.reading' },
    { id: 'settings', labelKey: 'profile.settings' },
    { id: 'profile', labelKey: 'profile.profile' },
  ];

  return (
    <div class="profile-page">
      <div class="profile-page-header">
        <button type="button" class="profile-page-back" onClick={() => route('/catalog')}>
          {t('common.back')}
        </button>
      </div>
      <div class="profile-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            class={`profile-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div class="profile-content">
        {activeTab === 'reading' && (
          <div class="profile-section">
            <h2 class="profile-section-title">{t('profile.readingTitle')}</h2>
            <ReadingHistorySection />
          </div>
        )}

        {activeTab === 'settings' && (
          <div class="profile-section profile-section-settings">
            <h2 class="profile-section-title">{t('profile.settingsTitle')}</h2>
            {readerSettingsLoaded ? (
              <div class="profile-settings-panel">
                <ReaderSettingsPanel
                  settings={readerSettings}
                  onChange={handleReaderSettingsChange}
                />
              </div>
            ) : (
              <div class="profile-settings-loading">{t('common.loading')}</div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div class="profile-section profile-section-profile">
            <h2 class="profile-section-title">{t('profile.profileTitle')}</h2>
            <div class="profile-cards">
              {user && (
                <div class="profile-card">
                  <div class="profile-identity">
                    <div class="profile-avatar-preview">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt="" class="profile-avatar-img" />
                      ) : (
                        <span class="profile-avatar-initials">{getInitials(user.email)}</span>
                      )}
                    </div>
                    <div class="profile-identity-meta">
                      <p class="profile-email">{user.email}</p>
                      <div class="profile-role-row">
                        <span
                          class={`profile-role-badge${ACCENT_ROLE_BADGES.has(role) ? ' profile-role-badge--accent' : ''}`}
                        >
                          {t(ROLE_LABEL_KEYS[role])}
                        </span>
                        <button
                          type="button"
                          class="profile-tiers-link"
                          onClick={() => route('/account-tiers')}
                        >
                          <Icon name="workspace_premium" size="sm" />
                          {t('profile.tiersLink')}
                        </button>
                      </div>
                      {role === 'super_author' && (
                        <p class="profile-max-tier">{t('profile.maxTierReached')}</p>
                      )}
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    class="profile-avatar-input"
                    onChange={handleAvatarUpload}
                    disabled={avatarUploading}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarUploading}
                    loading={avatarUploading}
                  >
                    {t('profile.uploadAvatar')}
                  </Button>
                </div>
              )}

              {showUpgrade && (
                <div class="profile-card profile-card-upgrade">
                  <h3 class="profile-card-upgrade-title">{t('profile.cardUpgradeTitle')}</h3>
                  <p class="profile-upgrade-hint">{t('profile.upgradeHint')}</p>
                  <UpgradeRequestActions
                    showCompareTiers={false}
                    mailSubject={t('profile.upgradeMailSubject')}
                    userEmail={user!.email}
                    requestUpgradeLabel={t('profile.upgradeButton')}
                  />
                  <Button variant="secondary" size="sm" onClick={() => route('/account-tiers')}>
                    {t('tiers.viewFullComparison')}
                  </Button>
                </div>
              )}

              {user && isAtLeast('author') && (
                <div class="profile-card">
                  <TranslatorPseudonymsSection inCard />
                </div>
              )}

              {user && !isAtLeast('author') && (
                <p class="profile-pseudonym-hint">{t('translatorPseudonym.authorOnlyHint')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
