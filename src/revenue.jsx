// Ciro takibi: aylık özet, günlük grafik, pazaryeri dağılımı, günlük liste ve giriş formu
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Sheet } from './ui.jsx';
import { MARKETPLACES, mpColor } from './constants.js';
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

export function RevenueGlance({ revenue, now, actions, order }) {
  const t = startOfDay(now);
  const T = toDateInput(t);
  const [day, setDay] = useState(() => glanceDefaultDay(revenue, now));
  // Veri sonradan yüklenirse varsayılan günü güncelle (kullanıcı gün değiştirmediyse)
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setDay(glanceDefaultDay(revenue, now)); }, [revenue, now, touched]);
  const go = (n) => { setTouched(true); setDay(toDateInput(addDays(fromDateInput(day), n))); };
  const cur = dayStat(revenue, day);
  const wk = dayStat(revenue, toDateInput(addDays(fromDateInput(day), -7)));
  const prev = dayStat(revenue, toDateInput(addDays(fromDateInput(day), -1)));
  const known = (order || MARKETPLACES.map((m) => m.name)).filter((n) => cur.by[n] || wk.by[n]);
  const mps = known.filter((n) => cur.by[n]).sort((a, b) => cur.by[b].v - cur.by[a].v);
  // Geçen hafta girilmiş ama bu gün girilmemiş pazaryerleri: küçük satır
  const missing = known.filter((n) => !cur.by[n]);
  // Her pazaryeri için son 7 gün (seçili gün dahil)
  const last7 = Array.from({ length: 7 }, (_, i) => toDateInput(addDays(fromDateInput(day), i - 6)));
  const spark = (mp) => {
    const vals = last7.map((k) => { const r = revenue.find((x) => x.day === k && x.marketplace === mp); return r ? Number(r.amount) : 0; });
    const mx = Math.max(1, ...vals);
    return vals.map((v, i) => ({ v, h: v ? Math.max(8, (v / mx) * 100) : 0, last: i === 6 }));
  };
  return (
    <section className="card gl" aria-label="Günlük ciro">
      <div className="gl-head">
        <button type="button" className="iconbtn" aria-label="Önceki gün" onClick={() => go(-1)}><Icon.Left /></button>
        <div className="gl-title">
          <span className="rv-k">Günlük ciro</span>
          <span className="gl-day">{relLabel(day, now)}</span>
        </div>
        <button type="button" className="iconbtn" aria-label="Sonraki gün" onClick={() => go(1)} disabled={day >= T}><Icon.Right /></button>
      </div>
      {cur.rows.length ? (
        <>
          <div className="gl-total">
            <span className="rv-big">{tl(cur.total)}</span>
            <span className="gl-sub">
              <Delta v={dlt(cur.total, wk.total)} />{wk.total ? ' geçen ' + ['pazara', 'pazartesiye', 'salıya', 'çarşambaya', 'perşembeye', 'cumaya', 'cumartesiye'][fromDateInput(day).getDay()] + ' göre' : ''}
              {prev.total ? <span className="muted"> · önceki gün {tlShort(prev.total)}</span> : null}
              {cur.orders ? <span className="muted"> · {cur.orders.toLocaleString('tr-TR')} sipariş</span> : null}
            </span>
          </div>
          <div className="gl-grid">
            {mps.map((n) => {
              const c = cur.by[n];
              const w = wk.by[n];
              return (
                <div key={n} className="gl-tile">
                  <span className="tag"><span className="dot" style={{ background: mpColor(n) }} />{n}</span>
                  <span className="gl-v">{c ? tl(c.v) : '—'}</span>
                  <span className="gl-meta">
                    {c && w ? <Delta v={dlt(c.v, w.v)} small /> : <span className="muted">{c ? 'geçen hafta yok' : 'girilmedi'}</span>}
                    {c && c.o ? <span className="muted">{c.o} sip.</span> : null}
                  </span>
                  <span className="gl-spark" aria-hidden="true">
                    {spark(n).map((x, i) => <span key={i} className={x.last ? 'on' : ''} style={{ height: x.h + '%', background: x.v ? mpColor(n) : 'transparent' }} />)}
                  </span>
                </div>
              );
            })}
          </div>
          {missing.length ? (
            <div className="gl-missing">
              <span className="muted">Girilmedi:</span>
              {missing.map((n) => <button key={n} type="button" className="gl-miss" onClick={() => actions.openRevenue(day)}><span className="dot" style={{ background: mpColor(n) }} />{n}</button>)}
            </div>
          ) : null}
          <span className="hint">Yüzdeler geçen haftanın aynı gününe göre · çubuklar son 7 gün</span>
          <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => actions.openRevenue(day)}>Bu günü düzenle</button>
        </>
      ) : (
        <div className="gl-empty">
          <span>Bu günün cirosu girilmedi.</span>
          <button type="button" className="btn primary" onClick={() => actions.openRevenue(day)}>Ciro gir</button>
        </div>
      )}
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
export function RevenueScreen({ revenue, loaded, error, target, now, actions, order }) {
  const today = startOfDay(now);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [hover, setHover] = useState(null);
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

  // Pazaryeri dağılımı (çoktan aza)
  const byMp = {};
  rows.forEach((r) => { byMp[r.marketplace] = (byMp[r.marketplace] || 0) + Number(r.amount); });
  const mpList = Object.entries(byMp).sort((a, b) => b[1] - a[1]);
  const mpMax = mpList.length ? mpList[0][1] : 0;

  // Günlük grafik
  const days = Array.from({ length: dim }, (_, i) => {
    const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
    const key = toDateInput(d);
    return { d, key, v: byDay[key] ? byDay[key].total : 0, future: d > today };
  });
  const maxV = Math.max(1, ...days.map((x) => x.v));
  // Kıyas çizgisi: hedef varsa günlük hedef, yoksa ayın günlük ortalaması
  const ref = (Number(target) || 0) > 0 ? Number(target) / dim : avg;
  const refLabel = (Number(target) || 0) > 0 ? 'günlük hedef' : 'günlük ortalama';
  const hoverDay = hover ? days.find((x) => x.key === hover) : null;

  const list = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
  const go = (n) => { setHover(null); setOpenDay(null); setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };

  if (error) {
    return <div className="card"><p className="empty">{error}</p></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {loaded ? <RevenueGlance revenue={revenue} now={now} actions={actions} order={order} /> : null}
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
          <span className="rv-k">{isCurrent ? 'Bu ay toplam ciro' : MONTHS[month.getMonth()] + ' toplam ciro'}</span>
          <span className="rv-big">{tl(total)}</span>
          {delta !== null ? (
            <span className="rv-delta">
              <span className={'rv-arrow ' + (delta >= 0 ? 'up' : 'down')} aria-hidden="true">{delta >= 0 ? '▲' : '▼'}</span>
              {(delta >= 0 ? '+' : '') + (delta * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}% geçen ayın {isCurrent ? 'aynı dönemine' : 'tamamına'} göre
            </span>
          ) : <span className="rv-delta muted">{loaded ? 'Geçen ayla kıyas için veri yok' : 'Yükleniyor…'}</span>}
        </div>
        <div className="rv-stats">
          <div><span className="rv-k">Günlük ortalama</span><span className="rv-v">{tl(avg)}</span></div>
          {forecast !== null ? <div><span className="rv-k">Ay sonu tahmini</span><span className="rv-v">{tl(forecast)}</span></div> : null}
          <div><span className="rv-k">Sipariş</span><span className="rv-v">{orders ? orders.toLocaleString('tr-TR') : '—'}</span></div>
          <div><span className="rv-k">Girilen gün</span><span className="rv-v">{enteredDays} / {isCurrent ? today.getDate() : dim}</span></div>
        </div>
        {tgt > 0 ? (
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
      <div className="wl-tools" style={{ marginTop: -8 }}>
        <span className="hint" style={{ flex: '1 1 160px' }}>Excel'e aktar:</span>
        <button type="button" className="btn" onClick={() => actions.exportRevenue(month, 'ay')}>⬇ {MONTHS[month.getMonth()]}</button>
        <button type="button" className="btn" onClick={() => actions.exportRevenue(month, 'yil')}>⬇ {month.getFullYear()} tümü</button>
      </div>

      {/* Günlük grafik */}
      <section className="section">
        <div className="section-head">
          <h2>Günlük ciro</h2>
          <span className="meta" aria-live="polite">{hoverDay ? fmtShort(hoverDay.d) + ' · ' + (hoverDay.v ? tl(hoverDay.v) : 'girilmedi') : 'Bir çubuğa dokun'}</span>
        </div>
        <div className="card rv-chart" onMouseLeave={() => setHover(null)}>
          <div className="rv-bars" role="list" aria-label="Günlük ciro grafiği">
            {ref > 0 ? <span className="rv-ref" style={{ bottom: Math.min(100, (ref / maxV) * 100) + '%' }} aria-hidden="true" /> : null}
            {days.map((x) => (
              <button type="button" role="listitem" key={x.key} className={'rv-col' + (hover === x.key ? ' on' : '') + (x.future ? ' future' : '') + ([0, 6].includes(x.d.getDay()) ? ' we' : '') + (x.v && ref > 0 && x.v < ref ? ' low' : '')}
                onMouseEnter={() => setHover(x.key)} onFocus={() => setHover(x.key)} onClick={() => setHover(x.key)}
                aria-label={fmtLong(x.d) + ': ' + (x.v ? tl(x.v) : 'girilmedi')}>
                <span className="rv-bar" style={{ height: x.v ? Math.max(3, (x.v / maxV) * 100) + '%' : 0 }} />
              </button>
            ))}
          </div>
          <div className="rv-axis" aria-hidden="true">
            <span>1</span><span>{Math.round(dim / 2)}</span><span>{dim}</span>
          </div>
          {ref > 0 ? (
            <div className="rv-legend">
              <span><i className="hi" />{refLabel} üstü</span>
              <span><i className="lo" />altı</span>
              <span><i className="ln" />{refLabel} {tlShort(ref)}</span>
              <span><i className="we" />hafta sonu</span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Pazaryeri dağılımı */}
      <section className="section">
        <div className="section-head"><h2>Pazaryerleri</h2><span className="meta">{MONTHS[month.getMonth()]}</span></div>
        <div className="card list">
          {mpList.length ? mpList.map(([name, v]) => (
            <div key={name} className="rv-mp">
              <div className="rv-mp-top">
                <span className="tag"><span className="dot" style={{ background: mpColor(name) }} />{name}</span>
                <span className="rv-mp-v">{tl(v)} <span className="muted">· %{total ? Math.round((v / total) * 100) : 0}</span></span>
              </div>
              <div className="rv-mp-bar"><div style={{ width: (v / mpMax) * 100 + '%' }} /></div>
            </div>
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
