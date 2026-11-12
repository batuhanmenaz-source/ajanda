// İş: Bekleyen talepler ve Raporlar
import { useMemo, useState } from 'react';
import { adWho } from './ads.jsx';
import { Sheet, Section, Check } from './ui.jsx';
import { MARKETPLACES, mpColor } from './constants.js';
import { tl, tlShort } from './revenue.jsx';
import { campaignResult } from './life.jsx';
import { campaignWhen } from './screens.jsx';
import { addDays, startOfDay, toDateInput, fromDateInput, fmtShort, daysBetween, MONTHS } from './dates.js';

// ---------- Bekleyenler ----------
export const waitDays = (f, now = new Date()) => daysBetween(fromDateInput(f.since), startOfDay(now));
const level = (n) => (n >= 14 ? 'hi' : n >= 7 ? 'mid' : '');
const waitText = (n) => (n === 0 ? 'bugün istendi' : n + ' gündür bekliyor');

// Kimden ortalama kaç günde dönüş geliyor (tamamlananlardan)
export function responseStats(followups) {
  const by = {};
  (followups || []).filter((f) => f.done && f.done_at).forEach((f) => {
    const k = f.party || f.marketplace || 'Diğer';
    const d = Math.max(0, daysBetween(fromDateInput(f.since), fromDateInput(f.done_at)));
    (by[k] = by[k] || []).push(d);
  });
  return Object.entries(by).map(([party, arr]) => ({ party, n: arr.length, avg: arr.reduce((s, x) => s + x, 0) / arr.length, max: Math.max(...arr) }))
    .sort((a, b) => b.n - a.n);
}

function FollowRow({ f, now, actions, stats }) {
  const n = waitDays(f, now);
  const st = stats && stats.find((s) => s.party === (f.party || f.marketplace || 'Diğer'));
  return (
    <div className="row fup">
      <Check on={false} onClick={() => actions.doneFollowup(f)} label={f.title + ' tamamlandı olarak işaretle'} />
      <button type="button" className="body" onClick={() => actions.openFollowup(f)}>
        <span className="title">{f.title}</span>
        <span className="meta">
          {f.party || f.marketplace ? <span className="tag">{f.marketplace ? <span className="dot" style={{ background: mpColor(f.marketplace) }} /> : null}{f.party || f.marketplace}</span> : null}
          <span>{fmtShort(fromDateInput(f.since))}'den beri</span>
          {f.nudge_days && n < f.nudge_days ? <span>🔔 {f.nudge_days}. günde hatırlat</span> : null}
          {st && st.n >= 2 ? <span>genelde ~{Math.round(st.avg)} günde dönüyor</span> : null}
        </span>
      </button>
      <span className={'fup-age ' + level(n)}><b>{n}</b><small>gün</small></span>
    </div>
  );
}

export function FollowupsView({ data, now, actions, mp }) {
  const all = (data.followups || []).filter((f) => !mp || f.marketplace === mp);
  const open = all.filter((f) => !f.done).sort((a, b) => a.since.localeCompare(b.since));
  const done = all.filter((f) => f.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const stats = responseStats(data.followups);
  const [showDone, setShowDone] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="hint" style={{ margin: 0, flex: '1 1 220px' }}>Tarih vermeden takip ettiğin talepler: varyant talebi, onay, düzeltme… Kaç gündür beklediği sayılır; 7 günü geçen turuncu, 14 günü geçen kırmızı görünür.</p>
        <button type="button" className="btn primary" onClick={() => actions.openFollowup({ marketplace: mp || null, party: mp || '' })}>+ Bekleyen ekle</button>
      </div>
      <div className="card list">
        {open.length ? open.map((f) => <FollowRow key={f.id} f={f} now={now} actions={actions} stats={stats} />)
          : <p className="empty">Bekleyen talep yok 👌</p>}
      </div>
      {stats.length ? (
        <Section title="Ortalama dönüş süresi" meta="tamamlananlardan">
          <div className="card list">
            {stats.map((s) => (
              <div key={s.party} className="row fup-stat">
                <span className="title">{s.party}</span>
                <span className="meta">{s.n} talep · en uzun {s.max} gün</span>
                <span className="fup-avg">~{Math.round(s.avg)} gün</span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
      {done.length ? (
        <Section title="Tamamlananlar" action={<button type="button" className="linkbtn" onClick={() => setShowDone(!showDone)}>{showDone ? 'Gizle' : 'Göster (' + done.length + ')'}</button>}>
          {showDone ? (
            <div className="card list">
              {done.map((f) => (
                <div key={f.id} className="row fup">
                  <Check on onClick={() => actions.doneFollowup(f)} label={f.title + ' yeniden bekleniyor olarak işaretle'} />
                  <button type="button" className="body" onClick={() => actions.openFollowup(f)}>
                    <span className="title done">{f.title}</span>
                    <span className="meta">{f.party ? <span>{f.party}</span> : null}<span>{Math.max(0, daysBetween(fromDateInput(f.since), fromDateInput(f.done_at || f.since)))} günde döndü</span></span>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

// Bugün sayfası ve pazaryeri paneli için kısa liste
export function FollowupsMini({ data, now, actions, onAll, mp, limit = 3 }) {
  const open = (data.followups || []).filter((f) => !f.done && (!mp || f.marketplace === mp)).sort((a, b) => a.since.localeCompare(b.since));
  if (!open.length) return null;
  const oldest = waitDays(open[0], now);
  return (
    <Section title={'Bekleyenler · ' + open.length} meta={'en eskisi ' + oldest + ' gün'} action={onAll ? <button type="button" className="linkbtn" onClick={onAll}>Tümü</button> : null}>
      <div className="card list">
        {open.slice(0, limit).map((f) => <FollowRow key={f.id} f={f} now={now} actions={actions} />)}
      </div>
    </Section>
  );
}

export function FollowupSheet({ initial, followups, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const [title, setTitle] = useState(initial.title || '');
  const [party, setParty] = useState(initial.party || '');
  const [mp, setMp] = useState(initial.marketplace || '');
  const [since, setSince] = useState(initial.since || toDateInput(new Date()));
  const [note, setNote] = useState(initial.note || '');
  const [nudge, setNudge] = useState(initial.nudge_days ? String(initial.nudge_days) : '');
  const [busy, setBusy] = useState(false);
  // Önceki "kimden"ler ve pazaryerleri öneri olarak
  const recent = useMemo(() => {
    const seen = new Set();
    return [...(followups || [])].sort((a, b) => (b.created_at || b.since || '').localeCompare(a.created_at || a.since || ''))
      .map((f) => f.party).filter((p) => p && !seen.has(p) && seen.add(p)).slice(0, 6);
  }, [followups]);
  const pickParty = (p) => { setParty(p); const m = MARKETPLACES.find((x) => x.name.toLocaleLowerCase('tr-TR') === p.toLocaleLowerCase('tr-TR')); if (m) setMp(m.name); };
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await onSave({ id: initial.id, title: title.trim(), party: party.trim() || null, marketplace: mp || null, since, note: note.trim() || null, nudge_days: nudge ? Number(nudge) : null }); } finally { setBusy(false); }
  };
  const n = daysBetween(fromDateInput(since), startOfDay(new Date()));
  return (
    <Sheet title={isEdit ? 'Bekleyen talep' : 'Yeni bekleyen talep'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="fu-title">Ne bekleniyor?</label>
          <input id="fu-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Varyant talebi" required />
        </div>
        <div className="field">
          <label htmlFor="fu-party">Kimden / nereden?</label>
          <input id="fu-party" type="text" value={party} onChange={(e) => setParty(e.target.value)} placeholder="Örn. Beymen, kategori yöneticisi, ajans" />
          <div className="typechips" style={{ marginTop: 6 }}>
            {[...recent, ...MARKETPLACES.map((m) => m.name).filter((x) => !recent.includes(x))].slice(0, 10).map((p) => (
              <button key={p} type="button" className={'chip' + (party === p ? ' on' : '')} onClick={() => pickParty(p)}>{p}</button>
            ))}
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="fu-mp">Pazaryeri</label>
            <select id="fu-mp" value={mp} onChange={(e) => setMp(e.target.value)}>
              <option value="">Yok</option>
              {MARKETPLACES.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fu-since">İstendiği gün</label>
            <input id="fu-since" type="date" value={since} max={toDateInput(new Date())} onChange={(e) => setSince(e.target.value)} required />
          </div>
        </div>
        <span className="hint" style={{ marginTop: -6 }}>{n > 0 ? n + ' gündür bekliyor' : 'Bugün istendi'}</span>
        <div className="field">
          <label htmlFor="fu-nudge">Hâlâ bekliyorsa hatırlat</label>
          <select id="fu-nudge" value={nudge} onChange={(e) => setNudge(e.target.value)}>
            <option value="">Hatırlatma yok</option>
            {[3, 5, 7, 10, 14].map((d) => <option key={d} value={d}>{d}. günde (saat 10:00)</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fu-note">Not</label>
          <input id="fu-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Talep no, kime yazıldı…" />
        </div>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Raporlar ----------
export const PERIODS = [['bu_ay', 'Bu ay'], ['son_3', 'Son 3 ay'], ['bu_yil', 'Bu yıl'], ['gecen_yil', 'Geçen yıl'], ['tumu', 'Tümü']];
export function periodBounds(p, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  if (p === 'bu_ay') return [new Date(y, m, 1), new Date(y, m + 1, 0)];
  if (p === 'son_3') return [new Date(y, m - 2, 1), new Date(y, m + 1, 0)];
  if (p === 'bu_yil') return [new Date(y, 0, 1), new Date(y, 11, 31)];
  if (p === 'gecen_yil') return [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)];
  return [new Date(2000, 0, 1), new Date(y + 5, 11, 31)];
}
const pct = (x) => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + '%';

export function buildReport({ data, revenue, now, period, mp }) {
  const [a, b] = periodBounds(period, now);
  const A = toDateInput(a), B = toDateInput(b);
  const camps = data.campaigns.filter((c) => c.kind !== 'etkinlik' && c.start_date >= A && c.start_date <= B && (!mp || c.marketplace === mp))
    .sort((x, y) => y.start_date.localeCompare(x.start_date))
    .map((c) => {
      const r = campaignResult(c, revenue, now);
      return { c, days: daysBetween(fromDateInput(c.start_date), fromDateInput(c.end_date)) + 1, r: r && !r.empty ? r : null, upcoming: c.start_date > toDateInput(now) };
    });
  const withDelta = camps.filter((x) => x.r && x.r.delta != null);
  const best = withDelta.length ? withDelta.reduce((m, x) => (x.r.delta > m.r.delta ? x : m)) : null;
  const totals = {
    count: camps.length,
    days: camps.reduce((s, x) => s + x.days, 0),
    ciro: camps.reduce((s, x) => s + (x.r ? x.r.cur : 0), 0),
    avgDelta: withDelta.length ? withDelta.reduce((s, x) => s + x.r.delta, 0) / withDelta.length : null
  };
  // Pazaryeri karşılaştırması
  const mps = MARKETPLACES.map((m) => m.name).filter((n) => !mp || n === mp);
  const byMp = mps.map((n) => {
    const cs = camps.filter((x) => x.c.marketplace === n);
    const ds = cs.filter((x) => x.r && x.r.delta != null);
    const periodCiro = (revenue || []).filter((r) => r.marketplace === n && r.day >= A && r.day <= B).reduce((s, r) => s + Number(r.amount), 0);
    return { name: n, count: cs.length, days: cs.reduce((s, x) => s + x.days, 0), ciro: cs.reduce((s, x) => s + (x.r ? x.r.cur : 0), 0), avgDelta: ds.length ? ds.reduce((s, x) => s + x.r.delta, 0) / ds.length : null, periodCiro };
  }).filter((x) => x.count || x.periodCiro).sort((x, y) => y.count - x.count || y.periodCiro - x.periodCiro);
  // Influencer
  const collabs = (data.collabs || []).filter((c) => c.publish_date && c.publish_date >= A && c.publish_date <= B && c.status !== 'iptal' && (!mp || c.marketplace === mp));
  const byInf = {};
  collabs.forEach((c) => { const k = adWho(c, data.contacts); byInf[k] = byInf[k] || { name: k, n: 0, fee: 0 }; byInf[k].n++; byInf[k].fee += Number(c.fee) || 0; });
  const byPct = {};
  collabs.forEach((c) => { const has = c.commission != null && c.commission !== ''; const k = has ? Number(c.commission) : -1; byPct[k] = byPct[k] || { rate: has ? k : null, n: 0, fee: 0 }; byPct[k].n++; byPct[k].fee += Number(c.fee) || 0; });
  // Bekleyenler
  const fups = (data.followups || []).filter((f) => !mp || f.marketplace === mp);
  const openF = fups.filter((f) => !f.done);
  return {
    range: [a, b], camps, best, totals, byMp,
    inf: { count: collabs.length, fee: collabs.reduce((s, c) => s + (Number(c.fee) || 0), 0), list: Object.values(byInf).sort((x, y) => y.fee - x.fee), byPct: Object.values(byPct).sort((x, y) => (x.rate == null) - (y.rate == null) || x.rate - y.rate) },
    fup: { open: openF.length, oldest: openF.length ? Math.max(...openF.map((f) => waitDays(f, now))) : 0, stats: responseStats(fups) }
  };
}

export function ReportsView({ data, revenue, now, actions }) {
  const [period, setPeriod] = useState(() => { try { return sessionStorage.getItem('ajanda-rp-period') || 'bu_yil'; } catch { return 'bu_yil'; } });
  const [mp, setMp] = useState('');
  const setP = (v) => { setPeriod(v); try { sessionStorage.setItem('ajanda-rp-period', v); } catch { /* yok say */ } };
  const rep = useMemo(() => buildReport({ data, revenue, now, period, mp }), [data, revenue, now, period, mp]);
  const used = MARKETPLACES.map((m) => m.name).filter((n) => data.campaigns.some((c) => c.marketplace === n));
  const label = PERIODS.find((x) => x[0] === period)[1] + (mp ? ' · ' + mp : '');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="chips" role="group" aria-label="Dönem">
        {PERIODS.map(([k, l]) => <button key={k} type="button" className={'chip' + (period === k ? ' on' : '')} aria-pressed={period === k} onClick={() => setP(k)}>{l}</button>)}
      </div>
      <div className="chips" role="group" aria-label="Pazaryeri">
        <button type="button" className={'chip' + (!mp ? ' on' : '')} aria-pressed={!mp} onClick={() => setMp('')}>Tüm pazaryerleri</button>
        {used.map((n) => <button key={n} type="button" className={'chip' + (mp === n ? ' on' : '')} aria-pressed={mp === n} onClick={() => setMp(n)}><span className="dot" style={{ background: mpColor(n) }} />{n}</button>)}
      </div>

      <section className="card rp-sum" aria-label="Kampanya özeti">
        <div><span className="rv-k">Kampanya</span><span className="rp-v">{rep.totals.count}</span></div>
        <div><span className="rv-k">Kampanyalı gün</span><span className="rp-v">{rep.totals.days}</span></div>
        <div><span className="rv-k">Kampanya cirosu</span><span className="rp-v">{rep.totals.ciro ? tlShort(rep.totals.ciro) : '—'}</span></div>
        <div><span className="rv-k">Ortalama etki</span><span className={'rp-v' + (rep.totals.avgDelta != null ? (rep.totals.avgDelta >= 0 ? ' up' : ' down') : '')}>{rep.totals.avgDelta != null ? pct(rep.totals.avgDelta) : '—'}</span></div>
      </section>
      {rep.best ? <p className="hint" style={{ margin: '-6px 0 0' }}>⭐ En iyi giden: <b>{rep.best.c.name}</b>{rep.best.c.marketplace ? ' (' + rep.best.c.marketplace + ')' : ''} · günlük ciro öncesine göre {pct(rep.best.r.delta)}</p> : null}

      <Section title="Kampanyalar" meta={label}>
        <div className="card list">
          {rep.camps.length ? rep.camps.map(({ c, days, r, upcoming }) => (
            <button key={c.id} type="button" className="row rowbtn rp-camp" onClick={() => actions.openCampaign(c)}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' }}>
                <span className="title" style={{ fontWeight: 600 }}>{rep.best && rep.best.c.id === c.id ? '⭐ ' : ''}{c.name}</span>
                <span className="meta">
                  <span className="tag"><span className="dot" style={{ background: mpColor(c.marketplace) }} />{c.marketplace || 'Genel'}</span>
                  <span>{campaignWhen(c)}</span><span>{days} gün</span>
                </span>
              </span>
              <span className="rp-res">
                {upcoming ? <span className="muted">yaklaşan</span> : r ? <><b>{tlShort(r.cur)}</b>{r.delta != null ? <span className={'gl-d sm ' + (r.delta >= 0 ? 'up' : 'down')}>{r.delta >= 0 ? '▲' : '▼'} {Math.abs(Math.round(r.delta * 100))}%</span> : null}</> : <span className="muted">ciro yok</span>}
              </span>
            </button>
          )) : <p className="empty">Bu dönemde kampanya yok.</p>}
        </div>
      </Section>

      {!mp && rep.byMp.length ? (
        <Section title="Pazaryerleri" meta={label}>
          <div className="card rp-table-wrap">
            <table className="rp-table">
              <thead><tr><th>Pazaryeri</th><th>Kamp.</th><th>Gün</th><th>Ort. etki</th><th>Ciro</th></tr></thead>
              <tbody>
                {rep.byMp.map((x) => (
                  <tr key={x.name}>
                    <td><span className="tag"><span className="dot" style={{ background: mpColor(x.name) }} />{x.name}</span></td>
                    <td>{x.count}</td><td>{x.days}</td>
                    <td className={x.avgDelta != null ? (x.avgDelta >= 0 ? 'up' : 'down') : ''}>{x.avgDelta != null ? pct(x.avgDelta) : '—'}</td>
                    <td>{x.periodCiro ? tlShort(x.periodCiro) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section title="Influencer reklamları" meta={label}>
        <div className="card list">
          <div className="row fup-stat"><span className="title">Reklam</span><span className="meta">{rep.inf.count} adet</span><span className="fup-avg">{tl(rep.inf.fee)}</span></div>
          {rep.inf.list.slice(0, 5).map((x) => <div key={x.name} className="row fup-stat"><span className="title">{x.name}</span><span className="meta">{x.n} reklam</span><span className="fup-avg">{tlShort(x.fee)}</span></div>)}
          {rep.inf.byPct.some((x) => x.rate != null) ? <div className="row fup-stat rp-sub"><span className="title">Komisyona göre</span></div> : null}
          {rep.inf.byPct.some((x) => x.rate != null) ? rep.inf.byPct.map((x) => <div key={String(x.rate)} className="row fup-stat"><span className="title">{x.rate == null ? 'Girilmemiş' : '%' + x.rate.toLocaleString('tr-TR') + ' komisyon'}</span><span className="meta">{x.n} reklam</span><span className="fup-avg">{x.fee ? tlShort(x.fee) : '—'}</span></div>) : null}
        </div>
      </Section>

      <Section title="Bekleyen talepler" action={<button type="button" className="linkbtn" onClick={() => actions.goTab('bekleyenler')}>Aç</button>}>
        <div className="card list">
          <div className="row fup-stat"><span className="title">Açık talep</span><span className="meta">{rep.fup.open ? 'en eskisi ' + rep.fup.oldest + ' gün' : ''}</span><span className="fup-avg">{rep.fup.open}</span></div>
          {rep.fup.stats.slice(0, 5).map((s) => <div key={s.party} className="row fup-stat"><span className="title">{s.party}</span><span className="meta">{s.n} talep</span><span className="fup-avg">~{Math.round(s.avg)} günde dönüş</span></div>)}
        </div>
      </Section>

      <button type="button" className="btn big" onClick={() => actions.exportReport({ rep, label })}>⬇ Bu raporu Excel'e aktar</button>
      <p className="hint" style={{ margin: 0 }}>Kampanya cirosu ve etki, ciro girilmiş günlerden hesaplanır (kampanya günlerinin günlük ortalaması, kampanyadan hemen önceki aynı sayıda güne göre). Ciro takibine başlamadan önceki kampanyalarda "ciro yok" görünür.</p>
    </div>
  );
}

export { MONTHS };
