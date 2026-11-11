import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_ROLES } from './permissions.ts';
import { normalizePhone } from './validation.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(DATA_DIR, 'sherbas.db');
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.cwd(), process.env.UPLOAD_DIR)
  : path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.cwd(), process.env.BACKUP_DIR)
  : path.join(DATA_DIR, 'backups');

for (const dir of [path.dirname(DB_PATH), UPLOAD_DIR, BACKUP_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS charity_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name_ar TEXT NOT NULL,
      tagline_ar TEXT NOT NULL,
      registration_number TEXT NOT NULL DEFAULT '',
      address_ar TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      website_domain TEXT NOT NULL DEFAULT 'sherbascharity.org',
      donation_instructions_ar TEXT NOT NULL DEFAULT '',
      bank_transfer_info_ar TEXT NOT NULL DEFAULT '',
      vodafone_cash_info_ar TEXT NOT NULL DEFAULT '',
      instapay_info_ar TEXT NOT NULL DEFAULT '',
      receipt_footer_ar TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_key TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      description_ar TEXT NOT NULL DEFAULT '',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_key TEXT NOT NULL,
      UNIQUE(role_id, permission_key)
    );

    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      national_id TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      person_type TEXT NOT NULL CHECK (person_type IN ('admin', 'employee', 'donor', 'beneficiary', 'volunteer', 'official')),
      department TEXT NOT NULL DEFAULT '',
      job_title TEXT NOT NULL DEFAULT '',
      join_date TEXT NOT NULL DEFAULT '',
      manager_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
      is_test_record INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id INTEGER NOT NULL UNIQUE REFERENCES persons(id) ON DELETE RESTRICT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
      must_change_password INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stored_files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      owner_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('cash_safe', 'bank', 'wallet')),
      fund_type TEXT NOT NULL DEFAULT 'general' CHECK (fund_type IN ('general', 'zakat', 'restricted')),
      account_number TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      current_balance REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title_ar TEXT NOT NULL,
      category_ar TEXT NOT NULL DEFAULT 'مشروعات عامة',
      description_ar TEXT NOT NULL DEFAULT '',
      goal_ar TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      cover_file_id TEXT,
      target_budget REAL NOT NULL DEFAULT 0,
      fund_type TEXT NOT NULL DEFAULT 'general' CHECK (fund_type IN ('general', 'zakat', 'restricted')),
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      manager_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('preparing', 'open', 'funded', 'in_progress', 'completed', 'paused')),
      is_public INTEGER NOT NULL DEFAULT 1,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title_ar TEXT NOT NULL,
      details_ar TEXT NOT NULL,
      progress_percent INTEGER NOT NULL DEFAULT 0,
      file_id TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS humanitarian_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_number TEXT NOT NULL UNIQUE,
      beneficiary_person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
      case_type TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      family_size INTEGER NOT NULL DEFAULT 1,
      requested_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'under_research', 'approved', 'rejected', 'assisted', 'closed')),
      assigned_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES humanitarian_cases(id) ON DELETE CASCADE,
      title_ar TEXT NOT NULL,
      file_id TEXT NOT NULL REFERENCES stored_files(id) ON DELETE CASCADE,
      uploaded_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_code TEXT NOT NULL UNIQUE,
      donor_person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
      donation_type TEXT NOT NULL CHECK (donation_type IN ('general', 'case_support', 'project', 'recurring', 'zakat_mal', 'zakat_fitr', 'sadaqah', 'kaffarah', 'in_kind')),
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      case_category_label TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL CHECK (amount > 0),
      payment_method TEXT NOT NULL,
      transaction_ref TEXT NOT NULL DEFAULT '',
      donation_date TEXT NOT NULL,
      proof_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
      donor_notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'in_review', 'needs_clarification', 'approved', 'rejected', 'cancelled')),
      financial_account_id INTEGER REFERENCES financial_accounts(id) ON DELETE SET NULL,
      is_zakat INTEGER NOT NULL DEFAULT 0,
      internal_note TEXT NOT NULL DEFAULT '',
      rejection_reason TEXT NOT NULL DEFAULT '',
      clarification_request TEXT NOT NULL DEFAULT '',
      reviewed_by_user_id INTEGER REFERENCES users(id),
      reviewed_at TEXT,
      approved_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donation_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      donation_id INTEGER NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      previous_status TEXT NOT NULL,
      new_status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      actor_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      donation_id INTEGER NOT NULL UNIQUE REFERENCES donations(id) ON DELETE RESTRICT,
      donor_person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
      donor_name TEXT NOT NULL,
      amount REAL NOT NULL,
      amount_words_ar TEXT NOT NULL,
      donation_type_label TEXT NOT NULL,
      project_title TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL,
      donation_date TEXT NOT NULL,
      approved_by_name TEXT NOT NULL,
      approved_at TEXT NOT NULL,
      verification_hash TEXT NOT NULL,
      print_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_number TEXT NOT NULL UNIQUE,
      title_ar TEXT NOT NULL,
      category_ar TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      expense_date TEXT NOT NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      case_id INTEGER REFERENCES humanitarian_cases(id) ON DELETE SET NULL,
      financial_account_id INTEGER NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
      is_zakat_expense INTEGER NOT NULL DEFAULT 0,
      beneficiary_or_vendor TEXT NOT NULL DEFAULT '',
      description_ar TEXT NOT NULL DEFAULT '',
      attachment_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'paid', 'rejected', 'cancelled')),
      rejection_reason TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER REFERENCES users(id),
      approved_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_number TEXT NOT NULL UNIQUE,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('receipt_voucher', 'payment_voucher', 'transfer_out', 'transfer_in', 'reconciliation_adjustment')),
      account_id INTEGER NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
      direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
      amount REAL NOT NULL CHECK (amount > 0),
      balance_after REAL NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id INTEGER,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      description_ar TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_number TEXT NOT NULL UNIQUE,
      from_account_id INTEGER NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
      to_account_id INTEGER NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
      amount REAL NOT NULL CHECK (amount > 0),
      transfer_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_reconciliations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
      reconciliation_date TEXT NOT NULL,
      system_balance REAL NOT NULL,
      actual_balance REAL NOT NULL,
      difference REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      category_ar TEXT NOT NULL,
      unit_ar TEXT NOT NULL,
      current_qty REAL NOT NULL DEFAULT 0,
      min_threshold REAL NOT NULL DEFAULT 5,
      notes TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_number TEXT NOT NULL UNIQUE,
      item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('inbound', 'outbound')),
      quantity REAL NOT NULL CHECK (quantity > 0),
      qty_after REAL NOT NULL,
      movement_date TEXT NOT NULL,
      source_or_recipient TEXT NOT NULL,
      donor_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      case_id INTEGER REFERENCES humanitarian_cases(id) ON DELETE SET NULL,
      responsible_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      attachment_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS aids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aid_number TEXT NOT NULL UNIQUE,
      case_id INTEGER NOT NULL REFERENCES humanitarian_cases(id) ON DELETE RESTRICT,
      beneficiary_person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
      aid_type TEXT NOT NULL CHECK (aid_type IN ('financial', 'food', 'medical', 'educational', 'marriage', 'treatment', 'seasonal', 'emergency')),
      delivery_mode TEXT NOT NULL DEFAULT 'financial' CHECK (delivery_mode IN ('financial', 'in_kind')),
      amount REAL NOT NULL DEFAULT 0,
      inventory_item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
      quantity REAL NOT NULL DEFAULT 0,
      funding_source_label TEXT NOT NULL DEFAULT '',
      financial_account_id INTEGER REFERENCES financial_accounts(id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      is_zakat INTEGER NOT NULL DEFAULT 0,
      aid_date TEXT NOT NULL,
      responsible_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      attachment_file_id TEXT REFERENCES stored_files(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disbursed', 'rejected')),
      approved_by_user_id INTEGER REFERENCES users(id),
      approved_at TEXT,
      disbursed_at TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS zakat_kafalat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_code TEXT NOT NULL UNIQUE,
      program_type TEXT NOT NULL CHECK (program_type IN ('zakat_mal', 'zakat_fitr', 'sadaqah', 'monthly_kafala', 'orphan_kafala', 'family_kafala', 'seasonal')),
      title_ar TEXT NOT NULL,
      beneficiary_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      case_id INTEGER REFERENCES humanitarian_cases(id) ON DELETE SET NULL,
      donor_person_id INTEGER REFERENCES persons(id) ON DELETE SET NULL,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      monthly_amount REAL NOT NULL DEFAULT 0,
      purpose_ar TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
      notes TEXT NOT NULL DEFAULT '',
      created_by_user_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_ar TEXT NOT NULL,
      message_ar TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'info',
      link_tab TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donor_verification_codes (
      id TEXT PRIMARY KEY,
      normalized_phone TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT 'phone',
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_donations_donor ON donations(donor_person_id);
    CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
    CREATE INDEX IF NOT EXISTS idx_donations_project ON donations(project_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_persons_type ON persons(person_type, status);
    CREATE INDEX IF NOT EXISTS idx_verification_phone ON donor_verification_codes(normalized_phone, created_at);
  `);

  const now = new Date().toISOString();

  // Seed default charity settings if not present (NO fake numbers!)
  const settingsExists = db.prepare('SELECT id FROM charity_settings WHERE id = 1').get();
  if (!settingsExists) {
    db.prepare(`
      INSERT INTO charity_settings (
        id, name_ar, tagline_ar, registration_number, address_ar, phone, email,
        website_domain, donation_instructions_ar, bank_transfer_info_ar,
        vodafone_cash_info_ar, instapay_info_ar, receipt_footer_ar, updated_at
      ) VALUES (
        1,
        'الجمعية الخيرية بشرباص',
        'عمل مؤسسي منظم لخدمة الأسر المستحقة والتنمية المجتمعية بشفافية كاملة',
        'قيد التوثيق وفق بيانات الجمعية الرسمية',
        'شرباص - مركز فارسكور - محافظة دمياط - جمهورية مصر العربية',
        'يُحدَّد من لوحة الإعدادات',
        'info@sherbascharity.org',
        'sherbascharity.org',
        'بعد إجراء التحويل المالي، يرجى الدخول إلى بوابة المتبرعين وإدخال قيمة التبرع ورقم العملية وإرفاق صورة الإيصال ليتم مراجعته واعتماده وإصدار الإيصال الرسمي.',
        'يُضاف رقم الحساب البنكي الرسمي للجمعية من إعدادات الإدارة',
        'يُضاف رقم المحفظة الرسمية للجمعية من إعدادات الإدارة',
        'يُضاف عنوان الدفع الفوري (InstaPay) للجمعية من إعدادات الإدارة',
        'هذا الإيصال صادر إلكترونيًا من النظام المالي المعتمد للجمعية الخيرية بشرباص ولا يعتد به إلا بعد اعتماد المراجعة المالية.',
        ?
      )
    `).run(now);
  }

  // Seed default 9 roles and permissions idempotently
  const insertRole = db.prepare(`
    INSERT OR IGNORE INTO roles (role_key, name_ar, description_ar, is_system, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const getRoleByKey = db.prepare('SELECT id FROM roles WHERE role_key = ?');
  const insertPerm = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
    VALUES (?, ?)
  `);

  const seedTx = db.transaction(() => {
    for (const role of DEFAULT_ROLES) {
      insertRole.run(role.key, role.nameAr, role.descriptionAr, role.isSystem ? 1 : 0, now, now);
      const row = getRoleByKey.get(role.key) as { id: number };
      if (role.key === 'super_admin') {
        // Always ensure super_admin has every defined permission
        for (const perm of role.permissions) {
          insertPerm.run(row.id, perm);
        }
      } else {
        const existingPerms = db
          .prepare('SELECT COUNT(*) as cnt FROM role_permissions WHERE role_id = ?')
          .get(row.id) as { cnt: number };
        if (existingPerms.cnt === 0) {
          for (const perm of role.permissions) {
            insertPerm.run(row.id, perm);
          }
        }
      }
    }
  });
  seedTx();

  const ensureColumn = (table: string, col: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
    }
  };

  ensureColumn('charity_settings', 'demo_cleared', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('projects', 'record_kind', "TEXT NOT NULL DEFAULT 'project'");
  ensureColumn('expenses', 'is_public_attachment', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('persons', 'normalized_phone', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('persons', 'privacy_accepted_at', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('persons', 'contact_verification_status', "TEXT NOT NULL DEFAULT 'unverified'");
  db.exec('CREATE INDEX IF NOT EXISTS idx_persons_norm_phone ON persons(normalized_phone)');

  const legacyPhones = db
    .prepare("SELECT id, phone FROM persons WHERE normalized_phone = '' AND phone != ''")
    .all() as Array<{ id: number; phone: string }>;
  if (legacyPhones.length > 0) {
    const updPhone = db.prepare('UPDATE persons SET normalized_phone = ? WHERE id = ?');
    db.transaction(() => {
      for (const p of legacyPhones) {
        updPhone.run(normalizePhone(p.phone), p.id);
      }
    })();
  }

  for (const tbl of [
    'persons',
    'financial_accounts',
    'projects',
    'humanitarian_cases',
    'donations',
    'receipts',
    'expenses',
    'financial_transactions',
    'inventory_items',
    'inventory_movements',
    'aids',
    'zakat_kafalat',
    'notifications',
  ]) {
    ensureColumn(tbl, 'is_demo', 'INTEGER NOT NULL DEFAULT 0');
  }
}
