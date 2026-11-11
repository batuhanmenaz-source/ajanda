// Telefondaki MacroDroid, giden bir arama bittiğinde aranan numarayı buraya gönderir.
// Bu numaradaki (ya da rehberde bu numaraya kayıtlı kişideki) en eski açık "aranacak" kaydı "Arandı" olur;
// aynı numaradan gelen açık cevapsız çağrılar da kapanır. Bu kapıdan veri OKUNAMAZ.
import { createClient } from '@supabase/supabase-js';

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const key10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const low = (s) => String(s || '').trim().toLocaleLowerCase('tr-TR');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }
  const url = process.env.VITE_SUPABASE_URL || 'https://ppjswmsskurwwumojjkh.supabase.co';
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: 'missing_server_config', message: 'Vercel ayarlarında SUPABASE_SECRET_KEY tanımlı değil.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = Object.fromEntries(new URLSearchParams(body)); }
  }
  const q = { ...(req.query || {}), ...(body && typeof body === 'object' ? body : {}) };
  const token = clean(q.token || q.Token || q.TOKEN, 200).replace(/\s+/g, '');
  if (token.length < 20) {
    res.status(400).json({ ok: false, error: 'missing_token' });
    return;
  }
  const number = clean(q.number || q.phone, 40);
  const k = key10(number);
  if (k.length < 7) {
    // Gizli numara ya da MacroDroid değişkeni doldurulmamış ([call_number])
    res.status(200).json({ ok: true, skipped: 'no_number' });
    return;
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: owner, error: ownerErr } = await sb.from('app_settings').select('user_id').eq('webhook_token', token).maybeSingle();
  if (ownerErr) { res.status(500).json({ ok: false, error: 'db_error', message: ownerErr.message }); return; }
  if (!owner) { res.status(401).json({ ok: false, error: 'bad_token' }); return; }
  const uid = owner.user_id;

  // Rehberde bu numaraya kayıtlı isimler (tablo yoksa boş geç)
  const names = new Set();
  const { data: contacts } = await sb.from('contacts').select('name, phone').eq('user_id', uid);
  (contacts || []).forEach((c) => { if (key10(c.phone) === k) names.add(low(c.name)); });

  const { data: calls, error: callErr } = await sb.from('calls').select('id, who, phone, due_at').eq('user_id', uid).eq('done', false);
  if (callErr) { res.status(500).json({ ok: false, error: 'db_error', message: callErr.message }); return; }
  const soon = Date.now() + 12 * 3600 * 1000;
  const match = (calls || [])
    .filter((c) => key10(c.phone) === k || names.has(low(c.who)))
    .filter((c) => !c.due_at || new Date(c.due_at).getTime() <= soon)
    .sort((a, b) => (a.due_at || '9').localeCompare(b.due_at || '9'))[0];

  let marked = null;
  if (match) {
    const { error } = await sb.from('calls').update({ done: true }).eq('id', match.id).eq('user_id', uid);
    if (!error) marked = match.who;
  }

  // Aynı numaradan açık cevapsız çağrılar: geri arandı → kapat
  let missed = 0;
  const { data: open } = await sb.from('missed_calls').select('id, phone').eq('user_id', uid).eq('handled', false);
  const ids = (open || []).filter((m) => key10(m.phone) === k).map((m) => m.id);
  if (ids.length) {
    const { error } = await sb.from('missed_calls').update({ handled: true }).in('id', ids).eq('user_id', uid);
    if (!error) missed = ids.length;
  }

  res.status(200).json({ ok: true, marked, missed });
}
