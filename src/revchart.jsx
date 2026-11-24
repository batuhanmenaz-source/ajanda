// Ciro ekranı: sade günlük ciro grafiği
// - Varsayılan "Toplam": tek renk, ortalamanın (ya da günlük hedefin) altındaki günler açık tonda
// - "Pazaryeri": pazaryeri renkleriyle katmanlı
// - Tek referans çizgisi (ortalama/hedef), kampanya günleri hafif zemin; bir güne dokununca dökümü
import { useEffect, useMemo, useState } from 'react';
import { mpColor } from './constants.js';
import { toDateInput, addDays, WEEKDAYS_SHORT } from './dates.js';
import { tl, tlShort } from './revenue.jsx';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// Eksen için "yuvarlak" üst sınır: 1, 2, 2.5, 5 × 10^n
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 4, 4.8, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const axisLbl = (v) => (v >= 1e6 ? (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' mn' : v >= 1e3 ? Math.round(v / 1e3).toLocaleString('tr-TR') + ' bin' : String(Math.round(v)));
const pctTxt = (v) => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 100)) + '%';

// Kampanya şeritlerini çakışmayacak şekilde satırlara yerleştir (en fazla 3 satır)
function laneCampaigns(camps) {
  const lanes = [];
  return camps.map((c) => {
    let l = lanes.findIndex((end) => end < c.s);
    if (l === -1) { l = lanes.length; lanes.push(0); }
    lanes[l] = c.e;
    return { ...c, lane: l };
  }).filter((c) => c.lane < 3);
}

export function DailyRevenueChart({ month, revenue, campaigns, today, target, onEdit }) {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('ajanda-rch-mode') || 'total'; } catch { return 'total'; } });
  const setModeS = (v) => { setMode(v); try { localStorage.setItem('ajanda-rch-mode', v); } catch { /* yok say */ } };
  const [sel, setSel] = useState(null);

  const y = month.getFullYear(); const mo = month.getMonth();
  const dim = new Date(y, mo + 1, 0).getDate();
  const mk = y + '-' + String(mo + 1).padStart(2, '0');
  const todayKey = toDateInput(today);

  // Gün → { total, by: {mp: amount} } (bu ay + kıyas için önceki 7 gün)
  const index = useMemo(() => {
    const m = {};
    revenue.forEach((r) => {
      if (!m[r.day]) m[r.day] = { total: 0, by: {} };
      const v = Number(r.amount) || 0;
      m[r.day].total += v;
      m[r.day].by[r.marketplace] = (m[r.day].by[r.marketplace] || 0) + v;
    });
    return m;
  }, [revenue]);

  const days = Array.from({ length: dim }, (_, i) => {
    const d = new Date(y, mo, i + 1);
    const key = toDateInput(d);
    const e = index[key];
    return { i, d, key, v: e ? e.total : 0, by: e ? e.by : {}, future: key > todayKey, we: [0, 6].includes(d.getDay()) };
  });
  const entered = days.filter((x) => x.v > 0);
  const avg = entered.length ? entered.reduce((a, x) => a + x.v, 0) / entered.length : 0;
  const tgt = Number(target) || 0;
  const ref = tgt > 0 ? tgt / dim : avg;
  const refName = tgt > 0 ? 'Günlük hedef' : 'Ortalama';

  // Bu ay görünen pazaryerleri: aylık toplamı büyükten küçüğe (büyük olan en altta)
  const mpTotals = {};
  entered.forEach((x) => Object.entries(x.by).forEach(([n, v]) => { mpTotals[n] = (mpTotals[n] || 0) + v; }));
  const mps = Object.keys(mpTotals).sort((a, b) => mpTotals[b] - mpTotals[a]);

  const maxV = niceMax(Math.max(ref * 1.1, ...days.map((x) => x.v)));
  const ticks = [0, 0.5, 1].map((f) => f * maxV);
  const best = entered.reduce((b, x) => (!b || x.v > b.v ? x : b), null);

  // Kampanyalar (bu aya değenler)
  const monthStart = mk + '-01'; const monthEnd = mk + '-' + String(dim).padStart(2, '0');
  const camps = laneCampaigns((campaigns || [])
    .filter((c) => c.start_date && c.end_date && c.start_date <= monthEnd && c.end_date >= monthStart)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((c) => {
      const s = c.start_date < monthStart ? 1 : Number(c.start_date.slice(8));
      const e = c.end_date > monthEnd ? dim : Number(c.end_date.slice(8));
      return { id: c.id, name: c.name, mp: c.marketplace, s, e, color: c.marketplace ? mpColor(c.marketplace) : '#5F3DC4' };
    }));
  
  // Seçili gün: varsayılan olarak girilmiş son gün
  const defaultSel = entered.length ? entered[entered.length - 1].key : null;
  useEffect(() => { setSel(null); }, [mk]);
  const selKey = sel || defaultSel;
  const sd = days.find((x) => x.key === selKey);
  const wk = sd ? index[toDateInput(addDays(sd.d, -7))] : null;
  const prevDay = sd ? index[toDateInput(addDays(sd.d, -1))] : null;
  const selCamps = sd ? camps.filter((c) => sd.i + 1 >= c.s && sd.i + 1 <= c.e) : [];

  const tone = (v) => (!ref || v >= ref ? 'hi' : 'lo');

  return (
    <section className="section">
      <div className="section-head">
        <h2>Günlük ciro</h2>
        <div className="rch-mode" role="tablist" aria-label="Grafik görünümü">
          <button type="button" role="tab" aria-selected={mode === 'mp'} className={mode === 'mp' ? 'on' : ''} onClick={() => setModeS('mp')}>Pazaryeri</button>
          <button type="button" role="tab" aria-selected={mode === 'total'} className={mode === 'total' ? 'on' : ''} onClick={() => setModeS('total')}>Toplam</button>
        </div>
      </div>

      <div className="card rch-card">
        <div className="rch-plot-wrap">
          {/* Tutar ekseni */}
          <div className="rch-yaxis" aria-hidden="true">
            {ticks.slice().reverse().map((t, i) => <span key={i}>{axisLbl(t)}</span>)}
          </div>

          <div className="rch-main">
            <div className="rch-plot" style={{ '--n': dim }}>
              {/* Izgara */}
              {ticks.map((t, i) => <span key={i} className={'rch-grid' + (i === 0 ? ' base' : '')} style={{ bottom: (t / maxV) * 100 + '%' }} aria-hidden="true" />)}
              {/* Kampanya günleri zemini */}
              {camps.map((c) => (
                <span key={'bg' + (c.id || c.name + c.s)} className="rch-campbg" aria-hidden="true" title={c.name}
                  style={{ left: ((c.s - 1) / dim) * 100 + '%', width: ((c.e - c.s + 1) / dim) * 100 + '%' }} />
              ))}

              <div className="rch-cols" role="list" aria-label="Günlük ciro grafiği">
                {days.map((x) => {
                  const h = (x.v / maxV) * 100;
                  const on = x.key === selKey;
                  return (
                    <button key={x.key} type="button" role="listitem"
                      className={'rch-col' + (x.we ? ' we' : '') + (on ? ' on' : '') + (x.future ? ' future' : '') + (x.key === todayKey ? ' today' : '')}
                      disabled={x.future} onClick={() => setSel(x.key)} onMouseEnter={() => !x.future && x.v && setSel(x.key)}
                      aria-label={x.d.getDate() + ' ' + MONTHS[mo] + ': ' + (x.v ? tl(x.v) : 'girilmedi')}>
                      {x.v ? (
                        <span className={'rch-stack' + (mode === 'total' ? ' t-' + tone(x.v) : '')} style={{ height: Math.max(1.5, h) + '%' }}>
                          {mode === 'mp' ? mps.filter((n) => x.by[n]).map((n) => (
                            <span key={n} className="rch-seg" style={{ flexGrow: x.by[n], background: mpColor(n) }} />
                          )) : null}
                        </span>
                      ) : (!x.future ? <span className="rch-empty" /> : null)}
                      {on && x.v ? <span className="rch-tip" style={{ bottom: Math.min(92, h) + '%' }}>{tlShort(x.v)}</span> : null}
                    </button>
                  );
                })}
              </div>

              {/* Ortalama / hedef çizgisi */}
              {ref > 0 ? (
                <div className="rch-ref" style={{ bottom: (ref / maxV) * 100 + '%' }} aria-hidden="true">
                  <span>{refName.toLowerCase()} {tlShort(ref)}</span>
                </div>
              ) : null}
            </div>

            {/* Gün ekseni */}
            <div className="rch-xaxis" style={{ '--n': dim }} aria-hidden="true">
              {days.map((x) => (
                <span key={x.key} className={(x.we ? 'we ' : '') + (x.key === selKey ? 'on ' : '') + (x.key === todayKey ? 'today' : '')}>
                  <b>{x.i + 1}</b>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Lejant */}
        <div className="rch-legend">
          {mode === 'mp'
            ? mps.map((n) => <span key={n}><i style={{ background: mpColor(n) }} />{n}</span>)
            : <><span><i className="t-hi" />{refName.toLowerCase()} ve üstü</span><span><i className="t-lo" />{refName.toLowerCase()} altı</span></>}
          {ref > 0 ? <span><i className="ln-ref" />{refName.toLowerCase()} {tlShort(ref)}</span> : null}
          {camps.length ? <span><i className="campbg" />kampanya günü</span> : null}
          {best ? <span className="rch-best">En iyi gün: <b>{best.d.getDate()} {MONTHS[mo].slice(0, 3)} · {tlShort(best.v)}</b></span> : null}
        </div>

        {/* Seçili gün dökümü */}
        {sd && sd.v ? (
          <div className="rch-detail">
            <div className="rch-detail-head">
              <div>
                <span className="rch-detail-date">{sd.d.getDate()} {MONTHS[mo]} {WEEKDAYS_SHORT[sd.d.getDay()]}</span>
                <span className="rch-detail-total">{tl(sd.v)}</span>
              </div>
              <div className="rch-badges">
                {ref ? <span className={'rch-badge ' + (sd.v >= ref ? 'up' : 'down')}>{pctTxt(sd.v / ref - 1)} {refName.toLowerCase()}</span> : null}
                {wk && wk.total ? <span className={'rch-badge ' + (sd.v >= wk.total ? 'up' : 'down')}>{pctTxt(sd.v / wk.total - 1)} geçen hafta</span> : null}
                {prevDay && prevDay.total ? <span className={'rch-badge ' + (sd.v >= prevDay.total ? 'up' : 'down')}>{pctTxt(sd.v / prevDay.total - 1)} önceki gün</span> : null}
              </div>
            </div>
            {selCamps.length ? (
              <div className="rch-detail-camps">
                {selCamps.map((c) => <span key={c.id || c.name} style={{ '--c': c.color }}>{c.name}</span>)}
              </div>
            ) : null}
            <div className="rch-mini">
              {Object.entries(sd.by).sort((x, y) => y[1] - x[1]).map(([n, v]) => <span key={n}><i style={{ background: mpColor(n) }} />{n} <b>{tlShort(v)}</b></span>)}
            </div>
            <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => onEdit(sd.key)}>Bu günü düzenle</button>
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>{entered.length ? 'Ayrıntı için bir güne dokun.' : 'Bu ay için ciro girilmedi.'}</p>
        )}
      </div>
    </section>
  );
}

