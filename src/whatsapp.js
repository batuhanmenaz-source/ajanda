// WhatsApp bağlantısı: wa.me adresi, WhatsApp'ı ilgili sohbet ve hazır mesajla açar.
export const DEFAULT_LOVE_MESSAGE = 'Seni seviyorum ❤️';

// "0532 123 45 67", "+90 532...", "532..." → "905321234567"
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d;
}

export function whatsappLink(phone, message) {
  const p = normalizePhone(phone);
  return 'https://wa.me/' + p + '?text=' + encodeURIComponent(message || DEFAULT_LOVE_MESSAGE);
}

export function prettyPhone(phone) {
  const p = normalizePhone(phone);
  if (p.length === 12 && p.startsWith('90')) return '+90 ' + p.slice(2, 5) + ' ' + p.slice(5, 8) + ' ' + p.slice(8, 10) + ' ' + p.slice(10);
  return p ? '+' + p : '';
}
