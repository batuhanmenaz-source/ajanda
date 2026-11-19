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

const DAY = 86400000;
// Tekrarlı reklam: platform her dönem bitince aynı reklamı yeniden açar (ör. 7 günde bir).
// runs = [{ s, e, fee, rev }] dönemler; renew = otomatik yenileniyor (sonlandırılana kadar yeni dönemler eklenir)
export const isRepeat = (c) => Array.isArray(c.runs) && c.runs.length > 0;
export const runStep = (s, e) => Math.max(1, Math.round((e - s) / DAY)) * DAY;
export function adRuns(c, now = new Date()) {
  if (!isRepeat(c)) return null;
  const list = c.runs.map((r, i) => ({ ...r, i, s: new Date(r.s), e: new Date(r.e) })).sort((a, b) => a.s - b.s);
  if (c.renew && c.status !== 'iptal') {
    let guard = 0;
    while (list[list.length - 1].e < now && guard++ < 200) {
      const l = list[list.length - 1];
      const st = runStep(l.s, l.e);
      list.push({ s: new Date(l.s.getTime() + st), e: new Date(l.e.getTime() + st), fee: null, rev: null, i: list.length, auto: true });
    }
  }
  return list.map((r, i) => ({ ...r, n: i + 1 }));
}
// Şu anki (ya da sıradaki / son) dönem
export function adRunNow(c, now = new Date()) {
  const rs = adRuns(c, now);
  if (!rs) return null;
  return rs.find((r) => r.s <= now && now <= r.e) || rs.find((r) => r.s > now) || rs[rs.length - 1];
}
// Kart ve sayaçlar için zaman penceresi: tekrarlıda içinde bulunulan dönem
export function adWindow(c, now = new Date()) {
  const r = adRunNow(c, now);
  if (r) return { s: r.s, e: r.e, run: r.n, runs: adRuns(c, now).length };
  return { s: adStart(c), e: adEnd(c) };
}
const sumOf = (xs, k) => xs.reduce((t, r) => t + (Number(r[k]) || 0), 0);
// Raporlar / Excel: tekrarlı reklamı dönemlerine ayır (her dönem kendi tarihi, bütçesi, cirosuyla)
export function expandRuns(list, now = new Date()) {
  const out = [];
  (list || []).forEach((c) => {
    const rs = adRuns(c, now);
    if (!rs) { out.push(c); return; }
    rs.forEach((r) => out.push({ ...c, id: c.id + '#' + r.n, start_at: r.s.toISOString(), end_at: r.e.toISOString(), publish_date: toDateInput(r.s), fee: r.fee || null, ad_revenue: r.rev || null, runs: null, run: r.n, runCount: rs.length }));
  });
  return out;
}

// Başlangıç / bitiş (eski kayıtlarda yalnız yayın günü var: o günün tamamı)
export function adStart(c) {
  if (isRepeat(c)) return new Date(adRuns(c)[0].s);
  if (c.start_at) return new Date(c.start_at);
  if (c.publish_date) return combine(c.publish_date, '00:00');
  return null;
}
export function adEnd(c, now = new Date()) {
  if (isRepeat(c)) { const rs = adRuns(c, now); return new Date(rs[rs.length - 1].e); }
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
export const hasPct2 = (c) => c.commission2 != null && c.commission2 !== '';
// Filtre / rapor anahtarı: "20" ya da doğrudan+dolaylı "30/20"
export const commKey = (c) => (hasPct(c) ? String(Number(c.commission)) + (hasPct2(c) ? '/' + Number(c.commission2) : '') : '');
export const commText = (k, long) => {
  if (!k) return 'Girilmemiş';
  const [a, b] = k.split('/');
  if (b == null) return pct(a) + (long ? ' komisyon' : '');
  return long ? pct(a) + ' doğrudan · ' + pct(b) + ' dolaylı' : pct(a) + ' / ' + pct(b);
};
// Bitmiş ama cirosu girilmemiş dönem / reklam sayısı
export function revMissing(c, now = new Date()) {
  if (c.status === 'iptal') return 0;
  const rs = adRuns(c, now);
  if (rs) return rs.filter((r) => r.e < now && !(Number(r.rev) > 0)).length;
  return adStatus(c, now) === 'past' && !(Number(c.ad_revenue) > 0) ? 1 : 0;
}
// Tekrarlıda toplamlar dönemlerden
export const adFee = (c) => (isRepeat(c) ? sumOf(c.runs, 'fee') : Number(c.fee) || 0);
export const adRev = (c) => (isRepeat(c) ? sumOf(c.runs, 'rev') : Number(c.ad_revenue) || 0);
const mpStyle = (c) => (c.marketplace ? { '--mp': mpColor(c.marketplace) } : undefined);

function AdCard({ c, now, contacts, onOpen }) {
  const st = adStatus(c, now);
  const w = adWindow(c, now);
  const s = w.s, e = w.e;
  const rep = isRepeat(c);
  const inRun = st === 'live' && (!rep || (s <= now && now <= e));
  const p = inRun ? Math.min(1, Math.max(0, (now - s) / Math.max(1, e - s))) : 0;
  const fee = adFee(c), rev = adRev(c), miss = revMissing(c, now);
  return (
    <button type="button" className={'card ad ad-' + st + (c.marketplace ? ' has-mp' : '')} style={mpStyle(c)} onClick={() => onOpen(c)}>
      <span className="ad-top">
        <span className="ad-who">{PICON[c.platform] || '🎬'} {adWho(c, contacts)}</span>
        {st === 'live' ? <span className="ad-badge live">● Yayında</span> : st === 'soon' ? <span className="ad-badge">Yaklaşan</span> : st === 'iptal' ? <span className="ad-badge">İptal</span> : <span className="ad-badge muted">{rep ? 'Sonlandı' : 'Bitti'}</span>}
      </span>
      <span className="ad-title">{c.title || 'Reklam'}</span>
      <span className="ad-meta">
        {rep ? <span className="ad-rep">🔁 {w.runs} dönem</span> : null}
        {c.brand ? <span>{c.brand}</span> : null}
        {c.marketplace ? <span className="tag"><span className="dot" style={{ background: mpColor(c.marketplace) }} />{c.marketplace}</span> : null}
        {hasPct(c) ? <span className="ad-pct">{commText(commKey(c))} komisyon</span> : null}
        {fee ? <span>{tl(fee)}{rep ? ' toplam' : ''}</span> : null}
      </span>
      {st === 'past' || (rep && rev > 0) ? (
        rev > 0
          ? <span className="ad-out"><span>{rep ? 'Toplam ciro' : 'Ciro'} <b>{tl(rev)}</b></span>{fee > 0 ? <span className="ad-roas">{(rev / fee).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}x</span> : null}</span>
          : null
      ) : null}
      {miss ? <span className="ad-out missing">{rep ? miss + ' dönemin cirosu girilmedi · dokun ve ekle' : 'Ciro girilmedi · dokun ve ekle'}</span> : null}
      {s ? (
        <span className="ad-time">
          {rep ? <span className="ad-runno">{w.run}. dönem</span> : null}
          <span>{when(s, now)}</span><span className="arrow">→</span><span>{e ? when(e, now) : '—'}</span>
        </span>
      ) : null}
      {inRun ? (
        <>
          <span className="ad-bar"><span style={{ width: Math.round(p * 100) + '%' }} /></span>
          <span className="ad-count">{rep ? 'Bu dönemin bitmesine' : 'Bitmesine'} <b>{dur(e - now)}</b>{rep && c.renew ? ' · sonra yenilenir' : ''}</span>
        </>
      ) : st === 'soon' || (st === 'live' && s > now) ? <span className="ad-count">Başlamasına <b>{dur(s - now)}</b></span> : null}
    </button>
  );
}

export function AdsView({ data, now, actions }) {
  const every = (data.collabs || []).filter((c) => adStart(c));
  const [fPct, setFPct] = useState('');
  const [fMp, setFMp] = useState('');
  const pcts = [...new Set(every.filter(hasPct).map(commKey))].sort((a, b) => parseFloat(a) - parseFloat(b) || a.length - b.length);
  const mps = MARKETPLACES.map((m) => m.name).filter((n) => every.some((c) => c.marketplace === n));
  const filtering = fPct !== '' || fMp !== '';
  const all = every.filter((c) => (fPct === '' || (fPct === 'yok' ? !hasPct(c) : commKey(c) === fPct)) && (!fMp || c.marketplace === fMp));
  const live = all.filter((c) => adStatus(c, now) === 'live').sort((a, b) => adWindow(a, now).e - adWindow(b, now).e);
  const soon = all.filter((c) => adStatus(c, now) === 'soon').sort((a, b) => adStart(a) - adStart(b));
  const past = all.filter((c) => ['past', 'iptal'].includes(adStatus(c, now))).sort((a, b) => adStart(b) - adStart(a)).slice(0, filtering ? 300 : 40);
  const [showPast, setShowPast] = useState(false);
  const noRev = all.reduce((t, c) => t + revMissing(c, now), 0);
  const mk = toDateInput(now).slice(0, 7), yk = mk.slice(0, 4);
  const valid = all.filter((c) => c.status !== 'iptal');
  const runsAll = expandRuns(valid, now);
  const month = runsAll.filter((c) => toDateInput(adStart(c)).startsWith(mk));
  const year = runsAll.filter((c) => toDateInput(adStart(c)).startsWith(yk));
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
              {pcts.map((v) => <button key={v} type="button" className={'chip' + (fPct === v ? ' on' : '')} aria-pressed={fPct === v} onClick={() => setFPct(v)}>{commText(v)}</button>)}
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
          <span className="ad-rlabel">{[fPct === 'yok' ? 'Komisyon girilmemiş' : fPct !== '' ? commText(fPct, true) : '', fMp].filter(Boolean).join(' · ')}</span>
          <div className="ad-sum">
            <div><span className="rv-k">Toplam reklam</span><span className="rp-v">{valid.length}</span>{runsAll.length > valid.length ? <span className="rp-s">{runsAll.length} dönem</span> : null}</div>
            <div><span className="rv-k">Bu yıl</span><span className="rp-v">{year.length}</span></div>
            <div><span className="rv-k">Bütçe</span><span className="rp-v">{sumFee(runsAll) ? tlShort(sumFee(runsAll)) : '—'}</span></div>
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
      <div className="ad-actions">
        <button type="button" className="btn primary big" onClick={() => actions.openCollab({})}>+ Reklam ekle</button>
        <button type="button" className="btn big" onClick={() => actions.exportAds({ ads: expandRuns(all.filter((c) => c.status !== 'iptal'), now), contacts: data.contacts, label: [fPct === 'yok' ? 'komisyonsuz' : fPct !== '' ? '%' + fPct.replace('/', '-') : '', fMp].filter(Boolean).join('-') || 'tum' })}>⬇ Excel</button>
      </div>
      {noRev ? <button type="button" className="ad-norev" onClick={() => { setShowPast(true); setTimeout(() => document.querySelector('.ad-out.missing')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }}>📝 Biten {noRev} reklamın cirosu girilmedi. Girersen raporda reklam başına ciro görünür.</button> : null}
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
export function AdsTodayCard({ data, now, actions, onAll, showEmpty }) {
  const all = (data.collabs || []).filter((c) => adStart(c));
  const live = all.filter((c) => adStatus(c, now) === 'live').sort((a, b) => adWindow(a, now).e - adWindow(b, now).e);
  const today = all.filter((c) => adStatus(c, now) === 'soon' && adStart(c) < addDays(startOfDay(now), 1)).sort((a, b) => adStart(a) - adStart(b));
  if (!live.length && !today.length) return null; // boşken yer kaplamasın (yeni reklam Influencer sekmesinden ya da + ile)
  const meta = [live.length ? live.length + ' yayında' : '', today.length ? today.length + ' bugün başlıyor' : ''].filter(Boolean).join(' · ');
  const list = [...live, ...today];
  return (
    <Section title="Influencer reklamları" meta={meta} tone="#0C8599" action={<button type="button" className="linkbtn" onClick={onAll}>Tümü</button>} onAdd={() => actions.quickNew('ad')} addLabel="Yeni reklam">
      <div className={'adt-grid' + (list.length === 1 ? ' one' : '')}>
        {list.slice(0, 4).map((c) => {
          const st = adStatus(c, now);
          const w = adWindow(c, now);
          const s = w.s, e = w.e;
          const p = st === 'live' ? Math.min(1, Math.max(0, (now - s) / Math.max(1, e - s))) : 0;
          const name = c.handle || c.title || adWho(c, data.contacts);
          const sub = c.handle ? c.title : null;
          const soonEnd = st === 'live' && e - now < 6 * 3600000;
          return (
            <button key={c.id} type="button" className={'adt-tile' + (st === 'live' ? ' live' : ' soon') + (soonEnd ? ' ending' : '')} style={c.marketplace ? { '--mp': mpColor(c.marketplace) } : undefined} onClick={() => actions.openCollab(c)}>
              <span className="adt-state">{st === 'live' ? <><i aria-hidden="true" />Yayında</> : 'Bugün ' + fmtTime(s)}</span>
              <span className="adt-name"><span className="adt-pi" aria-hidden="true">{PICON[c.platform] || '🎬'}</span>{name}</span>
              {sub ? <span className="adt-sub">{sub}</span> : null}
              <span className="adt-tags">
                {c.marketplace ? <span className="adt-mp">{c.marketplace}</span> : null}
                {hasPct(c) ? <span className="adt-pct">{commText(commKey(c))}</span> : null}
                {w.run ? <span className="adt-rep">🔁 {w.run}. dönem</span> : null}
                {c.brand ? <span className="adt-brand">{c.brand}</span> : null}
              </span>
              <span className="adt-foot">
                <span className="adt-left">{st === 'live' ? dur(e - now) : dur(s - now)}</span>
                <span className="adt-when">{st === 'live' ? 'kaldı · ' + when(e, now) : 'sonra başlıyor'}</span>
              </span>
              <span className="adt-bar" aria-hidden="true"><span style={{ width: Math.round(p * 100) + '%' }} /></span>
            </button>
          );
        })}
      </div>
      {list.length > 4 ? <button type="button" className="linkbtn adt-more" onClick={onAll}>+{list.length - 4} reklam daha</button> : null}
    </Section>
  );
}

// "19 Kas – 25 Kas": gece yarısında biten dönemde bir önceki gün yazılır
const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dm = (d) => d.getDate() + ' ' + MON[d.getMonth()];
export function runRange(s, e) {
  const ee = e.getHours() === 0 && e.getMinutes() === 0 && e - s >= DAY ? new Date(e.getTime() - 60000) : e;
  return dm(s) + ' – ' + dm(ee);
}

export function AdSheet({ initial, collabs, contacts, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const now = new Date();
  const runs0 = adRuns(initial, now);
  const s0 = adStart(initial), e0 = runs0 ? runs0[0].e : initial.end_at ? new Date(initial.end_at) : null;
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
  const [two, setTwo] = useState(hasPct2(initial));
  const [comm2, setComm2] = useState(hasPct2(initial) ? String(Number(initial.commission2)).replace('.', ',') : '');
  const [repeat, setRepeat] = useState(!!runs0);
  const [renew, setRenew] = useState(runs0 ? !!initial.renew : true);
  const money = (v) => (Number(v) > 0 ? Number(v).toLocaleString('tr-TR') : '');
  const [vals, setVals] = useState(() => (runs0 || []).map((r) => ({ fee: money(r.fee), rev: money(r.rev) })));
  const [nRuns, setNRuns] = useState(runs0 ? runs0.length : 1);
  const [rev, setRev] = useState(initial.ad_revenue ? Number(initial.ad_revenue).toLocaleString('tr-TR') : '');
  const ended = !!initial.id && adEnd(initial) && adEnd(initial) < new Date();
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
  const comm2Num = !two || comm2.trim() === '' ? null : Number(comm2.replace('%', '').replace(',', '.').trim());
  const comm2Bad = comm2Num != null && (!Number.isFinite(comm2Num) || comm2Num < 0 || comm2Num > 100);
  // Tekrarlı: dönemler ilk dönemin uzunluğuyla art arda
  const step = runStep(start, end);
  const needed = (() => { if (!repeat || !renew || bad) return 1; let k = 1; while (end.getTime() + (k - 1) * step < now.getTime() && k < 200) k++; return k; })();
  const nEff = Math.max(nRuns, needed);
  const periods = repeat && !bad ? Array.from({ length: nEff }, (_, i) => ({ s: new Date(start.getTime() + i * step), e: new Date(end.getTime() + i * step), v: vals[i] || { fee: '', rev: '' } })) : [];
  const setVal = (i, k, v) => setVals((xs) => { const ys = [...xs]; while (ys.length <= i) ys.push({ fee: '', rev: '' }); ys[i] = { ...ys[i], [k]: v }; return ys; });
  const totFee = periods.reduce((t, p) => t + (parseTL(p.v.fee) || 0), 0);
  const totRev = periods.reduce((t, p) => t + (parseTL(p.v.rev) || 0), 0);
  const toggleRepeat = (on) => {
    setRepeat(on);
    if (on && lenH < 168) setLen(168);
  };
  // Daha önce kullanılan oranlar + sık kullanılanlar
  const commChoices = useMemo(() => [...new Set([10, 15, 20, 25, 30, ...(collabs || []).filter(hasPct).map((c) => Number(c.commission))])].sort((a, b) => a - b).slice(0, 8), [collabs]);
  // Önceki hesaplar (öneri)
  const handles = useMemo(() => {
    const seen = new Set();
    return [...(collabs || [])].sort((x, y) => (y.created_at || '').localeCompare(x.created_at || '')).map((c) => c.handle).filter((h) => h && !seen.has(h) && seen.add(h)).slice(0, 6);
  }, [collabs]);
  const submit = async (ev) => {
    ev.preventDefault();
    if (busy || bad || commBad || comm2Bad) return;
    setBusy(true);
    let h = handle.trim();
    if (h && !h.startsWith('@') && !/\s/.test(h) && !/^https?:/.test(h)) h = '@' + h;
    try {
      await onSave({
        id: initial.id, title: title.trim() || null, handle: h || null, platform, brand: brand || null, marketplace: mp || null,
        ...(repeat ? {
          start_at: start.toISOString(), end_at: periods[periods.length - 1].e.toISOString(), publish_date: sDate,
          runs: periods.map((p) => ({ s: p.s.toISOString(), e: p.e.toISOString(), fee: parseTL(p.v.fee) || null, rev: parseTL(p.v.rev) || null })),
          renew, fee: totFee || null, ad_revenue: totRev || null
        } : {
          start_at: start.toISOString(), end_at: end.toISOString(), publish_date: sDate, runs: null, renew: false,
          fee: parseTL(fee) || null, ad_revenue: parseTL(rev) || null
        }),
        commission: commVal, commission2: two && commVal != null ? comm2Num : null, link: link.trim() || null, notes: notes.trim() || null,
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
            <label htmlFor="ad-sdate">{repeat ? 'İlk dönem başlangıcı' : 'Başlangıç'}</label>
            <input id="ad-sdate" type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="ad-stime">Saat</label>
            <input id="ad-stime" type="time" value={sTime} onChange={(e) => setSTime(e.target.value)} required />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="ad-edate">{repeat ? 'İlk dönem bitişi' : 'Bitiş'}</label>
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
        {bad ? <span className="hint" style={{ color: 'var(--danger)', marginTop: -6 }}>Bitiş, başlangıçtan sonra olmalı.</span> : <span className="hint" style={{ marginTop: -6 }}>{repeat ? 'Her dönem' : 'Süre'}: {dur(end - start)}</span>}
        <div className={'ad-repeat' + (repeat ? ' on' : '')}>
          <label className="wl-check">
            <input type="checkbox" checked={repeat} onChange={(e) => toggleRepeat(e.target.checked)} />
            <span><b>🔁 Tekrarlı reklam</b><br /><small>Dönem bitince platform aynı reklamı yeniden açıyor. Hepsi tek reklamda toplanır.</small></span>
          </label>
          {repeat && !bad ? (
            <>
              <label className="wl-check">
                <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} />
                <span>Otomatik yenileniyor <small>(reklamı sonlandırınca işareti kaldır)</small></span>
              </label>
              <div className="run-cols" aria-hidden="true"><span>Ödenecek tutar (KDV hariç)</span><span>Reklam cirosu (KDV dahil)</span></div>
              <div className="run-list">
                {periods.map((p, i) => {
                  const rst = now < p.s ? 'Sırada' : now <= p.e ? 'Yayında' : 'Bitti';
                  return (
                    <div key={i} className={'run-row' + (rst === 'Yayında' ? ' live' : '')}>
                      <div className="run-hd">
                        <span className="run-no">{i + 1}. dönem</span>
                        <span className="run-dates">{runRange(p.s, p.e)}</span>
                        <span className={'run-st' + (rst === 'Yayında' ? ' live' : rst === 'Bitti' ? ' done' : '')}>{rst}</span>
                      </div>
                      <div className="run-in">
                        <input type="text" inputMode="decimal" value={p.v.fee} onChange={(e) => setVal(i, 'fee', e.target.value)} placeholder="₺" aria-label={(i + 1) + '. dönem ödenecek tutar, KDV hariç'} />
                        <input type="text" inputMode="decimal" value={p.v.rev} onChange={(e) => setVal(i, 'rev', e.target.value)} placeholder={rst === 'Bitti' ? '₺' : 'Bitince gir'} aria-label={(i + 1) + '. dönem reklam cirosu, KDV dahil'} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="run-tools">
                <button type="button" className="chip" onClick={() => setNRuns(nEff + 1)}>+ Dönem ekle</button>
                {nEff > needed ? <button type="button" className="chip" onClick={() => setNRuns(nEff - 1)}>Son dönemi kaldır</button> : null}
              </div>
              <div className="run-total">
                <span>Toplam ödenecek <b>{totFee ? tl(totFee) : '—'}</b></span>
                <span>Toplam ciro <b>{totRev ? tl(totRev) : '—'}</b></span>
                {totFee > 0 && totRev > 0 ? <span className="ad-roas">{(totRev / totFee).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}x</span> : null}
              </div>
            </>
          ) : null}
        </div>
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
          <label htmlFor="ad-comm">{two ? 'Doğrudan komisyon (%)' : 'Komisyon oranı (%)'}</label>
          <input id="ad-comm" type="text" inputMode="decimal" value={comm} onChange={(e) => setComm(e.target.value)} placeholder="Örn. 20" aria-invalid={commBad} style={{ maxWidth: 160 }} />
          <div className="typechips" style={{ marginTop: 6 }} role="group" aria-label="Hazır oranlar">
            {commChoices.map((v) => <button key={v} type="button" className={'chip' + (commNum === v ? ' on' : '')} aria-pressed={commNum === v} onClick={() => setComm(commNum === v ? '' : String(v).replace('.', ','))}>{pct(v)}</button>)}
          </div>
          {commBad ? <span className="hint" style={{ color: 'var(--danger)' }}>0 ile 100 arasında bir oran yaz.</span> : null}
          <label className="wl-check" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={two} onChange={(e) => setTwo(e.target.checked)} />
            <span>Dolaylı komisyon da var</span>
          </label>
        </div>
        {two ? (
          <div className="field">
            <label htmlFor="ad-comm2">Dolaylı komisyon (%)</label>
            <input id="ad-comm2" type="text" inputMode="decimal" value={comm2} onChange={(e) => setComm2(e.target.value)} placeholder="Örn. 20" aria-invalid={comm2Bad} style={{ maxWidth: 160 }} />
            <div className="typechips" style={{ marginTop: 6 }} role="group" aria-label="Hazır dolaylı oranlar">
              {commChoices.map((v) => <button key={v} type="button" className={'chip' + (comm2Num === v ? ' on' : '')} aria-pressed={comm2Num === v} onClick={() => setComm2(comm2Num === v ? '' : String(v).replace('.', ','))}>{pct(v)}</button>)}
            </div>
            {comm2Bad ? <span className="hint" style={{ color: 'var(--danger)' }}>0 ile 100 arasında bir oran yaz.</span> : null}
            {commVal == null ? <span className="hint">Önce doğrudan komisyonu yaz.</span> : null}
          </div>
        ) : null}
        <div className={repeat ? '' : 'row2'}>
          {repeat ? null : (
          <div className="field">
            <label htmlFor="ad-fee">Bütçe (₺, KDV hariç)</label>
            <input id="ad-fee" type="text" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="—" />
          </div>
          )}
          <div className="field">
            <label htmlFor="ad-link">Link</label>
            <input id="ad-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" autoCapitalize="off" />
          </div>
        </div>
        {repeat ? null : <div className={'ad-result-box' + (ended ? ' ended' : '')}>
          <div className="field">
            <label htmlFor="ad-rev">Reklam cirosu (₺, KDV dahil)</label>
            <input id="ad-rev" type="text" inputMode="decimal" value={rev} onChange={(e) => setRev(e.target.value)} placeholder={ended ? 'Reklam bitti, cirosunu gir' : 'Reklam bitince girebilirsin'} />
          </div>
          {parseTL(rev) > 0 && parseTL(fee) > 0 ? <span className="hint" style={{ margin: 0 }}>Ciro / bütçe: <b>{(parseTL(rev) / parseTL(fee)).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}x</b> (her 1 ₺ bütçeye {tl(parseTL(rev) / parseTL(fee))} ciro)</span> : null}
        </div>}
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
          <button type="submit" className="btn big primary" disabled={busy || bad || commBad || comm2Bad}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}
