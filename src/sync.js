// Kayıtları Google Takvim'deki "Ajanda" takvimine yansıtır.
import { saveTimed, saveAllDay, deleteEvent } from './google.js';
import { addDays, fromDateInput, startOfDay, combine } from './dates.js';
import { rrule } from './recur.js';
import { specialNext, SPECIAL_ICON } from './special.js';
import { toOverrides, normAlerts, NAG_RRULE } from './alerts.js';

// Kullanıcının seçtiği hatırlatmalar (alerts) yoksa eski sabit davranış kullanılır
const timedOverrides = (x, start) => (x.alerts ? toOverrides(x.alerts, { start, allDay: false }).overrides : [0]);
const atTime = (date, at) => { const d = new Date(date); const [h, m] = (at || '09:00').split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d; };

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
    recurrence: r.repeat_rule ? rrule(r.repeat_rule, r.due_at) : r.alerts && r.alerts.nag ? NAG_RRULE : undefined,
    overrides: timedOverrides(r, new Date(r.due_at))
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
    start: new Date(c.due_at),
    recurrence: c.alerts && c.alerts.nag ? NAG_RRULE : undefined,
    overrides: timedOverrides(c, new Date(c.due_at))
  });
}

// Kampanya / etkinlik: ana etkinlik (tüm gün ya da saatli) + seçilen hatırlatmalar.
// alerts yoksa eski davranış: kampanyada 3 ve 1 gün önce 09:00 ayrı hazırlık etkinlikleri.
export async function syncCampaign(c) {
  const start = fromDateInput(c.start_date);
  const end = fromDateInput(c.end_date);
  const isEvent = c.kind === 'etkinlik';
  const summary = (isEvent ? '📅 ' : '📣 ') + (c.marketplace ? c.marketplace + ' · ' : '') + c.name;
  const description = c.notes || (isEvent ? 'Ajanda etkinliği' : 'Ajanda kampanyası');
  const timed = !!(c.start_time || c.end_time);
  const st = timed ? combine(c.start_date, c.start_time || '00:00') : start;
  const plan = c.alerts ? toOverrides(c.alerts, { start: st, allDay: !timed }) : null;
  let mainId;
  if (timed) {
    const en = combine(c.end_date, c.end_time || '23:59');
    mainId = await saveTimed(c.google_event_id, { summary, description, start: st, minutes: Math.max(15, Math.round((en - st) / 60000)), location: c.location || undefined, overrides: plan ? plan.overrides : [0] });
  } else {
    mainId = await saveAllDay(c.google_event_id, { summary, description, startDate: start, endDate: end, location: c.location || undefined, overrides: plan ? plan.overrides : [] });
  }

  for (const id of c.prep_event_ids || []) await deleteEvent(id);
  const prepIds = [];
  const now = new Date();
  if (plan) {
    // Tüm gün kayıtta "başladığı gün" bildirimi: o gün seçilen saatte kısa bir etkinlik
    if (plan.sameDayAt) {
      const when = atTime(start, normAlerts(c.alerts).at);
      if (when > now) prepIds.push(await saveTimed(null, { summary: (isEvent ? '📅 Bugün: ' : '📣 Bugün başlıyor: ') + c.name, description, start: when, overrides: [0] }));
    }
    return { google_event_id: mainId, prep_event_ids: prepIds };
  }
  if (isEvent) return { google_event_id: mainId, prep_event_ids: [] };
  const today = startOfDay(now);
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

// Özel gün: her yıl tekrarlayan tüm gün etkinliği + seçilen hatırlatmalar. Döner: { google_event_id, aux_event_id }
export async function syncSpecialDate(s) {
  const first = specialNext(s, startOfDay(new Date()));
  const summary = (SPECIAL_ICON[s.kind] || '⭐') + ' ' + s.title + heart(s);
  const description = s.for_yarim ? 'Yarim ❤️' : 'Ajanda özel günü';
  const plan = s.alerts ? toOverrides(s.alerts, { start: first, allDay: true }) : { overrides: [Math.max(1, Number(s.remind_days) || 1) * 1440 - 9 * 60], sameDayAt: false };
  const id = await saveAllDay(s.google_event_id, { summary, description, startDate: first, endDate: first, recurrence: 'RRULE:FREQ=YEARLY', overrides: plan.overrides });
  let aux = s.aux_event_id || null;
  if (plan.sameDayAt) aux = await saveTimed(aux, { summary: '🎉 Bugün: ' + s.title + heart(s), description, start: atTime(first, normAlerts(s.alerts).at), recurrence: 'RRULE:FREQ=YEARLY', overrides: [0] });
  else if (aux) { await deleteEvent(aux); aux = null; }
  return { google_event_id: id, aux_event_id: aux };
}

// İş birliği: yayın günü tüm gün etkinliği + seçilen hatırlatmalar (varsayılan bir gün önce 09:00). Döner: { google_event_id, aux_event_id }
export async function syncCollab(c, who) {
  if (!c.publish_date || c.status === 'iptal') {
    if (c.google_event_id) await deleteEvent(c.google_event_id);
    if (c.aux_event_id) await deleteEvent(c.aux_event_id);
    return { google_event_id: null, aux_event_id: null };
  }
  const d = fromDateInput(c.publish_date);
  const summary = '🎬 ' + (who || 'Influencer') + (c.brand ? ' · ' + c.brand : '') + (c.title ? ' — ' + c.title : '');
  const description = [c.marketplace ? 'Pazaryeri: ' + c.marketplace : '', c.link || '', 'Ajanda iş birliği'].filter(Boolean).join('\n');
  const plan = c.alerts ? toOverrides(c.alerts, { start: d, allDay: true }) : { overrides: [15 * 60], sameDayAt: false };
  const id = await saveAllDay(c.google_event_id, { summary, description, startDate: d, endDate: d, overrides: plan.overrides });
  let aux = c.aux_event_id || null;
  const when = atTime(d, normAlerts(c.alerts).at);
  if (plan.sameDayAt && when > new Date()) aux = await saveTimed(aux, { summary: '🎬 Bugün yayında: ' + (who || 'Influencer') + (c.brand ? ' · ' + c.brand : ''), description, start: when, overrides: [0] });
  else if (aux) { await deleteEvent(aux); aux = null; }
  return { google_event_id: id, aux_event_id: aux };
}

// Not: "Hatırlat" tarihi verildiyse takvime saatli kayıt
export async function syncNote(n) {
  if (!n.remind_at) {
    if (n.google_event_id) await deleteEvent(n.google_event_id);
    return null;
  }
  return saveTimed(n.google_event_id, {
    summary: '📝 ' + mpPrefix(n.marketplace) + n.title,
    description: ((n.body || '').slice(0, 800) + '\n\nAjanda notu').trim(),
    start: new Date(n.remind_at),
    overrides: timedOverrides(n, new Date(n.remind_at))
  });
}

export async function unsyncCampaign(c) {
  if (c.google_event_id) await deleteEvent(c.google_event_id);
  if (c.aux_event_id) await deleteEvent(c.aux_event_id);
  for (const id of c.prep_event_ids || []) await deleteEvent(id);
}
