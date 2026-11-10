// Kayıtları Google Takvim'deki "Ajanda" takvimine yansıtır.
import { saveTimed, saveAllDay, deleteEvent } from './google.js';
import { addDays, fromDateInput, startOfDay } from './dates.js';
import { rrule } from './recur.js';

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

export async function unsyncCampaign(c) {
  if (c.google_event_id) await deleteEvent(c.google_event_id);
  for (const id of c.prep_event_ids || []) await deleteEvent(id);
}
