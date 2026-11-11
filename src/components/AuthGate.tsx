import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, Lock, ShieldCheck, UserPlus, X } from 'lucide-react';
import { apiFetch, setAuthToken } from '../lib/api.ts';
import type { AuthUser } from '../types.ts';
import { BrandLogo } from './ui/CommonUI.tsx';

export function AuthGate({
  onAuthenticated,
  onBackHome,
  initialMode = 'login',
}: {
  onAuthenticated: (user: AuthUser) => void;
  onBackHome: () => void;
  initialMode?: 'login' | 'register';
}) {
  const [setupStatus, setSetupStatus] = useState<{ initialized: boolean; requiresSetupKey: boolean } | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Donor Self-Registration state («إنشاء حساب متبرع»)
  const [donorName, setDonorName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [donorPassword, setDonorPassword] = useState('');
  const [donorConfirmPassword, setDonorConfirmPassword] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [verifyChannel, setVerifyChannel] = useState<'phone' | 'email'>('phone');
  const [verificationId, setVerificationId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [previewCodeHint, setPreviewCodeHint] = useState('');
  const [sendingCode, setSendingCode] = useState(false);

  // First-run Super Admin setup state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [setupUsername, setSetupUsername] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');

  useEffect(() => {
    setMode(initialMode);
    setError('');
    setInfoMsg('');
  }, [initialMode]);

  useEffect(() => {
    apiFetch<{ initialized: boolean; requiresSetupKey: boolean }>('/api/auth/setup-status')
      .then(setSetupStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر التحقق من حالة النظام'));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ user: AuthUser; sessionToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      if (res.sessionToken) setAuthToken(res.sessionToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestVerificationCode = async () => {
    setError('');
    setInfoMsg('');
    if (!donorPhone.trim()) {
      setError('يرجى إدخال رقم الهاتف أولًا قبل طلب رمز التحقق');
      return;
    }
    setSendingCode(true);
    try {
      const res = await apiFetch<{
        ok: boolean;
        verificationId: string;
        deliveryMode: string;
        previewCode?: string;
        message: string;
      }>('/api/auth/donor-register/send-verification', {
        method: 'POST',
        body: JSON.stringify({
          phone: donorPhone,
          email: donorEmail,
          channel: verifyChannel,
        }),
      });
      setVerificationId(res.verificationId);
      setVerificationCode('');
      setPreviewCodeHint(res.previewCode || '');
      setInfoMsg(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال رمز التحقق');
    } finally {
      setSendingCode(false);
    }
  };

  const handleDonorRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (donorPassword !== donorConfirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (!acceptedPrivacy) {
      setError('يجب الموافقة على سياسة الخصوصية لإتمام إنشاء حساب المتبرع');
      return;
    }
    if (!verificationId) {
      setError('يرجى الضغط على "إرسال رمز التحقق" والتحقق من رقم الهاتف أو البريد أولًا');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ user: AuthUser; sessionToken?: string }>('/api/auth/donor-register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: donorName,
          phone: donorPhone,
          email: donorEmail,
          password: donorPassword,
          confirmPassword: donorConfirmPassword,
          acceptedPrivacyPolicy: acceptedPrivacy,
          verificationId,
          verificationCode,
        }),
      });
      if (res.sessionToken) setAuthToken(res.sessionToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء حساب المتبرع');
    } finally {
      setLoading(false);
    }
  };

  const handleSuperAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (setupPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ user: AuthUser; sessionToken?: string }>('/api/setup/super-admin', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          phone,
          username: setupUsername,
          password: setupPassword,
          setupKey,
        }),
      });
      if (res.sessionToken) setAuthToken(res.sessionToken);
      if (res.user) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء حساب المدير الرئيسي');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9F7] flex flex-col justify-center items-center p-4 py-8">
      <div className="w-full max-w-lg space-y-5">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#526058] hover:text-[#14532D] transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة إلى الموقع العام للجمعية</span>
        </button>

        <div className="bg-white border border-[#E3E7E2] rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3.5 pb-4 border-b border-[#E3E7E2]">
            <BrandLogo size={48} />
            <div>
              <h1 className="text-lg font-display font-bold text-[#14532D]">الجمعية الخيرية بشرباص</h1>
              <p className="text-xs text-[#526058] mt-0.5">
                {setupStatus && !setupStatus.initialized
                  ? 'التهيئة الأولية الآمنة · إنشاء حساب المدير الرئيسي'
                  : mode === 'register'
                    ? 'إنشاء حساب متبرع جديد · متابعة التبرعات والشفافية المالية'
                    : 'بوابة الدخول الموحدة للمتبرعين والإدارة'}
              </p>
            </div>
          </div>

          {setupStatus?.initialized && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#F8F9F7] border border-[#E3E7E2] rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setInfoMsg('');
                }}
                className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login' ? 'bg-[#14532D] text-white' : 'text-[#526058] hover:text-[#18231D]'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                  setInfoMsg('');
                }}
                className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register' ? 'bg-[#14532D] text-white' : 'text-[#526058] hover:text-[#18231D]'
                }`}
              >
                إنشاء حساب متبرع
              </button>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs font-semibold text-[#B91C1C]">
              {error}
            </div>
          )}

          {infoMsg && (
            <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#14532D] space-y-1.5 leading-relaxed">
              <div className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{infoMsg}</span>
              </div>
              {previewCodeHint && (
                <div className="font-mono text-sm font-bold text-[#14532D] bg-white px-3 py-1.5 rounded border border-[#A7F3D0] w-fit">
                  رمز التحقق: {previewCodeHint}
                </div>
              )}
            </div>
          )}

          {!setupStatus ? (
            <div className="py-8 text-center text-sm text-[#526058]">جارٍ التحقق من تهيئة قاعدة البيانات...</div>
          ) : !setupStatus.initialized ? (
            <form onSubmit={handleSuperAdminSetup} className="space-y-4">
              <div className="p-3.5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#14532D] leading-relaxed flex gap-2.5">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  النظام يعمل بقاعدة بيانات نظيفة دون أي حسابات افتراضية. أنشئ الآن حساب المدير الرئيسي الأول؛ وبعد
                  الحفظ ستُغلق شاشة الإعداد نهائيًا.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18231D] mb-1.5">الاسم الكامل للمدير الرئيسي</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: الأستاذ / محمد أحمد ..."
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18231D] mb-1.5">رقم الهاتف</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010xxxxxxxx"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18231D] mb-1.5">اسم المستخدم (بالإنجليزية)</label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  placeholder="admin_sherbas"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D] font-mono text-left"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#18231D] mb-1.5">كلمة المرور (8+ أحرف)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#18231D] mb-1.5">تأكيد كلمة المرور</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              {setupStatus.requiresSetupKey && (
                <div>
                  <label className="block text-xs font-semibold text-[#18231D] mb-1.5">مفتاح الإعداد الأمني (INITIAL_SETUP_KEY)</label>
                  <input
                    type="password"
                    required
                    value={setupKey}
                    onChange={(e) => setSetupKey(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors disabled:opacity-60"
              >
                {loading ? 'جارٍ إنشاء الحساب وتأمين النظام...' : 'إنشاء حساب المدير الرئيسي والبدء'}
              </button>
            </form>
          ) : mode === 'register' ? (
            <form onSubmit={handleDonorRegister} className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-[#18231D]">إنشاء حساب متبرع</h2>
                <p className="text-xs text-[#526058] mt-0.5">
                  تستطيع من خلال حسابك تقديم طلبات التبرع ومتابعة اعتمادها وتحميل إيصالاتك الرسمية وتتبع أوجه الصرف.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18231D] mb-1.5">الاسم بالكامل *</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  placeholder="الاسم الثلاثي أو الكامل للمتبرع"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18231D] mb-1.5">رقم الهاتف *</label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={donorPhone}
                    onChange={(e) => {
                      setDonorPhone(e.target.value);
                      setVerificationId('');
                      setPreviewCodeHint('');
                    }}
                    placeholder="01012345678"
                    className="flex-1 px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D] font-mono text-left"
                  />
                  <button
                    type="button"
                    onClick={handleRequestVerificationCode}
                    disabled={sendingCode}
                    className="px-3.5 py-2 text-xs font-semibold text-[#14532D] border border-[#14532D]/40 bg-[#ECFDF5] hover:bg-[#D1FAE5] rounded-lg whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    {sendingCode ? 'جارٍ الإرسال...' : verificationId ? 'إعادة إرسال الرمز' : 'إرسال رمز التحقق'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[#18231D]">البريد الإلكتروني (اختياري)</label>
                  {donorEmail.trim() && (
                    <select
                      value={verifyChannel}
                      onChange={(e) => setVerifyChannel(e.target.value as 'phone' | 'email')}
                      className="text-[11px] border border-[#E3E7E2] rounded px-2 py-0.5 bg-white text-[#526058]"
                    >
                      <option value="phone">التحقق عبر الهاتف</option>
                      <option value="email">التحقق عبر البريد</option>
                    </select>
                  )}
                </div>
                <input
                  type="email"
                  dir="ltr"
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D] font-mono text-left"
                />
              </div>

              {verificationId && (
                <div>
                  <label className="block text-xs font-semibold text-[#18231D] mb-1.5">رمز التحقق (6 أرقام) *</label>
                  <input
                    type="text"
                    required
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="أدخل رمز التحقق المكون من 6 أرقام"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#14532D]/40 bg-[#F8F9F7] rounded-lg focus:outline-none focus:border-[#14532D] font-mono text-left tracking-widest"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#18231D] mb-1.5">كلمة المرور * (8+ أحرف)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={donorPassword}
                    onChange={(e) => setDonorPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#18231D] mb-1.5">تأكيد كلمة المرور *</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={donorConfirmPassword}
                    onChange={(e) => setDonorConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D]"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <input
                  id="accept-privacy-policy"
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  className="mt-1 accent-[#14532D]"
                />
                <label htmlFor="accept-privacy-policy" className="text-xs text-[#18231D] leading-relaxed">
                  أوافق على{' '}
                  <button
                    type="button"
                    onClick={() => setShowPrivacyModal(true)}
                    className="font-bold text-[#14532D] underline hover:text-[#0F3F22]"
                  >
                    سياسة الخصوصية وحماية البيانات
                  </button>{' '}
                  للجمعية الخيرية بشرباص.
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>{loading ? 'جارٍ التحقق وإنشاء الحساب...' : 'إنشاء حساب متبرع'}</span>
              </button>

              <div className="pt-3 border-t border-[#E3E7E2] flex items-start gap-2.5 text-xs text-[#526058] leading-relaxed">
                <Lock className="w-4 h-4 text-[#14532D] shrink-0 mt-0.5" />
                <span>
                  تنظيم الحسابات: يُتاح التسجيل الذاتي هنا لحسابات المتبرعين فقط. أما حسابات الإدارة والموظفين والباحثين
                  فتُنشأ حصريًا من قِبل المدير الرئيسي للنظام ولا يمكن تسجيلها ذاتيًا.
                </span>
              </div>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#18231D] mb-1.5">
                  اسم المستخدم أو رقم الهاتف أو البريد الإلكتروني
                </label>
                <input
                  type="text"
                  required
                  dir="ltr"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="أدخل اسم المستخدم أو 010xxxxxxxx أو البريد"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D] font-mono text-left"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#18231D] mb-1.5">كلمة المرور</label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#E3E7E2] rounded-lg focus:outline-none focus:border-[#14532D]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>{loading ? 'جارٍ التحقق...' : 'تسجيل الدخول'}</span>
              </button>

              <div className="pt-3 border-t border-[#E3E7E2] space-y-2.5 text-xs text-[#526058] leading-relaxed">
                <div className="flex items-center justify-between gap-2">
                  <span>متبرع جديد بالجمعية؟</span>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError('');
                    }}
                    className="font-bold text-[#14532D] hover:underline"
                  >
                    إنشاء حساب متبرع الآن
                  </button>
                </div>
                <div className="flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-[#14532D] shrink-0 mt-0.5" />
                  <span>
                    تنظيم الحسابات: يُتاح التسجيل الذاتي لحسابات المتبرعين فقط، بينما تُنشأ وتُدار جميع حسابات
                    الإدارة والموظفين حصريًا من قِبل المدير الرئيسي للنظام.
                  </span>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E3E7E2] rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3E7E2] pb-3">
              <h3 className="text-base font-bold text-[#14532D]">سياسة الخصوصية وحماية البيانات · الجمعية الخيرية بشرباص</h3>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="p-1 text-[#526058] hover:text-[#18231D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-[#526058] leading-relaxed">
              <p>
                <strong className="text-[#18231D]">1. استخدام بيانات المتبرع:</strong> تُستخدم بيانات الاسم ورقم الهاتف
                والبريد الإلكتروني فقط لتوثيق حساب المتبرع وإصدار الإيصالات المالية الرسمية ومتابعة تبرعاته دون مشاركة
                بياناته الشخصية للعامة أو أي جهات خارجية.
              </p>
              <p>
                <strong className="text-[#18231D]">2. الاعتماد المالي وإثباتات الدفع:</strong> تُحفظ صور إيصالات التحويل
                البنكي والمحافظ في مخزن ملفات محمي ولا يُسمح بالوصول إليها إلا للمتبرع صاحب الطلب والمراجع المالي المخول.
              </p>
              <p>
                <strong className="text-[#18231D]">3. حماية خصوصية المستفيدين:</strong> تعرض بوابة الشفافية إجماليات
                وبنود ومستندات المصروفات العامة والمشروعات المعتمدة، مع الحجب الكامل للبيانات الشخصية للمستفيدين.
              </p>
              <p>
                <strong className="text-[#18231D]">4. الصلاحيات والحوكمة:</strong> يقتصر التسجيل الذاتي على حسابات
                المتبرعين فقط، وتخضع كافة العمليات المالية لسجل تدقيق إلكتروني لحماية أموال المتبرعين والجمعية.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E3E7E2]">
              <button
                type="button"
                onClick={() => {
                  setAcceptedPrivacy(true);
                  setShowPrivacyModal(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#14532D] rounded-lg"
              >
                موافق وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

