import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Eye,
  FileText,
  KeyRound,
  LogOut,
  Plus,
  Printer,
  Receipt,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { downloadOfficialReceiptPdf } from '../lib/exportUtils.ts';
import {
  DONATION_STATUS_META,
  DONATION_TYPE_LABELS,
  formatDateAr,
  formatDateTimeAr,
  formatEGP,
  PROJECT_STATUS_LABELS,
} from '../lib/labels.ts';
import type {
  AuthUser,
  CharitySettings,
  DonationRecord,
  DonationReviewHistoryItem,
  NotificationItem,
  ProjectUpdateItem,
  PublicProject,
  PublishedExpenseItem,
  ReceiptRecord,
} from '../types.ts';
import {
  BrandLogo,
  EmptyState,
  FilePreviewModal,
  LoadingState,
  ReceiptModal,
  StatusText,
} from './ui/CommonUI.tsx';

interface DonorProjectTransparency {
  id: number;
  code: string;
  title_ar: string;
  category_ar: string;
  goal_ar?: string;
  target_budget: number;
  status: string;
  total_project_approved: number;
  my_approved_contribution: number;
  my_pending_contribution: number;
  total_project_expenses: number;
  remaining_balance: number;
  contribution_share_percent: number;
  estimated_proportional_expense: number;
  allocation_note: string;
  expenses: PublishedExpenseItem[];
  updates: ProjectUpdateItem[];
}

interface DonorDashboardPayload {
  summary: {
    approved_total: number;
    total_count: number;
    approved_count: number;
    pending_count: number;
    pending_total: number;
  };
  myDonations: DonationRecord[];
  myReceipts: ReceiptRecord[];
  myProjectsTransparency: DonorProjectTransparency[];
  publishedSpending: Array<{
    category_ar: string;
    project_title: string | null;
    vouchers_count: number;
    total_amount: number;
  }>;
  publishedExpenses: PublishedExpenseItem[];
  projectUpdates: ProjectUpdateItem[];
  publicProjects: PublicProject[];
  settings: CharitySettings;
}

interface DonationDetailResponse {
  donation: DonationRecord & { project_code?: string | null };
  history: DonationReviewHistoryItem[];
  projectSummary: {
    id: number;
    code: string;
    title_ar: string;
    category_ar: string;
    target_budget: number;
    status: string;
    total_project_approved: number;
    my_approved_contribution: number;
    total_project_expenses: number;
    remaining_balance: number;
    contribution_share_percent: number;
    expenses: PublishedExpenseItem[];
    updates: ProjectUpdateItem[];
  } | null;
}

type DonorTab = 'overview' | 'donate' | 'donations' | 'receipts' | 'transparency' | 'notifications';
type DonationFilter = 'all' | 'approved' | 'pending' | 'needs_clarification' | 'rejected';

export function DonorPortal({
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
  const [tab, setTab] = useState<DonorTab>('overview');
  const [data, setData] = useState<DonorDashboardPayload | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Donation submission form state
  const [donationType, setDonationType] = useState('project');
  const [projectId, setProjectId] = useState('');
  const [caseCategoryLabel, setCaseCategoryLabel] = useState('دعم الحالات الإنسانية العامة');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('تحويل بنكي');
  const [transactionRef, setTransactionRef] = useState('');
  const [donationDate, setDonationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [donorNotes, setDonorNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Clarification modal state
  const [clarifyingDonation, setClarifyingDonation] = useState<DonationRecord | null>(null);
  const [clarifyNote, setClarifyNote] = useState('');
  const [clarifyFile, setClarifyFile] = useState<File | null>(null);

  // Receipt, Detail & File Preview Modals
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRecord | null>(null);
  const [previewFile, setPreviewFile] = useState<{ id: string; name?: string | null; mimeType?: string | null } | null>(null);
  const [receiptSearch, setReceiptSearch] = useState('');
  const [donationFilter, setDonationFilter] = useState<DonationFilter>('all');
  const [selectedDonationDetail, setSelectedDonationDetail] = useState<DonationDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(user.mustChangePassword);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, notif] = await Promise.all([
        apiFetch<DonorDashboardPayload>('/api/donor/dashboard'),
        apiFetch<{ notifications: NotificationItem[] }>('/api/notifications'),
      ]);
      setData(dash);
      setNotifications(notif.notifications);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل بيانات بوابة المتبرعين');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    };
  }, [proofPreviewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
    setProofFile(file);
    setProofPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmitDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('donationType', donationType);
      if (donationType === 'project' && projectId) form.append('projectId', projectId);
      if (donationType === 'case_support') form.append('caseCategoryLabel', caseCategoryLabel);
      form.append('amount', amount);
      form.append('paymentMethod', paymentMethod);
      form.append('transactionRef', transactionRef);
      form.append('donationDate', donationDate);
      form.append('donorNotes', donorNotes);
      if (proofFile) form.append('proof', proofFile);

      const res = await apiFetch<{ message: string }>('/api/donor/donations', {
        method: 'POST',
        body: form,
      });

      onNotify('success', res.message);
      setAmount('');
      setTransactionRef('');
      setDonorNotes('');
      setProofFile(null);
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
      setProofPreviewUrl(null);
      setTab('donations');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إرسال طلب التبرع');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClarifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarifyingDonation) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('note', clarifyNote);
      if (clarifyFile) form.append('proof', clarifyFile);
      const res = await apiFetch<{ message: string }>(`/api/donor/donations/${clarifyingDonation.id}/clarify`, {
        method: 'POST',
        body: form,
      });
      onNotify('success', res.message);
      setClarifyingDonation(null);
      setClarifyNote('');
      setClarifyFile(null);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إرسال التوضيح');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenReceipt = async (receiptId: number) => {
    try {
      const res = await apiFetch<{ receipt: ReceiptRecord }>(`/api/receipts/${receiptId}`);
      setSelectedReceipt(res.receipt);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر فتح الإيصال');
    }
  };

  const handleOpenDonationDetail = async (donationId: number) => {
    setLoadingDetail(true);
    try {
      const res = await apiFetch<DonationDetailResponse>(`/api/donor/donations/${donationId}`);
      setSelectedDonationDetail(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل تفاصيل التبرع');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
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
    }
  };

  const filteredDonations = useMemo(() => {
    const list = data?.myDonations || [];
    if (donationFilter === 'all') return list;
    if (donationFilter === 'pending') {
      return list.filter((d) => d.status === 'pending_review' || d.status === 'in_review');
    }
    return list.filter((d) => d.status === donationFilter);
  }, [data, donationFilter]);

  const filteredReceipts = useMemo(() => {
    const list = data?.myReceipts || [];
    if (!receiptSearch.trim()) return list;
    const q = receiptSearch.trim().toLowerCase();
    return list.filter(
      (r) =>
        r.receipt_number.toLowerCase().includes(q) ||
        (r.project_title || '').toLowerCase().includes(q) ||
        r.donation_type_label.toLowerCase().includes(q)
    );
  }, [data, receiptSearch]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const statusTone = (st: string) => {
    if (st === 'approved') return 'success';
    if (st === 'rejected') return 'danger';
    if (st === 'needs_clarification') return 'info';
    if (st === 'cancelled') return 'neutral';
    return 'warning';
  };

  return (
    <div className="min-h-screen bg-[#F8F9F7] text-[#18231D] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-[#E3E7E2] sticky top-0 z-30 no-print">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={onGoPublic} className="flex items-center gap-2.5 shrink-0">
              <BrandLogo size={36} />
              <span className="font-display font-bold text-[#14532D] text-base whitespace-nowrap">
                بوابة المتبرعين · شرباص
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-[#526058]">مرحبًا، {user.fullName}</span>
            <button
              type="button"
              onClick={() => setTab('notifications')}
              className="relative p-2 rounded-lg border border-[#E3E7E2] hover:bg-[#F3F6F3] text-[#18231D]"
              title="الإشعارات"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -left-1 px-1.5 py-0.2 bg-[#B45309] text-white text-[10px] font-mono rounded-full">
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
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 border-t border-[#E3E7E2] flex items-center gap-1 overflow-x-auto py-2">
          {(
            [
              ['overview', 'الملخص العام'],
              ['donate', 'تقديم طلب تبرع'],
              ['donations', 'سجل تبرعاتي'],
              ['receipts', 'إيصالاتي الرسمية'],
              ['transparency', 'الشفافية والمشروعات'],
              ['notifications', `الإشعارات (${unreadCount})`],
            ] as Array<[DonorTab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                tab === key ? 'bg-[#14532D] text-white' : 'text-[#526058] hover:text-[#18231D] hover:bg-[#F3F6F3]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-8 space-y-6 no-print">
        {loading || !data ? (
          <LoadingState />
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {tab === 'overview' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-display font-bold text-[#18231D]">سجل مساهماتك والشفافية المالية</h1>
                    <p className="text-sm text-[#526058] mt-1">
                      تظهر في هذه البوابة بياناتك وإيصالاتك الخاصة فقط وفق ضوابط الخصوصية.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('donate')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    <span>تبرع الآن</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-[#E3E7E2] rounded-xl p-5">
                    <div className="text-xs text-[#526058]">إجمالي تبرعاتي المعتمدة</div>
                    <div className="text-2xl font-bold text-[#14532D] font-mono tabular-nums mt-2">
                      {formatEGP(data.summary.approved_total)}
                    </div>
                  </div>
                  <div className="bg-white border border-[#E3E7E2] rounded-xl p-5">
                    <div className="text-xs text-[#526058]">عدد التبرعات المسجلة</div>
                    <div className="text-2xl font-bold text-[#18231D] font-mono tabular-nums mt-2">
                      {data.summary.total_count}
                    </div>
                    <div className="text-xs text-[#526058] mt-1">معتمد: {data.summary.approved_count}</div>
                  </div>
                  <div className="bg-white border border-[#E3E7E2] rounded-xl p-5">
                    <div className="text-xs text-[#526058]">تبرعات بانتظار المراجعة</div>
                    <div className="text-2xl font-bold text-[#B45309] font-mono tabular-nums mt-2">
                      {formatEGP(data.summary.pending_total)}
                    </div>
                    <div className="text-xs text-[#526058] mt-1">عدد الطلبات: {data.summary.pending_count}</div>
                  </div>
                  <div className="bg-white border border-[#E3E7E2] rounded-xl p-5">
                    <div className="text-xs text-[#526058]">الإيصالات الرسمية الصادرة</div>
                    <div className="text-2xl font-bold text-[#18231D] font-mono tabular-nums mt-2">
                      {data.myReceipts.length}
                    </div>
                  </div>
                </div>

                {/* Recent Donations & Status Summary */}
                <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
                  <div className="p-5 border-b border-[#E3E7E2] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-[#18231D]">أحدث تبرعاتك وحالتها</h2>
                      <p className="text-xs text-[#526058] mt-0.5">اضغط على أي تبرع لعرض كامل التفاصيل ومسار المراجعة والإيصال.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab('donations')}
                      className="text-xs font-semibold text-[#14532D] hover:underline whitespace-nowrap shrink-0"
                    >
                      عرض السجل الكامل ({data.myDonations.length})
                    </button>
                  </div>
                  {data.myDonations.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#526058]">
                      لم تسجل أي تبرعات في حسابك حتى الآن. يمكنك تقديم أول تبرع عبر زر «تبرع الآن».
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-right">
                        <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">التاريخ</th>
                            <th className="py-2.5 px-4 font-semibold">المشروع / الوجهة</th>
                            <th className="py-2.5 px-4 font-semibold">المبلغ</th>
                            <th className="py-2.5 px-4 font-semibold">الحالة</th>
                            <th className="py-2.5 px-4 font-semibold">رقم الإيصال</th>
                            <th className="py-2.5 px-4 font-semibold">التفاصيل</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E7E2]">
                          {data.myDonations.slice(0, 5).map((d) => {
                            const meta = DONATION_STATUS_META[d.status] || { label: d.status };
                            return (
                              <tr
                                key={d.id}
                                onClick={() => handleOpenDonationDetail(d.id)}
                                className="hover:bg-[#F8F9F7] cursor-pointer transition-colors"
                              >
                                <td className="py-3 px-4 text-xs tabular-nums text-[#526058] whitespace-nowrap">
                                  {formatDateAr(d.donation_date)}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-[#18231D]">
                                    {d.project_title || d.case_category_label || DONATION_TYPE_LABELS[d.donation_type] || d.donation_type}
                                  </div>
                                  <div className="text-[11px] font-mono text-[#526058]">{d.reference_code}</div>
                                </td>
                                <td className="py-3 px-4 font-mono font-bold tabular-nums text-[#14532D] whitespace-nowrap">
                                  {formatEGP(d.amount)}
                                </td>
                                <td className="py-3 px-4">
                                  <StatusText label={meta.label} tone={statusTone(d.status)} />
                                </td>
                                <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                                  {d.receipt_number ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (d.receipt_id) handleOpenReceipt(d.receipt_id);
                                      }}
                                      className="font-semibold text-[#14532D] hover:underline"
                                    >
                                      {d.receipt_number}
                                    </button>
                                  ) : (
                                    <span className="text-[#526058]">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenDonationDetail(d.id);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#14532D] border border-[#14532D]/30 rounded hover:bg-[#ECFDF5] whitespace-nowrap shrink-0"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>التفاصيل</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Quick Summary of Projects Donor Contributed To */}
                {data.myProjectsTransparency.length > 0 && (
                  <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-base font-bold text-[#18231D]">متابعة المشروعات التي ساهمت فيها</h2>
                        <p className="text-xs text-[#526058] mt-0.5">
                          نسبة مساهمتك والمبالغ المصروفة والمتبقية في كل مشروع شاركت في دعمه.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTab('transparency')}
                        className="text-xs font-semibold text-[#14532D] hover:underline whitespace-nowrap shrink-0"
                      >
                        عرض فواتير الصرف والتحديثات
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.myProjectsTransparency.map((p) => (
                        <div key={p.id} className="p-4 rounded-lg border border-[#E3E7E2] bg-[#F8F9F7] space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs text-[#526058] font-mono tabular-nums">
                                {p.code} · {p.category_ar}
                              </div>
                              <div className="font-bold text-[#18231D] mt-0.5">{p.title_ar}</div>
                            </div>
                            <span className="text-xs font-semibold text-[#14532D] font-mono tabular-nums whitespace-nowrap shrink-0">
                              مساهمتك: {p.contribution_share_percent}%
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                            <div>
                              <span className="text-[#526058]">المجموع: </span>
                              <strong className="text-[#14532D]">{formatEGP(p.total_project_approved)}</strong>
                            </div>
                            <div>
                              <span className="text-[#526058]">المصروف: </span>
                              <strong>{formatEGP(p.total_project_expenses)}</strong>
                            </div>
                            <div>
                              <span className="text-[#526058]">المتبقي: </span>
                              <strong>{formatEGP(p.remaining_balance)}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick View of Open Projects */}
                <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-[#18231D]">المشروعات المتاحة للمساهمة</h2>
                    <button
                      type="button"
                      onClick={() => setTab('transparency')}
                      className="text-xs font-semibold text-[#14532D] hover:underline whitespace-nowrap shrink-0"
                    >
                      عرض تفاصيل الشفافية والإنفاق
                    </button>
                  </div>
                  {data.publicProjects.length === 0 ? (
                    <p className="text-sm text-[#526058]">
                      لا توجد مشروعات مخصصة منشورة حاليًا؛ يمكنك التبرع مباشرة للتبرع العام أو الزكاة والصدقات.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.publicProjects.map((proj) => (
                        <div key={proj.id} className="p-4 rounded-lg border border-[#E3E7E2] bg-[#F8F9F7] space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs text-[#526058]">
                                {proj.category_ar} · {PROJECT_STATUS_LABELS[proj.status] || proj.status}
                              </div>
                              <div className="font-bold text-[#18231D] mt-0.5">{proj.title_ar}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setDonationType('project');
                                setProjectId(String(proj.id));
                                setTab('donate');
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap shrink-0"
                            >
                              تبرع الآن
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                            <div>
                              <span className="text-[#526058]">المعتمد: </span>
                              <strong className="text-[#14532D]">{formatEGP(proj.approved_donations)}</strong>
                            </div>
                            <div>
                              <span className="text-[#526058]">المصروف: </span>
                              <strong>{formatEGP(proj.approved_expenses)}</strong>
                            </div>
                            <div>
                              <span className="text-[#526058]">المتبقي: </span>
                              <strong>{formatEGP(proj.approved_donations - proj.approved_expenses)}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DONATE SUBMISSION TAB */}
            {tab === 'donate' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <form
                  onSubmit={handleSubmitDonation}
                  className="lg:col-span-8 bg-white border border-[#E3E7E2] rounded-xl p-6 sm:p-8 space-y-5"
                >
                  <div>
                    <h2 className="text-xl font-display font-bold text-[#18231D]">تقديم طلب تبرع موثق</h2>
                    <p className="text-xs text-[#526058] mt-1 leading-relaxed">
                      ملاحظة هامة: إرسال هذا الطلب ورفع صورة التحويل لا يعني اعتماد التبرع تلقائيًا؛ يظل الطلب معلقًا
                      حتى يتأكد المسؤول المالي من وصول المبلغ فعليًا ثم يُصدر الإيصال الرسمي.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#18231D] mb-1.5">نوع التبرع</label>
                      <select
                        value={donationType}
                        onChange={(e) => setDonationType(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg bg-white"
                      >
                        {Object.entries(DONATION_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    {donationType === 'project' && (
                      <div>
                        <label className="block text-xs font-semibold text-[#18231D] mb-1.5">المشروع المستهدف</label>
                        <select
                          required
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg bg-white"
                        >
                          <option value="">اختر المشروع...</option>
                          {data.publicProjects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title_ar} ({p.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {donationType === 'case_support' && (
                      <div>
                        <label className="block text-xs font-semibold text-[#18231D] mb-1.5">فئة الحالات الإنسانية</label>
                        <select
                          value={caseCategoryLabel}
                          onChange={(e) => setCaseCategoryLabel(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg bg-white"
                        >
                          <option value="دعم الحالات الإنسانية العامة">دعم الحالات الإنسانية العامة</option>
                          <option value="كفالة أسر الأيتام">كفالة أسر الأيتام</option>
                          <option value="الحالات الطبية والعلاج العاجل">الحالات الطبية والعلاج العاجل</option>
                          <option value="الإعانات الغذائية والطارئة">الإعانات الغذائية والطارئة</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#18231D] mb-1.5">قيمة التبرع (ج.م)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="مثال: 1000"
                        className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#18231D] mb-1.5">طريقة الدفع</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg bg-white"
                      >
                        <option value="تحويل بنكي">تحويل بنكي</option>
                        <option value="فودافون كاش">فودافون كاش / محفظة</option>
                        <option value="إنستاباي">إنستاباي (InstaPay)</option>
                        <option value="شيك بنكي">شيك بنكي</option>
                        <option value="نقدي بمقر الجمعية">نقدي بمقر الجمعية</option>
                        <option value="تبرع عيني">تسليم عيني بمخزن الجمعية</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#18231D] mb-1.5">تاريخ التبرع</label>
                      <input
                        type="date"
                        required
                        value={donationDate}
                        onChange={(e) => setDonationDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#18231D] mb-1.5">رقم العملية / المرجع البنكي (إن وجد)</label>
                    <input
                      type="text"
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      placeholder="رقم مرجع التحويل أو رسالة التأكيد"
                      className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#18231D] mb-1.5">
                      صورة إثبات التحويل أو إيصال الدفع (JPG / PNG / PDF)
                    </label>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#CBD5CE] rounded-xl p-6 cursor-pointer hover:bg-[#F8F9F7] transition-colors">
                      <Upload className="w-6 h-6 text-[#14532D] mb-2" />
                      <span className="text-sm font-semibold text-[#18231D]">
                        {proofFile ? proofFile.name : 'اضغط لاختيار صورة الإيصال أو ملف PDF'}
                      </span>
                      <span className="text-xs text-[#526058] mt-1">الحد الأقصى 10 ميجابايت · يُحفظ في تخزين محمي خاص</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>

                    {proofPreviewUrl && proofFile && (
                      <div className="mt-3 p-3 rounded-lg border border-[#E3E7E2] bg-[#F8F9F7] space-y-2">
                        <div className="text-xs font-semibold text-[#14532D]">معاينة الإثبات قبل الإرسال:</div>
                        {proofFile.type === 'application/pdf' ? (
                          <iframe title="معاينة PDF" src={proofPreviewUrl} className="w-full h-56 rounded border border-[#E3E7E2] bg-white" />
                        ) : (
                          <img
                            src={proofPreviewUrl}
                            alt="معاينة إثبات التحويل"
                            className="max-h-64 rounded border border-[#E3E7E2] object-contain mx-auto bg-white"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#18231D] mb-1.5">ملاحظات إضافية</label>
                    <textarea
                      rows={3}
                      value={donorNotes}
                      onChange={(e) => setDonorNotes(e.target.value)}
                      placeholder="أي تفاصيل أو تخصيص ترغب في إضافته..."
                      className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto px-7 py-3 text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors disabled:opacity-60"
                  >
                    {submitting ? 'جارٍ إرسال الطلب...' : 'إرسال طلب التبرع للمراجعة'}
                  </button>
                </form>

                {/* Payment instructions sidebar */}
                <aside className="lg:col-span-4 bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4 text-sm">
                  <h3 className="font-bold text-[#14532D]">بيانات قنوات التحويل الرسمية</h3>
                  <p className="text-xs text-[#526058] leading-relaxed">{data.settings?.donation_instructions_ar}</p>
                  <div className="border-t border-[#E3E7E2] pt-3 space-y-3 text-xs">
                    <div>
                      <div className="font-bold text-[#18231D]">التحويل البنكي:</div>
                      <div className="text-[#526058] mt-0.5 whitespace-pre-line">{data.settings?.bank_transfer_info_ar}</div>
                    </div>
                    <div>
                      <div className="font-bold text-[#18231D]">المحافظ الإلكترونية:</div>
                      <div className="text-[#526058] mt-0.5 whitespace-pre-line">{data.settings?.vodafone_cash_info_ar}</div>
                    </div>
                    <div>
                      <div className="font-bold text-[#18231D]">إنستاباي / المقر:</div>
                      <div className="text-[#526058] mt-0.5 whitespace-pre-line">{data.settings?.instapay_info_ar}</div>
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {/* MY DONATIONS TAB */}
            {tab === 'donations' && (
              <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
                <div className="p-5 border-b border-[#E3E7E2] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#18231D]">سجل تبرعاتي</h2>
                    <p className="text-xs text-[#526058] mt-0.5">اضغط على أي صف أو زر «التفاصيل» لاستعراض مسار التبرع الكامل وأوجه الصرف.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 p-1 bg-[#F8F9F7] border border-[#E3E7E2] rounded-lg overflow-x-auto">
                      {(
                        [
                          ['all', 'الكل'],
                          ['approved', 'المعتمدة'],
                          ['pending', 'قيد المراجعة'],
                          ['needs_clarification', 'توضيح'],
                          ['rejected', 'مرفوضة'],
                        ] as Array<[DonationFilter, string]>
                      ).map(([fk, fl]) => (
                        <button
                          key={fk}
                          type="button"
                          onClick={() => setDonationFilter(fk)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 transition-colors ${
                            donationFilter === fk ? 'bg-white text-[#14532D] shadow-sm' : 'text-[#526058] hover:text-[#18231D]'
                          }`}
                        >
                          {fl}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab('donate')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap shrink-0"
                    >
                      + تبرع جديد
                    </button>
                  </div>
                </div>

                {filteredDonations.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[#526058]">
                    {data.myDonations.length === 0
                      ? 'لم تقدم أي طلبات تبرع بعد.'
                      : 'لا توجد تبرعات مطابقة للتصفية المختارة.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right">
                      <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                        <tr>
                          <th className="py-3 px-4 font-semibold">المرجع</th>
                          <th className="py-3 px-4 font-semibold">النوع / المشروع</th>
                          <th className="py-3 px-4 font-semibold">المبلغ</th>
                          <th className="py-3 px-4 font-semibold">التاريخ</th>
                          <th className="py-3 px-4 font-semibold">الحالة</th>
                          <th className="py-3 px-4 font-semibold">رقم الإيصال</th>
                          <th className="py-3 px-4 font-semibold">الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E3E7E2]">
                        {filteredDonations.map((d) => {
                          const meta = DONATION_STATUS_META[d.status] || { label: d.status };
                          return (
                            <tr
                              key={d.id}
                              onClick={() => handleOpenDonationDetail(d.id)}
                              className="hover:bg-[#F8F9F7]/70 cursor-pointer transition-colors"
                            >
                              <td className="py-3 px-4 font-mono text-xs tabular-nums">{d.reference_code}</td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-[#18231D]">
                                  {DONATION_TYPE_LABELS[d.donation_type] || d.donation_type}
                                </div>
                                <div className="text-xs text-[#526058]">
                                  {d.project_title || d.case_category_label || d.payment_method}
                                </div>
                                {d.status === 'rejected' && d.rejection_reason && (
                                  <div className="text-xs text-[#B91C1C] mt-1">سبب الرفض: {d.rejection_reason}</div>
                                )}
                                {d.status === 'needs_clarification' && d.clarification_request && (
                                  <div className="text-xs text-[#9A3412] mt-1">مطلوب توضيح: {d.clarification_request}</div>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold tabular-nums text-[#14532D] whitespace-nowrap">
                                {formatEGP(d.amount)}
                              </td>
                              <td className="py-3 px-4 text-xs tabular-nums text-[#526058] whitespace-nowrap">{formatDateAr(d.donation_date)}</td>
                              <td className="py-3 px-4">
                                <StatusText label={meta.label} tone={statusTone(d.status)} />
                              </td>
                              <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                                {d.receipt_number ? (
                                  <span className="font-semibold text-[#14532D]">{d.receipt_number}</span>
                                ) : (
                                  <span className="text-[#526058]">يصدر بعد الاعتماد</span>
                                )}
                              </td>
                              <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDonationDetail(d.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#18231D] border border-[#E3E7E2] rounded hover:bg-white whitespace-nowrap shrink-0"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    <span>التفاصيل</span>
                                  </button>
                                  {d.proof_file_id && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewFile({
                                          id: d.proof_file_id!,
                                          name: d.proof_file_name,
                                          mimeType: d.proof_mime_type,
                                        })
                                      }
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-[#E3E7E2] rounded hover:bg-white whitespace-nowrap shrink-0"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      <span>الإثبات</span>
                                    </button>
                                  )}
                                  {d.status === 'approved' && d.receipt_id && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReceipt(d.receipt_id!)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-[#14532D] rounded hover:bg-[#0F3F22] whitespace-nowrap shrink-0"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      <span>الإيصال ({d.receipt_number})</span>
                                    </button>
                                  )}
                                  {d.status === 'needs_clarification' && (
                                    <button
                                      type="button"
                                      onClick={() => setClarifyingDonation(d)}
                                      className="px-2.5 py-1 text-xs font-semibold text-[#9A3412] border border-[#FDBA74] bg-[#FFF7ED] rounded whitespace-nowrap shrink-0"
                                    >
                                      الرد بالتوضيح
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* MY RECEIPTS TAB */}
            {tab === 'receipts' && (
              <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
                <div className="p-5 border-b border-[#E3E7E2] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#18231D]">إيصالات التبرع الرسمية</h2>
                    <p className="text-xs text-[#526058]">تصدر الإيصالات حصريًا للتبرعات التي تم اعتمادها والتحقق من وصول أموالها.</p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-[#526058] absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={receiptSearch}
                      onChange={(e) => setReceiptSearch(e.target.value)}
                      placeholder="بحث برقم الإيصال أو المشروع..."
                      className="w-full pr-9 pl-3 py-2 text-xs border border-[#E3E7E2] rounded-lg"
                    />
                  </div>
                </div>

                {filteredReceipts.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[#526058]">لا توجد إيصالات صادرة مطابقة.</div>
                ) : (
                  <div className="divide-y divide-[#E3E7E2]">
                    {filteredReceipts.map((r) => (
                      <div key={r.id} className="p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-[#F8F9F7]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-[#526058]">
                            <span className="font-mono font-bold text-[#14532D]">{r.receipt_number}</span>
                            <span>·</span>
                            <span>{r.donation_type_label}</span>
                            <span>·</span>
                            <span className="tabular-nums">{formatDateAr(r.donation_date)}</span>
                          </div>
                          <div className="font-bold text-[#18231D]">{r.project_title || 'تبرع عام لأنشطة الجمعية'}</div>
                          <div className="text-xs text-[#526058]">
                            اعتُمد بواسطة: {r.approved_by_name} · {r.amount_words_ar}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-lg font-bold font-mono text-[#14532D] tabular-nums">{formatEGP(r.amount)}</div>
                          <button
                            type="button"
                            onClick={() => handleOpenReceipt(r.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#E3E7E2] rounded-lg hover:bg-white"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>عرض وطباعة</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadOfficialReceiptPdf(r, data.settings)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg"
                          >
                            <span>PDF</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TRANSPARENCY TAB */}
            {tab === 'transparency' && (
              <div className="space-y-6">
                <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#18231D]">تتبع المشروعات التي ساهمت فيها</h2>
                    <p className="text-xs text-[#526058] mt-1">
                      توضح البيانات التالية الإجماليات المعتمدة والمصروفات الفعلية لكل مشروع ونصيبك النسبي التقديري وتفاصيل الصرف والفواتير المصرح بنشرها دون أي مساس بخصوصية المستفيدين.
                    </p>
                  </div>

                  {data.myProjectsTransparency.length === 0 ? (
                    <p className="text-sm text-[#526058]">لم تساهم في مشروعات محددة بعد.</p>
                  ) : (
                    <div className="space-y-5">
                      {data.myProjectsTransparency.map((p) => (
                        <div key={p.id} className="p-5 rounded-xl border border-[#E3E7E2] bg-[#F8F9F7] space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-mono text-[#526058]">
                                {p.code} · {p.category_ar} · {PROJECT_STATUS_LABELS[p.status] || p.status}
                              </span>
                              <h3 className="text-base font-bold text-[#18231D] mt-0.5">{p.title_ar}</h3>
                            </div>
                            <span className="text-xs font-semibold text-[#14532D] font-mono tabular-nums">
                              نسبة مساهمتك: {p.contribution_share_percent}%
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs tabular-nums">
                            <div className="bg-white p-3 rounded border border-[#E3E7E2]">
                              <div className="text-[#526058]">تبرعات المشروع المعتمدة</div>
                              <div className="font-bold text-[#14532D] mt-1">{formatEGP(p.total_project_approved)}</div>
                            </div>
                            <div className="bg-white p-3 rounded border border-[#E3E7E2]">
                              <div className="text-[#526058]">مصروفات المشروع المعتمدة</div>
                              <div className="font-bold text-[#18231D] mt-1">{formatEGP(p.total_project_expenses)}</div>
                            </div>
                            <div className="bg-white p-3 rounded border border-[#E3E7E2]">
                              <div className="text-[#526058]">المتبقي بالمشروع</div>
                              <div className="font-bold text-[#18231D] mt-1">{formatEGP(p.remaining_balance)}</div>
                            </div>
                            <div className="bg-white p-3 rounded border border-[#E3E7E2]">
                              <div className="text-[#526058]">مساهمتك المعتمدة</div>
                              <div className="font-bold text-[#14532D] mt-1">{formatEGP(p.my_approved_contribution)}</div>
                              {p.my_pending_contribution > 0 && (
                                <div className="text-[11px] text-[#B45309] mt-0.5">
                                  معلق: {formatEGP(p.my_pending_contribution)}
                                </div>
                              )}
                            </div>
                            <div className="bg-white p-3 rounded border border-[#E3E7E2]">
                              <div className="text-[#526058]">النصيب التقديري من الصرف</div>
                              <div className="font-bold text-[#18231D] mt-1">{formatEGP(p.estimated_proportional_expense)}</div>
                            </div>
                          </div>

                          <p className="text-xs text-[#526058]">{p.allocation_note}</p>

                          {/* Approved expenses inside this project */}
                          <div className="bg-white border border-[#E3E7E2] rounded-lg overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-[#E3E7E2] text-xs font-bold text-[#18231D]">
                              تفاصيل المصروفات المعتمدة لهذا المشروع
                            </div>
                            {!p.expenses || p.expenses.length === 0 ? (
                              <div className="p-4 text-xs text-[#526058]">
                                لم يتم تسجيل أو اعتماد سندات صرف لهذا المشروع بعد؛ الرصيد محفوظ بالمشروع.
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs text-right">
                                  <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-[#526058]">
                                    <tr>
                                      <th className="py-2 px-3">التاريخ</th>
                                      <th className="py-2 px-3">السند</th>
                                      <th className="py-2 px-3">البند والوصف</th>
                                      <th className="py-2 px-3">المبلغ</th>
                                      <th className="py-2 px-3">الفاتورة</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#E3E7E2]">
                                    {p.expenses.map((ex) => (
                                      <tr key={ex.id}>
                                        <td className="py-2.5 px-3 tabular-nums text-[#526058] whitespace-nowrap">
                                          {formatDateAr(ex.expense_date)}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">{ex.voucher_number}</td>
                                        <td className="py-2.5 px-3">
                                          <div className="font-semibold text-[#18231D]">{ex.title_ar}</div>
                                          <div className="text-[#526058]">
                                            {ex.category_ar}
                                            {ex.description_ar ? ` · ${ex.description_ar}` : ''}
                                          </div>
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-[#14532D] tabular-nums whitespace-nowrap">
                                          {formatEGP(ex.amount)}
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                          {ex.attachment_file_id ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setPreviewFile({
                                                  id: ex.attachment_file_id!,
                                                  name: ex.attachment_name || `فاتورة_${ex.voucher_number}`,
                                                  mimeType: ex.attachment_mime_type,
                                                })
                                              }
                                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#14532D] border border-[#14532D]/30 rounded hover:bg-[#ECFDF5] whitespace-nowrap shrink-0"
                                            >
                                              <Eye className="w-3 h-3" />
                                              <span>عرض الفاتورة</span>
                                            </button>
                                          ) : (
                                            <span className="text-[#526058]">مستند داخلي محفوظ</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* Project Progress Updates */}
                          {p.updates && p.updates.length > 0 && (
                            <div className="bg-white border border-[#E3E7E2] rounded-lg p-4 space-y-2.5">
                              <div className="text-xs font-bold text-[#18231D]">آخر تحديثات تنفيذ المشروع</div>
                              <div className="divide-y divide-[#E3E7E2]">
                                {p.updates.map((upd) => (
                                  <div key={upd.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                      <span className="font-semibold text-[#18231D]">{upd.title_ar}</span>
                                      <span className="text-[#526058] font-mono tabular-nums">
                                        الإنجاز: {upd.progress_percent}% · {formatDateAr(upd.created_at)}
                                      </span>
                                    </div>
                                    <p className="text-xs text-[#526058] leading-relaxed">{upd.details_ar}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* General Aggregated Spending by Category */}
                <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
                  <h2 className="text-lg font-bold text-[#18231D]">ملخص أوجه الصرف المعتمدة بالجمعية</h2>
                  {data.publishedSpending.length === 0 ? (
                    <p className="text-sm text-[#526058]">لم تُسجل مصروفات معتمدة بعد.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-right">
                        <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                          <tr>
                            <th className="py-2.5 px-4">البند المالي</th>
                            <th className="py-2.5 px-4">المشروع المرتبط</th>
                            <th className="py-2.5 px-4">عدد السندات</th>
                            <th className="py-2.5 px-4">إجمالي المنصرف المعتمد</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E7E2]">
                          {data.publishedSpending.map((row, i) => (
                            <tr key={i}>
                              <td className="py-2.5 px-4 font-semibold">{row.category_ar}</td>
                              <td className="py-2.5 px-4 text-[#526058]">{row.project_title || 'مصروف عام للجمعية'}</td>
                              <td className="py-2.5 px-4 font-mono tabular-nums">{row.vouchers_count}</td>
                              <td className="py-2.5 px-4 font-mono font-bold text-[#14532D] tabular-nums">
                                {formatEGP(row.total_amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Detailed Published Vouchers */}
                <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-[#18231D]">سجل سندات الصرف المعتمدة والمنشورة</h2>
                    <p className="text-xs text-[#526058] mt-1">
                      تُعرض تفاصيل العمليات المالية والفواتير المصرّح بنشرها فقط مع الحفاظ التام على خصوصية المستفيدين.
                    </p>
                  </div>
                  {!data.publishedExpenses || data.publishedExpenses.length === 0 ? (
                    <p className="text-sm text-[#526058]">لا توجد سندات صرف معتمدة منشورة حتى الآن.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs sm:text-sm text-right">
                        <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                          <tr>
                            <th className="py-2.5 px-4">التاريخ</th>
                            <th className="py-2.5 px-4">رقم السند</th>
                            <th className="py-2.5 px-4">المشروع</th>
                            <th className="py-2.5 px-4">وصف المصروف</th>
                            <th className="py-2.5 px-4">المبلغ</th>
                            <th className="py-2.5 px-4">المستند</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E3E7E2]">
                          {data.publishedExpenses.map((ex) => (
                            <tr key={ex.id}>
                              <td className="py-2.5 px-4 text-xs text-[#526058] tabular-nums whitespace-nowrap">
                                {formatDateAr(ex.expense_date)}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap">{ex.voucher_number}</td>
                              <td className="py-2.5 px-4 text-xs text-[#526058]">
                                {ex.project_title || 'مصروف عام للجمعية'}
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="font-semibold text-[#18231D]">{ex.title_ar}</div>
                                <div className="text-xs text-[#526058]">
                                  {ex.category_ar}
                                  {ex.description_ar ? ` · ${ex.description_ar}` : ''}
                                </div>
                              </td>
                              <td className="py-2.5 px-4 font-mono font-bold text-[#14532D] tabular-nums whitespace-nowrap">
                                {formatEGP(ex.amount)}
                              </td>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                {ex.attachment_file_id ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewFile({
                                        id: ex.attachment_file_id!,
                                        name: ex.attachment_name || `فاتورة_${ex.voucher_number}`,
                                        mimeType: ex.attachment_mime_type,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#14532D] border border-[#14532D]/30 rounded hover:bg-[#ECFDF5] whitespace-nowrap shrink-0"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>عرض الفاتورة</span>
                                  </button>
                                ) : (
                                  <span className="text-xs text-[#526058]">محفوظ إداريًا</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Recent Public Project Updates */}
                {data.projectUpdates && data.projectUpdates.length > 0 && (
                  <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
                    <h2 className="text-lg font-bold text-[#18231D]">آخر تحديثات المشروعات الخيرية</h2>
                    <div className="divide-y divide-[#E3E7E2]">
                      {data.projectUpdates.map((upd) => (
                        <div key={upd.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-[#18231D]">
                              {upd.title_ar} {upd.project_title ? `· ${upd.project_title}` : ''}
                            </span>
                            <span className="font-mono text-[#526058] tabular-nums">
                              نسبة الإنجاز: {upd.progress_percent}% · {formatDateAr(upd.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-[#526058] leading-relaxed">{upd.details_ar}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {tab === 'notifications' && (
              <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
                <div className="p-5 border-b border-[#E3E7E2] flex items-center justify-between">
                  <h2 className="text-lg font-bold text-[#18231D]">الإشعارات والتنبيهات</h2>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/notifications/read-all', { method: 'POST' });
                      loadData();
                    }}
                    className="text-xs font-semibold text-[#14532D] hover:underline"
                  >
                    تحديد الكل كمقروء
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <div className="p-10 text-center text-sm text-[#526058]">لا توجد إشعارات حاليًا.</div>
                ) : (
                  <div className="divide-y divide-[#E3E7E2]">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-4 flex items-start justify-between gap-4 ${n.is_read ? 'bg-white' : 'bg-[#ECFDF5]/40'}`}
                      >
                        <div>
                          <div className="font-bold text-sm text-[#18231D]">{n.title_ar}</div>
                          <p className="text-xs text-[#526058] mt-1 leading-relaxed">{n.message_ar}</p>
                          <div className="text-[11px] text-[#526058] mt-1 tabular-nums">{formatDateTimeAr(n.created_at)}</div>
                        </div>
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
                              loadData();
                            }}
                            className="text-xs font-semibold text-[#14532D] shrink-0"
                          >
                            تمت القراءة
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Clarification Modal */}
      {clarifyingDonation && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleClarifySubmit}
            className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-[#18231D]">
              إرسال توضيح للطلب {clarifyingDonation.reference_code}
            </h3>
            <p className="text-xs text-[#9A3412] bg-[#FFF7ED] p-3 rounded border border-[#FDBA74]">
              طلب المراجع: {clarifyingDonation.clarification_request}
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1">ردك التوضيحي</label>
              <textarea
                required
                rows={3}
                value={clarifyNote}
                onChange={(e) => setClarifyNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">إرفاق صورة/ملف إضافي (اختياري)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setClarifyFile(e.target.files?.[0] || null)}
                className="text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClarifyingDonation(null)}
                className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg"
              >
                إرسال التوضيح
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleChangePassword}
            className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-[#18231D]">
              {user.mustChangePassword ? 'يرجى تغيير كلمة المرور المؤقتة' : 'تغيير كلمة المرور'}
            </h3>
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
              <label className="block text-xs font-semibold mb-1">كلمة المرور الجديدة (8 أحرف فأكثر)</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg"
              >
                لاحقًا
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">
                حفظ كلمة المرور
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Donation Full Detail Modal */}
      {(loadingDetail || selectedDonationDetail) && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white border border-[#E3E7E2] rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto my-auto">
            {loadingDetail && !selectedDonationDetail ? (
              <div className="p-10 text-center text-sm text-[#526058]">جارٍ تحميل تفاصيل التبرع...</div>
            ) : selectedDonationDetail ? (
              <div className="divide-y divide-[#E3E7E2]">
                <div className="px-6 py-4 bg-[#F8F9F7] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono text-[#526058] tabular-nums">
                      مرجع الطلب: {selectedDonationDetail.donation.reference_code}
                    </div>
                    <h3 className="text-lg font-bold text-[#18231D]">
                      {selectedDonationDetail.donation.project_title ||
                        selectedDonationDetail.donation.case_category_label ||
                        DONATION_TYPE_LABELS[selectedDonationDetail.donation.donation_type] ||
                        'تفاصيل التبرع'}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusText
                      label={(DONATION_STATUS_META[selectedDonationDetail.donation.status] || { label: selectedDonationDetail.donation.status }).label}
                      tone={statusTone(selectedDonationDetail.donation.status)}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedDonationDetail(null)}
                      aria-label="إغلاق تفاصيل التبرع"
                      className="p-1.5 text-[#526058] hover:text-[#18231D] border border-[#E3E7E2] rounded-lg bg-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-[#F8F9F7] border border-[#E3E7E2]">
                      <div className="text-[#526058]">قيمة التبرع</div>
                      <div className="text-base font-bold text-[#14532D] font-mono tabular-nums mt-1">
                        {formatEGP(selectedDonationDetail.donation.amount)}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8F9F7] border border-[#E3E7E2]">
                      <div className="text-[#526058]">رقم الإيصال</div>
                      <div className="font-mono font-bold text-[#18231D] tabular-nums mt-1">
                        {selectedDonationDetail.donation.receipt_number || 'يصدر بعد الاعتماد'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8F9F7] border border-[#E3E7E2]">
                      <div className="text-[#526058]">تاريخ التبرع</div>
                      <div className="font-semibold text-[#18231D] tabular-nums mt-1">
                        {formatDateAr(selectedDonationDetail.donation.donation_date)}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#F8F9F7] border border-[#E3E7E2]">
                      <div className="text-[#526058]">طريقة الدفع</div>
                      <div className="font-semibold text-[#18231D] mt-1">
                        {selectedDonationDetail.donation.payment_method}
                      </div>
                    </div>
                  </div>

                  <dl className="divide-y divide-[#E3E7E2] border-y border-[#E3E7E2] text-xs sm:text-sm">
                    <div className="py-2.5 flex justify-between gap-4">
                      <dt className="text-[#526058]">نوع التبرع</dt>
                      <dd className="font-semibold text-[#18231D]">
                        {DONATION_TYPE_LABELS[selectedDonationDetail.donation.donation_type] ||
                          selectedDonationDetail.donation.donation_type}
                      </dd>
                    </div>
                    {selectedDonationDetail.donation.transaction_ref && (
                      <div className="py-2.5 flex justify-between gap-4">
                        <dt className="text-[#526058]">رقم العملية البنكية</dt>
                        <dd className="font-mono text-[#18231D]">{selectedDonationDetail.donation.transaction_ref}</dd>
                      </div>
                    )}
                    {selectedDonationDetail.donation.account_name && (
                      <div className="py-2.5 flex justify-between gap-4">
                        <dt className="text-[#526058]">الحساب المالي المستلم</dt>
                        <dd className="font-semibold text-[#18231D]">{selectedDonationDetail.donation.account_name}</dd>
                      </div>
                    )}
                    {selectedDonationDetail.donation.approved_at && (
                      <div className="py-2.5 flex justify-between gap-4">
                        <dt className="text-[#526058]">تاريخ الاعتماد</dt>
                        <dd className="tabular-nums text-[#18231D]">
                          {formatDateTimeAr(selectedDonationDetail.donation.approved_at)}
                        </dd>
                      </div>
                    )}
                    {selectedDonationDetail.donation.donor_notes && (
                      <div className="py-2.5 flex justify-between gap-4">
                        <dt className="text-[#526058]">ملاحظاتك</dt>
                        <dd className="text-[#18231D] text-left">{selectedDonationDetail.donation.donor_notes}</dd>
                      </div>
                    )}
                  </dl>

                  {selectedDonationDetail.donation.status === 'rejected' &&
                    selectedDonationDetail.donation.rejection_reason && (
                      <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">
                        <strong>سبب الرفض:</strong> {selectedDonationDetail.donation.rejection_reason}
                      </div>
                    )}

                  {selectedDonationDetail.donation.status === 'needs_clarification' &&
                    selectedDonationDetail.donation.clarification_request && (
                      <div className="p-3 rounded-lg bg-[#FFF7ED] border border-[#FDBA74] text-xs text-[#9A3412]">
                        <strong>مطلوب توضيح:</strong> {selectedDonationDetail.donation.clarification_request}
                      </div>
                    )}

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedDonationDetail.donation.proof_file_id && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewFile({
                            id: selectedDonationDetail.donation.proof_file_id!,
                            name: selectedDonationDetail.donation.proof_file_name,
                            mimeType: selectedDonationDetail.donation.proof_mime_type,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[#E3E7E2] rounded-lg hover:bg-[#F8F9F7] whitespace-nowrap shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>عرض صورة الإثبات</span>
                      </button>
                    )}
                    {selectedDonationDetail.donation.status === 'approved' &&
                      selectedDonationDetail.donation.receipt_id && (
                        <button
                          type="button"
                          onClick={() => {
                            const recId = selectedDonationDetail.donation.receipt_id!;
                            setSelectedDonationDetail(null);
                            handleOpenReceipt(recId);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>عرض وطباعة الإيصال الرسمي ({selectedDonationDetail.donation.receipt_number})</span>
                        </button>
                      )}
                    {selectedDonationDetail.donation.status === 'needs_clarification' && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = selectedDonationDetail.donation;
                          setSelectedDonationDetail(null);
                          setClarifyingDonation(target);
                        }}
                        className="px-3.5 py-2 text-xs font-semibold text-[#9A3412] border border-[#FDBA74] bg-[#FFF7ED] rounded-lg whitespace-nowrap shrink-0"
                      >
                        إرسال الرد والتوضيح
                      </button>
                    )}
                  </div>

                  {/* Linked Project Spending & Progress */}
                  {selectedDonationDetail.projectSummary && (
                    <div className="p-4 rounded-xl border border-[#E3E7E2] bg-[#F8F9F7] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-bold text-[#18231D]">
                          أوجه صرف المشروع: {selectedDonationDetail.projectSummary.title_ar}
                        </h4>
                        <span className="text-xs font-semibold text-[#14532D] font-mono tabular-nums">
                          نسبة مساهمتك: {selectedDonationDetail.projectSummary.contribution_share_percent}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                        <div className="bg-white p-2.5 rounded border border-[#E3E7E2]">
                          <div className="text-[#526058]">المجموع المعتمد</div>
                          <div className="font-bold text-[#14532D]">
                            {formatEGP(selectedDonationDetail.projectSummary.total_project_approved)}
                          </div>
                        </div>
                        <div className="bg-white p-2.5 rounded border border-[#E3E7E2]">
                          <div className="text-[#526058]">المصروف المعتمد</div>
                          <div className="font-bold text-[#18231D]">
                            {formatEGP(selectedDonationDetail.projectSummary.total_project_expenses)}
                          </div>
                        </div>
                        <div className="bg-white p-2.5 rounded border border-[#E3E7E2]">
                          <div className="text-[#526058]">المتبقي بالمشروع</div>
                          <div className="font-bold text-[#18231D]">
                            {formatEGP(selectedDonationDetail.projectSummary.remaining_balance)}
                          </div>
                        </div>
                      </div>
                      {selectedDonationDetail.projectSummary.expenses.length > 0 && (
                        <div className="bg-white border border-[#E3E7E2] rounded-lg divide-y divide-[#E3E7E2] text-xs">
                          {selectedDonationDetail.projectSummary.expenses.map((ex) => (
                            <div key={ex.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="font-semibold text-[#18231D]">
                                  {ex.title_ar} <span className="font-mono text-[#526058]">({ex.voucher_number})</span>
                                </div>
                                <div className="text-[#526058] tabular-nums">
                                  {ex.category_ar} · {formatDateAr(ex.expense_date)}
                                  {ex.description_ar ? ` · ${ex.description_ar}` : ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#14532D] tabular-nums">
                                  {formatEGP(ex.amount)}
                                </span>
                                {ex.attachment_file_id && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewFile({
                                        id: ex.attachment_file_id!,
                                        name: ex.attachment_name || `فاتورة_${ex.voucher_number}`,
                                        mimeType: ex.attachment_mime_type,
                                      })
                                    }
                                    className="px-2 py-1 text-[11px] font-semibold text-[#14532D] border border-[#14532D]/30 rounded hover:bg-[#ECFDF5] whitespace-nowrap shrink-0"
                                  >
                                    الفاتورة
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Review Timeline */}
                  {selectedDonationDetail.history.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-[#526058]">سجل حالة المراجعة والتوثيق</h4>
                      <div className="border border-[#E3E7E2] rounded-lg divide-y divide-[#E3E7E2] text-xs">
                        {selectedDonationDetail.history.map((h) => (
                          <div key={h.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-semibold text-[#18231D]">
                                {(DONATION_STATUS_META[h.new_status] || { label: h.new_status }).label}
                              </span>
                              {h.note && <span className="text-[#526058]"> · {h.note}</span>}
                            </div>
                            <span className="text-[#526058] tabular-nums">{formatDateTimeAr(h.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <ReceiptModal
        receipt={selectedReceipt}
        settings={data?.settings}
        onClose={() => setSelectedReceipt(null)}
        onBackToAccount={() => {
          setSelectedReceipt(null);
          setTab('donations');
        }}
        backLabel="العودة إلى حسابي"
        onNotify={onNotify}
      />
    </div>
  );
}
