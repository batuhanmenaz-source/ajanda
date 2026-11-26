// Ajanda'nın kendi bildirimleri (Web Push).
//   GET  ?action=key   → sunucudaki genel (public) VAPID anahtarı; tarayıcı bununla abone olur
//   POST ?action=test  → giriş yapmış kullanıcının cihazlarına deneme bildirimi
//   ?action=tick&key=… → zamanlayıcı (cron-job.org) her dakika çağırır; zamanı gelen bildirimleri yollar
//   POST ?action=act   → bildirimdeki "Yapıldı" / "Yarına ertele" düğmeleri (cihaz anahtarıyla doğrulanır)
// Gizli VAPID anahtarı yalnız Vercel ortam değişkeninde durur (VAPID_PRIVATE_KEY).
process.env.TZ = 'Europe/Istanbul'; // tarih hesapları Türkiye saatiyle

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { toOverrides, normAlerts } from '../src/alerts.js';
import { nextOccurrence } from '../src/recur.js';
import { notifyOf } from '../src/notifyprefs.js';

const URL_ = () => process.env.VITE_SUPABASE_URL || 'https://ppjswmsskurwwumojjkh.supabase.co';
const db = () => {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(URL_(), key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
};
const vapid = () => {
  const pub = (process.env.VAPID_PUBLIC_KEY || '').trim(), priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!pub || !priv) return null;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ajanda@example.com', pub, priv);
  return pub;
};
async function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}

// ---- Zaman yardımcıları (TZ = İstanbul)
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const hm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const atOn = (day, at) => { const x = sod(day); const [h, m] = String(at || '09:00').split(':').map(Number); x.setHours(h || 0, m || 0, 0, 0); return x; };
const tl = (n) => '₺' + Math.round(Number(n) || 0).toLocaleString('tr-TR');
const tlShort = (n) => { const v = Number(n) || 0; if (v >= 1e6) return '₺' + (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' mn'; if (v >= 1e3) return '₺' + (v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' bin'; return tl(v); };
const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dm = (k) => { const [, m, d] = k.split('-').map(Number); return d + ' ' + MON[m - 1]; };

// Bir kaydın bildirim anları (hatırlatma ayarlarına göre; Google Takvim'deki ile aynı hesap)
export function fireTimes(x, dueIso) {
  const due = new Date(dueIso);
  const overs = x.alerts ? toOverrides(x.alerts, { start: due, allDay: false }).overrides : [0];
  const out = overs.map((m) => new Date(due.getTime() - m * 60000));
  // "Yapılana kadar her gün": ilk günden sonra 13 gün boyunca aynı saatte
  if (x.alerts && normAlerts(x.alerts).nag) for (let k = 1; k < 14; k++) out.push(new Date(due.getTime() + k * 86400000));
  return out;
}

// ---- Gönderim
async function sendTo(sb, subs, payload) {
  let ok = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...payload, data: { ...(payload.data || {}), ...(payload.data && payload.data.act ? { act: { ...payload.data.act, t: s.token } } : {}) } }),
        { TTL: 6 * 3600, urgency: 'high' });
      ok++;
      await sb.from('push_subs').update({ last_ok: new Date().toISOString() }).eq('id', s.id);
    } catch (e) {
      // Abonelik düşmüş (uygulama kaldırıldı / izin kapatıldı) → sil
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from('push_subs').delete().eq('id', s.id);
      else console.warn('push', e && e.statusCode, e && e.body);
    }
  }));
  return ok;
}
// Aynı anahtarla daha önce gönderildiyse atla (ilk yazan kazanır)
async function claim(sb, uid, keys) {
  if (!keys.length) return new Set();
  const { data, error } = await sb.from('push_log').upsert(keys.map((key) => ({ user_id: uid, key })), { onConflict: 'user_id,key', ignoreDuplicates: true }).select('key');
  if (error) { console.warn('push_log', error.message); return new Set(); }
  return new Set((data || []).map((r) => r.key));
}

// ---- Kullanıcı başına: zamanı gelen bildirimleri hazırla
export async function buildForUser(sb, uid, now, n) {
  const out = []; // { key, payload }
  const today = sod(now), todayK = ymd(today);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  const dayEnd = new Date(today); dayEnd.setDate(dayEnd.getDate() + 1);
  const WIN = 10 * 60000; // kaçan dakikalar telafi
  const inWin = (t) => t <= now && now - t < WIN;
  const dailyWin = (at) => { const t = atOn(today, at); return now >= t && now - t < 3 * 3600000; };

  if (n.items) {
    const from = new Date(now.getTime() - 15 * 86400000).toISOString(), to = new Date(now.getTime() + 8 * 86400000).toISOString();
    const [rem, calls, notes] = await Promise.all([
      sb.from('reminders').select('id, title, due_at, alerts, marketplace, repeat_rule').eq('user_id', uid).eq('done', false).gte('due_at', from).lte('due_at', to),
      sb.from('calls').select('id, who, topic, phone, due_at, alerts').eq('user_id', uid).eq('done', false).gte('due_at', from).lte('due_at', to),
      sb.from('notes').select('id, title, body, remind_at, alerts, marketplace').eq('user_id', uid).not('remind_at', 'is', null).gte('remind_at', from).lte('remind_at', to)
    ]);
    const when = (iso) => { const d = new Date(iso); return (ymd(d) === todayK ? '' : ymd(d) === ymd(yest) ? 'Dün ' : dm(ymd(d)) + ' ') + hm(d); };
    (rem.data || []).forEach((r) => fireTimes(r, r.due_at).filter(inWin).forEach((t) => {
      const late = now - new Date(r.due_at) > 30 * 60000;
      out.push({ key: 'r:' + r.id + ':' + t.getTime(), payload: {
        title: (late ? '⏰ Gecikti: ' : '🔔 ') + r.title, body: [when(r.due_at), r.marketplace].filter(Boolean).join(' · ') + (new Date(r.due_at) > now ? ' · ' + Math.round((new Date(r.due_at) - now) / 60000) + ' dk sonra' : ''),
        tag: 'r:' + r.id, data: { url: '/?ac=r:' + r.id, act: { k: 'r', id: r.id } }, actions: [{ action: 'done', title: '✓ Yapıldı' }, { action: 'later', title: 'Yarına ertele' }] } });
    }));
    (calls.data || []).forEach((c) => fireTimes(c, c.due_at).filter(inWin).forEach((t) => {
      out.push({ key: 'c:' + c.id + ':' + t.getTime(), payload: {
        title: '📞 ' + c.who + ' aranacak', body: [when(c.due_at), c.topic, c.phone].filter(Boolean).join(' · '),
        tag: 'c:' + c.id, data: { url: '/?ac=c:' + c.id, act: { k: 'c', id: c.id } }, actions: [{ action: 'done', title: '✓ Arandı' }, { action: 'later', title: 'Yarına ertele' }] } });
    }));
    (notes.data || []).forEach((x) => fireTimes(x, x.remind_at).filter(inWin).forEach((t) => {
      out.push({ key: 'n:' + x.id + ':' + t.getTime(), payload: {
        title: '📝 ' + (x.title || 'Not'), body: clip(String(x.body || '').replace(/\s+/g, ' '), 140) || when(x.remind_at), tag: 'n:' + x.id, data: { url: '/?ac=n:' + x.id } } });
    }));
  }

  // Sabah özeti
  if (n.morning.on && dailyWin(n.morning.at)) {
    const [rem, calls, camps, rev, promos] = await Promise.all([
      sb.from('reminders').select('title, due_at').eq('user_id', uid).eq('done', false).not('due_at', 'is', null).lt('due_at', dayEnd.toISOString()),
      sb.from('calls').select('who, due_at').eq('user_id', uid).eq('done', false).not('due_at', 'is', null).lt('due_at', dayEnd.toISOString()),
      sb.from('campaigns').select('name, marketplace, start_date, end_date, kind').eq('user_id', uid).lte('start_date', todayK).gte('end_date', todayK),
      sb.from('revenue').select('day, amount').eq('user_id', uid).in('day', [ymd(yest), ymd(new Date(yest.getTime() - 7 * 86400000))]),
      sb.from('promos').select('id, end_at').eq('user_id', uid).gte('end_at', now.toISOString()).lt('end_at', dayEnd.toISOString())
    ]);
    const items = [...(rem.data || []).map((r) => ({ t: r.due_at, s: r.title })), ...(calls.data || []).map((c) => ({ t: c.due_at, s: c.who + ' (ara)' }))];
    const late = items.filter((x) => new Date(x.t) < today).length;
    const tod = items.filter((x) => new Date(x.t) >= today).sort((a, b) => a.t.localeCompare(b.t));
    const lines = [];
    lines.push(tod.length ? '📋 Bugün ' + tod.length + ' iş' + (late ? ' · ' + late + ' geciken' : '') + ' · ilki ' + hm(new Date(tod[0].t)) + ' ' + clip(tod[0].s, 40) : late ? '📋 Bugün yeni iş yok · ' + late + ' geciken' : '📋 Bugün için iş yok');
    const sum = (k) => (rev.data || []).filter((r) => r.day === k).reduce((a, r) => a + Number(r.amount), 0);
    const ys = sum(ymd(yest)), ws = sum(ymd(new Date(yest.getTime() - 7 * 86400000)));
    lines.push(ys ? '💰 Dün ' + tlShort(ys) + (ws ? (ys >= ws ? ' ▲%' : ' ▼%') + Math.abs(Math.round((ys / ws - 1) * 100)) + ' geçen haftaya göre' : '') : '💰 Dünün cirosu girilmedi');
    const cs = (camps.data || []).filter((c) => c.kind !== 'etkinlik');
    if (cs.length) {
      const st = cs.filter((c) => c.start_date === todayK), en = cs.filter((c) => c.end_date === todayK);
      lines.push('📣 ' + cs.length + ' kampanya sürüyor' + (st.length ? ' · bugün başlayan: ' + st.map((c) => c.name).join(', ') : '') + (en.length ? ' · bugün biten: ' + en.map((c) => c.name).join(', ') : ''));
    }
    if (!promos.error && (promos.data || []).length) lines.push('🎯 ' + promos.data.length + ' indirim kurgusu bugün bitiyor');
    out.push({ key: 'm:' + todayK, payload: { title: '☀️ Günaydın · ' + dm(todayK), body: lines.join('\n'), tag: 'morning', data: { url: '/?git=bugun' } } });
  }

  // Satış / stok uyarıları (rapor yüklenince; sabah saatinden önce gönderilmez)
  if (n.sales && now >= atOn(today, n.morning.at) && now.getHours() < 22) {
    const { data: st } = await sb.from('app_settings').select('sales_prefs').eq('user_id', uid).maybeSingle();
    const dg = st && st.sales_prefs && st.sales_prefs.digest;
    if (dg && dg.day && (dg.alerts || []).length && (today - new Date(dg.day + 'T00:00:00')) <= 3 * 86400000) {
      const W = { stock: '📦', stop: '⛔', drop: '📉' };
      const al = dg.alerts.slice(0, 4).map((a) => (W[a.t] || '⚠️') + ' ' + clip(a.n || '', 38) + (a.x ? ' · ' + a.x : ''));
      out.push({ key: 's:' + dg.day, payload: { title: '⚠️ Hero ürün uyarıları · ' + dm(dg.day), body: al.join('\n') + (dg.alerts.length > 4 ? '\n+' + (dg.alerts.length - 4) + ' uyarı daha' : ''), tag: 'sales', data: { url: '/?git=satislar' } } });
    }
  }

  // İndirim kurguları
  if (n.promo.on) {
    const { data: pr, error } = await sb.from('promos').select('id, name, type, cond, disc_type, disc_value, threshold, pay_qty, code, marketplace, start_at, end_at, order_limit, uses').eq('user_id', uid).gte('end_at', now.toISOString()).lte('start_at', now.toISOString());
    if (!error) {
      const name = (p) => p.name || (p.cond === 'xurun' ? (p.threshold || 2) + '. ürüne ' + (p.disc_type === 'tl' ? tl(p.disc_value) : '%' + p.disc_value) : p.disc_type === 'xaly' ? p.threshold + ' Al ' + p.pay_qty + ' Öde' : p.code || 'İndirim kurgusu');
      const ending = (pr || []).filter((p) => new Date(p.end_at) < dayEnd);
      if (ending.length && dailyWin(n.promo.at)) out.push({ key: 'pe:' + todayK, payload: { title: '🎯 ' + (ending.length === 1 ? name(ending[0]) + ' bugün bitiyor' : ending.length + ' indirim kurgusu bugün bitiyor'), body: ending.map((p) => name(p) + (p.marketplace ? ' · ' + p.marketplace : '') + ' · ' + hm(new Date(p.end_at))).join('\n') + '\nKullanım adedini girmeyi unutma.', tag: 'promo-end', data: { url: '/?git=kurgu' } } });
      if (now.getHours() >= 9 && now.getHours() < 21) (pr || []).forEach((p) => {
        const u = Array.isArray(p.uses) && p.uses.length ? Number(p.uses[p.uses.length - 1].n) || 0 : 0;
        if (p.order_limit && u / p.order_limit >= 0.9) out.push({ key: 'pl:' + p.id, payload: { title: '🎯 Kurgu limiti doluyor: ' + name(p), body: u + ' / ' + p.order_limit + ' kullanım' + (p.marketplace ? ' · ' + p.marketplace : ''), tag: 'promo-' + p.id, data: { url: '/?git=kurgu' } } });
      });
    }
  }

  // Dünkü ciro girilmedi
  if (n.revenue.on && dailyWin(n.revenue.at) && (n.revenue.weekend || ![0, 1].includes(today.getDay()))) {
    const { data: rv, error } = await sb.from('revenue').select('id').eq('user_id', uid).eq('day', ymd(yest)).limit(1);
    if (!error && !(rv || []).length) out.push({ key: 'rv:' + ymd(yest), payload: { title: '💰 Dünün cirosu girilmedi', body: dm(ymd(yest)) + ' cirosunu girmek için dokun.', tag: 'revenue', data: { url: '/?yeni=ciro' } } });
  }
  return out;
}

// ---- Google Takvim (düğmeyle tamamlanan / ertelenen kaydın etkinliği)
async function googleFor(sb, uid) {
  const { data } = await sb.from('google_tokens').select('refresh_token').eq('user_id', uid).maybeSingle();
  if (!data || !data.refresh_token || !process.env.GOOGLE_CLIENT_ID) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: data.refresh_token, grant_type: 'refresh_token' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return null;
  const g = (path, opts = {}) => fetch('https://www.googleapis.com/calendar/v3' + path, { ...opts, headers: { Authorization: 'Bearer ' + j.access_token, 'Content-Type': 'application/json' } });
  const cl = await (await g('/users/me/calendarList?maxResults=250')).json().catch(() => ({}));
  const cal = ((cl.items || []).find((c) => c.summary === 'Ajanda') || {}).id;
  return cal ? { g, cal: encodeURIComponent(cal) } : null;
}
async function act(sb, b) {
  const { t, k, id, op } = b || {};
  if (!t || !id || !['r', 'c'].includes(k) || !['done', 'later'].includes(op)) return { status: 400, j: { error: 'bad_request' } };
  const { data: sub } = await sb.from('push_subs').select('user_id').eq('token', t).maybeSingle();
  if (!sub) return { status: 401, j: { error: 'unknown_device' } };
  const table = k === 'r' ? 'reminders' : 'calls';
  const { data: it } = await sb.from(table).select('*').eq('id', id).eq('user_id', sub.user_id).maybeSingle();
  if (!it) return { status: 404, j: { error: 'not_found' } };
  const label = k === 'r' ? it.title : it.who;
  let patch, gop = null;
  if (op === 'done') {
    if (k === 'r' && it.repeat_rule && it.due_at) {
      const due = new Date(it.due_at);
      const next = nextOccurrence(due, it.repeat_rule, due > new Date() ? due : new Date());
      patch = next ? { due_at: next.toISOString() } : { done: true };
      gop = next ? null : 'delete'; // tekrarlayan seri Google'da sürer
    } else { patch = { done: true }; gop = 'delete'; }
  } else {
    const base = it.due_at ? new Date(it.due_at) : atOn(new Date(), '10:00');
    const t2 = sod(new Date()); t2.setDate(t2.getDate() + 1); t2.setHours(base.getHours(), base.getMinutes(), 0, 0);
    patch = { due_at: t2.toISOString() }; gop = 'move';
  }
  const { error } = await sb.from(table).update(patch).eq('id', id).eq('user_id', sub.user_id);
  if (error) return { status: 500, j: { error: error.message } };
  if (gop && it.google_event_id) {
    try {
      const G = await googleFor(sb, sub.user_id);
      if (G) {
        const path = '/calendars/' + G.cal + '/events/' + encodeURIComponent(it.google_event_id);
        if (gop === 'delete') { await G.g(path, { method: 'DELETE' }); await sb.from(table).update({ google_event_id: null }).eq('id', id); }
        else {
          const ev = await (await G.g(path)).json().catch(() => null);
          if (ev && ev.start && ev.start.dateTime) {
            const dur = new Date(ev.end.dateTime) - new Date(ev.start.dateTime);
            const s = new Date(patch.due_at);
            await G.g(path, { method: 'PATCH', body: JSON.stringify({ start: { dateTime: s.toISOString(), timeZone: 'Europe/Istanbul' }, end: { dateTime: new Date(s.getTime() + (dur > 0 ? dur : 900000)).toISOString(), timeZone: 'Europe/Istanbul' } }) });
          }
        }
      }
    } catch (e) { console.warn('google', e && e.message); }
  }
  return { status: 200, j: { ok: true, title: op === 'done' ? (k === 'r' ? '✓ Tamamlandı' : '✓ Arandı') : '↷ Yarına ertelendi', body: label } };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String((req.query || {}).action || '');
  if (action === 'key') { res.status(200).json({ key: (process.env.VAPID_PUBLIC_KEY || '').trim() || null }); return; }
  const sb = db();
  if (!sb) { res.status(500).json({ error: 'missing_server_config', message: 'SUPABASE_SECRET_KEY Vercel ayarlarında yok.' }); return; }

  if (action === 'act') { const r = await act(sb, await body(req)); res.status(r.status).json(r.j); return; }

  const hasVapid = !!vapid();
  // Zamanlayıcı anahtarlar girilmeden de "başarılı" görsün (cron-job.org art arda hatada görevi kapatıyor)
  if (!hasVapid && action !== 'tick') { res.status(500).json({ error: 'missing_vapid', message: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY Vercel ayarlarında yok.' }); return; }

  if (action === 'test') {
    const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const { data: u } = jwt ? await sb.auth.getUser(jwt) : { data: null };
    if (!u || !u.user) { res.status(401).json({ error: 'unauthorized' }); return; }
    const { data: subs } = await sb.from('push_subs').select('*').eq('user_id', u.user.id);
    if (!(subs || []).length) { res.status(200).json({ ok: false, sent: 0, message: 'Kayıtlı cihaz yok.' }); return; }
    const b = await body(req);
    const sent = await sendTo(sb, b.endpoint ? subs.filter((s) => s.endpoint === b.endpoint) : subs, { title: '🔔 Ajanda bildirimleri çalışıyor', body: 'Hatırlatmalarda "Yapıldı" ve "Yarına ertele" düğmeleri olacak.', tag: 'test', data: { url: '/' } });
    res.status(200).json({ ok: sent > 0, sent, devices: subs.length });
    return;
  }

  if (action === 'tick') {
    const { data: c } = await sb.from('push_cron').select('secret').eq('id', 1).maybeSingle();
    const given = req.headers['x-cron-key'] || (req.query || {}).key; // başlık ya da ?key= (cron-job.org gibi servisler için)
    if (!c || given !== c.secret) { res.status(401).json({ error: 'unauthorized' }); return; }
    if (!hasVapid) { res.status(200).json({ ok: false, waiting: 'VAPID anahtarları Vercel\'e henüz girilmedi' }); return; }
    const now = new Date();
    const { data: subs } = await sb.from('push_subs').select('*');
    const byUser = {};
    (subs || []).forEach((s) => { (byUser[s.user_id] = byUser[s.user_id] || []).push(s); });
    let sent = 0;
    for (const [uid, list] of Object.entries(byUser)) {
      try {
        const { data: st } = await sb.from('app_settings').select('notify').eq('user_id', uid).maybeSingle();
        const n = notifyOf(st && st.notify);
        const cand = await buildForUser(sb, uid, now, n);
        const won = await claim(sb, uid, cand.map((x) => x.key));
        for (const x of cand) if (won.has(x.key)) sent += await sendTo(sb, list, x.payload);
      } catch (e) { console.warn('tick', uid, e && e.message); }
    }
    // Eski kayıtları ara sıra temizle
    if (now.getMinutes() === 7) await sb.from('push_log').delete().lt('sent_at', new Date(now.getTime() - 40 * 86400000).toISOString());
    res.status(200).json({ ok: true, sent });
    return;
  }
  res.status(400).json({ error: 'unknown_action' });
}
