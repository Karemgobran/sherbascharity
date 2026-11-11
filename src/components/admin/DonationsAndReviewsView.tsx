import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, FileText, Plus, Printer, Search } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { downloadOfficialReceiptPdf } from '../../lib/exportUtils.ts';
import {
  DONATION_STATUS_META,
  DONATION_TYPE_LABELS,
  formatDateAr,
  formatDateTimeAr,
  formatEGP,
  FUND_TYPE_LABELS,
  hasPerm,
} from '../../lib/labels.ts';
import type {
  AuthUser,
  CharitySettings,
  DonationRecord,
  FinancialAccount,
  PersonRecord,
  PublicProject,
  ReceiptRecord,
} from '../../types.ts';
import { FilePreviewModal, LoadingState, ReceiptModal, StatusText } from '../ui/CommonUI.tsx';

export function DonationsAndReviewsView({
  user,
  initialSubTab = 'reviews',
  onNotify,
}: {
  user: AuthUser;
  initialSubTab?: 'reviews' | 'all' | 'receipts';
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [subTab, setSubTab] = useState<'reviews' | 'all' | 'receipts'>(initialSubTab);
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [donors, setDonors] = useState<PersonRecord[]>([]);
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [settings, setSettings] = useState<CharitySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [receiptQ, setReceiptQ] = useState('');

  // Preview & Receipt Modals
  const [previewFile, setPreviewFile] = useState<{ id: string; name?: string | null; mimeType?: string | null } | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRecord | null>(null);

  // Review Decision Modal
  const [reviewing, setReviewing] = useState<DonationRecord | null>(null);
  const [decisionAction, setDecisionAction] = useState<'approved' | 'rejected' | 'needs_clarification' | 'in_review' | 'cancelled'>('approved');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [confirmedFunds, setConfirmedFunds] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New Donation / Contextual Add Donor Modal
  const [showAddDonation, setShowAddDonation] = useState(false);
  const [newDonDonorId, setNewDonDonorId] = useState('');
  const [newDonType, setNewDonType] = useState('general');
  const [newDonProjectId, setNewDonProjectId] = useState('');
  const [newDonAmount, setNewDonAmount] = useState('');
  const [newDonMethod, setNewDonMethod] = useState('تحويل بنكي');
  const [newDonRef, setNewDonRef] = useState('');
  const [newDonDate, setNewDonDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newDonNotes, setNewDonNotes] = useState('');
  const [newDonProof, setNewDonProof] = useState<File | null>(null);

  const [showQuickDonor, setShowQuickDonor] = useState(false);
  const [qdName, setQdName] = useState('');
  const [qdPhone, setQdPhone] = useState('');
  const [qdUsername, setQdUsername] = useState('');
  const [qdPassword, setQdPassword] = useState('');

  const canCreatePerson =
    user.roleKey === 'super_admin' ||
    (hasPerm(user.permissions, user.roleKey, 'people:create') && hasPerm(user.permissions, user.roleKey, 'staff:create'));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (subTab === 'reviews') {
        // Focus on pending / in_review / needs_clarification
      } else if (statusFilter !== 'all') {
        qs.set('status', statusFilter);
      }
      if (searchQ.trim()) qs.set('q', searchQ.trim());

      const [donRes, recRes, projRes, pubRes] = await Promise.all([
        apiFetch<{ donations: DonationRecord[] }>(`/api/donations?${qs.toString()}`),
        hasPerm(user.permissions, user.roleKey, 'receipts:view') || hasPerm(user.permissions, user.roleKey, 'donations:view')
          ? apiFetch<{ receipts: ReceiptRecord[] }>(`/api/receipts${receiptQ.trim() ? `?q=${encodeURIComponent(receiptQ.trim())}` : ''}`)
          : Promise.resolve({ receipts: [] }),
        apiFetch<{ projects: PublicProject[] }>('/api/projects'),
        apiFetch<{ settings: CharitySettings }>('/api/public/overview'),
      ]);

      setDonations(donRes.donations);
      setReceipts(recRes.receipts);
      setProjects(projRes.projects);
      setSettings(pubRes.settings);

      if (hasPerm(user.permissions, user.roleKey, 'donations:approve') || hasPerm(user.permissions, user.roleKey, 'finance:view')) {
        const accRes = await apiFetch<{ accounts: FinancialAccount[] }>('/api/finance/accounts').catch(() => ({ accounts: [] }));
        setAccounts(accRes.accounts);
      }
      if (hasPerm(user.permissions, user.roleKey, 'donations:create')) {
        const pplRes = await apiFetch<{ people: PersonRecord[] }>('/api/people?type=donor').catch(() => ({ people: [] }));
        setDonors(pplRes.people);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل التبرعات');
    } finally {
      setLoading(false);
    }
  }, [subTab, statusFilter, searchQ, receiptQ, user.permissions, user.roleKey, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openReviewModal = (d: DonationRecord) => {
    setReviewing(d);
    setDecisionAction('approved');
    setConfirmedFunds(false);
    setInternalNote(d.internal_note || '');
    setReasonText('');
    const matchingAcc = accounts.find((a) => a.is_active && (d.is_zakat ? a.fund_type === 'zakat' : a.fund_type !== 'zakat'));
    setSelectedAccountId(matchingAcc ? String(matchingAcc.id) : '');
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewing) return;
    setSubmitting(true);
    try {
      const res = await apiFetch<{ message: string; receiptId?: number }>(`/api/donations/${reviewing.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          action: decisionAction,
          financialAccountId: decisionAction === 'approved' && selectedAccountId ? Number(selectedAccountId) : undefined,
          confirmedFundsReceived: decisionAction === 'approved' ? confirmedFunds : false,
          internalNote,
          rejectionReason: decisionAction === 'rejected' ? reasonText : undefined,
          clarificationRequest: decisionAction === 'needs_clarification' ? reasonText : undefined,
        }),
      });
      onNotify('success', res.message);
      setReviewing(null);
      await loadData();
      if (res.receiptId) {
        const rec = await apiFetch<{ receipt: ReceiptRecord }>(`/api/receipts/${res.receiptId}`);
        setSelectedReceipt(rec.receipt);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تنفيذ إجراء المراجعة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('donorPersonId', newDonDonorId);
      form.append('donationType', newDonType);
      if (newDonType === 'project' && newDonProjectId) form.append('projectId', newDonProjectId);
      form.append('amount', newDonAmount);
      form.append('paymentMethod', newDonMethod);
      form.append('transactionRef', newDonRef);
      form.append('donationDate', newDonDate);
      form.append('donorNotes', newDonNotes);
      if (newDonProof) form.append('proof', newDonProof);

      const res = await apiFetch<{ message: string }>('/api/donations', { method: 'POST', body: form });
      onNotify('success', res.message);
      setShowAddDonation(false);
      setNewDonAmount('');
      setNewDonRef('');
      setNewDonNotes('');
      setNewDonProof(null);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل التبرع');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCreateDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ personId: number; message: string }>('/api/people', {
        method: 'POST',
        body: JSON.stringify({
          fullName: qdName,
          phone: qdPhone,
          personType: 'donor',
          createAccount: Boolean(qdUsername && qdPassword),
          username: qdUsername,
          password: qdPassword,
        }),
      });
      onNotify('success', res.message);
      setShowQuickDonor(false);
      setQdName('');
      setQdPhone('');
      setQdUsername('');
      setQdPassword('');
      await loadData();
      setNewDonDonorId(String(res.personId));
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إضافة المتبرع');
    }
  };

  const reviewQueue = donations.filter((d) => ['pending_review', 'in_review', 'needs_clarification'].includes(d.status));
  const displayedDonations = subTab === 'reviews' ? reviewQueue : donations;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#18231D]">التبرعات والمراجعة والإيصالات</h1>
          <p className="text-xs text-[#526058] mt-1">
            لا يُعتمد أي تبرع ولا يصدر إيصاله إلا بعد التحقق الفعلي من وصول المبلغ إلى خزينة أو حساب الجمعية.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreatePerson && (
            <button
              type="button"
              onClick={() => setShowQuickDonor(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#14532D] bg-white border border-[#14532D]/30 hover:bg-[#ECFDF5] rounded-lg whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة متبرع</span>
            </button>
          )}
          {hasPerm(user.permissions, user.roleKey, 'donations:create') && (
            <button
              type="button"
              onClick={() => setShowAddDonation(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل طلب تبرع</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 p-1 bg-white border border-[#E3E7E2] rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setSubTab('reviews')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
            subTab === 'reviews' ? 'bg-[#14532D] text-white' : 'text-[#526058] hover:text-[#18231D]'
          }`}
        >
          طلبات التبرع الجديدة ({reviewQueue.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('all')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
            subTab === 'all' ? 'bg-[#14532D] text-white' : 'text-[#526058] hover:text-[#18231D]'
          }`}
        >
          سجل التبرعات الكامل
        </button>
        <button
          type="button"
          onClick={() => setSubTab('receipts')}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
            subTab === 'receipts' ? 'bg-[#14532D] text-white' : 'text-[#526058] hover:text-[#18231D]'
          }`}
        >
          أرشيف الإيصالات ({receipts.length})
        </button>
      </div>

      {subTab !== 'receipts' ? (
        <div className="space-y-4">
          <div className="bg-white border border-[#E3E7E2] rounded-xl p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#526058] absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="بحث باسم المتبرع أو الهاتف أو رقم المرجع أو رقم العملية..."
                className="w-full pr-9 pl-3 py-2 text-xs border border-[#E3E7E2] rounded-lg"
              />
            </div>
            {subTab === 'all' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg bg-white"
              >
                <option value="all">كل الحالات</option>
                <option value="pending_review">بانتظار المراجعة</option>
                <option value="in_review">قيد المراجعة</option>
                <option value="needs_clarification">يحتاج توضيح</option>
                <option value="approved">معتمد</option>
                <option value="rejected">مرفوض</option>
                <option value="cancelled">ملغي</option>
              </select>
            )}
          </div>

          {loading ? (
            <LoadingState />
          ) : displayedDonations.length === 0 ? (
            <div className="bg-white border border-[#E3E7E2] rounded-xl p-10 text-center text-sm text-[#526058]">
              {subTab === 'reviews' ? 'لا توجد طلبات تبرع جديدة بانتظار المراجعة حاليًا.' : 'لا توجد تبرعات مطابقة.'}
            </div>
          ) : (
            <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                    <tr>
                      <th className="py-3 px-4">المرجع / المتبرع</th>
                      <th className="py-3 px-4">المشروع / النوع</th>
                      <th className="py-3 px-4">المبلغ</th>
                      <th className="py-3 px-4">الدفع والعملية</th>
                      <th className="py-3 px-4">الإثبات</th>
                      <th className="py-3 px-4">الحالة</th>
                      <th className="py-3 px-4">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E3E7E2]">
                    {displayedDonations.map((d) => {
                      const meta = DONATION_STATUS_META[d.status] || { label: d.status };
                      return (
                        <tr key={d.id} className="hover:bg-[#F8F9F7]">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#18231D]">{d.donor_name}</div>
                            <div className="text-xs text-[#526058] font-mono">
                              {d.reference_code} · {d.donor_phone}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-semibold text-[#18231D]">{DONATION_TYPE_LABELS[d.donation_type] || d.donation_type}</div>
                            <div className="text-[#526058]">{d.project_title || d.case_category_label || 'تبرع عام'}</div>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[#14532D] tabular-nums">{formatEGP(d.amount)}</td>
                          <td className="py-3 px-4 text-xs">
                            <div>{d.payment_method}</div>
                            <div className="text-[#526058] font-mono">
                              {d.transaction_ref || 'بدون مرجع'} · {formatDateAr(d.donation_date)}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {d.proof_file_id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewFile({
                                    id: d.proof_file_id!,
                                    name: d.proof_file_name,
                                    mimeType: d.proof_mime_type,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-[#E3E7E2] rounded hover:bg-white"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>معاينة الإثبات</span>
                              </button>
                            ) : (
                              <span className="text-xs text-[#526058]">بدون مرفق</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <StatusText
                              label={meta.label}
                              tone={
                                d.status === 'approved'
                                  ? 'success'
                                  : d.status === 'rejected'
                                    ? 'danger'
                                    : d.status === 'needs_clarification'
                                      ? 'info'
                                      : 'warning'
                              }
                            />
                            {d.reviewed_by_name && (
                              <div className="text-[11px] text-[#526058] mt-0.5">مراجعة: {d.reviewed_by_name}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1.5">
                              {['pending_review', 'in_review', 'needs_clarification'].includes(d.status) &&
                                (hasPerm(user.permissions, user.roleKey, 'donations:approve') ||
                                  hasPerm(user.permissions, user.roleKey, 'donations:reject') ||
                                  hasPerm(user.permissions, user.roleKey, 'donations:edit')) && (
                                  <button
                                    type="button"
                                    onClick={() => openReviewModal(d)}
                                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap"
                                  >
                                    مراجعة واعتماد
                                  </button>
                                )}
                              {d.status === 'approved' && d.receipt_id && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const r = await apiFetch<{ receipt: ReceiptRecord }>(`/api/receipts/${d.receipt_id}`);
                                    setSelectedReceipt(r.receipt);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs border border-[#14532D]/30 text-[#14532D] rounded hover:bg-[#ECFDF5]"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>{d.receipt_number}</span>
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
            </div>
          )}
        </div>
      ) : (
        /* Receipts Archive Tab */
        <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#E3E7E2] flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold text-[#18231D]">سجل الإيصالات الرسمية المعتمدة</h3>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#526058] absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={receiptQ}
                onChange={(e) => setReceiptQ(e.target.value)}
                placeholder="بحث برقم الإيصال أو اسم المتبرع..."
                className="w-full pr-9 pl-3 py-2 text-xs border border-[#E3E7E2] rounded-lg"
              />
            </div>
          </div>
          {receipts.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#526058]">لا توجد إيصالات صادرة بعد.</div>
          ) : (
            <div className="divide-y divide-[#E3E7E2]">
              {receipts.map((r) => (
                <div key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-[#F8F9F7]">
                  <div>
                    <div className="text-xs text-[#526058] flex items-center gap-2">
                      <span className="font-mono font-bold text-[#14532D]">{r.receipt_number}</span>
                      <span>·</span>
                      <span>{r.donor_name}</span>
                      <span>·</span>
                      <span className="tabular-nums">{formatDateTimeAr(r.approved_at)}</span>
                    </div>
                    <div className="text-sm font-semibold text-[#18231D] mt-1">
                      {r.donation_type_label} · {r.project_title || 'تبرع عام'}
                    </div>
                    <div className="text-xs text-[#526058] mt-0.5">
                      اعتمد بواسطة: {r.approved_by_name} · عدد مرات الطباعة: {r.print_count}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#14532D] tabular-nums ml-2">{formatEGP(r.amount)}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedReceipt(r)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[#E3E7E2] rounded-lg hover:bg-white"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>عرض / طباعة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadOfficialReceiptPdf(r, settings)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#14532D] rounded-lg"
                    >
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review Decision Modal */}
      {reviewing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSubmitReview} className="bg-white border border-[#E3E7E2] rounded-xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-[#E3E7E2] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#18231D]">مراجعة طلب التبرع {reviewing.reference_code}</h3>
                <div className="text-xs text-[#526058] mt-1">
                  المتبرع: {reviewing.donor_name} ({reviewing.donor_phone}) · المبلغ:{' '}
                  <strong className="text-[#14532D] font-mono">{formatEGP(reviewing.amount)}</strong>
                </div>
              </div>
              {reviewing.proof_file_id && (
                <button
                  type="button"
                  onClick={() =>
                    setPreviewFile({
                      id: reviewing.proof_file_id!,
                      name: reviewing.proof_file_name,
                      mimeType: reviewing.proof_mime_type,
                    })
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#14532D] border border-[#14532D]/30 rounded-lg"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>فتح الإثبات بحجم كامل</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-[#F8F9F7] p-3.5 rounded-lg border border-[#E3E7E2]">
              <div>
                <span className="text-[#526058]">الطريقة: </span>
                <strong>{reviewing.payment_method}</strong>
              </div>
              <div>
                <span className="text-[#526058]">رقم العملية: </span>
                <strong className="font-mono">{reviewing.transaction_ref || '—'}</strong>
              </div>
              <div>
                <span className="text-[#526058]">تاريخ العملية: </span>
                <strong className="tabular-nums">{formatDateAr(reviewing.donation_date)}</strong>
              </div>
              <div className="col-span-full">
                <span className="text-[#526058]">ملاحظات المتبرع: </span>
                <span>{reviewing.donor_notes || 'لا توجد ملاحظات'}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">قرار المراجعة</label>
              <div className="flex flex-wrap gap-2">
                {hasPerm(user.permissions, user.roleKey, 'donations:approve') && (
                  <button
                    type="button"
                    onClick={() => setDecisionAction('approved')}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                      decisionAction === 'approved' ? 'bg-[#14532D] text-white border-[#14532D]' : 'bg-white border-[#E3E7E2]'
                    }`}
                  >
                    قبول واعتماد التبرع
                  </button>
                )}
                {hasPerm(user.permissions, user.roleKey, 'donations:edit') && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDecisionAction('in_review')}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                        decisionAction === 'in_review' ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]' : 'bg-white border-[#E3E7E2]'
                      }`}
                    >
                      قيد المراجعة
                    </button>
                    <button
                      type="button"
                      onClick={() => setDecisionAction('needs_clarification')}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                        decisionAction === 'needs_clarification' ? 'bg-[#B45309] text-white border-[#B45309]' : 'bg-white border-[#E3E7E2]'
                      }`}
                    >
                      طلب توضيح إضافي
                    </button>
                  </>
                )}
                {hasPerm(user.permissions, user.roleKey, 'donations:reject') && (
                  <button
                    type="button"
                    onClick={() => setDecisionAction('rejected')}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                      decisionAction === 'rejected' ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white border-[#E3E7E2]'
                    }`}
                  >
                    رفض التبرع
                  </button>
                )}
                {hasPerm(user.permissions, user.roleKey, 'donations:cancel') && (
                  <button
                    type="button"
                    onClick={() => setDecisionAction('cancelled')}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
                      decisionAction === 'cancelled' ? 'bg-[#526058] text-white border-[#526058]' : 'bg-white border-[#E3E7E2]'
                    }`}
                  >
                    إلغاء الطلب
                  </button>
                )}
              </div>
            </div>

            {decisionAction === 'approved' && (
              <div className="p-4 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#14532D] mb-1">
                    الخزينة / الحساب البنكي المستلم للمبلغ {reviewing.is_zakat ? '(تبرع زكاة: يلزم اختيار حساب زكاة)' : ''}
                  </label>
                  {accounts.length === 0 ? (
                    <div className="text-xs text-[#B91C1C]">
                      تنبيه: لا توجد خزائن أو حسابات بنكية مسجلة بعد. يرجى إنشاء خزينة/حساب من قسم «النظام المالي» أولًا.
                    </div>
                  ) : (
                    <select
                      required
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#A7F3D0] rounded-lg bg-white"
                    >
                      <option value="">اختر الخزينة أو البنك...</option>
                      {accounts
                        .filter((a) => a.is_active)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name_ar} ({FUND_TYPE_LABELS[a.fund_type]})
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <label className="flex items-start gap-2.5 text-xs font-semibold text-[#14532D] cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={confirmedFunds}
                    onChange={(e) => setConfirmedFunds(e.target.checked)}
                    className="mt-0.5 accent-[#14532D]"
                  />
                  <span>
                    أقر بصفتي المراجع المالي بالتحقق من كشف الحساب / الخزينة وتأكيد وصول مبلغ ({formatEGP(reviewing.amount)})
                    فعليًا للجمعية، وإصدار سند القبض والإيصال الرسمي للمتبرع.
                  </span>
                </label>
              </div>
            )}

            {(decisionAction === 'rejected' || decisionAction === 'needs_clarification') && (
              <div>
                <label className="block text-xs font-semibold mb-1">
                  {decisionAction === 'rejected' ? 'سبب الرفض (إلزامي ويظهر للمتبرع)' : 'التوضيح المطلوب من المتبرع'}
                </label>
                <textarea
                  required
                  rows={2}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">ملاحظة داخلية للإدارة (لا تظهر للمتبرع)</label>
              <textarea
                rows={2}
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReviewing(null)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">
                إغلاق
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'جارٍ التنفيذ...' : 'تنفيذ قرار المراجعة'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff Add Donation Modal */}
      {showAddDonation && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleCreateDonation} className="bg-white border border-[#E3E7E2] rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#18231D]">تسجيل طلب تبرع جديد</h3>
            <div>
              <label className="block text-xs font-semibold mb-1">المتبرع</label>
              <select
                required
                value={newDonDonorId}
                onChange={(e) => setNewDonDonorId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white"
              >
                <option value="">اختر المتبرع...</option>
                {donors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name} ({d.phone})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">نوع التبرع</label>
                <select value={newDonType} onChange={(e) => setNewDonType(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                  {Object.entries(DONATION_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {newDonType === 'project' && (
                <div>
                  <label className="block text-xs font-semibold mb-1">المشروع</label>
                  <select required value={newDonProjectId} onChange={(e) => setNewDonProjectId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                    <option value="">اختر المشروع...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.title_ar}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">المبلغ (ج.م)</label>
                <input type="number" min="1" step="0.01" required value={newDonAmount} onChange={(e) => setNewDonAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">طريقة الدفع</label>
                <select value={newDonMethod} onChange={(e) => setNewDonMethod(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                  <option value="تحويل بنكي">تحويل بنكي</option>
                  <option value="نقدي بمقر الجمعية">نقدي بمقر الجمعية</option>
                  <option value="فودافون كاش">فودافون كاش</option>
                  <option value="إنستاباي">إنستاباي</option>
                  <option value="شيك بنكي">شيك بنكي</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">التاريخ</label>
                <input type="date" required value={newDonDate} onChange={(e) => setNewDonDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">رقم العملية / الإيصال الورقي</label>
              <input value={newDonRef} onChange={(e) => setNewDonRef(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">إثبات الدفع (صورة / PDF)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setNewDonProof(e.target.files?.[0] || null)} className="text-xs" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddDonation(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" disabled={submitting} className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">حفظ وإحالة للمراجعة</button>
            </div>
          </form>
        </div>
      )}

      {/* Contextual Add Donor Modal (only shown if permitted!) */}
      {showQuickDonor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleQuickCreateDonor} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#18231D]">إضافة متبرع جديد</h3>
            <div>
              <label className="block text-xs font-semibold mb-1">اسم المتبرع</label>
              <input required value={qdName} onChange={(e) => setQdName(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">رقم الهاتف</label>
              <input required value={qdPhone} onChange={(e) => setQdPhone(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">اسم المستخدم (اختياري للبوابة)</label>
                <input dir="ltr" value={qdUsername} onChange={(e) => setQdUsername(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono text-left" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">كلمة المرور المؤقتة</label>
                <input type="password" value={qdPassword} onChange={(e) => setQdPassword(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowQuickDonor(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">حفظ المتبرع</button>
            </div>
          </form>
        </div>
      )}

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <ReceiptModal
        receipt={selectedReceipt}
        settings={settings}
        onClose={() => setSelectedReceipt(null)}
        backLabel="العودة إلى الإيصالات"
        onNotify={onNotify}
      />
    </div>
  );
}
