import { useState, useEffect, useRef } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { route } from 'preact-router';
import { ReadingHistorySection } from '../components/Cabinet/ReadingHistorySection';
import { ReaderSettingsPanel } from '../components/ChapterView/ReaderSettings';
import { api } from '../api/client';
import { authService } from '../services/authService';
import { useUserRole } from '../hooks/useUserRole';
import { Button } from '../components/ui';
import { RoleComparisonTable } from '../components/AccountTiers';
import { UpgradeRequestActions } from '../components/UpgradeRequest';
import type { ReaderSettings } from '../types';
import type { UserRole } from '../../types/roles';
import { DEFAULT_READER_SETTINGS, LEGACY_FONT_MAP } from '../types';
import './ProfilePage.css';
import '../components/AccountTiers/RoleComparisonTable.css';

type ProfileTab = 'reading' | 'settings' | 'profile';

const ROLE_LABEL_KEYS: Record<UserRole, string> = {
  guest: 'profile.roleUser',
  user: 'profile.roleUser',
  author: 'profile.roleAuthor',
  author_plus: 'profile.roleAuthorPlus',
  super_author: 'profile.roleSuperAuthor',
  admin: 'profile.roleAdmin',
};

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

  const [activeTab, setActiveTab] = useState<ProfileTab>('reading');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => ({
    ...DEFAULT_READER_SETTINGS,
  }));
  const [readerSettingsLoaded, setReaderSettingsLoaded] = useState(false);

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
            onClick={() => setActiveTab(tab.id)}
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
            <div class="profile-avatar-section">
              <div class="profile-avatar-preview">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" class="profile-avatar-img" />
                ) : (
                  <span class="profile-avatar-initials">
                    {user ? getInitials(user.email) : '?'}
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                class="profile-avatar-input"
                onChange={handleAvatarUpload}
                disabled={avatarUploading || !user}
              />
              <button
                type="button"
                class="profile-avatar-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading || !user}
              >
                {avatarUploading ? t('common.loading') : t('profile.uploadAvatar')}
              </button>
              {user && <p class="profile-email">{user.email}</p>}
              {user && (
                <div class="profile-role-block">
                  <span class="profile-role-label">{t('profile.roleLabel')}</span>
                  <span class="profile-role-badge">{t(ROLE_LABEL_KEYS[role])}</span>
                </div>
              )}
              {user && !isAtLeast('admin') && (
                <div class="profile-upgrade-block">
                  <p class="profile-upgrade-hint">{t('profile.upgradeHint')}</p>
                  <UpgradeRequestActions
                    showCompareTiers={false}
                    mailSubject={t('profile.upgradeMailSubject')}
                    userEmail={user.email}
                    requestUpgradeLabel={t('profile.upgradeButton')}
                  />
                  <Button variant="secondary" size="sm" onClick={() => route('/account-tiers')}>
                    {t('tiers.viewFullComparison')}
                  </Button>
                </div>
              )}
              {user && (
                <div class="profile-tiers-section">
                  <RoleComparisonTable currentRole={role} compact />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
