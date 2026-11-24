// Ciro → ay analizi: ayın gidişatı (geçen ayla kümülatif kıyas, tahmin, hedef), kampanya etkisi, haftalar, günlük çubuklar.
// Yalnız zaten yüklü ciro kayıtlarından hesaplanır.
import { useMemo, useState } from 'react';
import { mpColor } from './constants.js';
import { toDateInput, addDays, WEEKDAYS_SHORT } from './dates.js';
import { tl, tlShort } from './revenue.jsx';
import { DailyRevenueChart } from './revchart.jsx';

const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const pct = (v) => (v == null || !Number.isFinite(v) ? '' : (v >= 0 ? '+' : '−') + '%' + Math.abs(Math.round(v * 100)));
const tone = (v) => (v == null ? '' : v >= 0.02 ? 'up' : v <= -0.02 ? 'down' : 'flat');
const axis = (v) => (v >= 1e6 ? (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' mn' : v >= 1e3 ? Math.round(v / 1e3) + ' bin' : String(Math.round(v)));

export function MonthRevenueAnalysis({ month, revenue, campaigns, today, target, onEdit }) {
  const [tab, setTabS] = useState(() => { try { return localStorage.getItem('ajanda-rv-tab') || 'gidis'; } catch { return 'gidis'; } });
  const setTab = (v) => { setTabS(v); try { localStorage.setItem('ajanda-rv-tab', v); } catch { /* yok say */ } };
  const [hov, setHov] = useState(null);

  const y = month.getFullYear(), mo = month.getMonth();
  const dim = new Date(y, mo + 1, 0).getDate();
  const pdim = new Date(y, mo, 0).getDate();
  const todayKey = toDateInput(today);

  const idx = useMemo(() => {
    const m = {};
    revenue.forEach((r) => { const e = (m[r.day] = m[r.day] || { t: 0, by: {} }); const v = Number(r.amount) || 0; e.t += v; e.by[r.marketplace] = (e.by[r.marketplace] || 0) + v; });
    return m;
  }, [revenue]);
  const keyOf = (yy, mm, d) => toDateInput(new Date(yy, mm, d));
  const cur = Array.from({ length: dim }, (_, i) => { const k = keyOf(y, mo, i + 1); return { d: i + 1, k, v: idx[k] ? idx[k].t : 0, by: idx[k] ? idx[k].by : {}, has: !!idx[k], future: k > todayKey }; });
  const prev = Array.from({ length: pdim }, (_, i) => { const k = keyOf(y, mo - 1, i + 1); return { d: i + 1, v: idx[k] ? idx[k].t : 0, has: !!idx[k] }; });
  const lastI = cur.reduce((a, x, i) => (x.has ? i : a), -1);
  let s = 0; const cumC = cur.map((x, i) => (i <= lastI ? (s += x.v) : null));
  s = 0; const cumP = prev.map((x) => (s += x.v));
  const prevHas = prev.some((x) => x.has);
  const total = lastI >= 0 ? cumC[lastI] : 0;
  const prevSame = prevHas && lastI >= 0 ? cumP[Math.min(lastI, pdim - 1)] : null;
  const prevTotal = prevHas ? cumP[pdim - 1] : null;
  const isCur = y === today.getFullYear() && mo === today.getMonth();
  const nIn = lastI + 1, remain = dim - nIn;
  const avgM = nIn > 0 ? total / nIn : 0;
  const last7 = cur.slice(0, nIn).filter((x) => x.has).slice(-7);
  const avg7 = last7.length ? last7.reduce((a, x) => a + x.v, 0) / last7.length : avgM;
  const forecast = isCur && nIn > 0 ? total + avgM * remain : null;
  const fc7 = isCur && nIn > 0 ? total + avg7 * remain : null;
  const fcLo = forecast != null ? Math.min(forecast, fc7) : null, fcHi = forecast != null ? Math.max(forecast, fc7) : null;
  const tgt = Number(target) || 0;

  // Kampanya etkisi: kampanya günlerinin günlük ortalaması ↔ kampanyasız günler
  const mStart = keyOf(y, mo, 1), mEnd = keyOf(y, mo, dim);
  const camps = (campaigns || []).filter((c) => c.start_date && c.end_date && c.kind !== 'etkinlik' && c.start_date <= mEnd && c.end_date >= mStart);
  const inCamp = (k) => camps.some((c) => c.start_date <= k && c.end_date >= k);
  const entered = cur.filter((x) => x.has);
  const off = entered.filter((x) => !inCamp(x.k));
  const offAvg = off.length ? off.reduce((a, x) => a + x.v, 0) / off.length : 0;
  const campRows = camps.map((c) => {
    const ds = entered.filter((x) => x.k >= c.start_date && x.k <= c.end_date);
    const avg = ds.length ? ds.reduce((a, x) => a + x.v, 0) / ds.length : 0;
    const sum = ds.reduce((a, x) => a + x.v, 0);
    return { c, days: ds.length, avg, sum, lift: offAvg && ds.length ? avg / offAvg - 1 : null, s: Math.max(1, Number(c.start_date.slice(8)) * (c.start_date >= mStart ? 1 : 0)), e: c.end_date > mEnd ? dim : Number(c.end_date.slice(8)) };
  }).filter((r) => r.days).sort((a, b) => b.sum - a.sum);

  // Haftalar (Pzt–Paz, ay sınırında kesilir)
  const weeks = [];
  cur.forEach((x) => {
    const wd = (new Date(y, mo, x.d).getDay() + 6) % 7;
    if (!weeks.length || wd === 0) weeks.push({ a: x.d, b: x.d, v: 0, n: 0, by: {} });
    const w = weeks[weeks.length - 1]; w.b = x.d;
    if (x.has) { w.v += x.v; w.n++; Object.entries(x.by).forEach(([m, v]) => { w.by[m] = (w.by[m] || 0) + v; }); }
  });
  const wAvgMax = Math.max(1, ...weeks.map((w) => (w.n ? w.v / w.n : 0)));
  const mpsAll = Object.entries(cur.reduce((acc, x) => { Object.entries(x.by).forEach(([m, v]) => { acc[m] = (acc[m] || 0) + v; }); return acc; }, {})).sort((a, b) => b[1] - a[1]).map(([m]) => m);

  // Pazaryeri kırılımı: bu ay (girilen günler) ↔ geçen ayın aynı dönemi, pay, ay sonu tahmini
  const mpRows = (() => {
    const m = {};
    cur.slice(0, nIn).forEach((x) => Object.entries(x.by).forEach(([k, v]) => { (m[k] = m[k] || { a: 0, b: 0, prevAll: 0 }).a += v; }));
    for (let d = 1; d <= pdim; d++) {
      const e = idx[keyOf(y, mo - 1, d)]; if (!e) continue;
      Object.entries(e.by).forEach(([k, v]) => { const r = (m[k] = m[k] || { a: 0, b: 0, prevAll: 0 }); r.prevAll += v; if (d <= nIn) r.b += v; });
    }
    return Object.entries(m).map(([mp, r]) => ({ mp, ...r, ch: r.b ? r.a / r.b - 1 : null, share: total ? r.a / total : 0, prevShare: prevSame ? r.b / prevSame : null, fc: isCur && nIn ? (r.a / nIn) * dim : null }))
      .filter((r) => r.a || r.b).sort((a, b) => b.a - a.a);
  })();
  const mpMax = Math.max(1, ...mpRows.map((r) => Math.max(r.a, r.b)));
  const grow = mpRows.filter((r) => r.ch != null && r.b > total * 0.01).sort((a, b) => (b.a - b.b) - (a.a - a.b));

  // Kümülatif grafik ölçeği
  // Eksen: 4 eşit, yuvarlak adım (1/2/2,5/5 × 10^n)
  const rawMax = Math.max(total, prevSame || 0, fcHi || 0, tgt || 0, prevTotal || 0, 1) * 1.04;
  const stepOf = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v); };
  const step = stepOf(rawMax / 4);
  const maxY = step * Math.ceil(rawMax / step);
  const W = 1000, H = 300;
  const X = (d) => ((d - 0.5) / dim) * W;
  const Yp = (v) => H - (v / maxY) * H;
  const pathOf = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const curPts = cumC.map((v, i) => (v == null ? null : [X(i + 1), Yp(v)])).filter(Boolean);
  const prevPts = cumP.slice(0, dim).map((v, i) => [X(i + 1), Yp(v)]);
  const ticks = Array.from({ length: Math.round(maxY / step) + 1 }, (_, i) => i * step);
  const h = hov != null ? hov : lastI;
  const hc = h != null && h >= 0 ? cumC[h] : null, hp = h != null && prevHas ? cumP[Math.min(h, pdim - 1)] : null;

  const lead = prevSame ? total / prevSame - 1 : null;
  const best = weeks.filter((w) => w.n >= 3).reduce((b, w) => (!b || w.v / w.n > b.v / b.n ? w : b), null);

  return (
    <section className="section ma">
      <div className="section-head">
        <h2>Ayın analizi</h2>
        <div className="rch-mode" role="tablist" aria-label="Analiz">
          {[['gidis', 'Gidişat'], ['pzr', 'Pazaryerleri'], ['kamp', 'Kampanyalar'], ['hafta', 'Haftalar'], ['gun', 'Günlük']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'gidis' ? (
        <div className="card ma-card">
          <div className="ma-facts">
            <div><span>{lastI >= 0 ? (lastI + 1) + ' günde' : 'Bu ay'}</span><b>{tlShort(total)}</b>{lead != null ? <em className={tone(lead)}>{pct(lead)} geçen ayın aynı dönemine göre ({(total - prevSame >= 0 ? '+' : '−') + tlShort(Math.abs(total - prevSame))})</em> : <em>geçen ay verisi yok</em>}</div>
            {forecast != null ? (
              <div className="ma-fc">
                <span>Ay sonu tahmini · {remain} gün kaldı</span>
                <b>{tlShort(forecast)}</b>
                <em>son 7 günün hızıyla {tlShort(fc7)}{Math.abs(fc7 - forecast) > forecast * 0.01 ? (fc7 < forecast ? ' (yavaşlıyor)' : ' (hızlanıyor)') : ''}</em>
                {prevTotal ? <em className={tone(forecast / prevTotal - 1)}>{pct(forecast / prevTotal - 1)} geçen ayın tamamına ({tlShort(prevTotal)}) göre</em> : null}
              </div>
            ) : prevTotal ? <div><span>Geçen ay toplam</span><b>{tlShort(prevTotal)}</b></div> : null}
            {tgt ? <div><span>Hedef {tlShort(tgt)}</span><b>%{Math.round((total / tgt) * 100)}</b><em className={forecast != null && forecast >= tgt ? 'up' : 'down'}>{forecast != null ? (forecast >= tgt ? 'bu hızla hedef aşılıyor' : 'günde ' + tlShort(Math.max(0, tgt - total) / Math.max(1, dim - lastI - 1)) + ' gerekli') : ''}</em></div> : null}
            {grow.length > 1 ? <div><span>En çok büyüyen</span><b><i className="ma-mpdot" style={{ background: mpColor(grow[0].mp) }} />{grow[0].mp}</b><em className={tone(grow[0].ch)}>{pct(grow[0].ch)} ({(grow[0].a - grow[0].b >= 0 ? '+' : '−') + tlShort(Math.abs(grow[0].a - grow[0].b))})</em></div> : null}
            {best ? <div><span>En güçlü hafta</span><b>{best.a}–{best.b} {MON[mo]}</b><em>günde ort. {tlShort(best.v / best.n)}</em></div> : null}
          </div>

          <div className="ma-plot">
            <div className="ma-y" aria-hidden="true">{ticks.slice().reverse().map((t, i) => <span key={i}>{axis(t)}</span>)}</div>
            <div className="ma-area" onMouseLeave={() => setHov(null)}>
              {ticks.map((t, i) => <i key={i} className="ma-grid" style={{ bottom: (t / maxY) * 100 + '%' }} />)}
              {campRows.map((r) => <i key={r.c.id} className="ma-camp" style={{ left: ((r.s - 1) / dim) * 100 + '%', width: ((r.e - r.s + 1) / dim) * 100 + '%' }} title={r.c.name} />)}
              <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" aria-hidden="true">
                {tgt ? <path d={'M' + X(0.5) + ' ' + H + ' L' + X(dim + 0.5) + ' ' + Yp(tgt)} className="ma-l-tgt" vectorEffect="non-scaling-stroke" /> : null}
                {prevHas ? <path d={pathOf(prevPts)} className="ma-l-prev" vectorEffect="non-scaling-stroke" /> : null}
                {forecast != null && lastI < dim - 1 ? <path d={'M' + X(lastI + 1) + ' ' + Yp(total) + ' L' + X(dim) + ' ' + Yp(fcHi) + ' L' + X(dim) + ' ' + Yp(fcLo) + ' Z'} className="ma-band" /> : null}
                {forecast != null && lastI < dim - 1 ? <path d={'M' + X(lastI + 1) + ' ' + Yp(total) + ' L' + X(dim) + ' ' + Yp(forecast)} className="ma-l-fc" vectorEffect="non-scaling-stroke" /> : null}
                {curPts.length ? <path d={pathOf(curPts)} className="ma-l-cur" vectorEffect="non-scaling-stroke" /> : null}
                {h != null && h >= 0 ? <line x1={X(h + 1)} x2={X(h + 1)} y1="0" y2={H} className="ma-cross" vectorEffect="non-scaling-stroke" /> : null}
              </svg>
              {forecast != null && lastI < dim - 1 ? <><i className="ma-dot fc" style={{ left: (X(dim) / W) * 100 + '%', bottom: (forecast / maxY) * 100 + '%' }} /><span className="ma-fclbl" style={{ bottom: (forecast / maxY) * 100 + '%' }}>tahmin {tlShort(forecast)}</span></> : null}
              {hc != null ? <i className="ma-dot cur" style={{ left: (X(h + 1) / W) * 100 + '%', bottom: (hc / maxY) * 100 + '%' }} /> : null}
              {hp != null ? <i className="ma-dot prev" style={{ left: (X(h + 1) / W) * 100 + '%', bottom: (hp / maxY) * 100 + '%' }} /> : null}
              <div className="ma-hit" style={{ '--n': dim }}>
                {cur.map((x, i) => <span key={x.k} onMouseEnter={() => setHov(i)} onClick={() => setHov(i)} />)}
              </div>
              {h != null && h >= 0 && (hc != null || hp != null) ? (
                <div className={'ma-tip' + (h > dim * 0.45 ? ' left' : '')} style={{ left: (X(h + 1) / W) * 100 + '%' }}>
                  <b>{h + 1} {MON[mo]} {WEEKDAYS_SHORT[new Date(y, mo, h + 1).getDay()]}</b>
                  {hc != null ? <span><i className="cur" />Bu ay {tlShort(hc)}{cur[h].has ? ' · gün ' + tlShort(cur[h].v) : ''}</span> : null}
                  {hp != null ? <span><i className="prev" />Geçen ay {tlShort(hp)}</span> : null}
                  {hc != null && hp ? <span className={tone(hc / hp - 1)}>{pct(hc / hp - 1)} ({(hc - hp >= 0 ? '+' : '−') + tlShort(Math.abs(hc - hp))})</span> : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="ma-x" style={{ '--n': dim }} aria-hidden="true">{cur.map((x) => <span key={x.k}>{x.d % 5 === 1 || x.d === dim ? x.d : ''}</span>)}</div>
          <div className="rch-legend">
            <span><i className="ma-k cur" />Bu ay (birikimli)</span>
            {prevHas ? <span><i className="ma-k prev" />Geçen ay aynı gün</span> : null}
            {forecast != null ? <span><i className="ma-k fc" />Tahmin (ay ortalaması hızı)</span> : null}
            {forecast != null && Math.abs(fc7 - forecast) > 1 ? <span><i className="ma-k band" />Tahmin aralığı (son 7 gün hızına göre)</span> : null}
            {tgt ? <span><i className="ma-k tgt" />Hedef</span> : null}
            {campRows.length ? <span><i className="campbg" />Kampanya günleri</span> : null}
          </div>
        </div>
      ) : null}

      {tab === 'pzr' ? (
        <div className="card ma-card">
          <p className="ma-note">{nIn ? nIn + ' günlük ciro' : 'Bu ay'} geçen ayın aynı {nIn} günüyle kıyaslanıyor{isCur ? '; tahmin her pazaryerinin bu ayki günlük ortalamasıyla' : ''}.</p>
          <div className="ma-mp head"><span>Pazaryeri</span><span>Bu ay</span><span className="hide-s">Geçen ay aynı dönem</span><span>Değişim</span>{isCur ? <span>Ay sonu tahmini</span> : null}<span className="hide-s">Pay</span></div>
          {mpRows.map((r) => (
            <div key={r.mp} className="ma-mp">
              <span className="ma-mp-n"><i style={{ background: mpColor(r.mp) }} />{r.mp}</span>
              <span className="ma-mp-v"><b>{tlShort(r.a)}</b><i className="ma-mp-bar"><u style={{ width: (r.a / mpMax) * 100 + '%', background: mpColor(r.mp) }} /><s style={{ width: (r.b / mpMax) * 100 + '%' }} /></i></span>
              <span className="hide-s">{r.b ? tlShort(r.b) : '—'}</span>
              <span className={tone(r.ch)}>{r.ch != null ? pct(r.ch) : r.a ? 'yeni' : '—'}<small>{r.b ? ' ' + (r.a - r.b >= 0 ? '+' : '−') + tlShort(Math.abs(r.a - r.b)) : ''}</small></span>
              {isCur ? <span className="ma-mp-fc">{r.fc ? tlShort(r.fc) : '—'}{r.prevAll ? <small className={tone(r.fc / r.prevAll - 1)}> {pct(r.fc / r.prevAll - 1)}</small> : null}</span> : null}
              <span className="hide-s">%{Math.round(r.share * 100)}{r.prevShare != null ? (() => { const d = Math.round((r.share - r.prevShare) * 100); return <small className={d > 0 ? 'up' : d < 0 ? 'down' : ''}>{d ? (d > 0 ? '+' : '−') + Math.abs(d) + ' puan' : 'aynı'}</small>; })() : null}</span>
            </div>
          ))}
          {mpRows.length ? (
            <div className="ma-mp total">
              <span className="ma-mp-n">Toplam</span><span className="ma-mp-v"><b>{tlShort(total)}</b></span><span className="hide-s">{prevSame ? tlShort(prevSame) : '—'}</span>
              <span className={tone(lead)}>{lead != null ? pct(lead) : '—'}</span>{isCur ? <span className="ma-mp-fc">{forecast ? tlShort(forecast) : '—'}</span> : null}<span className="hide-s">%100</span>
            </div>
          ) : <p className="empty">Bu ay için ciro girilmedi.</p>}
          {mpRows.length ? (
            <div className="ma-share">
              <span>Bu ay</span><div>{mpRows.filter((r) => r.a).map((r) => <i key={r.mp} style={{ flexGrow: r.a, background: mpColor(r.mp) }} title={r.mp + ' %' + Math.round(r.share * 100)} />)}</div>
              {prevSame ? <><span>Geçen ay</span><div>{mpRows.filter((r) => r.b).map((r) => <i key={r.mp} style={{ flexGrow: r.b, background: mpColor(r.mp) }} title={r.mp} />)}</div></> : null}
            </div>
          ) : null}
          <p className="hint" style={{ margin: 0 }}>Çubukta renkli kısım bu ay, üzerindeki ince çizgi geçen ayın aynı dönemi.</p>
        </div>
      ) : null}

      {tab === 'kamp' ? (
        <div className="card ma-card">
          <p className="ma-note">Kampanya günlerinin günlük ortalama cirosu, bu ayki kampanyasız günlerin ortalamasıyla (<b>{tlShort(offAvg)}</b>/gün, {off.length} gün) kıyaslanır.</p>
          {campRows.length ? campRows.map((r) => (
            <div key={r.c.id} className="ma-cr">
              <div className="ma-cr-t"><i style={{ background: r.c.marketplace ? mpColor(r.c.marketplace) : '#7048E8' }} /><b>{r.c.name}</b><span>{r.c.marketplace || 'Genel'} · {r.s}–{r.e} {MON[mo]} · {r.days} gün</span></div>
              <div className="ma-cr-v"><b>{tlShort(r.avg)}</b><small>/gün</small>{r.lift != null ? <em className={tone(r.lift)}>{pct(r.lift)}</em> : null}</div>
              <div className="ma-cr-bar"><span style={{ width: Math.min(100, (r.avg / Math.max(...campRows.map((z) => z.avg), offAvg, 1)) * 100) + '%', background: r.c.marketplace ? mpColor(r.c.marketplace) : '#7048E8' }} /><i style={{ left: (offAvg / Math.max(...campRows.map((z) => z.avg), offAvg, 1)) * 100 + '%' }} title="Kampanyasız günlük ortalama" /></div>
              <small className="ma-cr-s">Toplam {tlShort(r.sum)} · ayın %{total ? Math.round((r.sum / total) * 100) : 0}'i</small>
            </div>
          )) : <p className="empty">Bu ay ciro girilmiş günlere denk gelen kampanya yok.</p>}
          {campRows.length ? <p className="hint" style={{ margin: 0 }}>Dikey çizgi kampanyasız günlerin ortalaması. Aynı günlere denk gelen kampanyalar birbirinin etkisini de taşır.</p> : null}
        </div>
      ) : null}

      {tab === 'hafta' ? (
        <div className="card ma-card">
          {weeks.map((w, i) => {
            const p = weeks.slice(0, i).reverse().find((z) => z.n);
            const ch = p && w.n ? (w.v / w.n) / (p.v / p.n) - 1 : null;
            return (
              <div key={w.a} className="ma-wk">
                <div className="ma-wk-t"><b>{w.a === w.b ? w.a : w.a + '–' + w.b} {MON[mo]}</b><span>{w.n ? w.n + ' gün' : 'girilmedi'}</span></div>
                <div className="ma-wk-bar">
                  {w.n ? <span style={{ width: ((w.v / w.n) / wAvgMax) * 100 + '%' }}>{mpsAll.filter((m) => w.by[m]).map((m) => <i key={m} style={{ flexGrow: w.by[m], background: mpColor(m) }} title={m + ' ' + tl(w.by[m])} />)}</span> : null}
                </div>
                <div className="ma-wk-v"><b>{w.n ? tlShort(w.v) : '—'}</b>{w.n ? <small>günde {tlShort(w.v / w.n)}</small> : null}{ch != null ? <em className={tone(ch)}>{pct(ch)}</em> : null}</div>
              </div>
            );
          })}
          <div className="rch-legend">{mpsAll.slice(0, 8).map((m) => <span key={m}><i style={{ background: mpColor(m) }} />{m}</span>)}</div>
          <p className="hint" style={{ margin: 0 }}>Çubuk uzunluğu haftanın günlük ortalaması (eksik günlü haftalar adil kıyaslansın diye); yüzde bir önceki haftaya göre.</p>
        </div>
      ) : null}

      {tab === 'gun' ? <DailyRevenueChart bare month={month} revenue={revenue} campaigns={campaigns} today={today} target={target} onEdit={onEdit} /> : null}
    </section>
  );
}
