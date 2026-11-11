import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Printer,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { apiFetch, fetchProtectedBlobUrl } from '../../lib/api.ts';
import { downloadOfficialReceiptPdf } from '../../lib/exportUtils.ts';
import { CHARITY_LOGO_URL, formatDateAr, formatDateTimeAr, formatEGP } from '../../lib/labels.ts';
import type { CharitySettings, ReceiptRecord } from '../../types.ts';

export function BrandLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-lg bg-[#14532D] text-white font-display font-bold shrink-0 ${className}`}
      >
        ش
      </div>
    );
  }
  return (
    <img
      src={CHARITY_LOGO_URL}
      alt="شعار الجمعية الخيرية بشرباص"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`rounded-lg object-cover border border-[#E3E7E2] bg-white shrink-0 ${className}`}
    />
  );
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackTitle,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#EEF2EE] to-[#E1E8E2] text-[#14532D] p-6 text-center ${className}`}
      >
        <ShieldCheck className="w-8 h-8 mb-2 opacity-70" />
        <span className="text-sm font-medium text-[#526058]">{fallbackTitle || alt}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export function StatusText({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}) {
  const config = {
    success: { cls: 'text-[#14532D]', Icon: CheckCircle2 },
    warning: { cls: 'text-[#B45309]', Icon: Clock },
    danger: { cls: 'text-[#B91C1C]', Icon: XCircle },
    info: { cls: 'text-[#1D4ED8]', Icon: AlertTriangle },
    neutral: { cls: 'text-[#526058]', Icon: Clock },
  }[tone];
  const Icon = config.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${config.cls}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function ToastBanner({
  toast,
  onClose,
}: {
  toast: { type: 'success' | 'error' | 'info'; message: string } | null;
  onClose: () => void;
}) {
  if (!toast) return null;
  const styles =
    toast.type === 'success'
      ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#14532D]'
      : toast.type === 'error'
        ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
        : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]';

  return (
    <div className="fixed bottom-5 left-5 z-50 max-w-md no-print">
      <div className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-sm ${styles}`}>
        <span className="text-sm font-medium leading-relaxed">{toast.message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق الإشعار"
          className="p-0.5 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'تأكيد التنفيذ',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 no-print">
      <div className="bg-white border border-[#E3E7E2] rounded-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-[#18231D]">{title}</h3>
          <button type="button" onClick={onCancel} className="p-1 text-[#526058] hover:text-[#18231D]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-[#526058] leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-[#526058] hover:text-[#18231D] border border-[#E3E7E2] rounded-lg transition-colors whitespace-nowrap"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors whitespace-nowrap disabled:opacity-60 ${
              danger ? 'bg-[#B91C1C] hover:bg-[#991B1B]' : 'bg-[#14532D] hover:bg-[#0F3F22]'
            }`}
          >
            {loading ? 'جارٍ التنفيذ...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FilePreviewModal({
  file,
  onClose,
}: {
  file: { id: string; name?: string | null; mimeType?: string | null } | null;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setBlobUrl(null);
      setError('');
      return;
    }
    let active = true;
    let createdUrl: string | null = null;
    setLoading(true);
    setError('');
    setBlobUrl(null);

    fetchProtectedBlobUrl(`/api/files/${file.id}`)
      .then((res) => {
        if (!active) {
          URL.revokeObjectURL(res.blobUrl);
          return;
        }
        createdUrl = res.blobUrl;
        setBlobUrl(res.blobUrl);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'تعذر تحميل المستند المحمي');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [file]);

  if (!file) return null;
  const isPdf = file.mimeType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf');

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 no-print">
      <div className="bg-white border border-[#E3E7E2] rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E3E7E2]">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-[#14532D] shrink-0" />
            <span className="text-sm font-semibold text-[#18231D] truncate">{file.name || 'مستند مرفق'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {blobUrl && (
              <a
                href={blobUrl}
                download={file.name || 'document'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#14532D] border border-[#14532D]/30 rounded-lg hover:bg-[#ECFDF5] whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تنزيل الملف</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#526058] hover:text-[#18231D] rounded-lg border border-[#E3E7E2]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-[#F8F9F7] overflow-auto p-4 flex items-center justify-center min-h-[420px]">
          {loading ? (
            <div className="text-sm text-[#526058]">جارٍ تحميل المستند المحمي...</div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs font-semibold text-[#B91C1C]">
              {error}
            </div>
          ) : blobUrl ? (
            isPdf ? (
              <iframe title={file.name || 'PDF'} src={blobUrl} className="w-full h-[70vh] rounded border border-[#E3E7E2] bg-white" />
            ) : (
              <img
                src={blobUrl}
                alt={file.name || 'إثبات الدفع'}
                className="max-w-full max-h-[72vh] object-contain rounded border border-[#E3E7E2] bg-white"
              />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ReceiptModal({
  receipt,
  settings,
  onClose,
  onBackToAccount,
  backLabel = 'العودة إلى حسابي',
  onNotify,
}: {
  receipt: ReceiptRecord | null;
  settings?: Partial<CharitySettings> | null;
  onClose: () => void;
  onBackToAccount?: () => void;
  backLabel?: string;
  onNotify?: (type: 'success' | 'error' | 'info', msg: string) => void;
}) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!receipt) return;
    document.body.classList.add('receipt-modal-open');
    return () => {
      document.body.classList.remove('receipt-modal-open');
    };
  }, [receipt]);

  if (!receipt) return null;

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      await apiFetch(`/api/receipts/${receipt.id}/increment-print`, { method: 'POST' }).catch(() => {});
      await downloadOfficialReceiptPdf(receipt, settings);
      onNotify?.('success', `تم تنزيل الإيصال الرسمي (${receipt.receipt_number}) بصيغة PDF`);
    } catch (err) {
      onNotify?.('error', err instanceof Error ? err.message : 'تعذر تحميل ملف PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    await apiFetch(`/api/receipts/${receipt.id}/increment-print`, { method: 'POST' }).catch(() => {});
    window.print();
  };

  const handleReturn = () => {
    if (onBackToAccount) {
      onBackToAccount();
    } else {
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto receipt-print-portal">
      <div className="bg-white border border-[#E3E7E2] rounded-xl max-w-2xl w-full overflow-hidden print-container my-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#E3E7E2] bg-[#F8F9F7] no-print">
          <h3 className="text-base font-bold text-[#18231D]">إيصال التبرع الرسمي · {receipt.receipt_number}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#18231D] bg-white border border-[#E3E7E2] hover:bg-[#F3F6F3] rounded-lg whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة الإيصال</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'جارٍ التجهيز...' : 'تحميل PDF'}</span>
            </button>
            <button
              type="button"
              onClick={handleReturn}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#14532D] border border-[#14532D]/30 bg-white hover:bg-[#ECFDF5] rounded-lg whitespace-nowrap"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>{backLabel}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق نافذة الإيصال"
              className="p-2 text-[#526058] hover:text-[#18231D] rounded-lg border border-[#E3E7E2] bg-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6 bg-white">
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-[#E3E7E2]">
            <div className="flex items-center gap-3.5">
              <BrandLogo size={64} />
              <div>
                <h2 className="text-xl font-bold text-[#14532D]">{settings?.name_ar || 'الجمعية الخيرية بشرباص'}</h2>
                <p className="text-xs text-[#526058] mt-1">{settings?.address_ar || 'شرباص - مركز فارسكور - محافظة دمياط'}</p>
                <p className="text-xs text-[#526058] font-mono mt-0.5">
                  {settings?.phone ? `${settings.phone} · ` : ''}
                  {settings?.email ? `${settings.email} · ` : ''}
                  {settings?.website_domain || 'sherbascharity.org'}
                </p>
                {settings?.registration_number && (
                  <p className="text-[11px] text-[#526058] mt-0.5">رقم القيد والإشهار: {settings.registration_number}</p>
                )}
              </div>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-[#18231D]">إيصال استلام تبرع</div>
              <div className="text-sm font-mono font-semibold text-[#14532D] mt-1 tabular-nums">{receipt.receipt_number}</div>
              <div className="text-[11px] font-mono text-[#526058] mt-0.5">كود التحقق: {receipt.verification_hash}</div>
            </div>
          </div>

          <div className="p-5 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] space-y-1">
            <div className="text-xs font-semibold text-[#14532D]">المبلغ المعتمد والمستلم فعليًا</div>
            <div className="text-3xl font-bold text-[#14532D] font-mono tabular-nums">{formatEGP(receipt.amount)}</div>
            <div className="text-sm font-semibold text-[#18231D]">{receipt.amount_words_ar}</div>
          </div>

          <dl className="divide-y divide-[#E3E7E2] border-y border-[#E3E7E2] text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">اسم المتبرع</dt>
              <dd className="font-semibold text-[#18231D]">{receipt.donor_name}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">حالة التبرع</dt>
              <dd className="font-semibold text-[#14532D]">
                {receipt.donation_status && receipt.donation_status !== 'approved'
                  ? receipt.donation_status
                  : 'معتمد ومُستلم فعليًا'}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">رقم مرجع الطلب</dt>
              <dd className="font-mono text-[#18231D] tabular-nums">{receipt.reference_code || `#${receipt.donation_id}`}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">نوع التبرع</dt>
              <dd className="font-semibold text-[#18231D]">{receipt.donation_type_label}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">المشروع / الحملة</dt>
              <dd className="font-semibold text-[#18231D]">{receipt.project_title || 'تبرع عام لأنشطة الجمعية'}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">طريقة الدفع</dt>
              <dd className="text-[#18231D]">{receipt.payment_method}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">تاريخ التبرع</dt>
              <dd className="text-[#18231D] tabular-nums">{formatDateAr(receipt.donation_date)}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">المسؤول عن الاعتماد المالي</dt>
              <dd className="font-semibold text-[#18231D]">{receipt.approved_by_name}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-[#526058]">تاريخ ووقت الاعتماد</dt>
              <dd className="text-[#18231D] tabular-nums">{formatDateTimeAr(receipt.approved_at)}</dd>
            </div>
          </dl>

          <p className="text-xs text-[#526058] leading-relaxed">
            {settings?.receipt_footer_ar ||
              'هذا الإيصال صادر إلكترونيًا من النظام المالي المعتمد للجمعية الخيرية بشرباص بعد التحقق من وصول المبلغ فعليًا إلى الحساب المالي للجمعية.'}
          </p>
        </div>

        <div className="px-6 py-4 border-t border-[#E3E7E2] bg-[#F8F9F7] flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#18231D] bg-white border border-[#E3E7E2] hover:bg-[#F3F6F3] rounded-lg whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة الإيصال</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#14532D] hover:bg-[#0F3F22] rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'جارٍ التجهيز...' : 'تحميل PDF'}</span>
            </button>
          </div>
          <button
            type="button"
            onClick={handleReturn}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#14532D] border border-[#14532D]/30 bg-white hover:bg-[#ECFDF5] rounded-lg whitespace-nowrap"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>{backLabel}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-[#E3E7E2] bg-white rounded-xl p-10 text-center space-y-3">
      <h4 className="text-base font-bold text-[#18231D]">{title}</h4>
      <p className="text-sm text-[#526058] max-w-md mx-auto leading-relaxed">{description}</p>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'جارٍ تحميل البيانات من قاعدة البيانات...' }: { label?: string }) {
  return (
    <div className="border border-[#E3E7E2] bg-white rounded-xl p-10 text-center text-sm text-[#526058]">
      {label}
    </div>
  );
}
