// Ciro takibi: aylık özet, günlük grafik, pazaryeri dağılımı, günlük liste ve giriş formu
import { useEffect, useMemo, useState } from 'react';
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

// ---------- Ekran ----------
export function RevenueScreen({ revenue, loaded, error, target, now, actions }) {
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
  const hoverDay = hover ? days.find((x) => x.key === hover) : null;

  const list = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
  const go = (n) => { setHover(null); setOpenDay(null); setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };

  if (error) {
    return <div className="card"><p className="empty">{error}</p></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
            {days.map((x) => (
              <button type="button" role="listitem" key={x.key} className={'rv-col' + (hover === x.key ? ' on' : '') + (x.future ? ' future' : '')}
                onMouseEnter={() => setHover(x.key)} onFocus={() => setHover(x.key)} onClick={() => setHover(x.key)}
                aria-label={fmtLong(x.d) + ': ' + (x.v ? tl(x.v) : 'girilmedi')}>
                <span className="rv-bar" style={{ height: x.v ? Math.max(3, (x.v / maxV) * 100) + '%' : 0 }} />
              </button>
            ))}
          </div>
          <div className="rv-axis" aria-hidden="true">
            <span>1</span><span>{Math.round(dim / 2)}</span><span>{dim}</span>
          </div>
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

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSave(day, order.map((mp) => ({ marketplace: mp, amount: parseTL(vals[mp]), orders: ords[mp] ? parseInt(ords[mp], 10) || null : null })));
    } finally { setBusy(false); }
  };

  return (
    <Sheet title="Ciro gir" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="rv-day">Gün</label>
          <input id="rv-day" type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
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
        <button type="submit" className="btn big primary" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
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
