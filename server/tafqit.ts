// Arabic Tafqit (تفقيط الأرقام) for Egyptian Pounds (جنيه مصري) & Piastres (قرش)

const ONES = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
];

const TENS_11_19 = [
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const TENS = [
  '',
  'عشرة',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
];

const HUNDREDS = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

function convertBelowThousand(n: number): string {
  if (n === 0) return '';
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];

  if (h > 0) {
    parts.push(HUNDREDS[h]);
  }

  if (rem > 0) {
    if (rem < 10) {
      parts.push(ONES[rem]);
    } else if (rem >= 10 && rem <= 19) {
      parts.push(TENS_11_19[rem - 10]);
    } else {
      const u = rem % 10;
      const t = Math.floor(rem / 10);
      if (u > 0) {
        parts.push(`${ONES[u]} و${TENS[t]}`);
      } else {
        parts.push(TENS[t]);
      }
    }
  }

  return parts.join(' و');
}

function convertIntegerToArabic(num: number): string {
  if (num === 0) return 'صفر';

  const billions = Math.floor(num / 1_000_000_000);
  const millions = Math.floor((num % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((num % 1_000_000) / 1_000);
  const rest = num % 1_000;

  const parts: string[] = [];

  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions >= 3 && billions <= 10) parts.push(`${convertBelowThousand(billions)} مليارات`);
    else parts.push(`${convertBelowThousand(billions)} مليارًا`);
  }

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(`${convertBelowThousand(millions)} ملايين`);
    else parts.push(`${convertBelowThousand(millions)} مليونًا`);
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(`${convertBelowThousand(thousands)} آلاف`);
    else parts.push(`${convertBelowThousand(thousands)} ألفًا`);
  }

  if (rest > 0) {
    parts.push(convertBelowThousand(rest));
  }

  return parts.join(' و');
}

function poundLabel(n: number): string {
  const mod100 = n % 100;
  if (n === 1) return 'جنيه مصري';
  if (n === 2) return 'جنيهان مصريان';
  if (mod100 >= 3 && mod100 <= 10) return 'جنيهات مصرية';
  return 'جنيهًا مصريًا';
}

function piastreLabel(n: number): string {
  const mod100 = n % 100;
  if (n === 1) return 'قرش';
  if (n === 2) return 'قرشان';
  if (mod100 >= 3 && mod100 <= 10) return 'قروش';
  return 'قرشًا';
}

export function amountToArabicWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return 'صفر جنيه مصري';
  const rounded = Math.round(amount * 100) / 100;
  const pounds = Math.floor(rounded);
  const piastres = Math.round((rounded - pounds) * 100);

  const parts: string[] = [];
  if (pounds > 0) {
    if (pounds === 1) parts.push('جنيه مصري واحد');
    else if (pounds === 2) parts.push('جنيهان مصريان');
    else parts.push(`${convertIntegerToArabic(pounds)} ${poundLabel(pounds)}`);
  }

  if (piastres > 0) {
    if (piastres === 1) parts.push('قرش واحد');
    else if (piastres === 2) parts.push('قرشان');
    else parts.push(`${convertIntegerToArabic(piastres)} ${piastreLabel(piastres)}`);
  }

  if (parts.length === 0) {
    return 'صفر جنيه مصري';
  }

  return `فقط ${parts.join(' و')} لا غير`;
}
