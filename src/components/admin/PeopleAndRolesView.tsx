import React, { useCallback, useEffect, useState } from 'react';
import { Eye, KeyRound, Plus, Search, Shield, Trash2, UserCheck, UserX } from 'lucide-react';
import { apiFetch } from '../../lib/api.ts';
import { formatDateAr, formatDateTimeAr, formatEGP, hasPerm, PERSON_TYPE_LABELS } from '../../lib/labels.ts';
import type { AuthUser, PermissionCatalogGroup, PersonRecord, RoleRecord } from '../../types.ts';
import { ConfirmModal, LoadingState, StatusText } from '../ui/CommonUI.tsx';

export function PeopleAndRolesView({
  user,
  mode,
  onNotify,
}: {
  user: AuthUser;
  mode: 'people' | 'roles';
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [searchQ, setSearchQ] = useState('');

  // Person Create/Edit Modal
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonRecord | null>(null);
  const [formFullName, setFormFullName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPersonType, setFormPersonType] = useState<'donor' | 'employee' | 'volunteer' | 'beneficiary' | 'official'>('donor');
  const [formDepartment, setFormDepartment] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formArea, setFormArea] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCreateAccount, setFormCreateAccount] = useState(true);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleId, setFormRoleId] = useState('');

  // Person History Drawer
  const [detailPerson, setDetailPerson] = useState<{
    person: PersonRecord;
    donations: Array<Record<string, unknown>>;
    cases: Array<Record<string, unknown>>;
    aids: Array<Record<string, unknown>>;
    staffActions: Array<Record<string, unknown>>;
  } | null>(null);

  // Password Reset Modal
  const [resetTarget, setResetTarget] = useState<PersonRecord | null>(null);
  const [resetPw, setResetPw] = useState('');

  // Confirm Soft Delete / Suspend
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    danger: boolean;
    run: () => Promise<void>;
  } | null>(null);

  // Role Editor state
  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const [rolePermsDraft, setRolePermsDraft] = useState<string[]>([]);
  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);

  const canCreateAccount =
    user.roleKey === 'super_admin' ||
    (hasPerm(user.permissions, user.roleKey, 'people:create') && hasPerm(user.permissions, user.roleKey, 'staff:create'));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (typeFilter !== 'all') qs.set('type', typeFilter);
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (deptFilter !== 'all') qs.set('department', deptFilter);
      if (searchQ.trim()) qs.set('q', searchQ.trim());

      const requests: [Promise<{ people: PersonRecord[] }>, Promise<{ roles: RoleRecord[]; catalog: PermissionCatalogGroup[] }> | null] = [
        mode === 'people' ? apiFetch<{ people: PersonRecord[] }>(`/api/people?${qs.toString()}`) : Promise.resolve({ people: [] }),
        hasPerm(user.permissions, user.roleKey, 'roles:view') || canCreateAccount
          ? apiFetch<{ roles: RoleRecord[]; catalog: PermissionCatalogGroup[] }>('/api/roles')
          : null,
      ];

      const [pRes, rRes] = await Promise.all([requests[0], requests[1]]);
      setPeople(pRes.people);
      if (rRes) {
        setRoles(rRes.roles);
        setCatalog(rRes.catalog);
        if (!selectedRole && rRes.roles.length > 0) {
          setSelectedRole(rRes.roles[0]);
          setRolePermsDraft(rRes.roles[0].permissions);
        }
      }
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [mode, typeFilter, statusFilter, deptFilter, searchQ, user.permissions, user.roleKey, canCreateAccount, onNotify, selectedRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingPerson(null);
    setFormFullName('');
    setFormPhone('');
    setFormPersonType('donor');
    setFormDepartment('');
    setFormJobTitle('');
    setFormArea('');
    setFormAddress('');
    setFormNotes('');
    setFormCreateAccount(canCreateAccount);
    setFormUsername('');
    setFormPassword('');
    const defaultEmpRole = roles.find((r) => r.role_key === 'accountant');
    setFormRoleId(defaultEmpRole ? String(defaultEmpRole.id) : '');
    setShowPersonModal(true);
  };

  const openEditModal = (p: PersonRecord) => {
    setEditingPerson(p);
    setFormFullName(p.full_name);
    setFormPhone(p.phone);
    setFormPersonType(p.person_type === 'admin' ? 'employee' : p.person_type);
    setFormDepartment(p.department);
    setFormJobTitle(p.job_title);
    setFormArea(p.area);
    setFormAddress(p.address);
    setFormNotes(p.notes);
    setFormCreateAccount(false);
    setFormUsername(p.username || '');
    setFormPassword('');
    setFormRoleId(p.role_id ? String(p.role_id) : '');
    setShowPersonModal(true);
  };

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPerson) {
        await apiFetch(`/api/people/${editingPerson.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName: formFullName,
            phone: formPhone,
            department: formDepartment,
            jobTitle: formJobTitle,
            area: formArea,
            address: formAddress,
            notes: formNotes,
            roleId: formRoleId ? Number(formRoleId) : undefined,
            createAccount: formCreateAccount && !editingPerson.user_id,
            username: formUsername,
            password: formPassword,
          }),
        });
        onNotify('success', 'تم تحديث بيانات الشخص بنجاح');
      } else {
        await apiFetch('/api/people', {
          method: 'POST',
          body: JSON.stringify({
            fullName: formFullName,
            phone: formPhone,
            personType: formPersonType,
            department: formDepartment,
            jobTitle: formJobTitle,
            area: formArea,
            address: formAddress,
            notes: formNotes,
            createAccount: formPersonType !== 'beneficiary' && formCreateAccount,
            username: formUsername,
            password: formPassword,
            roleId: formPersonType === 'donor' ? undefined : Number(formRoleId),
          }),
        });
        onNotify('success', 'تمت إضافة الشخص وحفظ بياناته بنجاح');
      }
      setShowPersonModal(false);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر الحفظ');
    }
  };

  const openDetail = async (id: number) => {
    try {
      const res = await apiFetch<{
        person: PersonRecord;
        donations: Array<Record<string, unknown>>;
        cases: Array<Record<string, unknown>>;
        aids: Array<Record<string, unknown>>;
        staffActions: Array<Record<string, unknown>>;
      }>(`/api/people/${id}`);
      setDetailPerson(res);
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر عرض الملف');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      const res = await apiFetch<{ message: string }>(`/api/people/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPw }),
      });
      onNotify('success', res.message);
      setResetTarget(null);
      setResetPw('');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إعادة تعيين كلمة المرور');
    }
  };

  const handleSaveRolePermissions = async () => {
    if (!selectedRole) return;
    try {
      const res = await apiFetch<{ message: string }>(`/api/roles/${selectedRole.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nameAr: selectedRole.name_ar,
          descriptionAr: selectedRole.description_ar,
          permissions: rolePermsDraft,
        }),
      });
      onNotify('success', res.message);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الصلاحيات');
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/roles', {
        method: 'POST',
        body: JSON.stringify({
          nameAr: newRoleName,
          descriptionAr: newRoleDesc,
          permissions: newRolePerms,
        }),
      });
      onNotify('success', res.message);
      setShowNewRoleModal(false);
      setNewRoleName('');
      setNewRoleDesc('');
      setNewRolePerms([]);
      await loadData();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر إنشاء الدور');
    }
  };

  const departments = Array.from(new Set(people.map((p) => p.department).filter(Boolean)));

  if (mode === 'roles') {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-[#18231D]">الأدوار والصلاحيات التفصيلية</h1>
            <p className="text-xs text-[#526058] mt-1">
              يُطبَّق نظام الصلاحيات فعليًا في الخادم وقاعدة البيانات عند كل طلب API.
            </p>
          </div>
          {user.roleKey === 'super_admin' && (
            <button
              type="button"
              onClick={() => setShowNewRoleModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء دور وظيفي جديد</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 bg-white border border-[#E3E7E2] rounded-xl divide-y divide-[#E3E7E2]">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setSelectedRole(r);
                  setRolePermsDraft(r.permissions);
                }}
                className={`w-full text-right p-4 transition-colors ${
                  selectedRole?.id === r.id ? 'bg-[#ECFDF5]' : 'hover:bg-[#F8F9F7]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#18231D]">{r.name_ar}</span>
                  <span className="text-xs font-mono text-[#526058]">{r.permissions.length} صلاحية</span>
                </div>
                <p className="text-xs text-[#526058] mt-1 leading-relaxed">{r.description_ar}</p>
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 bg-white border border-[#E3E7E2] rounded-xl p-6 space-y-5">
            {selectedRole ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E3E7E2]">
                  <div>
                    <h2 className="text-lg font-bold text-[#18231D]">{selectedRole.name_ar}</h2>
                    <p className="text-xs text-[#526058] mt-0.5">{selectedRole.description_ar}</p>
                  </div>
                  {user.roleKey === 'super_admin' && selectedRole.role_key !== 'super_admin' && (
                    <button
                      type="button"
                      onClick={handleSaveRolePermissions}
                      className="px-5 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg"
                    >
                      حفظ تعديلات الصلاحيات
                    </button>
                  )}
                </div>

                {selectedRole.role_key === 'super_admin' && (
                  <div className="p-3 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#14532D]">
                    يمتلك المدير الرئيسي كافة صلاحيات النظام تلقائيًا ولا يجوز تقليصها.
                  </div>
                )}

                <div className="space-y-4">
                  {catalog.map((group) => (
                    <div key={group.module} className="p-4 rounded-lg border border-[#E3E7E2] bg-[#F8F9F7] space-y-2.5">
                      <div className="text-sm font-bold text-[#18231D]">{group.moduleLabel}</div>
                      <div className="flex flex-wrap gap-3">
                        {group.actions.map((act) => {
                          const key = `${group.module}:${act.key}`;
                          const checked = rolePermsDraft.includes(key);
                          const disabled = user.roleKey !== 'super_admin' || selectedRole.role_key === 'super_admin';
                          return (
                            <label
                              key={key}
                              className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border bg-white ${
                                checked ? 'border-[#14532D] text-[#14532D] font-semibold' : 'border-[#E3E7E2] text-[#526058]'
                              } ${disabled ? 'opacity-70' : 'cursor-pointer'}`}
                            >
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) setRolePermsDraft((prev) => [...prev, key]);
                                  else setRolePermsDraft((prev) => prev.filter((x) => x !== key));
                                }}
                                className="accent-[#14532D]"
                              />
                              <span>{act.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-[#526058]">اختر دورًا لعرض صلاحياته.</div>
            )}
          </div>
        </div>

        {/* New Role Modal */}
        {showNewRoleModal && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
            <form onSubmit={handleCreateRole} className="bg-white border border-[#E3E7E2] rounded-xl max-w-2xl w-full p-6 space-y-4">
              <h3 className="text-base font-bold text-[#18231D]">إنشاء دور وظيفي إضافي</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">اسم الدور</label>
                  <input
                    required
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">الوصف</label>
                  <input
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-3 border border-[#E3E7E2] rounded-lg p-3">
                {catalog.map((g) => (
                  <div key={g.module} className="space-y-1.5">
                    <div className="text-xs font-bold text-[#18231D]">{g.moduleLabel}</div>
                    <div className="flex flex-wrap gap-2">
                      {g.actions.map((a) => {
                        const k = `${g.module}:${a.key}`;
                        const checked = newRolePerms.includes(k);
                        return (
                          <label key={k} className="inline-flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setNewRolePerms((prev) => (e.target.checked ? [...prev, k] : prev.filter((x) => x !== k)))
                              }
                            />
                            <span>{a.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNewRoleModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">
                  إلغاء
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">
                  إنشاء الدور
                </button>
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
          <h1 className="text-2xl font-display font-bold text-[#18231D]">إدارة الأشخاص والحسابات</h1>
          <p className="text-xs text-[#526058] mt-1">
            المتبرعون · الموظفون · المتطوعون · المستفيدون · المسؤولون — تُنشأ حسابات الموظفين والإدارة حصريًا من هنا.
          </p>
        </div>
        {hasPerm(user.permissions, user.roleKey, 'people:create') && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة شخص / حساب جديد</span>
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-[#E3E7E2] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#526058] absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو المستخدم..."
            className="w-full pr-9 pl-3 py-2 text-xs border border-[#E3E7E2] rounded-lg"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg bg-white">
          <option value="all">جميع التصنيفات</option>
          <option value="donor">المتبرعون</option>
          <option value="employee">الموظفون</option>
          <option value="volunteer">المتطوعون</option>
          <option value="beneficiary">المستفيدون</option>
          <option value="official">المسؤولون</option>
          <option value="admin">المدير الرئيسي</option>
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg bg-white">
          <option value="all">جميع الأقسام</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs border border-[#E3E7E2] rounded-lg bg-white">
          <option value="all">نشط وموقوف</option>
          <option value="active">نشط فقط</option>
          <option value="suspended">موقوف فقط</option>
          <option value="archived">مؤرشف</option>
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="bg-white border border-[#E3E7E2] rounded-xl overflow-hidden">
          {people.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#526058]">لا توجد سجلات أشخاص مطابقة للبحث.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-[#F8F9F7] border-b border-[#E3E7E2] text-xs text-[#526058]">
                  <tr>
                    <th className="py-3 px-4">الاسم</th>
                    <th className="py-3 px-4">النوع / الدور</th>
                    <th className="py-3 px-4">الهاتف</th>
                    <th className="py-3 px-4">اسم المستخدم</th>
                    <th className="py-3 px-4">الحالة</th>
                    <th className="py-3 px-4">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E3E7E2]">
                  {people.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F8F9F7]">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#18231D]">{p.full_name}</div>
                        {(p.department || p.job_title) && (
                          <div className="text-xs text-[#526058]">
                            {p.job_title} {p.department ? `· ${p.department}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-semibold text-[#18231D]">{PERSON_TYPE_LABELS[p.person_type] || p.person_type}</div>
                        {p.role_name_ar && <div className="text-[#14532D]">{p.role_name_ar}</div>}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">{p.phone}</td>
                      <td className="py-3 px-4 font-mono text-xs">{p.username || 'بدون حساب دخول'}</td>
                      <td className="py-3 px-4">
                        <StatusText
                          label={p.status === 'active' ? 'نشط' : p.status === 'suspended' ? 'موقوف' : 'مؤرشف'}
                          tone={p.status === 'active' ? 'success' : p.status === 'suspended' ? 'danger' : 'neutral'}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDetail(p.id)}
                            className="p-1.5 text-xs border border-[#E3E7E2] rounded hover:bg-white"
                            title="عرض الملف والسجل"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {hasPerm(user.permissions, user.roleKey, 'people:edit') && p.role_key !== 'super_admin' && (
                            <button
                              type="button"
                              onClick={() => openEditModal(p)}
                              className="px-2 py-1 text-xs border border-[#E3E7E2] rounded hover:bg-white"
                            >
                              تعديل
                            </button>
                          )}
                          {hasPerm(user.permissions, user.roleKey, 'people:reset_password') && p.user_id && p.role_key !== 'super_admin' && (
                            <button
                              type="button"
                              onClick={() => {
                                setResetTarget(p);
                                setResetPw('');
                              }}
                              className="p-1.5 text-xs border border-[#E3E7E2] rounded hover:bg-white"
                              title="إعادة تعيين كلمة المرور"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {hasPerm(user.permissions, user.roleKey, 'people:suspend') && p.role_key !== 'super_admin' && p.status !== 'archived' && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: p.status === 'active' ? 'إيقاف الحساب' : 'إعادة تفعيل الحساب',
                                  message:
                                    p.status === 'active'
                                      ? `سيتم إيقاف حساب (${p.full_name}) ومنعه من تسجيل الدخول وإنهاء جلساته فورًا.`
                                      : `سيتم إعادة تفعيل حساب (${p.full_name}).`,
                                  danger: p.status === 'active',
                                  run: async () => {
                                    await apiFetch(`/api/people/${p.id}/status`, {
                                      method: 'POST',
                                      body: JSON.stringify({ status: p.status === 'active' ? 'suspended' : 'active' }),
                                    });
                                    onNotify('success', 'تم تحديث حالة الحساب');
                                    await loadData();
                                  },
                                })
                              }
                              className="p-1.5 text-xs border border-[#E3E7E2] rounded hover:bg-white"
                              title={p.status === 'active' ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                            >
                              {p.status === 'active' ? <UserX className="w-3.5 h-3.5 text-[#B91C1C]" /> : <UserCheck className="w-3.5 h-3.5 text-[#14532D]" />}
                            </button>
                          )}
                          {hasPerm(user.permissions, user.roleKey, 'people:soft_delete') && p.role_key !== 'super_admin' && p.status !== 'archived' && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({
                                  title: 'أرشفة / حذف منطقي',
                                  message: `سيتم أرشفة ملف (${p.full_name}) وإيقاف دخوله مع الحفاظ التام على جميع المعاملات المالية والإيصالات المرتبطة دون حذفها.`,
                                  danger: true,
                                  run: async () => {
                                    const res = await apiFetch<{ message: string }>(`/api/people/${p.id}`, { method: 'DELETE' });
                                    onNotify('info', res.message);
                                    await loadData();
                                  },
                                })
                              }
                              className="p-1.5 text-xs border border-[#E3E7E2] rounded hover:bg-white text-[#B91C1C]"
                              title="أرشفة منطقية"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Person Modal */}
      {showPersonModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSavePerson} className="bg-white border border-[#E3E7E2] rounded-xl max-w-xl w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#18231D]">
              {editingPerson ? `تعديل بيانات: ${editingPerson.full_name}` : 'إضافة شخص وحساب جديد'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">الاسم الكامل</label>
                <input required value={formFullName} onChange={(e) => setFormFullName(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">رقم الهاتف</label>
                <input required value={formPhone} onChange={(e) => setFormPhone(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono" />
              </div>
            </div>

            {!editingPerson && (
              <div>
                <label className="block text-xs font-semibold mb-1">تصنيف الشخص</label>
                <select
                  value={formPersonType}
                  onChange={(e) => setFormPersonType(e.target.value as typeof formPersonType)}
                  className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white"
                >
                  <option value="donor">متبرع</option>
                  <option value="employee">موظف</option>
                  <option value="volunteer">متطوع</option>
                  <option value="beneficiary">مستفيد</option>
                  <option value="official">مسؤول / عضو مجلس إدارة</option>
                </select>
              </div>
            )}

            {(formPersonType === 'employee' || formPersonType === 'volunteer' || formPersonType === 'official') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">القسم</label>
                  <input value={formDepartment} onChange={(e) => setFormDepartment(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">المسمى الوظيفي</label>
                  <input value={formJobTitle} onChange={(e) => setFormJobTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">المنطقة / القرية</label>
                <input value={formArea} onChange={(e) => setFormArea(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">العنوان</label>
                <input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
              </div>
            </div>

            {canCreateAccount && formPersonType !== 'beneficiary' && (!editingPerson || !editingPerson.user_id) && (
              <div className="p-4 rounded-lg bg-[#F8F9F7] border border-[#E3E7E2] space-y-3">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-[#14532D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formCreateAccount}
                    onChange={(e) => setFormCreateAccount(e.target.checked)}
                  />
                  <span>إنشاء حساب دخول للنظام لهذا الشخص</span>
                </label>

                {formCreateAccount && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1">اسم المستخدم (إنجليزي)</label>
                      <input
                        required
                        dir="ltr"
                        value={formUsername}
                        onChange={(e) => setFormUsername(e.target.value)}
                        placeholder="user_name"
                        className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg font-mono text-left bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1">كلمة المرور المؤقتة (6+ أحرف)</label>
                      <input
                        required
                        type="password"
                        minLength={6}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white"
                      />
                    </div>
                    {formPersonType !== 'donor' && (
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold mb-1">الدور الوظيفي والصلاحيات</label>
                        <select
                          required
                          value={formRoleId}
                          onChange={(e) => setFormRoleId(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white"
                        >
                          <option value="">اختر الدور الوظيفي...</option>
                          {roles
                            .filter((r) => r.role_key !== 'donor' && (user.roleKey === 'super_admin' || r.role_key !== 'super_admin'))
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name_ar}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {editingPerson && editingPerson.user_id && editingPerson.person_type !== 'donor' && user.roleKey === 'super_admin' && (
              <div>
                <label className="block text-xs font-semibold mb-1">تعديل الدور الوظيفي</label>
                <select
                  value={formRoleId}
                  onChange={(e) => setFormRoleId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg bg-white"
                >
                  {roles
                    .filter((r) => r.role_key !== 'donor')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name_ar}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold mb-1">ملاحظات</label>
              <textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowPersonModal(false)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">
                إلغاء
              </button>
              <button type="submit" className="px-5 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg">
                حفظ البيانات
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Person Detail & Transactions History Modal */}
      {detailPerson && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-[#E3E7E2] rounded-xl max-w-2xl w-full p-6 space-y-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-[#E3E7E2] pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#18231D]">{detailPerson.person.full_name}</h3>
                <div className="text-xs text-[#526058] mt-0.5">
                  {PERSON_TYPE_LABELS[detailPerson.person.person_type]} · {detailPerson.person.phone} ·{' '}
                  {detailPerson.person.username || 'بدون حساب دخول'}
                </div>
              </div>
              <button type="button" onClick={() => setDetailPerson(null)} className="text-xs px-3 py-1 border border-[#E3E7E2] rounded">
                إغلاق
              </button>
            </div>

            {detailPerson.donations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#14532D]">سجل تبرعات الشخص</h4>
                <div className="divide-y divide-[#E3E7E2] border border-[#E3E7E2] rounded-lg text-xs">
                  {detailPerson.donations.map((d) => (
                    <div key={String(d.id)} className="p-3 flex justify-between">
                      <span>
                        {String(d.reference_code)} · {String(d.project_title || 'عام')} ({String(d.status)})
                      </span>
                      <span className="font-mono font-bold tabular-nums">{formatEGP(Number(d.amount))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailPerson.cases.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#14532D]">ملفات الحالات الإنسانية</h4>
                <div className="divide-y divide-[#E3E7E2] border border-[#E3E7E2] rounded-lg text-xs">
                  {detailPerson.cases.map((c) => (
                    <div key={String(c.id)} className="p-3 flex justify-between">
                      <span>
                        {String(c.file_number)} · {String(c.case_type)}
                      </span>
                      <span>{String(c.status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailPerson.staffActions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-[#14532D]">سجل عمليات الموظف</h4>
                <div className="divide-y divide-[#E3E7E2] border border-[#E3E7E2] rounded-lg text-xs max-h-60 overflow-y-auto">
                  {detailPerson.staffActions.map((a) => (
                    <div key={String(a.id)} className="p-2.5 flex justify-between">
                      <span className="font-mono">{String(a.action)}</span>
                      <span className="text-[#526058] tabular-nums">{formatDateTimeAr(String(a.created_at))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={handleResetPassword} className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#18231D]">إعادة تعيين كلمة مرور: {resetTarget.full_name}</h3>
            <p className="text-xs text-[#526058]">
              سيتم تعيين كلمة مرور مؤقتة جديدة وإنهاء أي جلسات دخول نشطة لهذا المستخدم.
            </p>
            <input
              type="password"
              required
              minLength={6}
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              placeholder="كلمة المرور المؤقتة الجديدة"
              className="w-full px-3 py-2 text-sm border border-[#E3E7E2] rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 text-xs border border-[#E3E7E2] rounded-lg">
                إلغاء
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg">
                تحديث كلمة المرور
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        danger={confirmAction?.danger}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          if (!confirmAction) return;
          try {
            await confirmAction.run();
          } catch (err) {
            onNotify('error', err instanceof Error ? err.message : 'فشلت العملية');
          } finally {
            setConfirmAction(null);
          }
        }}
      />
    </div>
  );
}
