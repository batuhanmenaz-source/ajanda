// Kampanyalar → İndirim kurguları: 2. ürüne %20, 5 Al 4 Öde, sepette %10, ödül ürün, indirim kodu…
// Fiyat kampanyasına ek kurguların takibi, kullanım adedi ve pazaryeri indirim hakları.
import { useMemo, useRef, useState } from 'react';
import { MARKETPLACES, mpColor } from './constants.js';
import { addDays, startOfDay, toDateInput, fromDateInput, fmtShort, daysBetween } from './dates.js';
import { Section, Sheet } from './ui.jsx';
import { tl, tlShort, parseTL } from './revenue.jsx';
import { StatStrip } from './statstrip.jsx';
import { usesOf, usedTotal, revTotal, usedIn, PERIODS, periodOf, CodeTimeBar, SCOPES_C } from './codes.jsx';

const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const fmtN = (n) => (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

// Trendyol "İndirim Seçenekleri" ile aynı dört tür
export const PROMO_TYPES = [
  { k: 'net', l: 'Net indirim', d: 'Sepette doğrudan indirim', c: '#2B8A3E', i: '💸' },
  { k: 'kosullu', l: 'Koşullu indirim', d: 'Tutar, adet ya da X. ürün koşuluyla', c: '#E8590C', i: '🎯' },
  { k: 'birlikte', l: 'Birlikte al', d: 'Ödül ya da tamamlayıcı ürün', c: '#7048E8', i: '🎁' },
  { k: 'kod', l: 'İndirim kodu', d: 'Kod girilen sepete indirim', c: '#0C8599', i: '🏷️' }
];
export const typeOf = (k) => PROMO_TYPES.find((t) => t.k === k) || PROMO_TYPES[1];
const CONDS = {
  kosullu: [['tutar', 'Tutar üzerinden'], ['adet', 'Ürün adedi üzerinden'], ['xurun', 'X. ürüne indirim']],
  birlikte: [['sepet', 'Sepet fırsatı (ödül ürün)'], ['tamamlayici', 'Tamamlayıcı indirim']]
};
const condLbl = (p) => ((CONDS[p.type] || []).find((c) => c[0] === p.cond) || [, ''])[1];
// Trendyol panelindeki varsayılan haklar (Kalan İndirim Hakkı: 100 / 50 / 50 / 10)
export const DEFAULT_QUOTA = { Trendyol: { net: 100, kosullu: 50, birlikte: 50, kod: 10 } };

// Kurgu kendi başına kampanya olunca açılan hazırlık adımları
export const PROMO_PREPS = ['Kurguyu panelde kur', 'Mağaza reklamlarını kur', 'Influencer reklamlarını kur', 'Mağaza tasarımını güncelle'];

// Hızlı başlangıç şablonları: tek dokunuşla tür, koşul ve değerler dolar
// İlk ikisi her kampanyada kurulan standartlar (⭐)
export const TEMPLATES = [
  ['2. ürüne %20', { type: 'kosullu', cond: 'xurun', disc_type: 'yuzde', threshold: 2, disc_value: 20 }, true],
  ['5 Al 4 Öde', { type: 'kosullu', cond: 'adet', disc_type: 'xaly', threshold: 5, pay_qty: 4 }, true],
  ['3 Al 2 Öde', { type: 'kosullu', cond: 'adet', disc_type: 'xaly', threshold: 3, pay_qty: 2 }],
  ['2 adete %15', { type: 'kosullu', cond: 'adet', disc_type: 'yuzde', threshold: 2, disc_value: 15 }],
  ['₺500 üzeri ₺75', { type: 'kosullu', cond: 'tutar', disc_type: 'tl', threshold: 500, disc_value: 75 }],
  ['Sepette %10', { type: 'net', disc_type: 'yuzde', disc_value: 10 }],
  ['Hediye ürün', { type: 'birlikte', cond: 'sepet', disc_type: 'odul', disc_value: 1, threshold: 400 }]
];

// ---- Hesaplar
const val = (p) => (p.disc_value == null || p.disc_value === '' ? '…' : p.disc_type === 'tl' ? tl(p.disc_value) : '%' + fmtN(p.disc_value));
export function promoLabel(p) {
  const th = p.threshold != null && p.threshold !== '' ? Number(p.threshold) : null;
  if (p.type === 'net') return 'Sepette ' + val(p);
  if (p.type === 'kod') return (p.code || 'KOD') + ' · ' + val(p) + (th ? ' (' + tlShort(th) + ' üzeri)' : '');
  if (p.type === 'birlikte') {
    if (p.cond === 'tamamlayici') return 'Tamamlayıcı üründe ' + val(p);
    return (th ? tlShort(th) + ' üzeri ' : '') + 'ödül ürün ' + (p.disc_value != null && p.disc_value !== '' ? tl(p.disc_value) : '…');
  }
  if (p.cond === 'xurun') return (th || 2) + '. ürüne ' + val(p);
  if (p.cond === 'adet') return p.disc_type === 'xaly' ? (th || '…') + ' Al ' + (p.pay_qty || '…') + ' Öde' : (th || '…') + ' adete ' + val(p);
  return (th ? tlShort(th) + ' üzeri ' : '') + val(p);
}
export const promoTitle = (p) => (p.name && p.name.trim()) || promoLabel(p);

export function promoStatus(p, now = new Date()) {
  const s = p.start_at ? new Date(p.start_at) : null, e = p.end_at ? new Date(p.end_at) : null;
  if (e && now > e) return { key: 'past', label: 'Bitti' };
  if (p.order_limit && usedTotal(p) >= Number(p.order_limit)) return { key: 'full', label: 'Limit doldu' };
  if (s && now < s) { const n = daysBetween(startOfDay(now), startOfDay(s)); return { key: 'soon', label: n ? n + ' gün sonra' : 'Bugün ' + hm(s) }; }
  if (e) { const n = daysBetween(startOfDay(now), startOfDay(e)); return { key: 'live', label: n ? 'Aktif · ' + n + ' gün kaldı' : 'Son gün · ' + hm(e) }; }
  return { key: 'live', label: 'Aktif' };
}
// Hak hesabı için açık kurgu: bitmemiş (aktif, planlanan ya da limiti dolmuş ama süresi süren)
const isOpen = (p, now) => !p.end_at || new Date(p.end_at) >= now;

// Pazaryeri × tür: açık kurgu sayısı ve hak limiti
function quotaRows(promos, quota, now) {
  const mps = new Set([...Object.keys(quota || {}), ...promos.filter((p) => isOpen(p, now)).map((p) => p.marketplace).filter(Boolean)]);
  return MARKETPLACES.map((m) => m.name).filter((n) => mps.has(n)).map((mp) => {
    const q = (quota || {})[mp] || {};
    const cells = PROMO_TYPES.map((t) => {
      const used = promos.filter((p) => p.marketplace === mp && p.type === t.k && isOpen(p, now)).length;
      const lim = Number(q[t.k]) || 0;
      return { t, used, lim, left: lim ? lim - used : null };
    });
    return { mp, cells, hasQuota: Object.values(q).some((v) => Number(v) > 0) };
  });
}

// ---- Kampanya kartında: bu kampanyanın kurguları
export function CampaignPromos({ c, promos, now, actions }) {
  const list = (promos || []).filter((p) => p.campaign_id === c.id).sort((a, b) => (a.start_at || '').localeCompare(b.start_at || ''));
  const add = () => actions.openPromo({ campaign_id: c.id, marketplace: c.marketplace || 'Trendyol', ...campDates(c) });
  return (
    <div className="cp">
      <div className="cp-h">
        <span>İndirim kurguları{list.length ? ' · ' + list.length : ''}</span>
        <span className="cp-hb">
          {(promos || []).some((p) => p.campaign_id !== c.id && promoStatus(p, now).key !== 'past') ? <button type="button" className="linkbtn" onClick={() => actions.openPromoAttach(c)}>🔗 Var olanı bağla</button> : null}
          <button type="button" className="linkbtn" onClick={add}>{list.length ? '+ Bir kurgu daha' : '+ Kurgu ekle'}</button>
        </span>
      </div>
      {list.length ? list.map((p) => {
        const t = typeOf(p.type); const used = usedTotal(p); const lim = Number(p.order_limit) || 0; const st = promoStatus(p, now);
        return (
          <div key={p.id} className={'cp-row ' + st.key} style={{ '--t': t.c }}>
            <button type="button" className="cp-main" onClick={() => actions.openPromo(p)}>
              <span className="cp-ico" aria-hidden="true">{t.i}</span>
              <span className="cp-txt"><b>{promoTitle(p)}</b><small>{t.l}{p.scope !== 'tum' && p.scope_note ? ' · ' + p.scope_note : ''}{st.key !== 'live' ? ' · ' + st.label.toLocaleLowerCase('tr-TR') : ''}</small></span>
              <span className="cp-n"><b>{used.toLocaleString('tr-TR')}</b>{lim ? ' / ' + lim.toLocaleString('tr-TR') : ''}<small>kullanım</small>
                {lim ? <i className="cp-bar"><u className={used / lim >= 0.9 ? 'hot' : ''} style={{ width: Math.min(100, (used / lim) * 100) + '%' }} /></i> : null}
              </span>
            </button>
            {st.key !== 'soon' ? <button type="button" className="it-plus" aria-label={promoTitle(p) + ' kullanım gir'} title="Kullanım gir" onClick={() => actions.openPromoUsage(p)}>+</button> : null}
          </div>
        );
      }) : <p className="cp-empty">Fiyat dışı kurgu yok. 2. ürüne %20, 5 Al 4 Öde gibi kurguları buraya ekle.</p>}
    </div>
  );
}
export const campDates = (c) => ({
  start_at: new Date(fromDateInput(c.start_date).getTime() + (c.start_time ? (Number(c.start_time.slice(0, 2)) * 60 + Number(c.start_time.slice(3, 5))) * 60000 : 10 * 3600000)).toISOString(),
  end_at: new Date(fromDateInput(c.end_date).getTime() + (c.end_time ? (Number(c.end_time.slice(0, 2)) * 60 + Number(c.end_time.slice(3, 5))) * 60000 : (23 * 60 + 59) * 60000)).toISOString()
});

// ---- Kampanyalar → İndirim kurguları sekmesi
export function PromosView({ data, now, actions, quota }) {
  const all = useMemo(() => [...(data.promos || [])].sort((a, b) => (a.start_at || '').localeCompare(b.start_at || '')), [data.promos]);
  const camps = data.campaigns || [];
  const campOf = (p) => camps.find((c) => c.id === p.campaign_id);
  const [fMp, setFMp] = useState('');
  const [fType, setFType] = useState('');
  const [per, setPer] = useState('30');
  const [showPast, setShowPast] = useState(false);
  const q = quota || DEFAULT_QUOTA;
  const list = all.filter((p) => (!fMp || p.marketplace === fMp) && (!fType || p.type === fType));
  const withSt = list.map((p) => ({ p, st: promoStatus(p, now) }));
  const live = withSt.filter((x) => x.st.key === 'live' || (x.st.key === 'full' && isOpen(x.p, now)));
  const soon = withSt.filter((x) => x.st.key === 'soon');
  const past = withSt.filter((x) => x.st.key === 'past').reverse();
  const mps = MARKETPLACES.map((m) => m.name).filter((n) => all.some((p) => p.marketplace === n));
  const types = PROMO_TYPES.filter((t) => all.some((p) => p.type === t.k));

  const [from, to] = periodOf(per, now);
  const inP = list.map((p) => ({ p, ...usedIn(p, from, to) }));
  const pUses = inP.reduce((a, x) => a + x.n, 0);
  const pRev = inP.reduce((a, x) => a + x.rv, 0);
  const byType = PROMO_TYPES.map((t) => {
    const r = inP.filter((x) => x.p.type === t.k);
    return { t, cnt: r.length, n: r.reduce((a, x) => a + x.n, 0), rv: r.reduce((a, x) => a + x.rv, 0) };
  }).filter((r) => r.cnt);
  const ranking = inP.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
  const rankMax = ranking.length ? ranking[0].n : 1;
  const stale = live.filter((x) => { const u = usesOf(x.p); return !u.length || daysBetween(fromDateInput(u[u.length - 1].d), startOfDay(now)) >= 3; });

  const qRows = quotaRows(all, q, now);
  const tight = qRows.flatMap((r) => r.cells.filter((c) => c.lim).map((c) => ({ ...c, mp: r.mp }))).sort((a, b) => a.left / a.lim - b.left / b.lim)[0];

  const card = ({ p, st }) => <PromoCard key={p.id} p={p} st={st} now={now} actions={actions} camp={campOf(p)} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StatStrip items={[
        { label: 'Aktif kurgu', value: live.length, unit: 'kurgu', tone: '#E8590C', sub: live.length ? live.filter((x) => x.p.campaign_id).length + ' tanesi kampanyaya bağlı' : 'şu an aktif kurgu yok' },
        { label: 'Yaklaşan', value: soon.length, unit: 'kurgu', tone: '#C2410C', sub: soon[0] ? 'sıradaki: ' + promoTitle(soon[0].p) + ' · ' + soon[0].st.label.toLocaleLowerCase('tr-TR') : 'planlanan yok' },
        { label: PERIODS.find((x) => x[0] === per)[1] + ' kullanım', value: pUses.toLocaleString('tr-TR'), unit: 'adet', tone: '#7048E8', sub: pRev ? tlShort(pRev) + ' satış' : stale.length ? stale.length + ' aktif kurgunun kullanımı 3+ gündür girilmedi' : 'kullanım girişleri güncel' },
        { label: 'En az kalan hak', value: tight ? tight.left + ' / ' + tight.lim : '—', tone: tight && tight.left / tight.lim <= 0.15 ? '#E03131' : '#2B8A3E', warn: !!(tight && tight.left / tight.lim <= 0.15), sub: tight ? tight.mp + ' · ' + tight.t.l.toLocaleLowerCase('tr-TR') : 'hak limiti girilmedi' }
      ]} />

      {qRows.length ? (
        <div className="card pq">
          <div className="pq-h"><b>İndirim hakları</b><span>Bitmemiş (aktif ve planlanan) kurgular haktan düşülür.</span></div>
          {qRows.map((r) => (
            <div key={r.mp} className="pq-row" style={{ '--mp': mpColor(r.mp) }}>
              <div className="pq-mp"><span className="dot" style={{ background: mpColor(r.mp) }} /><b>{r.mp}</b><button type="button" className="linkbtn" onClick={() => actions.openPromoQuota(r.mp)}>{r.hasQuota ? 'Düzenle' : 'Hak gir'}</button></div>
              <div className="pq-cells">
                {r.cells.map((c) => (
                  <div key={c.t.k} className={'pq-c' + (c.lim && c.left / c.lim <= 0.15 ? ' low' : '') + (c.lim && c.left < 0 ? ' over' : '')} style={{ '--t': c.t.c }}>
                    <span>{c.t.l}</span>
                    {c.lim ? <><b>{c.left}<small> / {c.lim} kalan</small></b><i><u style={{ width: Math.min(100, Math.max(0, (c.used / c.lim) * 100)) + '%' }} /></i></> : <b>{c.used}<small> açık</small></b>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {mps.length > 1 || types.length > 1 ? (
        <div className="ad-filters">
          {mps.length > 1 ? (
            <div className="typechips" role="group" aria-label="Pazaryerine göre">
              <span className="ad-flabel">Pazaryeri</span>
              <button type="button" className={'chip' + (!fMp ? ' on' : '')} onClick={() => setFMp('')}>Tümü</button>
              {mps.map((n) => <button key={n} type="button" className={'chip' + (fMp === n ? ' on' : '')} onClick={() => setFMp(n)}><span className="dot" style={{ background: mpColor(n) }} />{n}</button>)}
            </div>
          ) : null}
          {types.length > 1 ? (
            <div className="typechips" role="group" aria-label="Türe göre">
              <span className="ad-flabel">Tür</span>
              <button type="button" className={'chip' + (!fType ? ' on' : '')} onClick={() => setFType('')}>Tümü</button>
              {types.map((t) => <button key={t.k} type="button" className={'chip' + (fType === t.k ? ' on' : '')} onClick={() => setFType(t.k)}>{t.i} {t.l}</button>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ad-actions">
        <button type="button" className="btn primary big" onClick={() => actions.openPromo({})}>+ İndirim kurgusu ekle</button>
      </div>

      <Section title={'Aktif · ' + live.length} tone="#E8590C">
        {live.length ? <div className="ic-grid">{live.map(card)}</div> : <div className="card"><p className="empty">Aktif indirim kurgusu yok.</p></div>}
      </Section>
      {soon.length ? <Section title={'Yaklaşan · ' + soon.length} tone="#C2410C"><div className="ic-grid">{soon.map(card)}</div></Section> : null}

      <Section title="Kullanım raporu" tone="#7048E8" action={
        <div className="typechips" role="group" aria-label="Dönem">
          {PERIODS.map(([k, l]) => <button key={k} type="button" className={'chip' + (per === k ? ' on' : '')} onClick={() => setPer(k)}>{l}</button>)}
        </div>}>
        <div className="card ic-report">
          <div className="ic-rhead">
            <div><span>Kullanım</span><b>{pUses.toLocaleString('tr-TR')}</b></div>
            <div><span>Kurgulu satış</span><b>{pRev ? tlShort(pRev) : '—'}</b></div>
            <div><span>Kullanım başına satış</span><b>{pRev && pUses ? tl(pRev / pUses) : '—'}</b></div>
            <div><span>Kullanılan kurgu</span><b>{inP.filter((x) => x.n > 0).length} / {list.length}</b></div>
          </div>
          {ranking.length ? (
            <div className="ic-rank">
              {ranking.map(({ p, n, rv }) => (
                <button key={p.id} type="button" className="ic-rank-row pr-rank" onClick={() => actions.openPromo(p)} style={{ '--mp': typeOf(p.type).c }}>
                  <span className="ic-rank-code">{promoTitle(p)}</span>
                  <span className="ic-rank-who">{[p.marketplace, (campOf(p) || {}).name].filter(Boolean).join(' · ') || '—'}</span>
                  <span className="ic-rank-bar"><span style={{ width: (n / rankMax) * 100 + '%' }} /></span>
                  <span className="ic-rank-n"><b>{n.toLocaleString('tr-TR')}</b>{rv ? <small>{tlShort(rv)}</small> : null}</span>
                </button>
              ))}
            </div>
          ) : <p className="empty">Bu dönemde kullanım girilmedi.</p>}
          {byType.length ? (
            <div className="ic-tables">
              <table className="ic-table">
                <thead><tr><th>Tür</th><th>Kurgu</th><th>Kullanım</th><th>Satış</th><th>Kullanım başına</th></tr></thead>
                <tbody>
                  {byType.map((r) => (
                    <tr key={r.t.k}>
                      <td><span className="dot" style={{ background: r.t.c }} />{r.t.l}</td>
                      <td>{r.cnt}</td>
                      <td><b>{r.n.toLocaleString('tr-TR')}</b></td>
                      <td>{r.rv ? tlShort(r.rv) : '—'}</td>
                      <td>{r.rv && r.n ? tl(r.rv / r.n) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="hint" style={{ margin: 0 }}>Kullanım = kurgunun uygulandığı sipariş adedi. Panelde gördüğün toplamı gir; dönem kullanımı girişlerin farkından hesaplanır.</p>
        </div>
      </Section>

      {past.length ? (
        <Section title="Biten kurgular" action={<button type="button" className="linkbtn" onClick={() => setShowPast(!showPast)}>{showPast ? 'Gizle' : 'Göster (' + past.length + ')'}</button>}>
          {showPast ? <div className="ic-grid">{past.map(card)}</div> : null}
        </Section>
      ) : null}
      {!all.length ? <p className="hint">Supabase'de 32 numaralı SQL'i çalıştırdıysan ilk kurgunu ekleyebilirsin. Kampanya kartlarındaki "+ Kurgu ekle" ile kurguyu doğrudan kampanyaya bağlayabilirsin.</p> : null}
    </div>
  );
}

function PromoCard({ p, st, now, actions, camp }) {
  const t = typeOf(p.type);
  const used = usedTotal(p);
  const lim = Number(p.order_limit) || 0;
  const fill = lim ? Math.min(1, used / lim) : 0;
  const u = usesOf(p);
  const last = u[u.length - 1]; const prev = u[u.length - 2];
  const s = p.start_at ? new Date(p.start_at) : null, e = p.end_at ? new Date(p.end_at) : null;
  return (
    <div className={'card ic-card pr-card ' + st.key} style={{ '--mp': t.c }}>
      <div className="ic-top">
        <span className="pr-type">{t.i} {t.l}</span>
        <span className={'ic-st ' + st.key}>{st.label}</span>
      </div>
      <button type="button" className="ic-body" onClick={() => actions.openPromo(p)}>
        <span className="pr-title">{promoTitle(p)}</span>
        {p.name ? <span className="pr-sub">{promoLabel(p)}</span> : null}
        <span className="ic-tags">
          {p.marketplace ? <span className="ic-mp" style={{ color: mpColor(p.marketplace) }}>{p.marketplace}</span> : null}
          {camp ? <span className="pr-camp">📣 {camp.name}</span> : null}
          {condLbl(p) ? <span>{condLbl(p)}</span> : null}
          <span>{(SCOPES_C.find((x) => x[0] === p.scope) || SCOPES_C[0])[1]}{p.scope !== 'tum' && p.scope_note ? ': ' + p.scope_note : ''}</span>
          {p.reward ? <span>🎁 {p.reward}</span> : null}
        </span>
        <span className="ic-when">{s ? fmtShort(s) + ' ' + hm(s) : '—'} → {e ? fmtShort(e) + ' ' + hm(e) : '—'}</span>
      </button>
      <CodeTimeBar c={p} now={now} />
      <div className="ic-use">
        <div className="ic-use-top">
          <span><b>{used.toLocaleString('tr-TR')}</b>{lim ? ' / ' + lim.toLocaleString('tr-TR') : ''} kullanım</span>
          {lim ? <em>%{Math.round(fill * 100)}</em> : null}
        </div>
        {lim ? <span className="ic-bar"><span className={fill >= 0.9 ? 'hot' : ''} style={{ width: fill * 100 + '%' }} /></span> : null}
        <span className="ic-use-s">
          {last ? 'son giriş ' + fmtShort(fromDateInput(last.d)) + (prev ? ' · +' + Math.max(0, Number(last.n) - Number(prev.n)).toLocaleString('tr-TR') + ' önceki girişten beri' : '') : 'henüz kullanım girilmedi'}
          {revTotal(p) ? ' · ' + tlShort(revTotal(p)) + ' satış' : ''}
        </span>
      </div>
      <div className="pr-acts">
        {st.key !== 'soon' ? <button type="button" className="btn ic-add" onClick={() => actions.openPromoUsage(p)}>+ Kullanım gir</button> : null}
        {st.key !== 'past' ? <button type="button" className="btn ic-add" onClick={() => actions.openPromoLink(p)}>🔗 {camp ? 'Kampanyayı değiştir' : 'Kampanyaya bağla'}</button> : null}
      </div>
    </div>
  );
}

// Tarihleri çakışan kampanyalar: önce aynı pazaryeri, sonra en çok örtüşen
export function overlapCamps(camps, mp, sDate, eDate) {
  return (camps || []).filter((c) => c.kind !== 'etkinlik' && c.start_date <= eDate && c.end_date >= sDate)
    .map((c) => ({ c, sc: (c.marketplace === mp ? 1000 : !c.marketplace ? 500 : 0) - Math.abs(daysBetween(fromDateInput(c.start_date), fromDateInput(sDate))) }))
    .filter((x) => x.sc >= 0 || !mp).sort((a, b) => b.sc - a.sc).map((x) => x.c);
}

// ---- Satır içi kurgu düzenleyici (kampanya formunda): şekil + elle girilen sayılar
export const SHAPES = [
  ['xurun', 'X. ürüne indirim', { type: 'kosullu', cond: 'xurun', disc_type: 'yuzde', threshold: 2, disc_value: 20 }],
  ['xaly', 'X Al Y Öde', { type: 'kosullu', cond: 'adet', disc_type: 'xaly', threshold: 5, pay_qty: 4 }],
  ['adet', 'Adete indirim', { type: 'kosullu', cond: 'adet', disc_type: 'yuzde', threshold: 2, disc_value: 15 }],
  ['tutar', 'Tutar üzeri indirim', { type: 'kosullu', cond: 'tutar', disc_type: 'tl', threshold: 500, disc_value: 75 }],
  ['net', 'Sepette indirim', { type: 'net', disc_type: 'yuzde', disc_value: 10 }],
  ['odul', 'Hediye / ödül ürün', { type: 'birlikte', cond: 'sepet', disc_type: 'odul', threshold: 400, disc_value: 1 }]
];
export const shapeOf = (p) => (p.type === 'net' ? 'net' : p.type === 'birlikte' ? 'odul' : p.cond === 'xurun' ? 'xurun' : p.cond === 'tutar' ? 'tutar' : p.disc_type === 'xaly' ? 'xaly' : 'adet');
export function PromoInline({ p, onChange, onRemove }) {
  const sh = shapeOf(p);
  const n = (k, w = 54, ph = '') => <input type="text" inputMode="decimal" className="pi-n" style={{ width: w }} value={p[k] == null ? '' : String(p[k]).replace('.', ',')} placeholder={ph} aria-label={k}
    onChange={(e) => { const v = e.target.value.replace(',', '.'); onChange({ ...p, [k]: v === '' ? '' : v }); }} />;
  const unit = () => (
    <select className="pi-u" value={p.disc_type === 'tl' ? 'tl' : 'yuzde'} onChange={(e) => onChange({ ...p, disc_type: e.target.value })} aria-label="Birim"><option value="yuzde">%</option><option value="tl">₺</option></select>
  );
  return (
    <div className="pi" style={{ '--t': typeOf(p.type).c }}>
      <select className="pi-s" value={sh} onChange={(e) => onChange({ ...(SHAPES.find((x) => x[0] === e.target.value)[2]) })} aria-label="Kurgu şekli">
        {SHAPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <span className="pi-f">
        {sh === 'xurun' ? <>{n('threshold', 40)}<span>. ürüne</span>{unit()}{n('disc_value')}</> : null}
        {sh === 'xaly' ? <>{n('threshold', 40)}<span>Al</span>{n('pay_qty', 40)}<span>Öde</span></> : null}
        {sh === 'adet' ? <>{n('threshold', 40)}<span>adete</span>{unit()}{n('disc_value')}</> : null}
        {sh === 'tutar' ? <><span>₺</span>{n('threshold', 70)}<span>üzeri</span>{unit()}{n('disc_value')}</> : null}
        {sh === 'net' ? <><span>Sepette</span>{unit()}{n('disc_value')}</> : null}
        {sh === 'odul' ? <><span>₺</span>{n('threshold', 70)}<span>üzeri ödül ürün ₺</span>{n('disc_value', 50)}</> : null}
      </span>
      <button type="button" className="iconbtn pi-x" aria-label="Kurguyu çıkar" onClick={onRemove}>✕</button>
    </div>
  );
}
// Form değerini kayda çevir (sayılar)
export const cleanPromo = (p) => {
  const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')) || null);
  return { type: p.type, cond: p.cond || null, disc_type: p.disc_type, disc_value: p.disc_type === 'xaly' ? null : num(p.disc_value), threshold: num(p.threshold), pay_qty: p.disc_type === 'xaly' ? parseInt(p.pay_qty, 10) || null : null };
};

// ---- Kurguyu bir kampanyaya bağla / kampanyayı değiştir
export function PromoLinkSheet({ promo: p, campaigns, onClose, onLink }) {
  const now = new Date();
  const todayK = toDateInput(now);
  const s = p.start_at ? toDateInput(new Date(p.start_at)) : todayK, e = p.end_at ? toDateInput(new Date(p.end_at)) : s;
  const over = overlapCamps(campaigns, p.marketplace, s, e).filter((c) => c.id !== p.campaign_id);
  const rest = (campaigns || []).filter((c) => c.kind !== 'etkinlik' && c.id !== p.campaign_id && !over.includes(c) && c.end_date >= toDateInput(addDays(startOfDay(now), -30)))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const cur = (campaigns || []).find((c) => c.id === p.campaign_id);
  const row = (c, tag) => (
    <button key={c.id} type="button" className="pl-row" style={{ '--mp': c.marketplace ? mpColor(c.marketplace) : '#868E96' }} onClick={() => onLink(p, c.id)}>
      <span className="pl-main"><b>{c.name}</b><small>{[c.marketplace, fmtShort(fromDateInput(c.start_date)) + ' – ' + fmtShort(fromDateInput(c.end_date))].filter(Boolean).join(' · ')}</small></span>
      {tag ? <span className="pl-tag">{tag}</span> : null}
    </button>
  );
  return (
    <Sheet title={'Kampanyaya bağla · ' + promoTitle(p)} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="hint" style={{ margin: 0 }}>{cur ? <>Şu an <b>{cur.name}</b> kampanyasına bağlı. </> : 'Şu an hiçbir kampanyaya bağlı değil. '}Bağladığın kampanyanın kartında bu kurgu da görünür, ikisi birlikte takip edilir.</p>
        {over.length ? <><span className="lbl">Tarihleri çakışanlar</span><div className="pl-list">{over.map((c) => row(c, 'aynı tarihlerde'))}</div></> : null}
        {rest.length ? <><span className="lbl">Diğer kampanyalar</span><div className="pl-list">{rest.slice(0, 12).map((c) => row(c))}</div></> : null}
        {!over.length && !rest.length ? <p className="empty">Bağlanabilecek kampanya yok.</p> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!cur || cur.name !== promoTitle(p) ? <button type="button" className="btn" onClick={() => onLink(p, '__new')}>📣 Kendi kampanyası olsun</button> : null}
          {cur ? <button type="button" className="btn" onClick={() => onLink(p, null)}>Bağlantıyı kaldır</button> : null}
        </div>
      </div>
    </Sheet>
  );
}

// ---- Kampanya kartından: var olan kurguyu bu kampanyaya bağla
export function PromoAttachSheet({ campaign: c, promos, campaigns, onClose, onLink }) {
  const now = new Date();
  const cand = (promos || []).filter((p) => p.campaign_id !== c.id && promoStatus(p, now).key !== 'past')
    .map((p) => ({ p, over: p.start_at && p.end_at && toDateInput(new Date(p.start_at)) <= c.end_date && toDateInput(new Date(p.end_at)) >= c.start_date, same: !c.marketplace || p.marketplace === c.marketplace }))
    .sort((a, b) => (b.over + b.same) - (a.over + a.same));
  const campName = (id) => ((campaigns || []).find((x) => x.id === id) || {}).name;
  return (
    <Sheet title={'Kurgu bağla · ' + c.name} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="hint" style={{ margin: 0 }}>Ayrı kurduğun bir kurguyu seç; bu kampanyanın kartına taşınır ve birlikte takip edilir.</p>
        {cand.length ? <div className="pl-list">{cand.map(({ p, over }) => {
          const t = typeOf(p.type); const cn = campName(p.campaign_id);
          return (
            <button key={p.id} type="button" className="pl-row" style={{ '--mp': t.c }} onClick={() => onLink(p, c.id)}>
              <span className="pl-main"><b>{t.i} {promoTitle(p)}</b><small>{[p.marketplace, p.start_at ? fmtShort(new Date(p.start_at)) + ' – ' + fmtShort(new Date(p.end_at || p.start_at)) : '', cn ? 'şu an: ' + cn : 'kampanyasız'].filter(Boolean).join(' · ')}</small></span>
              {over ? <span className="pl-tag">aynı tarihlerde</span> : null}
            </button>
          );
        })}</div> : <p className="empty">Bağlanabilecek kurgu yok. Kurguları İndirim kurguları sekmesinden ekleyebilirsin.</p>}
      </div>
    </Sheet>
  );
}

// ---- Kurgu formu (Trendyol "İndirim Oluştur" adımlarıyla)
export function PromoSheet({ initial, campaigns, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const now = new Date();
  const s0 = initial.start_at ? new Date(initial.start_at) : (() => { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
  const e0 = initial.end_at ? new Date(initial.end_at) : (() => { const d = addDays(s0, 7); d.setHours(23, 0, 0, 0); return d; })();
  const str = (v) => (v != null && v !== '' ? String(v).replace('.', ',') : '');
  const [f, setF] = useState(() => ({
    campaign_id: initial.campaign_id || (isEdit ? '' : '__new'), marketplace: initial.marketplace || 'Trendyol', name: initial.name || '',
    type: initial.type || 'kosullu', cond: initial.cond || 'xurun', disc_type: initial.disc_type || 'yuzde',
    disc_value: str(initial.disc_value), threshold: str(initial.threshold != null ? initial.threshold : (initial.type ? '' : 2)), pay_qty: initial.pay_qty ? String(initial.pay_qty) : '',
    reward: initial.reward || '', code: initial.code || '', scope: initial.scope || 'tum', scope_note: initial.scope_note || '',
    order_limit: initial.order_limit ? String(initial.order_limit) : '', note: initial.note || '',
    sDate: toDateInput(s0), sTime: hm(s0), eDate: toDateInput(e0), eTime: hm(e0)
  }));
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const [busy, setBusy] = useState(false);
  const todayK = toDateInput(now);
  const campOpts = (campaigns || []).filter((c) => c.kind !== 'etkinlik' && (c.end_date >= todayK || c.id === initial.campaign_id)).sort((a, b) => a.start_date.localeCompare(b.start_date));

  // Eşik alanının anlamı türe göre değişir (adet ↔ ₺): anlam değişince sıfırla
  const thKind = (t, c) => (t === 'kosullu' && (c === 'adet' || c === 'xurun') ? 'n' : t === 'net' ? '' : 'tl');
  const fixUp = (patch) => {
    const t = patch.type || f.type, c = patch.cond || f.cond;
    if (thKind(t, c) !== thKind(f.type, f.cond)) patch.threshold = t === 'kosullu' && c === 'xurun' ? '2' : '';
    const dt = patch.disc_type || f.disc_type;
    if ((dt === 'odul') !== (f.disc_type === 'odul')) patch.disc_value = dt === 'odul' ? '1' : '';
    return patch;
  };
  const pickType = (k) => {
    const patch = { type: k };
    if (k === 'kosullu' && !CONDS.kosullu.some((c) => c[0] === f.cond)) patch.cond = 'xurun';
    if (k === 'birlikte' && !CONDS.birlikte.some((c) => c[0] === f.cond)) patch.cond = 'sepet';
    const nt = patch.cond || f.cond;
    if (k === 'birlikte' && nt === 'sepet') patch.disc_type = 'odul';
    else if (f.disc_type === 'odul' || (f.disc_type === 'xaly' && !(k === 'kosullu' && nt === 'adet'))) patch.disc_type = 'yuzde';
    set(fixUp(patch));
  };
  const pickCond = (c) => {
    const patch = { cond: c };
    if (f.type === 'birlikte') patch.disc_type = c === 'sepet' ? 'odul' : (f.disc_type === 'odul' ? 'yuzde' : f.disc_type);
    if (f.type === 'kosullu' && c !== 'adet' && f.disc_type === 'xaly') patch.disc_type = 'yuzde';
    set(fixUp(patch));
  };
  const applyTpl = (t) => set({ type: t.type, cond: t.cond || f.cond, disc_type: t.disc_type, disc_value: str(t.disc_value), threshold: str(t.threshold), pay_qty: t.pay_qty ? String(t.pay_qty) : '' });
  const pickCamp = (id) => {
    const c = campOpts.find((x) => x.id === id);
    if (!c || isEdit) { set({ campaign_id: id }); return; }
    const d = campDates(c); const s = new Date(d.start_at), e = new Date(d.end_at);
    set({ campaign_id: id, marketplace: c.marketplace || f.marketplace, sDate: toDateInput(s), sTime: hm(s), eDate: toDateInput(e), eTime: hm(e) });
  };

  const num = (v) => { if (v == null || String(v).trim() === '') return null; const n = parseTL(v) || parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const rec = {
    type: f.type, cond: f.type === 'kosullu' || f.type === 'birlikte' ? f.cond : null, disc_type: f.disc_type,
    disc_value: f.disc_type === 'xaly' ? null : num(f.disc_value), threshold: f.type === 'net' ? null : num(f.threshold),
    pay_qty: f.disc_type === 'xaly' ? parseInt(f.pay_qty, 10) || null : null, code: f.type === 'kod' ? f.code.trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, '') || null : null
  };
  const auto = promoLabel(rec);
  const badXY = rec.disc_type === 'xaly' && rec.threshold && rec.pay_qty && rec.pay_qty >= rec.threshold;
  const invalid = (f.type === 'kod' && !rec.code) || badXY || !f.sDate || !f.eDate || f.eDate < f.sDate;

  const moreRef = useRef(false);
  const setMore = (v) => { moreRef.current = v; };
  const submit = async (ev) => {
    ev.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    const iso = (d, t) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = (t || '00:00').split(':').map(Number); return new Date(y, m - 1, dd, h, mi).toISOString(); };
    try {
      await onSave({ id: initial.id, ...rec, campaign_id: f.campaign_id || null, marketplace: f.marketplace || null, name: f.name.trim() || null,
        reward: f.type === 'birlikte' ? f.reward.trim() || null : null, scope: f.scope, scope_note: f.scope === 'tum' ? null : f.scope_note.trim() || null,
        order_limit: f.order_limit ? parseInt(f.order_limit, 10) || null : null, start_at: iso(f.sDate, f.sTime), end_at: iso(f.eDate, f.eTime),
        note: f.note.trim() || null, ...(isEdit ? {} : { uses: [] }) }, { more: moreRef.current });
    } finally { setBusy(false); }
  };

  const discSeg = (opts) => (
    <div className={'seg' + (opts.length === 3 ? ' three' : '')} role="group" aria-label="İndirim tipi">
      {opts.map(([k, l]) => <button key={k} type="button" className={f.disc_type === k ? 'on' : ''} onClick={() => set({ disc_type: k })}>{l}</button>)}
    </div>
  );
  const field = (id, label, key, ph, mode = 'decimal') => (
    <div className="field"><label htmlFor={id}>{label}</label><input id={id} type="text" inputMode={mode} value={f[key]} onChange={(e) => set({ [key]: e.target.value })} placeholder={ph} /></div>
  );
  const valLbl = f.disc_type === 'tl' ? 'İndirim (₺)' : 'İndirim yüzdesi';
  const valPh = f.disc_type === 'tl' ? '75' : '20';

  return (
    <Sheet title={isEdit ? 'İndirim kurgusu' : 'Yeni indirim kurgusu'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isEdit ? (
          <div className="field">
            <span className="lbl">Standart kurgular <small className="muted">· seçince alanlar dolar, sayıları aşağıdan istediğin gibi değiştirirsin</small></span>
            <div className="typechips">{TEMPLATES.map(([l, t, star]) => <button key={l} type="button" className={'chip' + (auto === promoLabel(t) ? ' on' : '') + (star ? ' pr-star' : '')} onClick={() => applyTpl(t)}>{star ? '⭐ ' : ''}{l}</button>)}</div>
          </div>
        ) : null}

        <div className="row2">
          <div className="field">
            <label htmlFor="pr-camp">Kampanya</label>
            <select id="pr-camp" value={f.campaign_id} onChange={(e) => pickCamp(e.target.value)}>
              {!isEdit ? <option value="__new">＋ Kendi başına kampanya olsun</option> : null}
              <option value="">Kampanyasız (sadece kurgu)</option>
              {campOpts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.marketplace ? ' · ' + c.marketplace : ''} ({fmtShort(fromDateInput(c.start_date))})</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pr-mp">Pazaryeri</label>
            <select id="pr-mp" value={f.marketplace} onChange={(e) => set({ marketplace: e.target.value })}>
              <option value="">Yok</option>
              {MARKETPLACES.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        </div>

        {(() => {
          if (f.campaign_id && f.campaign_id !== '__new') return null;
          const sug = overlapCamps(campOpts, f.marketplace, f.sDate, f.eDate)[0];
          return sug ? (
            <div className="pr-sug">
              <span>🔗 Bu tarihlerde {sug.marketplace || ''} <b>"{sug.name}"</b> kampanyası var. Kurgu onunla birlikte takip edilsin mi?</span>
              <button type="button" className="btn" onClick={() => set({ campaign_id: sug.id })}>{sug.name} kampanyasına bağla</button>
            </div>
          ) : null;
        })()}
        <div className="field">
          <span className="lbl">İndirim türü</span>
          <div className="pr-types" role="radiogroup" aria-label="İndirim türü">
            {PROMO_TYPES.map((t) => (
              <button key={t.k} type="button" role="radio" aria-checked={f.type === t.k} className={'pr-tcard' + (f.type === t.k ? ' on' : '')} style={{ '--t': t.c }} onClick={() => pickType(t.k)}>
                <b>{t.i} {t.l}</b><small>{t.d}</small>
              </button>
            ))}
          </div>
        </div>

        {CONDS[f.type] ? (
          <div className="field">
            <span className="lbl">Koşul tipi</span>
            <div className={'seg pr-seg' + (CONDS[f.type].length === 3 ? ' three' : '')} role="group" aria-label="Koşul tipi">
              {CONDS[f.type].map(([k, l]) => <button key={k} type="button" className={f.cond === k ? 'on' : ''} onClick={() => pickCond(k)}>{l}</button>)}
            </div>
          </div>
        ) : null}

        {/* Değerler: türe ve koşula göre */}
        {f.type === 'kod' ? field('pr-code', 'İndirim kodu', 'code', 'KASIM15', 'text') : null}
        {f.type === 'net' || f.type === 'kod' || (f.type === 'kosullu' && f.cond === 'tutar') || (f.type === 'birlikte' && f.cond === 'tamamlayici') ? discSeg([['yuzde', '% indirim'], ['tl', '₺ indirim']]) : null}
        {f.type === 'kosullu' && f.cond === 'adet' ? discSeg([['yuzde', '% indirim'], ['tl', '₺ indirim'], ['xaly', 'X Al Y Öde']]) : null}
        {f.type === 'kosullu' && f.cond === 'xurun' ? discSeg([['yuzde', '% indirim'], ['tl', '₺ indirim']]) : null}
        <div className="row3 ic-row3">
          {f.type === 'kosullu' && f.cond === 'xurun' ? field('pr-th', 'Kaçıncı ürüne', 'threshold', '2', 'numeric') : null}
          {f.type === 'kosullu' && f.cond === 'adet' ? field('pr-th', f.disc_type === 'xaly' ? 'Alınan adet (X)' : 'Ürün adedi', 'threshold', f.disc_type === 'xaly' ? '5' : '2', 'numeric') : null}
          {f.disc_type === 'xaly' ? field('pr-pay', 'Ödenen adet (Y)', 'pay_qty', '4', 'numeric') : null}
          {f.disc_type === 'odul' ? field('pr-val', 'Ödül ürün fiyatı (₺)', 'disc_value', '1') : f.disc_type !== 'xaly' ? field('pr-val', valLbl, 'disc_value', valPh) : null}
          {(f.type === 'kosullu' && f.cond === 'tutar') || f.type === 'kod' || f.type === 'birlikte' ? field('pr-min', 'Minimum sepet tutarı (₺)', 'threshold', '500') : null}
          {field('pr-lim', f.type === 'kod' ? 'Kullanım adedi' : 'Sipariş adedi limiti', 'order_limit', 'isteğe bağlı', 'numeric')}
        </div>
        {badXY ? <span className="hint" style={{ color: 'var(--danger)', marginTop: -6 }}>Ödenen adet, alınan adetten az olmalı (ör. 5 Al 4 Öde).</span> : null}
        {f.type === 'birlikte' ? (
          <div className="field"><label htmlFor="pr-rw">{f.cond === 'sepet' ? 'Ödül ürün(ler)' : 'Tamamlayıcı ürün(ler)'}</label><input id="pr-rw" type="text" value={f.reward} onChange={(e) => set({ reward: e.target.value })} placeholder="Stok kodu ya da ürün adı" /></div>
        ) : null}

        <div className="pr-preview" style={{ '--t': typeOf(f.type).c }}><span>Kurgu</span><b>{auto}</b></div>

        <div className="field">
          <span className="lbl">İndirimin uygulanacağı ürünler</span>
          <div className="typechips">{SCOPES_C.map(([k, l]) => <button key={k} type="button" className={'chip' + (f.scope === k ? ' on' : '')} onClick={() => set({ scope: k })}>{l}</button>)}</div>
          {f.scope !== 'tum' ? <input type="text" value={f.scope_note} onChange={(e) => set({ scope_note: e.target.value })} placeholder={f.scope === 'marka' ? 'Marka / kategori (ör. Missha maskeler)' : 'Stok kodları (ör. 4682, 4626)'} style={{ marginTop: 8 }} aria-label="Kapsam" /> : null}
        </div>

        <div className="field">
          <label htmlFor="pr-name">İndirim adı (isteğe bağlı)</label>
          <input id="pr-name" type="text" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={auto} />
        </div>
        {f.campaign_id === '__new' ? <p className="hint pr-note">📣 Kaydedince <b>"{f.name.trim() || auto}"</b> adıyla ayrı bir kampanya açılır: kampanya listesinde, takvimde ve Google Takvim'de görünür, hazırlık adımları eklenir. Aynı kampanyaya sonra başka kurgular da ekleyebilirsin.</p> : null}
        <div className="ic-dates">
          <div className="field"><label htmlFor="pr-sd">Başlangıç</label><div className="row2" style={{ gap: 6 }}><input id="pr-sd" type="date" value={f.sDate} onChange={(e) => set({ sDate: e.target.value, ...(f.eDate < e.target.value ? { eDate: e.target.value } : {}) })} required /><input type="time" value={f.sTime} onChange={(e) => set({ sTime: e.target.value })} aria-label="Başlangıç saati" /></div></div>
          <div className="field"><label htmlFor="pr-ed">Bitiş</label><div className="row2" style={{ gap: 6 }}><input id="pr-ed" type="date" value={f.eDate} min={f.sDate} onChange={(e) => set({ eDate: e.target.value })} required /><input type="time" value={f.eTime} onChange={(e) => set({ eTime: e.target.value })} aria-label="Bitiş saati" /></div></div>
        </div>
        <div className="field">
          <label htmlFor="pr-note">Not</label>
          <textarea id="pr-note" rows="2" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="İsteğe bağlı" />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          {isEdit ? <button type="button" className="linkbtn" style={{ color: 'var(--danger)' }} onClick={() => onDelete(initial)}>Sil</button> : <span />}
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!isEdit && f.campaign_id ? <button type="submit" className="btn big" disabled={busy || invalid} onClick={() => setMore(true)}>Kaydet + bir kurgu daha</button> : null}
            <button type="submit" className="btn big primary" disabled={busy || invalid} onClick={() => setMore(false)}>Kaydet</button>
          </span>
        </div>
      </form>
    </Sheet>
  );
}

// ---- Pazaryeri indirim hakları (panelde "Kalan İndirim Hakkı: x / y")
export function PromoQuotaSheet({ mp, quota, onClose, onSave }) {
  const cur = (quota || DEFAULT_QUOTA)[mp] || {};
  const [v, setV] = useState(() => Object.fromEntries(PROMO_TYPES.map((t) => [t.k, cur[t.k] ? String(cur[t.k]) : ''])));
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const row = Object.fromEntries(PROMO_TYPES.map((t) => [t.k, parseInt(v[t.k], 10) || 0]).filter(([, n]) => n > 0));
    const next = { ...(quota || DEFAULT_QUOTA) };
    if (Object.keys(row).length) next[mp] = row; else delete next[mp];
    try { await onSave(next); } finally { setBusy(false); }
  };
  return (
    <Sheet title={'İndirim hakları · ' + mp} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="hint" style={{ margin: 0 }}>Panelde her türün altında yazan toplam hakkı gir (ör. Trendyol'da "Kalan İndirim Hakkı: 44 / <b>50</b>"). Boş bırakılan tür için limit tutulmaz.</p>
        <div className="row2">
          {PROMO_TYPES.map((t) => (
            <div key={t.k} className="field"><label htmlFor={'pq-' + t.k}>{t.i} {t.l}</label><input id={'pq-' + t.k} type="number" min="0" inputMode="numeric" value={v[t.k]} onChange={(e) => setV({ ...v, [t.k]: e.target.value })} placeholder="—" /></div>
          ))}
        </div>
        <button type="submit" className="btn big primary" disabled={busy}>Kaydet</button>
      </form>
    </Sheet>
  );
}
