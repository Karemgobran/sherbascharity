import { Router } from 'express';
import {
  createNotificationForPermission,
  logAudit,
  nextSequentialCode,
  requireAuth,
  requirePermission,
  userHasPermission,
  type AuthedRequest,
} from '../auth.ts';
import { db } from '../db.ts';
import { saveStoredFile, uploadMiddleware } from './donationsAndReceipts.ts';

export const projectsAndCasesRouter = Router();

// =======================
// PROJECTS & CAMPAIGNS
// =======================
projectsAndCasesRouter.get('/projects', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  if (actor.roleKey === 'donor') {
    const publicProjects = db
      .prepare(`
        SELECT
          p.id, p.code, p.title_ar, p.category_ar, p.description_ar, p.goal_ar,
          p.image_url, p.target_budget, p.fund_type, p.start_date, p.end_date, p.status,
          COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.project_id = p.id AND d.status = 'approved'), 0) AS approved_donations,
          COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status IN ('approved', 'paid')), 0) AS approved_expenses
        FROM projects p
        WHERE p.is_public = 1 AND p.is_archived = 0
        ORDER BY p.created_at DESC
      `)
      .all();
    return res.json({ projects: publicProjects });
  }

  if (!userHasPermission(actor, 'projects', 'view') && !userHasPermission(actor, 'donations', 'view') && !userHasPermission(actor, 'finance', 'view')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية عرض المشروعات' });
  }

  const projects = db
    .prepare(`
      SELECT
        p.*,
        m.full_name AS manager_name,
        COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.project_id = p.id AND d.status = 'approved'), 0) AS approved_donations,
        COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.project_id = p.id AND d.status IN ('pending_review', 'in_review', 'needs_clarification')), 0) AS pending_donations,
        COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.project_id = p.id AND e.status IN ('approved', 'paid')), 0) AS approved_expenses
      FROM projects p
      LEFT JOIN persons m ON m.id = p.manager_person_id
      WHERE p.is_archived = 0
      ORDER BY p.created_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const updates = db
    .prepare(`
      SELECT pu.*, pe.full_name AS author_name
      FROM project_updates pu
      LEFT JOIN users u ON u.id = pu.created_by_user_id
      LEFT JOIN persons pe ON pe.id = u.person_id
      ORDER BY pu.created_at DESC
    `)
    .all();

  res.json({
    projects: projects.map((p) => {
      const target = Number(p.target_budget || 0);
      const donated = Number(p.approved_donations || 0);
      const spent = Number(p.approved_expenses || 0);
      return {
        ...p,
        remaining_balance: donated - spent,
        funding_percentage: target > 0 ? Math.min(100, Math.round((donated / target) * 100)) : 0,
      };
    }),
    updates,
  });
});

projectsAndCasesRouter.post('/projects', requirePermission('projects', 'create'), uploadMiddleware.single('cover'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const { titleAr, categoryAr, descriptionAr, goalAr, imageUrl, targetBudget, fundType, startDate, endDate, managerPersonId, status, isPublic, recordKind } =
    req.body || {};

  if (!titleAr || String(titleAr).trim().length < 3) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المشروع أو الحملة' });
  }
  const budget = Number(targetBudget || 0);
  if (!Number.isFinite(budget) || budget < 0) {
    return res.status(400).json({ error: 'الميزانية المطلوبة غير صالحة' });
  }

  const normalizedKind = recordKind === 'campaign' ? 'campaign' : 'project';
  const now = new Date().toISOString();
  const code = nextSequentialCode(normalizedKind === 'campaign' ? 'CMP' : 'PRJ', 'projects', 'code');
  const coverFileId = req.file ? saveStoredFile(req.file, 'project_cover', actor.userId, null) : null;
  const resolvedImageUrl = coverFileId ? `/api/files/${coverFileId}` : String(imageUrl || '').trim();

  const r = db
    .prepare(`
      INSERT INTO projects (
        code, record_kind, title_ar, category_ar, description_ar, goal_ar, image_url, cover_file_id,
        target_budget, fund_type, start_date, end_date, manager_person_id, status,
        is_public, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      code,
      normalizedKind,
      String(titleAr).trim(),
      String(categoryAr || (normalizedKind === 'campaign' ? 'حملة تبرعات' : 'مشروعات تنموية')).trim(),
      String(descriptionAr || '').trim(),
      String(goalAr || '').trim(),
      resolvedImageUrl,
      coverFileId,
      budget,
      ['general', 'zakat', 'restricted'].includes(String(fundType)) ? String(fundType) : 'general',
      String(startDate || now.slice(0, 10)).trim(),
      String(endDate || '').trim(),
      managerPersonId ? Number(managerPersonId) : null,
      ['preparing', 'open', 'funded', 'in_progress', 'completed', 'paused'].includes(String(status)) ? String(status) : 'open',
      isPublic === false || isPublic === 'false' || isPublic === '0' ? 0 : 1,
      actor.userId,
      now,
      now
    );

  const projectId = Number(r.lastInsertRowid);
  if (coverFileId) {
    db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(projectId, coverFileId);
  }

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CREATE_PROJECT',
    entityType: 'project',
    entityId: projectId,
    details: { code, titleAr, budget },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, id: projectId, code, message: 'تم إنشاء المشروع بنجاح' });
});

projectsAndCasesRouter.put('/projects/:id', requirePermission('projects', 'edit'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const projectId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND is_archived = 0').get(projectId);
  if (!existing) return res.status(404).json({ error: 'المشروع غير موجود' });

  const { titleAr, categoryAr, descriptionAr, goalAr, imageUrl, targetBudget, fundType, startDate, endDate, managerPersonId, status, isPublic, recordKind } =
    req.body || {};

  const now = new Date().toISOString();
  const normalizedKind = recordKind === 'campaign' ? 'campaign' : 'project';
  db.prepare(`
    UPDATE projects SET
      record_kind = ?, title_ar = ?, category_ar = ?, description_ar = ?, goal_ar = ?, image_url = ?,
      target_budget = ?, fund_type = ?, start_date = ?, end_date = ?,
      manager_person_id = ?, status = ?, is_public = ?, updated_at = ?
    WHERE id = ?
  `).run(
    normalizedKind,
    String(titleAr || '').trim(),
    String(categoryAr || '').trim(),
    String(descriptionAr || '').trim(),
    String(goalAr || '').trim(),
    String(imageUrl || '').trim(),
    Number(targetBudget || 0),
    String(fundType || 'general'),
    String(startDate || ''),
    String(endDate || ''),
    managerPersonId ? Number(managerPersonId) : null,
    String(status || 'open'),
    isPublic ? 1 : 0,
    now,
    projectId
  );

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'UPDATE_PROJECT',
    entityType: 'project',
    entityId: projectId,
    details: { titleAr, status },
    ipAddress: req.ip,
  });

  res.json({ ok: true, message: 'تم تحديث بيانات المشروع بنجاح' });
});

projectsAndCasesRouter.post('/projects/:id/updates', requirePermission('projects', 'edit'), uploadMiddleware.single('photo'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const projectId = Number(req.params.id);
  const proj = db.prepare('SELECT id, title_ar FROM projects WHERE id = ? AND is_archived = 0').get(projectId) as
    | { id: number; title_ar: string }
    | undefined;
  if (!proj) return res.status(404).json({ error: 'المشروع غير موجود' });

  const { titleAr, detailsAr, progressPercent } = req.body || {};
  if (!titleAr || !detailsAr) {
    return res.status(400).json({ error: 'يرجى إدخال عنوان وتفاصيل التحديث' });
  }

  const fileId = req.file ? saveStoredFile(req.file, 'project_update', actor.userId, null) : null;
  const now = new Date().toISOString();
  const r = db
    .prepare(`
      INSERT INTO project_updates (project_id, title_ar, details_ar, progress_percent, file_id, created_by_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(projectId, String(titleAr).trim(), String(detailsAr).trim(), Math.min(100, Math.max(0, Number(progressPercent || 0))), fileId, actor.userId, now);

  if (fileId) {
    db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(Number(r.lastInsertRowid), fileId);
  }

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'ADD_PROJECT_UPDATE',
    entityType: 'project',
    entityId: projectId,
    details: { titleAr, progressPercent },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, message: 'تم نشر تقرير الإنجاز للمشروع' });
});

projectsAndCasesRouter.delete('/projects/:id', requirePermission('projects', 'soft_delete'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const projectId = Number(req.params.id);
  db.prepare('UPDATE projects SET is_archived = 1, is_public = 0, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    projectId
  );
  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'ARCHIVE_PROJECT',
    entityType: 'project',
    entityId: projectId,
    ipAddress: req.ip,
  });
  res.json({ ok: true, message: 'تمت أرشفة المشروع مع الاحتفاظ بالسجلات المالية المرتبطة' });
});

// =======================
// HUMANITARIAN CASES & BENEFICIARIES (Protected PII!)
// =======================
projectsAndCasesRouter.get('/cases', requirePermission('beneficiaries', 'view'), (req: AuthedRequest, res) => {
  const { status, priority, q } = req.query;
  const conditions: string[] = ['c.is_archived = 0'];
  const params: unknown[] = [];

  if (status && status !== 'all') {
    conditions.push('c.status = ?');
    params.push(String(status));
  }
  if (priority && priority !== 'all') {
    conditions.push('c.priority = ?');
    params.push(String(priority));
  }
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conditions.push('(p.full_name LIKE ? OR p.phone LIKE ? OR c.file_number LIKE ? OR c.case_type LIKE ?)');
    params.push(term, term, term, term);
  }

  const cases = db
    .prepare(`
      SELECT
        c.*,
        p.full_name AS beneficiary_name,
        p.phone AS beneficiary_phone,
        p.area AS beneficiary_area,
        p.address AS beneficiary_address,
        a.full_name AS assigned_staff_name,
        (SELECT COUNT(*) FROM aids ad WHERE ad.case_id = c.id) AS aids_count,
        (SELECT COALESCE(SUM(ad.amount), 0) FROM aids ad WHERE ad.case_id = c.id AND ad.status IN ('approved', 'disbursed')) AS total_aids_amount
      FROM humanitarian_cases c
      JOIN persons p ON p.id = c.beneficiary_person_id
      LEFT JOIN persons a ON a.id = c.assigned_person_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.updated_at DESC
    `)
    .all(...params);

  const docs = db
    .prepare(`
      SELECT cd.*, sf.original_name, sf.mime_type
      FROM case_documents cd
      JOIN stored_files sf ON sf.id = cd.file_id
      ORDER BY cd.created_at DESC
    `)
    .all();

  res.json({ cases, documents: docs });
});

projectsAndCasesRouter.post('/cases', requirePermission('beneficiaries', 'create'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const {
    beneficiaryPersonId,
    newBeneficiary,
    caseType,
    descriptionAr,
    priority,
    familySize,
    requestedAmount,
    assignedPersonId,
  } = req.body || {};

  if (!caseType || !descriptionAr) {
    return res.status(400).json({ error: 'يرجى تحديد نوع الحالة ووصفها' });
  }

  const now = new Date().toISOString();

  try {
    const created = db.transaction(() => {
      let targetBeneficiaryId = beneficiaryPersonId ? Number(beneficiaryPersonId) : 0;
      if (!targetBeneficiaryId && newBeneficiary) {
        if (!newBeneficiary.fullName || !newBeneficiary.phone) {
          throw new Error('BENEFICIARY_FIELDS_REQUIRED');
        }
        const pr = db
          .prepare(`
            INSERT INTO persons (
              full_name, phone, national_id, address, area, person_type, status,
              created_by_user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'beneficiary', 'active', ?, ?, ?)
          `)
          .run(
            String(newBeneficiary.fullName).trim(),
            String(newBeneficiary.phone).trim(),
            String(newBeneficiary.nationalId || '').trim(),
            String(newBeneficiary.address || '').trim(),
            String(newBeneficiary.area || '').trim(),
            actor.userId,
            now,
            now
          );
        targetBeneficiaryId = Number(pr.lastInsertRowid);
      }

      if (!targetBeneficiaryId) {
        throw new Error('BENEFICIARY_REQUIRED');
      }

      const fileNumber = nextSequentialCode('CASE', 'humanitarian_cases', 'file_number');
      const r = db
        .prepare(`
          INSERT INTO humanitarian_cases (
            file_number, beneficiary_person_id, case_type, description_ar, priority,
            family_size, requested_amount, status, assigned_person_id, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)
        `)
        .run(
          fileNumber,
          targetBeneficiaryId,
          String(caseType).trim(),
          String(descriptionAr).trim(),
          ['low', 'medium', 'high', 'urgent'].includes(String(priority)) ? String(priority) : 'medium',
          Math.max(1, Number(familySize || 1)),
          Math.max(0, Number(requestedAmount || 0)),
          assignedPersonId ? Number(assignedPersonId) : actor.personId,
          actor.userId,
          now,
          now
        );

      return { caseId: Number(r.lastInsertRowid), fileNumber };
    })();

    createNotificationForPermission({
      permissionKey: 'beneficiaries:approve',
      titleAr: 'حالة إنسانية جديدة مسجلة',
      messageAr: `تم تسجيل ملف حالة إنسانية جديد (${created.fileNumber}) - ${caseType}.`,
      category: 'info',
      linkTab: 'cases',
      entityType: 'case',
      entityId: created.caseId,
      excludeUserId: actor.userId,
    });

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: 'CREATE_CASE',
      entityType: 'case',
      entityId: created.caseId,
      details: { fileNumber: created.fileNumber, caseType },
      ipAddress: req.ip,
    });

    res.status(201).json({ ok: true, id: created.caseId, fileNumber: created.fileNumber, message: 'تم فتح ملف الحالة الإنسانية بنجاح' });
  } catch (err: unknown) {
    if (err instanceof Error && (err.message === 'BENEFICIARY_REQUIRED' || err.message === 'BENEFICIARY_FIELDS_REQUIRED')) {
      return res.status(400).json({ error: 'يرجى اختيار مستفيد أو إدخال بيانات المستفيد الجديد (الاسم والهاتف)' });
    }
    console.error('Create case error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء فتح ملف الحالة' });
  }
});

projectsAndCasesRouter.put('/cases/:id', requirePermission('beneficiaries', 'edit'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const caseId = Number(req.params.id);
  const existing = db.prepare('SELECT id, status FROM humanitarian_cases WHERE id = ? AND is_archived = 0').get(caseId) as
    | { id: number; status: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'ملف الحالة غير موجود' });

  const { caseType, descriptionAr, priority, familySize, requestedAmount, status, assignedPersonId } = req.body || {};

  if (status === 'approved' && !userHasPermission(actor, 'beneficiaries', 'approve')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية اعتماد الحالات' });
  }
  if (status === 'rejected' && !userHasPermission(actor, 'beneficiaries', 'reject')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية رفض الحالات' });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE humanitarian_cases SET
      case_type = ?, description_ar = ?, priority = ?, family_size = ?,
      requested_amount = ?, status = ?, assigned_person_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    String(caseType || '').trim(),
    String(descriptionAr || '').trim(),
    String(priority || 'medium'),
    Math.max(1, Number(familySize || 1)),
    Math.max(0, Number(requestedAmount || 0)),
    ['new', 'under_research', 'approved', 'rejected', 'assisted', 'closed'].includes(String(status)) ? String(status) : existing.status,
    assignedPersonId ? Number(assignedPersonId) : null,
    now,
    caseId
  );

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'UPDATE_CASE',
    entityType: 'case',
    entityId: caseId,
    details: { status },
    ipAddress: req.ip,
  });

  res.json({ ok: true, message: 'تم تحديث بيانات الحالة الإنسانية' });
});

projectsAndCasesRouter.post('/cases/:id/documents', requirePermission('beneficiaries', 'edit'), uploadMiddleware.single('document'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const caseId = Number(req.params.id);
  const c = db.prepare('SELECT id, beneficiary_person_id FROM humanitarian_cases WHERE id = ?').get(caseId) as
    | { id: number; beneficiary_person_id: number }
    | undefined;
  if (!c) return res.status(404).json({ error: 'الحالة غير موجودة' });
  if (!req.file) return res.status(400).json({ error: 'يرجى إرفاق ملف المستند أو الصورة' });

  const fileId = saveStoredFile(req.file, 'case_document', actor.userId, c.beneficiary_person_id);
  db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(caseId, fileId);
  db.prepare(`
    INSERT INTO case_documents (case_id, title_ar, file_id, uploaded_by_user_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(caseId, String(req.body?.titleAr || req.file.originalname).trim(), fileId, actor.userId, new Date().toISOString());

  res.status(201).json({ ok: true, fileId, message: 'تم رفع المستند وحفظه في التخزين المحمي بنجاح' });
});

// =======================
// AIDS MANAGEMENT
// =======================
projectsAndCasesRouter.get('/aids', requirePermission('aids', 'view'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const canSeeBeneficiaryPII = userHasPermission(actor, 'beneficiaries', 'view');

  const aids = db
    .prepare(`
      SELECT
        a.*,
        c.file_number AS case_file_number,
        c.case_type,
        ${canSeeBeneficiaryPII ? 'p.full_name AS beneficiary_name, p.phone AS beneficiary_phone,' : "'مستفيد محمي' AS beneficiary_name, '' AS beneficiary_phone,"}
        pr.title_ar AS project_title,
        fa.name_ar AS account_name,
        inv.name_ar AS item_name,
        inv.unit_ar AS item_unit,
        rp.full_name AS responsible_name,
        sf.original_name AS attachment_name
      FROM aids a
      JOIN humanitarian_cases c ON c.id = a.case_id
      JOIN persons p ON p.id = a.beneficiary_person_id
      LEFT JOIN projects pr ON pr.id = a.project_id
      LEFT JOIN financial_accounts fa ON fa.id = a.financial_account_id
      LEFT JOIN inventory_items inv ON inv.id = a.inventory_item_id
      LEFT JOIN persons rp ON rp.id = a.responsible_person_id
      LEFT JOIN stored_files sf ON sf.id = a.attachment_file_id
      ORDER BY a.created_at DESC
    `)
    .all();

  res.json({ aids });
});

projectsAndCasesRouter.post('/aids', requirePermission('aids', 'create'), uploadMiddleware.single('attachment'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const {
    caseId,
    aidType,
    deliveryMode,
    amount,
    inventoryItemId,
    quantity,
    fundingSourceLabel,
    financialAccountId,
    projectId,
    isZakat,
    aidDate,
    responsiblePersonId,
    notes,
  } = req.body || {};

  const c = db.prepare('SELECT id, beneficiary_person_id FROM humanitarian_cases WHERE id = ? AND is_archived = 0').get(Number(caseId)) as
    | { id: number; beneficiary_person_id: number }
    | undefined;
  if (!c) return res.status(404).json({ error: 'ملف الحالة غير موجود' });

  const mode = deliveryMode === 'in_kind' ? 'in_kind' : 'financial';
  const numAmount = Number(amount || 0);
  const numQty = Number(quantity || 0);

  if (mode === 'financial' && (!Number.isFinite(numAmount) || numAmount <= 0)) {
    return res.status(400).json({ error: 'يرجى إدخال قيمة المساعدة المالية' });
  }
  if (mode === 'in_kind' && (!inventoryItemId || !Number.isFinite(numQty) || numQty <= 0)) {
    return res.status(400).json({ error: 'يرجى تحديد الصنف المخزني والكمية' });
  }

  const now = new Date().toISOString();
  const aidNumber = nextSequentialCode('AID', 'aids', 'aid_number');
  const attachmentFileId = req.file ? saveStoredFile(req.file, 'aid_document', actor.userId, c.beneficiary_person_id) : null;

  const r = db
    .prepare(`
      INSERT INTO aids (
        aid_number, case_id, beneficiary_person_id, aid_type, delivery_mode, amount,
        inventory_item_id, quantity, funding_source_label, financial_account_id, project_id,
        is_zakat, aid_date, responsible_person_id, attachment_file_id, notes, status,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `)
    .run(
      aidNumber,
      c.id,
      c.beneficiary_person_id,
      String(aidType || 'financial'),
      mode,
      numAmount,
      inventoryItemId ? Number(inventoryItemId) : null,
      numQty,
      String(fundingSourceLabel || '').trim(),
      financialAccountId ? Number(financialAccountId) : null,
      projectId ? Number(projectId) : null,
      isZakat === true || isZakat === 'true' || isZakat === '1' ? 1 : 0,
      String(aidDate || now.slice(0, 10)).trim(),
      responsiblePersonId ? Number(responsiblePersonId) : actor.personId,
      attachmentFileId,
      String(notes || '').trim(),
      actor.userId,
      now,
      now
    );

  const aidId = Number(r.lastInsertRowid);
  if (attachmentFileId) {
    db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(aidId, attachmentFileId);
  }

  createNotificationForPermission({
    permissionKey: 'aids:approve',
    titleAr: 'طلب مساعدة جديد بانتظار الاعتماد',
    messageAr: `تم تسجيل طلب مساعدة (${aidNumber}) بواسطة ${actor.fullName} ويحتاج إلى مراجعة واعتماد.`,
    category: 'warning',
    linkTab: 'aids',
    entityType: 'aid',
    entityId: aidId,
    excludeUserId: actor.userId,
  });

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CREATE_AID_REQUEST',
    entityType: 'aid',
    entityId: aidId,
    details: { aidNumber, mode, amount: numAmount, quantity: numQty },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, id: aidId, aidNumber, message: 'تم تسجيل طلب المساعدة وإحالته للاعتماد' });
});

projectsAndCasesRouter.post('/aids/:id/action', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const aidId = Number(req.params.id);
  const { action, financialAccountId } = req.body || {};

  if (!['approved', 'disbursed', 'rejected'].includes(String(action))) {
    return res.status(400).json({ error: 'إجراء غير صالح' });
  }
  if (action === 'rejected' && !userHasPermission(actor, 'aids', 'reject')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية رفض المساعدات' });
  }
  if (['approved', 'disbursed'].includes(String(action)) && !userHasPermission(actor, 'aids', 'approve')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية اعتماد وصرف المساعدات' });
  }

  const aid = db.prepare('SELECT * FROM aids WHERE id = ?').get(aidId) as Record<string, unknown> | undefined;
  if (!aid) return res.status(404).json({ error: 'المساعدة غير موجودة' });
  if (aid.status === 'disbursed' || aid.status === 'rejected') {
    return res.status(400).json({ error: 'تم البت في هذا الطلب مسبقًا' });
  }

  const now = new Date().toISOString();

  try {
    db.transaction(() => {
      if (action === 'rejected') {
        db.prepare("UPDATE aids SET status = 'rejected', updated_at = ? WHERE id = ?").run(now, aidId);
        return;
      }

      if (action === 'approved') {
        db.prepare("UPDATE aids SET status = 'approved', approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?").run(
          actor.userId,
          now,
          now,
          aidId
        );
        return;
      }

      // action === 'disbursed': execute financial disbursement or warehouse outbound
      if (aid.delivery_mode === 'financial') {
        const targetAccId = Number(financialAccountId || aid.financial_account_id);
        if (!targetAccId) throw new Error('ACCOUNT_REQUIRED');

        const account = db.prepare('SELECT * FROM financial_accounts WHERE id = ? AND is_active = 1').get(targetAccId) as
          | { id: number; name_ar: string; current_balance: number; fund_type: string }
          | undefined;
        if (!account) throw new Error('ACCOUNT_NOT_FOUND');

        const aidAmount = Number(aid.amount);
        if (account.current_balance < aidAmount) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
        if (Boolean(aid.is_zakat) === false && account.fund_type === 'zakat') {
          throw new Error('ZAKAT_ONLY_ACCOUNT');
        }

        const newBalance = Math.round((account.current_balance - aidAmount) * 100) / 100;
        db.prepare('UPDATE financial_accounts SET current_balance = ?, updated_at = ? WHERE id = ?').run(
          newBalance,
          now,
          account.id
        );

        const voucherNumber = nextSequentialCode('PV', 'expenses', 'voucher_number');
        const expRes = db
          .prepare(`
            INSERT INTO expenses (
              voucher_number, title_ar, category_ar, amount, expense_date, project_id, case_id,
              financial_account_id, is_zakat_expense, beneficiary_or_vendor, description_ar,
              status, created_by_user_id, approved_by_user_id, approved_at, paid_at, created_at, updated_at
            ) VALUES (?, ?, 'مساعدات إنسانية', ?, ?, ?, ?, ?, ?, 'مستفيد حالة إنسانية', ?, 'paid', ?, ?, ?, ?, ?, ?)
          `)
          .run(
            voucherNumber,
            `صرف مساعدة (${aid.aid_number})`,
            aidAmount,
            now.slice(0, 10),
            aid.project_id ?? null,
            aid.case_id,
            account.id,
            aid.is_zakat ? 1 : 0,
            `صرف مساعدة معتمدة رقم ${aid.aid_number}`,
            actor.userId,
            actor.userId,
            now,
            now,
            now,
            now
          );

        const entryNumber = nextSequentialCode('PVT', 'financial_transactions', 'entry_number');
        db.prepare(`
          INSERT INTO financial_transactions (
            entry_number, entry_type, account_id, direction, amount, balance_after,
            reference_type, reference_id, project_id, description_ar, transaction_date,
            created_by_user_id, created_at
          ) VALUES (?, 'payment_voucher', ?, 'debit', ?, ?, 'expense', ?, ?, ?, ?, ?, ?)
        `).run(
          entryNumber,
          account.id,
          aidAmount,
          newBalance,
          Number(expRes.lastInsertRowid),
          aid.project_id ?? null,
          `سند صرف مساعدة إنسانية (${aid.aid_number})`,
          now.slice(0, 10),
          actor.userId,
          now
        );

        db.prepare(
          "UPDATE aids SET status = 'disbursed', financial_account_id = ?, approved_by_user_id = COALESCE(approved_by_user_id, ?), approved_at = COALESCE(approved_at, ?), disbursed_at = ?, updated_at = ? WHERE id = ?"
        ).run(account.id, actor.userId, now, now, now, aidId);
      } else {
        // In-kind disbursement from warehouse
        const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(aid.inventory_item_id) as
          | { id: number; name_ar: string; current_qty: number; min_threshold: number }
          | undefined;
        if (!item) throw new Error('ITEM_NOT_FOUND');
        const qty = Number(aid.quantity);
        if (item.current_qty < qty) throw new Error('INSUFFICIENT_STOCK');

        const qtyAfter = Math.round((item.current_qty - qty) * 100) / 100;
        db.prepare('UPDATE inventory_items SET current_qty = ?, updated_at = ? WHERE id = ?').run(qtyAfter, now, item.id);

        const moveNumber = nextSequentialCode('MOV', 'inventory_movements', 'movement_number');
        db.prepare(`
          INSERT INTO inventory_movements (
            movement_number, item_id, movement_type, quantity, qty_after, movement_date,
            source_or_recipient, case_id, responsible_person_id, notes, created_by_user_id, created_at
          ) VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          moveNumber,
          item.id,
          qty,
          qtyAfter,
          now.slice(0, 10),
          `صرف مساعدة (${aid.aid_number})`,
          aid.case_id,
          aid.responsible_person_id ?? actor.personId,
          `صرف عيني لمساعدة معتمدة رقم ${aid.aid_number}`,
          actor.userId,
          now
        );

        if (qtyAfter <= item.min_threshold) {
          createNotificationForPermission({
            permissionKey: 'warehouse:view',
            titleAr: `تنبيه انخفاض المخزون: ${item.name_ar}`,
            messageAr: `الرصيد الحالي للصنف (${item.name_ar}) بلغ ${qtyAfter} وهو عند حد إعادة الطلب (${item.min_threshold}).`,
            category: 'warning',
            linkTab: 'warehouse',
            entityType: 'inventory_item',
            entityId: item.id,
          });
        }

        db.prepare(
          "UPDATE aids SET status = 'disbursed', approved_by_user_id = COALESCE(approved_by_user_id, ?), approved_at = COALESCE(approved_at, ?), disbursed_at = ?, updated_at = ? WHERE id = ?"
        ).run(actor.userId, now, now, now, aidId);
      }

      db.prepare("UPDATE humanitarian_cases SET status = 'assisted', updated_at = ? WHERE id = ?").run(now, aid.case_id);
    })();

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: `AID_${String(action).toUpperCase()}`,
      entityType: 'aid',
      entityId: aidId,
      details: { aidNumber: aid.aid_number },
      ipAddress: req.ip,
    });

    res.json({ ok: true, message: action === 'disbursed' ? 'تم اعتماد وصرف المساعدة وتحديث السجلات بنجاح' : 'تم تحديث حالة المساعدة' });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'ACCOUNT_REQUIRED') return res.status(400).json({ error: 'يرجى تحديد الحساب المالي أو الخزينة للصرف' });
      if (err.message === 'ACCOUNT_NOT_FOUND') return res.status(400).json({ error: 'الحساب المالي غير موجود أو موقوف' });
      if (err.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'الرصيد المتاح في الحساب المالي غير كافٍ للصرف' });
      if (err.message === 'ZAKAT_ONLY_ACCOUNT') return res.status(400).json({ error: 'لا يجوز الصرف من حساب الزكاة لمساعدة غير مخصصة للزكاة' });
      if (err.message === 'INSUFFICIENT_STOCK') return res.status(400).json({ error: 'الكمية المتوفرة بالمخزن غير كافية للصرف' });
    }
    console.error('Aid action error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ إجراء المساعدة' });
  }
});

// =======================
// ZAKAT & KAFALAT
// =======================
projectsAndCasesRouter.get('/zakat', requirePermission('zakat', 'view'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const canSeeBeneficiaryPII = userHasPermission(actor, 'beneficiaries', 'view');

  const programs = db
    .prepare(`
      SELECT
        z.*,
        ${canSeeBeneficiaryPII ? 'bp.full_name AS beneficiary_name,' : "'مستفيد محمي' AS beneficiary_name,"}
        dp.full_name AS donor_name,
        pr.title_ar AS project_title,
        hc.file_number AS case_file_number
      FROM zakat_kafalat z
      LEFT JOIN persons bp ON bp.id = z.beneficiary_person_id
      LEFT JOIN persons dp ON dp.id = z.donor_person_id
      LEFT JOIN projects pr ON pr.id = z.project_id
      LEFT JOIN humanitarian_cases hc ON hc.id = z.case_id
      ORDER BY z.created_at DESC
    `)
    .all();

  const zakatTotals = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN donation_type = 'zakat_mal' AND status = 'approved' THEN amount ELSE 0 END), 0) AS zakat_mal_approved,
        COALESCE(SUM(CASE WHEN donation_type = 'zakat_fitr' AND status = 'approved' THEN amount ELSE 0 END), 0) AS zakat_fitr_approved,
        COALESCE(SUM(CASE WHEN donation_type = 'sadaqah' AND status = 'approved' THEN amount ELSE 0 END), 0) AS sadaqah_approved,
        COALESCE(SUM(CASE WHEN donation_type = 'kaffarah' AND status = 'approved' THEN amount ELSE 0 END), 0) AS kaffarah_approved,
        COALESCE(SUM(CASE WHEN donation_type = 'recurring' AND status = 'approved' THEN amount ELSE 0 END), 0) AS recurring_approved
      FROM donations
    `)
    .get() as Record<string, number>;

  const zakatExpenses = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE is_zakat_expense = 1 AND status IN ('approved', 'paid')")
    .get() as { total: number };

  const zakatAccounts = db
    .prepare("SELECT id, name_ar, current_balance FROM financial_accounts WHERE fund_type = 'zakat' AND is_active = 1")
    .all();

  res.json({ programs, totals: { ...zakatTotals, zakat_expenses_total: zakatExpenses.total }, zakatAccounts });
});

projectsAndCasesRouter.post('/zakat', requirePermission('zakat', 'create'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const { programType, titleAr, beneficiaryPersonId, caseId, donorPersonId, projectId, monthlyAmount, purposeAr, startDate, notes } =
    req.body || {};

  if (!programType || !titleAr) {
    return res.status(400).json({ error: 'يرجى تحديد نوع البرنامج وعنوانه' });
  }

  const now = new Date().toISOString();
  const code = nextSequentialCode('ZKT', 'zakat_kafalat', 'program_code');

  const r = db
    .prepare(`
      INSERT INTO zakat_kafalat (
        program_code, program_type, title_ar, beneficiary_person_id, case_id, donor_person_id,
        project_id, monthly_amount, purpose_ar, start_date, status, notes,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `)
    .run(
      code,
      String(programType),
      String(titleAr).trim(),
      beneficiaryPersonId ? Number(beneficiaryPersonId) : null,
      caseId ? Number(caseId) : null,
      donorPersonId ? Number(donorPersonId) : null,
      projectId ? Number(projectId) : null,
      Math.max(0, Number(monthlyAmount || 0)),
      String(purposeAr || '').trim(),
      String(startDate || now.slice(0, 10)).trim(),
      String(notes || '').trim(),
      actor.userId,
      now,
      now
    );

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CREATE_ZAKAT_KAFALA',
    entityType: 'zakat_kafalat',
    entityId: Number(r.lastInsertRowid),
    details: { code, programType, titleAr },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, id: Number(r.lastInsertRowid), programCode: code, message: 'تمت إضافة برنامج الزكاة / الكفالة بنجاح' });
});

projectsAndCasesRouter.put('/zakat/:id', requirePermission('zakat', 'edit'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const id = Number(req.params.id);
  const { status, monthlyAmount, notes } = req.body || {};
  db.prepare('UPDATE zakat_kafalat SET status = ?, monthly_amount = ?, notes = ?, updated_at = ? WHERE id = ?').run(
    String(status || 'active'),
    Math.max(0, Number(monthlyAmount || 0)),
    String(notes || '').trim(),
    new Date().toISOString(),
    id
  );
  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'UPDATE_ZAKAT_KAFALA',
    entityType: 'zakat_kafalat',
    entityId: id,
    details: { status },
    ipAddress: req.ip,
  });
  res.json({ ok: true, message: 'تم تحديث السجل بنجاح' });
});
