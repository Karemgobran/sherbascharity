import crypto from 'node:crypto';
import { Router } from 'express';
import {
  createNotificationForPermission,
  createSession,
  destroySession,
  hashPassword,
  loadAuthUserFromRequest,
  logAudit,
  requireAuth,
  verifyPassword,
  type AuthedRequest,
} from '../auth.ts';
import { db } from '../db.ts';
import { ensureDemoNotificationForSuperAdmin } from '../demoSeed.ts';
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone, toAsciiDigits } from '../validation.ts';

export const setupAndAuthRouter = Router();

function hashVerificationCode(verificationId: string, code: string): string {
  return crypto.createHash('sha256').update(`${verificationId}:${code}`).digest('hex');
}

function buildAuthUserPayload(userId: number) {
  const row = db
    .prepare(`
      SELECT
        u.id AS user_id, u.person_id, u.username, u.role_id, u.must_change_password,
        r.role_key, r.name_ar AS role_name_ar,
        p.full_name, p.phone, p.person_type, p.department, p.job_title
      FROM users u
      JOIN roles r ON r.id = u.role_id
      JOIN persons p ON p.id = u.person_id
      WHERE u.id = ?
    `)
    .get(userId) as
    | {
        user_id: number;
        person_id: number;
        username: string;
        role_id: number;
        must_change_password: number;
        role_key: string;
        role_name_ar: string;
        full_name: string;
        phone: string;
        person_type: string;
        department: string;
        job_title: string;
      }
    | undefined;

  if (!row) return null;

  const perms = db
    .prepare('SELECT permission_key FROM role_permissions WHERE role_id = ?')
    .all(row.role_id) as { permission_key: string }[];

  return {
    userId: row.user_id,
    personId: row.person_id,
    username: row.username,
    fullName: row.full_name,
    phone: row.phone,
    personType: row.person_type,
    department: row.department,
    jobTitle: row.job_title,
    roleId: row.role_id,
    roleKey: row.role_key,
    roleNameAr: row.role_name_ar,
    mustChangePassword: Boolean(row.must_change_password),
    permissions: perms.map((p) => p.permission_key),
  };
}

// Check whether initial Super Admin has been configured
setupAndAuthRouter.get('/auth/setup-status', (_req, res) => {
  const row = db
    .prepare(`
      SELECT COUNT(*) as cnt
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.role_key = 'super_admin'
    `)
    .get() as { cnt: number };

  const requiresSetupKey = Boolean(process.env.INITIAL_SETUP_KEY && process.env.INITIAL_SETUP_KEY.trim().length > 0);
  res.json({
    initialized: row.cnt > 0,
    requiresSetupKey,
  });
});

// One-time secure Super Admin bootstrap (permanently locks once a Super Admin exists)
setupAndAuthRouter.post('/setup/super-admin', (req, res) => {
  const { fullName, phone, username, password, setupKey } = req.body || {};

  const requiredSetupKey = process.env.INITIAL_SETUP_KEY?.trim();
  if (requiredSetupKey && setupKey !== requiredSetupKey) {
    return res.status(403).json({ error: 'مفتاح الإعداد الأولي غير صحيح' });
  }

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 3) {
    return res.status(400).json({ error: 'يرجى إدخال الاسم الكامل للمدير الرئيسي' });
  }
  const cleanPhone = String(phone || '').trim();
  const normalizedPhone = normalizePhone(cleanPhone);
  if (!cleanPhone || cleanPhone.length < 6) {
    return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح' });
  }
  if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9._-]{3,40}$/.test(username.trim())) {
    return res.status(400).json({ error: 'اسم المستخدم يجب أن يتكون من 3 إلى 40 حرفًا إنجليزيًا أو رقمًا' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن لا تقل عن 8 أحرف' });
  }

  try {
    const result = db.transaction(() => {
      const existingAdmin = db
        .prepare(`
          SELECT COUNT(*) as cnt
          FROM users u
          JOIN roles r ON r.id = u.role_id
          WHERE r.role_key = 'super_admin'
        `)
        .get() as { cnt: number };

      if (existingAdmin.cnt > 0) {
        throw new Error('ALREADY_INITIALIZED');
      }

      const roleRow = db.prepare("SELECT id FROM roles WHERE role_key = 'super_admin'").get() as { id: number } | undefined;
      if (!roleRow) {
        throw new Error('SUPER_ADMIN_ROLE_MISSING');
      }

      const now = new Date().toISOString();
      const personRes = db
        .prepare(`
          INSERT INTO persons (
            full_name, phone, normalized_phone, person_type, department, job_title, join_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, 'admin', 'الإدارة العليا', 'المدير الرئيسي للنظام', ?, 'active', ?, ?)
        `)
        .run(fullName.trim(), normalizedPhone || cleanPhone, normalizedPhone || cleanPhone, now.slice(0, 10), now, now);

      const personId = Number(personRes.lastInsertRowid);
      const pwHash = hashPassword(password);

      const userRes = db
        .prepare(`
          INSERT INTO users (
            person_id, username, password_hash, role_id, status, must_change_password, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'active', 0, ?, ?)
        `)
        .run(personId, username.trim().toLowerCase(), pwHash, roleRow.id, now, now);

      const userId = Number(userRes.lastInsertRowid);
      return { userId, personId };
    })();

    const sessionToken = createSession(result.userId, req, res);
    ensureDemoNotificationForSuperAdmin(result.userId);
    logAudit({
      actorUserId: result.userId,
      actorName: fullName.trim(),
      action: 'SETUP_SUPER_ADMIN',
      entityType: 'user',
      entityId: result.userId,
      details: { username: username.trim().toLowerCase() },
      ipAddress: req.ip,
    });

    const createdUser = buildAuthUserPayload(result.userId);
    res.status(201).json({
      message: 'تم إنشاء حساب المدير الرئيسي وتأمين النظام بنجاح',
      user: createdUser,
      sessionToken,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'ALREADY_INITIALIZED') {
      return res.status(403).json({ error: 'تم إعداد حساب المدير الرئيسي مسبقًا؛ هذه الصفحة مغلقة نهائيًا لأسباب أمنية.' });
    }
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل' });
    }
    console.error('Setup error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء إعداد النظام' });
  }
});

// Step 1 for Donor Self-Registration: Phone/Email uniqueness check + 6-digit verification code
setupAndAuthRouter.post('/auth/donor-register/send-verification', (req, res) => {
  const { phone, email, channel } = req.body || {};
  const normalizedPhone = normalizePhone(String(phone || ''));
  const normalizedEmail = normalizeEmail(String(email || ''));
  const deliveryChannel = channel === 'email' ? 'email' : 'phone';

  if (!isValidPhone(normalizedPhone)) {
    return res.status(400).json({
      error: 'يرجى إدخال رقم هاتف مصري أو دولي صحيح غير مكرر الأرقام (مثال: 01012345678)',
    });
  }

  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' });
  }

  if (deliveryChannel === 'email' && !normalizedEmail) {
    return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أولًا لاستلام رمز التحقق عبره' });
  }

  // Strict uniqueness check BEFORE issuing any verification code
  const existingPhone = db
    .prepare("SELECT id FROM persons WHERE (normalized_phone = ? OR phone = ?) AND status != 'archived' LIMIT 1")
    .get(normalizedPhone, normalizedPhone) as { id: number } | undefined;

  if (existingPhone) {
    return res.status(409).json({
      error: 'رقم الهاتف مسجل بالفعل في النظام. إذا كان لديك حساب يمكنك تسجيل الدخول مباشرة برقم الهاتف وكلمة المرور.',
    });
  }

  if (normalizedEmail) {
    const existingEmail = db
      .prepare("SELECT id FROM persons WHERE email != '' AND LOWER(email) = ? AND status != 'archived' LIMIT 1")
      .get(normalizedEmail) as { id: number } | undefined;
    if (existingEmail) {
      return res.status(409).json({
        error: 'البريد الإلكتروني مسجل بالفعل في النظام. يمكنك تسجيل الدخول مباشرة بالبريد الإلكتروني.',
      });
    }
  }

  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const ipAddress = req.ip || 'unknown';
  const ipCount = (
    db
      .prepare('SELECT COUNT(*) AS cnt FROM donor_verification_codes WHERE ip_address = ? AND created_at >= ?')
      .get(ipAddress, fifteenMinsAgo) as { cnt: number }
  ).cnt;
  if (ipCount >= 12) {
    return res.status(429).json({ error: 'تم إرسال عدد كبير من طلبات التحقق مؤقتًا؛ يرجى المحاولة بعد قليل.' });
  }

  const phoneCount = (
    db
      .prepare('SELECT COUNT(*) AS cnt FROM donor_verification_codes WHERE normalized_phone = ? AND created_at >= ?')
      .get(normalizedPhone, fifteenMinsAgo) as { cnt: number }
  ).cnt;
  if (phoneCount >= 5) {
    return res.status(429).json({ error: 'تم إرسال عدة رموز لهذا الرقم مؤخرًا؛ يرجى استخدام آخر رمز أو الانتظار قليلًا.' });
  }

  const verificationId = crypto.randomUUID();
  const code = String(crypto.randomInt(100000, 1000000));
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO donor_verification_codes (
      id, normalized_phone, email, channel, code_hash, attempts, ip_address, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    verificationId,
    normalizedPhone,
    normalizedEmail,
    deliveryChannel,
    hashVerificationCode(verificationId, code),
    ipAddress,
    expiresAt,
    nowIso
  );

  // Honest delivery: previewCode is provided ONLY because no paid external SMS/SMTP provider is configured
  const hasExternalGateway = Boolean(process.env.SMS_GATEWAY_URL || process.env.SMTP_HOST);
  res.status(201).json({
    ok: true,
    verificationId,
    deliveryChannel,
    deliveryMode: hasExternalGateway ? 'gateway' : 'local_preview',
    previewCode: hasExternalGateway ? undefined : code,
    expiresInSeconds: 600,
    message: hasExternalGateway
      ? 'تم إرسال رمز التحقق المكوّن من 6 أرقام إلى وسيلة الاتصال المحددة.'
      : 'تم إصدار رمز التحقق المكوّن من 6 أرقام بنجاح (يُعرض الرمز هنا لعدم ربط بوابة رسائل SMS أو بريد خارجية في بيئة التشغيل الحالية).',
  });
});

// Donor Self-Registration ONLY (strictly locks out staff/admin privilege escalation!)
setupAndAuthRouter.post('/auth/donor-register', (req, res) => {
  const {
    fullName,
    phone,
    email,
    password,
    confirmPassword,
    acceptedPrivacyPolicy,
    verificationId,
    verificationCode,
    roleKey,
    roleId,
    personType,
  } = req.body || {};

  // Explicitly block any attempt to register non-donor roles or privilege escalate
  if (
    (roleKey && String(roleKey) !== 'donor') ||
    roleId !== undefined ||
    (personType && String(personType) !== 'donor')
  ) {
    logAudit({
      actorUserId: null,
      actorName: String(fullName || 'مجهول'),
      action: 'SELF_REGISTER_ROLE_ESCALATION_BLOCKED',
      entityType: 'auth',
      details: { roleKey, roleId, personType },
      ipAddress: req.ip,
    });
    return res.status(403).json({
      error: 'ممنوع: التسجيل الذاتي مقتصر حصريًا على حسابات المتبرعين، ولا يمكن إنشاء حساب موظف أو مدير من هنا.',
    });
  }

  const cleanName = String(fullName || '').trim();
  const normalizedPhone = normalizePhone(String(phone || ''));
  const normalizedEmail = normalizeEmail(String(email || ''));
  const cleanCode = toAsciiDigits(String(verificationCode || '')).trim();

  if (cleanName.length < 3 || cleanName.length > 120) {
    return res.status(400).json({ error: 'يرجى إدخال الاسم بالكامل (3 أحرف على الأقل)' });
  }
  if (!isValidPhone(normalizedPhone)) {
    return res.status(400).json({ error: 'يرجى إدخال رقم هاتف مصري أو دولي صحيح غير وهمي' });
  }
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'البريد الإلكتروني المدخل غير صالح' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'كلمة المرور وتأكيد كلمة المرور غير متطابقتين' });
  }
  if (acceptedPrivacyPolicy !== true) {
    return res.status(400).json({ error: 'يجب الموافقة على سياسة الخصوصية لإتمام إنشاء الحساب' });
  }
  if (!verificationId || !/^[0-9]{6}$/.test(cleanCode)) {
    return res.status(400).json({ error: 'يرجى طلب وإدخال رمز التحقق المكوّن من 6 أرقام لتأكيد رقم الهاتف أو البريد' });
  }

  const nowIso = new Date().toISOString();
  const codeRow = db
    .prepare('SELECT * FROM donor_verification_codes WHERE id = ?')
    .get(String(verificationId)) as
    | {
        id: string;
        normalized_phone: string;
        email: string;
        code_hash: string;
        attempts: number;
        expires_at: string;
        consumed_at: string | null;
      }
    | undefined;

  if (!codeRow || codeRow.consumed_at) {
    return res.status(400).json({ error: 'رمز التحقق غير صالح أو تم استخدامه مسبقًا؛ يرجى طلب رمز جديد' });
  }
  if (codeRow.expires_at < nowIso) {
    return res.status(400).json({ error: 'انتهت صلاحية رمز التحقق؛ يرجى طلب رمز جديد' });
  }
  if (codeRow.normalized_phone !== normalizedPhone) {
    return res.status(400).json({ error: 'رقم الهاتف لا يطابق الرقم الصادر له رمز التحقق' });
  }
  if (codeRow.attempts >= 5) {
    return res.status(429).json({ error: 'تم تجاوز الحد الأقصى لمحاولات التحقق؛ يرجى طلب رمز تحقق جديد' });
  }

  const expectedHashBuf = Buffer.from(codeRow.code_hash, 'hex');
  const providedHashBuf = Buffer.from(hashVerificationCode(codeRow.id, cleanCode), 'hex');
  if (expectedHashBuf.length !== providedHashBuf.length || !crypto.timingSafeEqual(expectedHashBuf, providedHashBuf)) {
    db.prepare('UPDATE donor_verification_codes SET attempts = attempts + 1 WHERE id = ?').run(codeRow.id);
    return res.status(400).json({ error: 'رمز التحقق غير صحيح؛ يرجى التأكد وإعادة المحاولة' });
  }

  try {
    const created = db.transaction(() => {
      const existingPhone = db
        .prepare("SELECT id FROM persons WHERE (normalized_phone = ? OR phone = ?) AND status != 'archived' LIMIT 1")
        .get(normalizedPhone, normalizedPhone) as { id: number } | undefined;
      if (existingPhone) {
        throw new Error('DUPLICATE_PHONE');
      }

      if (normalizedEmail) {
        const existingEmail = db
          .prepare("SELECT id FROM persons WHERE email != '' AND LOWER(email) = ? AND status != 'archived' LIMIT 1")
          .get(normalizedEmail) as { id: number } | undefined;
        if (existingEmail) {
          throw new Error('DUPLICATE_EMAIL');
        }
      }

      const donorRole = db.prepare("SELECT id FROM roles WHERE role_key = 'donor'").get() as { id: number } | undefined;
      if (!donorRole) {
        throw new Error('DONOR_ROLE_MISSING');
      }

      const consumeRes = db
        .prepare('UPDATE donor_verification_codes SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
        .run(nowIso, codeRow.id);
      if (consumeRes.changes === 0) {
        throw new Error('CODE_ALREADY_USED');
      }

      const personRes = db
        .prepare(`
          INSERT INTO persons (
            full_name, phone, normalized_phone, email, person_type, join_date,
            privacy_accepted_at, contact_verification_status, notes, status, is_demo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'donor', ?, ?, 'verified_otp', ?, 'active', 0, ?, ?)
        `)
        .run(
          cleanName,
          normalizedPhone,
          normalizedPhone,
          normalizedEmail,
          nowIso.slice(0, 10),
          nowIso,
          'حساب متبرع مسجل ذاتيًا عبر بوابة الجمعية بعد التحقق من وسيلة الاتصال والموافقة على سياسة الخصوصية',
          nowIso,
          nowIso
        );

      const personId = Number(personRes.lastInsertRowid);
      let candidateUsername = `donor_${normalizedPhone}`;
      const takenUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(candidateUsername);
      if (takenUsername) {
        candidateUsername = `donor_${normalizedPhone}_${personId}`;
      }

      const userRes = db
        .prepare(`
          INSERT INTO users (
            person_id, username, password_hash, role_id, status, must_change_password, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'active', 0, ?, ?)
        `)
        .run(personId, candidateUsername, hashPassword(password), donorRole.id, nowIso, nowIso);

      return {
        userId: Number(userRes.lastInsertRowid),
        personId,
        username: candidateUsername,
      };
    })();

    const sessionToken = createSession(created.userId, req, res);
    const authedUser = buildAuthUserPayload(created.userId);

    createNotificationForPermission({
      permissionKey: 'people:view',
      titleAr: 'انضمام متبرع جديد عبر البوابة',
      messageAr: `أنشأ المتبرع ${cleanName} (${normalizedPhone}) حسابًا شخصيًا جديدًا عبر صفحة التسجيل.`,
      category: 'info',
      linkTab: 'people',
      entityType: 'person',
      entityId: created.personId,
    });

    logAudit({
      actorUserId: created.userId,
      actorName: cleanName,
      action: 'DONOR_SELF_REGISTERED',
      entityType: 'user',
      entityId: created.userId,
      details: { personId: created.personId, phone: normalizedPhone, hasEmail: Boolean(normalizedEmail) },
      ipAddress: req.ip,
    });

    res.status(201).json({
      ok: true,
      message: 'تم إنشاء حساب المتبرع وتأكيد بيانات الاتصال وتسجيل دخولك بنجاح',
      user: authedUser,
      sessionToken,
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'DUPLICATE_PHONE') {
        return res.status(409).json({ error: 'رقم الهاتف مسجل بالفعل؛ يرجى تسجيل الدخول أو استخدام رقم آخر' });
      }
      if (err.message === 'DUPLICATE_EMAIL') {
        return res.status(409).json({ error: 'البريد الإلكتروني مسجل بالفعل؛ يرجى تسجيل الدخول أو استخدام بريد آخر' });
      }
      if (err.message === 'CODE_ALREADY_USED') {
        return res.status(400).json({ error: 'تم استخدام رمز التحقق مسبقًا؛ يرجى طلب رمز جديد' });
      }
    }
    console.error('Donor self-register error:', err);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء حساب المتبرع' });
  }
});

// Unified Login endpoint (supports username, phone number, or email for existing accounts)
setupAndAuthRouter.post('/auth/login', (req, res) => {
  const { username, identifier, password } = req.body || {};
  const rawInput = String(identifier || username || '').trim();
  if (!rawInput || !password) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم أو رقم الهاتف مع كلمة المرور' });
  }

  type LoginUserRow = {
    id: number;
    person_id: number;
    username: string;
    password_hash: string;
    user_status: string;
    must_change_password: number;
    role_key: string;
    role_name_ar: string;
    full_name: string;
    person_status: string;
  };

  const baseSelect = `
    SELECT
      u.id, u.person_id, u.username, u.password_hash, u.status AS user_status,
      u.must_change_password, r.role_key, r.name_ar AS role_name_ar,
      p.full_name, p.status AS person_status
    FROM users u
    JOIN roles r ON r.id = u.role_id
    JOIN persons p ON p.id = u.person_id
  `;

  let matches = db.prepare(`${baseSelect} WHERE LOWER(u.username) = LOWER(?)`).all(rawInput) as LoginUserRow[];

  if (matches.length === 0 && rawInput.includes('@')) {
    matches = db
      .prepare(`${baseSelect} WHERE p.email != '' AND LOWER(p.email) = LOWER(?)`)
      .all(normalizeEmail(rawInput)) as LoginUserRow[];
  }

  if (matches.length === 0) {
    const normPhone = normalizePhone(rawInput);
    if (normPhone.length >= 6) {
      matches = db
        .prepare(`${baseSelect} WHERE p.normalized_phone = ? OR p.phone = ?`)
        .all(normPhone, rawInput) as LoginUserRow[];
    }
  }

  if (matches.length > 1) {
    return res.status(409).json({
      error: 'يوجد أكثر من حساب مرتبط بهذه البيانات؛ يرجى تسجيل الدخول باستخدام اسم المستخدم المحدد.',
    });
  }

  const row = matches[0];
  if (!row || !verifyPassword(String(password), row.password_hash)) {
    logAudit({
      actorUserId: null,
      actorName: rawInput.toLowerCase(),
      action: 'LOGIN_FAILED',
      entityType: 'auth',
      details: { identifier: rawInput.toLowerCase() },
      ipAddress: req.ip,
    });
    return res.status(401).json({ error: 'بيانات الدخول أو كلمة المرور غير صحيحة' });
  }

  if (row.user_status !== 'active' || row.person_status !== 'active') {
    logAudit({
      actorUserId: row.id,
      actorName: row.full_name,
      action: 'LOGIN_BLOCKED_SUSPENDED',
      entityType: 'user',
      entityId: row.id,
      ipAddress: req.ip,
    });
    return res.status(403).json({ error: 'هذا الحساب موقوف أو مؤرشف حاليًا. يرجى مراجعة المدير الرئيسي.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id);
  const sessionToken = createSession(row.id, req, res);

  logAudit({
    actorUserId: row.id,
    actorName: row.full_name,
    action: 'LOGIN_SUCCESS',
    entityType: 'user',
    entityId: row.id,
    details: { roleKey: row.role_key },
    ipAddress: req.ip,
  });

  res.json({
    sessionToken,
    user: buildAuthUserPayload(row.id),
  });
});

setupAndAuthRouter.post('/auth/logout', (req: AuthedRequest, res) => {
  const loaded = loadAuthUserFromRequest(req);
  if (loaded) {
    logAudit({
      actorUserId: loaded.authUser.userId,
      actorName: loaded.authUser.fullName,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: loaded.authUser.userId,
      ipAddress: req.ip,
    });
  }
  destroySession(req, res);
  res.json({ ok: true });
});

setupAndAuthRouter.get('/auth/me', (req, res) => {
  const loaded = loadAuthUserFromRequest(req);
  if (!loaded) {
    return res.json({ user: null, unreadNotifications: 0 });
  }
  const unread = db
    .prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(loaded.authUser.userId) as { cnt: number };
  res.json({
    user: loaded.authUser,
    unreadNotifications: unread.cnt,
  });
});

setupAndAuthRouter.post('/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = req.authUser!;

  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية وكلمة مرور جديدة لا تقل عن 8 أحرف' });
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.userId) as { password_hash: string };
  if (!verifyPassword(String(currentPassword), row.password_hash)) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?').run(
    hashPassword(String(newPassword)),
    now,
    user.userId
  );

  logAudit({
    actorUserId: user.userId,
    actorName: user.fullName,
    action: 'PASSWORD_CHANGED_SELF',
    entityType: 'user',
    entityId: user.userId,
    ipAddress: req.ip,
  });

  res.json({ ok: true, message: 'تم تحديث كلمة المرور بنجاح' });
});

