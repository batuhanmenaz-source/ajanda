// Tekrarlayan hatırlatmalar: kurallar, sonraki tarih, bir günde gerçekleşiyor mu, Google RRULE
import { startOfDay, addDays } from './dates.js';

export const RULES = [
  ['', 'Tekrar yok'],
  ['daily', 'Her gün'],
  ['weekdays', 'Hafta içi her gün'],
  ['weekly', 'Her hafta'],
  ['monthly', 'Her ay'],
  ['yearly', 'Her yıl']
];
const LABEL = Object.fromEntries(RULES);
const WD = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function ruleLabel(rule, due) {
  if (!rule) return '';
  const d = due ? new Date(due) : null;
  if (rule === 'weekly' && d) return 'Her ' + WD[d.getDay()].toLocaleLowerCase('tr-TR');
  if (rule === 'monthly' && d) return 'Her ayın ' + d.getDate() + "'i";
  return LABEL[rule] || '';
}

const dim = (y, m) => new Date(y, m + 1, 0).getDate();

function step(d, rule, anchorDay, anchorMonth) {
  const x = new Date(d);
  if (rule === 'daily') x.setDate(x.getDate() + 1);
  else if (rule === 'weekdays') { do { x.setDate(x.getDate() + 1); } while (x.getDay() === 0 || x.getDay() === 6); }
  else if (rule === 'weekly') x.setDate(x.getDate() + 7);
  else if (rule === 'monthly') {
    const y = x.getFullYear(); const m = x.getMonth() + 1;
    const ny = y + Math.floor(m / 12); const nm = m % 12;
    x.setFullYear(ny, nm, Math.min(anchorDay, dim(ny, nm)));
  } else if (rule === 'yearly') {
    const ny = x.getFullYear() + 1;
    x.setFullYear(ny, anchorMonth, Math.min(anchorDay, dim(ny, anchorMonth)));
  } else return null;
  return x;
}

// due'dan başlayarak "after"dan sonraki ilk tekrar (saat korunur)
export function nextOccurrence(due, rule, after) {
  const start = new Date(due);
  let x = new Date(start);
  for (let i = 0; i < 4000; i++) {
    x = step(x, rule, start.getDate(), start.getMonth());
    if (!x) return null;
    if (x > after) return x;
  }
  return null;
}

// Tekrarlayan kayıt bu günde gerçekleşiyor mu? (ilk tarihten sonraki günler için)
export function occursOn(due, rule, day) {
  const s = new Date(due);
  const d0 = startOfDay(s);
  if (day < d0) return false;
  const dow = day.getDay();
  if (rule === 'daily') return true;
  if (rule === 'weekdays') return dow >= 1 && dow <= 5;
  if (rule === 'weekly') return dow === s.getDay();
  if (rule === 'monthly') return day.getDate() === Math.min(s.getDate(), dim(day.getFullYear(), day.getMonth()));
  if (rule === 'yearly') return day.getMonth() === s.getMonth() && day.getDate() === Math.min(s.getDate(), dim(day.getFullYear(), s.getMonth()));
  return false;
}

export function rrule(rule, due) {
  const d = due ? new Date(due) : null;
  if (rule === 'daily') return 'RRULE:FREQ=DAILY';
  if (rule === 'weekdays') return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (rule === 'weekly') return 'RRULE:FREQ=WEEKLY';
  if (rule === 'monthly') return d && d.getDate() > 28 ? 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1' : 'RRULE:FREQ=MONTHLY';
  if (rule === 'yearly') return 'RRULE:FREQ=YEARLY';
  return null;
}

// Hızlı ekle metninden tekrar kuralı: { rule, removals, monthDay }
export function parseRepeat(s) {
  const out = { rule: '', removals: [], monthDay: null };
  let m;
  if ((m = s.match(/\s(her\s+ay(ın)?\s+(\d{1,2})['’]?(\s?(i|ı|u|ü|si|sı|sü|su|inde|ında|unda|ünde|sinde|sında))?)(?=[\s,.]|$)/))) {
    out.rule = 'monthly'; out.monthDay = Math.min(31, Math.max(1, parseInt(m[3], 10))); out.removals.push(new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  } else if ((m = s.match(/\s(her\s+ay)(?=[\s,.]|$)/))) { out.rule = 'monthly'; out.removals.push(new RegExp(m[1], 'i')); }
  else if ((m = s.match(/\s(hafta\s?içi(\s+her\s+gün)?)(?=[\s,.]|$)/))) { out.rule = 'weekdays'; out.removals.push(new RegExp(m[1].replace(/\s/g, '\\s?'), 'i')); }
  else if ((m = s.match(/\s(her\s+(gün|sabah|akşam)|hergün)(?=[\s,.]|$)/))) { out.rule = 'daily'; out.removals.push(new RegExp(m[1], 'i')); }
  else if ((m = s.match(/\s(her)\s+(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar)(?=[\s,.'’]|$)/))) { out.rule = 'weekly'; out.removals.push(/(^|\s)her(?=\s+(pazartesi|salı|çarşamba|perşembe|cuma|cumartesi|pazar))/i); }
  else if ((m = s.match(/\s(her\s+hafta)(?=[\s,.]|$)/))) { out.rule = 'weekly'; out.removals.push(new RegExp(m[1], 'i')); }
  else if ((m = s.match(/\s(her\s+(yıl|sene))(?=[\s,.]|$)/))) { out.rule = 'yearly'; out.removals.push(new RegExp(m[1], 'i')); }
  return out;
}

export { addDays };
