import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Plus, Search, Upload } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import {
  AID_STATUS_LABELS,
  AID_TYPE_LABELS,
  CASE_STATUS_LABELS,
  formatDateAr,
  formatEGP,
  hasPerm,
  PRIORITY_LABELS,
} from '../../lib/labels.ts';
import type {
  AidRecord,
  AuthUser,
  FinancialAccount,
  HumanitarianCase,
  InventoryItem,
  PersonRecord,
  PublicProject,
} from '../../types.ts';
import { FilePreviewModal, LoadingState, StatusText } from '../ui/CommonUI.tsx';

export function CasesAndAidsView({
  user,
  mode,
  onNotify,
}: {
  user: AuthUser;
  mode: 'cases' | 'aids';
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [cases, setCases] = useState<HumanitarianCase[]>([]);
  const [caseDocs, setCaseDocs] = useState<Array<{ id: number; case_id: number; title_ar: string; file_id: string; original_name: string; mime_type: string }>>([]);
  const [aids, setAids] = useState<AidRecord[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<PersonRecord[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Case Modal
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [cBenMode, setCBenMode] = useState<'existing' | 'new'>('new');
  const [cBenId, setCBenId] = useState('');
  const [cNewName, setCNewName] = useState('');
  const [cNewPhone, setCNewPhone] = useState('');
  const [cNewArea, setCNewArea] = useState('');
  const [cNewAddress, setCNewAddress] = useState('');
  const [cType, setCType] = useState('رعاية أسرة / أيتام');
  const [cDesc, setCDesc] = useState('');
  const [cPriority, setCPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [cFamilySize, setCFamilySize] = useState('4');
  const [cReqAmount, setCReqAmount] = useState('');

  // Case Status / Document Modal
  const [selectedCase, setSelectedCase] = useState<HumanitarianCase | null>(null);
  const [editStatus, setEditStatus] = useState('under_research');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [previewFile, setPreviewFile] = useState<{ id: string; name?: string | null; mimeType?: string | null } | null>(null);

  // Aid Modal
  const [showAidModal, setShowAidModal] = useState(false);
  const [aCaseId, setACaseId] = useState('');
  const [aType, setAType] = useState('financial');
  const [aMode, setAMode] = useState<'financial' | 'in_kind'>('financial');
  const [aAmount, setAAmount] = useState('');
  const [aItemId, setAItemId] = useState('');
  const [aQty, setAQty] = useState('');
  const [aAccountId, setAAccountId] = useState('');
  const [aProjectId, setAProjectId] = useState('');
  const [aIsZakat, setAIsZakat] = useState(false);
  const [aDate, setADate] = useState(() => new Date().toISOString().slice(0, 10));
  const [aNotes, setANotes] = useState('');

  // Aid Disburse Modal
  const [disbursingAid, setDisbursingAid] = useState<AidRecord | null>(null);
  const [disburseAccId, setDisburseAccId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'cases') {
        const qs = new URLSearchParams();
        if (statusFilter !== 'all') qs.set('status', statusFilter);
        if (searchQ.trim()) qs.set('q', searchQ.trim());
        const [cRes, bRes] = await Promise.all([
          apiFetch<{ cases: HumanitarianCase[]; documents: typeof caseDocs }>(`/api/cases?${qs.toString()}`),
          apiFetch<{ people: PersonRecord[] }>('/api/people?type=beneficiary').catch(() => ({ people: [] })),
        ]);
        setCases(cRes.cases);
        setCaseDocs(cRes.documents || []);
        setBeneficiaries(bRes.people);
      } else {
        const [aRes, cRes, accRes, invRes, prjRes] = await Promise.all([
          apiFetch<{ aids: AidRecord[] }>('/api/aids'),
          hasPerm(user.permissions, user.roleKey, 'beneficiaries:view')
            ? apiFetch<{ cases: HumanitarianCase[] }>('/api/cases').catch(() => ({ cases: [] }))
            : Promise.resolve({ cases: [] }),
          apiFetch<{ accounts: FinancialAccount[] }>('/api/finance/accounts').catch(() => ({ accounts: [] })),
          apiFetch<{ items: InventoryItem[] }>('/api/warehouse/items').catch(() => ({ items: [] })),
          apiFetch<{ projects: PublicProject[] }>('/api/projects').catch(() => ({ projects: [] })),
        ]);
        setAids(aRes.aids);
        setCases(cRes.cases);
        setAccounts(accRes.accounts);
        setItems(invRes.items);
        setProjects(prjRes.projects);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [mode, statusFilter, searchQ, user.permissions, user.roleKey, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/cases', {
        method: 'POST',
        body: JSON.stringify({
          beneficiaryPersonId: cBenMode === 'existing' ? Number(cBenId) : undefined,
          newBeneficiary:
            cBenMode === 'new'
              ? { fullName: cNewName, phone: cNewPhone, area: cNewArea, address: cNewAddress }
              : undefined,
          caseType: cType,
          descriptionAr: cDesc,
          priority: cPriority,
          familySize: Number(cFamilySize || 1),
          requestedAmount: Number(cReqAmount || 0),
        }),
      });
      onNotify('success', 'تم فتح ملف الحالة الإنسانية وحماية بيانات المستفيد');
      setShowCaseModal(false);
      setCNewName('');
      setCNewPhone('');
      setCDesc('');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الحالة');
    }
  };

  const handleUpdateCaseStatus = async () => {
    if (!selectedCase) return;
    try {
      await apiFetch(`/api/cases/${selectedCase.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          caseType: selectedCase.case_type,
          descriptionAr: selectedCase.description_ar,
          priority: selectedCase.priority,
          familySize: selectedCase.family_size,
          requestedAmount: selectedCase.requested_amount,
          status: editStatus,
          assignedPersonId: selectedCase.assigned_person_id,
        }),
      });
      onNotify('success', 'تم تحديث حالة الملف');
      setSelectedCase(null);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحديث الحالة');
    }
  };

  const handleUploadCaseDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !docFile) return;
    try {
      const form = new FormData();
      form.append('document', docFile);
      form.append('titleAr', docTitle || docFile.name);
      await apiFetch(`/api/cases/${selectedCase.id}/documents`, { method: 'POST', body: form });
      onNotify('success', 'تم رفع المستند في التخزين المحمي');
      setDocFile(null);
      setDocTitle('');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر رفع المستند');
    }
  };

  const handleCreateAid = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const form = new FormData();
      form.append('caseId', aCaseId);
      form.append('aidType', aType);
      form.append('deliveryMode', aMode);
      if (aMode === 'financial') form.append('amount', aAmount);
      else {
        form.append('inventoryItemId', aItemId);
        form.append('quantity', aQty);
      }
      if (aAccountId) form.append('financialAccountId', aAccountId);
      if (aProjectId) form.append('projectId', aProjectId);
      form.append('isZakat', String(aIsZakat));
      form.append('aidDate', aDate);
      form.append('notes', aNotes);

      const res = await apiFetch<{ message: string }>('/api/aids', { method: 'POST', body: form });
      onNotify('success', res.message);
      setShowAidModal(false);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل المساعدة');
    }
  };

  const handleAidAction = async (aidId: number, action: 'approved' | 'disbursed' | 'rejected', accountId?: number) => {
    try {
      const res = await apiFetch<{ message: string }>(`/api/aids/${aidId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, financialAccountId: accountId }),
      });
      onNotify('success', res.message);
      setDisbursingAid(null);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء');
    }
  };

  if (mode === 'aids') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-[#18231D]">إدارة المساعدات والصرف</h1>
            <p className="text-xs text-[#526058] mt-1">
              ترتبط كل مساعدة بملف الحالة ومصدر التمويل أو المخزن والموظف المسؤول.
            </p>
          </div>
          {hasPerm(user.permissions, user.roleKey, 'aids:create') && (
            <button
              type="button"
              onClick={() => setShowAidModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل طلب مساعدة</span>
            </button>
          )}
        </div>

        {loading ? (
          <LoadingState />
        ) : aids.length === 0 ? (
          <div className="bg-white border border-[#E3E7E2] rounded-xl p-10 text-center text-sm text-[#526058]">
            لا توجد طلبات مساعدات مسجلة بعد.
          </div>
        ) : (
          <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                  <tr>
                    <th className="py-3 px-4">رقم المساعدة / الحالة</th>
                    <th className="py-3 px-4">المستفيد</th>
                    <th className="py-3 px-4">النوع والصرف</th>
                    <th className="py-3 px-4">القيمة / الكمية</th>
                    <th className="py-3 px-4">التاريخ</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E2]">
                  {aids.map((a) => (
                    <tr key={a.id} className="hover:bg-[#F8F9F7]">
                      <td className="py-3 px-4 text-xs">
                        <div className="font-mono font-bold text-[#18231D]">{a.aid_number}</div>
                        <div className="text-[#526058]">{a.case_file_number} · {a.case_type}</div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-xs">{a.beneficiary_name}</td>
                      <td className="py-3 px-4 text-xs">
                        <div>{AID_TYPE_LABELS[a.aid_type] || a.aid_type}</div>
                        <div className="text-[#526058]">{a.delivery_mode === 'financial' ? 'صرف مالي' : `صرف عيني (${a.item_name || ''})`}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#14532D] tabular-nums text-xs">
                        {a.delivery_mode === 'financial' ? formatEGP(a.amount) : `${a.quantity} ${a.item_unit || ''}`}
                      </td>
                      <td className="py-3 px-4 text-xs tabular-nums">{formatDateAr(a.aid_date)}</td>
                      <td className="py-3 px-4">
                        <StatusText
                          label={AID_STATUS_LABELS[a.status] || a.status}
                          tone={a.status === 'disbursed' || a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'danger' : 'warning'}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {a.status === 'pending' && hasPerm(user.permissions, user.roleKey, 'aids:approve') && (
                            <button
                              type="button"
                              onClick={() => handleAidAction(a.id, 'approved')}
                              className="px-2.5 py-1 text-xs border border-[#14532D]/30 text-[#14532D] rounded hover:bg-[#ECFDF5]"
                            >
                              اعتماد
                            </button>
                          )}
                          {(a.status === 'pending' || a.status === 'approved') && hasPerm(user.permissions, user.roleKey, 'aids:approve') && (
                            <button
                              type="button"
                              onClick={() => {
                                if (a.delivery_mode === 'financial') {
                                  setDisbursingAid(a);
                                  setDisburseAccId(a.financial_account_id ? String(a.financial_account_id) : '');
                                } else {
                                  handleAidAction(a.id, 'disbursed');
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#14532D] rounded hover:bg-[#0F3F22]"
                            >
                              تنفيذ الصرف
                            </button>
                          )}
                          {a.status === 'pending' && hasPerm(user.permissions, user.roleKey, 'aids:reject') && (
                            <button
                              type="button"
                              onClick={() => handleAidAction(a.id, 'rejected')}
                              className="px-2.5 py-1 text-xs text-[#B91C1C] border border-[#FECACA] rounded"
                            >
                              رفض
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showAidModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
            <form onSubmit={handleCreateAid} className="bg-white border border-[#E3E7E2] rounded-xl max-w-lg w-full p-6 space-y-4">
              <h3 className="text-base font-bold text-[#18231D]">تسجيل طلب مساعدة لمستفيد</h3>
              <div>
                <label className="block text-xs font-semibold mb-1">ملف الحالة الإنسانية</label>
                <select required value={aCaseId} onChange={(e) => setACaseId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                  <option value="">اختر الحالة...</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.file_number} — {c.beneficiary_name} ({c.case_type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">تصنيف المساعدة</label>
                  <select value={aType} onChange={(e) => setAType(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                    {Object.entries(AID_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">نمط الصرف</label>
                  <select value={aMode} onChange={(e) => setAMode(e.target.value as 'financial' | 'in_kind')} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                    <option value="financial">مالي (نقدي / تحويل)</option>
                    <option value="in_kind">عيني (من المخزن)</option>
                  </select>
                </div>
              </div>
              {aMode === 'financial' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">القيمة (ج.م)</label>
                    <input type="number" min="1" required value={aAmount} onChange={(e) => setAAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">المشروع الممول (اختياري)</label>
                    <select value={aProjectId} onChange={(e) => setAProjectId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                      <option value="">من التبرعات العامة / الزكاة</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.title_ar}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">الصنف المخزني</label>
                    <select required value={aItemId} onChange={(e) => setAItemId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                      <option value="">اختر الصنف...</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>{it.name_ar} (متوفر: {it.current_qty} {it.unit_ar})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">الكمية</label>
                    <input type="number" min="0.1" step="0.1" required value={aQty} onChange={(e) => setAQty(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">التاريخ</label>
                  <input type="date" value={aDate} onChange={(e) => setADate(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold">
                    <input type="checkbox" checked={aIsZakat} onChange={(e) => setAIsZakat(e.target.checked)} />
                    <span>تُصرف من مصرف الزكاة</span>
                  </label>
                </div>
              </div>
              <textarea rows={2} value={aNotes} onChange={(e) => setANotes(e.target.value)} placeholder="ملاحظات وتفاصيل..." className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAidModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">حفظ الطلب</button>
              </div>
            </form>
          </div>
        )}

        {disbursingAid && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-base font-bold text-[#18231D]">صرف المساعدة {disbursingAid.aid_number}</h3>
              <p className="text-xs text-[#526058]">
                القيمة: <strong className="font-mono text-[#14532D]">{formatEGP(disbursingAid.amount)}</strong> · يرجى تحديد الخزينة أو الحساب الذي سيُصرف منه المبلغ:
              </p>
              <select value={disburseAccId} onChange={(e) => setDisburseAccId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                <option value="">اختر الحساب المالي...</option>
                {accounts.filter((ac) => ac.is_active).map((ac) => (
                  <option key={ac.id} value={ac.id}>
                    {ac.name_ar} {ac.current_balance !== null ? `(${formatEGP(ac.current_balance)})` : ''}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDisbursingAid(null)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
                <button
                  type="button"
                  onClick={() => handleAidAction(disbursingAid.id, 'disbursed', Number(disburseAccId))}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg"
                >
                  تأكيد الصرف وتسجيل السند
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#18231D]">الحالات الإنسانية والمستفيدون</h1>
          <p className="text-xs text-[#526058] mt-1">
            بيانات المستفيدين ومستنداتهم محمية ومقصورة على الموظفين المصرح لهم فقط.
          </p>
        </div>
        {hasPerm(user.permissions, user.roleKey, 'beneficiaries:create') && (
          <button
            type="button"
            onClick={() => setShowCaseModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مستفيد وحالة إنسانية</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-[#E3E7E2] rounded-xl p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#526058] absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="بحث برقم الملف أو اسم المستفيد أو الهاتف..."
            className="w-full pr-9 pl-3 py-2 text-xs border border-[#E3E7E2] rounded-lg"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg bg-white">
          <option value="all">جميع الحالات</option>
          {Object.entries(CASE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : cases.length === 0 ? (
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-10 text-center text-sm text-[#526058]">
          لا توجد حالات إنسانية مسجلة بعد.
        </div>
      ) : (
        <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                <tr>
                  <th className="py-3 px-4">رقم الملف</th>
                  <th className="py-3 px-4">المستفيد والمنطقة</th>
                  <th className="py-3 px-4">نوع الحالة والأولوية</th>
                  <th className="py-3 px-4">الأسرة / المطلوب</th>
                  <th className="py-3 px-4">الحالة</th>
                  <th className="py-3 px-4">إدارة الملف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E7E2]">
                {cases.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F8F9F7]">
                    <td className="py-3 px-4 font-mono text-xs">{c.file_number}</td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-semibold text-[#18231D]">{c.beneficiary_name}</div>
                      <div className="text-[#526058]">{c.beneficiary_phone} · {c.beneficiary_area || c.beneficiary_address || 'شرباص'}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-semibold">{c.case_type}</div>
                      <div className="text-[#526058]">الأولوية: {PRIORITY_LABELS[c.priority]}</div>
                    </td>
                    <td className="py-3 px-4 text-xs tabular-nums">
                      <div>{c.family_size} أفراد</div>
                      <div className="font-mono font-bold text-[#14532D]">{formatEGP(c.requested_amount)}</div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusText
                        label={CASE_STATUS_LABELS[c.status] || c.status}
                        tone={c.status === 'approved' || c.status === 'assisted' ? 'success' : c.status === 'rejected' ? 'danger' : 'warning'}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCase(c);
                          setEditStatus(c.status);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold border border-[#E3E7E2] rounded-lg hover:bg-white"
                      >
                        فتح الملف والمستندات
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Case Modal */}
      {showCaseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleCreateCase} className="bg-white border border-[#E3E7E2] rounded-xl max-w-xl w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#18231D]">تسجيل حالة إنسانية ومستفيد</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCBenMode('new')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${cBenMode === 'new' ? 'bg-[#14532D] text-white border-[#14532D]' : 'border-[#E3E7E2]'}`}
              >
                إضافة مستفيد جديد
              </button>
              <button
                type="button"
                onClick={() => setCBenMode('existing')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${cBenMode === 'existing' ? 'bg-[#14532D] text-white border-[#14532D]' : 'border-[#E3E7E2]'}`}
              >
                اختيار مستفيد مسجل
              </button>
            </div>

            {cBenMode === 'existing' ? (
              <select required value={cBenId} onChange={(e) => setCBenId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                <option value="">اختر المستفيد...</option>
                {beneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>{b.full_name} ({b.phone})</option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#F8F9F7] p-3 rounded-lg border border-[#E3E7E2]">
                <input required placeholder="اسم المستفيد الكامل" value={cNewName} onChange={(e) => setCNewName(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white" />
                <input required placeholder="رقم الهاتف" value={cNewPhone} onChange={(e) => setCNewPhone(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white font-mono" />
                <input placeholder="المنطقة / القرية" value={cNewArea} onChange={(e) => setCNewArea(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white" />
                <input placeholder="العنوان التفصيلي" value={cNewAddress} onChange={(e) => setCNewAddress(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white" />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">نوع الحالة</label>
                <input required value={cType} onChange={(e) => setCType(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">مستوى الأولوية</label>
                <select value={cPriority} onChange={(e) => setCPriority(e.target.value as typeof cPriority)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">عدد أفراد الأسرة</label>
                <input type="number" min="1" value={cFamilySize} onChange={(e) => setCFamilySize(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">قيمة المساعدة المطلوبة (ج.م)</label>
                <input type="number" min="0" value={cReqAmount} onChange={(e) => setCReqAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">وصف الحالة والبحث الاجتماعي</label>
              <textarea required rows={3} value={cDesc} onChange={(e) => setCDesc(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCaseModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">حفظ ملف الحالة</button>
            </div>
          </form>
        </div>
      )}

      {/* Case Details & Protected Documents Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#E3E7E2] rounded-xl max-w-xl w-full p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-[#E3E7E2] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#18231D]">ملف الحالة {selectedCase.file_number}</h3>
                <p className="text-xs text-[#526058] mt-0.5">{selectedCase.beneficiary_name} · {selectedCase.case_type}</p>
              </div>
              <button type="button" onClick={() => setSelectedCase(null)} className="text-xs px-3 py-1 border border-[#E3E7E2] rounded">إغلاق</button>
            </div>

            <p className="text-sm text-[#18231D] bg-[#F8F9F7] p-3 rounded border border-[#E3E7E2]">{selectedCase.description_ar}</p>

            {hasPerm(user.permissions, user.roleKey, 'beneficiaries:edit') && (
              <div className="flex items-center gap-3">
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} className="flex-1 px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg bg-white">
                  {Object.entries(CASE_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button type="button" onClick={handleUpdateCaseStatus} className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">
                  تحديث الحالة
                </button>
              </div>
            )}

            <div className="space-y-3 border-t border-[#E3E7E2] pt-4">
              <h4 className="text-xs font-bold text-[#14532D]">المستندات والصور المحمية للحالة</h4>
              <div className="space-y-2">
                {caseDocs.filter((d) => d.case_id === selectedCase.id).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-2.5 rounded border border-[#E3E7E2] text-xs">
                    <span>{doc.title_ar}</span>
                    <button
                      type="button"
                      onClick={() => setPreviewFile({ id: doc.file_id, name: doc.original_name, mimeType: doc.mime_type })}
                      className="inline-flex items-center gap-1 text-[#14532D] font-semibold"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>عرض محمي</span>
                    </button>
                  </div>
                ))}
              </div>
              {hasPerm(user.permissions, user.roleKey, 'beneficiaries:edit') && (
                <form onSubmit={handleUploadCaseDoc} className="flex flex-wrap items-center gap-2 pt-2">
                  <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="عنوان المستند..." className="flex-1 px-3 py-1.5 text-xs border border-[#E3E7E2] rounded-lg" />
                  <label className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[#E3E7E2] rounded-lg cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{docFile ? docFile.name : 'اختر ملف'}</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setDocFile(e.target.files?.[0] || null)} className="hidden" />
                  </label>
                  <button type="submit" disabled={!docFile} className="px-3 py-1.5 text-xs font-semibold text-white bg-[#14532D] rounded-lg disabled:opacity-50">
                    رفع
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
