// Influencer reklamları: yayındaki / yaklaşan reklamların başlangıç-bitiş takibi
import { useMemo, useState } from 'react';
import { Sheet, Section } from './ui.jsx';
import { MARKETPLACES, BRANDS, mpColor } from './constants.js';
import { tl, tlShort, parseTL } from './revenue.jsx';
import { AlertPicker } from './alertpicker.jsx';
import { normAlerts } from './alerts.js';
import { toDateInput, toTimeInput, combine, fmtTime, whenLabel, startOfDay, addDays } from './dates.js';

export const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Diğer'];
const PICON = { Instagram: '📸', TikTok: '🎵', YouTube: '▶️', 'Diğer': '🎬' };

// Başlangıç / bitiş (eski kayıtlarda yalnız yayın günü var: o günün tamamı)
export function adStart(c) {
  if (c.start_at) return new Date(c.start_at);
  if (c.publish_date) return combine(c.publish_date, '00:00');
  return null;
}
export function adEnd(c) {
  if (c.end_at) return new Date(c.end_at);
  if (c.start_at) return new Date(new Date(c.start_at).getTime() + 3600000);
  if (c.publish_date) return combine(c.publish_date, '23:59');
  return null;
}
export function adStatus(c, now = new Date()) {
  if (c.status === 'iptal') return 'iptal';
  const s = adStart(c), e = adEnd(c);
  if (!s) return 'tarihsiz';
  if (now < s) return 'soon';
  if (now <= e) return 'live';
  return 'past';
}
export const adWho = (c, contacts) => c.handle || ((contacts || []).find((k) => k.id === c.contact_id) || {}).name || 'Influencer';

// "2 gün 3 sa", "5 sa 20 dk", "12 dk"
export function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return d + ' gün' + (h ? ' ' + h + ' sa' : '');
  if (h) return h + ' sa' + (mm ? ' ' + mm + ' dk' : '');
  return mm + ' dk';
}
const when = (d, now) => whenLabel(d, now);
// Komisyon: "%20", "%12,5"
export const pct = (v) => (v == null || v === '' ? '' : '%' + Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
export const hasPct = (c) => c.commission != null && c.commission !== '';
const mpStyle = (c) => (c.marketplace ? { '--mp': mpColor(c.marketplace) } : undefined);

function AdCard({ c, now, contacts, onOpen }) {
  const st = adStatus(c, now);
  const s = adStart(c), e = adEnd(c);
  const p = st === 'live' ? Math.min(1, Math.max(0, (now - s) / Math.max(1, e - s))) : 0;
  return (
    <button type="button" className={'card ad ad-' + st + (c.marketplace ? ' has-mp' : '')} style={mpStyle(c)} onClick={() => onOpen(c)}>
      <span className="ad-top">
        <span className="ad-who">{PICON[c.platform] || '🎬'} {adWho(c, contacts)}</span>
        {st === 'live' ? <span className="ad-badge live">● Yayında</span> : st === 'soon' ? <span className="ad-badge">Yaklaşan</span> : st === 'iptal' ? <span className="ad-badge">İptal</span> : <span className="ad-badge muted">Bitti</span>}
      </span>
      <span className="ad-title">{c.title || 'Reklam'}</span>
      <span className="ad-meta">
        {c.brand ? <span>{c.brand}</span> : null}
        {c.marketplace ? <span className="tag"><span className="dot" style={{ background: mpColor(c.marketplace) }} />{c.marketplace}</span> : null}
        {hasPct(c) ? <span className="ad-pct">{pct(c.commission)} komisyon</span> : null}
        {c.fee ? <span>{tl(c.fee)}</span> : null}
      </span>
      {s ? (
        <span className="ad-time">
          <span>{when(s, now)}</span><span className="arrow">→</span><span>{e ? when(e, now) : '—'}</span>
        </span>
      ) : null}
      {st === 'live' ? (
        <>
          <span className="ad-bar"><span style={{ width: Math.round(p * 100) + '%' }} /></span>
          <span className="ad-count">Bitmesine <b>{dur(e - now)}</b></span>
        </>
      ) : st === 'soon' ? <span className="ad-count">Başlamasına <b>{dur(s - now)}</b></span> : null}
    </button>
  );
}

export function AdsView({ data, now, actions }) {
  const every = (data.collabs || []).filter((c) => adStart(c));
  const [fPct, setFPct] = useState('');
  const [fMp, setFMp] = useState('');
  const pcts = [...new Set(every.filter(hasPct).map((c) => Number(c.commission)))].sort((a, b) => a - b);
  const mps = MARKETPLACES.map((m) => m.name).filter((n) => every.some((c) => c.marketplace === n));
  const filtering = fPct !== '' || fMp !== '';
  const all = every.filter((c) => (fPct === '' || (fPct === 'yok' ? !hasPct(c) : hasPct(c) && Number(c.commission) === Number(fPct))) && (!fMp || c.marketplace === fMp));
  const live = all.filter((c) => adStatus(c, now) === 'live').sort((a, b) => adEnd(a) - adEnd(b));
  const soon = all.filter((c) => adStatus(c, now) === 'soon').sort((a, b) => adStart(a) - adStart(b));
  const past = all.filter((c) => ['past', 'iptal'].includes(adStatus(c, now))).sort((a, b) => adStart(b) - adStart(a)).slice(0, filtering ? 300 : 40);
  const [showPast, setShowPast] = useState(false);
  const mk = toDateInput(now).slice(0, 7), yk = mk.slice(0, 4);
  const valid = all.filter((c) => c.status !== 'iptal');
  const month = valid.filter((c) => toDateInput(adStart(c)).startsWith(mk));
  const year = valid.filter((c) => toDateInput(adStart(c)).startsWith(yk));
  const sumFee = (xs) => xs.reduce((s, c) => s + (Number(c.fee) || 0), 0);
  const budget = sumFee(month);
  const card = (c) => <AdCard key={c.id} c={c} now={now} contacts={data.contacts} onOpen={actions.openCollab} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {pcts.length || mps.length > 1 ? (
        <div className="ad-filters">
          {pcts.length ? (
            <div className="typechips" role="group" aria-label="Komisyona göre">
              <span className="ad-flabel">Komisyon</span>
              <button type="button" className={'chip' + (fPct === '' ? ' on' : '')} aria-pressed={fPct === ''} onClick={() => setFPct('')}>Tümü</button>
              {pcts.map((v) => <button key={v} type="button" className={'chip' + (Number(fPct) === v && fPct !== '' ? ' on' : '')} aria-pressed={Number(fPct) === v && fPct !== ''} onClick={() => setFPct(String(v))}>{pct(v)}</button>)}
              {every.some((c) => !hasPct(c)) ? <button type="button" className={'chip' + (fPct === 'yok' ? ' on' : '')} aria-pressed={fPct === 'yok'} onClick={() => setFPct('yok')}>Girilmemiş</button> : null}
            </div>
          ) : null}
          {mps.length > 1 ? (
            <div className="typechips" role="group" aria-label="Pazaryerine göre">
              <span className="ad-flabel">Pazaryeri</span>
              <button type="button" className={'chip' + (!fMp ? ' on' : '')} aria-pressed={!fMp} onClick={() => setFMp('')}>Tümü</button>
              {mps.map((n) => <button key={n} type="button" className={'chip' + (fMp === n ? ' on' : '')} aria-pressed={fMp === n} onClick={() => setFMp(n)}><span className="dot" style={{ background: mpColor(n) }} />{n}</button>)}
            </div>
          ) : null}
        </div>
      ) : null}
      {filtering ? (
        <div className="ad-result card">
          <span className="ad-rlabel">{[fPct === 'yok' ? 'Komisyon girilmemiş' : fPct !== '' ? pct(fPct) + ' komisyon' : '', fMp].filter(Boolean).join(' · ')}</span>
          <div className="ad-sum">
            <div><span className="rv-k">Toplam reklam</span><span className="rp-v">{valid.length}</span></div>
            <div><span className="rv-k">Bu yıl</span><span className="rp-v">{year.length}</span></div>
            <div><span className="rv-k">Bütçe</span><span className="rp-v">{sumFee(valid) ? tlShort(sumFee(valid)) : '—'}</span></div>
          </div>
          <button type="button" className="linkbtn" onClick={() => { setFPct(''); setFMp(''); }}>Filtreyi temizle</button>
        </div>
      ) : (
        <div className="ad-sum card">
          <div><span className="rv-k">Yayında</span><span className="rp-v">{live.length}</span></div>
          <div><span className="rv-k">Yaklaşan</span><span className="rp-v">{soon.length}</span></div>
          <div><span className="rv-k">Bu ay bütçe</span><span className="rp-v">{budget ? tlShort(budget) : '—'}</span></div>
        </div>
      )}
      <button type="button" className="btn primary big" onClick={() => actions.openCollab({})}>+ Reklam ekle</button>
      <Section title="Yayında" meta={live.length ? 'bitişe göre' : ''}>
        {live.length ? <div className="ad-grid">{live.map(card)}</div>
          : <div className="card"><p className="empty">{filtering ? 'Bu filtrede yayında reklam yok.' : 'Şu an yayında reklam yok.'}</p></div>}
      </Section>
      <Section title="Yaklaşan" meta={soon.length ? soon.length + ' reklam' : ''}>
        {soon.length ? <div className="ad-grid">{soon.map(card)}</div>
          : <div className="card"><p className="empty">{filtering ? 'Bu filtrede yaklaşan reklam yok.' : 'Planlanmış reklam yok.'}</p></div>}
      </Section>
      {past.length ? (
        <Section title="Bitenler" action={filtering ? null : <button type="button" className="linkbtn" onClick={() => setShowPast(!showPast)}>{showPast ? 'Gizle' : 'Göster (' + past.length + ')'}</button>} meta={filtering ? past.length + ' reklam' : ''}>
          {showPast || filtering ? <div className="ad-grid">{past.map(card)}</div> : null}
        </Section>
      ) : null}
    </div>
  );
}

// Bugün sayfası: yayındakiler ve bugün başlayanlar
export function AdsTodayCard({ data, now, actions, onAll }) {
  const all = (data.collabs || []).filter((c) => adStart(c));
  const live = all.filter((c) => adStatus(c, now) === 'live').sort((a, b) => adEnd(a) - adEnd(b));
  const today = all.filter((c) => adStatus(c, now) === 'soon' && adStart(c) < addDays(startOfDay(now), 1)).sort((a, b) => adStart(a) - adStart(b));
  if (!live.length && !today.length) return null;
  const meta = [live.length ? live.length + ' yayında' : '', today.length ? today.length + ' bugün başlıyor' : ''].filter(Boolean).join(', ');
  const list = [...live, ...today];
  return (
    <Section title="Influencer reklamları" meta={meta} action={<button type="button" className="linkbtn" onClick={onAll}>Tümü</button>}>
      <div className="card adt">
        {list.slice(0, 4).map((c) => {
          const st = adStatus(c, now);
          const s = adStart(c), e = adEnd(c);
          const p = st === 'live' ? Math.min(1, Math.max(0, (now - s) / Math.max(1, e - s))) : 0;
          const name = c.handle || c.title || adWho(c, data.contacts);
          const sub = c.handle ? c.title : null;
          const soonEnd = st === 'live' && e - now < 6 * 3600000;
          return (
            <button key={c.id} type="button" className={'adt-row' + (st === 'live' ? ' live' : ' soon') + (soonEnd ? ' ending' : '')} style={c.marketplace ? { '--mp': mpColor(c.marketplace) } : undefined} onClick={() => actions.openCollab(c)}>
              <span className="adt-main">
                <span className="adt-name"><span className="adt-pi" aria-hidden="true">{PICON[c.platform] || '🎬'}</span>{name}</span>
                {sub ? <span className="adt-sub">{sub}</span> : null}
                <span className="adt-tags">
                  {c.marketplace ? <span className="adt-mp">{c.marketplace}</span> : null}
                  {hasPct(c) ? <span className="adt-pct">{pct(c.commission)}</span> : null}
                  {c.brand ? <span className="adt-brand">{c.brand}</span> : null}
                </span>
              </span>
              <span className="adt-side">
                <span className="adt-state">{st === 'live' ? <><i aria-hidden="true" />Yayında</> : 'Bugün ' + fmtTime(s)}</span>
                <span className="adt-left">{st === 'live' ? dur(e - now) : dur(s - now)}</span>
                <span className="adt-when">{st === 'live' ? 'kaldı · ' + when(e, now) : 'sonra başlıyor'}</span>
                {st === 'live' ? <span className="adt-bar" aria-hidden="true"><span style={{ width: Math.round(p * 100) + '%' }} /></span> : null}
              </span>
            </button>
          );
        })}
        {list.length > 4 ? <button type="button" className="adt-more" onClick={onAll}>+{list.length - 4} reklam daha</button> : null}
      </div>
    </Section>
  );
}

export function AdSheet({ initial, collabs, contacts, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const s0 = adStart(initial), e0 = initial.end_at ? new Date(initial.end_at) : null;
  const now = new Date();
  const defStart = (() => { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
  const [title, setTitle] = useState(initial.title || '');
  const [handle, setHandle] = useState(initial.handle || (initial.contact_id ? adWho(initial, contacts) : ''));
  const [platform, setPlatform] = useState(initial.platform || 'Instagram');
  const [brand, setBrand] = useState(initial.brand || '');
  const [mp, setMp] = useState(initial.marketplace || '');
  const [sDate, setSDate] = useState(toDateInput(s0 || defStart));
  const [sTime, setSTime] = useState(initial.start_at ? toTimeInput(s0) : s0 ? '10:00' : toTimeInput(defStart));
  const [eDate, setEDate] = useState(e0 ? toDateInput(e0) : toDateInput(addDays(s0 || defStart, 1)));
  const [eTime, setETime] = useState(e0 ? toTimeInput(e0) : initial.start_at ? toTimeInput(s0) : toTimeInput(defStart));
  const [comm, setComm] = useState(hasPct(initial) ? String(Number(initial.commission)).replace('.', ',') : '');
  const [fee, setFee] = useState(initial.fee ? Number(initial.fee).toLocaleString('tr-TR') : '');
  const [link, setLink] = useState(initial.link || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [cancel, setCancel] = useState(initial.status === 'iptal');
  const a0 = normAlerts(initial.alerts || { list: ['30m', '0'], at: '09:00' });
  const [alerts, setAlerts] = useState(a0);
  const [endAlert, setEndAlert] = useState(initial.alerts ? initial.alerts.end !== false : true);
  const [busy, setBusy] = useState(false);
  const start = combine(sDate, sTime), end = combine(eDate, eTime);
  const bad = !(end > start);
  const setLen = (h) => { const e = new Date(start.getTime() + h * 3600000); setEDate(toDateInput(e)); setETime(toTimeInput(e)); };
  const lenH = Math.round((end - start) / 3600000);
  const commNum = comm.trim() === '' ? null : Number(comm.replace('%', '').replace(',', '.').trim());
  const commBad = commNum != null && (!Number.isFinite(commNum) || commNum < 0 || commNum > 100);
  const commVal = commBad ? null : commNum;
  // Daha önce kullanılan oranlar + sık kullanılanlar
  const commChoices = useMemo(() => [...new Set([10, 15, 20, 25, 30, ...(collabs || []).filter(hasPct).map((c) => Number(c.commission))])].sort((a, b) => a - b).slice(0, 8), [collabs]);
  // Önceki hesaplar (öneri)
  const handles = useMemo(() => {
    const seen = new Set();
    return [...(collabs || [])].sort((x, y) => (y.created_at || '').localeCompare(x.created_at || '')).map((c) => c.handle).filter((h) => h && !seen.has(h) && seen.add(h)).slice(0, 6);
  }, [collabs]);
  const submit = async (ev) => {
    ev.preventDefault();
    if (busy || bad || commBad) return;
    setBusy(true);
    let h = handle.trim();
    if (h && !h.startsWith('@') && !/\s/.test(h) && !/^https?:/.test(h)) h = '@' + h;
    try {
      await onSave({
        id: initial.id, title: title.trim() || null, handle: h || null, platform, brand: brand || null, marketplace: mp || null,
        start_at: start.toISOString(), end_at: end.toISOString(), publish_date: sDate,
        fee: parseTL(fee) || null, commission: commVal, link: link.trim() || null, notes: notes.trim() || null,
        status: cancel ? 'iptal' : (initial.status && initial.status !== 'iptal' ? initial.status : 'planlandi'),
        alerts: { ...alerts, end: endAlert }
      });
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={isEdit ? 'Influencer reklamı' : 'Yeni influencer reklamı'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="ad-title">Reklam</label>
          <input id="ad-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Serum Reels, 3 story, indirim kodu paylaşımı" />
        </div>
        <div className="field">
          <label htmlFor="ad-handle">Hesap (isteğe bağlı)</label>
          <input id="ad-handle" type="text" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@kullaniciadi" autoCapitalize="off" />
          {handles.length ? <div className="typechips" style={{ marginTop: 6 }}>{handles.map((x) => <button key={x} type="button" className={'chip' + (handle === x ? ' on' : '')} onClick={() => setHandle(x)}>{x}</button>)}</div> : null}
        </div>
        <div className="typechips" role="group" aria-label="Platform">
          {PLATFORMS.map((p) => <button key={p} type="button" className={'chip' + (platform === p ? ' on' : '')} aria-pressed={platform === p} onClick={() => setPlatform(p)}>{PICON[p]} {p}</button>)}
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="ad-sdate">Başlangıç</label>
            <input id="ad-sdate" type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="ad-stime">Saat</label>
            <input id="ad-stime" type="time" value={sTime} onChange={(e) => setSTime(e.target.value)} required />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="ad-edate">Bitiş</label>
            <input id="ad-edate" type="date" value={eDate} min={sDate} onChange={(e) => setEDate(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="ad-etime">Saat</label>
            <input id="ad-etime" type="time" value={eTime} onChange={(e) => setETime(e.target.value)} required aria-invalid={bad} />
          </div>
        </div>
        <div className="typechips" role="group" aria-label="Süre">
          {[[24, '24 saat'], [48, '2 gün'], [72, '3 gün'], [168, '7 gün'], [336, '14 gün']].map(([h, l]) => <button key={h} type="button" className={'chip' + (lenH === h ? ' on' : '')} aria-pressed={lenH === h} onClick={() => setLen(h)}>{l}</button>)}
        </div>
        {bad ? <span className="hint" style={{ color: 'var(--danger)', marginTop: -6 }}>Bitiş, başlangıçtan sonra olmalı.</span> : <span className="hint" style={{ marginTop: -6 }}>Süre: {dur(end - start)}</span>}
        <div className="row2">
          <div className="field">
            <label htmlFor="ad-brand">Marka</label>
            <select id="ad-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Yok</option>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ad-mp">Pazaryeri</label>
            <select id="ad-mp" value={mp} onChange={(e) => setMp(e.target.value)}>
              <option value="">Yok</option>
              {MARKETPLACES.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ad-comm">Komisyon oranı (%)</label>
          <input id="ad-comm" type="text" inputMode="decimal" value={comm} onChange={(e) => setComm(e.target.value)} placeholder="Örn. 20" aria-invalid={commBad} style={{ maxWidth: 160 }} />
          <div className="typechips" style={{ marginTop: 6 }} role="group" aria-label="Hazır oranlar">
            {commChoices.map((v) => <button key={v} type="button" className={'chip' + (commNum === v ? ' on' : '')} aria-pressed={commNum === v} onClick={() => setComm(commNum === v ? '' : String(v).replace('.', ','))}>{pct(v)}</button>)}
          </div>
          {commBad ? <span className="hint" style={{ color: 'var(--danger)' }}>0 ile 100 arasında bir oran yaz.</span> : null}
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="ad-fee">Bütçe (₺)</label>
            <input id="ad-fee" type="text" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="—" />
          </div>
          <div className="field">
            <label htmlFor="ad-link">Link</label>
            <input id="ad-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" autoCapitalize="off" />
          </div>
        </div>
        {link && /^https?:\/\//.test(link) ? <a className="linkbtn" href={link} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start', marginTop: -6 }}>Paylaşımı aç ↗</a> : null}
        <AlertPicker id="ad-al" title="Başlangıcı hatırlat" value={alerts} onChange={setAlerts} mode="timed" />
        <label className="wl-check">
          <input type="checkbox" checked={endAlert} onChange={(e) => setEndAlert(e.target.checked)} />
          <span>Bitişi de hatırlat (1 saat kala ve bittiğinde)</span>
        </label>
        <div className="field">
          <label htmlFor="ad-notes">Not</label>
          <input id="ad-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="İndirim kodu, brief, hedef…" />
        </div>
        {isEdit ? (
          <label className="wl-check">
            <input type="checkbox" checked={cancel} onChange={(e) => setCancel(e.target.checked)} />
            <span>İptal edildi (takvimden kaldırılır)</span>
          </label>
        ) : null}
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || bad || commBad}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}
