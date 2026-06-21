import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { AdminUserListItem, UserRole } from '../types';
import { ROLES } from '../../types/roles';
import { Button, Input, Select, Modal } from '../components/ui';
import { AdminLayout, AdminSection, AdminFlash } from '../components/Admin';
import '../components/Admin/admin-shared.css';
import './AdminUsersPage.css';

const ASSIGNABLE_ROLES: UserRole[] = ROLES.filter(
  (r): r is Exclude<UserRole, 'guest'> => r !== 'guest'
);

export function AdminUsersPage() {
  const { t } = useTranslation();

  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const [editingUser, setEditingUser] = useState<AdminUserListItem | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('user');
  const [saveLoading, setSaveLoading] = useState(false);

  const roleSelectOptions = useMemo(
    () =>
      ASSIGNABLE_ROLES.map((r) => ({
        value: r,
        label: t(`admin.users.roles.${r}`),
      })),
    [t]
  );

  const reload = useCallback(async () => {
    setListLoading(true);
    try {
      const list = await api.getAdminUsers({
        search: searchDebounced || undefined,
        limit: 100,
      });
      setUsers(list);
    } catch {
      setUsers([]);
      setError(t('admin.users.loadFailed'));
    } finally {
      setListLoading(false);
    }
  }, [searchDebounced, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const openRoleConfirm = (user: AdminUserListItem) => {
    setEditingUser(user);
    setEditRole(user.role === 'guest' ? 'user' : user.role);
    setError(null);
  };

  const handleRoleSave = async () => {
    if (!editingUser) return;
    setSaveLoading(true);
    setError(null);
    try {
      await api.updateAdminUserRole(editingUser.id, editRole);
      setEditingUser(null);
      setSuccess(t('admin.users.roleUpdated'));
      await reload();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.data as { error?: string } | undefined;
        if (body?.error === 'Cannot demote your own admin role') {
          setError(t('admin.users.cannotDemoteSelf'));
        } else if (body?.error === 'Cannot remove the last admin') {
          setError(t('admin.users.lastAdmin'));
        } else {
          setError(t('admin.users.updateFailed'));
        }
      } else {
        setError(t('admin.users.updateFailed'));
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const roleBadgeClass = (role: UserRole) => `admin-user-role admin-user-role--${role}`;

  return (
    <AdminLayout activeTab="users">
      <div class="admin-page admin-users-page">
        <p class="admin-intro">{t('admin.users.subtitle')}</p>

        <AdminFlash error={error} success={success} />

        <AdminSection title={t('admin.users.listTitle')}>
          <div class="admin-list-filters">
            <Input
              placeholder={t('admin.users.searchPlaceholder')}
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              aria-label={t('admin.users.searchPlaceholder')}
            />
          </div>

          {listLoading ? (
            <p class="admin-empty">{t('common.loading')}</p>
          ) : users.length === 0 ? (
            <p class="admin-empty">{t('admin.users.empty')}</p>
          ) : (
            <ul class="admin-list">
              {users.map((user) => (
                <li key={user.id} class="admin-list-card admin-user-row">
                  <div class="admin-user-main">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" class="admin-user-avatar" />
                    ) : (
                      <div
                        class="admin-user-avatar admin-user-avatar--placeholder"
                        aria-hidden="true"
                      >
                        {user.email.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div class="admin-user-info">
                      <span class="admin-user-email">{user.email}</span>
                      <span class={roleBadgeClass(user.role)}>
                        {t(`admin.users.roles.${user.role}`)}
                      </span>
                      {user.createdAt && (
                        <span class="admin-user-date">
                          {t('admin.users.joined', {
                            date: new Date(user.createdAt).toLocaleDateString(),
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div class="admin-list-card-actions">
                    <Button variant="secondary" size="sm" onClick={() => openRoleConfirm(user)}>
                      {t('admin.users.changeRole')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </AdminSection>
      </div>

      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={t('admin.users.changeRoleTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingUser(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleRoleSave} loading={saveLoading}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {editingUser && (
          <div class="admin-user-role-form">
            <p>{t('admin.users.changeRoleMessage', { email: editingUser.email })}</p>
            <Select
              label={t('admin.users.roleLabel')}
              options={roleSelectOptions}
              value={editRole}
              onChange={(e) => setEditRole((e.target as HTMLSelectElement).value as UserRole)}
            />
          </div>
        )}
      </Modal>
    </AdminLayout>
  );
}
