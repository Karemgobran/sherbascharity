import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { CharitySettings, ReceiptRecord } from '../types.ts';
import { CHARITY_LOGO_URL, formatDateAr, formatDateTimeAr, formatEGP } from './labels.ts';

export function exportToExcel(filenameBase: string, sheetName: string, rows: Array<Record<string, unknown>>) {
  const safeRows = rows.length > 0 ? rows : [{ 'ملاحظة': 'لا توجد بيانات مطابقة للتصفية الحالية' }];
  const ws = XLSX.utils.json_to_sheet(safeRows);
  const wb = XLSX.utils.book_new();
  if (!wb.Workbook) wb.Workbook = {};
  wb.Workbook.Views = [{ RTL: true }];
  ws['!views'] = [{ rightToLeft: true }];
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filenameBase}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapArabicLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['—'];
}

// High-DPI RTL Canvas renderer embedded into real A4 PDF via jsPDF
// Uses browser native HarfBuzz shaping so Arabic ligatures, punctuation & Cairo font render flawlessly!
export async function downloadOfficialReceiptPdf(
  receipt: ReceiptRecord,
  settings?: Partial<CharitySettings> | null
): Promise<void> {
  await document.fonts?.ready;

  const width = 1240;
  const height = 1754; // A4 @ 150dpi
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر إنشاء مستند PDF');

  // Crisp paper background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Outer institutional frame
  ctx.strokeStyle = '#14532D';
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, width - 96, height - 96);
  ctx.strokeStyle = '#D5DDD7';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(62, 62, width - 124, height - 124);

  // Header band
  ctx.fillStyle = '#F3F6F3';
  ctx.fillRect(64, 64, width - 128, 220);

  const logo = await loadImageElement(CHARITY_LOGO_URL);
  if (logo) {
    ctx.drawImage(logo, width - 250, 95, 145, 145);
  }

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#14532D';
  ctx.font = '700 42px Cairo, sans-serif';
  ctx.fillText(settings?.name_ar || 'الجمعية الخيرية بشرباص', width - 280, 145);

  ctx.fillStyle = '#526058';
  ctx.font = '500 22px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText(settings?.address_ar || 'شرباص - مركز فارسكور - محافظة دمياط', width - 280, 190);
  ctx.fillText(
    `${settings?.phone ? `هاتف: ${settings.phone}  ·  ` : ''}${settings?.website_domain || 'sherbascharity.org'}${settings?.registration_number ? `  ·  إشهار: ${settings.registration_number}` : ''}`,
    width - 280,
    226
  );

  // Receipt title + unique number on left
  ctx.textAlign = 'left';
  ctx.fillStyle = '#18231D';
  ctx.font = '700 32px Cairo, sans-serif';
  ctx.fillText('إيصال استلام تبرع رسمي', 95, 145);
  ctx.fillStyle = '#14532D';
  ctx.font = '600 24px "IBM Plex Mono", monospace';
  ctx.fillText(`No. ${receipt.receipt_number}`, 95, 190);
  ctx.fillStyle = '#526058';
  ctx.font = '400 18px "IBM Plex Mono", monospace';
  ctx.fillText(`Verify: ${receipt.verification_hash}`, 95, 226);

  // Amount highlight banner
  ctx.fillStyle = '#ECFDF5';
  ctx.fillRect(95, 315, width - 190, 150);
  ctx.strokeStyle = '#A7F3D0';
  ctx.lineWidth = 2;
  ctx.strokeRect(95, 315, width - 190, 150);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#14532D';
  ctx.font = '600 22px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText('مبلغ التبرع المعتمد والمُستلم فعليًا', width - 130, 362);

  ctx.font = '700 44px "IBM Plex Mono", Cairo, sans-serif';
  ctx.fillText(formatEGP(receipt.amount), width - 130, 418);

  ctx.fillStyle = '#18231D';
  ctx.font = '600 23px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText(receipt.amount_words_ar, width - 130, 452);

  // Details grid
  const rows: Array<[string, string]> = [
    ['اسم المتبرع', receipt.donor_name],
    ['حالة التبرع', receipt.donation_status && receipt.donation_status !== 'approved' ? receipt.donation_status : 'معتمد ومُستلم فعليًا'],
    ['رقم مرجع الطلب', receipt.reference_code || `#${receipt.donation_id}`],
    ['نوع التبرع', receipt.donation_type_label],
    ['المشروع / التوجيه', receipt.project_title || 'تبرع عام لأنشطة الجمعية'],
    ['طريقة الدفع', receipt.payment_method],
    ['تاريخ التبرع', formatDateAr(receipt.donation_date)],
    ['المسؤول عن الاعتماد المالي', receipt.approved_by_name],
    ['تاريخ ووقت الاعتماد', formatDateTimeAr(receipt.approved_at)],
  ];

  let y = 528;
  for (let i = 0; i < rows.length; i++) {
    const [label, val] = rows[i];
    if (i % 2 === 0) {
      ctx.fillStyle = '#F8F9F7';
      ctx.fillRect(95, y - 36, width - 190, 62);
    }
    ctx.strokeStyle = '#E3E7E2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(95, y + 26);
    ctx.lineTo(width - 95, y + 26);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#526058';
    ctx.font = '600 21px "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(label, width - 125, y);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#18231D';
    ctx.font = '600 22px "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(val, 125, y);

    y += 68;
  }

  // Official certification note
  y += 38;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#18231D';
  ctx.font = '600 21px "IBM Plex Sans Arabic", sans-serif';
  const footerNote =
    settings?.receipt_footer_ar ||
    'هذا الإيصال صادر إلكترونيًا من النظام المالي المعتمد للجمعية الخيرية بشرباص بعد التحقق من وصول المبلغ فعليًا إلى الحساب المالي للجمعية.';
  const lines = wrapArabicLines(ctx, footerNote, width - 250);
  for (const line of lines) {
    ctx.fillText(line, width - 125, y);
    y += 36;
  }

  // Signature block
  const sigY = height - 240;
  ctx.strokeStyle = '#CBD5CE';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(125, sigY);
  ctx.lineTo(440, sigY);
  ctx.moveTo(width - 440, sigY);
  ctx.lineTo(width - 125, sigY);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#526058';
  ctx.font = '500 20px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText('الاعتماد المالي والمراجعة', width - 282, sigY + 36);
  ctx.fillText('ختم الجمعية الخيرية بشرباص', 282, sigY + 36);

  ctx.fillStyle = '#14532D';
  ctx.font = '700 22px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText(receipt.approved_by_name, width - 282, sigY - 18);
  ctx.fillText('مُعتمد إلكترونيًا', 282, sigY - 18);

  const imgData = canvas.toDataURL('image/jpeg', 0.94);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  pdf.save(`receipt-${receipt.receipt_number}.pdf`);
}

export async function exportReportPdf(
  titleAr: string,
  rows: Array<Record<string, unknown>>,
  settings?: Partial<CharitySettings> | null
): Promise<void> {
  await document.fonts?.ready;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const logo = await loadImageElement(CHARITY_LOGO_URL);

  const columns = rows.length > 0 ? Object.keys(rows[0]).slice(0, 8) : ['البيان'];
  const rowsPerPage = 16;
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();
    const width = 1754;
    const height = 1240;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#F3F6F3';
    ctx.fillRect(40, 40, width - 80, 140);
    if (logo) ctx.drawImage(logo, width - 165, 55, 110, 110);

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#14532D';
    ctx.font = '700 32px Cairo, sans-serif';
    ctx.fillText(settings?.name_ar || 'الجمعية الخيرية بشرباص', width - 190, 96);
    ctx.fillStyle = '#18231D';
    ctx.font = '700 26px Cairo, sans-serif';
    ctx.fillText(titleAr, width - 190, 142);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#526058';
    ctx.font = '500 18px "IBM Plex Sans Arabic", sans-serif';
    ctx.fillText(`تاريخ الإصدار: ${formatDateTimeAr(new Date().toISOString())}`, 70, 96);
    ctx.fillText(`صفحة ${page + 1} من ${totalPages}`, 70, 136);

    const tableWidth = width - 80;
    const colWidth = tableWidth / columns.length;
    let y = 215;

    // Header row
    ctx.fillStyle = '#14532D';
    ctx.fillRect(40, y, tableWidth, 54);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 18px "IBM Plex Sans Arabic", sans-serif';
    ctx.textAlign = 'center';
    columns.forEach((col, idx) => {
      const cx = width - 40 - idx * colWidth - colWidth / 2;
      ctx.fillText(String(col).slice(0, 22), cx, y + 34);
    });
    y += 54;

    const slice = rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    if (slice.length === 0) {
      ctx.fillStyle = '#526058';
      ctx.font = '500 22px "IBM Plex Sans Arabic", sans-serif';
      ctx.fillText('لا توجد بيانات مطابقة في هذا التقرير', width / 2, y + 90);
    } else {
      slice.forEach((row, rIdx) => {
        if (rIdx % 2 === 1) {
          ctx.fillStyle = '#F8F9F7';
          ctx.fillRect(40, y, tableWidth, 54);
        }
        ctx.strokeStyle = '#E3E7E2';
        ctx.strokeRect(40, y, tableWidth, 54);
        ctx.fillStyle = '#18231D';
        ctx.font = '500 17px "IBM Plex Sans Arabic", sans-serif';
        columns.forEach((col, idx) => {
          const cx = width - 40 - idx * colWidth - colWidth / 2;
          const val = row[col] === null || row[col] === undefined ? '—' : String(row[col]);
          ctx.fillText(val.slice(0, 24), cx, y + 34);
        });
        y += 54;
      });
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
  }

  pdf.save(`report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
