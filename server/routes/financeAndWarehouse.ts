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

export const financeAndWarehouseRouter = Router();

// =======================
// FINANCIAL ACCOUNTS (Treasuries & Banks)
// =======================
financeAndWarehouseRouter.get('/finance/accounts', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  if (
    !userHasPermission(actor, 'finance', 'view') &&
    !userHasPermission(actor, 'donations', 'approve') &&
    !userHasPermission(actor, 'aids', 'approve')
  ) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية الاطلاع على الخزائن والحسابات البنكية' });
  }

  // Note: If user only has donations:approve (not finance:view), still let them select target account IDs; full balance shown to finance:view
  const canSeeBalances = userHasPermission(actor, 'finance', 'view');
  const rows = db.prepare('SELECT * FROM financial_accounts ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  res.json({
    accounts: rows.map((acc) => ({
      ...acc,
      current_balance: canSeeBalances ? acc.current_balance : null,
    })),
  });
});

financeAndWarehouseRouter.post('/finance/accounts', requirePermission('finance', 'create'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const { nameAr, accountType, fundType, accountNumber, bankName, openingBalance, notes } = req.body || {};

  if (!nameAr || String(nameAr).trim().length < 2) {
    return res.status(400).json({ error: 'يرجى إدخال اسم الخزينة أو الحساب البنكي' });
  }
  if (!['cash_safe', 'bank', 'wallet'].includes(String(accountType))) {
    return res.status(400).json({ error: 'نوع الحساب غير صالح' });
  }
  const initialBal = Number(openingBalance || 0);
  if (!Number.isFinite(initialBal) || initialBal < 0) {
    return res.status(400).json({ error: 'الرصيد الافتتاحي غير صالح' });
  }

  const now = new Date().toISOString();
  const id = db.transaction(() => {
    const r = db
      .prepare(`
        INSERT INTO financial_accounts (
          name_ar, account_type, fund_type, account_number, bank_name, current_balance,
          is_active, notes, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `)
      .run(
        String(nameAr).trim(),
        String(accountType),
        ['general', 'zakat', 'restricted'].includes(String(fundType)) ? String(fundType) : 'general',
        String(accountNumber || '').trim(),
        String(bankName || '').trim(),
        initialBal,
        String(notes || '').trim(),
        actor.userId,
        now,
        now
      );
    const accId = Number(r.lastInsertRowid);
    if (initialBal > 0) {
      const entryNumber = nextSequentialCode('OB', 'financial_transactions', 'entry_number');
      db.prepare(`
        INSERT INTO financial_transactions (
          entry_number, entry_type, account_id, direction, amount, balance_after,
          reference_type, reference_id, description_ar, transaction_date, created_by_user_id, created_at
        ) VALUES (?, 'reconciliation_adjustment', ?, 'credit', ?, ?, 'opening_balance', ?, ?, ?, ?, ?)
      `).run(entryNumber, accId, initialBal, initialBal, accId, `رصيد افتتاحي لحساب ${nameAr}`, now.slice(0, 10), actor.userId, now);
    }
    return accId;
  })();

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CREATE_FINANCIAL_ACCOUNT',
    entityType: 'financial_account',
    entityId: id,
    details: { nameAr, accountType, fundType, openingBalance: initialBal },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, id, message: 'تم إنشاء الحساب المالي بنجاح' });
});

financeAndWarehouseRouter.put('/finance/accounts/:id', requirePermission('finance', 'edit'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const id = Number(req.params.id);
  const { nameAr, bankName, accountNumber, isActive, notes } = req.body || {};
  db.prepare(`
    UPDATE financial_accounts
    SET name_ar = ?, bank_name = ?, account_number = ?, is_active = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    String(nameAr || '').trim(),
    String(bankName || '').trim(),
    String(accountNumber || '').trim(),
    isActive ? 1 : 0,
    String(notes || '').trim(),
    new Date().toISOString(),
    id
  );
  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'UPDATE_FINANCIAL_ACCOUNT',
    entityType: 'financial_account',
    entityId: id,
    ipAddress: req.ip,
  });
  res.json({ ok: true, message: 'تم تحديث بيانات الحساب المالي' });
});

// =======================
// EXPENSES & PAYMENT VOUCHERS
// =======================
financeAndWarehouseRouter.get('/finance/expenses', requirePermission('finance', 'view'), (_req, res) => {
  const expenses = db
    .prepare(`
      SELECT
        e.*,
        p.title_ar AS project_title,
        hc.file_number AS case_file_number,
        fa.name_ar AS account_name,
        cu.full_name AS created_by_name,
        au.full_name AS approved_by_name,
        sf.original_name AS attachment_name,
        sf.mime_type AS attachment_mime_type
      FROM expenses e
      LEFT JOIN projects p ON p.id = e.project_id
      LEFT JOIN humanitarian_cases hc ON hc.id = e.case_id
      JOIN financial_accounts fa ON fa.id = e.financial_account_id
      LEFT JOIN users u1 ON u1.id = e.created_by_user_id
      LEFT JOIN persons cu ON cu.id = u1.person_id
      LEFT JOIN users u2 ON u2.id = e.approved_by_user_id
      LEFT JOIN persons au ON au.id = u2.person_id
      LEFT JOIN stored_files sf ON sf.id = e.attachment_file_id
      ORDER BY e.created_at DESC
    `)
    .all();

  res.json({ expenses });
});

financeAndWarehouseRouter.post('/finance/expenses', requirePermission('finance', 'create'), uploadMiddleware.single('attachment'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const {
    titleAr,
    categoryAr,
    amount,
    expenseDate,
    projectId,
    caseId,
    financialAccountId,
    isZakatExpense,
    beneficiaryOrVendor,
    descriptionAr,
    isPublicAttachment,
  } = req.body || {};

  const numAmount = Number(amount);
  if (!titleAr || !categoryAr || !Number.isFinite(numAmount) || numAmount <= 0 || !financialAccountId) {
    return res.status(400).json({ error: 'يرجى استكمال بيانات المصروف والحساب المالي والمبلغ' });
  }

  const acc = db.prepare('SELECT id, fund_type FROM financial_accounts WHERE id = ? AND is_active = 1').get(Number(financialAccountId)) as
    | { id: number; fund_type: string }
    | undefined;
  if (!acc) return res.status(404).json({ error: 'الحساب المالي غير موجود أو موقوف' });

  const zakatFlag = isZakatExpense === true || isZakatExpense === 'true' || isZakatExpense === '1' ? 1 : 0;
  const publicAttFlag = isPublicAttachment === true || isPublicAttachment === 'true' || isPublicAttachment === '1' ? 1 : 0;
  if (acc.fund_type === 'zakat' && !zakatFlag) {
    return res.status(400).json({ error: 'الحساب المحدد مخصص للزكاة؛ لا يمكن الصرف منه على بنود غير مخصصة للزكاة' });
  }

  const now = new Date().toISOString();
  const voucherNumber = nextSequentialCode('PV', 'expenses', 'voucher_number');
  const attachmentFileId = req.file ? saveStoredFile(req.file, 'expense_attachment', actor.userId, null) : null;

  const r = db
    .prepare(`
      INSERT INTO expenses (
        voucher_number, title_ar, category_ar, amount, expense_date, project_id, case_id,
        financial_account_id, is_zakat_expense, beneficiary_or_vendor, description_ar,
        attachment_file_id, is_public_attachment, status, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?)
    `)
    .run(
      voucherNumber,
      String(titleAr).trim(),
      String(categoryAr).trim(),
      numAmount,
      String(expenseDate || now.slice(0, 10)).trim(),
      projectId ? Number(projectId) : null,
      caseId ? Number(caseId) : null,
      acc.id,
      zakatFlag,
      String(beneficiaryOrVendor || '').trim(),
      String(descriptionAr || '').trim(),
      attachmentFileId,
      publicAttFlag,
      actor.userId,
      now,
      now
    );

  const expId = Number(r.lastInsertRowid);
  if (attachmentFileId) {
    db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(expId, attachmentFileId);
  }

  createNotificationForPermission({
    permissionKey: 'finance:approve',
    titleAr: 'سند صرف جديد بانتظار الاعتماد',
    messageAr: `طلب ${actor.fullName} اعتماد مصروف (${voucherNumber}) بمبلغ ${numAmount.toLocaleString('en-US')} ج.م لبند ${titleAr}.`,
    category: 'warning',
    linkTab: 'finance',
    entityType: 'expense',
    entityId: expId,
    excludeUserId: actor.userId,
  });

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CREATE_EXPENSE',
    entityType: 'expense',
    entityId: expId,
    details: { voucherNumber, amount: numAmount, titleAr, isPublicAttachment: Boolean(publicAttFlag) },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, id: expId, voucherNumber, message: 'تم تسجيل المصروف وإحالته للاعتماد المالي' });
});

financeAndWarehouseRouter.patch('/finance/expenses/:id/public-attachment', requirePermission('finance', 'edit'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const expId = Number(req.params.id);
  const { isPublicAttachment } = req.body || {};
  const existing = db.prepare('SELECT id, voucher_number FROM expenses WHERE id = ?').get(expId) as
    | { id: number; voucher_number: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'سند الصرف غير موجود' });

  const flag = isPublicAttachment ? 1 : 0;
  db.prepare('UPDATE expenses SET is_public_attachment = ?, updated_at = ? WHERE id = ?').run(
    flag,
    new Date().toISOString(),
    expId
  );

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'TOGGLE_EXPENSE_ATTACHMENT_PUBLICITY',
    entityType: 'expense',
    entityId: expId,
    details: { voucherNumber: existing.voucher_number, isPublicAttachment: Boolean(flag) },
    ipAddress: req.ip,
  });

  res.json({
    ok: true,
    isPublicAttachment: Boolean(flag),
    message: flag ? 'تمت إتاحة مرفق الفاتورة للمتبرعين في قسم الشفافية' : 'تم حجب مرفق الفاتورة عن الظهور العام',
  });
});

financeAndWarehouseRouter.post('/finance/expenses/:id/action', requireAuth, (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const expId = Number(req.params.id);
  const { action, rejectionReason } = req.body || {};

  if (
    actor.roleKey === 'donor' ||
    (!userHasPermission(actor, 'finance', 'approve') &&
      !userHasPermission(actor, 'finance', 'reject') &&
      !userHasPermission(actor, 'finance', 'cancel'))
  ) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية البت في المصروفات' });
  }

  if (!['paid', 'rejected', 'cancelled'].includes(String(action))) {
    return res.status(400).json({ error: 'إجراء غير صالح' });
  }
  if (action === 'paid' && !userHasPermission(actor, 'finance', 'approve')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية اعتماد وصرف المصروفات' });
  }
  if (action === 'rejected' && !userHasPermission(actor, 'finance', 'reject')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية رفض المصروفات' });
  }
  if (action === 'cancelled' && !userHasPermission(actor, 'finance', 'cancel')) {
    return res.status(403).json({ error: 'ممنوع: لا تملك صلاحية إلغاء المصروفات' });
  }

  const exp = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expId) as Record<string, unknown> | undefined;
  if (!exp) return res.status(404).json({ error: 'سند الصرف غير موجود' });
  if (exp.status !== 'pending_approval') {
    return res.status(400).json({ error: 'تم البت في سند الصرف هذا مسبقًا' });
  }

  const now = new Date().toISOString();

  try {
    db.transaction(() => {
      if (action === 'rejected' || action === 'cancelled') {
        db.prepare('UPDATE expenses SET status = ?, rejection_reason = ?, updated_at = ? WHERE id = ?').run(
          String(action),
          String(rejectionReason || '').trim(),
          now,
          expId
        );
        return;
      }

      const account = db.prepare('SELECT * FROM financial_accounts WHERE id = ? AND is_active = 1').get(exp.financial_account_id) as
        | { id: number; name_ar: string; current_balance: number }
        | undefined;
      if (!account) throw new Error('ACCOUNT_NOT_FOUND');

      const amount = Number(exp.amount);
      if (account.current_balance < amount) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const newBalance = Math.round((account.current_balance - amount) * 100) / 100;
      db.prepare('UPDATE financial_accounts SET current_balance = ?, updated_at = ? WHERE id = ?').run(
        newBalance,
        now,
        account.id
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
        amount,
        newBalance,
        expId,
        exp.project_id ?? null,
        `سند صرف (${exp.voucher_number}): ${exp.title_ar}`,
        String(exp.expense_date),
        actor.userId,
        now
      );

      db.prepare(`
        UPDATE expenses
        SET status = 'paid', approved_by_user_id = ?, approved_at = ?, paid_at = ?, updated_at = ?
        WHERE id = ?
      `).run(actor.userId, now, now, now, expId);
    })();

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: `EXPENSE_${String(action).toUpperCase()}`,
      entityType: 'expense',
      entityId: expId,
      details: { voucherNumber: exp.voucher_number, amount: exp.amount },
      ipAddress: req.ip,
    });

    res.json({
      ok: true,
      message: action === 'paid' ? 'تم اعتماد المصروف وخصمه من الحساب المالي بنجاح' : 'تم تحديث حالة سند الصرف',
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'ACCOUNT_NOT_FOUND') return res.status(400).json({ error: 'الحساب المالي غير موجود أو موقوف' });
      if (err.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'رصيد الخزينة أو الحساب البنكي غير كافٍ للصرف' });
    }
    res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ إجراء المصروف' });
  }
});

// =======================
// ACCOUNT TRANSFERS, LEDGER & RECONCILIATIONS
// =======================
financeAndWarehouseRouter.get('/finance/transactions', requirePermission('finance', 'view'), (_req, res) => {
  const transactions = db
    .prepare(`
      SELECT
        ft.*,
        fa.name_ar AS account_name,
        p.title_ar AS project_title,
        per.full_name AS actor_name
      FROM financial_transactions ft
      JOIN financial_accounts fa ON fa.id = ft.account_id
      LEFT JOIN projects p ON p.id = ft.project_id
      LEFT JOIN users u ON u.id = ft.created_by_user_id
      LEFT JOIN persons per ON per.id = u.person_id
      ORDER BY ft.created_at DESC
      LIMIT 300
    `)
    .all();

  const transfers = db
    .prepare(`
      SELECT
        t.*,
        f.name_ar AS from_account_name,
        to_a.name_ar AS to_account_name,
        per.full_name AS actor_name
      FROM account_transfers t
      JOIN financial_accounts f ON f.id = t.from_account_id
      JOIN financial_accounts to_a ON to_a.id = t.to_account_id
      LEFT JOIN users u ON u.id = t.created_by_user_id
      LEFT JOIN persons per ON per.id = u.person_id
      ORDER BY t.created_at DESC
    `)
    .all();

  const reconciliations = db
    .prepare(`
      SELECT
        r.*,
        fa.name_ar AS account_name,
        per.full_name AS actor_name
      FROM account_reconciliations r
      JOIN financial_accounts fa ON fa.id = r.account_id
      LEFT JOIN users u ON u.id = r.created_by_user_id
      LEFT JOIN persons per ON per.id = u.person_id
      ORDER BY r.created_at DESC
    `)
    .all();

  res.json({ transactions, transfers, reconciliations });
});

financeAndWarehouseRouter.post('/finance/transfers', requirePermission('finance', 'create'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const { fromAccountId, toAccountId, amount, transferDate, notes } = req.body || {};
  const numAmount = Number(amount);

  if (!fromAccountId || !toAccountId || Number(fromAccountId) === Number(toAccountId)) {
    return res.status(400).json({ error: 'يرجى اختيار حسابين مختلفين للتحويل' });
  }
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'قيمة التحويل غير صالحة' });
  }

  const now = new Date().toISOString();

  try {
    const transferNumber = db.transaction(() => {
      const fromAcc = db.prepare('SELECT * FROM financial_accounts WHERE id = ? AND is_active = 1').get(Number(fromAccountId)) as
        | { id: number; name_ar: string; fund_type: string; current_balance: number }
        | undefined;
      const toAcc = db.prepare('SELECT * FROM financial_accounts WHERE id = ? AND is_active = 1').get(Number(toAccountId)) as
        | { id: number; name_ar: string; fund_type: string; current_balance: number }
        | undefined;

      if (!fromAcc || !toAcc) throw new Error('ACCOUNT_NOT_FOUND');
      if (fromAcc.fund_type === 'zakat' && toAcc.fund_type !== 'zakat') {
        throw new Error('ZAKAT_TRANSFER_BLOCKED');
      }
      if (fromAcc.current_balance < numAmount) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const trfNum = nextSequentialCode('TRF', 'account_transfers', 'transfer_number');
      const fromAfter = Math.round((fromAcc.current_balance - numAmount) * 100) / 100;
      const toAfter = Math.round((toAcc.current_balance + numAmount) * 100) / 100;

      db.prepare('UPDATE financial_accounts SET current_balance = ?, updated_at = ? WHERE id = ?').run(fromAfter, now, fromAcc.id);
      db.prepare('UPDATE financial_accounts SET current_balance = ?, updated_at = ? WHERE id = ?').run(toAfter, now, toAcc.id);

      const tRes = db
        .prepare(`
          INSERT INTO account_transfers (
            transfer_number, from_account_id, to_account_id, amount, transfer_date, notes, created_by_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(trfNum, fromAcc.id, toAcc.id, numAmount, String(transferDate || now.slice(0, 10)), String(notes || '').trim(), actor.userId, now);

      const trfId = Number(tRes.lastInsertRowid);
      db.prepare(`
        INSERT INTO financial_transactions (
          entry_number, entry_type, account_id, direction, amount, balance_after,
          reference_type, reference_id, description_ar, transaction_date, created_by_user_id, created_at
        ) VALUES (?, 'transfer_out', ?, 'debit', ?, ?, 'transfer', ?, ?, ?, ?, ?)
      `).run(
        `${trfNum}-OUT`,
        fromAcc.id,
        numAmount,
        fromAfter,
        trfId,
        `تحويل صادر إلى (${toAcc.name_ar})`,
        String(transferDate || now.slice(0, 10)),
        actor.userId,
        now
      );
      db.prepare(`
        INSERT INTO financial_transactions (
          entry_number, entry_type, account_id, direction, amount, balance_after,
          reference_type, reference_id, description_ar, transaction_date, created_by_user_id, created_at
        ) VALUES (?, 'transfer_in', ?, 'credit', ?, ?, 'transfer', ?, ?, ?, ?, ?)
      `).run(
        `${trfNum}-IN`,
        toAcc.id,
        numAmount,
        toAfter,
        trfId,
        `تحويل وارد من (${fromAcc.name_ar})`,
        String(transferDate || now.slice(0, 10)),
        actor.userId,
        now
      );

      return trfNum;
    })();

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: 'ACCOUNT_TRANSFER',
      entityType: 'transfer',
      entityId: transferNumber,
      details: { fromAccountId, toAccountId, amount: numAmount },
      ipAddress: req.ip,
    });

    res.status(201).json({ ok: true, transferNumber, message: 'تم تنفيذ التحويل المالي بين الحسابات بنجاح' });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'ACCOUNT_NOT_FOUND') return res.status(400).json({ error: 'أحد الحسابات غير موجود أو موقوف' });
      if (err.message === 'ZAKAT_TRANSFER_BLOCKED') {
        return res.status(400).json({ error: 'ضبط شرعي: لا يجوز تحويل أموال من حساب زكاة إلى حساب عام غير مخصص للزكاة' });
      }
      if (err.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'رصيد الحساب المحوّل منه غير كافٍ' });
    }
    res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ التحويل' });
  }
});

financeAndWarehouseRouter.post('/finance/reconciliations', requirePermission('finance', 'edit'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const { accountId, reconciliationDate, actualBalance, notes } = req.body || {};
  const actual = Number(actualBalance);

  if (!accountId || !Number.isFinite(actual) || actual < 0) {
    return res.status(400).json({ error: 'يرجى تحديد الحساب وإدخال الرصيد الفعلي الصحيح' });
  }

  const acc = db.prepare('SELECT * FROM financial_accounts WHERE id = ?').get(Number(accountId)) as
    | { id: number; name_ar: string; current_balance: number }
    | undefined;
  if (!acc) return res.status(404).json({ error: 'الحساب غير موجود' });

  const diff = Math.round((actual - acc.current_balance) * 100) / 100;
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO account_reconciliations (
        account_id, reconciliation_date, system_balance, actual_balance, difference, notes, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(acc.id, String(reconciliationDate || now.slice(0, 10)), acc.current_balance, actual, diff, String(notes || '').trim(), actor.userId, now);

    if (diff !== 0) {
      db.prepare('UPDATE financial_accounts SET current_balance = ?, updated_at = ? WHERE id = ?').run(actual, now, acc.id);
      const entryNumber = nextSequentialCode('REC', 'financial_transactions', 'entry_number');
      db.prepare(`
        INSERT INTO financial_transactions (
          entry_number, entry_type, account_id, direction, amount, balance_after,
          reference_type, reference_id, description_ar, transaction_date, created_by_user_id, created_at
        ) VALUES (?, 'reconciliation_adjustment', ?, ?, ?, ?, 'reconciliation', ?, ?, ?, ?, ?)
      `).run(
        entryNumber,
        acc.id,
        diff > 0 ? 'credit' : 'debit',
        Math.abs(diff),
        actual,
        acc.id,
        `تسوية رصيد (${acc.name_ar}): ${String(notes || '')}`,
        String(reconciliationDate || now.slice(0, 10)),
        actor.userId,
        now
      );
    }
  })();

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'ACCOUNT_RECONCILIATION',
    entityType: 'financial_account',
    entityId: acc.id,
    details: { systemBalance: acc.current_balance, actualBalance: actual, difference: diff },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, difference: diff, message: 'تم تسجيل تسوية الحساب المالي بنجاح' });
});

// =======================
// WAREHOUSE & IN-KIND INVENTORY
// =======================
financeAndWarehouseRouter.get('/warehouse/items', requirePermission('warehouse', 'view'), (_req, res) => {
  const items = db.prepare('SELECT * FROM inventory_items ORDER BY updated_at DESC').all();
  res.json({ items });
});

financeAndWarehouseRouter.post('/warehouse/items', requirePermission('warehouse', 'create'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const { nameAr, categoryAr, unitAr, minThreshold, notes } = req.body || {};
  if (!nameAr || !categoryAr || !unitAr) {
    return res.status(400).json({ error: 'يرجى إدخال اسم الصنف والتصنيف والوحدة' });
  }
  const now = new Date().toISOString();
  const itemCode = nextSequentialCode('ITM', 'inventory_items', 'item_code');
  const r = db
    .prepare(`
      INSERT INTO inventory_items (
        item_code, name_ar, category_ar, unit_ar, current_qty, min_threshold, notes,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `)
    .run(
      itemCode,
      String(nameAr).trim(),
      String(categoryAr).trim(),
      String(unitAr).trim(),
      Math.max(0, Number(minThreshold || 5)),
      String(notes || '').trim(),
      actor.userId,
      now,
      now
    );

  logAudit({
    actorUserId: actor.userId,
    actorName: actor.fullName,
    action: 'CREATE_INVENTORY_ITEM',
    entityType: 'inventory_item',
    entityId: Number(r.lastInsertRowid),
    details: { itemCode, nameAr },
    ipAddress: req.ip,
  });

  res.status(201).json({ ok: true, id: Number(r.lastInsertRowid), itemCode, message: 'تمت إضافة الصنف للمخزن بنجاح' });
});

financeAndWarehouseRouter.get('/warehouse/movements', requirePermission('warehouse', 'view'), (_req, res) => {
  const movements = db
    .prepare(`
      SELECT
        m.*,
        i.name_ar AS item_name,
        i.unit_ar AS item_unit,
        rp.full_name AS responsible_name,
        sf.original_name AS attachment_name
      FROM inventory_movements m
      JOIN inventory_items i ON i.id = m.item_id
      LEFT JOIN persons rp ON rp.id = m.responsible_person_id
      LEFT JOIN stored_files sf ON sf.id = m.attachment_file_id
      ORDER BY m.created_at DESC
    `)
    .all();
  res.json({ movements });
});

financeAndWarehouseRouter.post('/warehouse/movements', requirePermission('warehouse', 'create'), uploadMiddleware.single('attachment'), (req: AuthedRequest, res) => {
  const actor = req.authUser!;
  const { itemId, movementType, quantity, movementDate, sourceOrRecipient, donorPersonId, caseId, responsiblePersonId, notes } =
    req.body || {};

  const numQty = Number(quantity);
  if (!itemId || !['inbound', 'outbound'].includes(String(movementType)) || !Number.isFinite(numQty) || numQty <= 0) {
    return res.status(400).json({ error: 'يرجى تحديد الصنف ونوع الحركة والكمية الصحيحة' });
  }
  if (!sourceOrRecipient || String(sourceOrRecipient).trim().length < 2) {
    return res.status(400).json({ error: 'يرجى تحديد المورد/المتبرع أو الجهة المستلمة' });
  }

  const now = new Date().toISOString();

  try {
    const result = db.transaction(() => {
      const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(Number(itemId)) as
        | { id: number; name_ar: string; current_qty: number; min_threshold: number }
        | undefined;
      if (!item) throw new Error('ITEM_NOT_FOUND');

      if (movementType === 'outbound' && item.current_qty < numQty) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      const qtyAfter =
        movementType === 'inbound'
          ? Math.round((item.current_qty + numQty) * 100) / 100
          : Math.round((item.current_qty - numQty) * 100) / 100;

      db.prepare('UPDATE inventory_items SET current_qty = ?, updated_at = ? WHERE id = ?').run(qtyAfter, now, item.id);

      const moveNumber = nextSequentialCode('MOV', 'inventory_movements', 'movement_number');
      const attachmentFileId = req.file ? saveStoredFile(req.file, 'warehouse_attachment', actor.userId, null) : null;

      const r = db
        .prepare(`
          INSERT INTO inventory_movements (
            movement_number, item_id, movement_type, quantity, qty_after, movement_date,
            source_or_recipient, donor_person_id, case_id, responsible_person_id,
            attachment_file_id, notes, created_by_user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          moveNumber,
          item.id,
          String(movementType),
          numQty,
          qtyAfter,
          String(movementDate || now.slice(0, 10)).trim(),
          String(sourceOrRecipient).trim(),
          donorPersonId ? Number(donorPersonId) : null,
          caseId ? Number(caseId) : null,
          responsiblePersonId ? Number(responsiblePersonId) : actor.personId,
          attachmentFileId,
          String(notes || '').trim(),
          actor.userId,
          now
        );

      const moveId = Number(r.lastInsertRowid);
      if (attachmentFileId) {
        db.prepare('UPDATE stored_files SET entity_id = ? WHERE id = ?').run(moveId, attachmentFileId);
      }

      if (movementType === 'outbound' && qtyAfter <= item.min_threshold) {
        createNotificationForPermission({
          permissionKey: 'warehouse:view',
          titleAr: `تنبيه انخفاض المخزون: ${item.name_ar}`,
          messageAr: `وصل رصيد (${item.name_ar}) إلى ${qtyAfter} فقط (الحد الأدنى ${item.min_threshold}).`,
          category: 'warning',
          linkTab: 'warehouse',
          entityType: 'inventory_item',
          entityId: item.id,
        });
      }

      return { moveId, moveNumber, qtyAfter, itemName: item.name_ar };
    })();

    logAudit({
      actorUserId: actor.userId,
      actorName: actor.fullName,
      action: `WAREHOUSE_${String(movementType).toUpperCase()}`,
      entityType: 'inventory_movement',
      entityId: result.moveId,
      details: result,
      ipAddress: req.ip,
    });

    res.status(201).json({ ok: true, ...result, message: 'تم تسجيل الحركة المخزنية وتحديث الرصيد بنجاح' });
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'ITEM_NOT_FOUND') return res.status(404).json({ error: 'الصنف غير موجود' });
      if (err.message === 'INSUFFICIENT_STOCK') return res.status(400).json({ error: 'الرصيد الحالي بالمخزن غير كافٍ للصرف' });
    }
    res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الحركة المخزنية' });
  }
});
