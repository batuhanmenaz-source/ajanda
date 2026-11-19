// İş maili (IMAP, sunucudaki /api/mail): bayraklı mailler ve cevap bekleyen gönderilmiş mailler
import { useCallback, useEffect, useState } from 'react';
import { Section, Sheet } from './ui.jsx';
import { supabase, DEMO } from './supabase.js';
import { whenLabel } from './dates.js';

const CACHE = 'ajanda-mail-v1';
const TTL = 5 * 60 * 1000;
const read = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* yok say */ } };
const WAIT_MIN_DAYS = 2;

function demoMail() {
  const d = (n) => new Date(Date.now() - n * 86400000).toISOString();
  return { configured: true, at: new Date().toISOString(), account: 'batuhan@ornek.com',
    flagged: [
      { id: 'f1@demo', fromName: 'Trendyol Kategori', from: 'kategori@trendyol.com', subject: 'Aralık kampanya takvimi ve katılım formu', date: d(0.2) },
      { id: 'f2@demo', fromName: 'Ajans Medya', from: 'ajans@ornek.com', subject: 'Influencer brief revizyonu', date: d(1.3) }
    ],
    waiting: [
      { id: 's1@demo', toName: 'Beymen Kategori', to: 'kategori@beymen.com', subject: 'Varyant açma talebi – Missha serisi', date: d(5), days: 5 },
      { id: 's2@demo', toName: 'Hepsiburada KAM', to: 'kam@hepsiburada.com', subject: 'Banner alanı fiyatı', date: d(2.4), days: 2 }
    ],
    answered: ['s9@demo'] };
}

export async function fetchMail(force) {
  if (DEMO) return demoMail();
  const c = read();
  if (!force && c && Date.now() - c.got < TTL) return c;
  const { data } = await supabase.auth.getSession();
  const token = data && data.session && data.session.access_token;
  const r = await fetch('/api/mail', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const j = await r.json().catch(() => ({ error: 'Beklenmeyen yanıt (' + r.status + ')' }));
  if (!r.ok && !j.error) j.error = 'Hata ' + r.status;
  const v = { ...j, got: Date.now() };
  if (!j.error) write(v);
  return v;
}

export function useMail(onAnswered) {
  const [mail, setMail] = useState(() => (DEMO ? demoMail() : read()));
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (force) => {
    setBusy(true);
    try {
      const v = await fetchMail(force);
      setMail(v);
      if (v && v.answered && v.answered.length && onAnswered) onAnswered(v.answered);
    } catch (e) { setMail((m) => ({ ...(m || {}), error: 'Mail alınamadı: ' + e.message })); }
    finally { setBusy(false); }
  }, [onAnswered]);
  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);
  return { mail, busy, reload: () => load(true) };
}

// Bugün sayfası: Mailler
export function MailSection({ mail, busy, reload, followups, actions, now }) {
  const [showAll, setShowAll] = useState(false);
  if (!mail || mail.configured === false) return null;
  if (mail.error) {
    return (
      <Section title="Mailler" tone="#1864AB" action={<button type="button" className="linkbtn" onClick={reload}>{busy ? 'Deneniyor…' : 'Tekrar dene'}</button>}>
        <div className="card"><p className="empty" style={{ color: 'var(--danger)' }}>{mail.error}</p></div>
      </Section>
    );
  }
  const tracked = new Map((followups || []).filter((f) => f.mail_id).map((f) => [f.mail_id, f]));
  const flagged = mail.flagged || [];
  const waiting = (mail.waiting || []).filter((w) => w.days >= WAIT_MIN_DAYS);
  if (!flagged.length && !waiting.length) {
    return (
      <Section title="Mailler" tone="#1864AB" action={<button type="button" className="linkbtn" onClick={reload}>{busy ? 'Yenileniyor…' : '↻'}</button>}>
        <div className="card"><p className="empty">Bayraklı mail yok, cevap bekleyen mail yok.</p></div>
      </Section>
    );
  }
  const fl = showAll ? flagged : flagged.slice(0, 4);
  const wt = showAll ? waiting : waiting.slice(0, 4);
  const more = flagged.length - fl.length + waiting.length - wt.length;
  return (
    <Section title={'Mailler' + (flagged.length ? ' · ' + flagged.length + ' bayraklı' : '')} tone="#1864AB"
      action={<button type="button" className="linkbtn" onClick={reload} aria-label="Mailleri yenile">{busy ? 'Yenileniyor…' : '↻ ' + new Date(mail.got || mail.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</button>}>
      <div className="card list mail-card">
        {fl.length ? <div className="mail-sub">🚩 Bayrakladıkların</div> : null}
        {fl.map((m) => (
          <div key={m.id} className="row mail-row">
            <span className="mail-main">
              <span className="mail-subj">{m.subject}</span>
              <span className="mail-meta">{m.fromName} · {whenLabel(new Date(m.date), now)}</span>
            </span>
            <span className="mail-acts">
              <button type="button" className="chip" onClick={() => actions.mailToReminder(m)}>⏰ Hatırlat</button>
              <button type="button" className="chip" onClick={() => actions.mailToFollowup(m)}>⏳ Bekleyen</button>
            </span>
          </div>
        ))}
        {wt.length ? <div className="mail-sub">✉️ Cevap bekleyen ({WAIT_MIN_DAYS}+ gün)</div> : null}
        {wt.map((m) => {
          const f = tracked.get(m.id);
          return (
            <div key={m.id} className="row mail-row">
              <span className="mail-main">
                <span className="mail-subj">{m.subject}</span>
                <span className="mail-meta"><b className={m.days >= 7 ? 'hi' : m.days >= 4 ? 'mid' : ''}>{m.days} gündür cevap yok</b> · {m.toName}</span>
              </span>
              <span className="mail-acts">
                {f ? <span className="mail-tracked">Takipte ✓</span> : <button type="button" className="chip" onClick={() => actions.mailTrack(m)}>⏳ Takibe al</button>}
              </span>
            </div>
          );
        })}
        {more > 0 ? <button type="button" className="done-fold" onClick={() => setShowAll(true)}>+{more} mail daha</button> : null}
      </div>
    </Section>
  );
}

// Hesap → İş maili: kurulum adımları ve bağlantı testi
export function MailSetupSheet({ onClose }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const test = async () => { setBusy(true); try { setRes(await fetchMail(true)); } catch (e) { setRes({ error: e.message }); } finally { setBusy(false); } };
  return (
    <Sheet title="İş maili (IMAP)" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="hint" style={{ margin: 0 }}>Ajanda mail sunucuna yalnızca <b>okumak</b> için bağlanır: Outlook'ta bayrakladığın mailleri ve cevap gelmeyen gönderdiklerini gösterir. Hiçbir maili silmez, taşımaz, göndermez. Şifren sadece Vercel ayarlarında durur.</p>
        <div className="setup-box">
          <b>Kurulum (bir kez)</b>
          <ol className="setup-steps">
            <li>vercel.com → <b>ajanda</b> projesi → <b>Settings → Environment Variables</b>.</li>
            <li>Şu 5 değişkeni ekle (her biri için Name ve Value, ortam: Production):
              <ul>
                <li><code>IMAP_HOST</code> = <code>mail.arssm.net</code></li>
                <li><code>IMAP_PORT</code> = <code>993</code></li>
                <li><code>IMAP_USER</code> = iş mail adresin</li>
                <li><code>IMAP_PASS</code> = mail şifren (bunu kimseyle paylaşma)</li>
                <li><code>MAIL_OWNER</code> = Ajanda'ya giriş yaptığın Google adresi</li>
              </ul>
            </li>
            <li><b>Deployments</b> → en üstteki → <b>⋯ → Redeploy</b>.</li>
            <li>Aşağıdaki <b>Bağlantıyı test et</b>'e bas.</li>
          </ol>
        </div>
        <button type="button" className="btn big primary" disabled={busy} onClick={test}>{busy ? 'Bağlanıyor…' : 'Bağlantıyı test et'}</button>
        {res ? (
          <div className="card" style={{ padding: 14 }}>
            {res.configured === false ? <p style={{ margin: 0 }}>Henüz ayarlanmamış. Eksik: <b>{(res.missing || []).join(', ')}</b></p>
              : res.error ? <p style={{ margin: 0, color: 'var(--danger)' }}>{res.error}</p>
                : <p style={{ margin: 0, color: 'var(--green)' }}>✓ Bağlandı ({res.account}). {(res.flagged || []).length} bayraklı, {(res.waiting || []).length} cevap bekleyen mail. Gönderilmiş klasörü: {res.sentFolder || 'bulunamadı'}.</p>}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
