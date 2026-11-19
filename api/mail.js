// İş maili (IMAP): bayraklı mailler ve cevap bekleyen gönderilmiş mailler.
// Sadece OKUR: hiçbir maili silmez, taşımaz, işaretlemez, göndermez.
// Mail sunucusu ve şifre yalnızca Vercel ortam değişkenlerinde durur:
//   IMAP_HOST (ör. mail.arssm.net), IMAP_PORT (varsayılan 993), IMAP_USER, IMAP_PASS,
//   MAIL_OWNER = Ajanda'ya giriş yaptığın e-posta (başka hiçbir hesap bu uca erişemez)
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';

const DAY = 86400000;
const SENT_NAMES = ['sent', 'sent items', 'sent messages', 'gönderilmiş öğeler', 'gönderilenler', 'gönderilmiş', 'inbox.sent', 'inbox.sent items'];

const addr = (list) => ((list || [])[0] || {});
const normId = (s) => String(s || '').trim().replace(/^<|>$/g, '').toLowerCase();
const idsIn = (s) => (String(s || '').match(/<[^>]+>/g) || []).map(normId);
const normSubj = (s) => String(s || '').replace(/^\s*((re|fw|fwd|ynt|ileti|i̇leti|cvp|yanıt|ilt)\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Gönderilmiş klasörünü bul: önce sunucunun işareti (\Sent), sonra bilinen adlar
export function findSent(boxes) {
  const special = boxes.find((b) => b.specialUse === '\\Sent');
  if (special) return special.path;
  const byName = boxes.find((b) => SENT_NAMES.includes(String(b.path || '').toLowerCase()) || SENT_NAMES.includes(String(b.name || '').toLowerCase()));
  return byName ? byName.path : null;
}

// Asıl iş: istemci (ImapFlow ya da test sahtesi) ile tarar
export async function scan(client, { now = Date.now(), days = 21, me = '' } = {}) {
  const since = new Date(now - days * DAY);
  const flagged = [];
  const replied = new Set(); // gelen kutusundaki cevapların işaret ettiği mesaj kimlikleri
  const inboxSubjects = []; // yedek eşleşme: aynı konu + karşı taraftan gelen

  let lock = await client.getMailboxLock('INBOX');
  try {
    const fl = await client.search({ flagged: true }, { uid: true });
    const flUids = (fl || []).slice(-40);
    if (flUids.length) {
      for await (const m of client.fetch(flUids.join(','), { envelope: true, internalDate: true }, { uid: true })) {
        const f = addr(m.envelope.from);
        flagged.push({ uid: m.uid, id: normId(m.envelope.messageId), from: f.address || '', fromName: f.name || f.address || '', subject: m.envelope.subject || '(konu yok)', date: (m.envelope.date || m.internalDate || new Date()).toISOString() });
      }
    }
    const recent = await client.search({ since }, { uid: true });
    if (recent && recent.length) {
      for await (const m of client.fetch(recent.join(','), { envelope: true, headers: ['references'] }, { uid: true })) {
        if (m.envelope.inReplyTo) idsIn(m.envelope.inReplyTo).forEach((x) => replied.add(x));
        const refs = m.headers ? m.headers.toString() : '';
        idsIn(refs).forEach((x) => replied.add(x));
        inboxSubjects.push({ s: normSubj(m.envelope.subject), from: (addr(m.envelope.from).address || '').toLowerCase(), t: +(m.envelope.date || 0) });
      }
    }
  } finally { lock.release(); }

  const boxes = await client.list();
  const sentPath = findSent(boxes || []);
  const waiting = [];
  const answered = [];
  if (sentPath) {
    lock = await client.getMailboxLock(sentPath);
    try {
      const uids = await client.search({ since }, { uid: true });
      const seen = new Map(); // aynı konudaki en son gönderilen
      if (uids && uids.length) {
        for await (const m of client.fetch(uids.join(','), { envelope: true }, { uid: true })) {
          const to = addr(m.envelope.to);
          const toAddr = (to.address || '').toLowerCase();
          if (!toAddr || (me && toAddr === me.toLowerCase())) continue;
          const id = normId(m.envelope.messageId);
          const t = +(m.envelope.date || 0);
          const subj = normSubj(m.envelope.subject);
          const gotReply = replied.has(id) || inboxSubjects.some((x) => x.s && x.s === subj && x.from === toAddr && x.t > t);
          const rec = { id, to: to.address, toName: to.name || to.address, subject: m.envelope.subject || '(konu yok)', date: new Date(t).toISOString(), days: Math.floor((now - t) / DAY), replied: gotReply };
          const prev = seen.get(subj + '|' + toAddr);
          if (!prev || +new Date(prev.date) < t) seen.set(subj + '|' + toAddr, rec);
        }
      }
      for (const r of seen.values()) (r.replied ? answered : waiting).push(r);
    } finally { lock.release(); }
  }
  flagged.sort((a, b) => b.date.localeCompare(a.date));
  waiting.sort((a, b) => a.date.localeCompare(b.date));
  return { flagged, waiting, answered: answered.map((r) => r.id), sentFolder: sentPath };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const { IMAP_HOST, IMAP_USER, IMAP_PASS, MAIL_OWNER } = process.env;
  const port = Number(process.env.IMAP_PORT || 993);
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS || !MAIL_OWNER) {
    res.status(200).json({ configured: false, missing: ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS', 'MAIL_OWNER'].filter((k) => !process.env[k]) });
    return;
  }
  // Yalnızca Ajanda'ya MAIL_OWNER ile giriş yapmış kullanıcı
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const url = process.env.VITE_SUPABASE_URL || 'https://ppjswmsskurwwumojjkh.supabase.co';
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!jwt || !key) { res.status(401).json({ error: 'Oturum gerekli.' }); return; }
  try {
    const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.getUser(jwt);
    if (error || !data || !data.user) { res.status(401).json({ error: 'Oturum geçersiz.' }); return; }
    if (String(data.user.email || '').toLowerCase() !== MAIL_OWNER.trim().toLowerCase()) { res.status(403).json({ error: 'Bu hesap maile erişemez.' }); return; }
  } catch (e) {
    res.status(500).json({ error: 'Oturum doğrulanamadı.' });
    return;
  }

  const client = new ImapFlow({ host: IMAP_HOST, port, secure: port === 993, auth: { user: IMAP_USER, pass: IMAP_PASS }, logger: false, socketTimeout: 20000, greetingTimeout: 10000, connectionTimeout: 10000, tls: { servername: IMAP_HOST } });
  try {
    await client.connect();
    const out = await scan(client, { me: IMAP_USER, days: Number(process.env.MAIL_DAYS || 21) });
    res.status(200).json({ configured: true, at: new Date().toISOString(), account: IMAP_USER, ...out });
  } catch (e) {
    const msg = String((e && (e.responseText || e.message)) || e);
    const auth = /auth|login|credentials|password|LOGIN failed/i.test(msg);
    res.status(502).json({ configured: true, error: auth ? 'Mail sunucusu giriş bilgilerini kabul etmedi (IMAP_USER / IMAP_PASS).' : 'Mail sunucusuna bağlanılamadı: ' + msg.slice(0, 160) });
  } finally {
    try { await client.logout(); } catch { /* yok say */ }
  }
}
