import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import {
  logAudit,
  requireAdminStaff,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
  userHasPermission,
  verifyPassword,
  type AuthedRequest,
} from '../auth.ts';
import { BACKUP_DIR, db, UPLOAD_DIR } from '../db.ts';
import { clearAllDemoData, seedDemoDataIfEligible } from '../demoSeed.ts';

export const systemAndReportsRouter = Router();

// =======================
// ADMIN DASHBOARD (100% LIVE DB STATS)
// =======================
systemAndReportsRouter.get('/dashboard', requireAdminStaff, (req: AuthedRequest, res) => {
  const actor = req.authUser!;

  const donationsSummary = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS approved_donations_total,
        COALESCE(SUM(CASE WHEN status IN ('pending_review', 'in_review', 'needs_clarification') THEN amount ELSE 0 END), 0) AS pending_donations_total,
        COUNT(CASE WHEN status IN ('pending_review', 'in_review', 'needs_clarification') THEN 1 END) AS pending_donations_count
      FROM donations
    `)
    .get() as { approved_donations_total: number; pending_donations_total: number; pending_donations_count: number };

  const expensesSummary = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS approved_expenses_total FROM expenses WHERE status IN ('approved', 'paid')")
    .get() as { approved_expenses_total: number };

  const counts = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM persons WHERE person_type = 'donor' AND status != 'archived') AS donors_count,
        (SELECT COUNT(*) FROM persons WHERE person_type = 'beneficiary' AND status != 'archived') AS beneficiaries_count,
        (SELECT COUNT(*) FROM persons WHERE person_type IN ('employee', 'admin', 'official') AND status != 'archived') AS employees_count,
        (SELECT COUNT(*) FROM humanitarian_cases WHERE is_archived = 0 AND status IN ('new', 'under_research', 'approved')) AS active_cases_count,
        (SELECT COUNT(*) FROM projects WHERE is_archived = 0) AS projects_count,
        (SELECT COUNT(*) FROM aids WHERE status = 'pending') AS new_aid_requests_count
    `)
    .get() as Record<string, number>;

  const canSeeDonations = userHasPermission(actor, 'donations', 'view');
  const canSeeFinance = userHasPermission(actor, 'finance', 'view');
  const canSeeAudit = userHasPermission(actor, 'audit', 'view');

  const recentDonations = canSeeDonations
    ? db
        .prepare(`
          SELECT d.id, d.reference_code, d.amount, d.status, d.donation_type, d.donation_date, d.created_at,
                 p.full_name AS donor_name, pr.title_ar AS project_title
          FROM donations d
          JOIN persons p ON p.id = d.donor_person_id
          LEFT JOIN projects pr ON pr.id = d.project_id
          ORDER BY d.created_at DESC
          LIMIT 6
        `)
        .all()
    : [];

  const recentExpenses = canSeeFinance
    ? db
        .prepare(`
          SELECT e.id, e.voucher_number, e.title_ar, e.category_ar, e.amount, e.status, e.expense_date,
                 fa.name_ar AS account_name, pr.title_ar AS project_title
          FROM expenses e
          JOIN financial_accounts fa ON fa.id = e.financial_account_id
          LEFT JOIN projects pr ON pr.id = e.project_id
          ORDER BY e.created_at DESC
          LIMIT 6
        `)
        .all()
    : [];

  const recentOperations = canSeeAudit
    ? db.prepare('SELECT id, actor_name, action, entity_type, entity_id, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 8').all()
    : [];

  const accountBalancesTotal = canSeeFinance
    ? (db.prepare('SELECT COALESCE(SUM(current_balance), 0) AS total FROM financial_accounts WHERE is_active = 1').get() as { total: number }).total
    : null;

  // Dynamic project ending soon alerts
  const endingSoonProjects = db
    .prepare(`
      SELECT id, code, title_ar, end_date
      FROM projects
      WHERE is_archived = 0 AND status IN ('open', 'in_progress') AND end_date != ''
        AND end_date >= date('now') AND end_date <= date('now', '+14 days')
    `)
    .all();

  const lowStockItems = userHasPermission(actor, 'warehouse', 'view')
    ? db.prepare('SELECT id, item_code, name_ar, current_qty, min_threshold, unit_ar FROM inventory_items WHERE current_qty <= min_threshold').all()
    : [];

  const realDonationsTotal = (
    db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM donations WHERE status = 'approved' AND is_demo = 0").get() as {
      total: number;
    }
  ).total;
  const demoCount = (
    db
      .prepare(`
        SELECT (
          (SELECT COUNT(*) FROM persons WHERE is_demo = 1) +
          (SELECT COUNT(*) FROM donations WHERE is_demo = 1) +
          (SELECT COUNT(*) FROM projects WHERE is_demo = 1) +
          (SELECT COUNT(*) FROM inventory_items WHERE is_demo = 1)
        ) AS c
      `)
      .get() as { c: number }
  ).c;

  res.json({
    hasDemoData: demoCount > 0,
    realApprovedDonationsTotal: realDonationsTotal,
    stats: {
      approvedDonationsTotal: donationsSummary.approved_donations_total,
      pendingDonationsTotal: donationsSummary.pending_donations_total,
      pendingDonationsCount: donationsSummary.pending_donations_count,
      approvedExpensesTotal: expensesSummary.approved_expenses_total,
      remainingFunds: donationsSummary.approved_donations_total - expensesSummary.approved_expenses_total,
      accountBalancesTotal,
      donorsCount: counts.donors_count,
      beneficiariesCount: userHasPermission(actor, 'beneficiaries', 'view') ? counts.beneficiaries_count : null,
      employeesCount: counts.employees_count,
      activeCasesCount: counts.active_cases_count,
      projectsCount: counts.projects_count,
      newAidRequestsCount: counts.new_aid_requests_count,
    },
    recentDonations,
    recentExpenses,
    recentOperations,
    alerts: {
      endingSoonProjects,
      lowStockItems,
    },
  });
});

// =======================
// NOTIFICATIONS
// =======================
systemAndReportsRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60')
    .all(actor.userId);
  res.json({ notifications });
});

systemAndReportsRouter.post('/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), actor.userId);
  res.json({ ok: true });
});

systemAndReportsRouter.post('/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(actor.userId);
  res.json({ ok: true });
});

// =======================
// PROTECTED FILE ACCESS (NO PUBLIC URLS FOR PAYMENT PROOFS OR CASE DOCS!)
// =======================
systemAndReportsRouter.get('/files/:id', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const fileId = String(req.params.id);
  const file = db.prepare('SELECT * FROM stored_files WHERE id = ?').get(fileId) as
    | {
        id: string;
        original_name: string;
        stored_filename: string;
        mime_type: string;
        entity_type: string;
        owner_person_id: number | null;
        uploaded_by_user_id: number | null;
      }
    | undefined;

  if (!file) {
    return res.status(404).json({ error: 'الملف غير موجود' });
  }

  let authorized = false;
  if (file.entity_type === 'project_cover' || file.entity_type === 'project_update') {
    authorized = true;
  } else if (actor.roleKey === 'super_admin') {
    authorized = true;
  } else if (actor.roleKey === 'donor') {
    if (file.entity_type === 'donation_proof' && file.owner_person_id === actor.personId) {
      authorized = true;
    } else if (file.entity_type === 'expense_attachment') {
      const publicExpense = db
        .prepare("SELECT id FROM expenses WHERE attachment_file_id = ? AND is_public_attachment = 1 AND status IN ('approved', 'paid') LIMIT 1")
        .get(file.id);
      authorized = Boolean(publicExpense);
    }
  } else {
    if (file.entity_type === 'donation_proof') authorized = userHasPermission(actor, 'donations', 'view');
    else if (file.entity_type === 'case_document') authorized = userHasPermission(actor, 'beneficiaries', 'view');
    else if (file.entity_type === 'aid_document') authorized = userHasPermission(actor, 'aids', 'view');
    else if (file.entity_type === 'expense_attachment') authorized = userHasPermission(actor, 'finance', 'view');
    else if (file.entity_type === 'warehouse_attachment') authorized = userHasPermission(actor, 'warehouse', 'view');
  }

  if (!authorized) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية الوصول إلى هذا المستند المحمي' });
  }

  const fullPath = path.join(UPLOAD_DIR, file.stored_filename);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'الملف الفعلي غير متوفر على الخادم' });
  }

  const downloadMode = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `${downloadMode}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  fs.createReadStream(fullPath).pipe(res);
});

// =======================
// 11 COMPREHENSIVE REPORTS
// =======================
systemAndReportsRouter.get('/reports/:type', requirePermission('reports', 'view'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const type = String(req.params.type);
  const { from, to, projectId, donorId, status } = req.query;

  const dateConds = (col: string, conds: string[], params: unknown[]) => {
    if (from) {
      conds.push(`${col} >= ?`);
      params.push(String(from));
    }
    if (to) {
      conds.push(`${col} <= ?`);
      params.push(String(to));
    }
  };

  let rows: Array<Record<string, unknown>> = [];
  let titleAr = '';

  switch (type) {
    case 'donations': {
      if (!userHasPermission(actor, 'donations', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير التبرعات' });
      titleAr = 'تقرير التبرعات';
      const conds: string[] = [];
      const params: unknown[] = [];
      dateConds('d.donation_date', conds, params);
      if (projectId && projectId !== 'all') { conds.push('d.project_id = ?'); params.push(Number(projectId)); }
      if (donorId && donorId !== 'all') { conds.push('d.donor_person_id = ?'); params.push(Number(donorId)); }
      if (status && status !== 'all') { conds.push('d.status = ?'); params.push(String(status)); }
      rows = db
        .prepare(`
          SELECT d.reference_code AS "رقم المرجع", p.full_name AS "المتبرع", d.donation_type AS "نوع التبرع",
                 COALESCE(pr.title_ar, 'تبرع عام') AS "المشروع", d.amount AS "المبلغ (ج.م)",
                 d.payment_method AS "طريقة الدفع", d.donation_date AS "التاريخ", d.status AS "الحالة",
                 COALESCE(rc.receipt_number, '-') AS "رقم الإيصال"
          FROM donations d
          JOIN persons p ON p.id = d.donor_person_id
          LEFT JOIN projects pr ON pr.id = d.project_id
          LEFT JOIN receipts rc ON rc.donation_id = d.id
          ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
          ORDER BY d.donation_date DESC
        `)
        .all(...params) as Array<Record<string, unknown>>;
      break;
    }

    case 'donors': {
      if (!userHasPermission(actor, 'donations', 'view') && !userHasPermission(actor, 'people', 'view')) {
        return res.status(403).json({ error: 'لا تملك صلاحية تقارير المتبرعين' });
      }
      titleAr = 'تقرير المتبرعين';
      rows = db
        .prepare(`
          SELECT p.full_name AS "اسم المتبرع", p.phone AS "الهاتف", p.status AS "حالة الحساب",
                 COUNT(CASE WHEN d.status = 'approved' THEN 1 END) AS "التبرعات المعتمدة",
                 COALESCE(SUM(CASE WHEN d.status = 'approved' THEN d.amount ELSE 0 END), 0) AS "إجمالي المعتمد (ج.م)",
                 COALESCE(SUM(CASE WHEN d.status IN ('pending_review', 'in_review') THEN d.amount ELSE 0 END), 0) AS "قيد المراجعة (ج.م)"
          FROM persons p
          LEFT JOIN donations d ON d.donor_person_id = p.id
          WHERE p.person_type = 'donor' AND p.status != 'archived'
          GROUP BY p.id
          ORDER BY "إجمالي المعتمد (ج.م)" DESC
        `)
        .all() as Array<Record<string, unknown>>;
      break;
    }

    case 'expenses': {
      if (!userHasPermission(actor, 'finance', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير المصروفات' });
      titleAr = 'تقرير المصروفات';
      const conds: string[] = [];
      const params: unknown[] = [];
      dateConds('e.expense_date', conds, params);
      if (projectId && projectId !== 'all') { conds.push('e.project_id = ?'); params.push(Number(projectId)); }
      if (status && status !== 'all') { conds.push('e.status = ?'); params.push(String(status)); }
      rows = db
        .prepare(`
          SELECT e.voucher_number AS "رقم السند", e.title_ar AS "البيان", e.category_ar AS "البند",
                 e.amount AS "المبلغ (ج.م)", fa.name_ar AS "الحساب المالي", COALESCE(pr.title_ar, 'مصروف عام') AS "المشروع",
                 e.expense_date AS "التاريخ", e.status AS "الحالة"
          FROM expenses e
          JOIN financial_accounts fa ON fa.id = e.financial_account_id
          LEFT JOIN projects pr ON pr.id = e.project_id
          ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
          ORDER BY e.expense_date DESC
        `)
        .all(...params) as Array<Record<string, unknown>>;
      break;
    }

    case 'revenues': {
      if (!userHasPermission(actor, 'finance', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير الإيرادات' });
      titleAr = 'تقرير الإيرادات وسندات القبض';
      const conds: string[] = ["ft.direction = 'credit'"];
      const params: unknown[] = [];
      dateConds('ft.transaction_date', conds, params);
      rows = db
        .prepare(`
          SELECT ft.entry_number AS "رقم القيد", ft.description_ar AS "البيان", fa.name_ar AS "الحساب",
                 ft.amount AS "المبلغ (ج.م)", ft.balance_after AS "الرصيد بعد العملية", ft.transaction_date AS "التاريخ"
          FROM financial_transactions ft
          JOIN financial_accounts fa ON fa.id = ft.account_id
          WHERE ${conds.join(' AND ')}
          ORDER BY ft.created_at DESC
        `)
        .all(...params) as Array<Record<string, unknown>>;
      break;
    }

    case 'projects': {
      titleAr = 'تقرير المشروعات والحملات';
      rows = db
        .prepare(`
          SELECT p.code AS "كود المشروع", p.title_ar AS "اسم المشروع", p.category_ar AS "التصنيف",
                 p.target_budget AS "الميزانية المطلوبة", p.status AS "الحالة",
                 COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.project_id = p.id AND d.status = 'approved'), 0) AS "التبرعات المعتمدة",
                 COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status IN ('approved', 'paid')), 0) AS "المصروفات المعتمدة"
          FROM projects p
          WHERE p.is_archived = 0
          ORDER BY p.created_at DESC
        `)
        .all() as Array<Record<string, unknown>>;
      break;
    }

    case 'cases': {
      if (!userHasPermission(actor, 'beneficiaries', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير الحالات الإنسانية' });
      titleAr = 'تقرير الحالات الإنسانية';
      rows = db
        .prepare(`
          SELECT c.file_number AS "رقم الملف", p.full_name AS "المستفيد", p.area AS "المنطقة",
                 c.case_type AS "نوع الحالة", c.priority AS "الأولوية", c.family_size AS "أفراد الأسرة",
                 c.requested_amount AS "المطلوب (ج.م)", c.status AS "الحالة"
          FROM humanitarian_cases c
          JOIN persons p ON p.id = c.beneficiary_person_id
          WHERE c.is_archived = 0
          ORDER BY c.updated_at DESC
        `)
        .all() as Array<Record<string, unknown>>;
      break;
    }

    case 'aids': {
      if (!userHasPermission(actor, 'aids', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير المساعدات' });
      titleAr = 'تقرير المساعدات المصروفة';
      const seePII = userHasPermission(actor, 'beneficiaries', 'view');
      rows = db
        .prepare(`
          SELECT a.aid_number AS "رقم المساعدة",
                 ${seePII ? 'p.full_name AS "المستفيد",' : "'محمي' AS \"المستفيد\","}
                 a.aid_type AS "النوع", a.delivery_mode AS "الصرف", a.amount AS "القيمة (ج.م)",
                 a.quantity AS "الكمية", a.aid_date AS "التاريخ", a.status AS "الحالة"
          FROM aids a
          JOIN persons p ON p.id = a.beneficiary_person_id
          ORDER BY a.aid_date DESC
        `)
        .all() as Array<Record<string, unknown>>;
      break;
    }

    case 'warehouse': {
      if (!userHasPermission(actor, 'warehouse', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير المخازن' });
      titleAr = 'تقرير أرصدة المخازن';
      rows = db
        .prepare(`
          SELECT item_code AS "كود الصنف", name_ar AS "الصنف", category_ar AS "التصنيف",
                 unit_ar AS "الوحدة", current_qty AS "الرصيد الحالي", min_threshold AS "الحد الأدنى"
          FROM inventory_items
          ORDER BY name_ar ASC
        `)
        .all() as Array<Record<string, unknown>>;
      break;
    }

    case 'zakat': {
      if (!userHasPermission(actor, 'zakat', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير الزكاة والكفالات' });
      titleAr = 'تقرير الزكاة والكفالات';
      rows = db
        .prepare(`
          SELECT program_code AS "الكود", title_ar AS "البرنامج", program_type AS "النوع",
                 monthly_amount AS "القيمة الدورية (ج.م)", start_date AS "تاريخ البداية", status AS "الحالة"
          FROM zakat_kafalat
          ORDER BY created_at DESC
        `)
        .all() as Array<Record<string, unknown>>;
      break;
    }

    case 'staff': {
      if (!userHasPermission(actor, 'staff', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير الموظفين' });
      titleAr = 'تقرير الموظفين والمتطوعين';
      rows = db
        .prepare(`
          SELECT p.full_name AS "الاسم", p.phone AS "الهاتف", p.person_type AS "التصنيف",
                 p.department AS "القسم", p.job_title AS "الوظيفة", COALESCE(r.name_ar, 'بدون حساب') AS "الدور",
                 p.join_date AS "تاريخ الانضمام", p.status AS "الحالة"
          FROM persons p
          LEFT JOIN users u ON u.person_id = p.id
          LEFT JOIN roles r ON r.id = u.role_id
          WHERE p.person_type IN ('employee', 'volunteer', 'official', 'admin') AND p.status != 'archived'
          ORDER BY p.created_at DESC
        `)
        .all() as Array<Record<string, unknown>>;
      break;
    }

    case 'balances': {
      if (!userHasPermission(actor, 'finance', 'view')) return res.status(403).json({ error: 'لا تملك صلاحية تقارير الأرصدة البنكية' });
      titleAr = 'تقرير الأرصدة والحسابات المالية';
      rows = db
        .prepare(`
          SELECT name_ar AS "الحساب / الخزينة", account_type AS "النوع", fund_type AS "التخصيص",
                 bank_name AS "البنك", account_number AS "رقم الحساب", current_balance AS "الرصيد الحالي (ج.م)"
          FROM financial_accounts
          ORDER BY id ASC
        `)
        .all() as Array<Record<string, unknown>>;
      break;
    }

    default:
      return res.status(400).json({ error: 'نوع التقرير غير مدعوم' });
  }

  res.json({ type, titleAr, rows, generatedAt: new Date().toISOString() });
});

// =======================
// AUDIT LOG, SETTINGS, BACKUPS & CLEAN DB WORKFLOW
// =======================
systemAndReportsRouter.get('/audit-logs', requirePermission('audit', 'view'), (_req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200').all();
  res.json({ logs });
});

systemAndReportsRouter.get('/settings', requirePermission('settings', 'view'), (_req, res) => {
  const settings = db.prepare('SELECT * FROM charity_settings WHERE id = 1').get();
  res.json({ settings });
});

systemAndReportsRouter.put('/settings', requirePermission('settings', 'edit'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const {
    nameAr,
    taglineAr,
    registrationNumber,
    addressAr,
    phone,
    email,
    websiteDomain,
    donationInstructionsAr,
    bankTransferInfoAr,
    vodafoneCashInfoAr,
    instapayInfoAr,
    receiptFooterAr,
  } = req.body || {};

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE charity_settings SET
      name_ar = ?, tagline_ar = ?, registration_number = ?, address_ar = ?, phone = ?, email = ?,
      website_domain = ?, donation_instructions_ar = ?, bank_transfer_info_ar = ?,
      vodafone_cash_info_ar = ?, instapay_info_ar = ?, receipt_footer_ar = ?, updated_at = ?
    WHERE id = 1
  `).run(
    String(nameAr || 'الجمعية الخيرية بشرباص').trim(),
    String(taglineAr || '').trim(),
    String(registrationNumber || '').trim(),
    String(addressAr || '').trim(),
    String(phone || '').trim(),
    String(email || '').trim(),
    String(websiteDomain || 'sherbascharity.org').trim(),
    String(donationInstructionsAr || '').trim(),
    String(bankTransferInfoAr || '').trim(),
    String(vodafoneCashInfoAr || '').trim(),
    String(instapayInfoAr || '').trim(),
    String(receiptFooterAr || '').trim(),
    now
  );

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'UPDATE_CHARITY_SETTINGS',
    entityType: 'settings',
    entityId: 1,
    ipAddress: req.ip,
  });

  res.json({ ok: true, message: 'تم حفظ إعدادات الجمعية بنجاح' });
});

function createJsonBackupSnapshot(label: string): { filename: string; fullPath: string } {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `sherbas-backup-${label}-${stamp}.json`;
  const fullPath = path.join(BACKUP_DIR, filename);

  const tables = [
    'charity_settings',
    'roles',
    'role_permissions',
    'persons',
    'users',
    'financial_accounts',
    'projects',
    'project_updates',
    'humanitarian_cases',
    'donations',
    'donation_reviews',
    'receipts',
    'expenses',
    'financial_transactions',
    'account_transfers',
    'account_reconciliations',
    'inventory_items',
    'inventory_movements',
    'aids',
    'zakat_kafalat',
    'audit_logs',
  ];

  const snapshot: Record<string, unknown> = {
    createdAt: new Date().toISOString(),
    label,
    tables: {},
  };
  const tableMap = snapshot.tables as Record<string, unknown>;
  for (const tbl of tables) {
    if (tbl === 'users') {
      // Never leak raw password hashes in JSON export unless needed for DB file backup
      tableMap[tbl] = db
        .prepare('SELECT id, person_id, username, role_id, status, last_login_at, created_at FROM users')
        .all();
    } else {
      tableMap[tbl] = db.prepare(`SELECT * FROM ${tbl}`).all();
    }
  }

  fs.writeFileSync(fullPath, JSON.stringify(snapshot, null, 2), 'utf8');
  return { filename, fullPath };
}

systemAndReportsRouter.get('/backups', requireSuperAdmin, (_req, res) => {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ backups: files });
});

systemAndReportsRouter.post('/backups/create', requireSuperAdmin, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const backup = createJsonBackupSnapshot('manual');
  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CREATE_BACKUP',
    entityType: 'backup',
    entityId: backup.filename,
    ipAddress: req.ip,
  });
  res.status(201).json({ ok: true, filename: backup.filename, message: 'تم إنشاء نسخة احتياطية كاملة بنجاح' });
});

systemAndReportsRouter.get('/backups/:filename/download', requireSuperAdmin, (req, res) => {
  const filename = path.basename(String(req.params.filename));
  const fullPath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'ملف النسخة الاحتياطية غير موجود' });
  res.download(fullPath, filename);
});

// Clean DB Pre-Cleanup Report (Dry Run!)
systemAndReportsRouter.get('/admin/clean-db/preview', requireSuperAdmin, (_req, res) => {
  const report = {
    protectedFinancialRecords: {
      approvedDonations: (
        db.prepare("SELECT COUNT(*) as c FROM donations WHERE status = 'approved' AND is_demo = 0").get() as { c: number }
      ).c,
      issuedReceipts: (db.prepare('SELECT COUNT(*) as c FROM receipts WHERE is_demo = 0').get() as { c: number }).c,
      paidExpenses: (db.prepare("SELECT COUNT(*) as c FROM expenses WHERE status = 'paid' AND is_demo = 0").get() as { c: number }).c,
      financialTransactions: (db.prepare('SELECT COUNT(*) as c FROM financial_transactions WHERE is_demo = 0').get() as { c: number }).c,
      superAdminAccounts: (
        db.prepare("SELECT COUNT(*) as c FROM users u JOIN roles r ON r.id = u.role_id WHERE r.role_key = 'super_admin'").get() as {
          c: number;
        }
      ).c,
    },
    eligibleNonFinancialOrTestRecords: {
      demoRecordsTotal: (
        db
          .prepare(`
            SELECT (
              (SELECT COUNT(*) FROM persons WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM donations WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM receipts WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM projects WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM humanitarian_cases WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM aids WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM expenses WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM financial_accounts WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM inventory_items WHERE is_demo = 1) +
              (SELECT COUNT(*) FROM zakat_kafalat WHERE is_demo = 1)
            ) AS c
          `)
          .get() as { c: number }
      ).c,
      markedTestPersons: (db.prepare('SELECT COUNT(*) as c FROM persons WHERE is_test_record = 1').get() as { c: number }).c,
      unverifiedPendingOrRejectedDonations: (
        db.prepare("SELECT COUNT(*) as c FROM donations WHERE status IN ('pending_review', 'rejected', 'cancelled')").get() as { c: number }
      ).c,
      personsWithoutFinancialLinks: (
        db.prepare(`
          SELECT COUNT(*) as c FROM persons p
          LEFT JOIN users u ON u.person_id = p.id
          LEFT JOIN roles r ON r.id = u.role_id
          WHERE COALESCE(r.role_key, '') != 'super_admin'
            AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.donor_person_id = p.id AND d.status = 'approved' AND d.is_demo = 0)
            AND NOT EXISTS (SELECT 1 FROM receipts rc WHERE rc.donor_person_id = p.id AND rc.is_demo = 0)
            AND NOT EXISTS (SELECT 1 FROM aids a WHERE a.beneficiary_person_id = p.id AND a.status IN ('approved', 'disbursed') AND a.is_demo = 0)
        `).get() as { c: number }
      ).c,
    },
  };
  res.json({ report });
});

// Clean DB Execution (Requires Super Admin password + automatic backup + strictly protects real financial records & Super Admin!)
systemAndReportsRouter.post('/admin/clean-db/execute', requireSuperAdmin, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const { password, scope } = req.body || {};

  const adminRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.userId) as { password_hash: string };
  if (!password || !verifyPassword(String(password), adminRow.password_hash)) {
    return res.status(403).json({ error: 'كلمة مرور المدير الرئيسي غير صحيحة؛ تم إلغاء عملية التنظيف لحماية البيانات' });
  }

  // Always create backup first!
  const backup = createJsonBackupSnapshot('pre-cleanup');

  if (scope === 'demo_only') {
    const demoResult = clearAllDemoData();
    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: 'CLEAN_DEMO_DATA',
      entityType: 'system',
      details: { backupFilename: backup.filename, ...demoResult },
      ipAddress: req.ip,
    });
    return res.json({
      ok: true,
      backupFilename: backup.filename,
      deletedCounts: demoResult.removedCounts,
      message: 'تم إنشاء نسخة احتياطية وإزالة جميع البيانات التجريبية فقط مع الإبقاء التام على البيانات الحقيقية وحساب المدير الرئيسي.',
    });
  }

  const deletedCounts = db.transaction(() => {
    let deletedDonations = 0;
    let archivedPersons = 0;

    if (scope === 'unverified_and_test') {
      const dRes = db
        .prepare("DELETE FROM donations WHERE status IN ('rejected', 'cancelled')")
        .run();
      deletedDonations = dRes.changes;

      const pRes = db
        .prepare(`
          UPDATE persons SET status = 'archived', archived_at = ?
          WHERE is_test_record = 1
            AND id != ?
            AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.donor_person_id = persons.id AND d.status = 'approved' AND d.is_demo = 0)
            AND NOT EXISTS (SELECT 1 FROM receipts rc WHERE rc.donor_person_id = persons.id AND rc.is_demo = 0)
        `)
        .run(new Date().toISOString(), actor.personId);
      archivedPersons = pRes.changes;
    }

    return { deletedDonations, archivedPersons };
  })();

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CLEAN_DB_EXECUTED',
    entityType: 'system',
    details: { backupFilename: backup.filename, scope, deletedCounts },
    ipAddress: req.ip,
  });

  res.json({
    ok: true,
    backupFilename: backup.filename,
    deletedCounts,
    message: 'تم إنشاء نسخة احتياطية تلقائيًا وتنفيذ التنظيف الآمن دون المساس بأي بيانات مالية أو إيصالات موثقة أو حساب المدير الرئيسي.',
  });
});

// Restore exact 1-per-section Demo Data on demand (Super Admin only)
systemAndReportsRouter.post('/admin/demo/restore', requireSuperAdmin, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const seeded = seedDemoDataIfEligible(true);
  if (!seeded) {
    return res.status(400).json({ error: 'توجد بيانات تجريبية قائمة بالفعل في النظام' });
  }
  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'DEMO_DATA_RESTORED',
    entityType: 'system',
    ipAddress: req.ip,
  });
  res.json({ ok: true, message: 'تمت استعادة البيانات التجريبية (مثال واحد لكل قسم) بنجاح' });
});
