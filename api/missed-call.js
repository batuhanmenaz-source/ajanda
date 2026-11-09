// Telefondaki MacroDroid'in cevapsız çağrıları gönderdiği kapı.
// Sadece doğru gizli anahtarı (webhook_token) bilen istek kayıt ekleyebilir; bu kapıdan veri OKUNAMAZ.
import { createClient } from '@supabase/supabase-js';

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const url = process.env.VITE_SUPABASE_URL || 'https://ppjswmsskurwwumojjkh.supabase.co';
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    res.status(500).json({ ok: false, error: 'missing_server_config', message: 'Vercel ayarlarında SUPABASE_SECRET_KEY tanımlı değil.' });
    return;
  }

  // Gövde JSON ya da form olabilir; adres parametreleri de kabul edilir
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = Object.fromEntries(new URLSearchParams(body)); }
  }
  const q = { ...(req.query || {}), ...(body && typeof body === 'object' ? body : {}) };

  const token = clean(q.token, 100);
  if (token.length < 20) {
    res.status(401).json({ ok: false, error: 'bad_token' });
    return;
  }

  let name = clean(q.name, 100);
  const phone = clean(q.number || q.phone, 40).replace(/[^\d+]/g, '');
  // Rehberde olmayan numaralarda MacroDroid boş, "Unknown" ya da doldurulmamış [..] gönderebilir
  if (!name || /^\[.*\]$/.test(name) || /^(unknown|bilinmeyen|bilinmiyor)$/i.test(name) || name.replace(/[^\d]/g, '') === phone.replace(/[^\d]/g, '')) name = '';
  if (!name && !phone) {
    res.status(400).json({ ok: false, error: 'empty' });
    return;
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: owner, error: ownerErr } = await sb.from('app_settings').select('user_id').eq('webhook_token', token).maybeSingle();
  if (ownerErr) {
    res.status(500).json({ ok: false, error: 'db_error', message: ownerErr.message });
    return;
  }
  if (!owner) {
    res.status(401).json({ ok: false, error: 'bad_token' });
    return;
  }

  // Aynı numaradan 2 dakika içinde gelen ikinci kaydı atla
  if (phone) {
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: dup } = await sb.from('missed_calls').select('id').eq('user_id', owner.user_id).eq('phone', phone).gte('missed_at', since).limit(1);
    if (dup && dup.length) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
  }

  const { error } = await sb.from('missed_calls').insert({ user_id: owner.user_id, name: name || null, phone: phone || null, missed_at: new Date().toISOString() });
  if (error) {
    res.status(500).json({ ok: false, error: 'db_error', message: error.message });
    return;
  }
  res.status(200).json({ ok: true });
}
