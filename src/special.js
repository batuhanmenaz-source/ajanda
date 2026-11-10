// Özel günler (doğum günü, yıl dönümü…): her yıl aynı gün tekrarlar
import { startOfDay, daysBetween } from './dates.js';

export const SPECIAL_KINDS = [
  ['dogum', 'Doğum günü'],
  ['yildonumu', 'Yıl dönümü'],
  ['diger', 'Özel gün']
];
export const SPECIAL_ICON = { dogum: '🎂', yildonumu: '💍', diger: '⭐' };

// 29 Şubat artık yıl değilse 28 Şubat'ta kutlanır
function onYear(s, y) {
  const m = Number(s.month) - 1;
  let d = Number(s.day);
  const last = new Date(y, m + 1, 0).getDate();
  if (d > last) d = last;
  return new Date(y, m, d);
}

// Verilen günden itibaren (dahil) ilk tekrar
export function specialNext(s, from) {
  const f = startOfDay(from);
  const a = onYear(s, f.getFullYear());
  return a >= f ? a : onYear(s, f.getFullYear() + 1);
}

export function specialOn(s, day) {
  const d = onYear(s, day.getFullYear());
  return d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
}

// "30. yaş günü", "3. yıl dönümü" gibi (yıl biliniyorsa)
export function specialLabel(s, date) {
  const base = s.title;
  if (!s.year) return base;
  const n = date.getFullYear() - Number(s.year);
  if (n <= 0) return base;
  if (s.kind === 'dogum') return base + ' (' + n + ' yaş)';
  if (s.kind === 'yildonumu') return base + ' (' + n + '. yıl)';
  return base + ' (' + n + '. yıl)';
}

export function specialUpcoming(list, now, days) {
  const t = startOfDay(now);
  return (list || [])
    .map((s) => { const d = specialNext(s, t); return { s, date: d, inDays: daysBetween(t, d) }; })
    .filter((x) => days == null || x.inDays <= days)
    .sort((a, b) => a.inDays - b.inDays);
}
