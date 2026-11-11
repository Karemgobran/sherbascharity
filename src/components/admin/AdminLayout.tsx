import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  ClipboardCheck,
  FileSpreadsheet,
  FolderKanban,
  Globe,
  HandHelping,
  HeartHandshake,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  Scale,
  Settings,
  Shield,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatDateTimeAr, hasPerm } from '../../lib/labels.ts';
import type { AuthUser, NotificationItem } from '../../types.ts';
import { BrandLogo, EmptyState } from '../ui/CommonUI.tsx';
import { AdminDashboardView } from './AdminDashboardView.tsx';
import { CasesAndAidsView } from './CasesAndAidsView.tsx';
import { DonationsAndReviewsView } from './DonationsAndReviewsView.tsx';
import { FinanceAndWarehouseView } from './FinanceAndWarehouseView.tsx';
import { PeopleAndRolesView } from './PeopleAndRolesView.tsx';
import { ProjectsAndZakatView } from './ProjectsAndZakatView.tsx';
import { StaffReportsSettingsView } from './StaffReportsSettingsView.tsx';

interface NavTabItem {
  key: string;
  label: string;
  perm: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV_TABS: NavTabItem[] = [
  { key: 'dashboard', label: 'لوحة التحكم', perm: 'dashboard:view', icon: LayoutDashboard },
  { key: 'people', label: 'إدارة الأشخاص', perm: 'people:view', icon: Users },
  { key: 'roles', label: 'الأدوار والصلاحيات', perm: 'roles:view', icon: Shield },
  { key: 'donation_reviews', label: 'مراجعة التبرعات', perm: 'donations:view', icon: ClipboardCheck },
  { key: 'donations', label: 'سجل التبرعات', perm: 'donations:view', icon: HeartHandshake },
  { key: 'receipts', label: 'الإيصالات الرسمية', perm: 'receipts:view', icon: Receipt },
  { key: 'projects', label: 'المشروعات والحملات', perm: 'projects:view', icon: FolderKanban },
  { key: 'cases', label: 'الحالات الإنسانية', perm: 'beneficiaries:view', icon: ShieldCheck },
  { key: 'aids', label: 'إدارة المساعدات', perm: 'aids:view', icon: HandHelping },
  { key: 'finance', label: 'النظام المالي والخزائن', perm: 'finance:view', icon: Landmark },
  { key: 'warehouse', label: 'المخازن والتبرعات العينية', perm: 'warehouse:view', icon: Package },
  { key: 'zakat', label: 'الزكاة والكفالات', perm: 'zakat:view', icon: Scale },
  { key: 'staff', label: 'الموظفون والمتطوعون', perm: 'staff:view', icon: UserCog },
  { key: 'reports', label: 'التقارير والتصدير', perm: 'reports:view', icon: FileSpreadsheet },
  { key: 'audit', label: 'سجل التدقيق', perm: 'audit:view', icon: Activity },
  { key: 'settings', label: 'الإعدادات والنسخ', perm: 'settings:view', icon: Settings },
];

export function AdminLayout({
  user,
  onLogout,
  onGoPublic,
  onNotify,
  onUserUpdated,
}: {
  user: AuthUser;
  onLogout: () => void;
  onGoPublic: () => void;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
  onUserUpdated: (user: AuthUser) => void;
}) {
  const visibleTabs = useMemo(
    () => ADMIN_NAV_TABS.filter((t) => hasPerm(user.permissions, user.roleKey, t.perm)),
    [user.permissions, user.roleKey]
  );

  const [activeTab, setActiveTab] = useState<string>(() => visibleTabs[0]?.key || 'dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  // Change password modal
  const [showPasswordModal, setShowPasswordModal] = useState(user.mustChangePassword);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.key === activeTab)) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleTabs, activeTab]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(res.notifications);
    } catch {
      // Ignore silent polling issues
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleNavigate = (tabKey: string) => {
    if (visibleTabs.some((t) => t.key === tabKey)) {
      setActiveTab(tabKey);
      setMobileMenuOpen(false);
    } else {
      onNotify('error', 'ليست لديك صلاحية الدخول إلى هذا القسم');
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      await apiFetch(`/api/notifications/${notif.id}/read`, { method: 'POST' }).catch(() => {});
      setNotifications((prev) => prev.map((x) => (x.id === notif.id ? { ...x, is_read: 1 } : x)));
    }
    if (notif.link_tab && visibleTabs.some((t) => t.key === notif.link_tab)) {
      setActiveTab(notif.link_tab);
      setShowNotifPanel(false);
    }
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
    setNotifications((prev) => prev.map((x) => ({ ...x, is_read: 1 })));
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSaving(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onNotify('success', res.message);
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      onUserUpdated({ ...user, mustChangePassword: false });
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحديث كلمة المرور');
    } finally {
      setPwSaving(false);
    }
  };

  const currentTabMeta = visibleTabs.find((t) => t.key === activeTab);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-l border-[#E3E7E2]">
      <div className="p-4 border-b border-[#E3E7E2] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <BrandLogo size={38} />
          <div className="min-w-0">
            <div className="font-display font-bold text-sm text-[#14532D] truncate">الجمعية الخيرية بشرباص</div>
            <div className="text-[11px] text-[#526058] truncate">{user.roleNameAr}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-[#526058] hover:text-[#18231D] rounded-lg"
          aria-label="إغلاق القائمة"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {visibleTabs.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeTab;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleNavigate(item.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors text-right ${
                active
                  ? 'bg-[#14532D] text-white'
                  : 'text-[#526058] hover:text-[#18231D] hover:bg-[#F3F6F3]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[#E3E7E2] space-y-2 bg-[#F8F9F7]">
        <div className="px-2">
          <div className="text-xs font-bold text-[#18231D] truncate">{user.fullName}</div>
          <div className="text-[11px] text-[#526058] truncate">
            {user.department || user.jobTitle || user.username}
          </div>
        </div>
        <button
          type="button"
          onClick={onGoPublic}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#18231D] bg-white border border-[#E3E7E2] hover:bg-[#F3F6F3] rounded-lg"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>عرض الموقع العام</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9F7] text-[#18231D] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen no-print">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 w-64 max-w-[85vw] h-full">{sidebarContent}</div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-[#E3E7E2] px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#E3E7E2] text-[#18231D]"
              aria-label="فتح القائمة"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#18231D] truncate">
                {currentTabMeta?.label || 'لوحة إدارة الجمعية'}
              </div>
              <div className="text-[11px] text-[#526058] truncate hidden sm:block">
                نظام إدارة الجمعية الخيرية بشرباص
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onGoPublic}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#526058] hover:text-[#14532D] border border-[#E3E7E2] rounded-lg whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>الموقع العام</span>
            </button>

            <button
              type="button"
              onClick={() => {
                loadNotifications();
                setShowNotifPanel(true);
              }}
              className="relative p-2 rounded-lg border border-[#E3E7E2] hover:bg-[#F3F6F3] text-[#18231D]"
              title="الإشعارات"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-[#B45309] text-white text-[10px] font-mono rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="p-2 rounded-lg border border-[#E3E7E2] hover:bg-[#F3F6F3] text-[#526058]"
              title="تغيير كلمة المرور"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#B91C1C] border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-lg whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </header>

        {/* Active Module Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
          {visibleTabs.length === 0 ? (
            <EmptyState
              title="لا توجد صلاحيات مفعّلة لهذا الحساب"
              description="يرجى التواصل مع المدير الرئيسي للنظام لتحديد صلاحيات الدور الوظيفي الخاص بك."
            />
          ) : (
            <>
              {activeTab === 'dashboard' && <AdminDashboardView user={user} onNavigate={handleNavigate} onNotify={onNotify} />}
              {activeTab === 'people' && <PeopleAndRolesView key="people" user={user} mode="people" onNotify={onNotify} />}
              {activeTab === 'roles' && <PeopleAndRolesView key="roles" user={user} mode="roles" onNotify={onNotify} />}
              {activeTab === 'donation_reviews' && (
                <DonationsAndReviewsView key="reviews" user={user} initialSubTab="reviews" onNotify={onNotify} />
              )}
              {activeTab === 'donations' && (
                <DonationsAndReviewsView key="donations" user={user} initialSubTab="all" onNotify={onNotify} />
              )}
              {activeTab === 'receipts' && (
                <DonationsAndReviewsView key="receipts" user={user} initialSubTab="receipts" onNotify={onNotify} />
              )}
              {activeTab === 'projects' && (
                <ProjectsAndZakatView key="projects" user={user} mode="projects" onNotify={onNotify} />
              )}
              {activeTab === 'zakat' && (
                <ProjectsAndZakatView key="zakat" user={user} mode="zakat" onNotify={onNotify} />
              )}
              {activeTab === 'cases' && <CasesAndAidsView key="cases" user={user} mode="cases" onNotify={onNotify} />}
              {activeTab === 'aids' && <CasesAndAidsView key="aids" user={user} mode="aids" onNotify={onNotify} />}
              {activeTab === 'finance' && (
                <FinanceAndWarehouseView key="finance" user={user} mode="finance" onNotify={onNotify} />
              )}
              {activeTab === 'warehouse' && (
                <FinanceAndWarehouseView key="warehouse" user={user} mode="warehouse" onNotify={onNotify} />
              )}
              {activeTab === 'staff' && (
                <StaffReportsSettingsView key="staff" user={user} mode="staff" onNotify={onNotify} />
              )}
              {activeTab === 'reports' && (
                <StaffReportsSettingsView key="reports" user={user} mode="reports" onNotify={onNotify} />
              )}
              {activeTab === 'audit' && (
                <StaffReportsSettingsView key="audit" user={user} mode="audit" onNotify={onNotify} />
              )}
              {activeTab === 'settings' && (
                <StaffReportsSettingsView key="settings" user={user} mode="settings" onNotify={onNotify} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Notifications Slide-Over Drawer */}
      {showNotifPanel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end no-print">
          <div className="bg-white border-r border-[#E3E7E2] w-full max-w-md h-full flex flex-col">
            <div className="p-4 border-b border-[#E3E7E2] flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#18231D]">مركز الإشعارات ({unreadCount} غير مقروء)</h3>
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs font-semibold text-[#14532D] hover:underline"
                  >
                    تحديد الكل كمقروء
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotifPanel(false)}
                  className="p-1.5 rounded-lg border border-[#E3E7E2] text-[#526058]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-[#E3E7E2]">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#526058]">لا توجد إشعارات حاليًا.</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-right p-4 hover:bg-[#F8F9F7] transition-colors space-y-1 ${
                      n.is_read ? 'bg-white' : 'bg-[#ECFDF5]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#18231D]">{n.title_ar}</span>
                      <span className="text-[11px] text-[#526058] tabular-nums">{formatDateTimeAr(n.created_at)}</span>
                    </div>
                    <p className="text-xs text-[#526058] leading-relaxed">{n.message_ar}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 no-print">
          <form onSubmit={handleChangePassword} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#18231D]">
                {user.mustChangePassword ? 'مطلوب تغيير كلمة المرور المؤقتة' : 'تغيير كلمة المرور'}
              </h3>
              {!user.mustChangePassword && (
                <button type="button" onClick={() => setShowPasswordModal(false)} className="text-xs text-[#526058]">
                  إغلاق
                </button>
              )}
            </div>
            <p className="text-xs text-[#526058]">
              {user.mustChangePassword
                ? 'تم إنشاء حسابك بكلمة مرور مؤقتة من المدير الرئيسي. يرجى تعيين كلمة مرور شخصية آمنة الآن.'
                : 'أدخل كلمة المرور الحالية ثم كلمة المرور الجديدة (8 أحرف على الأقل).'}
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1">كلمة المرور الحالية</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">كلمة المرور الجديدة (8+ أحرف)</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={pwSaving}
              className="w-full py-2.5 text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg disabled:opacity-60"
            >
              {pwSaving ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور الجديدة'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
