import { Router } from 'express';
import {
  hashPassword,
  logAudit,
  requireAuth,
  requirePermission,
  revokeUserSessions,
  userHasPermission,
  type AuthedRequest,
} from '../auth.ts';
import { db } from '../db.ts';
import { PERMISSION_CATALOG } from '../permissions.ts';
import { normalizeEmail, normalizePhone } from '../validation.ts';

export const peopleAndRolesRouter = Router();

// List people with search & filters (type, department, status)
peopleAndRolesRouter.get('/people', requireAuth, (req: AuthedRequest, res) => {
  const user = req.authUser!;
  const canViewPeople = userHasPermission(user, 'people', 'view');
  const canViewStaff = userHasPermission(user, 'staff', 'view');
  const canViewBeneficiaries = userHasPermission(user, 'beneficiaries', 'view');
  const canViewDonations = userHasPermission(user, 'donations', 'view');

  if (!canViewPeople && !canViewStaff && !canViewBeneficiaries && !canViewDonations) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية عرض دليل الأشخاص' });
  }

  const { type, department, status, q } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type && type !== 'all') {
    conditions.push('p.person_type = ?');
    params.push(String(type));
  }
  if (department && department !== 'all') {
    conditions.push('p.department = ?');
    params.push(String(department));
  }
  if (status && status !== 'all') {
    conditions.push('p.status = ?');
    params.push(String(status));
  } else {
    conditions.push("p.status != 'archived'");
  }
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    conditions.push('(p.full_name LIKE ? OR p.phone LIKE ? OR COALESCE(u.username, \'\') LIKE ?)');
    params.push(term, term, term);
  }

  // Scope restriction if user doesn't have broad people:view
  if (!canViewPeople) {
    const allowedTypes: string[] = [];
    if (canViewStaff) allowedTypes.push("'employee'", "'volunteer'", "'official'");
    if (canViewBeneficiaries) allowedTypes.push("'beneficiary'");
    if (canViewDonations) allowedTypes.push("'donor'");
    if (allowedTypes.length === 0) {
      return res.status(403).json({ error: 'غير مصرح' });
    }
    conditions.push(`p.person_type IN (${allowedTypes.join(',')})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`
      SELECT
        p.*,
        u.id AS user_id,
        u.username,
        u.status AS account_status,
        u.must_change_password,
        u.last_login_at,
        r.id AS role_id,
        r.role_key,
        r.name_ar AS role_name_ar,
        m.full_name AS manager_name
      FROM persons p
      LEFT JOIN users u ON u.person_id = p.id
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN persons m ON m.id = p.manager_person_id
      ${whereClause}
      ORDER BY p.created_at DESC
    `)
    .all(...params);

  res.json({ people: rows });
});

// Single person profile + full transaction/interaction log
peopleAndRolesRouter.get('/people/:id', requireAuth, (req: AuthedRequest, res) => {
  const user = req.authUser!;
  const personId = Number(req.params.id);
  const person = db
    .prepare(`
      SELECT
        p.*,
        u.id AS user_id, u.username, u.status AS account_status, u.last_login_at,
        r.id AS role_id, r.role_key, r.name_ar AS role_name_ar,
        m.full_name AS manager_name
      FROM persons p
      LEFT JOIN users u ON u.person_id = p.id
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN persons m ON m.id = p.manager_person_id
      WHERE p.id = ?
    `)
    .get(personId) as Record<string, unknown> | undefined;

  if (!person) {
    return res.status(404).json({ error: 'الشخص غير موجود' });
  }

  const pType = String(person.person_type);
  const allowed =
    userHasPermission(user, 'people', 'view') ||
    (pType === 'beneficiary' && userHasPermission(user, 'beneficiaries', 'view')) ||
    (pType === 'donor' && userHasPermission(user, 'donations', 'view')) ||
    (['employee', 'volunteer', 'official'].includes(pType) && userHasPermission(user, 'staff', 'view'));

  if (!allowed) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية الاطلاع على ملف هذا الشخص' });
  }

  const donations =
    pType === 'donor' && (userHasPermission(user, 'donations', 'view') || userHasPermission(user, 'people', 'view'))
      ? db
          .prepare(`
            SELECT d.*, pr.title_ar AS project_title, rc.receipt_number
            FROM donations d
            LEFT JOIN projects pr ON pr.id = d.project_id
            LEFT JOIN receipts rc ON rc.donation_id = d.id
            WHERE d.donor_person_id = ?
            ORDER BY d.created_at DESC
          `)
          .all(personId)
      : [];

  const cases =
    pType === 'beneficiary' && userHasPermission(user, 'beneficiaries', 'view')
      ? db.prepare('SELECT * FROM humanitarian_cases WHERE beneficiary_person_id = ? ORDER BY created_at DESC').all(personId)
      : [];

  const aids =
    pType === 'beneficiary' && userHasPermission(user, 'aids', 'view')
      ? db.prepare('SELECT * FROM aids WHERE beneficiary_person_id = ? ORDER BY created_at DESC').all(personId)
      : [];

  const staffActions =
    person.user_id && (userHasPermission(user, 'staff', 'view') || userHasPermission(user, 'audit', 'view'))
      ? db
          .prepare('SELECT * FROM audit_logs WHERE actor_user_id = ? ORDER BY created_at DESC LIMIT 50')
          .all(person.user_id)
      : [];

  res.json({ person, donations, cases, aids, staffActions });
});

// Create new person (and optionally create user account - strictly controlled!)
peopleAndRolesRouter.post('/people', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const {
    fullName,
    phone,
    nationalId,
    email,
    address,
    area,
    personType,
    department,
    jobTitle,
    joinDate,
    managerPersonId,
    notes,
    createAccount,
    username,
    password,
    roleId,
  } = req.body || {};

  const allowedPersonTypes = ['donor', 'employee', 'volunteer', 'beneficiary', 'official'];
  if (!personType || !allowedPersonTypes.includes(String(personType))) {
    return res.status(400).json({ error: 'نوع الشخص غير صالح' });
  }

  // Enforce granular permission for creating person
  const canCreateAny = userHasPermission(actor, 'people', 'create');
  const canCreateBeneficiary = personType === 'beneficiary' && userHasPermission(actor, 'beneficiaries', 'create');
  const canCreateStaff = ['employee', 'volunteer', 'official'].includes(personType) && userHasPermission(actor, 'staff', 'create');

  if (!canCreateAny && !canCreateBeneficiary && !canCreateStaff) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية إضافة أشخاص في هذا القسم' });
  }

  // Creating login account requires Super Admin OR explicit people:create + staff:create
  if (createAccount) {
    const canCreateLogin =
      actor.roleKey === 'super_admin' ||
      (userHasPermission(actor, 'people', 'create') && userHasPermission(actor, 'staff', 'create'));
    if (!canCreateLogin) {
      return res.status(403).json({ error: 'ممنوع: إنشاء حسابات الدخول مقتصر على المدير الرئيسي أو من يفوضه بصلاحية إنشاء الحسابات' });
    }
    if (personType === 'beneficiary') {
      return res.status(400).json({ error: 'حسابات الدخول مخصصة للإدارة والموظفين والمتبرعين فقط' });
    }
    if (!username || !/^[a-zA-Z0-9._-]{3,40}$/.test(String(username).trim())) {
      return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون باللغة الإنجليزية من 3 إلى 40 حرفًا' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'كلمة المرور المؤقتة يجب ألا تقل عن 6 أحرف' });
    }
  }

  if (!fullName || String(fullName).trim().length < 2) {
    return res.status(400).json({ error: 'يرجى إدخال الاسم الكامل' });
  }
  if (!phone || String(phone).trim().length < 6) {
    return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف' });
  }

  try {
    const created = db.transaction(() => {
      const now = new Date().toISOString();
      const normalizedPhone = normalizePhone(String(phone || ''));
      const cleanEmail = normalizeEmail(String(email || ''));
      const personRes = db
        .prepare(`
          INSERT INTO persons (
            full_name, phone, normalized_phone, national_id, email, address, area, person_type,
            department, job_title, join_date, manager_person_id, notes, status,
            created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
        `)
        .run(
          String(fullName).trim(),
          String(phone).trim(),
          normalizedPhone,
          String(nationalId || '').trim(),
          cleanEmail,
          String(address || '').trim(),
          String(area || '').trim(),
          String(personType),
          String(department || '').trim(),
          String(jobTitle || '').trim(),
          String(joinDate || now.slice(0, 10)).trim(),
          managerPersonId ? Number(managerPersonId) : null,
          String(notes || '').trim(),
          actor.userId,
          now,
          now
        );

      const personId = Number(personRes.lastInsertRowid);
      let userId: number | null = null;

      if (createAccount) {
        let targetRole: { id: number; role_key: string } | undefined;
        if (personType === 'donor') {
          targetRole = db.prepare("SELECT id, role_key FROM roles WHERE role_key = 'donor'").get() as
            | { id: number; role_key: string }
            | undefined;
        } else {
          if (!roleId) {
            throw new Error('ROLE_REQUIRED');
          }
          targetRole = db.prepare('SELECT id, role_key FROM roles WHERE id = ?').get(Number(roleId)) as
            | { id: number; role_key: string }
            | undefined;
        }

        if (!targetRole) {
          throw new Error('INVALID_ROLE');
        }
        if (targetRole.role_key === 'super_admin' && actor.roleKey !== 'super_admin') {
          throw new Error('FORBIDDEN_SUPER_ADMIN_ASSIGN');
        }

        const userRes = db
          .prepare(`
            INSERT INTO users (
              person_id, username, password_hash, role_id, status, must_change_password,
              created_by_user_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'active', 1, ?, ?, ?)
          `)
          .run(
            personId,
            String(username).trim().toLowerCase(),
            hashPassword(String(password)),
            targetRole.id,
            actor.userId,
            now,
            now
          );
        userId = Number(userRes.lastInsertRowid);
      }

      return { personId, userId };
    })();

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: 'CREATE_PERSON',
      entityType: 'person',
      entityId: created.personId,
      details: { personType, fullName, withAccount: Boolean(created.userId) },
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: created.userId ? 'تمت إضافة الشخص وإنشاء حساب الدخول بنجاح' : 'تمت إضافة الشخص بنجاح',
      ...created,
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'ROLE_REQUIRED') {
        return res.status(400).json({ error: 'يرجى تحديد الدور الوظيفي للحساب' });
      }
      if (err.message === 'INVALID_ROLE') {
        return res.status(400).json({ error: 'الدور الوظيفي المحدد غير موجود' });
      }
      if (err.message === 'FORBIDDEN_SUPER_ADMIN_ASSIGN') {
        return res.status(403).json({ error: 'ممنوع: لا يمكن لغير المدير الرئيسي منح دور المدير الرئيسي' });
      }
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'اسم المستخدم مسجل مسبقًا' });
      }
    }
    console.error('Create person error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ البيانات' });
  }
});

// Update person & optionally role/account details
peopleAndRolesRouter.put('/people/:id', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const personId = Number(req.params.id);
  const existing = db
    .prepare(`
      SELECT p.*, u.id AS user_id, u.role_id, r.role_key
      FROM persons p
      LEFT JOIN users u ON u.person_id = p.id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE p.id = ?
    `)
    .get(personId) as
    | {
        id: number;
        person_type: string;
        user_id: number | null;
        role_id: number | null;
        role_key: string | null;
      }
    | undefined;

  if (!existing) {
    return res.status(404).json({ error: 'الشخص غير موجود' });
  }

  const canEdit =
    userHasPermission(actor, 'people', 'edit') ||
    (existing.person_type === 'beneficiary' && userHasPermission(actor, 'beneficiaries', 'edit')) ||
    (['employee', 'volunteer', 'official'].includes(existing.person_type) && userHasPermission(actor, 'staff', 'edit'));

  if (!canEdit) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية تعديل بيانات هذا الشخص' });
  }

  if (existing.role_key === 'super_admin' && actor.roleKey !== 'super_admin') {
    return res.status(403).json({ error: 'ممنوع: لا يمكن تعديل حساب المدير الرئيسي' });
  }

  const {
    fullName,
    phone,
    nationalId,
    email,
    address,
    area,
    department,
    jobTitle,
    joinDate,
    managerPersonId,
    notes,
    roleId,
    createAccount,
    username,
    password,
  } = req.body || {};

  if (!fullName || !phone) {
    return res.status(400).json({ error: 'الاسم ورقم الهاتف حقول إلزامية' });
  }

  try {
    db.transaction(() => {
      const now = new Date().toISOString();
      const normalizedPhone = normalizePhone(String(phone || ''));
      const cleanEmail = normalizeEmail(String(email || ''));
      db.prepare(`
        UPDATE persons SET
          full_name = ?, phone = ?, normalized_phone = ?, national_id = ?, email = ?, address = ?, area = ?,
          department = ?, job_title = ?, join_date = ?, manager_person_id = ?, notes = ?, updated_at = ?
        WHERE id = ?
      `).run(
        String(fullName).trim(),
        String(phone).trim(),
        normalizedPhone,
        String(nationalId || '').trim(),
        cleanEmail,
        String(address || '').trim(),
        String(area || '').trim(),
        String(department || '').trim(),
        String(jobTitle || '').trim(),
        String(joinDate || '').trim(),
        managerPersonId ? Number(managerPersonId) : null,
        String(notes || '').trim(),
        now,
        personId
      );

      if (existing.user_id && roleId && Number(roleId) !== existing.role_id) {
        if (actor.roleKey !== 'super_admin' && !userHasPermission(actor, 'roles', 'edit')) {
          throw new Error('FORBIDDEN_ROLE_CHANGE');
        }
        const targetRole = db.prepare('SELECT id, role_key FROM roles WHERE id = ?').get(Number(roleId)) as
          | { id: number; role_key: string }
          | undefined;
        if (!targetRole) throw new Error('INVALID_ROLE');
        if (targetRole.role_key === 'super_admin' && actor.roleKey !== 'super_admin') {
          throw new Error('FORBIDDEN_ROLE_CHANGE');
        }
        db.prepare('UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?').run(targetRole.id, now, existing.user_id);
      } else if (!existing.user_id && createAccount) {
        if (actor.roleKey !== 'super_admin' && !(userHasPermission(actor, 'people', 'create') && userHasPermission(actor, 'staff', 'create'))) {
          throw new Error('FORBIDDEN_ACCOUNT_CREATE');
        }
        if (!username || !password || String(password).length < 6) {
          throw new Error('INVALID_CREDENTIALS');
        }
        const targetRole =
          existing.person_type === 'donor'
            ? (db.prepare("SELECT id, role_key FROM roles WHERE role_key = 'donor'").get() as { id: number; role_key: string } | undefined)
            : (db.prepare('SELECT id, role_key FROM roles WHERE id = ?').get(Number(roleId)) as { id: number; role_key: string } | undefined);
        if (!targetRole) throw new Error('INVALID_ROLE');
        if (targetRole.role_key === 'super_admin' && actor.roleKey !== 'super_admin') {
          throw new Error('FORBIDDEN_ROLE_CHANGE');
        }
        db.prepare(`
          INSERT INTO users (person_id, username, password_hash, role_id, status, must_change_password, created_by_user_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'active', 1, ?, ?, ?)
        `).run(personId, String(username).trim().toLowerCase(), hashPassword(String(password)), targetRole.id, actor.userId, now, now);
      }
    })();

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: 'UPDATE_PERSON',
      entityType: 'person',
      entityId: personId,
      details: { fullName },
      ipAddress: req.ip,
    });

    res.json({ ok: true, message: 'تم تحديث البيانات بنجاح' });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'FORBIDDEN_ROLE_CHANGE' || err.message === 'FORBIDDEN_ACCOUNT_CREATE') {
        return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية تعديل الصلاحيات أو إنشاء الحسابات' });
      }
      if (err.message === 'INVALID_ROLE') return res.status(400).json({ error: 'الدور الوظيفي غير صالح' });
      if (err.message === 'INVALID_CREDENTIALS') return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور (6 أحرف فأكثر) مطلوبان' });
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'اسم المستخدم مسجل مسبقًا' });
    }
    res.status(500).json({ error: 'حدث خطأ أثناء التحديث' });
  }
});

// Suspend / Reactivate person and login account
peopleAndRolesRouter.post('/people/:id/status', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  if (!userHasPermission(actor, 'people', 'suspend') && !userHasPermission(actor, 'staff', 'suspend')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية إيقاف أو تفعيل الحسابات' });
  }

  const personId = Number(req.params.id);
  const { status } = req.body || {};
  if (!['active', 'suspended'].includes(String(status))) {
    return res.status(400).json({ error: 'الحالة المطلوبة غير صالحة' });
  }

  const target = db
    .prepare(`
      SELECT p.id, p.full_name, u.id AS user_id, r.role_key
      FROM persons p
      LEFT JOIN users u ON u.person_id = p.id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE p.id = ?
    `)
    .get(personId) as { id: number; full_name: string; user_id: number | null; role_key: string | null } | undefined;

  if (!target) return res.status(404).json({ error: 'الشخص غير موجود' });
  if (target.user_id === actor.userId) {
    return res.status(400).json({ error: 'لا يمكنك إيقاف حسابك الشخصي أثناء تسجيل الدخول' });
  }
  if (target.role_key === 'super_admin') {
    return res.status(403).json({ error: 'لا يمكن إيقاف حساب المدير الرئيسي' });
  }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare('UPDATE persons SET status = ?, updated_at = ? WHERE id = ?').run(String(status), now, personId);
    if (target.user_id) {
      db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(String(status), now, target.user_id);
      if (status === 'suspended') {
        revokeUserSessions(target.user_id);
      }
    }
  })();

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: status === 'suspended' ? 'SUSPEND_ACCOUNT' : 'REACTIVATE_ACCOUNT',
    entityType: 'person',
    entityId: personId,
    details: { fullName: target.full_name, status },
    ipAddress: req.ip,
  });

  res.json({
    ok: true,
    message: status === 'suspended' ? 'تم إيقاف الحساب وإنهاء جلساته النشطة' : 'تمت إعادة تفعيل الحساب بنجاح',
  });
});

// Reset temporary password
peopleAndRolesRouter.post('/people/:id/reset-password', requirePermission('people', 'reset_password'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const personId = Number(req.params.id);
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'كلمة المرور المؤقتة يجب ألا تقل عن 6 أحرف' });
  }

  const target = db
    .prepare(`
      SELECT u.id AS user_id, r.role_key, p.full_name
      FROM persons p
      JOIN users u ON u.person_id = p.id
      JOIN roles r ON r.id = u.role_id
      WHERE p.id = ?
    `)
    .get(personId) as { user_id: number; role_key: string; full_name: string } | undefined;

  if (!target) {
    return res.status(404).json({ error: 'لا يوجد حساب دخول مرتبط بهذا الشخص' });
  }
  if (target.role_key === 'super_admin' && actor.roleKey !== 'super_admin') {
    return res.status(403).json({ error: 'ممنوع: لا يمكن إعادة تعيين كلمة مرور المدير الرئيسي' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?').run(
    hashPassword(String(newPassword)),
    now,
    target.user_id
  );
  revokeUserSessions(target.user_id);

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'RESET_PASSWORD',
    entityType: 'user',
    entityId: target.user_id,
    details: { targetName: target.full_name },
    ipAddress: req.ip,
  });

  res.json({ ok: true, message: 'تمت إعادة تعيين كلمة المرور وإلغاء الجلسات القديمة' });
});

// Soft delete / archive person (NEVER removes financial records or receipts!)
peopleAndRolesRouter.delete('/people/:id', requirePermission('people', 'soft_delete'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const personId = Number(req.params.id);

  const target = db
    .prepare(`
      SELECT p.id, p.full_name, u.id AS user_id, r.role_key
      FROM persons p
      LEFT JOIN users u ON u.person_id = p.id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE p.id = ?
    `)
    .get(personId) as { id: number; full_name: string; user_id: number | null; role_key: string | null } | undefined;

  if (!target) return res.status(404).json({ error: 'الشخص غير موجود' });
  if (target.role_key === 'super_admin') {
    return res.status(403).json({ error: 'لا يمكن حذف حساب المدير الرئيسي' });
  }

  const financialLinks = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM donations WHERE donor_person_id = ? AND status = 'approved') AS approved_donations,
        (SELECT COUNT(*) FROM receipts WHERE donor_person_id = ?) AS receipts_count,
        (SELECT COUNT(*) FROM aids WHERE beneficiary_person_id = ? AND status IN ('approved', 'disbursed')) AS approved_aids
    `)
    .get(personId, personId, personId) as { approved_donations: number; receipts_count: number; approved_aids: number };

  const now = new Date().toISOString();
  db.transaction(() => {
    // Soft archive preserves all relational financial & legal audit records!
    db.prepare("UPDATE persons SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?").run(now, now, personId);
    if (target.user_id) {
      db.prepare("UPDATE users SET status = 'archived', updated_at = ? WHERE id = ?").run(now, target.user_id);
      revokeUserSessions(target.user_id);
    }
  })();

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'ARCHIVE_PERSON',
    entityType: 'person',
    entityId: personId,
    details: { fullName: target.full_name, preservedFinancialLinks: financialLinks },
    ipAddress: req.ip,
  });

  res.json({
    ok: true,
    message:
      financialLinks.approved_donations + financialLinks.receipts_count + financialLinks.approved_aids > 0
        ? 'تمت أرشفة الشخص وإيقاف حسابه مع الاحتفاظ الكامل بكافة السجلات المالية والإيصالات الموثقة دون فقدان.'
        : 'تم الحذف المنطقي (الأرشفة) بنجاح.',
  });
});

// Roles & permissions catalog
peopleAndRolesRouter.get('/roles', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  if (!userHasPermission(actor, 'roles', 'view') && !userHasPermission(actor, 'people', 'create') && !userHasPermission(actor, 'staff', 'create')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية عرض الأدوار' });
  }

  const roles = db.prepare('SELECT * FROM roles ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  const perms = db.prepare('SELECT role_id, permission_key FROM role_permissions').all() as Array<{
    role_id: number;
    permission_key: string;
  }>;

  const permMap = new Map<number, string[]>();
  for (const p of perms) {
    if (!permMap.has(p.role_id)) permMap.set(p.role_id, []);
    permMap.get(p.role_id)!.push(p.permission_key);
  }

  res.json({
    catalog: PERMISSION_CATALOG,
    roles: roles.map((r) => ({
      ...r,
      permissions: permMap.get(Number(r.id)) || [],
    })),
  });
});

peopleAndRolesRouter.post('/roles', requirePermission('roles', 'create'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  if (actor.roleKey !== 'super_admin') {
    return res.status(403).json({ error: 'ممنوع: إنشاء الأدوار مقتصر على المدير الرئيسي' });
  }
  const { nameAr, descriptionAr, permissions } = req.body || {};
  if (!nameAr || String(nameAr).trim().length < 2) {
    return res.status(400).json({ error: 'يرجى إدخال اسم الدور' });
  }
  const roleKey = `custom_${Date.now()}`;
  const now = new Date().toISOString();

  const roleId = db.transaction(() => {
    const r = db
      .prepare('INSERT INTO roles (role_key, name_ar, description_ar, is_system, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)')
      .run(roleKey, String(nameAr).trim(), String(descriptionAr || '').trim(), now, now);
    const id = Number(r.lastInsertRowid);
    if (Array.isArray(permissions)) {
      const ins = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)');
      for (const pk of permissions) {
        ins.run(id, String(pk));
      }
    }
    return id;
  })();

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CREATE_ROLE',
    entityType: 'role',
    entityId: roleId,
    details: { nameAr, permissionsCount: Array.isArray(permissions) ? permissions.length : 0 },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, id: roleId, message: 'تم إنشاء الدور الوظيفي بنجاح' });
});

peopleAndRolesRouter.put('/roles/:id', requirePermission('roles', 'edit'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  if (actor.roleKey !== 'super_admin') {
    return res.status(403).json({ error: 'ممنوع: تعديل صلاحيات الأدوار مقتصر على المدير الرئيسي' });
  }

  const roleId = Number(req.params.id);
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as { id: number; role_key: string } | undefined;
  if (!role) return res.status(404).json({ error: 'الدور غير موجود' });
  if (role.role_key === 'super_admin') {
    return res.status(400).json({ error: 'لا يمكن تقليص صلاحيات المدير الرئيسي' });
  }

  const { nameAr, descriptionAr, permissions } = req.body || {};
  const now = new Date().toISOString();

  db.transaction(() => {
    if (nameAr) {
      db.prepare('UPDATE roles SET name_ar = ?, description_ar = ?, updated_at = ? WHERE id = ?').run(
        String(nameAr).trim(),
        String(descriptionAr || '').trim(),
        now,
        roleId
      );
    }
    if (Array.isArray(permissions)) {
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
      const ins = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)');
      for (const pk of permissions) {
        ins.run(roleId, String(pk));
      }
    }
  })();

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'UPDATE_ROLE_PERMISSIONS',
    entityType: 'role',
    entityId: roleId,
    details: { permissionsCount: Array.isArray(permissions) ? permissions.length : 0 },
    ipAddress: req.ip,
  });

  res.json({ ok: true, message: 'تم تحديث صلاحيات الدور بنجاح' });
});
