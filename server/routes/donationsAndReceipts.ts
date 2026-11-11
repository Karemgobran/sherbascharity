import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import {
  createNotificationForPermission,
  createNotificationForUser,
  logAudit,
  nextSequentialCode,
  requireAuth,
  requireDonorAccount,
  requirePermission,
  userHasPermission,
  type AuthedRequest,
} from '../auth.ts';
import { db, UPLOAD_DIR } from '../db.ts';
import { amountToArabicWords } from '../tafqit.ts';

export const donationsAndReceiptsRouter = Router();

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext) ? ext : '.bin';
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يُسمح فقط بالصور (JPG, PNG, WEBP) وملفات PDF'));
    }
  },
});

const DONATION_TYPE_LABELS: Record<string, string> = {
  general: 'تبرع عام للجمعية',
  case_support: 'تبرع لدعم الحالات الإنسانية',
  project: 'تبرع لمشروع محدد',
  recurring: 'تبرع شهري / دوري',
  zakat_mal: 'زكاة المال',
  zakat_fitr: 'زكاة الفطر',
  sadaqah: 'صدقات',
  kaffarah: 'كفارات',
  in_kind: 'تبرع عيني',
};

export function saveStoredFile(
  file: Express.Multer.File,
  entityType: string,
  uploadedByUserId: number,
  ownerPersonId: number | null
): string {
  const fileId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO stored_files (
      id, original_name, stored_filename, mime_type, size_bytes,
      entity_type, uploaded_by_user_id, owner_person_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fileId,
    Buffer.from(file.originalname, 'latin1').toString('utf8'),
    file.filename,
    file.mimetype,
    file.size,
    entityType,
    uploadedByUserId,
    ownerPersonId,
    new Date().toISOString()
  );
  return fileId;
}

// =======================
// DONOR PORTAL ROUTES
// =======================
donationsAndReceiptsRouter.get('/donor/dashboard', requireDonorAccount, (req: AuthedRequest, res) => {
  const donor = req.authUser!;

  const summary = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS approved_total,
        COUNT(*) AS total_count,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_count,
        COUNT(CASE WHEN status IN ('pending_review', 'in_review', 'needs_clarification') THEN 1 END) AS pending_count,
        COALESCE(SUM(CASE WHEN status IN ('pending_review', 'in_review', 'needs_clarification') THEN amount ELSE 0 END), 0) AS pending_total
      FROM donations
      WHERE donor_person_id = ?
    `)
    .get(donor.personId);

  // Strictly scoped to this donor's own donations ONLY (never exposes internal_note!)
  const myDonations = db
    .prepare(`
      SELECT
        d.id, d.reference_code, d.donor_person_id, d.donation_type, d.project_id,
        d.case_category_label, d.amount, d.payment_method, d.transaction_ref, d.donation_date,
        d.proof_file_id, d.donor_notes, d.status, d.financial_account_id, d.is_zakat,
        d.rejection_reason, d.clarification_request, d.reviewed_at, d.approved_at,
        d.is_demo, d.created_at, d.updated_at,
        p.title_ar AS project_title,
        rc.id AS receipt_id,
        rc.receipt_number,
        sf.original_name AS proof_file_name,
        sf.mime_type AS proof_mime_type
      FROM donations d
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN receipts rc ON rc.donation_id = d.id
      LEFT JOIN stored_files sf ON sf.id = d.proof_file_id
      WHERE d.donor_person_id = ?
      ORDER BY d.created_at DESC
    `)
    .all(donor.personId);

  const myReceipts = db
    .prepare(`
      SELECT r.*, d.reference_code, d.transaction_ref, d.status AS donation_status, d.donation_type
      FROM receipts r
      JOIN donations d ON d.id = r.donation_id
      WHERE r.donor_person_id = ?
      ORDER BY r.created_at DESC
    `)
    .all(donor.personId);

  // Non-PII approved/paid project & general expense vouchers (NEVER selects beneficiary_or_vendor or case_id!)
  const expenseItemsStmt = db.prepare(`
    SELECT
      e.id, e.voucher_number, e.title_ar, e.category_ar, e.description_ar,
      e.amount, e.expense_date, e.project_id,
      COALESCE(p.title_ar, 'مصروف عام لأنشطة الجمعية') AS project_title,
      CASE WHEN e.is_public_attachment = 1 THEN e.attachment_file_id ELSE NULL END AS attachment_file_id,
      CASE WHEN e.is_public_attachment = 1 THEN sf.original_name ELSE NULL END AS attachment_name,
      CASE WHEN e.is_public_attachment = 1 THEN sf.mime_type ELSE NULL END AS attachment_mime_type,
      e.is_public_attachment,
      e.is_demo
    FROM expenses e
    LEFT JOIN projects p ON p.id = e.project_id
    LEFT JOIN stored_files sf ON sf.id = e.attachment_file_id
    WHERE e.status IN ('approved', 'paid')
      AND (e.project_id IS NULL OR p.is_public = 1)
    ORDER BY e.expense_date DESC, e.created_at DESC
    LIMIT 40
  `);
  const publishedExpenses = expenseItemsStmt.all() as Array<Record<string, unknown>>;

  const projectUpdatesList = db
    .prepare(`
      SELECT pu.id, pu.project_id, p.title_ar AS project_title, pu.title_ar, pu.details_ar, pu.progress_percent, pu.file_id, pu.created_at
      FROM project_updates pu
      JOIN projects p ON p.id = pu.project_id
      WHERE p.is_public = 1 AND p.is_archived = 0
      ORDER BY pu.created_at DESC
      LIMIT 20
    `)
    .all() as Array<Record<string, unknown>>;

  // Projects the donor contributed to + transparent aggregate & voucher breakdown
  const myProjectsTransparency = db
    .prepare(`
      SELECT
        p.id, p.code, p.title_ar, p.category_ar, p.goal_ar, p.target_budget, p.status, p.start_date, p.end_date,
        COALESCE((SELECT SUM(d2.amount) FROM donations d2 WHERE d2.project_id = p.id AND d2.status = 'approved'), 0) AS total_project_approved,
        COALESCE((SELECT SUM(d3.amount) FROM donations d3 WHERE d3.project_id = p.id AND d3.donor_person_id = ? AND d3.status = 'approved'), 0) AS my_approved_contribution,
        COALESCE((SELECT SUM(d4.amount) FROM donations d4 WHERE d4.project_id = p.id AND d4.donor_person_id = ? AND d4.status IN ('pending_review', 'in_review', 'needs_clarification')), 0) AS my_pending_contribution,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status IN ('approved', 'paid')), 0) AS total_project_expenses
      FROM projects p
      WHERE p.is_public = 1 AND p.is_archived = 0
        AND EXISTS (
          SELECT 1 FROM donations dm WHERE dm.project_id = p.id AND dm.donor_person_id = ?
        )
      ORDER BY p.created_at DESC
    `)
    .all(donor.personId, donor.personId, donor.personId) as Array<Record<string, unknown>>;

  const enrichedProjects = myProjectsTransparency.map((proj) => {
    const pid = Number(proj.id);
    const totalApproved = Number(proj.total_project_approved || 0);
    const myContribution = Number(proj.my_approved_contribution || 0);
    const totalExpenses = Number(proj.total_project_expenses || 0);
    const remaining = totalApproved - totalExpenses;
    const shareRatio = totalApproved > 0 ? myContribution / totalApproved : 0;
    const projExpenses = publishedExpenses.filter((ex) => Number(ex.project_id) === pid);
    const projUpdates = projectUpdatesList.filter((u) => Number(u.project_id) === pid);

    return {
      ...proj,
      remaining_balance: remaining,
      contribution_share_percent: Math.round(shareRatio * 10000) / 100,
      estimated_proportional_expense: Math.round(totalExpenses * shareRatio * 100) / 100,
      expenses: projExpenses,
      updates: projUpdates,
      allocation_note:
        'يُحسب النصيب التقديري نسبيًا من إجمالي مصروفات المشروع المعتمدة وفق نسبة مساهمتك في التمويل الكلي، ولا يعني تخصيص فاتورة بعينها.',
    };
  });

  // Public spending summary by category (published transparency without beneficiary PII)
  const publishedSpending = db
    .prepare(`
      SELECT
        e.category_ar,
        p.title_ar AS project_title,
        COUNT(*) AS vouchers_count,
        COALESCE(SUM(e.amount), 0) AS total_amount
      FROM expenses e
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.status IN ('approved', 'paid')
      GROUP BY e.category_ar, p.title_ar
      ORDER BY total_amount DESC
    `)
    .all();

  const allPublicProjects = db
    .prepare(`
      SELECT
        p.id, p.code, p.title_ar, p.category_ar, p.target_budget, p.fund_type, p.status,
        COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.project_id = p.id AND d.status = 'approved'), 0) AS approved_donations,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status IN ('approved', 'paid')), 0) AS approved_expenses
      FROM projects p
      WHERE p.is_public = 1 AND p.is_archived = 0
      ORDER BY p.created_at DESC
    `)
    .all();

  const settings = db
    .prepare('SELECT name_ar, donation_instructions_ar, bank_transfer_info_ar, vodafone_cash_info_ar, instapay_info_ar FROM charity_settings WHERE id = 1')
    .get();

  res.json({
    summary,
    myDonations,
    myReceipts,
    myProjectsTransparency: enrichedProjects,
    publishedSpending,
    publishedExpenses,
    projectUpdates: projectUpdatesList,
    publicProjects: allPublicProjects,
    settings,
  });
});

// Single donation full detail for the owning donor ONLY
donationsAndReceiptsRouter.get('/donor/donations/:id', requireDonorAccount, (req: AuthedRequest, res) => {
  const donor = req.authUser!;
  const donationId = Number(req.params.id);

  const rawCheck = db.prepare('SELECT id, donor_person_id FROM donations WHERE id = ?').get(donationId) as
    | { id: number; donor_person_id: number }
    | undefined;
  if (!rawCheck) {
    return res.status(404).json({ error: 'طلب التبرع غير موجود' });
  }
  if (rawCheck.donor_person_id !== donor.personId) {
    return res.status(403).json({ error: 'ممنوع: لا يمكنك عرض تفاصيل تبرعات متبرعين آخرين' });
  }

  const donation = db
    .prepare(`
      SELECT
        d.id, d.reference_code, d.donor_person_id, d.donation_type, d.project_id,
        d.case_category_label, d.amount, d.payment_method, d.transaction_ref, d.donation_date,
        d.proof_file_id, d.donor_notes, d.status, d.financial_account_id, d.is_zakat,
        d.rejection_reason, d.clarification_request, d.reviewed_at, d.approved_at,
        d.is_demo, d.created_at, d.updated_at,
        p.title_ar AS project_title, p.code AS project_code,
        fa.name_ar AS account_name,
        rc.id AS receipt_id, rc.receipt_number,
        sf.original_name AS proof_file_name, sf.mime_type AS proof_mime_type
      FROM donations d
      LEFT JOIN projects p ON p.id = d.project_id
      LEFT JOIN financial_accounts fa ON fa.id = d.financial_account_id
      LEFT JOIN receipts rc ON rc.donation_id = d.id
      LEFT JOIN stored_files sf ON sf.id = d.proof_file_id
      WHERE d.id = ? AND d.donor_person_id = ?
    `)
    .get(donationId, donor.personId) as Record<string, unknown>;

  const history = db
    .prepare(`
      SELECT
        dr.id, dr.action, dr.previous_status, dr.new_status, dr.created_at,
        CASE
          WHEN dr.action IN ('APPROVED', 'APPROVED_DEMO') THEN 'تم التحقق المالي واعتماد التبرع وإصدار الإيصال الرسمي'
          ELSE dr.note
        END AS note
      FROM donation_reviews dr
      WHERE dr.donation_id = ?
      ORDER BY dr.created_at DESC
    `)
    .all(donationId);

  let projectSummary: Record<string, unknown> | null = null;
  if (donation.project_id) {
    const proj = db
      .prepare(`
        SELECT
          p.id, p.code, p.title_ar, p.category_ar, p.target_budget, p.status,
          COALESCE((SELECT SUM(d2.amount) FROM donations d2 WHERE d2.project_id = p.id AND d2.status = 'approved'), 0) AS total_project_approved,
          COALESCE((SELECT SUM(d3.amount) FROM donations d3 WHERE d3.project_id = p.id AND d3.donor_person_id = ? AND d3.status = 'approved'), 0) AS my_approved_contribution,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status IN ('approved', 'paid')), 0) AS total_project_expenses
        FROM projects p
        WHERE p.id = ? AND p.is_public = 1 AND p.is_archived = 0
      `)
      .get(donor.personId, donation.project_id) as Record<string, unknown> | undefined;

    if (proj) {
      const totalApproved = Number(proj.total_project_approved || 0);
      const myContribution = Number(proj.my_approved_contribution || 0);
      const totalExpenses = Number(proj.total_project_expenses || 0);
      const shareRatio = totalApproved > 0 ? myContribution / totalApproved : 0;
      const projExpenses = db
        .prepare(`
          SELECT
            e.id, e.voucher_number, e.title_ar, e.category_ar, e.description_ar,
            e.amount, e.expense_date,
            CASE WHEN e.is_public_attachment = 1 THEN e.attachment_file_id ELSE NULL END AS attachment_file_id,
            CASE WHEN e.is_public_attachment = 1 THEN sf.original_name ELSE NULL END AS attachment_name,
            CASE WHEN e.is_public_attachment = 1 THEN sf.mime_type ELSE NULL END AS attachment_mime_type
          FROM expenses e
          LEFT JOIN stored_files sf ON sf.id = e.attachment_file_id
          WHERE e.project_id = ? AND e.status IN ('approved', 'paid')
          ORDER BY e.expense_date DESC
          LIMIT 15
        `)
        .all(donation.project_id);

      const projUpdates = db
        .prepare('SELECT id, title_ar, details_ar, progress_percent, file_id, created_at FROM project_updates WHERE project_id = ? ORDER BY created_at DESC LIMIT 6')
        .all(donation.project_id);

      projectSummary = {
        ...proj,
        remaining_balance: totalApproved - totalExpenses,
        contribution_share_percent: Math.round(shareRatio * 10000) / 100,
        expenses: projExpenses,
        updates: projUpdates,
      };
    }
  }

  res.json({ donation, history, projectSummary });
});

// Donor submits a new donation request + proof file (ALWAYS starts as pending_review!)
donationsAndReceiptsRouter.post(
  '/donor/donations',
  requireDonorAccount,
  uploadMiddleware.single('proof'),
  (req: AuthedRequest, res) => {
    const donor = req.authUser!;
    const {
      donationType,
      projectId,
      caseCategoryLabel,
      amount,
      paymentMethod,
      transactionRef,
      donationDate,
      donorNotes,
    } = req.body || {};

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'يرجى إدخال قيمة تبرع صحيحة أكبر من صفر' });
    }
    if (!donationType || !DONATION_TYPE_LABELS[String(donationType)]) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'نوع التبرع غير صالح' });
    }
    if (!paymentMethod || String(paymentMethod).trim().length < 2) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'يرجى تحديد طريقة الدفع' });
    }
    if (!req.file && String(paymentMethod) !== 'نقدي بمقر الجمعية') {
      return res.status(400).json({ error: 'يرجى إرفاق صورة إثبات التحويل أو إيصال الدفع (أو ملف PDF)' });
    }

    let validProjectId: number | null = null;
    if (projectId) {
      const proj = db
        .prepare('SELECT id, title_ar, is_public, is_archived FROM projects WHERE id = ?')
        .get(Number(projectId)) as { id: number; title_ar: string; is_public: number; is_archived: number } | undefined;
      if (!proj || proj.is_archived || !proj.is_public) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'المشروع المحدد غير متاح' });
      }
      validProjectId = proj.id;
    }

    const isZakat = ['zakat_mal', 'zakat_fitr'].includes(String(donationType)) ? 1 : 0;
    const now = new Date().toISOString();

    const created = db.transaction(() => {
      const proofFileId = req.file ? saveStoredFile(req.file, 'donation_proof', donor.userId, donor.personId) : null;
      const refCode = nextSequentialCode('DON', 'donations', 'reference_code');
      const r = db
        .prepare(`
          INSERT INTO donations (
            reference_code, donor_person_id, donation_type, project_id, case_category_label,
            amount, payment_method, transaction_ref, donation_date, proof_file_id,
            donor_notes, status, is_zakat, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?)
        `)
        .run(
          refCode,
          donor.personId,
          String(donationType),
          validProjectId,
          String(caseCategoryLabel || '').trim(),
          numAmount,
          String(paymentMethod).trim(),
          String(transactionRef || '').trim(),
          String(donationDate || now.slice(0, 10)).trim(),
          proofFileId,
          String(donorNotes || '').trim(),
          isZakat,
          donor.userId,
          now,
          now
        );

      const donationId = Number(r.lastInsertRowid);
      if (proofFileId) {
        db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(donationId, proofFileId);
      }
      db.prepare(`
        INSERT INTO donation_reviews (donation_id, action, previous_status, new_status, note, actor_user_id, created_at)
        VALUES (?, 'SUBMITTED', 'new', 'pending_review', ?, ?, ?)
      `).run(donationId, 'إرسال طلب تبرع جديد من بوابة المتبرعين بانتظار المراجعة والتحقق المالي', donor.userId, now);

      return { donationId, refCode };
    })();

    createNotificationForPermission({
      permissionKey: 'donations:approve',
      titleAr: 'طلب تبرع جديد بانتظار المراجعة',
      messageAr: `أرسل المتبرع ${donor.fullName} طلب تبرع بمبلغ ${numAmount.toLocaleString('en-US')} ج.م (${created.refCode}) ويحتاج للتحقق من إثبات الدفع.`,
      category: 'warning',
      linkTab: 'donation_reviews',
      entityType: 'donation',
      entityId: created.donationId,
    });

    logAudit({
      actorUserId: donor.userId,
      actorName: donor.fullName,
      action: 'DONOR_SUBMIT_DONATION',
      entityType: 'donation',
      entityId: created.donationId,
      details: { referenceCode: created.refCode, amount: numAmount, donationType, projectId: validProjectId },
      ipAddress: req.ip,
    });

    res.status(201).json({
      ok: true,
      id: created.donationId,
      referenceCode: created.refCode,
      message: 'تم إرسال طلب التبرع بنجاح وهو الآن بانتظار المراجعة والتحقق المالي من الإدارة. لن يُصدر الإيصال إلا بعد تأكيد وصول المبلغ.',
    });
  }
);

// Donor replies to clarification request (cannot alter amount or status to approved!)
donationsAndReceiptsRouter.post(
  '/donor/donations/:id/clarify',
  requireDonorAccount,
  uploadMiddleware.single('proof'),
  (req: AuthedRequest, res) => {
    const donor = req.authUser!;
    const donationId = Number(req.params.id);
    const { note } = req.body || {};

    const donation = db
      .prepare('SELECT * FROM donations WHERE id = ? AND donor_person_id = ?')
      .get(donationId, donor.personId) as Record<string, unknown> | undefined;

    if (!donation) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'طلب التبرع غير موجود' });
    }
    if (donation.status !== 'needs_clarification') {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'هذا الطلب لا ينتظر توضيحًا حاليًا' });
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      let proofFileId = donation.proof_file_id as string | null;
      if (req.file) {
        proofFileId = saveStoredFile(req.file, 'donation_proof', donor.userId, donor.personId);
        db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(donationId, proofFileId);
      }
      db.prepare(`
        UPDATE donations
        SET status = 'pending_review', proof_file_id = ?, donor_notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        proofFileId,
        note ? `${String(donation.donor_notes || '')}\n[توضيح المتبرع]: ${String(note).trim()}`.trim() : donation.donor_notes,
        now,
        donationId
      );
      db.prepare(`
        INSERT INTO donation_reviews (donation_id, action, previous_status, new_status, note, actor_user_id, created_at)
        VALUES (?, 'CLARIFICATION_PROVIDED', 'needs_clarification', 'pending_review', ?, ?, ?)
      `).run(donationId, String(note || 'تم رفع إثبات إضافي'), donor.userId, now);
    })();

    createNotificationForPermission({
      permissionKey: 'donations:approve',
      titleAr: 'رد توضيحي على طلب تبرع',
      messageAr: `قام المتبرع ${donor.fullName} بإضافة توضيح لطلب التبرع ${donation.reference_code}.`,
      category: 'info',
      linkTab: 'donation_reviews',
      entityType: 'donation',
      entityId: donationId,
    });

    res.json({ ok: true, message: 'تم إرسال التوضيح وإعادة الطلب للمراجعة' });
  }
);

// =======================
// ADMIN / STAFF DONATION ROUTES
// =======================
donationsAndReceiptsRouter.get('/donations', requirePermission('donations', 'view'), (req: AuthedRequest, res) => {
  const { status, type, projectId, donorId, from, to, q } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status && status !== 'all') {
    conditions.push('d.status = ?');
    params.push(String(status));
  }
  if (type && type !== 'all') {
    conditions.push('d.donation_type = ?');
    params.push(String(type));
  }
  if (projectId && projectId !== 'all') {
    conditions.push('d.project_id = ?');
    params.push(Number(projectId));
  }
  if (donorId && donorId !== 'all') {
    conditions.push('d.donor_person_id = ?');
    params.push(Number(donorId));
  }
  if (from) {
    conditions.push('d.donation_date >= ?');
    params.push(String(from));
  }
  if (to) {
    conditions.push('d.donation_date <= ?');
    params.push(String(to));
  }
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conditions.push('(p.full_name LIKE ? OR p.phone LIKE ? OR d.reference_code LIKE ? OR d.transaction_ref LIKE ?)');
    params.push(term, term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const donations = db
    .prepare(`
      SELECT
        d.*,
        p.full_name AS donor_name,
        p.phone AS donor_phone,
        pr.title_ar AS project_title,
        fa.name_ar AS account_name,
        rc.id AS receipt_id,
        rc.receipt_number,
        rev_p.full_name AS reviewed_by_name,
        app_p.full_name AS approved_by_name,
        sf.original_name AS proof_file_name,
        sf.mime_type AS proof_mime_type
      FROM donations d
      JOIN persons p ON p.id = d.donor_person_id
      LEFT JOIN projects pr ON pr.id = d.project_id
      LEFT JOIN financial_accounts fa ON fa.id = d.financial_account_id
      LEFT JOIN receipts rc ON rc.donation_id = d.id
      LEFT JOIN users rev_u ON rev_u.id = d.reviewed_by_user_id
      LEFT JOIN persons rev_p ON rev_p.id = rev_u.person_id
      LEFT JOIN users app_u ON app_u.id = d.approved_by_user_id
      LEFT JOIN persons app_p ON app_p.id = app_u.person_id
      LEFT JOIN stored_files sf ON sf.id = d.proof_file_id
      ${whereClause}
      ORDER BY d.created_at DESC
    `)
    .all(...params);

  res.json({ donations });
});

donationsAndReceiptsRouter.get('/donations/:id', requirePermission('donations', 'view'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const donation = db
    .prepare(`
      SELECT
        d.*,
        p.full_name AS donor_name,
        p.phone AS donor_phone,
        pr.title_ar AS project_title,
        fa.name_ar AS account_name,
        rc.id AS receipt_id,
        rc.receipt_number,
        sf.original_name AS proof_file_name,
        sf.mime_type AS proof_mime_type
      FROM donations d
      JOIN persons p ON p.id = d.donor_person_id
      LEFT JOIN projects pr ON pr.id = d.project_id
      LEFT JOIN financial_accounts fa ON fa.id = d.financial_account_id
      LEFT JOIN receipts rc ON rc.donation_id = d.id
      LEFT JOIN stored_files sf ON sf.id = d.proof_file_id
      WHERE d.id = ?
    `)
    .get(id);

  if (!donation) return res.status(404).json({ error: 'طلب التبرع غير موجود' });

  const history = db
    .prepare(`
      SELECT dr.*, p.full_name AS actor_name
      FROM donation_reviews dr
      LEFT JOIN users u ON u.id = dr.actor_user_id
      LEFT JOIN persons p ON p.id = u.person_id
      WHERE dr.donation_id = ?
      ORDER BY dr.created_at DESC
    `)
    .all(id);

  res.json({ donation, history });
});

// Staff records a donation (also starts pending_review until verified & approved!)
donationsAndReceiptsRouter.post(
  '/donations',
  requirePermission('donations', 'create'),
  uploadMiddleware.single('proof'),
  (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const {
      donorPersonId,
      donationType,
      projectId,
      caseCategoryLabel,
      amount,
      paymentMethod,
      transactionRef,
      donationDate,
      donorNotes,
    } = req.body || {};

    const numAmount = Number(amount);
    if (!donorPersonId) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'يرجى اختيار المتبرع' });
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'يرجى إدخال مبلغ تبرع صحيح' });
    }
    if (!donationType || !DONATION_TYPE_LABELS[String(donationType)]) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'نوع التبرع غير صالح' });
    }

    const donor = db
      .prepare("SELECT id, full_name FROM persons WHERE id = ? AND person_type = 'donor' AND status != 'archived'")
      .get(Number(donorPersonId)) as { id: number; full_name: string } | undefined;
    if (!donor) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'المتبرع المحدد غير موجود' });
    }

    const isZakat = ['zakat_mal', 'zakat_fitr'].includes(String(donationType)) ? 1 : 0;
    const now = new Date().toISOString();

    const created = db.transaction(() => {
      const proofFileId = req.file ? saveStoredFile(req.file, 'donation_proof', actor.userId, donor.id) : null;
      const refCode = nextSequentialCode('DON', 'donations', 'reference_code');
      const r = db
        .prepare(`
          INSERT INTO donations (
            reference_code, donor_person_id, donation_type, project_id, case_category_label,
            amount, payment_method, transaction_ref, donation_date, proof_file_id,
            donor_notes, status, is_zakat, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?, ?)
        `)
        .run(
          refCode,
          donor.id,
          String(donationType),
          projectId ? Number(projectId) : null,
          String(caseCategoryLabel || '').trim(),
          numAmount,
          String(paymentMethod || 'تحويل بنكي').trim(),
          String(transactionRef || '').trim(),
          String(donationDate || now.slice(0, 10)).trim(),
          proofFileId,
          String(donorNotes || '').trim(),
          isZakat,
          actor.userId,
          now,
          now
        );

      const donationId = Number(r.lastInsertRowid);
      if (proofFileId) {
        db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(donationId, proofFileId);
      }
      db.prepare(`
        INSERT INTO donation_reviews (donation_id, action, previous_status, new_status, note, actor_user_id, created_at)
        VALUES (?, 'CREATED_BY_STAFF', 'new', 'pending_review', ?, ?, ?)
      `).run(donationId, `تسجيل طلب تبرع بواسطة ${actor.fullName} بانتظار المراجعة والاعتماد`, actor.userId, now);

      return { donationId, refCode };
    })();

    createNotificationForPermission({
      permissionKey: 'donations:approve',
      titleAr: 'طلب تبرع جديد للمراجعة',
      messageAr: `سجّل ${actor.fullName} طلب تبرع للمتبرع ${donor.full_name} بمبلغ ${numAmount.toLocaleString('en-US')} ج.م (${created.refCode}).`,
      category: 'warning',
      linkTab: 'donation_reviews',
      entityType: 'donation',
      entityId: created.donationId,
      excludeUserId: actor.userId,
    });

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: 'STAFF_CREATE_DONATION',
      entityType: 'donation',
      entityId: created.donationId,
      details: { refCode: created.refCode, donorId: donor.id, amount: numAmount },
      ipAddress: req.ip,
    });

    res.status(201).json({
      ok: true,
      id: created.donationId,
      referenceCode: created.refCode,
      message: 'تم تسجيل طلب التبرع وإحالته للمراجعة والاعتماد المالي.',
    });
  }
);

// Review / Approve / Reject / Clarify / Cancel donation
donationsAndReceiptsRouter.post('/donations/:id/review', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const donationId = Number(req.params.id);
  const { action, internalNote, rejectionReason, clarificationRequest, financialAccountId, confirmedFundsReceived } =
    req.body || {};

  if (
    actor.roleKey === 'donor' ||
    (!userHasPermission(actor, 'donations', 'approve') &&
      !userHasPermission(actor, 'donations', 'reject') &&
      !userHasPermission(actor, 'donations', 'cancel') &&
      !userHasPermission(actor, 'donations', 'edit'))
  ) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية مراجعة طلبات التبرع' });
  }

  if (!['in_review', 'needs_clarification', 'approved', 'rejected', 'cancelled'].includes(String(action))) {
    return res.status(400).json({ error: 'إجراء المراجعة غير صالح' });
  }

  if (action === 'approved' && !userHasPermission(actor, 'donations', 'approve')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية اعتماد التبرعات' });
  }
  if (action === 'rejected' && !userHasPermission(actor, 'donations', 'reject')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية رفض التبرعات' });
  }
  if (action === 'cancelled' && !userHasPermission(actor, 'donations', 'cancel')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية إلغاء التبرعات' });
  }
  if (['in_review', 'needs_clarification'].includes(String(action)) && !userHasPermission(actor, 'donations', 'edit') && !userHasPermission(actor, 'donations', 'approve')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية مراجعة طلبات التبرع' });
  }

  const donation = db
    .prepare(`
      SELECT d.*, p.full_name AS donor_name, pr.title_ar AS project_title, u.id AS donor_user_id
      FROM donations d
      JOIN persons p ON p.id = d.donor_person_id
      LEFT JOIN projects pr ON pr.id = d.project_id
      LEFT JOIN users u ON u.person_id = p.id
      WHERE d.id = ?
    `)
    .get(donationId) as
    | {
        id: number;
        reference_code: string;
        donor_person_id: number;
        donor_name: string;
        donor_user_id: number | null;
        donation_type: string;
        project_id: number | null;
        project_title: string | null;
        amount: number;
        payment_method: string;
        donation_date: string;
        status: string;
        is_zakat: number;
        is_demo: number;
        internal_note: string;
      }
    | undefined;

  if (!donation) return res.status(404).json({ error: 'طلب التبرع غير موجود' });
  if (donation.status === 'approved') {
    return res.status(400).json({ error: 'تم اعتماد هذا التبرع وإصدار إيصاله بالفعل ولا يمكن تغييره' });
  }
  if (['rejected', 'cancelled'].includes(donation.status)) {
    return res.status(400).json({ error: 'هذا الطلب مرفوض أو ملغي بالفعل' });
  }

  if (action === 'rejected' && (!rejectionReason || String(rejectionReason).trim().length < 3)) {
    return res.status(400).json({ error: 'يجب تسجيل سبب الرفض بوضوح' });
  }
  if (action === 'needs_clarification' && (!clarificationRequest || String(clarificationRequest).trim().length < 3)) {
    return res.status(400).json({ error: 'يرجى كتابة التوضيح المطلوب من المتبرع' });
  }

  if (action === 'approved') {
    if (!confirmedFundsReceived) {
      return res.status(400).json({ error: 'يجب تأكيد التحقق من وصول المبلغ فعليًا قبل اعتماد التبرع' });
    }
    if (!financialAccountId) {
      return res.status(400).json({ error: 'يرجى تحديد الخزينة أو الحساب البنكي الذي استُلم فيه المبلغ' });
    }
  }

  const now = new Date().toISOString();
  const demoFlag = donation.is_demo ? 1 : 0;

  try {
    const result = db.transaction(() => {
      if (action === 'approved') {
        const account = db
          .prepare('SELECT * FROM financial_accounts WHERE id = ? AND is_active = 1')
          .get(Number(financialAccountId)) as
          | { id: number; name_ar: string; current_balance: number; fund_type: string }
          | undefined;

        if (!account) {
          throw new Error('ACCOUNT_NOT_FOUND');
        }
        if (donation.is_zakat && account.fund_type === 'general') {
          throw new Error('ZAKAT_FUND_SEGREGATION');
        }

        const newBalance = Math.round((account.current_balance + donation.amount) * 100) / 100;
        db.prepare('UPDATE financial_accounts SET current_balance = ?, updated_at = ? WHERE id = ?').run(
          newBalance,
          now,
          account.id
        );

        const entryNum = nextSequentialCode('RV', 'financial_transactions', 'entry_number');
        db.prepare(`
          INSERT INTO financial_transactions (
            entry_number, entry_type, account_id, direction, amount, balance_after,
            reference_type, reference_id, project_id, description_ar, transaction_date,
            is_demo, created_by_user_id, created_at
          ) VALUES (?, 'receipt_voucher', ?, 'credit', ?, ?, 'donation', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          entryNum,
          account.id,
          donation.amount,
          newBalance,
          donation.id,
          donation.project_id,
          `سند قبض تبرع (${donation.reference_code}) من ${donation.donor_name}`,
          donation.donation_date,
          demoFlag,
          actor.userId,
          now
        );

        db.prepare(`
          UPDATE donations SET
            status = 'approved',
            financial_account_id = ?,
            internal_note = ?,
            reviewed_by_user_id = COALESCE(reviewed_by_user_id, ?),
            reviewed_at = COALESCE(reviewed_at, ?),
            approved_by_user_id = ?,
            approved_at = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          account.id,
          String(internalNote || donation.internal_note || '').trim(),
          actor.userId,
          now,
          actor.userId,
          now,
          now,
          donation.id
        );

        const receiptNumber = nextSequentialCode('SHB', 'receipts', 'receipt_number');
        const amountWords = amountToArabicWords(donation.amount);
        const typeLabel = DONATION_TYPE_LABELS[donation.donation_type] || donation.donation_type;
        const verificationHash = crypto
          .createHash('sha256')
          .update(`${receiptNumber}|${donation.id}|${donation.amount}|${now}`)
          .digest('hex')
          .slice(0, 16)
          .toUpperCase();

        const recRes = db
          .prepare(`
            INSERT INTO receipts (
              receipt_number, donation_id, donor_person_id, donor_name, amount, amount_words_ar,
              donation_type_label, project_title, payment_method, donation_date,
              approved_by_name, approved_at, verification_hash, is_demo, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            receiptNumber,
            donation.id,
            donation.donor_person_id,
            donation.donor_name,
            donation.amount,
            amountWords,
            typeLabel,
            donation.project_title || '',
            donation.payment_method,
            donation.donation_date,
            actor.fullName,
            now,
            verificationHash,
            demoFlag,
            now
          );

        db.prepare(`
          INSERT INTO donation_reviews (donation_id, action, previous_status, new_status, note, actor_user_id, created_at)
          VALUES (?, 'APPROVED', ?, 'approved', ?, ?, ?)
        `).run(
          donation.id,
          donation.status,
          `اعتماد وصول المبلغ إلى (${account.name_ar}) وإصدار الإيصال ${receiptNumber}. ${String(internalNote || '')}`.trim(),
          actor.userId,
          now
        );

        return { receiptId: Number(recRes.lastInsertRowid), receiptNumber };
      } else {
        db.prepare(`
          UPDATE donations SET
            status = ?,
            internal_note = ?,
            rejection_reason = CASE WHEN ? = 'rejected' THEN ? ELSE rejection_reason END,
            clarification_request = CASE WHEN ? = 'needs_clarification' THEN ? ELSE clarification_request END,
            reviewed_by_user_id = ?,
            reviewed_at = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          String(action),
          String(internalNote || donation.internal_note || '').trim(),
          String(action),
          String(rejectionReason || '').trim(),
          String(action),
          String(clarificationRequest || '').trim(),
          actor.userId,
          now,
          now,
          donation.id
        );

        db.prepare(`
          INSERT INTO donation_reviews (donation_id, action, previous_status, new_status, note, actor_user_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          donation.id,
          String(action).toUpperCase(),
          donation.status,
          String(action),
          String(rejectionReason || clarificationRequest || internalNote || '').trim(),
          actor.userId,
          now
        );

        return { receiptId: null, receiptNumber: null };
      }
    })();

    // Notify donor if they have a user account
    if (donation.donor_user_id) {
      if (action === 'approved') {
        createNotificationForUser({
          userId: donation.donor_user_id,
          titleAr: `تم اعتماد تبرعك وإصدار الإيصال ${result.receiptNumber}`,
          messageAr: `تم تأكيد استلام تبرعك بمبلغ ${donation.amount.toLocaleString('en-US')} ج.م (${donation.reference_code}) ويمكنك تنزيل الإيصال الرسمي الآن.`,
          category: 'success',
          linkTab: 'receipts',
          entityType: 'receipt',
          entityId: result.receiptId ?? undefined,
        });
      } else if (action === 'rejected') {
        createNotificationForUser({
          userId: donation.donor_user_id,
          titleAr: `تم رفض طلب التبرع ${donation.reference_code}`,
          messageAr: `سبب الرفض: ${String(rejectionReason)}`,
          category: 'error',
          linkTab: 'donations',
          entityType: 'donation',
          entityId: donation.id,
        });
      } else if (action === 'needs_clarification') {
        createNotificationForUser({
          userId: donation.donor_user_id,
          titleAr: `مطلوب توضيح بخصوص التبرع ${donation.reference_code}`,
          messageAr: String(clarificationRequest),
          category: 'warning',
          linkTab: 'donations',
          entityType: 'donation',
          entityId: donation.id,
        });
      }
    }

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: `DONATION_${String(action).toUpperCase()}`,
      entityType: 'donation',
      entityId: donation.id,
      details: { referenceCode: donation.reference_code, receiptNumber: result.receiptNumber },
      ipAddress: req.ip,
    });

    res.json({
      ok: true,
      ...result,
      message:
        action === 'approved'
          ? `تم اعتماد التبرع وتسجيل سند القبض وإصدار الإيصال الرسمي رقم ${result.receiptNumber}`
          : 'تم تحديث حالة طلب التبرع بنجاح',
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'ACCOUNT_NOT_FOUND') {
        return res.status(400).json({ error: 'الحساب المالي المحدد غير موجود أو موقوف' });
      }
      if (err.message === 'ZAKAT_FUND_SEGREGATION') {
        return res.status(400).json({
          error: 'ضبط شرعي ومالي: لا يجوز إيداع أموال الزكاة في خزينة عامة غير مخصصة للزكاة. يرجى اختيار حساب أو خزينة زكاة.',
        });
      }
    }
    console.error('Donation review error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة مراجعة التبرع' });
  }
});

// =======================
// OFFICIAL RECEIPTS ROUTES
// =======================
donationsAndReceiptsRouter.get('/receipts', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const q = req.query.q ? `%${String(req.query.q).trim()}%` : null;

  if (actor.roleKey === 'donor') {
    const receipts = db
      .prepare(`
        SELECT r.*, d.reference_code, d.transaction_ref, d.status AS donation_status
        FROM receipts r
        JOIN donations d ON d.id = r.donation_id
        WHERE r.donor_person_id = ?
          ${q ? 'AND (r.receipt_number LIKE ? OR r.project_title LIKE ?)' : ''}
        ORDER BY r.created_at DESC
      `)
      .all(...(q ? [actor.personId, q, q] : [actor.personId]));
    return res.json({ receipts });
  }

  if (!userHasPermission(actor, 'receipts', 'view') && !userHasPermission(actor, 'donations', 'view')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية عرض الإيصالات' });
  }

  const receipts = db
    .prepare(`
      SELECT r.*, d.reference_code, d.transaction_ref, d.status AS donation_status
      FROM receipts r
      JOIN donations d ON d.id = r.donation_id
      ${q ? 'WHERE (r.receipt_number LIKE ? OR r.donor_name LIKE ? OR r.project_title LIKE ?)' : ''}
      ORDER BY r.created_at DESC
    `)
    .all(...(q ? [q, q, q] : []));

  res.json({ receipts });
});

donationsAndReceiptsRouter.get('/receipts/:id', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const id = Number(req.params.id);
  const receipt = db
    .prepare(`
      SELECT r.*, d.reference_code, d.transaction_ref, d.donor_notes, d.status AS donation_status
      FROM receipts r
      JOIN donations d ON d.id = r.donation_id
      WHERE r.id = ?
    `)
    .get(id) as Record<string, unknown> | undefined;

  if (!receipt) return res.status(404).json({ error: 'الإيصال غير موجود' });

  if (actor.roleKey === 'donor') {
    if (Number(receipt.donor_person_id) !== actor.personId) {
      return res.status(403).json({ error: 'ممنوع: لا يمكنك عرض إيصالات متبرعين آخرين' });
    }
  } else if (!userHasPermission(actor, 'receipts', 'view') && !userHasPermission(actor, 'donations', 'view')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية عرض الإيصال' });
  }

  const settings = db
    .prepare('SELECT name_ar, registration_number, address_ar, phone, email, website_domain, receipt_footer_ar FROM charity_settings WHERE id = 1')
    .get();

  res.json({ receipt, settings });
});

donationsAndReceiptsRouter.post('/receipts/:id/increment-print', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const id = Number(req.params.id);
  const receipt = db.prepare('SELECT id, donor_person_id, receipt_number FROM receipts WHERE id = ?').get(id) as
    | { id: number; donor_person_id: number; receipt_number: string }
    | undefined;
  if (!receipt) return res.status(404).json({ error: 'الإيصال غير موجود' });

  if (actor.roleKey === 'donor' && receipt.donor_person_id !== actor.personId) {
    return res.status(403).json({ error: 'ممنوع' });
  }
  if (actor.roleKey !== 'donor' && !userHasPermission(actor, 'receipts', 'print') && !userHasPermission(actor, 'receipts', 'export')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية طباعة أو تنزيل الإيصال' });
  }

  db.prepare('UPDATE receipts SET print_count = print_count + 1 WHERE id = ?').run(id);
  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'RECEIPT_PRINTED_OR_DOWNLOADED',
    entityType: 'receipt',
    entityId: id,
    details: { receiptNumber: receipt.receipt_number },
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});
