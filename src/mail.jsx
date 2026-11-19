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
export function MailSection({ mail, busy, reload, followups, actions, now, onAll }) {
  const [showAll, setShowAll] = useState(false);
  if (!mail || mail.configured === false) return null;
  if (mail.needTrust) {
    return (
      <Section title="Mailler" tone="#1864AB">
        <div className="card"><p className="empty">Mail sunucusunun sertifikası onay bekliyor. Sağ üstteki etiket › Hesap › 📧 İş maili bağlantısı.</p>
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 12 }}><button type="button" className="btn" onClick={actions.openMailSetup}>Onayla</button></div></div>
      </Section>
    );
  }
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
  const fl = showAll ? flagged : flagged.slice(0, 3);
  const wt = showAll ? waiting : waiting.slice(0, 3);
  const more = flagged.length - fl.length + waiting.length - wt.length;
  return (
    <Section title={'Mailler' + (flagged.length ? ' · ' + flagged.length + ' bayraklı' : '')} tone="#1864AB"
      action={<span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
        <button type="button" className="linkbtn" onClick={reload} aria-label="Mailleri yenile">{busy ? 'Yenileniyor…' : '↻ ' + new Date(mail.got || mail.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</button>
        {onAll ? <button type="button" className="linkbtn" onClick={onAll}>Tümü</button> : null}
      </span>}>
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
        {more > 0 ? <button type="button" className="done-fold" onClick={() => (onAll ? onAll() : setShowAll(true))}>+{more} mail daha · tümünü gör</button> : null}
      </div>
    </Section>
  );
}

function FlagRow({ m, actions, now }) {
  return (
    <div className="row mail-row">
      <span className="mail-main">
        <span className="mail-subj">{m.subject}</span>
        <span className="mail-meta">{m.fromName} · {whenLabel(new Date(m.date), now)}</span>
      </span>
      <span className="mail-acts">
        <button type="button" className="chip" onClick={() => actions.mailToReminder(m)}>⏰ Hatırlat</button>
        <button type="button" className="chip" onClick={() => actions.mailToFollowup(m)}>⏳ Bekleyen</button>
      </span>
    </div>
  );
}
function WaitRow({ m, tracked, actions }) {
  return (
    <div className="row mail-row">
      <span className="mail-main">
        <span className="mail-subj">{m.subject}</span>
        <span className="mail-meta"><b className={m.days >= 7 ? 'hi' : m.days >= 4 ? 'mid' : ''}>{m.days ? m.days + ' gündür cevap yok' : 'bugün gönderildi'}</b> · {m.toName}</span>
      </span>
      <span className="mail-acts">
        {tracked ? <span className="mail-tracked">Takipte ✓</span> : <button type="button" className="chip" onClick={() => actions.mailTrack(m)}>⏳ Takibe al</button>}
      </span>
    </div>
  );
}

// İş → Mailler: tüm bayraklılar ve cevap bekleyenler, arama ile
export function MailView({ mail: st, followups, actions, now }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  if (!st || !st.mail) return <div className="card"><p className="empty">Mailler yükleniyor…</p></div>;
  const mail = st.mail;
  if (mail.configured === false || mail.needTrust || mail.error) {
    return (
      <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        <p style={{ margin: 0 }}>{mail.error || (mail.needTrust ? 'Mail sunucusunun sertifikası onay bekliyor.' : 'İş maili henüz bağlanmadı.')}</p>
        <button type="button" className="btn" onClick={actions.openMailSetup}>📧 Mail bağlantısı</button>
      </div>
    );
  }
  const k = q.trim().toLocaleLowerCase('tr-TR');
  const hit = (m) => !k || [m.subject, m.fromName, m.from, m.toName, m.to].some((x) => String(x || '').toLocaleLowerCase('tr-TR').includes(k));
  const tracked = new Map((followups || []).filter((f) => f.mail_id).map((f) => [f.mail_id, f]));
  const flagged = (mail.flagged || []).filter(hit);
  const waiting = (mail.waiting || []).filter((w) => all || w.days >= WAIT_MIN_DAYS).filter(hit);
  const trackedOpen = (followups || []).filter((f) => f.mail_id && !f.done).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      <div className="mail-top">
        <input type="search" className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Konu ya da kişi ara…" aria-label="Maillerde ara" />
        <button type="button" className="btn" onClick={st.reload} disabled={st.busy}>{st.busy ? 'Yenileniyor…' : '↻ Yenile'}</button>
      </div>
      <p className="hint" style={{ margin: '-6px 0 0' }}>{mail.account} · son kontrol {new Date(mail.got || mail.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}{trackedOpen ? ' · ' + trackedOpen + ' mail takipte (Bekleyenler)' : ''}</p>
      <Section title={'🚩 Bayrakladıkların · ' + flagged.length}>
        <div className="card list mail-card">
          {flagged.length ? flagged.map((m) => <FlagRow key={m.id} m={m} actions={actions} now={now} />) : <p className="empty">{k ? 'Aramaya uyan bayraklı mail yok.' : "Outlook'ta bayrakladığın mail yok."}</p>}
        </div>
      </Section>
      <Section title={'✉️ Cevap bekleyen · ' + waiting.length} action={<label className="wl-check" style={{ fontSize: 12 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Son 2 günü de göster</span></label>}>
        <div className="card list mail-card">
          {waiting.length ? waiting.map((m) => <WaitRow key={m.id} m={m} tracked={tracked.get(m.id)} actions={actions} />) : <p className="empty">{k ? 'Aramaya uyan mail yok.' : 'Cevap bekleyen mail yok.'}</p>}
        </div>
      </Section>
      <p className="hint" style={{ margin: 0 }}>Son 3 haftada gönderdiğin ve cevap gelmeyen mailler listelenir. Takibe aldıkların cevap gelince Bekleyenler'den kendiliğinden kapanır.</p>
    </div>
  );
}

// Hesap → İş maili: kurulum adımları ve bağlantı testi
export function MailSetupSheet({ onClose, onTrust }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const test = async () => { setBusy(true); try { setRes(await fetchMail(true)); } catch (e) { setRes({ error: e.message }); } finally { setBusy(false); } };
  const trust = async () => {
    setBusy(true);
    try { await onTrust(res.cert.fp); setRes(await fetchMail(true)); }
    catch (e) { setRes({ ...res, trustError: /mail_cert_fp/.test(String(e && e.message)) ? "Önce Supabase'de 22 numaralı SQL'i çalıştır." : 'Kaydedilemedi: ' + (e && e.message) }); }
    finally { setBusy(false); }
  };
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
              : res.needTrust ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0 }}><b>{res.changed ? 'Sunucunun sertifikası değişmiş.' : 'Mail sunucun kendi imzaladığı bir sertifika kullanıyor.'}</b> {res.changed ? 'Sunucu sertifikasını yenilediyse normaldir; emin değilsen IT\'ye sor.' : 'Şirket mail sunucularında sık görülür; Outlook da ilk kurulumda bunun için bir kez "güven" diye sormuş olabilir.'} Ajanda bu sertifikayı onaylarsan sadece ona güvenir; sertifika değişirse tekrar sorar.</p>
                  <div className="cert-box">
                    <span><b>Ad:</b> {res.cert.subject || '—'}</span>
                    <span><b>Veren:</b> {res.cert.issuer || '—'}</span>
                    <span><b>Geçerlilik sonu:</b> {res.cert.validTo || '—'}</span>
                    <span className="fp"><b>Parmak izi:</b> {res.cert.fp}</span>
                  </div>
                  <button type="button" className="btn big primary" disabled={busy} onClick={trust}>Bu sertifikaya güven ve bağlan</button>
                  {res.trustError ? <p style={{ margin: 0, color: 'var(--danger)' }}>{res.trustError}</p> : null}
                </div>
              )
              : res.error ? <p style={{ margin: 0, color: 'var(--danger)' }}>{res.error}</p>
                : <p style={{ margin: 0, color: 'var(--green)' }}>✓ Bağlandı ({res.account}). {(res.flagged || []).length} bayraklı, {(res.waiting || []).length} cevap bekleyen mail. Gönderilmiş klasörü: {res.sentFolder || 'bulunamadı'}.</p>}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
