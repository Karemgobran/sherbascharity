import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Eye, Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import {
  ACCOUNT_TYPE_LABELS,
  EXPENSE_STATUS_LABELS,
  formatDateAr,
  formatEGP,
  FUND_TYPE_LABELS,
  hasPerm,
} from '../../lib/labels.ts';
import type {
  AuthUser,
  ExpenseRecord,
  FinancialAccount,
  InventoryItem,
  InventoryMovement,
  PublicProject,
} from '../../types.ts';
import { FilePreviewModal, LoadingState, StatusText } from '../ui/CommonUI.tsx';

export function FinanceAndWarehouseView({
  user,
  mode,
  onNotify,
}: {
  user: AuthUser;
  mode: 'finance' | 'warehouse';
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [finTab, setFinTab] = useState<'accounts' | 'expenses' | 'transfers' | 'ledger'>('accounts');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [ledger, setLedger] = useState<{
    transactions: Array<Record<string, unknown>>;
    transfers: Array<Record<string, unknown>>;
    reconciliations: Array<Record<string, unknown>>;
  }>({ transactions: [], transfers: [], reconciliations: [] });
  const [projects, setProjects] = useState<PublicProject[]>([]);

  // Warehouse state
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [showAccModal, setShowAccModal] = useState(false);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<'cash_safe' | 'bank' | 'wallet'>('cash_safe');
  const [accFundType, setAccFundType] = useState<'general' | 'zakat' | 'restricted'>('general');
  const [accBank, setAccBank] = useState('');
  const [accNum, setAccNum] = useState('');
  const [accOpening, setAccOpening] = useState('0');

  const [showExpModal, setShowExpModal] = useState(false);
  const [expTitle, setExpTitle] = useState('');
  const [expCat, setExpCat] = useState('إعانات أسرية');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expAccId, setExpAccId] = useState('');
  const [expProjId, setExpProjId] = useState('');
  const [expVendor, setExpVendor] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expZakat, setExpZakat] = useState(false);
  const [expAttachment, setExpAttachment] = useState<File | null>(null);
  const [expPublicAtt, setExpPublicAtt] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ id: string; name?: string | null; mimeType?: string | null } | null>(null);

  const [showTrfModal, setShowTrfModal] = useState(false);
  const [trfFrom, setTrfFrom] = useState('');
  const [trfTo, setTrfTo] = useState('');
  const [trfAmount, setTrfAmount] = useState('');
  const [trfNotes, setTrfNotes] = useState('');

  const [showRecModal, setShowRecModal] = useState(false);
  const [recAccId, setRecAccId] = useState('');
  const [recActual, setRecActual] = useState('');
  const [recNotes, setRecNotes] = useState('');

  // Warehouse Modals
  const [showItemModal, setShowItemModal] = useState(false);
  const [itName, setItName] = useState('');
  const [itCat, setItCat] = useState('مواد غذائية');
  const [itUnit, setItUnit] = useState('كرتونة');
  const [itMin, setItMin] = useState('5');

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [mvItemId, setMvItemId] = useState('');
  const [mvType, setMvType] = useState<'inbound' | 'outbound'>('inbound');
  const [mvQty, setMvQty] = useState('');
  const [mvSource, setMvSource] = useState('');
  const [mvDate, setMvDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mvNotes, setMvNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'finance') {
        const [aRes, eRes, tRes, pRes] = await Promise.all([
          apiFetch<{ accounts: FinancialAccount[] }>('/api/finance/accounts'),
          apiFetch<{ expenses: ExpenseRecord[] }>('/api/finance/expenses'),
          apiFetch<typeof ledger>('/api/finance/transactions'),
          apiFetch<{ projects: PublicProject[] }>('/api/projects').catch(() => ({ projects: [] })),
        ]);
        setAccounts(aRes.accounts);
        setExpenses(eRes.expenses);
        setLedger(tRes);
        setProjects(pRes.projects);
      } else {
        const [iRes, mRes] = await Promise.all([
          apiFetch<{ items: InventoryItem[] }>('/api/warehouse/items'),
          apiFetch<{ movements: InventoryMovement[] }>('/api/warehouse/movements'),
        ]);
        setItems(iRes.items);
        setMovements(mRes.movements);
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [mode, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/finance/accounts', {
        method: 'POST',
        body: JSON.stringify({
          nameAr: accName,
          accountType: accType,
          fundType: accFundType,
          bankName: accBank,
          accountNumber: accNum,
          openingBalance: Number(accOpening || 0),
        }),
      });
      onNotify('success', res.message);
      setShowAccModal(false);
      setAccName('');
      setAccOpening('0');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إنشاء الحساب');
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const form = new FormData();
      form.append('titleAr', expTitle);
      form.append('categoryAr', expCat);
      form.append('amount', expAmount);
      form.append('expenseDate', expDate);
      form.append('financialAccountId', expAccId);
      if (expProjId) form.append('projectId', expProjId);
      form.append('beneficiaryOrVendor', expVendor);
      form.append('descriptionAr', expDescription);
      form.append('isZakatExpense', String(expZakat));
      form.append('isPublicAttachment', String(expPublicAtt));
      if (expAttachment) form.append('attachment', expAttachment);
      const res = await apiFetch<{ message: string }>('/api/finance/expenses', { method: 'POST', body: form });
      onNotify('success', res.message);
      setShowExpModal(false);
      setExpTitle('');
      setExpAmount('');
      setExpVendor('');
      setExpDescription('');
      setExpAttachment(null);
      setExpPublicAtt(false);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل المصروف');
    }
  };

  const handleTogglePublicAttachment = async (exp: ExpenseRecord) => {
    try {
      const res = await apiFetch<{ message: string }>(`/api/finance/expenses/${exp.id}/public-attachment`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublicAttachment: !exp.is_public_attachment }),
      });
      onNotify('success', res.message);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحديث إعداد نشر الفاتورة');
    }
  };

  const handleExpenseAction = async (id: number, action: 'paid' | 'rejected') => {
    try {
      const res = await apiFetch<{ message: string }>(`/api/finance/expenses/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      onNotify('success', res.message);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء');
    }
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/finance/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromAccountId: Number(trfFrom),
          toAccountId: Number(trfTo),
          amount: Number(trfAmount),
          notes: trfNotes,
        }),
      });
      onNotify('success', res.message);
      setShowTrfModal(false);
      setTrfAmount('');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تنفيذ التحويل');
    }
  };

  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/finance/reconciliations', {
        method: 'POST',
        body: JSON.stringify({
          accountId: Number(recAccId),
          actualBalance: Number(recActual),
          notes: recNotes,
        }),
      });
      onNotify('success', res.message);
      setShowRecModal(false);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر التسوية');
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/warehouse/items', {
        method: 'POST',
        body: JSON.stringify({ nameAr: itName, categoryAr: itCat, unitAr: itUnit, minThreshold: Number(itMin || 5) }),
      });
      onNotify('success', res.message);
      setShowItemModal(false);
      setItName('');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إضافة الصنف');
    }
  };

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const form = new FormData();
      form.append('itemId', mvItemId);
      form.append('movementType', mvType);
      form.append('quantity', mvQty);
      form.append('sourceOrRecipient', mvSource);
      form.append('movementDate', mvDate);
      form.append('notes', mvNotes);
      const res = await apiFetch<{ message: string }>('/api/warehouse/movements', { method: 'POST', body: form });
      onNotify('success', res.message);
      setShowMoveModal(false);
      setMvQty('');
      setMvSource('');
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تسجيل الحركة');
    }
  };

  if (mode === 'warehouse') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-[#18231D]">المخازن والتبرعات العينية</h1>
            <p className="text-xs text-[#526058] mt-1">
              متابعة الأصناف والأرصدة وحركات الوارد والمنصرف والتنبيه عند انخفاض المخزون.
            </p>
          </div>
          {hasPerm(user.permissions, user.roleKey, 'warehouse:create') && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowItemModal(true)} className="px-3.5 py-2 text-xs font-semibold border border-[#14532D]/30 text-[#14532D] bg-white rounded-lg">
                + إضافة صنف
              </button>
              <button type="button" onClick={() => setShowMoveModal(true)} className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">
                + حركة وارد / منصرف
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <LoadingState />
        ) : (
          <div className="space-y-6">
            <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#E3E7E2] font-bold text-sm">أرصدة الأصناف الحالية</div>
              {items.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#526058]">لا توجد أصناف مخزنية مسجلة بعد.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                      <tr>
                        <th className="py-3 px-4">الكود</th>
                        <th className="py-3 px-4">الصنف</th>
                        <th className="py-3 px-4">التصنيف</th>
                        <th className="py-3 px-4">الرصيد الحالي</th>
                        <th className="py-3 px-4">حد التنبيه</th>
                        <th className="py-3 px-4">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E7E2]">
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td className="py-3 px-4 font-mono text-xs">{it.item_code}</td>
                          <td className="py-3 px-4 font-semibold">{it.name_ar}</td>
                          <td className="py-3 px-4 text-xs text-[#526058]">{it.category_ar}</td>
                          <td className="py-3 px-4 font-mono font-bold text-[#14532D] tabular-nums">
                            {it.current_qty} {it.unit_ar}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs tabular-nums">{it.min_threshold}</td>
                          <td className="py-3 px-4">
                            <StatusText
                              label={it.current_qty <= it.min_threshold ? 'مخزون منخفض' : 'متوفر'}
                              tone={it.current_qty <= it.min_threshold ? 'warning' : 'success'}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#E3E7E2] font-bold text-sm">سجل الحركات المخزنية</div>
              {movements.length === 0 ? (
                <div className="p-8 text-center text-sm text-[#526058]">لا توجد حركات مسجلة بعد.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                      <tr>
                        <th className="py-3 px-4">رقم الحركة</th>
                        <th className="py-3 px-4">الصنف</th>
                        <th className="py-3 px-4">النوع</th>
                        <th className="py-3 px-4">الكمية / الرصيد بعدها</th>
                        <th className="py-3 px-4">المورد / المستلم</th>
                        <th className="py-3 px-4">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E7E2]">
                      {movements.map((m) => (
                        <tr key={m.id} className="text-xs">
                          <td className="py-3 px-4 font-mono">{m.movement_number}</td>
                          <td className="py-3 px-4 font-semibold">{m.item_name}</td>
                          <td className="py-3 px-4">
                            <StatusText label={m.movement_type === 'inbound' ? 'وارد للمخزن' : 'منصرف من المخزن'} tone={m.movement_type === 'inbound' ? 'success' : 'info'} />
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums">
                            {m.quantity} {m.item_unit} (الرصيد: {m.qty_after})
                          </td>
                          <td className="py-3 px-4">{m.source_or_recipient}</td>
                          <td className="py-3 px-4 tabular-nums">{formatDateAr(m.movement_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {showItemModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <form onSubmit={handleCreateItem} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-base font-bold">إضافة صنف مخزني</h3>
              <input required placeholder="اسم الصنف" value={itName} onChange={(e) => setItName(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              <div className="grid grid-cols-2 gap-3">
                <input required placeholder="التصنيف" value={itCat} onChange={(e) => setItCat(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
                <input required placeholder="الوحدة (كرتونة/كيلو)" value={itUnit} onChange={(e) => setItUnit(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">حد التنبيه لانخفاض المخزون</label>
                <input type="number" min="0" value={itMin} onChange={(e) => setItMin(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowItemModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">حفظ الصنف</button>
              </div>
            </form>
          </div>
        )}

        {showMoveModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <form onSubmit={handleCreateMovement} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
              <h3 className="text-base font-bold">تسجيل حركة مخزنية</h3>
              <select required value={mvItemId} onChange={(e) => setMvItemId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                <option value="">اختر الصنف...</option>
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name_ar} (الرصيد: {it.current_qty} {it.unit_ar})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select value={mvType} onChange={(e) => setMvType(e.target.value as 'inbound' | 'outbound')} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                  <option value="inbound">وارد (استلام)</option>
                  <option value="outbound">منصرف (تسليم)</option>
                </select>
                <input type="number" min="0.1" step="0.1" required placeholder="الكمية" value={mvQty} onChange={(e) => setMvQty(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
              <input required placeholder={mvType === 'inbound' ? 'اسم المتبرع / المورد' : 'اسم المستفيد / الجهة المستلمة'} value={mvSource} onChange={(e) => setMvSource(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              <input type="date" value={mvDate} onChange={(e) => setMvDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              <textarea rows={2} placeholder="ملاحظات" value={mvNotes} onChange={(e) => setMvNotes(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowMoveModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">تسجيل الحركة</button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#18231D]">النظام المالي والحسابات</h1>
          <p className="text-xs text-[#526058] mt-1">
            الخزائن والبنوك · سندات القبض والصرف · التحويلات · التسويات · القيود المالية الموثقة.
          </p>
        </div>
        {hasPerm(user.permissions, user.roleKey, 'finance:create') && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowAccModal(true)} className="px-3 py-2 text-xs font-semibold border border-[#14532D]/30 text-[#14532D] bg-white rounded-lg">
              + خزينة / حساب بنكي
            </button>
            <button type="button" onClick={() => setShowTrfModal(true)} className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold border border-[#E3E7E2] bg-white rounded-lg">
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>تحويل بين الحسابات</span>
            </button>
            <button type="button" onClick={() => setShowExpModal(true)} className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل مصروف</span>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 p-1 bg-white border border-[#E3E7E2] rounded-lg w-fit overflow-x-auto">
        {(
          [
            ['accounts', 'الخزائن والبنوك'],
            ['expenses', 'سندات الصرف والمصروفات'],
            ['transfers', 'التحويلات والتسويات'],
            ['ledger', 'سجل القيود والحركات'],
          ] as const
        ).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFinTab(k)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md whitespace-nowrap ${
              finTab === k ? 'bg-[#14532D] text-white' : 'text-[#526058] hover:text-[#18231D]'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          {finTab === 'accounts' && (
            <div className="space-y-4">
              {accounts.length === 0 ? (
                <div className="bg-white border border-[#E3E7E2] rounded-xl p-10 text-center text-sm text-[#526058]">
                  لم يتم تعريف أي خزينة أو حساب بنكي بعد. أضف الحساب الأول لتمكين اعتماد التبرعات وصرف المساعدات.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {accounts.map((a) => (
                    <div key={a.id} className="bg-white border border-[#E3E7E2] rounded-xl p-5 space-y-2">
                      <div className="text-xs text-[#526058]">
                        {ACCOUNT_TYPE_LABELS[a.account_type]} · {FUND_TYPE_LABELS[a.fund_type]}
                      </div>
                      <div className="text-base font-bold text-[#18231D]">{a.name_ar}</div>
                      {a.bank_name && <div className="text-xs text-[#526058]">{a.bank_name} · {a.account_number}</div>}
                      <div className="text-2xl font-bold font-mono text-[#14532D] tabular-nums pt-2 border-t border-[#E3E7E2]">
                        {formatEGP(a.current_balance)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {finTab === 'expenses' && (
            <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
              {expenses.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#526058]">لا توجد مصروفات مسجلة بعد.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                      <tr>
                        <th className="py-3 px-4">السند</th>
                        <th className="py-3 px-4">البيان والبند</th>
                        <th className="py-3 px-4">الحساب / المشروع</th>
                        <th className="py-3 px-4">المبلغ</th>
                        <th className="py-3 px-4">الفاتورة والشفافية</th>
                        <th className="py-3 px-4">الحالة</th>
                        <th className="py-3 px-4">الاعتماد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E7E2]">
                      {expenses.map((ex) => (
                        <tr key={ex.id}>
                          <td className="py-3 px-4 font-mono text-xs">{ex.voucher_number}</td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-semibold">{ex.title_ar}</div>
                            <div className="text-[#526058]">{ex.category_ar} · {formatDateAr(ex.expense_date)}</div>
                            {ex.description_ar && <div className="text-[#526058] mt-0.5">{ex.description_ar}</div>}
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div>{ex.account_name}</div>
                            <div className="text-[#526058]">{ex.project_title || 'مصروف عام'}</div>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold tabular-nums">{formatEGP(ex.amount)}</td>
                          <td className="py-3 px-4 text-xs">
                            {ex.attachment_file_id ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewFile({
                                      id: ex.attachment_file_id!,
                                      name: ex.attachment_name || `فاتورة_${ex.voucher_number}`,
                                      mimeType: ex.attachment_mime_type,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 border border-[#E3E7E2] rounded hover:bg-[#F8F9F7] whitespace-nowrap shrink-0"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>عرض الفاتورة</span>
                                </button>
                                {hasPerm(user.permissions, user.roleKey, 'finance:edit') && (
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePublicAttachment(ex)}
                                    className={`px-2 py-1 rounded border text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                                      ex.is_public_attachment
                                        ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#14532D]'
                                        : 'border-[#E3E7E2] bg-white text-[#526058]'
                                    }`}
                                  >
                                    {ex.is_public_attachment ? 'منشورة للمتبرعين · حجب' : 'خاصة · إتاحة للنشر'}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[#526058]">بدون مرفق</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <StatusText
                              label={EXPENSE_STATUS_LABELS[ex.status] || ex.status}
                              tone={ex.status === 'paid' ? 'success' : ex.status === 'rejected' ? 'danger' : 'warning'}
                            />
                          </td>
                          <td className="py-3 px-4">
                            {ex.status === 'pending_approval' && hasPerm(user.permissions, user.roleKey, 'finance:approve') && (
                              <div className="flex gap-1.5">
                                <button type="button" onClick={() => handleExpenseAction(ex.id, 'paid')} className="px-2.5 py-1 text-xs font-semibold text-white bg-[#14532D] rounded whitespace-nowrap shrink-0">
                                  اعتماد وصرف
                                </button>
                                <button type="button" onClick={() => handleExpenseAction(ex.id, 'rejected')} className="px-2.5 py-1 text-xs text-[#B91C1C] border border-[#FECACA] rounded whitespace-nowrap shrink-0">
                                  رفض
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {finTab === 'transfers' && (
            <div className="space-y-6">
              <div className="flex justify-end">
                {hasPerm(user.permissions, user.roleKey, 'finance:edit') && (
                  <button type="button" onClick={() => setShowRecModal(true)} className="px-3.5 py-2 text-xs font-semibold border border-[#E3E7E2] bg-white rounded-lg">
                    + تسجيل تسوية رصيد فعلية
                  </button>
                )}
              </div>
              <div className="bg-white border border-[#E3E7E2] rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-bold">التحويلات بين الخزائن والبنوك</h3>
                {ledger.transfers.length === 0 ? (
                  <p className="text-xs text-[#526058]">لا توجد تحويلات مسجلة.</p>
                ) : (
                  <div className="divide-y divide-[#E3E7E2] text-xs">
                    {ledger.transfers.map((t) => (
                      <div key={String(t.id)} className="py-2.5 flex justify-between">
                        <span>
                          <strong className="font-mono">{String(t.transfer_number)}</strong> · من {String(t.from_account_name)} إلى {String(t.to_account_name)}
                        </span>
                        <span className="font-mono font-bold text-[#14532D] tabular-nums">{formatEGP(Number(t.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {finTab === 'ledger' && (
            <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
              {ledger.transactions.length === 0 ? (
                <div className="p-10 text-center text-sm text-[#526058]">لا توجد قيود مالية مسجلة بعد.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                    <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                      <tr>
                        <th className="py-3 px-4">رقم القيد</th>
                        <th className="py-3 px-4">البيان</th>
                        <th className="py-3 px-4">الحساب</th>
                        <th className="py-3 px-4">الحركة</th>
                        <th className="py-3 px-4">المبلغ</th>
                        <th className="py-3 px-4">الرصيد بعد</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E3E7E2] text-xs">
                      {ledger.transactions.map((tr) => (
                        <tr key={String(tr.id)}>
                          <td className="py-2.5 px-4 font-mono">{String(tr.entry_number)}</td>
                          <td className="py-2.5 px-4">{String(tr.description_ar)}</td>
                          <td className="py-2.5 px-4">{String(tr.account_name)}</td>
                          <td className="py-2.5 px-4">{tr.direction === 'credit' ? 'وارد (+)' : 'منصرف (-)'}</td>
                          <td className="py-2.5 px-4 font-mono font-bold tabular-nums">{formatEGP(Number(tr.amount))}</td>
                          <td className="py-2.5 px-4 font-mono tabular-nums">{formatEGP(Number(tr.balance_after))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create Financial Account Modal */}
      {showAccModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateAccount} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold">إضافة خزينة أو حساب بنكي</h3>
            <input required placeholder="اسم الخزينة / الحساب" value={accName} onChange={(e) => setAccName(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              <select value={accType} onChange={(e) => setAccType(e.target.value as typeof accType)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                <option value="cash_safe">خزينة نقدية</option>
                <option value="bank">حساب بنكي</option>
                <option value="wallet">محفظة إلكترونية</option>
              </select>
              <select value={accFundType} onChange={(e) => setAccFundType(e.target.value as typeof accFundType)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                <option value="general">أموال عامة</option>
                <option value="zakat">مخصص للزكاة</option>
                <option value="restricted">حساب مقيد</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="اسم البنك (اختياري)" value={accBank} onChange={(e) => setAccBank(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              <input placeholder="رقم الحساب (اختياري)" value={accNum} onChange={(e) => setAccNum(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">الرصيد الافتتاحي (ج.م)</label>
              <input type="number" min="0" step="0.01" value={accOpening} onChange={(e) => setAccOpening(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAccModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">حفظ الحساب</button>
            </div>
          </form>
        </div>
      )}

      {/* Create Expense Modal */}
      {showExpModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateExpense} className="bg-white border border-[#E3E7E2] rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-base font-bold">تسجيل مصروف / سند صرف</h3>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="بيان المصروف" value={expTitle} onChange={(e) => setExpTitle(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              <input required placeholder="البند (إعانات/أدوية/إدارة)" value={expCat} onChange={(e) => setExpCat(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min="1" step="0.01" required placeholder="المبلغ (ج.م)" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              <input type="date" required value={expDate} onChange={(e) => setExpDate(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select required value={expAccId} onChange={(e) => setExpAccId(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                <option value="">اختر الخزينة / البنك...</option>
                {accounts.filter((a) => a.is_active).map((a) => (
                  <option key={a.id} value={a.id}>{a.name_ar} ({formatEGP(a.current_balance)})</option>
                ))}
              </select>
              <select value={expProjId} onChange={(e) => setExpProjId(e.target.value)} className="px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
                <option value="">مصروف عام (غير مرتبط بمشروع)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.title_ar}</option>
                ))}
              </select>
            </div>
            <input placeholder="المستفيد أو المورد (بيان إداري داخلي لا يُعرض للمتبرعين)" value={expVendor} onChange={(e) => setExpVendor(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            <textarea
              rows={2}
              placeholder="وصف عام للمصروف (يظهر للمتبرعين في قسم الشفافية دون أي أسماء مستفيدين)"
              value={expDescription}
              onChange={(e) => setExpDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
            />
            <div>
              <label className="block text-xs font-semibold mb-1">صورة الفاتورة أو مستند الصرف (JPG / PNG / PDF · اختياري)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setExpAttachment(e.target.files?.[0] || null)}
                className="text-xs w-full"
              />
            </div>
            <div className="space-y-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={expZakat} onChange={(e) => setExpZakat(e.target.checked)} />
                <span>مصروف من أموال الزكاة</span>
              </label>
              <label className="flex items-start gap-2 text-xs text-[#18231D]">
                <input type="checkbox" checked={expPublicAtt} onChange={(e) => setExpPublicAtt(e.target.checked)} className="mt-0.5" />
                <span>السماح بنشر مرفق الفاتورة للمتبرعين في قسم الشفافية (تأكد من عدم احتوائها على بيانات شخصية للمستفيدين)</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowExpModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">إحالة للاعتماد</button>
            </div>
          </form>
        </div>
      )}

      {/* Transfer Modal */}
      {showTrfModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateTransfer} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold">تحويل بين الخزائن والحسابات البنكية</h3>
            <select required value={trfFrom} onChange={(e) => setTrfFrom(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
              <option value="">من حساب...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name_ar} ({formatEGP(a.current_balance)})</option>
              ))}
            </select>
            <select required value={trfTo} onChange={(e) => setTrfTo(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
              <option value="">إلى حساب...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name_ar}</option>
              ))}
            </select>
            <input type="number" min="1" step="0.01" required placeholder="المبلغ (ج.م)" value={trfAmount} onChange={(e) => setTrfAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
            <input placeholder="ملاحظات التحويل" value={trfNotes} onChange={(e) => setTrfNotes(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowTrfModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">تنفيذ التحويل</button>
            </div>
          </form>
        </div>
      )}

      {/* Reconciliation Modal */}
      {showRecModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateReconciliation} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold">تسوية رصيد خزينة أو حساب</h3>
            <select required value={recAccId} onChange={(e) => setRecAccId(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white">
              <option value="">اختر الحساب...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name_ar} (الدفتر: {formatEGP(a.current_balance)})</option>
              ))}
            </select>
            <input type="number" min="0" step="0.01" required placeholder="الرصيد الفعلي بالجرد" value={recActual} onChange={(e) => setRecActual(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
            <input required placeholder="سبب التسوية" value={recNotes} onChange={(e) => setRecNotes(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowRecModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">إلغاء</button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">اعتماد التسوية</button>
            </div>
          </form>
        </div>
      )}

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
