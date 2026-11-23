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
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly'
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

// Günlük toplam değerler: alan adları türe göre değişir (countSum, ...Sum); sayıları güvenle çek
const numLeaves = (o, pre = '') => {
  const out = [];
  Object.entries(o || {}).forEach(([k, v]) => {
    if (v && typeof v === 'object') out.push(...numLeaves(v, pre + k + '.'));
    else if (v !== '' && v != null && Number.isFinite(Number(v))) out.push([pre + k, Number(v)]);
  });
  return out;
};
export function rollValue(type, v) {
  const xs = numLeaves(v);
  if (!xs.length) return null;
  const find = (re) => xs.find(([k]) => re.test(k));
  if (type === 'weight') {
    const x = find(/avg|mean/i) || find(/last|latest/i) || xs[0];
    return x[1] > 500 ? x[1] / 1000 : x[1]; // gram → kg
  }
  if (type === 'distance') { const x = find(/sum/i) || xs[0]; return /milli/i.test(x[0]) ? x[1] / 1e6 : /meter/i.test(x[0]) ? x[1] / 1000 : x[1]; }
  const tot = find(/(total|all).*sum|sum.*(total|all)/i);
  if (tot) return tot[1];
  const sums = xs.filter(([k]) => /sum/i.test(k));
  if (sums.length) return sums.reduce((a, [, n]) => a + n, 0);
  return xs[0][1];
}
const ROLL_KEY = { steps: 'steps', distance: 'distance', 'active-zone-minutes': 'activeZoneMinutes', 'total-calories': 'totalCalories', weight: 'weight' };
export function parseRollup(type, j, out, keys) {
  (j.rollupDataPoints || []).forEach((p) => {
    const k = civilKey(p.civilStartTime);
    const v = p[ROLL_KEY[type]];
    if (keys && v && !keys[type]) keys[type] = Object.keys(v).join(',');
    if (!k || !v) return;
    const n = rollValue(type, v);
    if (n != null) out[k] = n;
  });
  return out;
}
const secs = (d) => (d ? parseFloat(String(d)) || 0 : 0);
export function parseExercise(j) {
  return (j.dataPoints || []).map((p) => {
    const e = p.exercise;
    if (!e || !e.interval) return null;
    const m = e.metricsSummary || {};
    const s = new Date(e.interval.startTime), en = new Date(e.interval.endTime);
    const off = parseInt(e.interval.startUtcOffset || '10800', 10) || 0;
    return {
      day: ymd(new Date(s.getTime() + off * 1000)), start: e.interval.startTime, end: e.interval.endTime,
      type: e.exerciseType || 'OTHER', name: e.displayName || '',
      min: Math.round((secs(e.activeDuration) || (en - s) / 1000) / 60),
      kcal: m.caloriesKcal != null ? Math.round(Number(m.caloriesKcal)) : null,
      km: m.distanceMillimeters != null ? Number(m.distanceMillimeters) / 1e6 : null,
      hr: m.averageHeartRateBeatsPerMinute != null ? Number(m.averageHeartRateBeatsPerMinute) : null,
      azm: m.activeZoneMinutes != null ? Number(m.activeZoneMinutes) : null,
      steps: m.steps != null ? Number(m.steps) : null,
      laps: m.totalSwimLengths != null ? Number(m.totalSwimLengths) : null,
      pace: m.averagePaceSecondsPerMeter != null ? Number(m.averagePaceSecondsPerMeter) : null
    };
  }).filter(Boolean).sort((a, b) => a.start.localeCompare(b.start));
}
export function parseRhr(j, from) {
  const out = {};
  (j.dataPoints || []).forEach((p) => {
    const r = p.dailyRestingHeartRate;
    if (!r || !r.date) return;
    const k = r.date.year + '-' + String(r.date.month).padStart(2, '0') + '-' + String(r.date.day).padStart(2, '0');
    if (k >= from) out[k] = Number(r.beatsPerMinute) || null;
  });
  return out;
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

  // 4) Yapay zekâ koç: haftalık özet sayılardan yorum (Claude API). Haftada bir kez saklanır, istenirse 6 saatte bir yenilenir.
  if (q.action === 'coach') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const week = String((body && body.week) || '').slice(0, 10);
    const payload = body && body.payload;
    const raw = JSON.stringify(payload || {});
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || raw.length > 20000) { res.status(400).json({ error: 'Geçersiz istek.' }); return; }
    const { data: st } = await sb.from('app_settings').select('health_coach').eq('user_id', user.id).maybeSingle();
    const prev = st && st.health_coach;
    if (prev && prev.week === week && (!body.force || Date.now() - Date.parse(prev.at) < 6 * 3600000)) { res.status(200).json(prev); return; }
    if (!process.env.ANTHROPIC_API_KEY) { res.status(200).json({ error: 'Koç için Vercel\'de ANTHROPIC_API_KEY tanımlı değil.' }); return; }
    const system = [
      'Sen deneyimli bir antrenör ve spor beslenmesi konusunda bilgili bir koçsun. Kullanıcı Türkiye\'de yaşıyor ve spora yeni başladı.',
      'Sana Fitbit verisinden çıkarılmış haftalık özet sayılar ve hedefleri JSON olarak verilecek. Bunlara dayanarak kişiye özel, uygulanabilir öneriler yaz.',
      'Kurallar: Türkçe, samimi ve kısa yaz. Veride olmayan bir şeyi varsayma; veri eksikse bunu belirt. Teşhis koyma, ilaç ya da takviye dozu önerme.',
      'Göğüs ağrısı, baş dönmesi gibi belirtiler ya da nabızda belirgin anormallik varsa "uyari" alanında doktora danışmasını öner.',
      'Aşırı kalori kısıtlaması önerme; kilo hedefi varsa haftada en fazla 0,5–1 kg değişimi hedefle. Beslenmede gram/kalori hesabı yerine porsiyon ve Türk mutfağından örnek yemekler ver.',
      'Ana spor yüzmeyse antrenman planında ısınma, ana set (ör. 6×100 m) ve soğuma gibi somut içerik ver; seanslar arasına dinlenme günü koy, yükü kademeli artır.',
      'Yanıtın SADECE şu JSON olsun, başka metin ekleme: {"ozet":"2-3 cümle","iyi":["en fazla 3 madde"],"gelistir":["en fazla 3 madde"],"plan":[{"gun":"Pazartesi","oneri":"..."} — önümüzdeki 7 gün, bugünden başlayarak],"beslenme":["en fazla 4 madde"],"uyari":"gerekmiyorsa boş"}'
    ].join('\n');
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: process.env.COACH_MODEL || 'claude-sonnet-5-5', max_tokens: 1800, system, messages: [{ role: 'user', content: 'Verilerim:\n' + raw }] })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { res.status(502).json({ error: 'Koç yanıt vermedi: ' + ((j.error && j.error.message) || r.status) }); return; }
      const text = (j.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
      let data;
      try { data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { data = text.trim(); }
      const out = { week, at: new Date().toISOString(), model: j.model || '', data };
      await sb.from('app_settings').upsert({ user_id: user.id, health_coach: out, updated_at: new Date().toISOString() });
      res.status(200).json(out);
    } catch (e) {
      res.status(502).json({ error: 'Koça ulaşılamadı: ' + String(e && e.message).slice(0, 120) });
    }
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
  const days = Math.min(42, Math.max(1, Number(q.days) || 28));
  const T = trToday();
  const from = ymd(new Date(Date.parse(T) - (days - 1) * DAY));
  const end = ymd(new Date(Date.parse(T) + DAY));
  const out = { connected: true, at: new Date().toISOString(), today: T, from, steps: {}, sleep: {}, distance: {}, azm: {}, kcal: {}, weight: {}, rhr: {}, exercise: [], errors: {}, keys: {} };
  // Günlük toplamlar 14 günlük parçalarla (bazı türlerde üst sınır 14 gün)
  const chunks = [];
  for (let s0 = Date.parse(from); s0 < Date.parse(end); s0 += 14 * DAY) chunks.push([ymd(new Date(s0)), ymd(new Date(Math.min(s0 + 14 * DAY, Date.parse(end))))]);
  const rollup = async (type) => {
    const acc = {};
    for (const [a, b] of chunks) {
      const j = await gh(token, '/' + type + '/dataPoints:dailyRollUp', { method: 'POST', body: JSON.stringify({ range: { start: civil(a), end: civil(b) }, windowSizeDays: 1, pageSize: 14 }) });
      parseRollup(type, j, acc, out.keys);
    }
    return acc;
  };
  const sleepAll = async () => {
    const all = { dataPoints: [] };
    let token2 = '';
    for (let i = 0; i < 4; i++) {
      const p = new URLSearchParams({ filter: 'sleep.interval.civil_end_time >= "' + from + '" AND sleep.interval.civil_end_time < "' + end + '"', pageSize: '25' });
      if (token2) p.set('pageToken', token2);
      const j = await gh(token, '/sleep/dataPoints:reconcile?' + p);
      all.dataPoints.push(...(j.dataPoints || []));
      token2 = j.nextPageToken;
      if (!token2) break;
    }
    return parseSleep(all);
  };
  const exercises = async () => {
    try { return parseExercise(await gh(token, '/exercise/dataPoints?' + new URLSearchParams({ filter: 'exercise.interval.civil_start_time >= "' + from + '"', pageSize: '50' }))); }
    catch (e) { return parseExercise(await gh(token, '/exercise/dataPoints?pageSize=50')).filter((x) => x.day >= from); }
  };
  const jobs = {
    steps: () => rollup('steps'), distance: () => rollup('distance'), azm: () => rollup('active-zone-minutes'), kcal: () => rollup('total-calories'),
    weight: () => rollup('weight'), sleep: sleepAll, exercise: exercises,
    rhr: async () => parseRhr(await gh(token, '/daily-resting-heart-rate/dataPoints?pageSize=60'), from)
  };
  const names = Object.keys(jobs);
  const res2 = await Promise.allSettled(names.map((k) => jobs[k]()));
  res2.forEach((r, i) => {
    if (r.status === 'fulfilled') out[names[i]] = r.value;
    else out.errors[names[i]] = (r.reason && r.reason.status ? r.reason.status + ' ' : '') + String(r.reason && r.reason.message).slice(0, 160);
  });
  res.status(200).json(out);
}
