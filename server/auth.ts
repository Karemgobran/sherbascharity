import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { db, DB_PATH } from './db.ts';
import type { PermissionAction, PermissionModule } from './permissions.ts';
import { permKey } from './permissions.ts';

const COOKIE_NAME = 'sherbas_session';
const SESSION_TTL_HOURS = 12;

let cachedFileSecret: string | null = null;
function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret !== 'CHANGE_THIS_TO_A_STRONG_RANDOM_SECRET') {
    return envSecret;
  }
  if (cachedFileSecret) return cachedFileSecret;

  const secretPath = path.join(path.dirname(DB_PATH), '.session_secret');
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing.length >= 32) {
        cachedFileSecret = existing;
        return cachedFileSecret;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    cachedFileSecret = generated;
    return cachedFileSecret;
  } catch {
    cachedFileSecret = crypto.randomBytes(32).toString('hex');
    return cachedFileSecret;
  }
}

export interface AuthUser {
  userId: number;
  personId: number;
  username: string;
  fullName: string;
  phone: string;
  personType: string;
  department: string;
  jobTitle: string;
  roleId: number;
  roleKey: string;
  roleNameAr: string;
  mustChangePassword: boolean;
  permissions: string[];
}

export interface AuthedRequest extends Request {
  authUser?: AuthUser;
  sessionId?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(originalHex, 'hex');
  if (derived.length !== original.length) return false;
  return crypto.timingSafeEqual(derived, original);
}

function hashSessionToken(token: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(token).digest('hex');
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

export function createSession(userId: number, req: Request, res: Response): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000);

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    userId,
    tokenHash,
    expires.toISOString(),
    req.ip || '',
    String(req.headers['user-agent'] || '').slice(0, 250),
    now.toISOString()
  );

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_TTL_HOURS * 3600 * 1000,
  });

  if (isHttps) {
    const currentSetCookie = res.getHeader('Set-Cookie');
    if (Array.isArray(currentSetCookie)) {
      res.setHeader(
        'Set-Cookie',
        currentSetCookie.map((c) => (c.startsWith(`${COOKIE_NAME}=`) && !c.includes('Partitioned') ? `${c}; Partitioned` : c))
      );
    } else if (typeof currentSetCookie === 'string' && currentSetCookie.startsWith(`${COOKIE_NAME}=`) && !currentSetCookie.includes('Partitioned')) {
      res.setHeader('Set-Cookie', `${currentSetCookie}; Partitioned`);
    }
  }

  return rawToken;
}

export function destroySession(req: Request, res: Response): void {
  const cookies = parseCookies(req.headers.cookie);
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  const rawToken = bearerToken || cookies[COOKIE_NAME];
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
  });
}

export function revokeUserSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function loadAuthUserFromRequest(req: Request): { authUser: AuthUser; sessionId: string } | null {
  const cookies = parseCookies(req.headers.cookie);
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : '';
  const rawToken = bearerToken || cookies[COOKIE_NAME];
  if (!rawToken) return null;

  const tokenHash = hashSessionToken(rawToken);
  const row = db.prepare(`
    SELECT
      s.id AS session_id,
      s.expires_at,
      u.id AS user_id,
      u.person_id,
      u.username,
      u.status AS user_status,
      u.must_change_password,
      r.id AS role_id,
      r.role_key,
      r.name_ar AS role_name_ar,
      p.full_name,
      p.phone,
      p.person_type,
      p.department,
      p.job_title,
      p.status AS person_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN roles r ON r.id = u.role_id
    JOIN persons p ON p.id = u.person_id
    WHERE s.token_hash = ?
  `).get(tokenHash) as
    | {
        session_id: string;
        expires_at: string;
        user_id: number;
        person_id: number;
        username: string;
        user_status: string;
        must_change_password: number;
        role_id: number;
        role_key: string;
        role_name_ar: string;
        full_name: string;
        phone: string;
        person_type: string;
        department: string;
        job_title: string;
        person_status: string;
      }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    return null;
  }
  if (row.user_status !== 'active' || row.person_status !== 'active') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
    return null;
  }

  const permsRows = db
    .prepare('SELECT permission_key FROM role_permissions WHERE role_id = ?')
    .all(row.role_id) as { permission_key: string }[];

  return {
    sessionId: row.session_id,
    authUser: {
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
      permissions: permsRows.map((p) => p.permission_key),
    },
  };
}

export function userHasPermission(user: AuthUser, module: PermissionModule, action: PermissionAction): boolean {
  if (user.roleKey === 'super_admin') return true;
  if (user.roleKey === 'donor') return false;
  return user.permissions.includes(permKey(module, action));
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const loaded = loadAuthUserFromRequest(req);
  if (!loaded) {
    return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول أولًا' });
  }
  req.authUser = loaded.authUser;
  req.sessionId = loaded.sessionId;
  next();
}

export function requireAdminStaff(req: AuthedRequest, res: Response, next: NextFunction) {
  const loaded = loadAuthUserFromRequest(req);
  if (!loaded) {
    return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول أولًا' });
  }
  if (loaded.authUser.roleKey === 'donor') {
    return res.status(403).json({ error: 'ممنوع: حساب المتبرع لا يملك صلاحية الدخول إلى لوحة الإدارة' });
  }
  req.authUser = loaded.authUser;
  req.sessionId = loaded.sessionId;
  next();
}

export function requireDonorAccount(req: AuthedRequest, res: Response, next: NextFunction) {
  const loaded = loadAuthUserFromRequest(req);
  if (!loaded) {
    return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول أولًا' });
  }
  if (loaded.authUser.roleKey !== 'donor' && loaded.authUser.personType !== 'donor') {
    return res.status(403).json({ error: 'هذه البوابة مخصصة لحسابات المتبرعين فقط' });
  }
  req.authUser = loaded.authUser;
  req.sessionId = loaded.sessionId;
  next();
}

export function requirePermission(module: PermissionModule, action: PermissionAction) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const loaded = loadAuthUserFromRequest(req);
    if (!loaded) {
      return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول أولًا' });
    }
    req.authUser = loaded.authUser;
    req.sessionId = loaded.sessionId;
    if (!userHasPermission(loaded.authUser, module, action)) {
      return res.status(403).json({
        error: `ممنوع: لا تمتلك صلاحية (${module}:${action}) لتنفيذ هذه العملية`,
      });
    }
    next();
  };
}

export function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const loaded = loadAuthUserFromRequest(req);
  if (!loaded) {
    return res.status(401).json({ error: 'غير مصرح: يرجى تسجيل الدخول أولًا' });
  }
  if (loaded.authUser.roleKey !== 'super_admin') {
    return res.status(403).json({ error: 'ممنوع: هذه العملية مقتصرة على المدير الرئيسي فقط' });
  }
  req.authUser = loaded.authUser;
  req.sessionId = loaded.sessionId;
  next();
}

export function logAudit(params: {
  actorUserId: number | null;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, actor_name, action, entity_type, entity_id, details_json, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorUserId,
    params.actorName,
    params.action,
    params.entityType,
    params.entityId !== undefined ? String(params.entityId) : '',
    JSON.stringify(params.details || {}),
    params.ipAddress || '',
    new Date().toISOString()
  );
}

export function createNotificationForUser(params: {
  userId: number;
  titleAr: string;
  messageAr: string;
  category?: string;
  linkTab?: string;
  entityType?: string;
  entityId?: number;
}): void {
  db.prepare(`
    INSERT INTO notifications (user_id, title_ar, message_ar, category, link_tab, entity_type, entity_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    params.userId,
    params.titleAr,
    params.messageAr,
    params.category || 'info',
    params.linkTab || '',
    params.entityType || '',
    params.entityId ?? null,
    new Date().toISOString()
  );
}

export function createNotificationForPermission(params: {
  permissionKey: string;
  titleAr: string;
  messageAr: string;
  category?: string;
  linkTab?: string;
  entityType?: string;
  entityId?: number;
  excludeUserId?: number;
}): void {
  const users = db.prepare(`
    SELECT DISTINCT u.id
    FROM users u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    WHERE u.status = 'active'
      AND (r.role_key = 'super_admin' OR rp.permission_key = ?)
  `).all(params.permissionKey) as { id: number }[];

  const stmt = db.prepare(`
    INSERT INTO notifications (user_id, title_ar, message_ar, category, link_tab, entity_type, entity_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  const now = new Date().toISOString();
  for (const u of users) {
    if (params.excludeUserId && u.id === params.excludeUserId) continue;
    stmt.run(
      u.id,
      params.titleAr,
      params.messageAr,
      params.category || 'info',
      params.linkTab || '',
      params.entityType || '',
      params.entityId ?? null,
      now
    );
  }
}

export function nextSequentialCode(prefix: string, table: string, column: string): string {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;
  const row = db
    .prepare(`SELECT ${column} as code FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 1`)
    .get(pattern) as { code?: string } | undefined;
  let seq = 1;
  if (row?.code) {
    const parts = row.code.split('-');
    const lastNum = Number.parseInt(parts[parts.length - 1] || '0', 10);
    if (Number.isFinite(lastNum)) seq = lastNum + 1;
  }
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}
