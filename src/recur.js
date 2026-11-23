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

// Kural metni: "weekly", "weekly;days=2,4;every=2;until=2027-01-31" gibi (days: 1 = Pazartesi … 7 = Pazar)
export function parseRule(rule) {
  const [base, ...parts] = String(rule || '').split(';');
  const o = { base, days: null, every: 1, until: null };
  parts.forEach((p) => {
    const [k, v] = p.split('=');
    if (k === 'days') o.days = v.split(',').map(Number).filter((n) => n >= 1 && n <= 7).sort();
    else if (k === 'every') o.every = Math.max(1, Math.min(4, Number(v) || 1));
    else if (k === 'until' && /^\d{4}-\d{2}-\d{2}$/.test(v)) o.until = v;
  });
  if (o.days && !o.days.length) o.days = null;
  return o;
}
export function makeRule({ base, days, every, until }) {
  if (!base) return '';
  let r = base;
  if (base === 'weekly' && days && days.length) r += ';days=' + [...days].sort().join(',');
  if (base === 'weekly' && every > 1) r += ';every=' + every;
  if (until) r += ';until=' + until;
  return r;
}
const iso = (d) => ((d.getDay() + 6) % 7) + 1;
const DSH = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const untilEnd = (u) => { const [y, m, d] = u.split('-').map(Number); return new Date(y, m - 1, d, 23, 59, 59); };

export function ruleLabel(rule, due) {
  if (!rule) return '';
  const o = parseRule(rule);
  const d = due ? new Date(due) : null;
  let t;
  if (o.base === 'weekly') {
    const ds = o.days || (d ? [iso(d)] : null);
    const names = ds ? (ds.length === 1 ? WD[ds[0] % 7].toLocaleLowerCase('tr-TR') : ds.map((x) => DSH[x - 1]).join(', ')) : '';
    t = (o.every === 2 ? '2 haftada bir ' : o.every > 2 ? o.every + ' haftada bir ' : 'Her ') + names;
    if (!names) t = o.every > 1 ? o.every + ' haftada bir' : 'Her hafta';
  } else if (o.base === 'monthly' && d) t = 'Her ayın ' + d.getDate() + "'i";
  else t = LABEL[o.base] || '';
  if (o.until) { const u = untilEnd(o.until); t += ' · bitiş ' + u.getDate() + ' ' + MONS[u.getMonth()] + (u.getFullYear() !== new Date().getFullYear() ? ' ' + u.getFullYear() : ''); }
  return t;
}

const dim = (y, m) => new Date(y, m + 1, 0).getDate();
// Pazartesi'den başlayan haftanın numarası (2 haftada bir için)
const weekNo = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (iso(x) - 1)); return Math.round(x.getTime() / (7 * 86400000)); };

function step(d, o, anchor) {
  const x = new Date(d);
  const rule = o.base;
  if (rule === 'daily') x.setDate(x.getDate() + 1);
  else if (rule === 'weekdays') { do { x.setDate(x.getDate() + 1); } while (x.getDay() === 0 || x.getDay() === 6); }
  else if (rule === 'weekly') {
    if (o.days) {
      for (let i = 0; i < 7 * o.every + 1; i++) {
        x.setDate(x.getDate() + 1);
        if (o.days.includes(iso(x)) && (o.every === 1 || ((weekNo(x) - weekNo(anchor)) % o.every + o.every) % o.every === 0)) break;
      }
    } else x.setDate(x.getDate() + 7 * o.every);
  } else if (rule === 'monthly') {
    const y = x.getFullYear(); const m = x.getMonth() + 1;
    const ny = y + Math.floor(m / 12); const nm = m % 12;
    x.setFullYear(ny, nm, Math.min(anchor.getDate(), dim(ny, nm)));
  } else if (rule === 'yearly') {
    const ny = x.getFullYear() + 1;
    x.setFullYear(ny, anchor.getMonth(), Math.min(anchor.getDate(), dim(ny, anchor.getMonth())));
  } else return null;
  return x;
}

// due'dan başlayarak "after"dan sonraki ilk tekrar (saat korunur); bitiş tarihi geçtiyse null
export function nextOccurrence(due, rule, after) {
  const o = parseRule(rule);
  const start = new Date(due);
  const lim = o.until ? untilEnd(o.until) : null;
  let x = new Date(start);
  for (let i = 0; i < 4000; i++) {
    x = step(x, o, start);
    if (!x) return null;
    if (lim && x > lim) return null;
    if (x > after) return x;
  }
  return null;
}

// Tekrarlayan kayıt bu günde gerçekleşiyor mu? (ilk tarihten sonraki günler için)
export function occursOn(due, rule, day) {
  const o = parseRule(rule);
  const s = new Date(due);
  const d0 = startOfDay(s);
  if (day < d0) return false;
  if (o.until && ymd(day) > o.until) return false;
  const dow = day.getDay();
  if (o.base === 'daily') return true;
  if (o.base === 'weekdays') return dow >= 1 && dow <= 5;
  if (o.base === 'weekly') {
    const okDay = o.days ? o.days.includes(iso(day)) : dow === s.getDay();
    return okDay && (o.every === 1 || ((weekNo(day) - weekNo(s)) % o.every + o.every) % o.every === 0);
  }
  if (o.base === 'monthly') return day.getDate() === Math.min(s.getDate(), dim(day.getFullYear(), day.getMonth()));
  if (o.base === 'yearly') return day.getMonth() === s.getMonth() && day.getDate() === Math.min(s.getDate(), dim(day.getFullYear(), s.getMonth()));
  return false;
}

export function rrule(rule, due) {
  const o = parseRule(rule);
  const d = due ? new Date(due) : null;
  let r = null;
  if (o.base === 'daily') r = 'RRULE:FREQ=DAILY';
  else if (o.base === 'weekdays') r = 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  else if (o.base === 'weekly') r = 'RRULE:FREQ=WEEKLY' + (o.every > 1 ? ';INTERVAL=' + o.every : '') + (o.days ? ';BYDAY=' + o.days.map((x) => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][x - 1]).join(',') : '');
  else if (o.base === 'monthly') r = d && d.getDate() > 28 ? 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1' : 'RRULE:FREQ=MONTHLY';
  else if (o.base === 'yearly') r = 'RRULE:FREQ=YEARLY';
  if (r && o.until) r += ';UNTIL=' + untilEnd(o.until).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return r;
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
