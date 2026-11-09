export const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function weekStart(d) {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // Pazartesi = 0
  return addDays(x, -dow);
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtTime(d) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function toDateInput(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function toTimeInput(d) {
  return fmtTime(d);
}

export function fromDateInput(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function combine(dateStr, timeStr) {
  const d = fromDateInput(dateStr);
  if (!d) return null;
  const [h, mi] = (timeStr || '09:00').split(':').map(Number);
  d.setHours(h || 0, mi || 0, 0, 0);
  return d;
}

export function fmtShort(d) {
  return d.getDate() + ' ' + MONTHS[d.getMonth()];
}

export function fmtLong(d) {
  return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

export function dayLabel(d, now = new Date()) {
  const diff = daysBetween(now, d);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()];
  return fmtShort(d);
}

export function whenLabel(d, now = new Date()) {
  if (!d) return 'Tarihsiz';
  return dayLabel(d, now) + ' ' + fmtTime(d);
}

export function rangeLabel(a, b) {
  if (a.getMonth() === b.getMonth()) return a.getDate() + ' – ' + b.getDate() + ' ' + MONTHS[a.getMonth()];
  return fmtShort(a) + ' – ' + fmtShort(b);
}

export function relDays(target, now = new Date()) {
  const n = daysBetween(now, target);
  if (n === 0) return 'Bugün';
  if (n === 1) return 'Yarın';
  if (n > 1) return n + ' gün sonra';
  if (n === -1) return 'Dün';
  return Math.abs(n) + ' gün önce';
}
