import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { db, UPLOAD_DIR } from './db.ts';
import { amountToArabicWords } from './tafqit.ts';

// Minimal deterministic CRC32 + zlib PNG generator (zero external dependencies)
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// 5x7 crisp bitmap glyphs for demo proof banner text
const GLYPHS: Record<string, string[]> = {
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01110'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function createDemoProofPngBuffer(): Buffer {
  const W = 560;
  const H = 280;
  const stride = W * 3 + 1;
  const raw = Buffer.alloc(stride * H);

  const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const idx = y * stride + 1 + x * 3;
    raw[idx] = r;
    raw[idx + 1] = g;
    raw[idx + 2] = b;
  };

  const fillRect = (x0: number, y0: number, rw: number, rh: number, r: number, g: number, b: number) => {
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        setPixel(x, y, r, g, b);
      }
    }
  };

  const drawText = (text: string, x0: number, y0: number, scale: number, r: number, g: number, b: number) => {
    let cursor = x0;
    for (const ch of text.toUpperCase()) {
      const glyph = GLYPHS[ch] || GLYPHS[' '];
      for (let gy = 0; gy < 7; gy++) {
        for (let gx = 0; gx < 5; gx++) {
          if (glyph[gy][gx] === '1') {
            fillRect(cursor + gx * scale, y0 + gy * scale, scale, scale, r, g, b);
          }
        }
      }
      cursor += 6 * scale;
    }
  };

  // White background & crisp receipt border
  fillRect(0, 0, W, H, 248, 249, 247);
  fillRect(16, 16, W - 32, H - 32, 255, 255, 255);
  // Dark green top banner (#14532D -> 20, 83, 45)
  fillRect(16, 16, W - 32, 62, 20, 83, 45);
  // Subtle frame lines (#CBD5CE -> 203, 213, 206)
  fillRect(16, 16, W - 32, 2, 20, 83, 45);
  fillRect(16, H - 18, W - 32, 2, 203, 213, 206);
  fillRect(16, 16, 2, H - 32, 203, 213, 206);
  fillRect(W - 18, 16, 2, H - 32, 203, 213, 206);

  drawText('SHERBAS CHARITY DEMO PROOF', 40, 36, 3, 255, 255, 255);

  // Soft emerald summary strip
  fillRect(36, 98, W - 72, 64, 236, 253, 245);
  drawText('AMOUNT: 1000 EGP', 54, 118, 3, 20, 83, 45);

  // Reference lines
  drawText('REF: DEMO-PEND-2002', 40, 184, 3, 24, 35, 29);
  drawText('DEMO DATA - FOR TEST ONLY', 40, 224, 2, 180, 83, 9);

  // Scanline filter type = 0 for all rows (already 0 from Buffer.alloc)
  const compressed = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function writeDemoProofFile(originalName: string, ownerPersonId: number): string {
  const pngBuffer = createDemoProofPngBuffer();
  const storedFilename = `${crypto.randomUUID()}.png`;
  const fullPath = path.join(UPLOAD_DIR, storedFilename);
  fs.writeFileSync(fullPath, pngBuffer);

  const fileId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO stored_files (
      id, original_name, stored_filename, mime_type, size_bytes,
      entity_type, uploaded_by_user_id, owner_person_id, created_at
    ) VALUES (?, ?, ?, 'image/png', ?, 'donation_proof', NULL, ?, ?)
  `).run(fileId, originalName, storedFilename, pngBuffer.length, ownerPersonId, new Date().toISOString());

  return fileId;
}

/**
 * Seeds EXACTLY ONE clearly-marked demo example per entity/section if the database
 * starts completely clean and demo mode was not explicitly cleared.
 * Strictly NEVER creates extra user login accounts or bypasses Super Admin creation.
 */
export function seedDemoDataIfEligible(force = false): boolean {
  if (!force && process.env.SKIP_DEMO_SEED === '1') {
    return false;
  }

  const settings = db.prepare('SELECT demo_cleared FROM charity_settings WHERE id = 1').get() as
    | { demo_cleared?: number }
    | undefined;

  if (!force && settings?.demo_cleared === 1) {
    return false;
  }

  const existingPersons = (db.prepare('SELECT COUNT(*) as c FROM persons').get() as { c: number }).c;
  const existingProjects = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c;
  const existingAccounts = (db.prepare('SELECT COUNT(*) as c FROM financial_accounts').get() as { c: number }).c;

  if (!force && (existingPersons > 0 || existingProjects > 0 || existingAccounts > 0)) {
    return false;
  }

  // If forcing restore, ensure existing demo rows are cleared cleanly first
  if (force) {
    const existingDemoCount = (db.prepare('SELECT COUNT(*) as c FROM donations WHERE is_demo = 1').get() as { c: number }).c;
    if (existingDemoCount > 0) return false;
  }

  const nowDate = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  db.transaction(() => {
    if (force) {
      db.prepare('UPDATE charity_settings SET demo_cleared = 0, updated_at = ? WHERE id = 1').run(nowIso);
    }

    // 1. One Cash Safe Account & One Bank Account (NO extra login users!)
    const safeRes = db
      .prepare(`
        INSERT INTO financial_accounts (
          name_ar, account_type, fund_type, account_number, bank_name,
          current_balance, is_active, notes, is_demo, created_at, updated_at
        ) VALUES (?, 'cash_safe', 'general', 'SAFE-DEMO-01', '', 700, 1, ?, 1, ?, ?)
      `)
      .run('خزينة الجمعية الرئيسية [بيانات تجريبية]', 'حساب خزينة تجريبي للاختبار فقط', nowIso, nowIso);
    const safeAccId = Number(safeRes.lastInsertRowid);

    const bankRes = db
      .prepare(`
        INSERT INTO financial_accounts (
          name_ar, account_type, fund_type, account_number, bank_name,
          current_balance, is_active, notes, is_demo, created_at, updated_at
        ) VALUES (?, 'bank', 'general', '0000-0000-0000-DEMO', 'بنك تجريبي للاختبار', 1500, 1, ?, 1, ?, ?)
      `)
      .run('الحساب البنكي الموحد [بيانات تجريبية]', 'حساب بنكي تجريبي للاختبار فقط', nowIso, nowIso);
    const bankAccId = Number(bankRes.lastInsertRowid);

    // 2. One Donor, One Employee, One Beneficiary, One Volunteer (Persons ONLY, NO login user accounts!)
    const donorRes = db
      .prepare(`
        INSERT INTO persons (
          full_name, phone, normalized_phone, address, area, person_type, department, job_title,
          join_date, notes, status, is_test_record, is_demo, created_at, updated_at
        ) VALUES (?, '01000000001', '01000000001', 'شرباص - عنوان تجريبي', 'شرباص', 'donor', '', '', ?, ?, 'active', 1, 1, ?, ?)
      `)
      .run(
        'متبرع تجريبي - الأستاذ طارق محمود [بيانات تجريبية]',
        nowDate,
        'مثال واحد تجريبي لقسم المتبرعين (بدون حساب دخول - بيانات تجريبية)',
        nowIso,
        nowIso
      );
    const donorId = Number(donorRes.lastInsertRowid);

    const empRes = db
      .prepare(`
        INSERT INTO persons (
          full_name, phone, normalized_phone, address, area, person_type, department, job_title,
          join_date, notes, status, is_test_record, is_demo, created_at, updated_at
        ) VALUES (?, '01000000002', '01000000002', 'مقر الجمعية - تجريبي', 'شرباص', 'employee', 'إدارة الحالات والبحث', 'باحث ميداني (تجريبي)', ?, ?, 'active', 1, 1, ?, ?)
      `)
      .run(
        'موظف تجريبي - أحمد علي حسن [بيانات تجريبية]',
        nowDate,
        'مثال واحد تجريبي للموظفين (بدون حساب دخول تلقائي - بيانات تجريبية)',
        nowIso,
        nowIso
      );
    const employeeId = Number(empRes.lastInsertRowid);

    const benRes = db
      .prepare(`
        INSERT INTO persons (
          full_name, phone, normalized_phone, address, area, person_type, department, job_title,
          join_date, notes, status, is_test_record, is_demo, created_at, updated_at
        ) VALUES (?, '01000000003', '01000000003', 'شرباص - الحارة الوسطى (تجريبي)', 'شرباص', 'beneficiary', '', '', ?, ?, 'active', 1, 1, ?, ?)
      `)
      .run(
        'مستفيد تجريبي - أسرة السيدة سعاد حسن [بيانات تجريبية]',
        nowDate,
        'مثال واحد تجريبي للمستفيدين (بيانات تجريبية)',
        nowIso,
        nowIso
      );
    const beneficiaryId = Number(benRes.lastInsertRowid);

    const volRes = db
      .prepare(`
        INSERT INTO persons (
          full_name, phone, normalized_phone, address, area, person_type, department, job_title,
          join_date, notes, status, is_test_record, is_demo, created_at, updated_at
        ) VALUES (?, '01000000004', '01000000004', 'شرباص - تجريبي', 'شرباص', 'volunteer', 'التوزيع الميداني', 'متطوع ميداني (تجريبي)', ?, ?, 'active', 1, 1, ?, ?)
      `)
      .run(
        'متطوع تجريبي - كريم محمد إبراهيم [بيانات تجريبية]',
        nowDate,
        'مثال واحد تجريبي للمتطوعين (بيانات تجريبية)',
        nowIso,
        nowIso
      );
    const volunteerId = Number(volRes.lastInsertRowid);

    // 3. One Charity Project & One Donation Campaign
    const projectRes = db
      .prepare(`
        INSERT INTO projects (
          code, record_kind, title_ar, category_ar, description_ar, goal_ar,
          image_url, target_budget, fund_type, start_date, end_date,
          manager_person_id, status, is_public, is_archived, is_demo, created_at, updated_at
        ) VALUES (
          'PRJ-DEMO-00001', 'project',
          'مشروع تطوير وصلات المياه النظيفة [بيانات تجريبية]',
          'مشروع خيري (تجريبي)',
          'مثال واحد تجريبي لمشروع خيري متكامل مرتبط بالتبرع والإيصال والمصروف للتجربة فقط.',
          'توصيل 10 وصلات مياه (مثال تجريبي)',
          '/src/assets/images/program_clean_water_1794384968036.jpg',
          20000, 'general', ?, '', ?, 'open', 1, 0, 1, ?, ?
        )
      `)
      .run(nowDate, employeeId, nowIso, nowIso);
    const projectId = Number(projectRes.lastInsertRowid);

    const campaignRes = db
      .prepare(`
        INSERT INTO projects (
          code, record_kind, title_ar, category_ar, description_ar, goal_ar,
          image_url, target_budget, fund_type, start_date, end_date,
          manager_person_id, status, is_public, is_archived, is_demo, created_at, updated_at
        ) VALUES (
          'CMP-DEMO-00001', 'campaign',
          'حملة توفير السلال الغذائية للأسر [بيانات تجريبية]',
          'حملة تبرعات (تجريبي)',
          'مثال واحد تجريبي لحملة تبرعات مرتبطة بطلب التبرع المعلق قيد المراجعة.',
          'تجهيز 100 طرد غذائي (مثال تجريبي)',
          '/src/assets/images/program_medical_relief_1794384967169.jpg',
          10000, 'general', ?, '', ?, 'open', 1, 0, 1, ?, ?
        )
      `)
      .run(nowDate, volunteerId, nowIso, nowIso);
    const campaignId = Number(campaignRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO project_updates (project_id, title_ar, details_ar, progress_percent, created_at)
      VALUES (?, 'تحديث تجريبي لتقدم المشروع [بيانات تجريبية]', 'هذا تحديث تجريبي للاختبار يوضح متابعة نسب الإنجاز على الموقع العام.', 25, ?)
    `).run(projectId, nowIso);

    // 4. One Humanitarian Case (linked to Beneficiary & Employee)
    const caseRes = db
      .prepare(`
        INSERT INTO humanitarian_cases (
          file_number, beneficiary_person_id, case_type, description_ar,
          priority, family_size, requested_amount, status, assigned_person_id,
          is_archived, is_demo, created_at, updated_at
        ) VALUES (
          'CAS-DEMO-00001', ?, 'دعم أسرة أولى بالرعاية (تجريبي)',
          'حالة إنسانية تجريبية لاختبار البحث الاجتماعي وتحديد الأولوية وصرف المساعدات.',
          'high', 4, 1200, 'approved', ?, 0, 1, ?, ?
        )
      `)
      .run(beneficiaryId, employeeId, nowIso, nowIso);
    const caseId = Number(caseRes.lastInsertRowid);

    // 5. One Approved Donation + Official Receipt + Bank Receipt Voucher
    const approvedProofId = writeDemoProofFile('demo_approved_transfer_proof.png', donorId);
    const approvedDonRes = db
      .prepare(`
        INSERT INTO donations (
          reference_code, donor_person_id, donation_type, project_id, case_category_label,
          amount, payment_method, transaction_ref, donation_date, proof_file_id,
          donor_notes, status, financial_account_id, is_zakat, internal_note,
          reviewed_at, approved_at, is_demo, created_at, updated_at
        ) VALUES (
          'DON-DEMO-00001', ?, 'project', ?, '', 2000,
          'تحويل بنكي (بيانات تجريبية)', 'DEMO-TRX-1001', ?, ?,
          'تبرع تجريبي معتمد للاختبار فقط — لا يُعد معاملة مالية حقيقية',
          'approved', ?, 0, 'اعتماد تجريبي للاختبار فقط (بيانات تجريبية)',
          ?, ?, 1, ?, ?
        )
      `)
      .run(donorId, projectId, nowDate, approvedProofId, bankAccId, nowIso, nowIso, nowIso, nowIso);
    const approvedDonId = Number(approvedDonRes.lastInsertRowid);

    db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(approvedDonId, approvedProofId);

    db.prepare(`
      INSERT INTO donation_reviews (donation_id, action, previous_status, new_status, note, created_at)
      VALUES (?, 'APPROVED_DEMO', 'pending_review', 'approved', 'اعتماد تجريبي للعرض والاختبار (بيانات تجريبية)', ?)
    `).run(approvedDonId, nowIso);

    const amountWords = `${amountToArabicWords(2000)} (بيانات تجريبية للاختبار فقط)`;
    db.prepare(`
      INSERT INTO receipts (
        receipt_number, donation_id, donor_person_id, donor_name, amount, amount_words_ar,
        donation_type_label, project_title, payment_method, donation_date,
        approved_by_name, approved_at, verification_hash, print_count, is_demo, created_at
      ) VALUES (
        'SHB-DEMO-00001', ?, ?, 'متبرع تجريبي - الأستاذ طارق محمود [بيانات تجريبية]', 2000, ?,
        'تبرع لمشروع محدد (تجريبي)', 'مشروع تطوير وصلات المياه النظيفة [بيانات تجريبية]',
        'تحويل بنكي (بيانات تجريبية)', ?, 'مراجعة تجريبية - النظام (بيانات تجريبية)', ?,
        'DEMO-VERIFY-001', 0, 1, ?
      )
    `).run(approvedDonId, donorId, amountWords, nowDate, nowIso, nowIso);

    db.prepare(`
      INSERT INTO financial_transactions (
        entry_number, entry_type, account_id, direction, amount, balance_after,
        reference_type, reference_id, project_id, description_ar, transaction_date,
        is_demo, created_at
      ) VALUES (
        'RCV-DEMO-00001', 'receipt_voucher', ?, 'credit', 2000, 2000,
        'donation', ?, ?, 'سند قبض تجريبي للتبرع (DON-DEMO-00001) [بيانات تجريبية]', ?, 1, ?
      )
    `).run(bankAccId, approvedDonId, projectId, nowDate, nowIso);

    // 6. One Pending Review Donation Request WITH Visual Proof PNG attached!
    const pendingProofId = writeDemoProofFile('demo_pending_transfer_proof.png', donorId);
    const pendingDonRes = db
      .prepare(`
        INSERT INTO donations (
          reference_code, donor_person_id, donation_type, project_id, case_category_label,
          amount, payment_method, transaction_ref, donation_date, proof_file_id,
          donor_notes, status, is_zakat, is_demo, created_at, updated_at
        ) VALUES (
          'DON-DEMO-00002', ?, 'project', ?, '', 1000,
          'إنستاباي (بيانات تجريبية)', 'DEMO-PEND-2002', ?, ?,
          'طلب تبرع تجريبي بانتظار المراجعة — اضغط معاينة الإثبات ثم راجع واعتمد للاختبار',
          'pending_review', 0, 1, ?, ?
        )
      `)
      .run(donorId, campaignId, nowDate, pendingProofId, nowIso, nowIso);
    const pendingDonId = Number(pendingDonRes.lastInsertRowid);
    db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(pendingDonId, pendingProofId);

    db.prepare(`
      INSERT INTO donation_reviews (donation_id, action, previous_status, new_status, note, created_at)
      VALUES (?, 'SUBMITTED_DEMO', 'new', 'pending_review', 'طلب تبرع تجريبي بانتظار المراجعة والاعتماد', ?)
    `).run(pendingDonId, nowIso);

    // 7. One Expense Voucher (paid from Bank Account -> 2000 - 500 = 1500)
    const expRes = db
      .prepare(`
        INSERT INTO expenses (
          voucher_number, title_ar, category_ar, amount, expense_date,
          project_id, financial_account_id, is_zakat_expense, beneficiary_or_vendor,
          description_ar, status, approved_at, paid_at, is_demo, created_at, updated_at
        ) VALUES (
          'EXP-DEMO-00001', 'شراء مستلزمات وصلات المياه [بيانات تجريبية]', 'مصروفات مشروعات (تجريبي)',
          500, ?, ?, ?, 0, 'مورد أدوات سباكة (تجريبي)',
          'مصروف تجريبي للاختبار فقط — لا يُعد معاملة مالية حقيقية',
          'paid', ?, ?, 1, ?, ?
        )
      `)
      .run(nowDate, projectId, bankAccId, nowIso, nowIso, nowIso, nowIso);
    const expId = Number(expRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO financial_transactions (
        entry_number, entry_type, account_id, direction, amount, balance_after,
        reference_type, reference_id, project_id, description_ar, transaction_date,
        is_demo, created_at
      ) VALUES (
        'PVT-DEMO-00001', 'payment_voucher', ?, 'debit', 500, 1500,
        'expense', ?, ?, 'سند صرف تجريبي للمصروف (EXP-DEMO-00001) [بيانات تجريبية]', ?, 1, ?
      )
    `).run(bankAccId, expId, projectId, nowDate, nowIso);

    // 8. One Aid Record (disbursed from Cash Safe: 1000 - 300 = 700)
    const aidRes = db
      .prepare(`
        INSERT INTO aids (
          aid_number, case_id, beneficiary_person_id, aid_type, delivery_mode,
          amount, funding_source_label, financial_account_id, is_zakat,
          aid_date, responsible_person_id, notes, status, approved_at, disbursed_at,
          is_demo, created_at, updated_at
        ) VALUES (
          'AID-DEMO-00001', ?, ?, 'financial', 'financial',
          300, 'مساعدة تجريبية (بيانات تجريبية)', ?, 0,
          ?, ?, 'مساعدة واحدة تجريبية مرتبطة بالحالة الإنسانية والمستفيد [بيانات تجريبية]',
          'disbursed', ?, ?, 1, ?, ?
        )
      `)
      .run(caseId, beneficiaryId, safeAccId, nowDate, employeeId, nowIso, nowIso, nowIso, nowIso);
    const aidId = Number(aidRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO financial_transactions (
        entry_number, entry_type, account_id, direction, amount, balance_after,
        reference_type, reference_id, description_ar, transaction_date,
        is_demo, created_at
      ) VALUES (
        'PVT-DEMO-00002', 'payment_voucher', ?, 'debit', 300, 700,
        'aid', ?, 'سند صرف تجريبي للمساعدة (AID-DEMO-00001) [بيانات تجريبية]', ?, 1, ?
      )
    `).run(safeAccId, aidId, nowDate, nowIso);

    // 9. One Warehouse Item + One Inbound Movement + One Outbound Movement
    const itemRes = db
      .prepare(`
        INSERT INTO inventory_items (
          item_code, name_ar, category_ar, unit_ar, current_qty, min_threshold,
          notes, is_demo, created_at, updated_at
        ) VALUES (
          'ITM-DEMO-00001', 'كرتونة مواد غذائية [بيانات تجريبية]', 'مواد غذائية (تجريبي)', 'كرتونة',
          12, 5, 'صنف واحد تجريبي لاختبار المخزن وحركات الوارد والصرف', 1, ?, ?
        )
      `)
      .run(nowIso, nowIso);
    const itemId = Number(itemRes.lastInsertRowid);

    db.prepare(`
      INSERT INTO inventory_movements (
        movement_number, item_id, movement_type, quantity, qty_after, movement_date,
        source_or_recipient, donor_person_id, responsible_person_id, notes,
        is_demo, created_at
      ) VALUES (
        'INV-DEMO-IN-01', ?, 'inbound', 15, 15, ?,
        'توريد تجريبي من المتبرع [بيانات تجريبية]', ?, ?, 'حركة وارد واحدة تجريبية', 1, ?
      )
    `).run(itemId, nowDate, donorId, volunteerId, nowIso);

    db.prepare(`
      INSERT INTO inventory_movements (
        movement_number, item_id, movement_type, quantity, qty_after, movement_date,
        source_or_recipient, case_id, responsible_person_id, notes,
        is_demo, created_at
      ) VALUES (
        'INV-DEMO-OUT-01', ?, 'outbound', 3, 12, ?,
        'صرف تجريبي للحالة الإنسانية [بيانات تجريبية]', ?, ?, 'حركة صرف واحدة تجريبية', 1, ?
      )
    `).run(itemId, nowDate, caseId, employeeId, nowIso);

    // 10. One Kafala (Zakat / Kafala Program)
    db.prepare(`
      INSERT INTO zakat_kafalat (
        program_code, program_type, title_ar, beneficiary_person_id, case_id, donor_person_id,
        project_id, monthly_amount, purpose_ar, start_date, status, notes,
        is_demo, created_at, updated_at
      ) VALUES (
        'ZKT-DEMO-00001', 'family_kafala', 'كفالة أسرة تجريبية شهريًا [بيانات تجريبية]',
        ?, ?, ?, ?, 400,
        'مثال واحد تجريبي لقسم الزكاة والكفالات', ?, 'active',
        'بيانات تجريبية للاختبار فقط — لا تُعد التزامًا ماليًا حقيقيًا', 1, ?, ?
      )
    `).run(beneficiaryId, caseId, donorId, projectId, nowDate, nowIso, nowIso);

    // Log audit event for demo readiness
    db.prepare(`
      INSERT INTO audit_logs (actor_user_id, actor_name, action, entity_type, entity_id, details_json, ip_address, created_at)
      VALUES (NULL, 'نظام التهيئة التجريبية', 'DEMO_DATA_SEEDED', 'system', 'demo', ?, '127.0.0.1', ?)
    `).run(JSON.stringify({ mode: 'single_item_per_section', note: 'بيانات تجريبية للاختبار فقط' }), nowIso);
  })();

  // If a super_admin already exists, ensure the single demo notification is added too
  const adminUser = db
    .prepare(`
      SELECT u.id FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.role_key = 'super_admin' AND u.status = 'active'
      ORDER BY u.id ASC LIMIT 1
    `)
    .get() as { id: number } | undefined;

  if (adminUser) {
    ensureDemoNotificationForSuperAdmin(adminUser.id);
  }

  return true;
}

export function ensureDemoNotificationForSuperAdmin(userId: number): void {
  const pendingDemoCount = (db.prepare("SELECT COUNT(*) as c FROM donations WHERE is_demo = 1 AND status = 'pending_review'").get() as { c: number }).c;
  if (pendingDemoCount === 0) return;

  const hasDemoNotif = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_demo = 1').get(userId) as { c: number }).c;
  if (hasDemoNotif > 0) return;

  db.prepare(`
    INSERT INTO notifications (
      user_id, title_ar, message_ar, category, link_tab, entity_type, entity_id, is_read, is_demo, created_at
    ) VALUES (?, ?, ?, 'warning', 'donation_reviews', 'donation', NULL, 0, 1, ?)
  `).run(
    userId,
    '[بيانات تجريبية] طلب تبرع تجريبي بانتظار المراجعة',
    'يوجد مثال واحد لطلب تبرع بانتظار المراجعة (DON-DEMO-00002 بمبلغ 1,000 ج.م) مرفق معه صورة إثبات لاختبار المراجعة والاعتماد وإصدار الإيصال.',
    new Date().toISOString()
  );
}

export function clearAllDemoData(): { removedCounts: Record<string, number> } {
  const nowIso = new Date().toISOString();
  const demoFiles = db
    .prepare(`
      SELECT sf.id, sf.stored_filename
      FROM stored_files sf
      WHERE sf.id IN (SELECT proof_file_id FROM donations WHERE is_demo = 1 AND proof_file_id IS NOT NULL)
    `)
    .all() as Array<{ id: string; stored_filename: string }>;

  const counts: Record<string, number> = {};

  db.transaction(() => {
    counts.notifications = db.prepare('DELETE FROM notifications WHERE is_demo = 1').run().changes;
    counts.receipts = db
      .prepare('DELETE FROM receipts WHERE is_demo = 1 OR donation_id IN (SELECT id FROM donations WHERE is_demo = 1)')
      .run().changes;
    counts.transactions = db
      .prepare(
        "DELETE FROM financial_transactions WHERE is_demo = 1 OR (reference_type = 'donation' AND reference_id IN (SELECT id FROM donations WHERE is_demo = 1))"
      )
      .run().changes;
    counts.zakat = db.prepare('DELETE FROM zakat_kafalat WHERE is_demo = 1').run().changes;
    counts.aids = db
      .prepare('DELETE FROM aids WHERE is_demo = 1')
      .run().changes;
    counts.movements = db
      .prepare('DELETE FROM inventory_movements WHERE is_demo = 1')
      .run().changes;
    counts.items = db
      .prepare(
        'DELETE FROM inventory_items WHERE is_demo = 1 AND NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.item_id = inventory_items.id)'
      )
      .run().changes;
    counts.expenses = db.prepare('DELETE FROM expenses WHERE is_demo = 1').run().changes;
    counts.donations = db
      .prepare('DELETE FROM donations WHERE is_demo = 1 AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.donation_id = donations.id)')
      .run().changes;
    counts.cases = db
      .prepare(
        'DELETE FROM humanitarian_cases WHERE is_demo = 1 AND NOT EXISTS (SELECT 1 FROM aids a WHERE a.case_id = humanitarian_cases.id)'
      )
      .run().changes;
    counts.projects = db.prepare('DELETE FROM projects WHERE is_demo = 1').run().changes;
    counts.accounts = db
      .prepare(`
        DELETE FROM financial_accounts
        WHERE is_demo = 1
          AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.financial_account_id = financial_accounts.id)
          AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.financial_account_id = financial_accounts.id)
          AND NOT EXISTS (SELECT 1 FROM financial_transactions ft WHERE ft.account_id = financial_accounts.id)
          AND NOT EXISTS (SELECT 1 FROM account_transfers atf WHERE atf.from_account_id = financial_accounts.id OR atf.to_account_id = financial_accounts.id)
          AND NOT EXISTS (SELECT 1 FROM account_reconciliations ar WHERE ar.account_id = financial_accounts.id)
      `)
      .run().changes;
    counts.persons = db
      .prepare(`
        DELETE FROM persons
        WHERE is_demo = 1
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.person_id = persons.id)
          AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.donor_person_id = persons.id)
          AND NOT EXISTS (SELECT 1 FROM receipts r WHERE r.donor_person_id = persons.id)
          AND NOT EXISTS (SELECT 1 FROM humanitarian_cases c WHERE c.beneficiary_person_id = persons.id)
          AND NOT EXISTS (SELECT 1 FROM aids a WHERE a.beneficiary_person_id = persons.id)
      `)
      .run().changes;

    for (const f of demoFiles) {
      const stillUsed = (db.prepare('SELECT COUNT(*) as c FROM donations WHERE proof_file_id = ?').get(f.id) as { c: number }).c;
      if (stillUsed === 0) {
        db.prepare('DELETE FROM stored_files WHERE id = ?').run(f.id);
      }
    }

    db.prepare('UPDATE charity_settings SET demo_cleared = 1, updated_at = ? WHERE id = 1').run(nowIso);
  })();

  for (const f of demoFiles) {
    try {
      const p = path.join(UPLOAD_DIR, f.stored_filename);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // Ignore cleanup error
    }
  }

  return { removedCounts: counts };
}
