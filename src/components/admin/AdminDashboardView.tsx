import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api.ts';
import {
  DONATION_STATUS_META,
  DONATION_TYPE_LABELS,
  EXPENSE_STATUS_LABELS,
  formatDateAr,
  formatDateTimeAr,
  formatEGP,
  hasPerm,
} from '../../lib/labels.ts';
import type { AuthUser } from '../../types.ts';
import { LoadingState, StatusText } from '../ui/CommonUI.tsx';

interface AdminDashData {
  hasDemoData?: boolean;
  realApprovedDonationsTotal?: number;
  stats: {
    approvedDonationsTotal: number;
    pendingDonationsTotal: number;
    pendingDonationsCount: number;
    approvedExpensesTotal: number;
    remainingFunds: number;
    accountBalancesTotal: number | null;
    donorsCount: number;
    beneficiariesCount: number | null;
    employeesCount: number;
    activeCasesCount: number;
    projectsCount: number;
    newAidRequestsCount: number;
  };
  recentDonations: Array<{
    id: number;
    reference_code: string;
    amount: number;
    status: string;
    donation_type: string;
    donation_date: string;
    donor_name: string;
    project_title: string | null;
  }>;
  recentExpenses: Array<{
    id: number;
    voucher_number: string;
    title_ar: string;
    category_ar: string;
    amount: number;
    status: string;
    expense_date: string;
    account_name: string;
  }>;
  recentOperations: Array<{
    id: number;
    actor_name: string;
    action: string;
    entity_type: string;
    entity_id: string;
    created_at: string;
  }>;
  alerts: {
    endingSoonProjects: Array<{ id: number; code: string; title_ar: string; end_date: string }>;
    lowStockItems: Array<{ id: number; item_code: string; name_ar: string; current_qty: number; min_threshold: number; unit_ar: string }>;
  };
}

export function AdminDashboardView({
  user,
  onNavigate,
  onNotify,
}: {
  user: AuthUser;
  onNavigate: (tab: string) => void;
  onNotify?: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [data, setData] = useState<AdminDashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiFetch<AdminDashData>('/api/dashboard')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'تعذر تحميل لوحة التحكم';
        setError(msg);
        onNotify?.('error', msg);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onNotify]);

  if (loading) return <LoadingState />;
  if (error || !data) {
    return (
      <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] rounded-xl p-6 text-sm font-semibold">
        {error || 'تعذر تحميل بيانات لوحة التحكم'}
      </div>
    );
  }

  const s = data.stats;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#18231D]">لوحة الملخص والمتابعة الفورية</h1>
          <p className="text-xs text-[#526058] mt-1">
            جميع الإحصائيات تُحدَّث مباشرة من قاعدة البيانات وفق السجلات المعتمدة.
          </p>
        </div>
        {s.pendingDonationsCount > 0 && hasPerm(user.permissions, user.roleKey, 'donations:view') && (
          <button
            type="button"
            onClick={() => onNavigate('donation_reviews')}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#B45309] hover:bg-[#92400E] rounded-lg whitespace-nowrap"
          >
            مراجعة طلبات التبرع المعلقة ({s.pendingDonationsCount})
          </button>
        )}
      </div>

      {data.hasDemoData && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#92400E]">
          <div className="leading-relaxed">
            <strong>وضع البيانات التجريبية مفعّل (مثال واحد لكل قسم):</strong> السجلات الموسومة بـ [بيانات تجريبية] مخصصة للاختبار فقط ولا تُعد معاملات مالية حقيقية (التبرعات الحقيقية المؤكدة حاليًا:{' '}
            <span className="font-mono font-bold tabular-nums">{formatEGP(data.realApprovedDonationsTotal ?? 0)}</span>).
          </div>
          {user.roleKey === 'super_admin' && (
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="px-3 py-1.5 font-semibold text-[#92400E] bg-white border border-[#F59E0B]/40 rounded-lg hover:bg-[#FEF3C7] whitespace-nowrap shrink-0"
            >
              حذف البيانات التجريبية من الإعدادات
            </button>
          )}
        </div>
      )}

      {/* Financial & Institutional KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">التبرعات المعتمدة</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#14532D] mt-2">
            {formatEGP(s.approvedDonationsTotal)}
          </div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">تبرعات بانتظار المراجعة</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#B45309] mt-2">
            {formatEGP(s.pendingDonationsTotal)}
          </div>
          <div className="text-[11px] text-[#526058] mt-1 tabular-nums">{s.pendingDonationsCount} طلب</div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">المصروفات المعتمدة</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#18231D] mt-2">
            {formatEGP(s.approvedExpensesTotal)}
          </div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">صافي المبالغ المتبقية</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#14532D] mt-2">
            {formatEGP(s.remainingFunds)}
          </div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">أرصدة الخزائن والبنوك</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[#18231D] mt-2">
            {s.accountBalancesTotal !== null ? formatEGP(s.accountBalancesTotal) : 'مقيد بالصلاحية'}
          </div>
        </div>
      </div>

      {/* Operational Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">المتبرعون</div>
          <div className="text-lg font-bold font-mono tabular-nums mt-1">{s.donorsCount}</div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">المستفيدون</div>
          <div className="text-lg font-bold font-mono tabular-nums mt-1">
            {s.beneficiariesCount !== null ? s.beneficiariesCount : 'محمي'}
          </div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">الموظفون والمسؤولون</div>
          <div className="text-lg font-bold font-mono tabular-nums mt-1">{s.employeesCount}</div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">الحالات النشطة</div>
          <div className="text-lg font-bold font-mono tabular-nums mt-1">{s.activeCasesCount}</div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">المشروعات والحملات</div>
          <div className="text-lg font-bold font-mono tabular-nums mt-1">{s.projectsCount}</div>
        </div>
        <div className="bg-white border border-[#E3E7E2] rounded-xl p-4">
          <div className="text-xs text-[#526058]">طلبات مساعدات جديدة</div>
          <div className="text-lg font-bold font-mono tabular-nums text-[#B45309] mt-1">{s.newAidRequestsCount}</div>
        </div>
      </div>

      {/* Alerts */}
      {(data.alerts.lowStockItems.length > 0 || data.alerts.endingSoonProjects.length > 0) && (
        <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-bold text-[#92400E]">تنبيهات التشغيل والمخزون</h3>
          <div className="text-xs text-[#78350F] space-y-1">
            {data.alerts.lowStockItems.map((i) => (
              <div key={i.id}>
                • انخفاض مخزون: {i.name_ar} — الرصيد الحالي {i.current_qty} {i.unit_ar} (الحد الأدنى {i.min_threshold})
              </div>
            ))}
            {data.alerts.endingSoonProjects.map((p) => (
              <div key={p.id}>
                • مشروع يقترب موعد انتهائه: {p.title_ar} ({p.code}) بتاريخ {formatDateAr(p.end_date)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E3E7E2] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#18231D]">أحدث التبرعات</h3>
            {hasPerm(user.permissions, user.roleKey, 'donations:view') && (
              <button type="button" onClick={() => onNavigate('donation_reviews')} className="text-xs text-[#14532D] font-semibold">
                عرض الكل
              </button>
            )}
          </div>
          {data.recentDonations.length === 0 ? (
            <div className="p-6 text-xs text-[#526058] text-center">لا توجد تبرعات مسجلة أو ليس لديك صلاحية عرضها.</div>
          ) : (
            <div className="divide-y divide-[#E3E7E2]">
              {data.recentDonations.map((d) => {
                const meta = DONATION_STATUS_META[d.status] || { label: d.status };
                return (
                  <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-[#18231D]">
                        {d.donor_name} · {DONATION_TYPE_LABELS[d.donation_type] || d.donation_type}
                      </div>
                      <div className="text-[#526058] mt-0.5">
                        {d.reference_code} · {d.project_title || 'تبرع عام'} · {formatDateAr(d.donation_date)}
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="font-mono font-bold text-[#14532D] tabular-nums">{formatEGP(d.amount)}</div>
                      <StatusText
                        label={meta.label}
                        tone={d.status === 'approved' ? 'success' : d.status === 'rejected' ? 'danger' : 'warning'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E3E7E2] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#18231D]">أحدث المصروفات</h3>
            {hasPerm(user.permissions, user.roleKey, 'finance:view') && (
              <button type="button" onClick={() => onNavigate('finance')} className="text-xs text-[#14532D] font-semibold">
                عرض النظام المالي
              </button>
            )}
          </div>
          {data.recentExpenses.length === 0 ? (
            <div className="p-6 text-xs text-[#526058] text-center">لا توجد مصروفات مسجلة أو هذا القسم مقيد بالصلاحية.</div>
          ) : (
            <div className="divide-y divide-[#E3E7E2]">
              {data.recentExpenses.map((e) => (
                <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-[#18231D]">{e.title_ar}</div>
                    <div className="text-[#526058] mt-0.5">
                      {e.voucher_number} · {e.account_name} · {formatDateAr(e.expense_date)}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-mono font-bold text-[#18231D] tabular-nums">{formatEGP(e.amount)}</div>
                    <span className="text-[11px] text-[#526058]">{EXPENSE_STATUS_LABELS[e.status] || e.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audit Operations Stream */}
      {data.recentOperations.length > 0 && (
        <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E3E7E2] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#18231D]">أحدث العمليات المسجلة في سجل التدقيق</h3>
            <button type="button" onClick={() => onNavigate('audit')} className="text-xs text-[#14532D] font-semibold">
              سجل التدقيق الكامل
            </button>
          </div>
          <div className="divide-y divide-[#E3E7E2]">
            {data.recentOperations.map((op) => (
              <div key={op.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-semibold text-[#18231D]">{op.actor_name}</span>
                  <span className="text-[#526058] mx-2">·</span>
                  <span className="font-mono text-[#14532D]">{op.action}</span>
                  <span className="text-[#526058] mx-2">·</span>
                  <span className="text-[#526058]">
                    {op.entity_type} {op.entity_id ? `#${op.entity_id}` : ''}
                  </span>
                </div>
                <span className="text-[#526058] tabular-nums shrink-0">{formatDateTimeAr(op.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
