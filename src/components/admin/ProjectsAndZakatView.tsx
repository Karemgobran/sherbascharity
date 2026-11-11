import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import {
  EDU_IMAGE_URL,
  formatDateAr,
  formatEGP,
  FUND_TYPE_LABELS,
  hasPerm,
  MED_IMAGE_URL,
  PROJECT_STATUS_LABELS,
  WATER_IMAGE_URL,
  ZAKAT_TYPE_LABELS,
} from '../../lib/labels.ts';
import type { AuthUser, PersonRecord, PublicProject } from '../../types.ts';
import { ConfirmModal, LoadingState, SafeImage } from '../ui/CommonUI.tsx';

export function ProjectsAndZakatView({
  user,
  mode,
  onNotify,
}: {
  user: AuthUser;
  mode: 'projects' | 'zakat';
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [updates, setUpdates] = useState<Array<Record<string, unknown>>>([]);
  const [zakatData, setZakatData] = useState<{
    programs: Array<Record<string, unknown>>;
    totals: Record<string, number>;
    zakatAccounts: Array<{ id: number; name_ar: string; current_balance: number }>;
  } | null>(null);
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Project Modal
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProj, setEditingProj] = useState<PublicProject | null>(null);
  const [pRecordKind, setPRecordKind] = useState<'project' | 'campaign'>('project');
  const [pTitle, setPTitle] = useState('');
  const [pCat, setPCat] = useState('مشروعات تنموية');
  const [pDesc, setPDesc] = useState('');
  const [pGoal, setPGoal] = useState('');
  const [pBudget, setPBudget] = useState('');
  const [pFundType, setPFundType] = useState<'general' | 'zakat' | 'restricted'>('general');
  const [pImageUrl, setPImageUrl] = useState(WATER_IMAGE_URL);
  const [pCoverFile, setPCoverFile] = useState<File | null>(null);
  const [pStart, setPStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [pEnd, setPEnd] = useState('');
  const [pStatus, setPStatus] = useState('open');
  const [pPublic, setPPublic] = useState(true);

  // Update Modal
  const [updateProjId, setUpdateProjId] = useState<number | null>(null);
  const [uTitle, setUTitle] = useState('');
  const [uDetails, setUDetails] = useState('');
  const [uPercent, setUPercent] = useState('50');

  // Zakat Modal
  const [showZakatModal, setShowZakatModal] = useState(false);
  const [zType, setZType] = useState('orphan_kafala');
  const [zTitle, setZTitle] = useState('');
  const [zDonorId, setZDonorId] = useState('');
  const [zBenId, setZBenId] = useState('');
  const [zAmount, setZAmount] = useState('');
  const [zPurpose, setZPurpose] = useState('');
  const [zStart, setZStart] = useState(() => new Date().toISOString().slice(0, 10));

  const [archiveId, setArchiveId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'projects') {
        const res = await apiFetch<{ projects: PublicProject[]; updates: Array<Record<string, unknown>> }>('/api/projects');
        setProjects(res.projects);
        setUpdates(res.updates || []);
      } else {
        const [zk, ppl] = await Promise.all([
          apiFetch<{
            programs: Array<Record<string, unknown>>;
            totals: Record<string, number>;
            zakatAccounts: Array<{ id: number; name_ar: string; current_balance: number }>;
          }>('/api/zakat'),
          apiFetch<{ people: PersonRecord[] }>('/api/people').catch(() => ({ people: [] })),
        ]);
        setZakatData(zk);
        setPeople(ppl.people);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [mode, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProj) {
        await apiFetch(`/api/projects/${editingProj.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            recordKind: pRecordKind,
            titleAr: pTitle,
            categoryAr: pCat,
            descriptionAr: pDesc,
            goalAr: pGoal,
            imageUrl: pImageUrl,
            targetBudget: Number(pBudget),
            fundType: pFundType,
            startDate: pStart,
            endDate: pEnd,
            status: pStatus,
            isPublic: pPublic,
          }),
        });
        onNotify('success', 'تم تحديث بيانات المشروع');
      } else {
        const form = new FormData();
        form.append('recordKind', pRecordKind);
        form.append('titleAr', pTitle);
        form.append('categoryAr', pCat);
        form.append('descriptionAr', pDesc);
        form.append('goalAr', pGoal);
        form.append('imageUrl', pImageUrl);
        if (pCoverFile) form.append('cover', pCoverFile);
        form.append('targetBudget', pBudget);
        form.append('fundType', pFundType);
        form.append('startDate', pStart);
        form.append('endDate', pEnd);
        form.append('status', pStatus);
        form.append('isPublic', String(pPublic));
        await apiFetch('/api/projects', { method: 'POST', body: form });
        onNotify('success', 'تم إنشاء المشروع بنجاح');
      }
      setShowProjectModal(false);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ المشروع');
    }
  };

  const handleAddUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateProjId) return;
    try {
      const form = new FormData();
      form.append('titleAr', uTitle);
      form.append('detailsAr', uDetails);
      form.append('progressPercent', uPercent);
      await apiFetch(`/api/projects/${updateProjId}/updates`, { method: 'POST', body: form });
      onNotify('success', 'تم نشر تحديث الإنجاز للمشروع');
      setUpdateProjId(null);
      setUTitle('');
      setUDetails('');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر نشر التحديث');
    }
  };

  const handleSaveZakat = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/zakat', {
        method: 'POST',
        body: JSON.stringify({
          programType: zType,
          titleAr: zTitle,
          donorPersonId: zDonorId ? Number(zDonorId) : null,
          beneficiaryPersonId: zBenId ? Number(zBenId) : null,
          monthlyAmount: Number(zAmount || 0),
          purposeAr: zPurpose,
          startDate: zStart,
        }),
      });
      onNotify('success', 'تمت إضافة برنامج الزكاة / الكفالة');
      setShowZakatModal(false);
      setZTitle('');
      setZAmount('');
      setZPurpose('');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر الحفظ');
    }
  };

  if (mode === 'zakat') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-[#18231D]">إدارة الزكاة والكفالات</h1>
            <p className="text-xs text-[#526058] mt-1">
              ضبط شرعي ومالي يفصل أموال زكاة المال وزكاة الفطر عن الأموال العامة للجمعية.
            </p>
          </div>
          {hasPerm(user.permissions, user.roleKey, 'zakat:create') && (
            <button
              type="button"
              onClick={() => setShowZakatModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة كفالة / برنامج زكاة</span>
            </button>
          )}
        </div>

        {loading || !zakatData ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
                <div className="text-xs text-[#526058]">زكاة المال المعتمدة</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#14532D] mt-1">
                  {formatEGP(zakatData.totals.zakat_mal_approved)}
                </div>
              </div>
              <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
                <div className="text-xs text-[#526058]">زكاة الفطر المعتمدة</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#14532D] mt-1">
                  {formatEGP(zakatData.totals.zakat_fitr_approved)}
                </div>
              </div>
              <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
                <div className="text-xs text-[#526058]">الصدقات المعتمدة</div>
                <div className="text-lg font-bold font-mono tabular-nums mt-1">
                  {formatEGP(zakatData.totals.sadaqah_approved)}
                </div>
              </div>
              <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
                <div className="text-xs text-[#526058]">الكفارات والتبرع الدوري</div>
                <div className="text-lg font-bold font-mono tabular-nums mt-1">
                  {formatEGP((zakatData.totals.kaffarah_approved || 0) + (zakatData.totals.recurring_approved || 0))}
                </div>
              </div>
              <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
                <div className="text-xs text-[#526058]">مصروفات الزكاة المعتمدة</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#B45309] mt-1">
                  {formatEGP(zakatData.totals.zakat_expenses_total)}
                </div>
              </div>
            </div>

            {zakatData.zakatAccounts.length === 0 && (
              <div className="p-4 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E]">
                تنبيه شرعي ومالي: لا يوجد حساب مالي مخصص للزكاة حاليًا. أنشئ حسابًا بنوع تخصيص «مخصص للزكاة» من قسم النظام المالي لتمكين اعتماد تبرعات الزكاة.
              </div>
            )}

            <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#E3E7E2] font-bold text-sm">برامج الكفالات والزكاة المسجلة</div>
              {zakatData.programs.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#526058]">لا توجد برامج كفالات مسجلة بعد.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                      <tr>
                        <th className="py-3 px-4">الكود</th>
                        <th className="py-3 px-4">البرنامج / النوع</th>
                        <th className="py-3 px-4">المستفيد</th>
                        <th className="py-3 px-4">الكفيل / المتبرع</th>
                        <th className="py-3 px-4">القيمة الدورية</th>
                        <th className="py-3 px-4">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E7E2]">
                      {zakatData.programs.map((z) => (
                        <tr key={String(z.id)}>
                          <td className="py-3 px-4 font-mono text-xs">{String(z.program_code)}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold">{String(z.title_ar)}</div>
                            <div className="text-xs text-[#526058]">{ZAKAT_TYPE_LABELS[String(z.program_type)] || String(z.program_type)}</div>
                          </td>
                          <td className="py-3 px-4 text-xs">{String(z.beneficiary_name || '—')}</td>
                          <td className="py-3 px-4 text-xs">{String(z.donor_name || '—')}</td>
                          <td className="py-3 px-4 font-mono font-bold text-[#14532D] tabular-nums">{formatEGP(Number(z.monthly_amount))}</td>
                          <td className="py-3 px-4 text-xs">{String(z.status === 'active' ? 'نشط' : z.status === 'paused' ? 'متوقف' : 'مكتمل')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {showZakatModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <form onSubmit={handleSaveZakat} className="bg-white border border-[#E3E7E2] rounded-xl max-w-lg w-full p-6 space-y-4">
              <h3 className="text-base font-bold text-[#18231D]">إضافة كفالة أو مصرف زكاة</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">النوع</label>
                  <select value={zType} onChange={(e) => setZType(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                    {Object.entries(ZAKAT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">القيمة الشهرية / المستهدفة (ج.م)</label>
                  <input type="number" min="0" value={zAmount} onChange={(e) => setZAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">عنوان البرنامج / الكفالة</label>
                <input required value={zTitle} onChange={(e) => setZTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">الكفيل / المتبرع (اختياري)</label>
                  <select value={zDonorId} onChange={(e) => setZDonorId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                    <option value="">غير محدد</option>
                    {people.filter((p) => p.person_type === 'donor').map((d) => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">المستفيد (اختياري)</label>
                  <select value={zBenId} onChange={(e) => setZBenId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                    <option value="">غير محدد</option>
                    {people.filter((p) => p.person_type === 'beneficiary').map((b) => (
                      <option key={b.id} value={b.id}>{b.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">تاريخ البدء</label>
                  <input type="date" value={zStart} onChange={(e) => setZStart(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الغرض / المصرف الشرعي</label>
                  <input value={zPurpose} onChange={(e) => setZPurpose(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowZakatModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">حفظ</button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#18231D]">إدارة المشروعات والحملات</h1>
          <p className="text-xs text-[#526058] mt-1">
            تُحسب الإيرادات والمصروفات المتبقية لكل مشروع تلقائيًا من العمليات المعتمدة فقط.
          </p>
        </div>
        {hasPerm(user.permissions, user.roleKey, 'projects:create') && (
          <button
            type="button"
            onClick={() => {
              setEditingProj(null);
              setPRecordKind('project');
              setPTitle('');
              setPCat('مشروعات تنموية');
              setPDesc('');
              setPGoal('');
              setPBudget('');
              setPFundType('general');
              setPImageUrl(WATER_IMAGE_URL);
              setPCoverFile(null);
              setPStatus('open');
              setPPublic(true);
              setShowProjectModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مشروع / حملة جديدة</span>
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : projects.length === 0 ? (
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-10 text-center text-sm text-[#526058]">
          لا توجد مشروعات مضافة بعد.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.map((p) => (
            <div key={p.id} className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden flex flex-col">
              <div className="aspect-[16/9] bg-[#EEF2EE] overflow-hidden">
                <SafeImage src={p.image_url || WATER_IMAGE_URL} alt={p.title_ar} className="w-full h-full object-cover" />
              </div>
              <div className="p-5 flex-1 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#526058]">
                      <span className="font-mono">{p.code}</span> · {p.record_kind === 'campaign' ? 'حملة تبرعات' : 'مشروع خيري'} · {p.category_ar} · {PROJECT_STATUS_LABELS[p.status] || p.status} · {FUND_TYPE_LABELS[p.fund_type]}
                    </div>
                    <h3 className="text-lg font-bold text-[#18231D] mt-1">{p.title_ar}</h3>
                  </div>
                </div>

                <p className="text-xs text-[#526058] leading-relaxed">{p.description_ar || p.goal_ar}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums bg-[#F8F9F7] p-3 rounded-lg border border-[#E3E7E2]">
                  <div>
                    <div className="text-[#526058]">المستهدف</div>
                    <div className="font-bold mt-0.5">{formatEGP(p.target_budget)}</div>
                  </div>
                  <div>
                    <div className="text-[#526058]">المعتمد</div>
                    <div className="font-bold text-[#14532D] mt-0.5">{formatEGP(p.approved_donations)}</div>
                  </div>
                  <div>
                    <div className="text-[#526058]">المصروف</div>
                    <div className="font-bold mt-0.5">{formatEGP(p.approved_expenses)}</div>
                  </div>
                  <div>
                    <div className="text-[#526058]">المتبقي</div>
                    <div className="font-bold text-[#14532D] mt-0.5">{formatEGP(p.remaining_balance)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E3E7E2]">
                  {hasPerm(user.permissions, user.roleKey, 'projects:edit') && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProj(p);
                          setPRecordKind(p.record_kind === 'campaign' ? 'campaign' : 'project');
                          setPTitle(p.title_ar);
                          setPCat(p.category_ar);
                          setPDesc(p.description_ar);
                          setPGoal(p.goal_ar);
                          setPBudget(String(p.target_budget));
                          setPFundType(p.fund_type);
                          setPImageUrl(p.image_url);
                          setPStart(p.start_date);
                          setPEnd(p.end_date);
                          setPStatus(p.status);
                          setPPublic(Boolean(p.is_public));
                          setShowProjectModal(true);
                        }}
                        className="px-3 py-1.5 text-xs border border-[#E3E7E2] rounded-lg hover:bg-[#F8F9F7]"
                      >
                        تعديل المشروع
                      </button>
                      <button
                        type="button"
                        onClick={() => setUpdateProjId(p.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-[#14532D] border border-[#14532D]/30 rounded-lg hover:bg-[#ECFDF5]"
                      >
                        نشر تقرير إنجاز
                      </button>
                    </>
                  )}
                  {hasPerm(user.permissions, user.roleKey, 'projects:soft_delete') && (
                    <button
                      type="button"
                      onClick={() => setArchiveId(p.id)}
                      className="p-1.5 text-xs text-[#B91C1C] border border-[#E3E7E2] rounded-lg hover:bg-[#FEF2F2]"
                      title="أرشفة المشروع"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {updates.length > 0 && (
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#18231D]">سجل تقارير إنجاز المشروعات</h3>
          <div className="divide-y divide-[#E3E7E2] text-xs">
            {updates.map((u) => (
              <div key={String(u.id)} className="py-2.5 flex justify-between gap-3">
                <div>
                  <span className="font-bold text-[#18231D]">{String(u.title_ar)}</span>
                  <span className="text-[#526058] mx-2">—</span>
                  <span className="text-[#526058]">{String(u.details_ar)}</span>
                </div>
                <span className="font-mono text-[#14532D] shrink-0">
                  {String(u.progress_percent)}% · {formatDateAr(String(u.created_at))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Project Modal */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSaveProject} className="bg-white border border-[#E3E7E2] rounded-xl max-w-xl w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#18231D]">{editingProj ? 'تعديل المشروع / الحملة' : 'إضافة مشروع / حملة جديدة'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">النوع</label>
                <select value={pRecordKind} onChange={(e) => setPRecordKind(e.target.value as 'project' | 'campaign')} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                  <option value="project">مشروع خيري</option>
                  <option value="campaign">حملة تبرعات</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">الاسم</label>
                <input required value={pTitle} onChange={(e) => setPTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">التصنيف</label>
                <input value={pCat} onChange={(e) => setPCat(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">الميزانية المطلوبة (ج.م)</label>
                <input type="number" min="0" required value={pBudget} onChange={(e) => setPBudget(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">نوع التمويل</label>
                <select value={pFundType} onChange={(e) => setPFundType(e.target.value as typeof pFundType)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                  <option value="general">أموال عامة</option>
                  <option value="zakat">مخصص للزكاة</option>
                  <option value="restricted">مقيد للمشروع</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">حالة المشروع</label>
                <select value={pStatus} onChange={(e) => setPStatus(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                  {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">تاريخ البداية</label>
                <input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">تاريخ النهاية المتوقع</label>
                <input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">صورة المشروع الجاهزة أو رفع صورة</label>
              <div className="flex flex-wrap gap-2 mb-2">
                <button type="button" onClick={() => setPImageUrl(WATER_IMAGE_URL)} className="px-2 py-1 text-xs border border-[#E3E7E2] rounded">مشروع مياه</button>
                <button type="button" onClick={() => setPImageUrl(EDU_IMAGE_URL)} className="px-2 py-1 text-xs border border-[#E3E7E2] rounded">تعليم وأيتام</button>
                <button type="button" onClick={() => setPImageUrl(MED_IMAGE_URL)} className="px-2 py-1 text-xs border border-[#E3E7E2] rounded">صحة وإغاثة</button>
              </div>
              {!editingProj && (
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPCoverFile(e.target.files?.[0] || null)} className="text-xs" />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">الهدف</label>
              <input value={pGoal} onChange={(e) => setPGoal(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">الوصف التفصيلي</label>
              <textarea rows={2} value={pDesc} onChange={(e) => setPDesc(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input type="checkbox" checked={pPublic} onChange={(e) => setPPublic(e.target.checked)} />
              <span>نشر المشروع في الموقع العام وبوابة المتبرعين</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowProjectModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">حفظ المشروع</button>
            </div>
          </form>
        </div>
      )}

      {/* Progress Update Modal */}
      {updateProjId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleAddUpdate} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#18231D]">إضافة تقرير إنجاز للمشروع</h3>
            <input required value={uTitle} onChange={(e) => setUTitle(e.target.value)} placeholder="عنوان التحديث" className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            <textarea required rows={3} value={uDetails} onChange={(e) => setUDetails(e.target.value)} placeholder="تفاصيل ما تم تنفيذه" className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            <div>
              <label className="block text-xs font-semibold mb-1">نسبة الإنجاز (%)</label>
              <input type="number" min="0" max="100" value={uPercent} onChange={(e) => setUPercent(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setUpdateProjId(null)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">نشر التحديث</button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(archiveId)}
        title="أرشفة المشروع"
        message="سيتم إخفاء المشروع من الواجهة العامة مع الاحتفاظ بكافة التبرعات والمصروفات المرتبطة به."
        danger
        onCancel={() => setArchiveId(null)}
        onConfirm={async () => {
          if (!archiveId) return;
          await apiFetch(`/api/projects/${archiveId}`, { method: 'DELETE' });
          onNotify('info', 'تمت أرشفة المشروع');
          setArchiveId(null);
          await loadData();
        }}
      />
    </div>
  );
}
