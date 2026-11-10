// Google Takvim bağlantısı.
// - Kullanıcının takvimlerindeki etkinlikleri okur (Ajanda takvimi hariç).
// - Hatırlatma, arama ve kampanyaları "Ajanda" adlı ayrı bir takvime yazar;
//   bildirimleri telefondaki Google Takvim gönderir.
import { supabase } from './supabase.js';
import { addDays, toDateInput } from './dates.js';

const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_KEY = 'ajanda-gtoken';
const CAL_KEY = 'ajanda-gcal';
export const AJANDA_CAL_NAME = 'Ajanda';
const TZ = 'Europe/Istanbul';

export class GoogleAuthError extends Error {}

let memToken = null;
try { memToken = JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { memToken = null; }

function setToken(token, expiresIn) {
  memToken = { token, exp: Date.now() + (expiresIn - 120) * 1000 };
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(memToken)); } catch { /* yok say */ }
}

export function clearGoogleCache() {
  memToken = null;
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(CAL_KEY); } catch { /* yok say */ }
}

// Google ile girişten hemen sonra Supabase oturumu Google anahtarlarını taşır; onları saklarız.
// Döner: { ok, error } — yenileme anahtarı veritabanına kaydedildi mi?
export async function captureGoogleTokens(session) {
  if (!session) return { ok: false, error: 'no_session' };
  if (session.provider_token) setToken(session.provider_token, 3600);
  calListCache = null;
  if (!session.provider_refresh_token) return { ok: false, error: 'no_refresh_token_from_google' };
  const { error } = await supabase.from('google_tokens').upsert({
    user_id: session.user.id,
    refresh_token: session.provider_refresh_token,
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.warn('Google yenileme anahtarı kaydedilemedi', error);
    return { ok: false, error: error.message || 'save_failed' };
  }
  return { ok: true };
}

// Son Google hatasının nedeni (Hesap penceresinde gösterilir)
export let lastGoogleReason = '';

async function accessToken(force = false) {
  if (!force && memToken && memToken.exp > Date.now()) return memToken.token;
  const { data, error } = await supabase.from('google_tokens').select('refresh_token').maybeSingle();
  if (error) { lastGoogleReason = 'Veritabanında google_tokens tablosu okunamadı (' + error.message + ')'; throw new GoogleAuthError(lastGoogleReason); }
  if (!data || !data.refresh_token) { lastGoogleReason = 'Kayıtlı Google anahtarı yok'; throw new GoogleAuthError('no_refresh_token'); }
  const r = await fetch('/api/google-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: data.refresh_token })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    lastGoogleReason = 'Google anahtarı yenilenemedi: ' + (j.error || r.status) + (j.message ? ' — ' + j.message : '');
    if (r.status === 401) throw new GoogleAuthError('refresh_failed');
    throw new Error(j.message || j.error || 'token_error');
  }
  lastGoogleReason = '';
  setToken(j.access_token, j.expires_in || 3600);
  return j.access_token;
}

async function gfetch(path, opts = {}, retried = false) {
  const token = await accessToken(retried);
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  if (r.status === 401 && !retried) return gfetch(path, opts, true);
  if (r.status === 401 || r.status === 403) {
    const j = await r.json().catch(() => ({}));
    const msg = (j.error && j.error.message) || 'forbidden';
    const reasons = JSON.stringify(j.error || {});
    // Takvim izni verilmemişse (giriş sırasında kutu işaretlenmemişse) yeniden bağlanmak gerekir
    if (r.status === 401 || /insufficient|SCOPE_INSUFFICIENT|insufficientPermissions/i.test(reasons)) throw new GoogleAuthError(msg);
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((j.error && j.error.message) || 'google_error');
    err.status = r.status;
    throw err;
  }
  return j;
}

// Drive gibi diğer Google API'leri için (tam adresle). Yetki eksikse DriveScopeError fırlatır.
export class DriveScopeError extends Error {}
export async function googleRaw(url, opts = {}, retried = false) {
  const token = await accessToken(retried);
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
  if (r.status === 401 && !retried) return googleRaw(url, opts, true);
  if (r.status === 401) throw new GoogleAuthError('unauthorized');
  if (r.status === 403) {
    const j = await r.json().catch(() => ({}));
    const reasons = JSON.stringify(j.error || {});
    if (/insufficient|SCOPE_INSUFFICIENT|insufficientPermissions|ACCESS_TOKEN_SCOPE/i.test(reasons)) throw new DriveScopeError('drive_scope');
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(reasons)) { const e = new Error('drive_api_disabled'); e.code = 'drive_api_disabled'; throw e; }
    throw new Error((j.error && j.error.message) || 'forbidden');
  }
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || 'google_error'); e.status = r.status; throw e; }
  return j;
}

// Bağlantıyı ve takvim iznini birlikte kontrol eder
export async function checkGoogle() {
  await accessToken();
  calListCache = null;
  await calendarList();
  return true;
}

let calListCache = null;
async function calendarList() {
  if (calListCache && calListCache.at > Date.now() - 5 * 60 * 1000) return calListCache.items;
  const j = await gfetch('/users/me/calendarList?minAccessRole=reader&maxResults=250');
  calListCache = { at: Date.now(), items: j.items || [] };
  return calListCache.items;
}

export async function ajandaCalendarId() {
  let cached = null;
  try { cached = localStorage.getItem(CAL_KEY); } catch { cached = null; }
  const items = await calendarList();
  if (cached && items.some((c) => c.id === cached)) return cached;
  const found = items.find((c) => c.summary === AJANDA_CAL_NAME && c.accessRole === 'owner');
  let id = found && found.id;
  if (!id) {
    const created = await gfetch('/calendars', {
      method: 'POST',
      body: JSON.stringify({ summary: AJANDA_CAL_NAME, description: 'Ajanda uygulamasının hatırlatma, arama ve kampanyaları', timeZone: TZ })
    });
    id = created.id;
    // Takvimi turuncu renkte ve bildirimleri açık olarak listeye ekle
    try {
      await gfetch('/users/me/calendarList/' + encodeURIComponent(id) + '?colorRgbFormat=false', {
        method: 'PATCH',
        body: JSON.stringify({ colorId: '6', defaultReminders: [{ method: 'popup', minutes: 0 }] })
      });
    } catch { /* önemli değil */ }
    calListCache = null;
  }
  try { localStorage.setItem(CAL_KEY, id); } catch { /* yok say */ }
  return id;
}

// Seçili (görünür) takvimlerdeki etkinlikler — Ajanda takvimi hariç
export async function listEvents(from, to) {
  const items = await calendarList();
  const ajandaId = await ajandaCalendarId();
  const cals = items.filter((c) => c.selected && c.id !== ajandaId && !c.hidden);
  const results = await Promise.all(cals.map(async (c) => {
    const q = new URLSearchParams({
      timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250'
    });
    try {
      const j = await gfetch('/calendars/' + encodeURIComponent(c.id) + '/events?' + q.toString());
      return (j.items || []).filter((e) => e.status !== 'cancelled').map((e) => {
        const allDay = !!(e.start && e.start.date);
        const start = allDay ? new Date(e.start.date + 'T00:00:00') : new Date(e.start.dateTime);
        const end = allDay ? addDays(new Date(e.end.date + 'T00:00:00'), -1) : new Date(e.end.dateTime);
        return { id: e.id, title: e.summary || '(Başlıksız)', start, end, allDay, calendar: c.summary, color: c.backgroundColor || '#1971C2', link: e.htmlLink };
      });
    } catch {
      return [];
    }
  }));
  return results.flat().sort((a, b) => a.start - b.start);
}

async function upsertEvent(existingId, body) {
  const cal = encodeURIComponent(await ajandaCalendarId());
  if (existingId) {
    try {
      const j = await gfetch('/calendars/' + cal + '/events/' + encodeURIComponent(existingId), { method: 'PUT', body: JSON.stringify(body) });
      return j.id;
    } catch (e) {
      if (e.status !== 404 && e.status !== 410) throw e;
    }
  }
  const j = await gfetch('/calendars/' + cal + '/events', { method: 'POST', body: JSON.stringify(body) });
  return j.id;
}

export async function deleteEvent(id) {
  if (!id) return;
  const cal = encodeURIComponent(await ajandaCalendarId());
  try {
    await gfetch('/calendars/' + cal + '/events/' + encodeURIComponent(id), { method: 'DELETE' });
  } catch (e) {
    if (e.status !== 404 && e.status !== 410) throw e;
  }
}

export function timedEvent({ summary, description, start, minutes = 15, location, recurrence }) {
  const end = new Date(start.getTime() + minutes * 60000);
  return {
    summary,
    description: description || '',
    ...(location ? { location } : {}),
    ...(recurrence ? { recurrence: [recurrence] } : {}),
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }
  };
}

export function allDayEvent({ summary, description, startDate, endDate, location }) {
  return {
    summary,
    description: description || '',
    ...(location ? { location } : {}),
    start: { date: toDateInput(startDate) },
    end: { date: toDateInput(addDays(endDate, 1)) },
    transparency: 'transparent',
    reminders: { useDefault: false, overrides: [] }
  };
}

export async function saveTimed(existingId, opts) {
  return upsertEvent(existingId, timedEvent(opts));
}

export async function saveAllDay(existingId, opts) {
  return upsertEvent(existingId, allDayEvent(opts));
}
