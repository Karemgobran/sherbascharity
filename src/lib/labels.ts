export const CHARITY_LOGO_URL = '/src/assets/images/charity_logo_1794384965522.jpg';
export const HERO_IMAGE_URL = '/src/assets/images/hero_community_aid_1794384967629.jpg';
export const EDU_IMAGE_URL = '/src/assets/images/program_education_care_1794384967564.jpg';
export const MED_IMAGE_URL = '/src/assets/images/program_medical_relief_1794384967169.jpg';
export const WATER_IMAGE_URL = '/src/assets/images/program_clean_water_1794384968036.jpg';

export function formatEGP(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ج.م`;
}

export function formatDateAr(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function formatDateTimeAr(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const PERSON_TYPE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  employee: 'موظف',
  donor: 'متبرع',
  beneficiary: 'مستفيد',
  volunteer: 'متطوع',
  official: 'مسؤول مجلس إدارة',
};

export const DONATION_TYPE_LABELS: Record<string, string> = {
  general: 'تبرع عام',
  case_support: 'تبرع لحالة إنسانية',
  project: 'تبرع لمشروع معين',
  recurring: 'تبرع شهري / دوري',
  zakat_mal: 'زكاة المال',
  zakat_fitr: 'زكاة الفطر',
  sadaqah: 'صدقات',
  kaffarah: 'كفارات',
  in_kind: 'تبرع عيني',
};

export const DONATION_STATUS_META: Record<string, { label: string; textClass: string }> = {
  pending_review: { label: 'بانتظار المراجعة', textClass: 'text-[#B45309]' },
  in_review: { label: 'قيد المراجعة', textClass: 'text-[#1D4ED8]' },
  needs_clarification: { label: 'يحتاج إلى توضيح', textClass: 'text-[#9A3412]' },
  approved: { label: 'معتمد', textClass: 'text-[#14532D]' },
  rejected: { label: 'مرفوض', textClass: 'text-[#B91C1C]' },
  cancelled: { label: 'ملغي', textClass: 'text-[#526058]' },
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  preparing: 'قيد التجهيز',
  open: 'مفتوح للتبرع',
  funded: 'مكتمل التمويل',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  paused: 'متوقف',
};

export const CASE_STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  under_research: 'قيد البحث',
  approved: 'تمت الموافقة',
  rejected: 'مرفوض',
  assisted: 'تمت المساعدة',
  closed: 'مغلق',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'عادية',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
};

export const AID_TYPE_LABELS: Record<string, string> = {
  financial: 'مساعدة مالية',
  food: 'مساعدة غذائية',
  medical: 'مساعدة طبية',
  educational: 'مساعدة تعليمية',
  marriage: 'مساعدة زواج',
  treatment: 'مساعدة علاج',
  seasonal: 'مساعدة موسمية',
  emergency: 'مساعدة طارئة',
};

export const AID_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار الاعتماد',
  approved: 'معتمدة',
  disbursed: 'تم الصرف',
  rejected: 'مرفوضة',
};

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  pending_approval: 'بانتظار الاعتماد',
  approved: 'معتمد',
  paid: 'تم الصرف',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
};

export const ZAKAT_TYPE_LABELS: Record<string, string> = {
  zakat_mal: 'زكاة المال',
  zakat_fitr: 'زكاة الفطر',
  sadaqah: 'الصدقات',
  monthly_kafala: 'كفالة شهرية',
  orphan_kafala: 'كفالة يتيم',
  family_kafala: 'كفالة أسرة',
  seasonal: 'تبرعات موسمية',
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash_safe: 'خزينة نقدية',
  bank: 'حساب بنكي',
  wallet: 'محفظة إلكترونية',
};

export const FUND_TYPE_LABELS: Record<string, string> = {
  general: 'أموال عامة',
  zakat: 'مخصص للزكاة',
  restricted: 'مقيد لغرض محدد',
};

export function hasPerm(perms: string[] | undefined, roleKey: string | undefined, key: string): boolean {
  if (roleKey === 'super_admin') return true;
  if (!perms) return false;
  return perms.includes(key);
}
