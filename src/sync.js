// Kayıtları Google Takvim'deki "Ajanda" takvimine yansıtır.
import { saveTimed, saveAllDay, deleteEvent } from './google.js';
import { addDays, fromDateInput, startOfDay } from './dates.js';
import { rrule } from './recur.js';
import { specialNext, SPECIAL_ICON } from './special.js';

const mpPrefix = (mp) => (mp ? '[' + mp + '] ' : '');
const heart = (x) => (x.for_yarim ? ' ❤️' : '');

// Döner: yeni google_event_id (veya null)
export async function syncReminder(r) {
  if (r.done || !r.due_at) {
    if (r.google_event_id) await deleteEvent(r.google_event_id);
    return null;
  }
  return saveTimed(r.google_event_id, {
    summary: '🔔 ' + mpPrefix(r.marketplace) + r.title + heart(r),
    description: r.for_yarim ? 'Yarim ❤️' : 'Ajanda hatırlatması',
    start: new Date(r.due_at),
    location: r.location || undefined,
    recurrence: r.repeat_rule ? rrule(r.repeat_rule, r.due_at) : undefined
  });
}

export async function syncCall(c) {
  if (c.done || !c.due_at) {
    if (c.google_event_id) await deleteEvent(c.google_event_id);
    return null;
  }
  return saveTimed(c.google_event_id, {
    summary: '📞 ' + c.who + (c.topic ? ' — ' + c.topic : '') + heart(c),
    description: (c.phone ? 'Telefon: ' + c.phone + '\n' : '') + 'Ajanda araması',
    start: new Date(c.due_at)
  });
}

// Kampanya: tüm gün etkinliği + başlangıçtan 3 ve 1 gün önce saat 09:00 hazırlık hatırlatması
export async function syncCampaign(c) {
  const start = fromDateInput(c.start_date);
  const end = fromDateInput(c.end_date);
  const isEvent = c.kind === 'etkinlik';
  const mainId = await saveAllDay(c.google_event_id, {
    summary: (isEvent ? '📅 ' : '📣 ') + (c.marketplace ? c.marketplace + ' · ' : '') + c.name,
    description: c.notes || (isEvent ? 'Ajanda etkinliği' : 'Ajanda kampanyası'),
    startDate: start,
    endDate: end,
    location: c.location || undefined
  });

  for (const id of c.prep_event_ids || []) await deleteEvent(id);
  const prepIds = [];
  // Etkinliklerde hazırlık hatırlatması yok
  if (isEvent) return { google_event_id: mainId, prep_event_ids: [] };
  const today = startOfDay(new Date());
  for (const n of [3, 1]) {
    const day = addDays(start, -n);
    if (day < today) continue;
    day.setHours(9, 0, 0, 0);
    const id = await saveTimed(null, {
      summary: '🧰 Hazırlık: ' + c.name + ' (' + (n === 1 ? 'yarın başlıyor' : n + ' gün kaldı') + ')',
      description: (c.marketplace ? c.marketplace + ' kampanyası. ' : '') + 'Hazırlık adımlarını kontrol et.',
      start: day
    });
    prepIds.push(id);
  }
  return { google_event_id: mainId, prep_event_ids: prepIds };
}

// Özel gün: her yıl tekrarlayan tüm gün etkinliği; N gün önce saat 09:00'da bildirim
export async function syncSpecialDate(s) {
  const first = specialNext(s, startOfDay(new Date()));
  const n = Number(s.remind_days) || 0;
  return saveAllDay(s.google_event_id, {
    summary: (SPECIAL_ICON[s.kind] || '⭐') + ' ' + s.title + heart(s),
    description: s.for_yarim ? 'Yarim ❤️' : 'Ajanda özel günü',
    startDate: first,
    endDate: first,
    recurrence: 'RRULE:FREQ=YEARLY',
    remindMinutes: Math.max(1, n) * 1440 - 9 * 60
  });
}

// İş birliği: yayın günü tüm gün etkinliği, bir gün önce 09:00 bildirim
export async function syncCollab(c, who) {
  if (!c.publish_date || c.status === 'iptal') {
    if (c.google_event_id) await deleteEvent(c.google_event_id);
    return null;
  }
  const d = fromDateInput(c.publish_date);
  return saveAllDay(c.google_event_id, {
    summary: '🎬 ' + (who || 'Influencer') + (c.brand ? ' · ' + c.brand : '') + (c.title ? ' — ' + c.title : ''),
    description: [c.marketplace ? 'Pazaryeri: ' + c.marketplace : '', c.link || '', 'Ajanda iş birliği'].filter(Boolean).join('\n'),
    startDate: d,
    endDate: d,
    remindMinutes: 15 * 60
  });
}

export async function unsyncCampaign(c) {
  if (c.google_event_id) await deleteEvent(c.google_event_id);
  for (const id of c.prep_event_ids || []) await deleteEvent(id);
}
