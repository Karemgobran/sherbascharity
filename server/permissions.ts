export type PermissionModule =
  | 'dashboard'
  | 'people'
  | 'roles'
  | 'donations'
  | 'receipts'
  | 'projects'
  | 'beneficiaries'
  | 'aids'
  | 'finance'
  | 'warehouse'
  | 'zakat'
  | 'staff'
  | 'reports'
  | 'audit'
  | 'settings';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'soft_delete'
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'print'
  | 'export'
  | 'reports'
  | 'suspend'
  | 'reset_password'
  | 'backup';

export interface PermissionDefinition {
  module: PermissionModule;
  moduleLabel: string;
  actions: { key: PermissionAction; label: string }[];
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    module: 'dashboard',
    moduleLabel: 'لوحة التحكم والملخص',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'reports', label: 'مشاهدة الإحصائيات التفصيلية' },
    ],
  },
  {
    module: 'people',
    moduleLabel: 'إدارة الأشخاص والحسابات',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'create', label: 'إضافة' },
      { key: 'edit', label: 'تعديل' },
      { key: 'suspend', label: 'إيقاف / تفعيل الحساب' },
      { key: 'reset_password', label: 'إعادة تعيين كلمة المرور' },
      { key: 'soft_delete', label: 'حذف منطقي' },
    ],
  },
  {
    module: 'roles',
    moduleLabel: 'الأدوار والصلاحيات',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'create', label: 'إنشاء دور' },
      { key: 'edit', label: 'تعديل الصلاحيات' },
    ],
  },
  {
    module: 'donations',
    moduleLabel: 'التبرعات ومراجعة الطلبات',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'create', label: 'إضافة' },
      { key: 'edit', label: 'تعديل / طلب توضيح' },
      { key: 'approve', label: 'اعتماد' },
      { key: 'reject', label: 'رفض' },
      { key: 'cancel', label: 'إلغاء' },
      { key: 'print', label: 'طباعة' },
      { key: 'export', label: 'تصدير' },
      { key: 'reports', label: 'مشاهدة التقارير' },
    ],
  },
  {
    module: 'receipts',
    moduleLabel: 'إيصالات التبرع الرسمية',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'print', label: 'طباعة / إعادة طباعة' },
      { key: 'export', label: 'تنزيل PDF' },
    ],
  },
  {
    module: 'projects',
    moduleLabel: 'المشروعات والحملات',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'create', label: 'إضافة' },
      { key: 'edit', label: 'تعديل' },
      { key: 'soft_delete', label: 'حذف منطقي' },
      { key: 'approve', label: 'اعتماد ونشر' },
      { key: 'reports', label: 'مشاهدة التقارير' },
    ],
  },
  {
    module: 'beneficiaries',
    moduleLabel: 'الحالات الإنسانية والمستفيدون',
    actions: [
      { key: 'view', label: 'مشاهدة البيانات والملفات' },
      { key: 'create', label: 'إضافة' },
      { key: 'edit', label: 'تعديل' },
      { key: 'soft_delete', label: 'حذف منطقي' },
      { key: 'approve', label: 'اعتماد الحالة' },
      { key: 'reject', label: 'رفض' },
      { key: 'reports', label: 'مشاهدة التقارير' },
    ],
  },
  {
    module: 'aids',
    moduleLabel: 'إدارة المساعدات',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'create', label: 'إضافة' },
      { key: 'edit', label: 'تعديل' },
      { key: 'approve', label: 'اعتماد وصرف' },
      { key: 'reject', label: 'رفض' },
      { key: 'print', label: 'طباعة' },
      { key: 'reports', label: 'مشاهدة التقارير' },
    ],
  },
  {
    module: 'finance',
    moduleLabel: 'النظام المالي والخزائن والبنوك',
    actions: [
      { key: 'view', label: 'مشاهدة الأرصدة والعمليات' },
      { key: 'create', label: 'إضافة مصروف / قيد / تحويل' },
      { key: 'edit', label: 'تعديل / تسوية' },
      { key: 'approve', label: 'اعتماد المصروفات' },
      { key: 'reject', label: 'رفض' },
      { key: 'cancel', label: 'إلغاء' },
      { key: 'print', label: 'طباعة السندات' },
      { key: 'export', label: 'تصدير' },
      { key: 'reports', label: 'مشاهدة التقارير' },
    ],
  },
  {
    module: 'warehouse',
    moduleLabel: 'المخازن والتبرعات العينية',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'create', label: 'إضافة صنف / حركة' },
      { key: 'edit', label: 'تعديل' },
      { key: 'approve', label: 'اعتماد حركة' },
      { key: 'print', label: 'طباعة' },
      { key: 'export', label: 'تصدير' },
      { key: 'reports', label: 'مشاهدة التقارير' },
    ],
  },
  {
    module: 'zakat',
    moduleLabel: 'الزكاة والكفالات',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'create', label: 'إضافة' },
      { key: 'edit', label: 'تعديل' },
      { key: 'approve', label: 'اعتماد الصرف' },
      { key: 'export', label: 'تصدير' },
      { key: 'reports', label: 'مشاهدة التقارير' },
    ],
  },
  {
    module: 'staff',
    moduleLabel: 'الموظفون والمتطوعون',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'create', label: 'إضافة' },
      { key: 'edit', label: 'تعديل' },
      { key: 'suspend', label: 'إيقاف / تفعيل' },
      { key: 'reports', label: 'مشاهدة التقارير' },
    ],
  },
  {
    module: 'reports',
    moduleLabel: 'التقارير والطباعة والتصدير',
    actions: [
      { key: 'view', label: 'مشاهدة التقارير' },
      { key: 'print', label: 'طباعة' },
      { key: 'export', label: 'تصدير Excel / PDF' },
    ],
  },
  {
    module: 'audit',
    moduleLabel: 'سجل التدقيق والرقابة',
    actions: [
      { key: 'view', label: 'مشاهدة سجل التدقيق' },
      { key: 'export', label: 'تصدير' },
    ],
  },
  {
    module: 'settings',
    moduleLabel: 'إعدادات الجمعية والنسخ الاحتياطي',
    actions: [
      { key: 'view', label: 'مشاهدة' },
      { key: 'edit', label: 'تعديل الإعدادات' },
      { key: 'backup', label: 'النسخ الاحتياطي وتنظيف البيانات' },
    ],
  },
];

export function permKey(module: PermissionModule, action: PermissionAction): string {
  return `${module}:${action}`;
}

export function getAllPermissionKeys(): string[] {
  const keys: string[] = [];
  for (const mod of PERMISSION_CATALOG) {
    for (const act of mod.actions) {
      keys.push(permKey(mod.module, act.key));
    }
  }
  return keys;
}

export interface DefaultRoleSeed {
  key: string;
  nameAr: string;
  descriptionAr: string;
  isSystem: boolean;
  permissions: string[];
}

const ALL_PERMS = getAllPermissionKeys();

export const DEFAULT_ROLES: DefaultRoleSeed[] = [
  {
    key: 'super_admin',
    nameAr: 'المدير الرئيسي',
    descriptionAr: 'يمتلك كافة الصلاحيات الإدارية والمالية والرقابية وإدارة الحسابات والأدوار والنسخ الاحتياطي.',
    isSystem: true,
    permissions: ALL_PERMS,
  },
  {
    key: 'chairman',
    nameAr: 'رئيس مجلس الإدارة',
    descriptionAr: 'الإشراف العام ومتابعة لوحة التحكم واعتماد المشروعات والمصروفات والمساعدات والاطلاع على سجل التدقيق والتقارير.',
    isSystem: true,
    permissions: [
      'dashboard:view', 'dashboard:reports',
      'people:view', 'roles:view',
      'donations:view', 'donations:approve', 'donations:reject', 'donations:print', 'donations:export', 'donations:reports',
      'receipts:view', 'receipts:print', 'receipts:export',
      'projects:view', 'projects:approve', 'projects:reports',
      'beneficiaries:view', 'beneficiaries:approve', 'beneficiaries:reports',
      'aids:view', 'aids:approve', 'aids:reject', 'aids:print', 'aids:reports',
      'finance:view', 'finance:approve', 'finance:reject', 'finance:print', 'finance:export', 'finance:reports',
      'warehouse:view', 'warehouse:reports',
      'zakat:view', 'zakat:approve', 'zakat:reports',
      'staff:view', 'staff:reports',
      'reports:view', 'reports:print', 'reports:export',
      'audit:view', 'audit:export',
      'settings:view',
    ],
  },
  {
    key: 'financial_manager',
    nameAr: 'المدير المالي',
    descriptionAr: 'إدارة الخزائن والحسابات البنكية، مراجعة واعتماد التبرعات والمصروفات، التسويات، الزكاة، والتقارير المالية.',
    isSystem: true,
    permissions: [
      'dashboard:view', 'dashboard:reports',
      'donations:view', 'donations:create', 'donations:edit', 'donations:approve', 'donations:reject', 'donations:cancel', 'donations:print', 'donations:export', 'donations:reports',
      'receipts:view', 'receipts:print', 'receipts:export',
      'projects:view', 'projects:reports',
      'aids:view', 'aids:approve', 'aids:print', 'aids:reports',
      'finance:view', 'finance:create', 'finance:edit', 'finance:approve', 'finance:reject', 'finance:cancel', 'finance:print', 'finance:export', 'finance:reports',
      'zakat:view', 'zakat:create', 'zakat:edit', 'zakat:approve', 'zakat:export', 'zakat:reports',
      'reports:view', 'reports:print', 'reports:export',
      'audit:view',
    ],
  },
  {
    key: 'accountant',
    nameAr: 'المحاسب',
    descriptionAr: 'متابعة التبرعات وإصدار السندات والمصروفات والقيود والتقارير المالية دون صلاحية إدارة حسابات الموظفين أو الأدوار.',
    isSystem: true,
    permissions: [
      'dashboard:view',
      'donations:view', 'donations:create', 'donations:edit', 'donations:approve', 'donations:reject', 'donations:print', 'donations:export', 'donations:reports',
      'receipts:view', 'receipts:print', 'receipts:export',
      'projects:view',
      'finance:view', 'finance:create', 'finance:edit', 'finance:print', 'finance:export', 'finance:reports',
      'zakat:view', 'zakat:create', 'zakat:reports',
      'reports:view', 'reports:print', 'reports:export',
    ],
  },
  {
    key: 'cases_officer',
    nameAr: 'مسؤول الحالات الإنسانية',
    descriptionAr: 'إدارة ملفات المستفيدين والبحث الاجتماعي وطلبات المساعدات دون الاطلاع على الأرصدة البنكية أو إدارة الموظفين.',
    isSystem: true,
    permissions: [
      'dashboard:view',
      'people:view',
      'beneficiaries:view', 'beneficiaries:create', 'beneficiaries:edit', 'beneficiaries:approve', 'beneficiaries:reject', 'beneficiaries:reports',
      'aids:view', 'aids:create', 'aids:edit', 'aids:print', 'aids:reports',
      'zakat:view', 'zakat:create',
      'reports:view', 'reports:print', 'reports:export',
    ],
  },
  {
    key: 'warehouse_officer',
    nameAr: 'مسؤول المخازن',
    descriptionAr: 'إدارة المخزون والأصناف والتبرعات العينية وحركات الوارد والمنصرف دون صلاحيات مالية أو اعتماد مصروفات.',
    isSystem: true,
    permissions: [
      'dashboard:view',
      'warehouse:view', 'warehouse:create', 'warehouse:edit', 'warehouse:approve', 'warehouse:print', 'warehouse:export', 'warehouse:reports',
      'aids:view',
      'reports:view', 'reports:print', 'reports:export',
    ],
  },
  {
    key: 'projects_officer',
    nameAr: 'مسؤول الحملات والمشروعات',
    descriptionAr: 'إنشاء وتحديث المشروعات والحملات الخيرية وتقارير الإنجاز دون صلاحية إدارة الحسابات البنكية أو الموظفين.',
    isSystem: true,
    permissions: [
      'dashboard:view',
      'projects:view', 'projects:create', 'projects:edit', 'projects:reports',
      'donations:view',
      'reports:view', 'reports:print', 'reports:export',
    ],
  },
  {
    key: 'receptionist',
    nameAr: 'موظف الاستقبال',
    descriptionAr: 'استقبال المتبرعين والمراجعين وتسجيل طلبات التبرع الأولية وطلبات المساعدات الجديدة دون صلاحية اعتماد مالي.',
    isSystem: true,
    permissions: [
      'dashboard:view',
      'donations:view', 'donations:create',
      'beneficiaries:view', 'beneficiaries:create',
      'aids:view', 'aids:create',
      'projects:view',
    ],
  },
  {
    key: 'donor',
    nameAr: 'متبرع',
    descriptionAr: 'حساب بوابة المتبرعين فقط: تقديم طلبات التبرع ورفع الإثباتات ومتابعة التبرعات والإيصالات والشفافية للمشروعات المساهم بها.',
    isSystem: true,
    permissions: [],
  },
];
