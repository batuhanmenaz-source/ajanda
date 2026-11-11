// Hatırlatma seçimleri: kullanıcının seçtiği "ne zaman hatırlat" ayarları ve Google Takvim bildirimlerine dönüşümü.
// alerts = { list: ['0','10m','1d',...], at: '09:00', daily: false, nag: false }
//   '0'          → tam zamanında (saatli kayıtlar)
//   '10m','1h'   → başlangıçtan dakika/saat önce
//   '0d'         → başladığı gün, 'at' saatinde (tüm gün kayıtlar)
//   '1d','7d'    → N gün önce, 'at' saatinde
//   daily        → seçilen en uzak günden başlayana kadar her gün 'at' saatinde (kampanya/etkinlik)
//   nag          → yapılana kadar her gün tekrar (hatırlatma/arama)
import { addDays, startOfDay } from './dates.js';

export const MAX_ALERTS = 5; // Google Takvim bir etkinlik için en fazla 5 bildirim gönderir

export const TIMED_CHOICES = [['0', 'Tam zamanında'], ['10m', '10 dk önce'], ['30m', '30 dk önce'], ['1h', '1 saat önce'], ['2h', '2 saat önce']];
export const DAY_CHOICES = [['1d', '1 gün önce'], ['2d', '2 gün önce'], ['3d', '3 gün önce'], ['7d', '1 hafta önce']];

export const ALERT_TYPES = [
  ['reminder', 'Hatırlatmalar'], ['call', 'Aramalar'], ['campaign', 'Kampanyalar'], ['event', 'Etkinlikler'],
  ['special', 'Özel günler'], ['collab', 'İş birlikleri (yayın günü)'], ['note', 'Notlar']
];
export const DEFAULT_ALERTS = {
  reminder: { list: ['0'], at: '09:00' },
  call: { list: ['10m'], at: '09:00' },
  campaign: { list: ['3d', '1d'], at: '09:00' },
  event: { list: ['1d'], at: '09:00' },
  special: { list: ['1d'], at: '09:00' },
  collab: { list: ['1d'], at: '09:00' },
  note: { list: ['0'], at: '09:00' }
};

export function normAlerts(a, fallback) {
  const base = a && typeof a === 'object' ? a : fallback || { list: [] };
  return { list: Array.isArray(base.list) ? base.list.slice() : [], at: base.at || '09:00', daily: !!base.daily, nag: !!base.nag };
}
export function alertDefaults(settingsDefaults) {
  const out = {};
  Object.keys(DEFAULT_ALERTS).forEach((k) => { out[k] = normAlerts((settingsDefaults || {})[k], DEFAULT_ALERTS[k]); });
  return out;
}

const minutesOf = (tok) => {
  const m = /^(\d+)(m|h)$/.exec(tok);
  if (tok === '0') return 0;
  if (!m) return null;
  return Number(m[1]) * (m[2] === 'h' ? 60 : 1);
};
const daysOf = (tok) => { const m = /^(\d+)d$/.exec(tok); return m ? Number(m[1]) : null; };
const atMin = (at) => { const [h, mi] = (at || '09:00').split(':').map(Number); return (h || 0) * 60 + (mi || 0); };

// Seçilen gün sayıları (daily açıksa en uzak günden 1'e kadar hepsi)
function dayList(a) {
  const days = a.list.map(daysOf).filter((n) => n != null);
  if (a.daily) {
    const pos = days.filter((n) => n > 0);
    const far = pos.length ? Math.max(...pos) : 3;
    const all = new Set(days);
    for (let n = 1; n <= far; n++) all.add(n);
    return [...all].sort((x, y) => x - y);
  }
  return [...new Set(days)].sort((x, y) => x - y);
}

// Google için "başlangıçtan kaç dakika önce" listesi. allDay: başlangıç gün başı (00:00).
// Döner: { overrides: [dk...], sameDayAt: bool (tüm gün kayıtta "başladığı gün" isteği), dropped: n }
export function toOverrides(alerts, { start, allDay }) {
  const a = normAlerts(alerts);
  const out = [];
  let sameDayAt = false;
  if (!allDay) a.list.forEach((t) => { const m = minutesOf(t); if (m != null) out.push(m); });
  if (allDay && a.list.includes('0')) sameDayAt = true; // saatsiz kayıtta "tam zamanında" = başladığı gün
  const days = dayList(a);
  days.forEach((n) => {
    if (n === 0) { if (allDay) sameDayAt = true; else { const st = new Date(start); const d = startOfDay(st); d.setMinutes(atMin(a.at)); const m = Math.round((st - d) / 60000); if (m > 0) out.push(m); } return; }
    if (allDay) { const m = n * 1440 - atMin(a.at); if (m >= 0) out.push(m); return; }
    const st = new Date(start);
    const d = addDays(startOfDay(st), -n); d.setMinutes(atMin(a.at));
    const m = Math.round((st - d) / 60000);
    if (m > 0) out.push(m);
  });
  const uniq = [...new Set(out)].filter((m) => m >= 0 && m <= 40320).sort((x, y) => x - y);
  // En yakın olanlar kalsın; Google en fazla 5 bildirim kabul ediyor
  const keep = uniq.slice(0, MAX_ALERTS - (sameDayAt ? 1 : 0));
  return { overrides: keep, sameDayAt, dropped: uniq.length - keep.length };
}

// Uygulama takviminde "hazırlık" satırları için gün sayıları (kampanyalar)
export function prepDays(alerts) {
  return dayList(normAlerts(alerts)).filter((n) => n > 0);
}

export function alertsLabel(alerts, { allDay } = {}) {
  const a = normAlerts(alerts);
  const parts = [];
  let dayBased = false;
  if (!allDay) TIMED_CHOICES.forEach(([k, l]) => { if (a.list.includes(k)) parts.push(l.toLocaleLowerCase('tr-TR')); });
  if (allDay && (a.list.includes('0') || a.list.includes('0d'))) { parts.push('başladığı gün'); dayBased = true; }
  const days = dayList(a).filter((n) => n > 0);
  if (a.daily) { parts.push(Math.max(...days) + ' gün önceden her gün'); dayBased = true; }
  else days.forEach((n) => { parts.push((n === 7 ? '1 hafta' : n + ' gün') + ' önce'); dayBased = true; });
  if (!parts.length) return 'Hatırlatma yok';
  return parts.join(', ') + (dayBased ? ' · ' + a.at : '') + (a.nag ? ' · yapılana kadar her gün' : '');
}

// Hatırlatma/aramada "yapılana kadar her gün tekrar" için en fazla 14 gün
export const NAG_RRULE = 'RRULE:FREQ=DAILY;COUNT=14';
