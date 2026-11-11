import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Printer, ShieldAlert } from 'lucide-react';
import { apiFetch, downloadProtectedFile } from '../../lib/api.ts';
import { exportReportPdf, exportToExcel } from '../../lib/exportUtils.ts';
import { formatDateTimeAr, hasPerm, PERSON_TYPE_LABELS } from '../../lib/labels.ts';
import type { AuthUser, CharitySettings, PersonRecord } from '../../types.ts';
import { LoadingState, StatusText } from '../ui/CommonUI.tsx';

const REPORT_TYPES = [
  { key: 'donations', label: 'تقرير التبرعات' },
  { key: 'donors', label: 'تقرير المتبرعين' },
  { key: 'expenses', label: 'تقرير المصروفات' },
  { key: 'revenues', label: 'تقرير الإيرادات' },
  { key: 'projects', label: 'تقرير المشروعات' },
  { key: 'cases', label: 'تقرير الحالات الإنسانية' },
  { key: 'aids', label: 'تقرير المساعدات' },
  { key: 'warehouse', label: 'تقرير المخازن' },
  { key: 'zakat', label: 'تقرير الزكاة والكفالات' },
  { key: 'staff', label: 'تقرير الموظفين والمتطوعين' },
  { key: 'balances', label: 'تقرير الأرصدة المالية' },
];

export function StaffReportsSettingsView({
  user,
  mode,
  onNotify,
}: {
  user: AuthUser;
  mode: 'staff' | 'reports' | 'audit' | 'settings';
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<PersonRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);

  // Reports
  const [reportType, setReportType] = useState('donations');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reportData, setReportData] = useState<{ titleAr: string; rows: Array<Record<string, unknown>> } | null>(null);
  const [reportError, setReportError] = useState('');

  // Settings + Backups + Clean DB
  const [settings, setSettings] = useState<CharitySettings | null>(null);
  const [backups, setBackups] = useState<Array<{ filename: string; sizeBytes: number; createdAt: string }>>([]);
  const [cleanPreview, setCleanPreview] = useState<{
    protectedFinancialRecords: Record<string, number>;
    eligibleNonFinancialOrTestRecords: {
      demoRecordsTotal?: number;
      markedTestPersons: number;
      unverifiedPendingOrRejectedDonations: number;
      personsWithoutFinancialLinks: number;
    };
  } | null>(null);
  const [cleanPw, setCleanPw] = useState('');
  const [demoBusy, setDemoBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'staff') {
        const res = await apiFetch<{ people: PersonRecord[] }>('/api/people');
        setStaffList(res.people.filter((p) => ['employee', 'volunteer', 'official', 'admin'].includes(p.person_type)));
      } else if (mode === 'audit') {
        const res = await apiFetch<{ logs: Array<Record<string, unknown>> }>('/api/audit-logs');
        setAuditLogs(res.logs);
      } else if (mode === 'settings') {
        const sRes = await apiFetch<{ settings: CharitySettings }>('/api/settings');
        setSettings(sRes.settings);
        if (user.roleKey === 'super_admin') {
          const [bRes, cRes] = await Promise.all([
            apiFetch<{ backups: typeof backups }>('/api/backups'),
            apiFetch<{ report: NonNullable<typeof cleanPreview> }>('/api/admin/clean-db/preview'),
          ]);
          setBackups(bRes.backups);
          setCleanPreview(cRes.report);
        }
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [mode, user.roleKey, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadReport = useCallback(async () => {
    if (mode !== 'reports') return;
    setLoading(true);
    setReportError('');
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.set('from', fromDate);
      if (toDate) qs.set('to', toDate);
      const res = await apiFetch<{ titleAr: string; rows: Array<Record<string, unknown>> }>(`/api/reports/${reportType}?${qs.toString()}`);
      setReportData(res);
    } catch (err) {
      setReportData(null);
      setReportError(err instanceof Error ? err.message : 'لا تملك صلاحية عرض هذا التقرير');
    } finally {
      setLoading(false);
    }
  }, [mode, reportType, fromDate, toDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      const res = await apiFetch<{ message: string }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          nameAr: settings.name_ar,
          taglineAr: settings.tagline_ar,
          registrationNumber: settings.registration_number,
          addressAr: settings.address_ar,
          phone: settings.phone,
          email: settings.email,
          websiteDomain: settings.website_domain,
          donationInstructionsAr: settings.donation_instructions_ar,
          bankTransferInfoAr: settings.bank_transfer_info_ar,
          vodafoneCashInfoAr: settings.vodafone_cash_info_ar,
          instapayInfoAr: settings.instapay_info_ar,
          receiptFooterAr: settings.receipt_footer_ar,
        }),
      });
      onNotify('success', res.message);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الإعدادات');
    }
  };

  const executeCleanScope = async (scope: 'demo_only' | 'unverified_and_test') => {
    if (!cleanPw.trim()) {
      onNotify('error', 'يرجى إدخال كلمة مرور المدير الرئيسي أولًا');
      return;
    }
    setDemoBusy(true);
    try {
      const res = await apiFetch<{ message: string; backupFilename: string }>('/api/admin/clean-db/execute', {
        method: 'POST',
        body: JSON.stringify({ password: cleanPw, scope }),
      });
      onNotify('success', `${res.message} (${res.backupFilename})`);
      setCleanPw('');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تنفيذ التنظيف');
    } finally {
      setDemoBusy(false);
    }
  };

  const handleRestoreDemoData = async () => {
    setDemoBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/admin/demo/restore', { method: 'POST' });
      onNotify('success', res.message);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر استعادة البيانات التجريبية');
    } finally {
      setDemoBusy(false);
    }
  };

  if (mode === 'staff') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#18231D]">الموظفون والمتطوعون</h1>
          <p className="text-xs text-[#526058] mt-1">
            عرض فريق العمل والأقسام والأدوار الوظيفية (تُدار الحسابات من قسم إدارة الأشخاص).
          </p>
        </div>
        {loading ? (
          <LoadingState />
        ) : (
          <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                  <tr>
                    <th className="py-3 px-4">الاسم</th>
                    <th className="py-3 px-4">التصنيف والوظيفة</th>
                    <th className="py-3 px-4">القسم</th>
                    <th className="py-3 px-4">الدور</th>
                    <th className="py-3 px-4">الهاتف</th>
                    <th className="py-3 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E2]">
                  {staffList.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 px-4 font-semibold">{s.full_name}</td>
                      <td className="py-3 px-4 text-xs">
                        <div>{PERSON_TYPE_LABELS[s.person_type]}</div>
                        <div className="text-[#526058]">{s.job_title || '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">{s.department || '—'}</td>
                      <td className="py-3 px-4 text-xs text-[#14532D] font-semibold">{s.role_name_ar || 'بدون حساب'}</td>
                      <td className="py-3 px-4 font-mono text-xs">{s.phone}</td>
                      <td className="py-3 px-4">
                        <StatusText label={s.status === 'active' ? 'نشط' : 'موقوف'} tone={s.status === 'active' ? 'success' : 'danger'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'reports') {
    const columns = reportData && reportData.rows.length > 0 ? Object.keys(reportData.rows[0]) : [];
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 no-print">
          <div>
            <h1 className="text-2xl font-display font-bold text-[#18231D]">مركز التقارير والطباعة والتصدير</h1>
            <p className="text-xs text-[#526058] mt-1">
              تقارير حقيقية من قاعدة البيانات مع تصفية بالتاريخ وتصدير Excel وPDF.
            </p>
          </div>
          {reportData && (
            <div className="flex flex-wrap gap-2">
              {hasPerm(user.permissions, user.roleKey, 'reports:export') && (
                <>
                  <button
                    type="button"
                    onClick={() => exportToExcel(`sherbas-${reportType}`, reportData.titleAr, reportData.rows)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#14532D] bg-white border border-[#14532D]/30 rounded-lg hover:bg-[#ECFDF5]"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportReportPdf(reportData.titleAr, reportData.rows, settings)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg hover:bg-[#0F3F22]"
                  >
                    <Download className="w-4 h-4" />
                    <span>تصدير PDF</span>
                  </button>
                </>
              )}
              {hasPerm(user.permissions, user.roleKey, 'reports:print') && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-[#E3E7E2] bg-white rounded-lg"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 no-print">
          <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="sm:col-span-2 px-3 py-2 text-xs font-semibold border border-[#E3E7E2] rounded-lg bg-white">
            {REPORT_TYPES.map((rt) => (
              <option key={rt.key} value={rt.key}>{rt.label}</option>
            ))}
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg font-mono" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg font-mono" />
        </div>

        {loading ? (
          <LoadingState />
        ) : reportError ? (
          <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] rounded-xl p-6 text-sm font-semibold">
            {reportError}
          </div>
        ) : !reportData || reportData.rows.length === 0 ? (
          <div className="bg-white border border-[#E3E7E2] rounded-xl p-10 text-center text-sm text-[#526058]">
            لا توجد بيانات مسجلة لهذا التقرير ضمن الفلاتر المحددة.
          </div>
        ) : (
          <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden print-container">
            <div className="p-4 border-b border-[#E3E7E2] flex justify-between items-center">
              <h3 className="font-bold text-base text-[#14532D]">{reportData.titleAr}</h3>
              <span className="text-xs text-[#526058] tabular-nums">عدد السجلات: {reportData.rows.length}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-[#526058]">
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="py-3 px-4 font-semibold whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E2]">
                  {reportData.rows.map((row, idx) => (
                    <tr key={idx}>
                      {columns.map((col) => (
                        <td key={col} className="py-2.5 px-4 tabular-nums">
                          {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'audit') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#18231D]">سجل التدقيق والرقابة الأمنية</h1>
          <p className="text-xs text-[#526058] mt-1">سجل غير قابل للتعديل لكافة العمليات الحساسة والدخول والاعتمادات.</p>
        </div>
        {loading ? (
          <LoadingState />
        ) : (
          <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-[#526058]">
                  <tr>
                    <th className="py-3 px-4">التاريخ والوقت</th>
                    <th className="py-3 px-4">المنفذ</th>
                    <th className="py-3 px-4">العملية</th>
                    <th className="py-3 px-4">الكيان</th>
                    <th className="py-3 px-4">التفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E2]">
                  {auditLogs.map((l) => (
                    <tr key={String(l.id)}>
                      <td className="py-2.5 px-4 tabular-nums whitespace-nowrap">{formatDateTimeAr(String(l.created_at))}</td>
                      <td className="py-2.5 px-4 font-semibold">{String(l.actor_name)}</td>
                      <td className="py-2.5 px-4 font-mono text-[#14532D]">{String(l.action)}</td>
                      <td className="py-2.5 px-4">{String(l.entity_type)} {l.entity_id ? `#${l.entity_id}` : ''}</td>
                      <td className="py-2.5 px-4 font-mono text-[#526058] max-w-xs truncate">{String(l.details_json)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // SETTINGS + BACKUPS + CLEAN DB
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-[#18231D]">إعدادات الجمعية والنسخ الاحتياطي</h1>
        <p className="text-xs text-[#526058] mt-1">الهوية الرسمية، بيانات التحويل، التكاملات المستقبلية، والنسخ الاحتياطي.</p>
      </div>

      {loading || !settings ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          <form onSubmit={handleSaveSettings} className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#14532D]">بيانات الجمعية وقنوات التبرع الرسمية</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">اسم الجمعية</label>
                <input value={settings.name_ar} onChange={(e) => setSettings({ ...settings, name_ar: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">النطاق المقترح / الموقع</label>
                <input dir="ltr" value={settings.website_domain} onChange={(e) => setSettings({ ...settings, website_domain: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono text-left" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">الهاتف الرسمي</label>
                <input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">البريد الإلكتروني</label>
                <input dir="ltr" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono text-left" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">العنوان</label>
              <input value={settings.address_ar} onChange={(e) => setSettings({ ...settings, address_ar: e.target.value })} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1">بيانات التحويل البنكي</label>
                <textarea rows={2} value={settings.bank_transfer_info_ar} onChange={(e) => setSettings({ ...settings, bank_transfer_info_ar: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">بيانات المحافظ الإلكترونية</label>
                <textarea rows={2} value={settings.vodafone_cash_info_ar} onChange={(e) => setSettings({ ...settings, vodafone_cash_info_ar: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">بيانات InstaPay / المقر</label>
                <textarea rows={2} value={settings.instapay_info_ar} onChange={(e) => setSettings({ ...settings, instapay_info_ar: e.target.value })} className="w-full px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg" />
              </div>
            </div>
            {hasPerm(user.permissions, user.roleKey, 'settings:edit') && (
              <button type="submit" className="px-5 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">
                حفظ الإعدادات
              </button>
            )}
          </form>

          {/* External Providers Disclosure (Honest Status) */}
          <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-2 text-xs">
            <h3 className="text-sm font-bold text-[#18231D]">حالة قنوات الإشعارات الخارجية والنطاق</h3>
            <p className="text-[#526058] leading-relaxed">
              • الإشعارات الداخلية داخل المنصة مفعّلة وتعمل لحظيًا عبر قاعدة البيانات.
            </p>
            <p className="text-[#526058] leading-relaxed">
              • إرسال البريد الإلكتروني (SMTP) ورسائل SMS وWhatsApp غير مفعّل حاليًا ويتطلب إضافة مفاتيح مزود الخدمة في ملف البيئة (.env) عند الإطلاق.
            </p>
            <p className="text-[#526058] leading-relaxed">
              • ربط الدومين المقترح (<span className="font-mono">sherbascharity.org</span>) وشهادة SSL يتطلب التحقق من توفر النطاق لدى المسجل وربط سجلات DNS بالاستضافة السحابية.
            </p>
          </div>

          {user.roleKey === 'super_admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-[#18231D]">النسخ الاحتياطي لقاعدة البيانات</h3>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await apiFetch<{ message: string }>('/api/backups/create', { method: 'POST' });
                      onNotify('success', res.message);
                      await loadData();
                    }}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg"
                  >
                    إنشاء نسخة احتياطية الآن
                  </button>
                </div>
                <div className="divide-y divide-[#E3E7E2] text-xs max-h-56 overflow-y-auto">
                  {backups.length === 0 ? (
                    <div className="py-6 text-center text-[#526058]">لا توجد نسخ احتياطية محفوظة بعد.</div>
                  ) : (
                    backups.map((b) => (
                      <div key={b.filename} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-mono text-[#18231D]">{b.filename}</div>
                          <div className="text-[#526058] tabular-nums">{formatDateTimeAr(b.createdAt)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            downloadProtectedFile(`/api/backups/${encodeURIComponent(b.filename)}/download`, b.filename).catch((err) =>
                              onNotify('error', err instanceof Error ? err.message : 'تعذر تنزيل النسخة الاحتياطية')
                            )
                          }
                          className="px-2.5 py-1 border border-[#E3E7E2] rounded hover:bg-[#F8F9F7]"
                        >
                          تنزيل
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {cleanPreview && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    executeCleanScope('unverified_and_test');
                  }}
                  className="bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center gap-2 text-[#B45309]">
                    <ShieldAlert className="w-5 h-5" />
                    <h3 className="text-base font-bold">إدارة البيانات التجريبية والتنظيف الآمن</h3>
                  </div>
                  <div className="text-xs space-y-1.5 bg-[#F8F9F7] p-3.5 rounded-lg border border-[#E3E7E2] tabular-nums">
                    <div className="font-bold text-[#14532D]">سجلات حقيقية محمية لن تُحذف مطلقًا:</div>
                    <div>• التبرعات الحقيقية المعتمدة: {cleanPreview.protectedFinancialRecords.approvedDonations}</div>
                    <div>• الإيصالات الرسمية الحقيقية الصادرة: {cleanPreview.protectedFinancialRecords.issuedReceipts}</div>
                    <div>• المصروفات المدفوعة والقيود الحقيقية: {cleanPreview.protectedFinancialRecords.financialTransactions}</div>
                    <div>• حسابات المدير الرئيسي: {cleanPreview.protectedFinancialRecords.superAdminAccounts}</div>
                    <div className="font-bold text-[#B45309] pt-2">سجلات تجريبية وقابلة للتنظيف:</div>
                    <div>• السجلات التجريبية ([بيانات تجريبية]): {cleanPreview.eligibleNonFinancialOrTestRecords.demoRecordsTotal ?? 0}</div>
                    <div>• التبرعات المعلقة أو المرفوضة/الملغاة: {cleanPreview.eligibleNonFinancialOrTestRecords.unverifiedPendingOrRejectedDonations}</div>
                    <div>• سجلات الأشخاص الاختبارية: {cleanPreview.eligibleNonFinancialOrTestRecords.markedTestPersons}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">
                      تأكيد كلمة مرور المدير الرئيسي للتنفيذ (يُحفظ نسخ احتياطي تلقائيًا قبل أي تنظيف)
                    </label>
                    <input
                      type="password"
                      value={cleanPw}
                      onChange={(e) => setCleanPw(e.target.value)}
                      placeholder="أدخل كلمة مرور المدير الرئيسي"
                      className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={demoBusy || (cleanPreview.eligibleNonFinancialOrTestRecords.demoRecordsTotal ?? 0) === 0}
                      onClick={() => executeCleanScope('demo_only')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#B45309] hover:bg-[#92400E] rounded-lg disabled:opacity-50"
                    >
                      حذف البيانات التجريبية فقط (بدء العمل الفعلي)
                    </button>
                    <button
                      type="submit"
                      disabled={demoBusy}
                      className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg disabled:opacity-50"
                    >
                      تنظيف التجريبي والملغي الآمن
                    </button>
                    {(cleanPreview.eligibleNonFinancialOrTestRecords.demoRecordsTotal ?? 0) === 0 && (
                      <button
                        type="button"
                        disabled={demoBusy}
                        onClick={handleRestoreDemoData}
                        className="px-4 py-2 text-xs font-semibold text-[#14532D] bg-[#ECFDF5] border border-[#14532D]/30 hover:bg-[#D1FAE5] rounded-lg disabled:opacity-50"
                      >
                        استعادة مثال البيانات التجريبية (1 لكل قسم)
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
