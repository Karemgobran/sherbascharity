export function toAsciiDigits(input: string): string {
  return String(input || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizePhone(raw: string): string {
  let cleaned = toAsciiDigits(raw).replace(/[\s\-().+]/g, '');
  if (!cleaned) return '';
  // Normalize Egyptian country prefix (+20 / 0020 / 201...) into local 01... format
  if (cleaned.startsWith('0020')) {
    cleaned = `0${cleaned.slice(4)}`;
  } else if (cleaned.startsWith('20') && cleaned.length >= 11 && cleaned.length <= 12) {
    cleaned = `0${cleaned.slice(2)}`;
  }
  return cleaned;
}

export function isValidPhone(normalized: string): boolean {
  if (!/^[0-9]{10,15}$/.test(normalized)) return false;
  // Reject all-identical digits (e.g. 00000000000, 11111111111)
  if (/^(\d)\1+$/.test(normalized)) return false;
  // Reject repeated pattern like 01000000000 or 01111111111 or sequential 01234567890
  if (/^01[0125](\d)\1{7}$/.test(normalized)) return false;
  if (normalized === '01234567890' || normalized === '0123456789') return false;
  // If Egyptian mobile prefix, enforce 11 digits starting with 010, 011, 012, 015
  if (normalized.startsWith('01')) {
    return /^01[0125][0-9]{8}$/.test(normalized);
  }
  // If local Egyptian landline, allow 0[2-9] + 7..8 digits
  if (normalized.startsWith('0')) {
    return /^0[2-9][0-9]{7,8}$/.test(normalized);
  }
  return true;
}

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  if (!email) return true;
  if (email.length > 150) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
