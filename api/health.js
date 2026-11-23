// Google Health (Fitbit Air vb.): adım ve uyku verisi. Yalnızca OKUR.
// Bağlantı ayrı bir Google izniyle kurulur; Google Takvim girişine dokunmaz.
//   GET  /api/health?action=url        (Bearer: Supabase oturumu) → Google izin sayfasının adresi
//   GET  /api/health?code=..&state=..  Google'ın geri dönüşü → anahtar kaydedilir, uygulamaya yönlenir
//   GET  /api/health                   (Bearer) → son 7 günün adımları ve uykuları
//   POST /api/health?action=disconnect (Bearer) → bağlantıyı kaldırır
// Ortam: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Takvim'le aynı), SUPABASE_SECRET_KEY
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const API = 'https://health.googleapis.com/v4/users/me/dataTypes';
export const HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
];
const DAY = 86400000;

const ymd = (d) => d.toISOString().slice(0, 10);
const civil = (s) => { const [y, m, d] = s.split('-').map(Number); return { date: { year: y, month: m, day: d }, time: { hours: 0, minutes: 0, seconds: 0 } }; };
const civilKey = (c) => (c && c.date ? c.date.year + '-' + String(c.date.month).padStart(2, '0') + '-' + String(c.date.day).padStart(2, '0') : null);
// Türkiye saatine göre bugünün tarihi
const trToday = (now = Date.now()) => ymd(new Date(now + 3 * 3600000));

function redirectUri(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return proto + '://' + host + '/api/health';
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET).update(body).digest('base64url');
  return body + '.' + mac;
}
function verify(state) {
  const [body, mac] = String(state || '').split('.');
  if (!body || !mac) return null;
  const good = crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET).update(body).digest('base64url');
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return Date.now() - p.t < 15 * 60000 ? p : null;
}
function db() {
  const url = process.env.VITE_SUPABASE_URL || 'https://ppjswmsskurwwumojjkh.supabase.co';
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}
async function userFrom(req, sb) {
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  return error || !data ? null : data.user;
}

// Adımlar: günlük toplamlar
export function parseSteps(j) {
  const out = {};
  (j.rollupDataPoints || []).forEach((p) => {
    const k = civilKey(p.civilStartTime);
    if (k && p.steps && p.steps.countSum != null) out[k] = Number(p.steps.countSum) || 0;
  });
  return out;
}
// Uyku: her gecenin ana uykusu (uyanılan güne göre)
export function parseSleep(j) {
  const nights = {};
  (j.dataPoints || []).forEach((p) => {
    const s = p.sleep;
    if (!s || !s.interval) return;
    const sum = s.summary || {};
    const off = parseInt(s.interval.endUtcOffset || '0', 10) || 0;
    const day = ymd(new Date(new Date(s.interval.endTime).getTime() + off * 1000));
    const stages = {};
    (sum.stagesSummary || []).forEach((x) => { stages[String(x.type || '').toLowerCase()] = Number(x.minutes) || 0; });
    const rec = {
      day, start: s.interval.startTime, end: s.interval.endTime,
      asleep: Number(sum.minutesAsleep) || 0, inBed: Number(sum.minutesInSleepPeriod) || 0, awake: Number(sum.minutesAwake) || 0,
      stages, main: !!(s.metadata && s.metadata.mainSleep)
    };
    const prev = nights[day];
    // Aynı güne ait birden çok kayıt: ana uyku, yoksa en uzunu; şekerlemeler ayrıca toplanır
    if (!prev) nights[day] = { ...rec, naps: 0 };
    else if ((rec.main && !prev.main) || (rec.main === prev.main && rec.asleep > prev.asleep)) nights[day] = { ...rec, naps: prev.naps + prev.asleep };
    else prev.naps += rec.asleep;
  });
  return nights;
}

async function accessToken(refresh) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.error || 'token'); e.code = j.error; throw e; }
  return j.access_token;
}
async function gh(token, path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || 'HTTP ' + r.status); e.status = r.status; throw e; }
  return j;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) { res.status(500).json({ error: 'Vercel\'de GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanımlı değil.' }); return; }
  const sb = db();
  if (!sb) { res.status(500).json({ error: 'Vercel\'de SUPABASE_SECRET_KEY tanımlı değil.' }); return; }
  const q = req.query || {};

  // 2) Google'dan dönüş
  if (q.code || q.error) {
    const back = (s) => { res.statusCode = 302; res.setHeader('Location', '/?health=' + encodeURIComponent(s)); res.end(); };
    if (q.error) { back(q.error === 'access_denied' ? 'iptal' : 'hata'); return; }
    const st = verify(q.state);
    if (!st) { back('suresi-doldu'); return; }
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: q.code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(req), grant_type: 'authorization_code' })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.refresh_token) { back(j.refresh_token ? 'hata' : 'anahtar-yok'); return; }
    const granted = String(j.scope || '');
    const { error } = await sb.from('health_tokens').upsert({ user_id: st.u, refresh_token: j.refresh_token, scopes: granted, updated_at: new Date().toISOString() });
    back(error ? 'kayit-hatasi' : 'ok');
    return;
  }

  const user = await userFrom(req, sb).catch(() => null);
  if (!user) { res.status(401).json({ error: 'Oturum gerekli.' }); return; }

  // 1) Bağlanma adresi
  if (q.action === 'url') {
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(req), response_type: 'code',
      scope: HEALTH_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false',
      login_hint: user.email || '', state: sign({ u: user.id, t: Date.now() })
    });
    res.status(200).json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString() });
    return;
  }
  if (q.action === 'disconnect') {
    await sb.from('health_tokens').delete().eq('user_id', user.id);
    res.status(200).json({ ok: true });
    return;
  }

  // 3) Veri
  const { data: row, error: rerr } = await sb.from('health_tokens').select('refresh_token').eq('user_id', user.id).maybeSingle();
  if (rerr) { res.status(200).json({ connected: false, error: /health_tokens/.test(rerr.message) ? 'Supabase\'de 25 numaralı SQL çalıştırılmamış.' : rerr.message }); return; }
  if (!row) { res.status(200).json({ connected: false }); return; }
  let token;
  try { token = await accessToken(row.refresh_token); }
  catch (e) {
    if (e.code === 'invalid_grant') { res.status(200).json({ connected: true, expired: true, error: 'Google Health izninin süresi doldu, yeniden bağlan.' }); return; }
    res.status(502).json({ connected: true, error: 'Google anahtarı yenilenemedi: ' + e.message }); return;
  }
  const days = Math.min(30, Math.max(1, Number(q.days) || 7));
  const T = trToday();
  const from = ymd(new Date(Date.parse(T) - (days - 1) * DAY));
  const end = ymd(new Date(Date.parse(T) + DAY));
  const out = { connected: true, at: new Date().toISOString(), today: T, from, steps: {}, sleep: {}, errors: {} };
  const [st, sl] = await Promise.allSettled([
    gh(token, '/steps/dataPoints:dailyRollUp', { method: 'POST', body: JSON.stringify({ range: { start: civil(from), end: civil(end) }, windowSizeDays: 1 }) }),
    gh(token, '/sleep/dataPoints:reconcile?' + new URLSearchParams({ filter: 'sleep.interval.civil_end_time >= "' + from + '" AND sleep.interval.civil_end_time < "' + end + '"', pageSize: '25' }))
  ]);
  if (st.status === 'fulfilled') out.steps = parseSteps(st.value); else out.errors.steps = String(st.reason && st.reason.message).slice(0, 200);
  if (sl.status === 'fulfilled') out.sleep = parseSleep(sl.value); else out.errors.sleep = String(sl.reason && sl.reason.message).slice(0, 200);
  res.status(200).json(out);
}
