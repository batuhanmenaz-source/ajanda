// Ciro takibi: aylık özet, günlük grafik, pazaryeri dağılımı, günlük liste ve giriş formu
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Sheet } from './ui.jsx';
import { MARKETPLACES, mpColor } from './constants.js';
import { DailyRevenueChart } from './revchart.jsx';
import { addDays, startOfDay, toDateInput, fromDateInput, fmtShort, fmtLong, dayLabel, WEEKDAYS_SHORT } from './dates.js';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// ---------- Biçimlendirme ----------
export function tl(n, digits = 0) {
  return '₺' + (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function tlShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e6) return '₺' + (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' mn';
  if (Math.abs(v) >= 1e3) return '₺' + (v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' bin';
  return tl(v);
}
// "12.500", "12.500,75", "12500.75", "12 500" → sayı
export function parseTL(s) {
  let t = String(s || '').replace(/[₺\s]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}($|\.)/.test(t)) t = t.replace(/\./g, '');
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0;
}
function inputTL(n) {
  return n ? Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '';
}

// Son 30 günün cirosuna göre çok satandan az satana; hiç girilmemişler varsayılan sırada
export function marketplaceOrder(revenue, now = new Date()) {
  const from = toDateInput(addDays(startOfDay(now), -30));
  const sum = {};
  revenue.forEach((r) => { if (r.day >= from) sum[r.marketplace] = (sum[r.marketplace] || 0) + Number(r.amount); });
  return MARKETPLACES.map((m, i) => ({ ...m, i, s: sum[m.name] || 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((m) => m.name);
}

function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

// ---------- Günlük bakış (Ciro ekranının üstü ve Bugün sayfası) ----------
// Varsayılan gün: dün girildiyse dün, değilse girilmiş en son gün
export function glanceDefaultDay(revenue, now = new Date()) {
  const t = startOfDay(now);
  const y = toDateInput(addDays(t, -1));
  if (revenue.some((r) => r.day === y)) return y;
  const T = toDateInput(t);
  const days = revenue.map((r) => r.day).filter((d) => d <= T).sort();
  return days.length ? days[days.length - 1] : y;
}
function dayStat(revenue, key) {
  const rows = revenue.filter((r) => r.day === key);
  const by = {};
  rows.forEach((r) => { by[r.marketplace] = { v: Number(r.amount), o: Number(r.orders) || 0 }; });
  return { rows, total: rows.reduce((s, r) => s + Number(r.amount), 0), orders: rows.reduce((s, r) => s + (Number(r.orders) || 0), 0), by };
}
const dlt = (a, b) => (b > 0 ? a / b - 1 : null);
function Delta({ v, small }) {
  if (v == null) return null;
  const up = v >= 0;
  return <span className={'gl-d ' + (up ? 'up' : 'down') + (small ? ' sm' : '')}>{up ? '▲' : '▼'} {Math.abs(Math.round(v * 100))}%</span>;
}
const relLabel = (key, now) => {
  const d = fromDateInput(key);
  const lbl = dayLabel(d, now);
  return lbl === fmtShort(d) ? fmtShort(d) + ' ' + WEEKDAYS_SHORT[d.getDay()] : lbl + ' · ' + fmtShort(d);
};

const GECEN = ['geçen pazara', 'geçen pazartesiye', 'geçen salıya', 'geçen çarşambaya', 'geçen perşembeye', 'geçen cumaya', 'geçen cumartesiye'];
const kShort = (v) => (v >= 1e6 ? (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' mn' : v >= 1e3 ? Math.round(v / 1e3).toLocaleString('tr-TR') + ' bin' : Math.round(v).toLocaleString('tr-TR'));

// Küçük çizgi grafik (son 7 gün) — son nokta vurgulu
function Spark({ vals, color }) {
  const mx = Math.max(1, ...vals);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * 100, v ? 26 - (v / mx) * 22 : null]);
  let d = '';
  pts.forEach((p, i) => { if (p[1] == null) return; d += (i && pts[i - 1][1] != null ? ' L' : ' M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
  const last = pts[pts.length - 1];
  return (
    <svg className="rg-spark" viewBox="-3 0 106 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={d.trim() + (d ? '' : '')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity=".85" />
      {last[1] != null ? <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

export function RevenueGlance({ revenue, now, actions, order }) {
  const t = startOfDay(now);
  const T = toDateInput(t);
  const [day, setDay] = useState(() => glanceDefaultDay(revenue, now));
  // Veri sonradan yüklenirse varsayılan günü güncelle (kullanıcı gün değiştirmediyse)
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setDay(glanceDefaultDay(revenue, now)); }, [revenue, now, touched]);
  const pick = (k) => { setTouched(true); setDay(k); };
  const go = (n) => pick(toDateInput(addDays(fromDateInput(day), n)));
  const dd = fromDateInput(day);
  const cur = dayStat(revenue, day);
  const wk = dayStat(revenue, toDateInput(addDays(dd, -7)));
  const prev = dayStat(revenue, toDateInput(addDays(dd, -1)));
  const known = (order || MARKETPLACES.map((m) => m.name)).filter((n) => cur.by[n] || wk.by[n]);
  const mps = known.filter((n) => cur.by[n]).sort((a, b) => cur.by[b].v - cur.by[a].v);
  const missing = known.filter((n) => !cur.by[n]);

  // Son 7 gün (seçili gün en sağda)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(dd, i - 6); const k = toDateInput(d); const st = dayStat(revenue, k);
    return { d, k, total: st.total, by: st.by };
  });
  const wkMax = Math.max(1, ...week.map((x) => x.total));
  const entered = week.filter((x) => x.total > 0);
  const avg7 = entered.length ? entered.reduce((a, x) => a + x.total, 0) / entered.length : 0;
  const stackOrder = (order || MARKETPLACES.map((m) => m.name));
  const mpVals = (n) => week.map((x) => (x.by[n] ? x.by[n].v : 0));

  return (
    <section className="card rg" aria-label="Günlük ciro">
      <div className="rg-top">
        <div className="rg-left">
          <div className="rg-nav">
            <button type="button" className="iconbtn" aria-label="Önceki gün" onClick={() => go(-1)}><Icon.Left /></button>
            <div className="rg-day">
              <span>Günlük ciro</span>
              <b>{relLabel(day, now)}</b>
            </div>
            <button type="button" className="iconbtn" aria-label="Sonraki gün" onClick={() => go(1)} disabled={day >= T}><Icon.Right /></button>
          </div>
          {cur.rows.length ? (
            <>
              <span className="rg-big">{tl(cur.total)}</span>
              <div className="rg-chips">
                {wk.total ? <span className={'rg-chip ' + (cur.total >= wk.total ? 'up' : 'down')}><b>{cur.total >= wk.total ? '▲' : '▼'} %{Math.abs(Math.round(dlt(cur.total, wk.total) * 100))}</b>{GECEN[dd.getDay()]} göre</span> : null}
                {prev.total ? <span className={'rg-chip ' + (cur.total >= prev.total ? 'up' : 'down')}><b>{cur.total >= prev.total ? '▲' : '▼'} %{Math.abs(Math.round(dlt(cur.total, prev.total) * 100))}</b>önceki güne göre</span> : null}
                {avg7 ? <span className={'rg-chip ' + (cur.total >= avg7 ? 'up' : 'down')}><b>{cur.total >= avg7 ? '▲' : '▼'} %{Math.abs(Math.round(dlt(cur.total, avg7) * 100))}</b>7 gün ortalamasına göre</span> : null}
                {cur.orders ? <span className="rg-chip"><b>{cur.orders.toLocaleString('tr-TR')}</b>sipariş</span> : null}
              </div>
            </>
          ) : (
            <div className="gl-empty">
              <span>Bu günün cirosu girilmedi.</span>
              <button type="button" className="btn primary" onClick={() => actions.openRevenue(day)}>Ciro gir</button>
            </div>
          )}
        </div>

        {/* Son 7 gün: pazaryeri renkleriyle katmanlı, güne dokununca o gün seçilir */}
        <div className="rg-week" role="list" aria-label="Son 7 gün">
          {week.map((x) => (
            <button key={x.k} type="button" role="listitem" className={'rg-wcol' + (x.k === day ? ' on' : '') + ([0, 6].includes(x.d.getDay()) ? ' we' : '')}
              disabled={x.k > T} onClick={() => pick(x.k)} aria-label={relLabel(x.k, now) + ': ' + (x.total ? tl(x.total) : 'girilmedi')}>
              <span className="rg-wv">{x.total ? kShort(x.total) : '—'}</span>
              <span className="rg-wbar-wrap">
                <span className="rg-wbar" style={{ height: x.total ? Math.max(4, (x.total / wkMax) * 100) + '%' : '0' }}>
                  {stackOrder.filter((n) => x.by[n]).map((n) => <i key={n} style={{ flexGrow: x.by[n].v, background: mpColor(n) }} />)}
                </span>
              </span>
              <span className="rg-wd"><b>{WEEKDAYS_SHORT[x.d.getDay()]}</b>{x.d.getDate()}</span>
            </button>
          ))}
        </div>
      </div>

      {cur.rows.length ? (
        <div className="rg-table">
          <div className="rg-th"><span>Pazaryeri</span><span>Ciro</span><span className="rg-hide">Pay</span><span>Geçen hafta</span><span className="rg-hide">Son 7 gün</span></div>
          {mps.map((n) => {
            const c = cur.by[n]; const w = wk.by[n]; const share = c.v / cur.total; const dv = w ? dlt(c.v, w.v) : null;
            return (
              <div key={n} className="rg-tr" style={{ '--mp': mpColor(n) }}>
                <span className="rg-name"><i />{n}{c.o ? <small>{c.o} sip.</small> : null}</span>
                <span className="rg-amt">{tl(c.v)}</span>
                <span className="rg-share rg-hide"><span className="rg-sbar"><span style={{ width: share * 100 + '%' }} /></span><em>%{Math.round(share * 100)}</em></span>
                <span className={'rg-dv ' + (dv == null ? '' : dv >= 0 ? 'up' : 'down')}>{dv == null ? '—' : (dv >= 0 ? '▲ ' : '▼ ') + '%' + Math.abs(Math.round(dv * 100))}</span>
                <span className="rg-hide"><Spark vals={mpVals(n)} color={mpColor(n)} /></span>
              </div>
            );
          })}
          {missing.map((n) => (
            <button key={n} type="button" className="rg-tr miss" style={{ '--mp': mpColor(n) }} onClick={() => actions.openRevenue(day)}>
              <span className="rg-name"><i />{n}</span>
              <span className="rg-amt">girilmedi</span>
              <span className="rg-hide" />
              <span className="rg-dv add">+ Gir</span>
              <span className="rg-hide"><Spark vals={mpVals(n)} color={mpColor(n)} /></span>
            </button>
          ))}
        </div>
      ) : null}
      {cur.rows.length ? (
        <div className="rg-foot">
          <span className="hint">"Geçen hafta" = {GECEN[dd.getDay()]} göre değişim</span>
          <button type="button" className="linkbtn" onClick={() => actions.openRevenue(day)}>Bu günü düzenle</button>
        </div>
      ) : null}
    </section>
  );
}

// Bugün sayfası için kısa kart
export function RevenueMini({ revenue, now, actions, onOpen, target }) {
  const day = glanceDefaultDay(revenue, now);
  const y = toDateInput(addDays(startOfDay(now), -1));
  const cur = dayStat(revenue, day);
  const wk = dayStat(revenue, toDateInput(addDays(fromDateInput(day), -7)));
  const top = Object.entries(cur.by).sort((a, b) => b[1].v - a[1].v);
  if (!cur.rows.length || day < toDateInput(addDays(startOfDay(now), -3))) {
    return (
      <section className="card gl-mini empty">
        <span><b>Dünün cirosu</b> henüz girilmedi.</span>
        <button type="button" className="btn primary" onClick={() => actions.openRevenue(y)}>Ciro gir</button>
      </section>
    );
  }
  return (
    <button type="button" className="card gl-mini" onClick={onOpen} aria-label={'Ciro: ' + relLabel(day, now) + ' ' + tl(cur.total) + '. Ciro ekranını aç'}>
      <span className="gl-mini-head">
        <span className="rv-k">{day === y ? 'Dünkü ciro · ' + fmtShort(fromDateInput(day)) : 'Son girilen ciro · ' + relLabel(day, now)}</span>
        <span className="gl-mini-total">{tl(cur.total)} <Delta v={dlt(cur.total, wk.total)} small /></span>
      </span>
      {Number(target) > 0 ? (() => {
        const mk = toDateInput(startOfDay(now)).slice(0, 7);
        const mt = revenue.filter((r) => r.day.startsWith(mk)).reduce((a, r) => a + Number(r.amount), 0);
        const pctv = mt / Number(target);
        const t0 = startOfDay(now);
        const dimv = new Date(t0.getFullYear(), t0.getMonth() + 1, 0).getDate();
        const expect = (t0.getDate() - 1) / dimv;
        return (
          <span className="gl-target">
            <span className="gl-target-top"><span>Aylık hedef</span><b>%{Math.round(pctv * 100)}</b><span className="muted">{tlShort(mt)} / {tlShort(Number(target))}</span></span>
            <span className="gl-target-bar"><span style={{ width: Math.min(100, pctv * 100) + '%' }} className={pctv >= expect ? 'ok' : 'behind'} /><i style={{ left: Math.min(100, expect * 100) + '%' }} title="Bugüne kadar olması gereken" /></span>
          </span>
        );
      })() : null}
      <span className="gl-mini-row">
        {top.slice(0, 6).map(([n, x]) => {
          const w = wk.by[n];
          return (
            <span key={n} className="gl-chip">
              <span className="gl-chip-top"><span className="dot" style={{ background: mpColor(n) }} /><span className="n">{n}</span></span>
              <span className="gl-chip-bot"><b>{tlShort(x.v)}</b>{w ? <Delta v={dlt(x.v, w.v)} small /> : null}</span>
            </span>
          );
        })}

      </span>
    </button>
  );
}

// ---------- Ekran ----------
const MPF_KEY = 'ajanda-ciro-mp';
export function RevenueScreen({ revenue: allRev, loaded, error, target, now, actions, order, campaigns, onSales }) {
  const today = startOfDay(now);
  // Pazaryeri filtresi: seçilince ekrandaki her şey (günlük bakış, özet, grafik, günler) yalnız o pazaryeri
  const [mpF, setMpFRaw] = useState(() => { try { return localStorage.getItem(MPF_KEY) || ''; } catch { return ''; } });
  const setMpF = (v) => { setMpFRaw(v); try { if (v) localStorage.setItem(MPF_KEY, v); else localStorage.removeItem(MPF_KEY); } catch { /* yok say */ } };
  const mpChoices = (order || MARKETPLACES.map((m) => m.name)).filter((n) => allRev.some((r) => r.marketplace === n));
  const revenue = useMemo(() => (mpF ? allRev.filter((r) => r.marketplace === mpF) : allRev), [allRev, mpF]);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [openDay, setOpenDay] = useState(null);

  const mk = monthKey(month);
  const isCurrent = mk === monthKey(today);
  const dim = daysInMonth(month);
  const rows = useMemo(() => revenue.filter((r) => r.day.startsWith(mk)), [revenue, mk]);

  // Günlük toplamlar
  const byDay = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      if (!m[r.day]) m[r.day] = { total: 0, orders: 0, items: [] };
      m[r.day].total += Number(r.amount);
      m[r.day].orders += Number(r.orders) || 0;
      m[r.day].items.push(r);
    });
    return m;
  }, [rows]);
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const orders = rows.reduce((a, r) => a + (Number(r.orders) || 0), 0);
  const enteredDays = Object.keys(byDay).length;

  // Kıyas: geçen ayın aynı dönemi (bu ay ise bugüne kadar, geçmiş ay ise tüm ay)
  const prevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const pk = monthKey(prevMonth);
  const lastEntered = enteredDays ? Math.max(...Object.keys(byDay).map((d) => Number(d.slice(8)))) : 0;
  const cutoff = isCurrent ? Math.min(lastEntered || today.getDate(), daysInMonth(prevMonth)) : daysInMonth(prevMonth);
  const prevRows = revenue.filter((r) => r.day.startsWith(pk) && Number(r.day.slice(8)) <= cutoff);
  const prevTotal = prevRows.reduce((a, r) => a + Number(r.amount), 0);
  const prevLoaded = prevRows.length > 0;
  const delta = prevLoaded && prevTotal > 0 ? (total - prevTotal) / prevTotal : null;

  const avg = enteredDays ? total / enteredDays : 0;
  const forecast = isCurrent && enteredDays ? avg * dim : null;
  const tgt = Number(target) || 0;

  // Pazaryeri dağılımı (çoktan aza) — filtreden bağımsız, tüm pazaryerleri
  const allRows = allRev.filter((r) => r.day.startsWith(mk));
  const allTotal = allRows.reduce((a, r) => a + Number(r.amount), 0);
  const byMp = {};
  allRows.forEach((r) => { byMp[r.marketplace] = (byMp[r.marketplace] || 0) + Number(r.amount); });
  const mpList = Object.entries(byMp).sort((a, b) => b[1] - a[1]);
  const mpMax = mpList.length ? mpList[0][1] : 0;


  const list = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
  const go = (n) => { setOpenDay(null); setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };

  if (error) {
    return <div className="card"><p className="empty">{error}</p></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {mpChoices.length > 1 ? (
        <div className="mp-filter" role="group" aria-label="Pazaryeri filtresi">
          <button type="button" className={'chip' + (!mpF ? ' on' : '')} aria-pressed={!mpF} onClick={() => setMpF('')}>Tümü</button>
          {mpChoices.map((n) => (
            <button key={n} type="button" className={'chip mpf' + (mpF === n ? ' on' : '')} aria-pressed={mpF === n} onClick={() => setMpF(mpF === n ? '' : n)} style={mpF === n ? { background: mpColor(n), borderColor: mpColor(n), color: '#fff' } : null}>
              <span className="dot" style={{ background: mpF === n ? '#fff' : mpColor(n) }} />{n}
            </button>
          ))}
        </div>
      ) : null}
      {loaded ? <RevenueGlance key={mpF || 'all'} revenue={revenue} now={now} actions={actions} order={order} /> : null}
      <div className="section-head" style={{ marginBottom: -8 }}><h2>Aylık görünüm</h2></div>
      <div className="week-nav">
        <button type="button" className="iconbtn" aria-label="Önceki ay" onClick={() => go(-1)}><Icon.Left /></button>
        <span className="lbl">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isCurrent ? <button type="button" className="linkbtn" style={{ marginRight: 6 }} onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}>Bu ay</button> : null}
          <button type="button" className="iconbtn" aria-label="Sonraki ay" onClick={() => go(1)} disabled={isCurrent}><Icon.Right /></button>
        </div>
      </div>

      {/* Özet */}
      <section className="rv-summary card">
        <div className="rv-hero">
          <span className="rv-k">{mpF ? <><span className="dot" style={{ background: mpColor(mpF), display: 'inline-block', marginRight: 6 }} />{mpF} · </> : null}{isCurrent ? 'Bu ay toplam ciro' : MONTHS[month.getMonth()] + ' toplam ciro'}</span>
          <span className="rv-big">{tl(total)}</span>
          {delta !== null ? (
            <span className="rv-delta">
              <span className={'rv-arrow ' + (delta >= 0 ? 'up' : 'down')} aria-hidden="true">{delta >= 0 ? '▲' : '▼'}</span>
              {(delta >= 0 ? '+' : '') + (delta * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}% geçen ayın {isCurrent ? 'aynı dönemine' : 'tamamına'} göre
            </span>
          ) : <span className="rv-delta muted">{loaded ? 'Geçen ayla kıyas için veri yok' : 'Yükleniyor…'}</span>}
          {mpF && allTotal ? <span className="rv-delta muted">Tüm ciro içindeki payı %{Math.round((total / allTotal) * 100)}</span> : null}
        </div>
        <div className="rv-stats">
          <div><span className="rv-k">Günlük ortalama</span><span className="rv-v">{tl(avg)}</span></div>
          {forecast !== null ? <div><span className="rv-k">Ay sonu tahmini</span><span className="rv-v">{tl(forecast)}</span></div> : null}
          <div><span className="rv-k">Sipariş</span><span className="rv-v">{orders ? orders.toLocaleString('tr-TR') : '—'}</span></div>
          <div><span className="rv-k">Girilen gün</span><span className="rv-v">{enteredDays} / {isCurrent ? today.getDate() : dim}</span></div>
        </div>
        {mpF ? null : tgt > 0 ? (
          <div className="rv-target">
            <div className="rv-target-row">
              <span className="rv-k">Aylık hedef {tl(tgt)}</span>
              <button type="button" className="linkbtn" onClick={actions.openTarget}>Değiştir</button>
            </div>
            <div className="progress"><div className="bar"><div style={{ width: Math.min(100, (total / tgt) * 100) + '%' }} /></div><span className="n">%{Math.round((total / tgt) * 100)}</span></div>
            {forecast !== null ? <span className="hint">{forecast >= tgt ? 'Bu hızla hedef aşılıyor.' : 'Hedefe ulaşmak için kalan günlerde günlük ' + tl(Math.max(0, tgt - total) / Math.max(1, dim - today.getDate() + (byDay[toDateInput(today)] ? 0 : 1))) + ' gerekiyor.'}</span> : null}
          </div>
        ) : <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start', padding: '4px 0' }} onClick={actions.openTarget}>+ Aylık hedef belirle</button>}
      </section>

      <button type="button" className="btn primary big" onClick={() => actions.openRevenue(toDateInput(isCurrent ? today : new Date(month.getFullYear(), month.getMonth(), dim)))}>+ Ciro gir</button>
      {onSales ? <button type="button" className="btn big rv-sales" onClick={onSales}>⬆ Pazaryeri Excel raporu yükle<small>Trendyol · Hepsiburada satış raporu</small></button> : null}
      <div className="wl-tools" style={{ marginTop: -8 }}>
        <span className="hint" style={{ flex: '1 1 160px' }}>Excel'e aktar:</span>
        <button type="button" className="btn" onClick={() => actions.exportRevenue(month, 'ay')}>⬇ {MONTHS[month.getMonth()]}</button>
        <button type="button" className="btn" onClick={() => actions.exportRevenue(month, 'yil')}>⬇ {month.getFullYear()} tümü</button>
      </div>

      <DailyRevenueChart month={month} revenue={revenue} campaigns={campaigns} today={today} target={target} onEdit={(k) => actions.openRevenue(k)} />

      {/* Pazaryeri dağılımı */}
      <section className="section">
        <div className="section-head"><h2>Pazaryerleri</h2><span className="meta">{MONTHS[month.getMonth()]} · dokun, filtrele</span></div>
        <div className="card list">
          {mpList.length ? mpList.map(([name, v]) => (
            <button key={name} type="button" className={'rv-mp rv-mp-btn' + (mpF === name ? ' on' : mpF ? ' dim' : '')} onClick={() => setMpF(mpF === name ? '' : name)} aria-pressed={mpF === name}>
              <div className="rv-mp-top">
                <span className="tag"><span className="dot" style={{ background: mpColor(name) }} />{name}</span>
                <span className="rv-mp-v">{tl(v)} <span className="muted">· %{allTotal ? Math.round((v / allTotal) * 100) : 0}</span></span>
              </div>
              <div className="rv-mp-bar"><div style={{ width: (v / mpMax) * 100 + '%' }} /></div>
            </button>
          )) : <p className="empty">{loaded ? 'Bu ay için ciro girilmedi.' : 'Yükleniyor…'}</p>}
        </div>
      </section>

      {/* Günlük liste */}
      <section className="section">
        <div className="section-head"><h2>Günler</h2><span className="meta">{list.length ? list.length + ' gün' : ''}</span></div>
        <div className="card list">
          {list.length ? list.map((k) => {
            const d = fromDateInput(k);
            const info = byDay[k];
            const items = info.items.slice().sort((a, b) => b.amount - a.amount);
            const open = openDay === k;
            return (
              <div key={k} className="rv-day">
                <button type="button" className="rowbtn rv-day-head" onClick={() => setOpenDay(open ? null : k)} aria-expanded={open}>
                  <span className="rv-day-date"><b>{d.getDate()} {MONTHS[d.getMonth()]}</b> <span className="muted">{WEEKDAYS_SHORT[d.getDay()]}</span></span>
                  <span className="rv-day-total">{tl(info.total)}</span>
                </button>
                {open ? (
                  <div className="rv-day-body">
                    {items.map((r) => (
                      <div key={r.id} className="rv-day-row">
                        <span className="tag"><span className="dot" style={{ background: mpColor(r.marketplace) }} />{r.marketplace}</span>
                        <span>{tl(r.amount)}{r.orders ? <span className="muted"> · {r.orders} sipariş</span> : null}</span>
                      </div>
                    ))}
                    <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => actions.openRevenue(k)}>Düzenle</button>
                  </div>
                ) : (
                  <div className="rv-day-chips">
                    {items.slice(0, 3).map((r) => <span key={r.id} className="tag"><span className="dot" style={{ background: mpColor(r.marketplace) }} />{tlShort(r.amount)}</span>)}
                    {items.length > 3 ? <span className="muted">+{items.length - 3}</span> : null}
                  </div>
                )}
              </div>
            );
          }) : <p className="empty">{loaded ? 'Henüz gün yok. "+ Ciro gir" ile başla.' : 'Yükleniyor…'}</p>}
        </div>
      </section>
    </div>
  );
}

// ---------- Giriş formu ----------
export function RevenueSheet({ initialDay, revenue, order, onClose, onSave }) {
  const today = toDateInput(new Date());
  const [day, setDay] = useState(initialDay || today);
  const [vals, setVals] = useState({});
  const [ords, setOrds] = useState({});
  const [showOrders, setShowOrders] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seçilen günün kayıtlı değerlerini doldur
  useEffect(() => {
    const v = {}; const o = {};
    revenue.filter((r) => r.day === day).forEach((r) => { v[r.marketplace] = inputTL(r.amount); if (r.orders) o[r.marketplace] = String(r.orders); });
    setVals(v); setOrds(o);
    if (Object.keys(o).length) setShowOrders(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const total = order.reduce((a, mp) => a + parseTL(vals[mp]), 0);
  const d = fromDateInput(day);
  const yest = toDateInput(addDays(startOfDay(new Date()), -1));

  // Son 28 gün: hangisi girildi, hangisi eksik (bugün henüz girilmediyse eksik sayılmaz)
  const entered = useMemo(() => new Set(revenue.map((r) => r.day)), [revenue]);
  const strip = useMemo(() => Array.from({ length: 28 }, (_, i) => toDateInput(addDays(startOfDay(new Date()), i - 27))), []);
  const isMissing = (k) => !entered.has(k) && k !== today;
  const stripRef = useRef(null);
  useEffect(() => {
    const el = stripRef.current && stripRef.current.querySelector('[aria-current="date"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [day]);

  // Kaydet: pencere açık kalır, şeritten başka güne geçilebilir. "Kaydet ve kapat" kapatır.
  const doSave = async (close) => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(day, order.map((mp) => ({ marketplace: mp, amount: parseTL(vals[mp]), orders: ords[mp] ? parseInt(ords[mp], 10) || null : null })), { keepOpen: !close });
    } finally { setBusy(false); }
  };
  const submit = (e) => { e.preventDefault(); doSave(false); };

  return (
    <Sheet title="Ciro gir" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="rv-day">Gün</label>
          <div className="rv-daynav">
            <button type="button" className="iconbtn" aria-label="Önceki gün" onClick={() => setDay(toDateInput(addDays(d, -1)))}><Icon.Left /></button>
            <input id="rv-day" type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
            <button type="button" className="iconbtn" aria-label="Sonraki gün" disabled={day >= today} onClick={() => setDay(toDateInput(addDays(d, 1)))}><Icon.Right /></button>
          </div>
          <div className="rv-strip" ref={stripRef} role="group" aria-label="Son 4 hafta">
            {strip.map((k) => {
              const x = fromDateInput(k);
              const st = entered.has(k) ? 'ok' : isMissing(k) ? 'miss' : 'today';
              return (
                <button key={k} type="button" className={'rv-sd ' + st + (k === day ? ' on' : '')} aria-current={k === day ? 'date' : undefined}
                  aria-label={fmtLong(x) + (st === 'ok' ? ', girildi' : st === 'miss' ? ', eksik' : '')} onClick={() => setDay(k)}>
                  <span className="w">{['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][x.getDay()]}</span>
                  <span className="n">{x.getDate()}</span>
                  <span className="s" aria-hidden="true">{st === 'ok' ? '✓' : st === 'miss' ? '•' : ''}</span>
                </button>
              );
            })}
          </div>
          <span className="hint" style={{ marginTop: 0 }}>{strip.filter(isMissing).length ? 'Son 4 haftada ' + strip.filter(isMissing).length + ' gün eksik (• işaretliler). Dokunarak geç.' : 'Son 4 haftanın tamamı girilmiş.'}</span>
          <div className="typechips">
            <button type="button" className={'chip' + (day === today ? ' on' : '')} onClick={() => setDay(today)}>Bugün</button>
            <button type="button" className={'chip' + (day === yest ? ' on' : '')} onClick={() => setDay(yest)}>Dün</button>
            <span className="hint" style={{ alignSelf: 'center' }}>{dayLabel(d) === fmtShort(d) ? fmtLong(d) : dayLabel(d) + ' · ' + fmtShort(d)}</span>
          </div>
        </div>

        <div className="rv-form">
          {order.map((mp, i) => (
            <div key={mp} className="rv-form-row">
              <label htmlFor={'rv-' + i} className="tag"><span className="dot" style={{ background: mpColor(mp) }} />{mp}</label>
              <div className="rv-inputs">
                <input id={'rv-' + i} className="rv-amount" type="text" inputMode="decimal" autoComplete="off" placeholder="₺0" value={vals[mp] || ''}
                  onChange={(e) => setVals({ ...vals, [mp]: e.target.value })}
                  onBlur={(e) => { const n = parseTL(e.target.value); setVals((v) => ({ ...v, [mp]: n ? inputTL(n) : '' })); }} />
                {showOrders ? (
                  <input className="rv-orders" type="text" inputMode="numeric" autoComplete="off" placeholder="sipariş" aria-label={mp + ' sipariş adedi'} value={ords[mp] || ''}
                    onChange={(e) => setOrds({ ...ords, [mp]: e.target.value.replace(/\D/g, '') })} />
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {!showOrders ? <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => setShowOrders(true)}>+ Sipariş adedi de gir</button> : null}

        <div className="rv-total"><span>Günün toplamı</span><b>{tl(total, total % 1 ? 2 : 0)}</b></div>
        <p className="hint" style={{ margin: 0 }}>Pazaryerleri son 30 günün cirosuna göre çok satandan az satana sıralanır. Boş bıraktıkların kaydedilmez; daha önce girdiğin bir değeri silersen o kayıt kaldırılır.</p>
        <div className="rv-actions">
          <button type="submit" className="btn big primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button type="button" className="btn big" disabled={busy} onClick={() => doSave(true)}>Kaydet ve kapat</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Hedef ----------
export function TargetSheet({ value, onClose, onSave }) {
  const [v, setV] = useState(value ? inputTL(value) : '');
  return (
    <Sheet title="Aylık ciro hedefi" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(parseTL(v) || null); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="rv-target">Tüm pazaryerleri toplamı için aylık hedef</label>
          <input id="rv-target" type="text" inputMode="decimal" autoComplete="off" placeholder="₺0" value={v} onChange={(e) => setV(e.target.value)}
            onBlur={() => { const n = parseTL(v); setV(n ? inputTL(n) : ''); }} />
        </div>
        <div className="actions">
          {value ? <button type="button" className="btn big" onClick={() => onSave(null)}>Hedefi kaldır</button> : null}
          <button type="submit" className="btn big primary">Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}
