// İş maili (IMAP): bayraklı mailler ve cevap bekleyen gönderilmiş mailler.
// Sadece OKUR: hiçbir maili silmez, taşımaz, işaretlemez, göndermez.
// Mail sunucusu ve şifre yalnızca Vercel ortam değişkenlerinde durur:
//   IMAP_HOST (ör. mail.arssm.net), IMAP_PORT (varsayılan 993), IMAP_USER, IMAP_PASS,
//   MAIL_OWNER = Ajanda'ya giriş yaptığın e-posta (başka hiçbir hesap bu uca erişemez)
import { createClient } from '@supabase/supabase-js';
import { ImapFlow } from 'imapflow';
import tls from 'tls';

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
          const rec = { uid: m.uid, id, to: to.address, toName: to.name || to.address, subject: m.envelope.subject || '(konu yok)', date: new Date(t).toISOString(), days: Math.floor((now - t) / DAY), replied: gotReply };
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

// ---- Tek mailin içeriği (yalnızca istenince; hiçbir yere kaydedilmez) ----
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ccedil: 'ç', Ccedil: 'Ç', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', euro: '€', bull: '•' };
export function htmlToText(h) {
  return String(h || '')
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n] != null ? ENT[n] : m));
}
// Metni toparla, alıntılanan eski yazışmayı ayır
const QUOTE = /^\s*(-{2,}\s*(original message|özgün ileti|orijinal ileti|forwarded message|iletilen ileti)|(from|kimden|gönderen)\s*:\s*\S.*$|.{6,200}\b(wrote|yazdı):\s*$)/i;
export function tidy(t) {
  const lines = String(t || '').replace(/\r/g, '').replace(/[ \t ]+$/gm, '').split('\n');
  let cut = lines.findIndex((l, i) => i > 0 && QUOTE.test(l));
  if (cut < 0) cut = lines.findIndex((l, i) => i > 0 && /^>/.test(l));
  const main = (cut > 0 ? lines.slice(0, cut) : lines).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: main.slice(0, 6000), cut: main.length > 6000, quoted: cut > 0 };
}
function walk(node, out) {
  if (!node) return;
  if (node.childNodes) { node.childNodes.forEach((c) => walk(c, out)); return; }
  const type = String(node.type || '').toLowerCase();
  const name = (node.dispositionParameters && node.dispositionParameters.filename) || (node.parameters && node.parameters.name);
  const isAtt = node.disposition === 'attachment' || (name && !type.startsWith('text/'));
  if (isAtt) { if (name && !/^image\d*\.(png|jpe?g|gif)$/i.test(name)) out.files.push({ name, size: node.size || 0 }); return; }
  if (type === 'text/plain' && !out.plain) out.plain = node.part || '1';
  if (type === 'text/html' && !out.html) out.html = node.part || '1';
}
async function streamText(stream, max = 400000) {
  const chunks = []; let n = 0;
  for await (const c of stream) { chunks.push(c); n += c.length; if (n > max) break; }
  return Buffer.concat(chunks).toString('utf8');
}
export async function readBody(client, { box, uid }) {
  const lock = await client.getMailboxLock(box);
  try {
    const msg = await client.fetchOne(String(uid), { bodyStructure: true, envelope: true }, { uid: true });
    if (!msg) return { error: 'Mail bulunamadı (silinmiş ya da taşınmış olabilir).' };
    const out = { files: [] };
    walk(msg.bodyStructure, out);
    let text = '';
    const part = out.plain || out.html;
    if (part) {
      const dl = await client.download(String(uid), part, { uid: true, maxBytes: 400000 });
      const raw = await streamText(dl.content);
      text = part === out.plain ? raw : htmlToText(raw);
    }
    const env = msg.envelope || {};
    const who = (l) => (l || []).map((a) => a.name || a.address).filter(Boolean).join(', ');
    return { ...tidy(text), files: out.files.slice(0, 12), from: who(env.from), to: who(env.to), cc: who(env.cc), date: env.date ? new Date(env.date).toISOString() : null };
  } finally { lock.release(); }
}

// Sunucunun sertifikasını bağlanmadan önce görür (şifre gönderilmez)
const LEGACY = { ciphers: 'DEFAULT@SECLEVEL=0', minVersion: 'TLSv1' };
const WEAK = /too weak|SECLEVEL|dh key too small|unsupported protocol|wrong version number|no protocols available/i;
function peek(host, port, legacy) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, rejectUnauthorized: false, ...(legacy ? LEGACY : {}) }, () => {
      const c = sock.getPeerCertificate(true);
      const raw = c && c.raw;
      resolve({
        authorized: sock.authorized, reason: sock.authorizationError ? String(sock.authorizationError) : null,
        fp: c && c.fingerprint256, subject: (c && c.subject && c.subject.CN) || '', issuer: (c && c.issuer && (c.issuer.O || c.issuer.CN)) || '',
        validTo: c && c.valid_to, pem: raw ? '-----BEGIN CERTIFICATE-----\n' + raw.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n' : null
      });
      sock.destroy();
    });
    sock.setTimeout(10000, () => { sock.destroy(); reject(new Error('Zaman aşımı')); });
    sock.on('error', reject);
  });
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
  let sb, user;
  try {
    sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.getUser(jwt);
    if (error || !data || !data.user) { res.status(401).json({ error: 'Oturum geçersiz.' }); return; }
    if (String(data.user.email || '').toLowerCase() !== MAIL_OWNER.trim().toLowerCase()) { res.status(403).json({ error: 'Bu hesap maile erişemez.' }); return; }
    user = data.user;
  } catch (e) {
    res.status(500).json({ error: 'Oturum doğrulanamadı.' });
    return;
  }

  // 1) Sertifikaya bak (şifre göndermeden). Eski/zayıf sertifikada uyumlu TLS ile tekrar dene.
  let legacy = false, cert;
  try {
    try { cert = await peek(IMAP_HOST, port, false); }
    catch (e) { if (!WEAK.test(String(e && e.message))) throw e; legacy = true; cert = await peek(IMAP_HOST, port, true); }
  } catch (e) {
    res.status(502).json({ configured: true, error: 'Mail sunucusuna bağlanılamadı: ' + String(e && e.message).slice(0, 160) });
    return;
  }
  // 2) Sertifika herkesçe tanınan bir kurumdan değilse (kendi imzalı vb.) yalnızca onaylanmış parmak izine güven.
  let tlsOpts = { servername: IMAP_HOST, ...(legacy ? LEGACY : {}) };
  if (!cert.authorized) {
    let pinned = process.env.IMAP_CERT_FP || null;
    if (!pinned) {
      const { data: st } = await sb.from('app_settings').select('mail_cert_fp').eq('user_id', user.id).maybeSingle();
      pinned = st && st.mail_cert_fp;
    }
    if (!pinned || pinned !== cert.fp) {
      res.status(200).json({ configured: true, needTrust: true, changed: !!pinned, cert: { fp: cert.fp, subject: cert.subject, issuer: cert.issuer, validTo: cert.validTo, reason: cert.reason } });
      return;
    }
    // Onaylı sertifikanın kendisi kök kabul edilir; ad uyuşmazlığı (paylaşımlı hosting) parmak izi eşleştiği için sorun değil
    // Zayıf anahtar da bu sertifikaya özgü kabul edilir (parmak izi zaten birebir eşleşti)
    tlsOpts = { ...tlsOpts, ...LEGACY, ca: cert.pem, checkServerIdentity: () => undefined };
  }
  const client = new ImapFlow({
    host: IMAP_HOST, port, secure: port !== 143, auth: { user: IMAP_USER, pass: IMAP_PASS }, logger: false,
    socketTimeout: 20000, greetingTimeout: 10000, connectionTimeout: 10000, tls: tlsOpts
  });
  try {
    await client.connect();
    const q = req.query || {};
    if (q.uid) {
      const uid = Number(q.uid);
      if (!Number.isInteger(uid) || uid <= 0) { res.status(400).json({ error: 'Geçersiz mail.' }); return; }
      let box = 'INBOX';
      if (q.box === 'sent') { box = findSent((await client.list()) || []); if (!box) { res.status(404).json({ error: 'Gönderilmiş klasörü bulunamadı.' }); return; } }
      const body = await readBody(client, { box, uid });
      res.status(body.error ? 404 : 200).json(body);
      return;
    }
    const out = await scan(client, { me: IMAP_USER, days: Number(process.env.MAIL_DAYS || 21) });
    res.status(200).json({ configured: true, at: new Date().toISOString(), account: IMAP_USER, legacyTls: legacy, pinned: !cert.authorized, ...out });
  } catch (e) {
    const msg = String((e && (e.responseText || e.message)) || e);
    const auth = /auth|login|credentials|password|LOGIN failed/i.test(msg) && !/certificate/i.test(msg);
    const cert = /certificate|self.signed|altname|hostname/i.test(msg);
    res.status(502).json({ configured: true, error: auth ? 'Mail sunucusu giriş bilgilerini kabul etmedi (IMAP_USER / IMAP_PASS).' : (cert ? 'Mail sunucusunun sertifikası doğrulanamadı: ' : 'Mail sunucusuna bağlanılamadı: ') + msg.slice(0, 160) });
  } finally {
    try { await client.logout(); } catch { /* yok say */ }
  }
}
