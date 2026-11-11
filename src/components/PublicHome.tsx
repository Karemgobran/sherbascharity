import React, { useEffect, useState } from 'react';
import { ArrowLeft, Building2, HeartHandshake, Lock, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import {
  EDU_IMAGE_URL,
  formatDateAr,
  formatEGP,
  HERO_IMAGE_URL,
  MED_IMAGE_URL,
  PROJECT_STATUS_LABELS,
  WATER_IMAGE_URL,
} from '../lib/labels.ts';
import type { AuthUser, CharitySettings, PublicProject } from '../types.ts';
import { BrandLogo, EmptyState, SafeImage } from './ui/CommonUI.tsx';

interface PublicOverviewResponse {
  settings: CharitySettings;
  hasDemoData?: boolean;
  stats: {
    approvedDonationsTotal: number;
    approvedDonationsCount: number;
    approvedExpensesTotal: number;
    remainingBalance: number;
    publicProjectsCount: number;
    activeDonorsCount: number;
    completedAidsCount: number;
  };
  projects: PublicProject[];
  projectUpdates: Array<{
    id: number;
    project_id: number;
    title_ar: string;
    details_ar: string;
    progress_percent: number;
    created_at: string;
  }>;
}

export function PublicHome({
  currentUser,
  onOpenAuth,
  onOpenRegister,
  onEnterPortal,
}: {
  currentUser: AuthUser | null;
  onOpenAuth: () => void;
  onOpenRegister: () => void;
  onEnterPortal: () => void;
}) {
  const [data, setData] = useState<PublicOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<PublicOverviewResponse>('/api/public/overview')
      .then(setData)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const settings = data?.settings;
  const stats = data?.stats;
  const projects = data?.projects || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9F7] text-[#18231D]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E3E7E2]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Clean single-line brand wordmark */}
          <a href="#top" className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <BrandLogo size={36} />
            <span className="text-base sm:text-lg font-display font-bold text-[#14532D] whitespace-nowrap shrink-0">
              {settings?.name_ar || 'الجمعية الخيرية بشرباص'}
            </span>
          </a>

          {/* Zone 2: 4 concise single-line text nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#526058]">
            <a href="#about" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              عن الجمعية
            </a>
            <a href="#programs" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              الأنشطة
            </a>
            <a href="#projects" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              المشروعات
            </a>
            <a href="#donate-guide" className="hover:text-[#14532D] transition-colors whitespace-nowrap shrink-0">
              آلية التبرع
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            {currentUser ? (
              <button
                type="button"
                onClick={onEnterPortal}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {currentUser.roleKey === 'donor' ? 'بوابة المتبرع' : 'لوحة الإدارة'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                بوابة الدخول
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split */}
        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-10 pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between bg-white border border-[#E3E7E2] rounded-xl p-7 sm:p-10">
              <div className="space-y-5">
                <div className="text-xs font-semibold text-[#14532D] tracking-wide">
                  شرباص · مركز فارسكور · محافظة دمياط
                </div>
                <h1 className="text-[clamp(2rem,3.6vw,3.15rem)] font-display font-bold text-[#18231D] leading-[1.2]">
                  الجمعية الخيرية بشرباص للعمل المؤسسي والشفافية المالية
                </h1>
                <p className="text-base text-[#526058] leading-[1.75] max-w-xl">
                  {settings?.tagline_ar ||
                    'منظومة إلكترونية متكاملة لإدارة التبرعات والمشروعات التنموية وكفالة الأسر والحالات الإنسانية مع توثيق مالي دقيق وإيصالات رسمية معتمدة.'}
                </p>
              </div>

              <div className="pt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={currentUser ? onEnterPortal : onOpenAuth}
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>{currentUser ? 'الدخول إلى حسابي' : 'بوابة الدخول'}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
                {!currentUser && (
                  <button
                    type="button"
                    onClick={onOpenRegister}
                    className="px-5 py-3 text-sm font-semibold text-[#14532D] bg-[#ECFDF5] hover:bg-[#D1FAE5] border border-[#A7F3D0] rounded-lg transition-colors whitespace-nowrap"
                  >
                    إنشاء حساب متبرع
                  </button>
                )}
                <a
                  href="#projects"
                  className="px-5 py-3 text-sm font-semibold text-[#18231D] bg-[#F8F9F7] hover:bg-[#EEF2EE] border border-[#E3E7E2] rounded-lg transition-colors whitespace-nowrap"
                >
                  استعراض المشروعات
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-[#E3E7E2] bg-white">
                <SafeImage
                  src={HERO_IMAGE_URL}
                  alt="تجهيز المساعدات في الجمعية الخيرية بشرباص"
                  className="w-full h-full object-cover"
                  fallbackTitle="العمل الميداني بالجمعية الخيرية بشرباص"
                />
              </div>
            </div>
          </div>

          {/* 4-column Live DB KPI Strip below Hero */}
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E3E7E2] rounded-xl p-5">
              <div className="text-xs text-[#526058]">إجمالي التبرعات المعتمدة</div>
              <div className="text-2xl font-bold text-[#14532D] font-mono tabular-nums mt-2">
                {loading ? '—' : formatEGP(stats?.approvedDonationsTotal ?? 0)}
              </div>
            </div>
            <div className="bg-white border border-[#E3E7E2] rounded-xl p-5">
              <div className="text-xs text-[#526058]">المشروعات والحملات المعلنة</div>
              <div className="text-2xl font-bold text-[#18231D] font-mono tabular-nums mt-2">
                {loading ? '—' : stats?.publicProjectsCount ?? 0}
              </div>
            </div>
            <div className="bg-white border border-[#E3E7E2] rounded-xl p-5">
              <div className="text-xs text-[#526058]">المتبرعون المسجلون</div>
              <div className="text-2xl font-bold text-[#18231D] font-mono tabular-nums mt-2">
                {loading ? '—' : stats?.activeDonorsCount ?? 0}
              </div>
            </div>
            <div className="bg-white border border-[#E3E7E2] rounded-xl p-5">
              <div className="text-xs text-[#526058]">المساعدات المعتمدة والمنفذة</div>
              <div className="text-2xl font-bold text-[#18231D] font-mono tabular-nums mt-2">
                {loading ? '—' : stats?.completedAidsCount ?? 0}
              </div>
            </div>
          </div>

          {data?.hasDemoData && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#92400E] leading-relaxed">
              تنبيه اختبار: تُعرض حاليًا أمثلة تجريبية موسومة بـ [بيانات تجريبية] لتجربة النظام فقط، ولا تُعد هذه الأرقام تبرعات أو معاملات مالية حقيقية؛ ويمكن للمدير الرئيسي إزالتها بضغطة واحدة من الإعدادات عند بدء العمل الفعلي.
            </div>
          )}
        </section>

        {/* About & Institutional Governance */}
        <section id="about" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12">
          <div className="bg-white border border-[#E3E7E2] rounded-xl p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-3">
              <div className="text-xs font-semibold text-[#14532D]">عن الجمعية وأهدافها</div>
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#18231D]">
                أمانة التكافل وحوكمة الصرف الخيري
              </h2>
              <p className="text-sm text-[#526058] leading-relaxed">
                تعمل الجمعية الخيرية بشرباص على خدمة الأسر الأولى بالرعاية والأيتام والمرضى وتنفيذ المشروعات التنموية
                داخل شرباص والقرى المجاورة، ضمن منظومة إلكترونية موثقة تفصل أموال الزكاة عن التبرعات العامة وتحفظ
                كرامة المستفيدين وخصوصية بياناتهم.
              </p>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2 border-t border-[#E3E7E2] pt-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#18231D]">
                  <ShieldCheck className="w-4 h-4 text-[#14532D]" />
                  <span>اعتماد فعلي بعد التحقق البنكي</span>
                </div>
                <p className="text-sm text-[#526058] leading-relaxed">
                  لا يُحتسب أي تبرع في الأرصدة أو المشروعات ولا يصدر إيصاله إلا بعد مراجعة الإثبات وتأكيد وصول المبلغ.
                </p>
              </div>
              <div className="space-y-2 border-t border-[#E3E7E2] pt-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#18231D]">
                  <Lock className="w-4 h-4 text-[#14532D]" />
                  <span>خصوصية المستفيدين والرقابة</span>
                </div>
                <p className="text-sm text-[#526058] leading-relaxed">
                  تُحجب البيانات الشخصية للمستفيدين عن الزوار والمتبرعين، وتخضع كافة الصلاحيات للتدقيق المؤسسي.
                </p>
              </div>
              <div className="space-y-2 border-t border-[#E3E7E2] pt-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#18231D]">
                  <HeartHandshake className="w-4 h-4 text-[#14532D]" />
                  <span>فصل مصارف الزكاة الشرعية</span>
                </div>
                <p className="text-sm text-[#526058] leading-relaxed">
                  تُدار أموال زكاة المال وزكاة الفطر في حسابات مستقلة عن التبرعات العامة وتُصرف في مصارفها المحددة.
                </p>
              </div>
              <div className="space-y-2 border-t border-[#E3E7E2] pt-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#18231D]">
                  <Building2 className="w-4 h-4 text-[#14532D]" />
                  <span>إصدار إيصالات رسمية موثقة</span>
                </div>
                <p className="text-sm text-[#526058] leading-relaxed">
                  يصدر النظام إيصالًا مرقمًا ومفقطًا ومختومًا برقم تحقق فور اعتماد التبرع مع أرشيف دائم للمتبرع.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Core Activities */}
        <section id="programs" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8">
          <div className="mb-6">
            <div className="text-xs font-semibold text-[#14532D]">أنشطة الجمعية</div>
            <h2 className="text-2xl font-display font-bold text-[#18231D] mt-1">
              محاور العمل الخيري والتنموي في شرباص
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden flex flex-col">
              <div className="aspect-[4/3] overflow-hidden bg-[#EEF2EE]">
                <SafeImage
                  src={EDU_IMAGE_URL}
                  alt="رعاية الأيتام ودعم التعليم"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 space-y-2 flex-1">
                <div className="text-xs text-[#526058]">01 · كفالات الأيتام والتعليم</div>
                <h3 className="text-lg font-bold text-[#18231D]">كفالة الأسر ودعم الطلاب</h3>
                <p className="text-sm text-[#526058] leading-relaxed">
                  كفالات شهرية منتظمة للأيتام والأسر المستحقة وتوفير المستلزمات والرسوم الدراسية.
                </p>
              </div>
            </article>

            <article className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden flex flex-col">
              <div className="aspect-[4/3] overflow-hidden bg-[#EEF2EE]">
                <SafeImage
                  src={MED_IMAGE_URL}
                  alt="الدعم الطبي والإغاثة الغذائية"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 space-y-2 flex-1">
                <div className="text-xs text-[#526058]">02 · الرعاية الصحية والغذاء</div>
                <h3 className="text-lg font-bold text-[#18231D]">العلاج والطرود الغذائية</h3>
                <p className="text-sm text-[#526058] leading-relaxed">
                  تغطية نفقات العلاج والعمليات العاجلة وتنظيم مخزون الإمدادات الغذائية والمساعدات الموسمية.
                </p>
              </div>
            </article>

            <article className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden flex flex-col">
              <div className="aspect-[4/3] overflow-hidden bg-[#EEF2EE]">
                <SafeImage
                  src={WATER_IMAGE_URL}
                  alt="مشروعات المياه النظيفة وتحسين المساكن"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 space-y-2 flex-1">
                <div className="text-xs text-[#526058]">03 · التنمية والبنية المجتمعية</div>
                <h3 className="text-lg font-bold text-[#18231D]">وصلات المياه وتطوير المساكن</h3>
                <p className="text-sm text-[#526058] leading-relaxed">
                  تنفيذ مشروعات المياه النظيفة وصيانة الأسقف ومبادرات تيسير الزواج والتمكين الاقتصادي.
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* Live Public Projects from Database */}
        <section id="projects" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <div className="text-xs font-semibold text-[#14532D]">المشروعات والحملات الجارية</div>
              <h2 className="text-2xl font-display font-bold text-[#18231D] mt-1">
                المشروعات المفتوحة للمساهمة والشفافية المالية
              </h2>
            </div>
            <button
              type="button"
              onClick={currentUser ? onEnterPortal : onOpenAuth}
              className="px-4 py-2 text-xs font-semibold text-[#14532D] bg-white border border-[#14532D]/30 hover:bg-[#ECFDF5] rounded-lg transition-colors whitespace-nowrap"
            >
              التبرع عبر بوابة المتبرعين
            </button>
          </div>

          {loading ? (
            <div className="bg-white border border-[#E3E7E2] rounded-xl p-10 text-center text-sm text-[#526058]">
              جارٍ تحميل المشروعات من قاعدة البيانات...
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title="لم تُنشر مشروعات عامة بعد"
              description="تبدأ المنظومة بقاعدة بيانات نظيفة خالية من المشروعات الوهمية. بمجرد قيام إدارة الجمعية بإضافة ونشر المشروعات ستظهر هنا تلقائيًا مع نسب التمويل الحقيقية."
              action={
                <button
                  type="button"
                  onClick={currentUser ? onEnterPortal : onOpenAuth}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg"
                >
                  تسجيل الدخول لإضافة أو متابعة المشروعات
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((p) => (
                <article key={p.id} className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden flex flex-col">
                  <div className="aspect-[16/10] bg-[#EEF2EE] overflow-hidden">
                    <SafeImage
                      src={p.image_url || WATER_IMAGE_URL}
                      alt={p.title_ar}
                      className="w-full h-full object-cover"
                      fallbackTitle={p.title_ar}
                    />
                  </div>
                  <div className="p-6 flex-1 flex flex-col justify-between space-y-5">
                    <div className="space-y-2">
                      <div className="text-xs text-[#526058] flex flex-wrap items-center gap-2">
                        <span>{p.record_kind === 'campaign' ? 'حملة تبرعات' : 'مشروع خيري'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{p.category_ar}</span>
                        <span aria-hidden="true">·</span>
                        <span>{PROJECT_STATUS_LABELS[p.status] || p.status}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{p.code}</span>
                      </div>
                      <h3 className="text-lg font-bold text-[#18231D]">{p.title_ar}</h3>
                      <p className="text-sm text-[#526058] line-clamp-2 leading-relaxed">{p.description_ar || p.goal_ar}</p>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-[#E3E7E2]">
                      <div className="w-full h-2 bg-[#EEF2EE] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#14532D] transition-all"
                          style={{ width: `${Math.min(100, p.funding_percentage)}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                        <div>
                          <div className="text-[#526058]">المعتمد</div>
                          <div className="font-bold text-[#14532D] mt-0.5">{formatEGP(p.approved_donations)}</div>
                        </div>
                        <div>
                          <div className="text-[#526058]">المصروف</div>
                          <div className="font-semibold text-[#18231D] mt-0.5">{formatEGP(p.approved_expenses)}</div>
                        </div>
                        <div>
                          <div className="text-[#526058]">المطلوب</div>
                          <div className="font-semibold text-[#18231D] mt-0.5">{formatEGP(p.target_budget)}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={currentUser ? onEnterPortal : onOpenAuth}
                        className="w-full py-2.5 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors"
                      >
                        تبرع لهذا المشروع عبر البوابة
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {data && data.projectUpdates.length > 0 && (
            <div className="mt-8 bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-[#18231D]">أحدث تقارير إنجاز المشروعات</h3>
              <div className="divide-y divide-[#E3E7E2]">
                {data.projectUpdates.slice(0, 4).map((u) => (
                  <div key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="font-semibold text-[#18231D]">{u.title_ar}</div>
                      <div className="text-xs text-[#526058] mt-0.5">{u.details_ar}</div>
                    </div>
                    <div className="text-xs text-[#526058] tabular-nums">
                      إنجاز {u.progress_percent}% · {formatDateAr(u.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Donation Channels & Account Governance Guide */}
        <section id="donate-guide" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-10 pb-16">
          <div className="bg-white border border-[#E3E7E2] rounded-xl p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-3">
              <div className="text-xs font-semibold text-[#14532D]">دليل التبرع الموثق</div>
              <h2 className="text-2xl font-display font-bold text-[#18231D]">قنوات التحويل وخطوات التوثيق</h2>
              <p className="text-sm text-[#526058] leading-relaxed">
                {settings?.donation_instructions_ar ||
                  'يمكنك إنشاء حساب متبرع بسهولة ومتابعة تبرعاتك وإيصالاتك الرسمية وأوجه صرف المشروعات، بينما تُنشأ حسابات الموظفين والإدارة حصريًا من قِبل المدير الرئيسي.'}
              </p>
              <div className="pt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={currentUser ? onEnterPortal : onOpenAuth}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors"
                >
                  {currentUser ? 'الانتقال إلى حسابي' : 'تسجيل الدخول لرفع إثبات التبرع'}
                </button>
                {!currentUser && (
                  <button
                    type="button"
                    onClick={onOpenRegister}
                    className="px-5 py-2.5 text-sm font-semibold text-[#14532D] border border-[#14532D]/30 bg-white hover:bg-[#ECFDF5] rounded-lg transition-colors"
                  >
                    إنشاء حساب متبرع
                  </button>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="p-4 rounded-lg bg-[#F8F9F7] border border-[#E3E7E2] space-y-2">
                <div className="font-bold text-[#14532D]">التحويل البنكي</div>
                <p className="text-xs text-[#526058] leading-relaxed whitespace-pre-line">
                  {settings?.bank_transfer_info_ar || 'يُحدَّث من إعدادات الجمعية'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-[#F8F9F7] border border-[#E3E7E2] space-y-2">
                <div className="font-bold text-[#14532D]">المحافظ الإلكترونية</div>
                <p className="text-xs text-[#526058] leading-relaxed whitespace-pre-line">
                  {settings?.vodafone_cash_info_ar || 'يُحدَّث من إعدادات الجمعية'}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-[#F8F9F7] border border-[#E3E7E2] space-y-2">
                <div className="font-bold text-[#14532D]">إنستاباي / المقر</div>
                <p className="text-xs text-[#526058] leading-relaxed whitespace-pre-line">
                  {settings?.instapay_info_ar || 'يُحدَّث من إعدادات الجمعية'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-[#E3E7E2] py-8">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#526058]">
          <div className="space-y-1">
            <div className="font-bold text-[#18231D] text-sm">{settings?.name_ar || 'الجمعية الخيرية بشرباص'}</div>
            <div>{settings?.address_ar || 'شرباص - مركز فارسكور - محافظة دمياط'}</div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>{settings?.phone}</span>
            <span>·</span>
            <span>{settings?.email}</span>
            <span>·</span>
            <span className="font-mono">{settings?.website_domain || 'sherbascharity.org'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
