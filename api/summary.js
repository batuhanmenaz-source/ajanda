// Bildirim çubuğundaki "Ajanda özeti" için kısa, düz metin özet.
// Telefondaki MacroDroid bu adresi aralıklarla çağırır ve gelen metni kalıcı bir bildirimde gösterir.
// Yalnız doğru gizli anahtarla (webhook_token) çalışır ve yalnız bu kısa özeti döndürür.
import { createClient } from '@supabase/supabase-js';

const TR = 3 * 3600 * 1000; // Türkiye: UTC+3 (yaz saati yok)
const ymd = (ms) => new Date(ms + TR).toISOString().slice(0, 10);
const hm = (iso) => new Date(new Date(iso).getTime() + TR).toISOString().slice(11, 16);
const tl = (n) => '₺' + Math.round(Number(n) || 0).toLocaleString('tr-TR');
const tlShort = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return '₺' + (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' mn';
  if (v >= 1e3) return '₺' + (v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' bin';
  return tl(v);
};
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  const url = process.env.VITE_SUPABASE_URL || 'https://ppjswmsskurwwumojjkh.supabase.co';
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) { res.status(500).send('Sunucu ayarı eksik (SUPABASE_SECRET_KEY).'); return; }
  const q = req.query || {};
  const token = String(q.token || '').replace(/\s+/g, '');
  if (token.length < 20) { res.status(400).send('Anahtar eksik.'); return; }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: owner } = await sb.from('app_settings').select('user_id').eq('webhook_token', token).maybeSingle();
  if (!owner) { res.status(401).send('Anahtar tanınmadı.'); return; }
  const uid = owner.user_id;

  const now = Date.now();
  const today = ymd(now);
  const dayStart = Date.parse(today + 'T00:00:00Z') - TR;
  const dayEnd = dayStart + 86400000;
  const iso = (ms) => new Date(ms).toISOString();

  const [rem, calls, missed, rev, camps, specials, ads] = await Promise.all([
    sb.from('reminders').select('title, due_at, for_yarim').eq('user_id', uid).eq('done', false).not('due_at', 'is', null).lt('due_at', iso(dayEnd)),
    sb.from('calls').select('who, due_at, for_yarim').eq('user_id', uid).eq('done', false).not('due_at', 'is', null).lt('due_at', iso(dayEnd)),
    sb.from('missed_calls').select('id').eq('user_id', uid).eq('handled', false),
    sb.from('revenue').select('day, marketplace, amount').eq('user_id', uid).gte('day', ymd(now - 8 * 86400000)).lte('day', today),
    sb.from('campaigns').select('name, marketplace, start_date, end_date, kind').eq('user_id', uid).lte('start_date', today).gte('end_date', today),
    sb.from('special_dates').select('title, month, day').eq('user_id', uid),
    sb.from('collabs').select('handle, title, start_at, end_at, status').eq('user_id', uid).gt('end_at', iso(now)).lt('start_at', iso(dayEnd))
  ]);

  const items = [
    ...((rem.data || []).map((r) => ({ t: r.due_at, text: r.title + (r.for_yarim ? ' ❤️' : '') }))),
    ...((calls.data || []).map((c) => ({ t: c.due_at, text: c.who + ' (ara)' + (c.for_yarim ? ' ❤️' : '') })))
  ];
  const late = items.filter((x) => Date.parse(x.t) < dayStart).length;
  const todayItems = items.filter((x) => Date.parse(x.t) >= dayStart);
  const next = todayItems.filter((x) => Date.parse(x.t) >= now - 5 * 60000).sort((a, b) => a.t.localeCompare(b.t))[0];

  const lines = [];
  lines.push(next ? '⏰ ' + hm(next.t) + ' · ' + clip(next.text, 48) : todayItems.length ? '✅ Bugün sırada başka iş yok' : '✅ Bugün için iş yok');
  const openToday = todayItems.filter((x) => Date.parse(x.t) < now - 5 * 60000).length;
  const rest = [
    todayItems.length ? todayItems.length + ' iş bugün' : '',
    openToday ? openToday + ' saati geçti' : '',
    late ? late + ' geciken' : '',
    (missed.data || []).length ? (missed.data || []).length + ' cevapsız çağrı' : ''
  ].filter(Boolean);
  if (rest.length) lines.push('📋 ' + rest.join(' · '));

  // Dünkü ciro ve geçen haftanın aynı günü
  if (!rev.error && rev.data && rev.data.length) {
    const y = ymd(now - 86400000), w = ymd(now - 8 * 86400000);
    const sum = (d) => rev.data.filter((r) => r.day === d).reduce((s, r) => s + Number(r.amount), 0);
    const ys = sum(y);
    if (ys) {
      const ws = sum(w);
      const top = rev.data.filter((r) => r.day === y).sort((a, b) => b.amount - a.amount)[0];
      const d = ws ? Math.round((ys / ws - 1) * 100) : null;
      lines.push('💰 Dün ' + tl(ys) + (d != null ? (d >= 0 ? ' ▲%' : ' ▼%') + Math.abs(d) : '') + (top ? ' · ' + top.marketplace + ' ' + tlShort(top.amount) : ''));
    } else lines.push('💰 Dünün cirosu girilmedi');
  }

  const live = (camps.data || []).filter((c) => c.kind !== 'etkinlik');
  if (live.length) {
    const c = live.sort((a, b) => a.end_date.localeCompare(b.end_date))[0];
    lines.push('📣 ' + clip(c.name, 30) + (c.marketplace ? ' (' + c.marketplace + ')' : '') + (c.end_date === today ? ' · son gün' : '') + (live.length > 1 ? ' +' + (live.length - 1) : ''));
  }

  // Influencer reklamları: yayındaki (en yakın biten) ya da bugün başlayacak olan
  const adList = (ads.data || []).filter((a) => a.status !== 'iptal');
  if (adList.length) {
    const on = adList.filter((a) => Date.parse(a.start_at) <= now).sort((a, b) => a.end_at.localeCompare(b.end_at));
    const who = (a) => clip(a.handle || a.title || 'Reklam', 22);
    const endTxt = (a) => (ymd(Date.parse(a.end_at)) === today ? hm(a.end_at) : ymd(Date.parse(a.end_at)) === ymd(now + 86400000) ? 'yarın ' + hm(a.end_at) : ymd(Date.parse(a.end_at)).slice(8) + '.' + ymd(Date.parse(a.end_at)).slice(5, 7) + ' ' + hm(a.end_at));
    if (on.length) lines.push('🎬 ' + who(on[0]) + ' yayında · bitiş ' + endTxt(on[0]) + (adList.length > 1 ? ' +' + (adList.length - 1) : ''));
    else { const a = adList.sort((x, y) => x.start_at.localeCompare(y.start_at))[0]; lines.push('🎬 ' + who(a) + ' ' + hm(a.start_at) + '\'te başlıyor' + (adList.length > 1 ? ' +' + (adList.length - 1) : '')); }
  }

  const tm = ymd(now + 86400000);
  const sp = (specials.data || []).map((s) => {
    const k = String(s.month).padStart(2, '0') + '-' + String(s.day).padStart(2, '0');
    return today.slice(5) === k ? '🎉 Bugün: ' + s.title : tm.slice(5) === k ? '🎁 Yarın: ' + s.title : '';
  }).filter(Boolean);
  if (sp.length) lines.push(clip(sp.join(' · '), 70));

  if (q.saat !== '0') lines.push('↻ ' + hm(iso(now)));
  res.status(200).send(lines.join('\n'));
}
