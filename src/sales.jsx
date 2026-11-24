// İş → Satış raporları: pazaryeri satış Excel'lerinden ürün ve pazaryeri bazında dönem karşılaştırması.
// Hafif kalması için: Excel okuyucu yalnız yükleme anında iner; raporlar yalnız bu sayfa açılınca listelenir;
// ürünler sadece seçilen dönemlerin raporları için çekilir ve oturum boyunca bellekte tutulur.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, DEMO } from './supabase.js';
import { MARKETPLACES, mpColor } from './constants.js';
import { tl, tlShort } from './revenue.jsx';
import { Sheet } from './ui.jsx';
import { parseSales, fileDate, str, coverReports, sumItems, compareProducts, lenOf, shift, ymd } from './salesparse.js';

// ---------- Saklama ----------
const DEMO_KEY = 'ajanda-sales-demo-v1';
const demoAll = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch { return []; } };
const demoSet = (v) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(v)); } catch { /* yok say */ } };
const META = 'id, marketplace, period_start, period_end, file_name, totals, created_at';
const itemCache = new Map(); // rapor id → ürünler (raporlar değişmez; silinince düşülür)

async function listReports() {
  if (DEMO) return demoAll().map(({ items, ...m }) => m);
  const { data, error } = await supabase.from('sales_reports').select(META).order('period_end', { ascending: false }).limit(1000);
  if (error) throw error;
  return data || [];
}
async function loadItems(ids) {
  const need = ids.filter((id) => !itemCache.has(id));
  if (need.length) {
    if (DEMO) demoAll().filter((x) => need.includes(x.id)).forEach((x) => itemCache.set(x.id, x.items || []));
    else {
      for (let i = 0; i < need.length; i += 20) {
        const { data, error } = await supabase.from('sales_reports').select('id, items').in('id', need.slice(i, i + 20));
        if (error) throw error;
        (data || []).forEach((x) => itemCache.set(x.id, x.items || []));
      }
    }
  }
  return Object.fromEntries(ids.map((id) => [id, itemCache.get(id) || []]));
}
async function saveReport(rep, replaceId) {
  if (DEMO) {
    const all = demoAll().filter((x) => x.id !== replaceId);
    const row = { id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6), created_at: new Date().toISOString(), ...rep };
    demoSet([row, ...all]);
    itemCache.set(row.id, rep.items);
    const { items, ...m } = row; return m;
  }
  if (replaceId) { const { error } = await supabase.from('sales_reports').delete().eq('id', replaceId); if (error) throw error; itemCache.delete(replaceId); }
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('sales_reports').insert({ user_id: u.user.id, ...rep }).select(META).single();
  if (error) throw error;
  itemCache.set(data.id, rep.items);
  return data;
}
async function deleteReport(id) {
  itemCache.delete(id);
  if (DEMO) { demoSet(demoAll().filter((x) => x.id !== id)); return; }
  const { error } = await supabase.from('sales_reports').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Yardımcılar ----------
const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dm = (k) => { const [, m, d] = k.split('-').map(Number); return d + ' ' + MON[m - 1]; };
const plabel = (a, b) => (a === b ? dm(a) : dm(a) + ' – ' + dm(b));
const nf = (v) => Math.round(v || 0).toLocaleString('tr-TR');
const SHORT = { Trendyol: 'TY', Hepsiburada: 'HB', Amazon: 'AMZ', MCLUB: 'MC', Boyner: 'BOY', N11: 'N11', Pazarama: 'PZR', Beymen: 'BEY', 'İdefix': 'İDF' };
const short = (mp) => SHORT[mp] || mp.slice(0, 3).toUpperCase();
const missingTable = (e) => /sales_reports/.test(String(e && e.message));

function Delta({ a, b, money, invert, showAbs, none }) {
  if (none) return <span className="sl-d flat">kıyas yok</span>;
  if (!b && !a) return <span className="sl-d flat">—</span>;
  if (!b) return <span className="sl-d up">yeni</span>;
  if (!a) return <span className="sl-d down">satış yok</span>;
  const v = a / b - 1;
  if (Math.abs(v) < 0.005) return <span className="sl-d flat">aynı</span>;
  const up = v > 0;
  const abs = a - b;
  const p = Math.abs(v * 100);
  return (
    <span className={'sl-d ' + (up !== !!invert ? 'up' : 'down')}>
      {up ? '▲' : '▼'} %{p < 10 ? p.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : Math.round(p)}
      {showAbs ? <small> ({up ? '+' : '−'}{money ? tlShort(Math.abs(abs)) : nf(Math.abs(abs))})</small> : null}
    </span>
  );
}

// Dönem seçenekleri: A (incelenen) ve B (kıyas)
function periodOptions(today, reports) {
  const t = ymd(today), y = shift(t, -1);
  const d = new Date(today.getFullYear(), today.getMonth(), 1);
  const pm1 = ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), pm2 = ymd(new Date(d.getFullYear(), d.getMonth(), 0));
  const ppm1 = ymd(new Date(d.getFullYear(), d.getMonth() - 2, 1)), ppm2 = ymd(new Date(d.getFullYear(), d.getMonth() - 1, 0));
  const opts = [];
  const last = [...reports].sort((x, z) => String(z.created_at).localeCompare(String(x.created_at)))[0];
  if (last) {
    const a = last.period_start, b = last.period_end, n = lenOf(a, b);
    opts.push({ id: 'son', label: 'Son yüklenen', A: [a, b], B: [shift(a, -n), shift(a, -1)] });
  }
  opts.push(
    { id: 'bugun', label: 'Bugün', A: [t, t], B: [y, y], note: 'Gün bitmedi; dünün tamamıyla kıyaslanıyor.' },
    { id: 'dun', label: 'Dün', A: [y, y], B: [shift(y, -1), shift(y, -1)] },
    { id: '7', label: 'Son 7 gün', A: [shift(t, -7), y], B: [shift(t, -14), shift(t, -8)] },
    { id: '30', label: 'Son 30 gün', A: [shift(t, -30), y], B: [shift(t, -60), shift(t, -31)] },
    { id: 'ay', label: 'Geçen ay', A: [pm1, pm2], B: [ppm1, ppm2] }
  );
  return opts;
}

// ---------- Yükleme penceresi (birden çok dosya) ----------
function ImportSheet({ files: files0, reports, now, onClose, onDone, onRevenue }) {
  const t = ymd(now), y = shift(t, -1);
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  const ps = [
    ['Bugün', t, t], ['Dün', y, y], ['Son 7 gün', shift(t, -7), y],
    ['Bu ay', ymd(d), t], ['Geçen ay', ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), ymd(new Date(d.getFullYear(), d.getMonth(), 0))]
  ];
  // Tarihi dosya adından ya da içindeki sipariş tarihlerinden bulunanlar kendi dönemiyle kaydedilir
  const files = useMemo(() => [...files0].sort((x, z) => String((x.own || [''])[0]).localeCompare(String((z.own || [''])[0])) || x.name.localeCompare(z.name, 'tr')), [files0]);
  const many = files.length > 3;
  const [own, setOwn] = useState(() => files.map((f) => f.own || null));
  const needCommon = files.some((f, i) => f.parsed && !own[i]);
  const [a, setA] = useState(y);
  const [b, setB] = useState(y);
  const [mps, setMps] = useState(() => files.map((f) => (f.parsed ? f.parsed.mp : null)));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const per = files.map((f, i) => (own[i] || [a, b]));
  const days = new Set(files.map((f, i) => (f.parsed && mps[i] && per[i][0] === per[i][1] && per[i][0] < t ? per[i][0] : null)).filter(Boolean));
  const [toRev, setToRev] = useState(days.size <= 1);
  const ready = files.filter((f, i) => f.parsed && mps[i]).length;
  const missingMp = files.some((f, i) => f.parsed && !mps[i]);
  const dup = files.map((f, i) => (f.parsed && mps[i] ? reports.find((x) => x.marketplace === mps[i] && x.period_start === per[i][0] && x.period_end === per[i][1]) : null));
  const bad = needCommon && (!a || !b || b < a);
  const save = async () => {
    setErr('');
    const saved = [];
    try {
      let n = 0;
      for (let i = 0; i < files.length; i++) {
        const f = files[i]; if (!f.parsed || !mps[i]) continue;
        n++; setBusy(n + ' / ' + ready);
        const [pa, pb] = per[i];
        const row = await saveReport({ marketplace: mps[i], period_start: pa, period_end: pb, file_name: str(f.name, 120), totals: f.parsed.totals, items: f.parsed.items }, dup[i] && dup[i].id);
        saved.push({ row, replaced: dup[i] && dup[i].id });
        if (toRev && pa === pb && pa < t && onRevenue && f.parsed.totals.r > 0) await onRevenue(pa, mps[i], f.parsed.totals.r, f.parsed.totals.o);
      }
      onDone(saved);
    } catch (e) {
      setErr(missingTable(e) ? 'Supabase\'de 29 numaralı SQL çalıştırılmamış (Hesap → Kurulum durumu).' : 'Kaydedilemedi: ' + (e && e.message) + (saved.length ? ' (' + saved.length + ' rapor kaydedildi)' : ''));
      if (saved.length) onDone(saved, true);
    } finally { setBusy(''); }
  };
  const setMp = (i, v) => setMps((m) => m.map((x, j) => (j === i ? v : x)));
  const setOwnDay = (i, v) => setOwn((o) => o.map((x, j) => (j === i ? (v ? [v, v] : null) : x)));
  const total = files.reduce((s, f, i) => s + (f.parsed && mps[i] ? f.parsed.totals.r : 0), 0);
  return (
    <Sheet title={files.length > 1 ? files.length + ' rapor ekle' : 'Satış raporu ekle'} onClose={onClose}>
      {missingMp ? (
        <div className="sl-mpchips">
          <span className="hint" style={{ color: '#B35C00' }}>{many ? 'Tanınmayan dosyaların pazaryeri:' : 'Hangi pazaryeri?'}</span>
          {MARKETPLACES.map((m) => <button key={m.name} type="button" className="chip" onClick={() => setMps((v) => v.map((x, j) => (x || !files[j].parsed ? x : m.name)))}>{m.name}</button>)}
        </div>
      ) : null}
      {many ? (
        <div className="sl-flist">
          <span className="hint">{ready} dosya · toplam {tl(total)}{files.some((f, i) => own[i]) ? ' · tarihler dosya adlarından alındı' : ''}</span>
          {files.map((f, i) => (
            <div key={i} className={'sl-frow' + (f.parsed ? '' : ' bad')}>
              {f.parsed && own[i] && own[i][0] === own[i][1]
                ? <input type="date" value={own[i][0]} onChange={(e) => setOwnDay(i, e.target.value)} aria-label={f.name + ' tarihi'} />
                : <span className="sl-frow-p">{own[i] ? plabel(own[i][0], own[i][1]) : f.parsed ? 'aşağıdaki dönem' : ''}</span>}
              <span className="sl-frow-n" title={f.name}>{f.name}</span>
              {f.parsed ? (
                <>
                  <span className="sl-frow-mp">{mps[i] ? <><span className="dot" style={{ background: mpColor(mps[i]) }} />{short(mps[i])}</> : '?'}</span>
                  <b>{tlShort(f.parsed.totals.r)}</b>
                  {dup[i] ? <span className="sl-frow-w" title="Bu tarihin raporu var; yenisiyle değişecek">↻</span> : <span />}
                </>
              ) : <span className="sl-frow-e">{f.error}</span>}
            </div>
          ))}
          {dup.some(Boolean) ? <span className="hint">↻ Bu tarihlerin raporu zaten var; yenileriyle değişecek.</span> : null}
        </div>
      ) : (
        <div className="sl-files">
          {files.map((f, i) => (
            <div key={i} className={'sl-file' + (f.parsed ? '' : ' bad')}>
              <div className="sl-file-top">
                <span className="sl-file-n">{f.name}</span>
                {f.parsed ? <b>{tl(f.parsed.totals.r)}</b> : null}
              </div>
              {f.parsed ? (
                <>
                  <span className="hint">{f.parsed.totals.n} ürün · {nf(f.parsed.totals.q)} adet{f.parsed.totals.x ? ' · ' + nf(f.parsed.totals.x) + ' iptal' : ''}{own[i] ? ' · ' + plabel(own[i][0], own[i][1]) + ' (dosyadan)' : ''}</span>
                  {mps[i] ? (
                    <span className="sl-file-mp"><span className="dot" style={{ background: mpColor(mps[i]) }} />{mps[i]}<button type="button" className="linkbtn" onClick={() => setMp(i, null)}>değiştir</button></span>
                  ) : null}
                  {own[i] ? <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={() => setOwnDay(i, null)}>Tarihi kendim seçeyim</button> : null}
                  {dup[i] ? <span className="hint" style={{ color: '#B35C00' }}>Bu dönemin {mps[i]} raporu var; yenisiyle değişecek.</span> : null}
                </>
              ) : <span className="hint" style={{ color: 'var(--danger)' }}>{f.error}</span>}
            </div>
          ))}
        </div>
      )}
      {needCommon ? (
        <div className="field">
          <label>{files.some((f, i) => own[i]) ? 'Tarihi bulunamayanlar hangi dönemin?' : 'Hangi dönemin satışları?'}</label>
          <div className="typechips">{ps.map(([l, x, z]) => <button key={l} type="button" className={'chip' + (a === x && b === z ? ' on' : '')} onClick={() => { setA(x); setB(z); }}>{l}</button>)}</div>
          <div className="row2" style={{ marginTop: 8 }}>
            <input type="date" value={a} max={b || undefined} onChange={(e) => setA(e.target.value)} aria-label="Dönem başı" />
            <input type="date" value={b} min={a || undefined} onChange={(e) => setB(e.target.value)} aria-label="Dönem sonu" />
          </div>
          <span className="hint">Panelden raporu indirirken seçtiğin tarih aralığı. İpucu: dosya adına tarihi yazarsan ("1 Kasım") kendisi anlar.</span>
        </div>
      ) : null}
      {days.size ? (
        <label className="wl-check"><input type="checkbox" checked={toRev} onChange={(e) => setToRev(e.target.checked)} />
          <span>{days.size === 1 ? dm([...days][0]) + ' cirosuna da işle' : days.size + ' günün cirosuna da işle'}{days.size > 1 ? ' (o günler için girdiğin ciro varsa bu pazaryerininki değişir)' : ''}</span></label>
      ) : null}
      {err ? <p className="hint" style={{ color: 'var(--danger)', margin: 0 }}>{err}</p> : null}
      <button type="button" className="btn big primary" disabled={!!busy || !ready || bad} onClick={save}>{busy ? 'Kaydediliyor… ' + busy : ready > 1 ? ready + ' raporu kaydet' : 'Kaydet'}</button>
    </Sheet>
  );
}

// ---------- Ürün detayı ----------
// Ürünün dün ve son 7 gün kıyası ile son 14 günün günlük satışı (günlük rapor varsa). Yalnız pencere açılınca hesaplanır.
function useProductTrend(p, reports, now) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let alive = true;
    const t = ymd(now), y = shift(t, -1);
    const periods = [
      ['Dün', [y, y], [shift(y, -1), shift(y, -1)]],
      ['Son 7 gün', [shift(t, -7), y], [shift(t, -14), shift(t, -8)]]
    ];
    const mps = Object.keys(p.keys);
    const plan = periods.map(([label, A, B]) => ({ label, A, B, cov: Object.fromEntries(mps.map((mp) => [mp, { A: coverReports(reports, mp, A[0], A[1]), B: coverReports(reports, mp, B[0], B[1]) }])) }));
    const days = Array.from({ length: 14 }, (_, i) => shift(t, i - 14));
    const daily = days.map((d) => ({ d, ids: Object.fromEntries(mps.map((mp) => [mp, (reports.find((r) => r.marketplace === mp && r.period_start === d && r.period_end === d) || {}).id]).filter(([, id]) => id)) }));
    const ids = [...new Set([...plan.flatMap((x) => Object.values(x.cov).flatMap((c) => [...c.A.ids, ...c.B.ids])), ...daily.flatMap((x) => Object.values(x.ids))])];
    loadItems(ids).then((byId) => {
      if (!alive) return;
      const sumFor = (mp, list) => { let q = 0, r = 0; const ks = new Set(p.keys[mp]); list.forEach((id) => (byId[id] || []).forEach((x) => { if (ks.has(x.k)) { q += x.q || 0; r += x.r || 0; } })); return { q, r }; };
      const rows = plan.map((pl) => {
        const per = mps.map((mp) => {
          const c = pl.cov[mp]; const a = sumFor(mp, c.A.ids), b0 = sumFor(mp, c.B.ids);
          const sc = c.A.days && c.B.days && c.A.days !== c.B.days ? c.A.days / c.B.days : 1;
          return { mp, has: c.A.ids.length > 0, hasB: c.B.ids.length > 0, a, b: { q: b0.q * sc, r: b0.r * sc } };
        }).filter((x) => x.has || x.hasB);
        const tot = per.reduce((s, x) => ({ a: { q: s.a.q + x.a.q, r: s.a.r + x.a.r }, b: { q: s.b.q + x.b.q, r: s.b.r + x.b.r } }), { a: { q: 0, r: 0 }, b: { q: 0, r: 0 } });
        return { label: pl.label, A: pl.A, per, tot };
      });
      const series = daily.map((x) => ({ d: x.d, has: Object.keys(x.ids).length > 0, v: Object.entries(x.ids).reduce((s, [mp, id]) => { const z = sumFor(mp, [id]); return { q: s.q + z.q, r: s.r + z.r }; }, { q: 0, r: 0 }) }));
      setSt({ rows, series: series.filter((x) => x.has).length >= 3 ? series : null });
    }).catch(() => alive && setSt({ rows: [], series: null }));
    return () => { alive = false; };
  }, [p, reports]);
  return st;
}

function ProductSheet({ p, A, B, metric, reports, now, onClose, noB }) {
  const allNo = Object.keys(p.mps).every((mp) => noB.has(mp));
  const rows = Object.entries(p.mps).sort((x, z) => (z[1].a.r + z[1].b.r) - (x[1].a.r + x[1].b.r));
  const tr = useProductTrend(p, reports, now);
  const money = metric === 'r';
  const fmtV = (v) => (money ? tlShort(v) : nf(v));
  const max = tr && tr.series ? Math.max(1, ...tr.series.map((x) => x.v[metric])) : 1;
  return (
    <Sheet title="Ürün" onClose={onClose}>
      <div className="sl-ps-name">{p.n}</div>
      <span className="hint">{plabel(A[0], A[1])} · kıyas: {plabel(B[0], B[1])}</span>
      <div className="sl-ps-tot">
        <div><span>Adet</span><b>{nf(p.a.q)}</b>{allNo ? null : <small>önce {nf(p.b.q)}</small>}<Delta a={p.a.q} b={p.b.q} showAbs none={allNo} /></div>
        <div><span>Ciro</span><b>{tlShort(p.a.r)}</b>{allNo ? null : <small>önce {tlShort(p.b.r)}</small>}<Delta a={p.a.r} b={p.b.r} money showAbs none={allNo} /></div>
      </div>
      <div className="sl-ps-tab" role="table" aria-label="Pazaryerine göre">
        <div className="sl-ps-r head" role="row"><span>Pazaryeri</span><span>Adet</span><span>Ciro</span><span>Değişim</span></div>
        {rows.map(([mp, m]) => (
          <div key={mp} className="sl-ps-r" role="row">
            <span><span className="dot" style={{ background: mpColor(mp) }} />{mp}</span>
            <span>{nf(m.a.q)}{noB.has(mp) ? null : <small> / {nf(m.b.q)}</small>}</span>
            <span>{tlShort(m.a.r)}</span>
            <span>{money ? <Delta a={m.a.r} b={m.b.r} money none={noB.has(mp)} /> : <Delta a={m.a.q} b={m.b.q} none={noB.has(mp)} />}</span>
          </div>
        ))}
      </div>

      {!tr ? <p className="hint" style={{ margin: 0 }}>Dönemler hesaplanıyor…</p> : tr.rows.some((r) => r.per.length) ? (
        <div className="sl-ps-per">
          <h4>{money ? 'Ciro' : 'Adet'} · dönemlere göre</h4>
          {tr.rows.filter((r) => r.per.length).map((r) => (
            <div key={r.label} className="sl-ps-pr">
              <div className="sl-ps-prh"><b>{r.label}</b><span className="hint">{plabel(r.A[0], r.A[1])}</span><span className="sl-ps-prv">{fmtV(r.tot.a[metric])} <small>önce {fmtV(r.tot.b[metric])}</small> <Delta a={r.tot.a[metric]} b={r.tot.b[metric]} money={money} /></span></div>
              {r.per.length > 1 || rows.length > 1 ? (
                <div className="sl-pmps">
                  {r.per.map((x) => <span key={x.mp} className="sl-pmp"><span className="dot" style={{ background: mpColor(x.mp) }} />{short(x.mp)} {x.has ? fmtV(x.a[metric]) : 'rapor yok'} {x.has && x.hasB ? <Delta a={x.a[metric]} b={x.b[metric]} money={money} /> : null}</span>)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {tr && tr.series ? (
        <div className="sl-ps-ser">
          <h4>Son 14 gün · günlük {money ? 'ciro' : 'adet'}</h4>
          <div className="sl-bars" role="img" aria-label={'Son 14 günün günlük ' + (money ? 'cirosu' : 'satış adedi')}>
            {tr.series.map((x) => (
              <div key={x.d} className="sl-barc" title={dm(x.d) + ': ' + (x.has ? fmtV(x.v[metric]) : 'rapor yok')}>
                <span className="sl-barv">{x.has && x.v[metric] ? (money ? tlShort(x.v[metric]).replace('₺', '') : nf(x.v[metric])) : ''}</span>
                <span className="sl-bart"><span className={'sl-barb' + (x.has ? '' : ' none')} style={{ height: x.has ? Math.max(2, (x.v[metric] / max) * 100) + '%' : '100%' }} /></span>
                <span className="sl-barl">{Number(x.d.slice(8))}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {rows.some(([, m]) => m.s != null) ? <p className="hint" style={{ margin: 0 }}>Stok: {rows.filter(([, m]) => m.s != null).map(([mp, m]) => mp + ' ' + nf(m.s)).join(' · ')}</p> : null}
      <p className="hint" style={{ margin: 0 }}>Adette ilk sayı incelenen dönem, ikincisi kıyas dönemi. Pazaryerleri ürün adı ve barkoda göre otomatik eşleştirilir.</p>
    </Sheet>
  );
}

// ---------- Ana görünüm ----------
export function SalesView({ now, actions }) {
  const [reports, setReports] = useState(null);
  const [err, setErr] = useState('');
  const [optId, setOptId] = useState(null);
  const [data, setData] = useState(null); // { key, byMp, cov }
  const [loading, setLoading] = useState(false);
  const [metric, setMetric] = useState(() => { try { return localStorage.getItem('ajanda-sales-metric') || 'q'; } catch { return 'q'; } });
  const [sort, setSort] = useState('down');
  const [mpF, setMpF] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(20);
  const [prod, setProd] = useState(null);
  const [imp, setImp] = useState(null);
  const [reading, setReading] = useState(false);
  const [showList, setShowList] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    listReports().then(setReports).catch((e) => setErr(missingTable(e) ? 'Satış raporları için Supabase\'de 29 numaralı SQL\'i çalıştır (Hesap → Kurulum durumu → Kopyala).' : String(e && e.message)));
  }, []);

  const dayKey = now ? now.toDateString() : '';
  const opts = useMemo(() => periodOptions(now, reports || []), [reports, dayKey]);
  const mpsAll = useMemo(() => [...new Set((reports || []).map((r) => r.marketplace))], [reports]);
  // Varsayılan: kıyası da olan ilk seçenek
  const opt = useMemo(() => {
    if (!reports) return null;
    const chosen = opts.find((o) => o.id === optId);
    if (chosen) return chosen;
    const has = (o, side) => mpsAll.some((mp) => coverReports(reports, mp, o[side][0], o[side][1]).ids.length);
    return opts.find((o) => o.id !== 'bugun' && has(o, 'A') && has(o, 'B')) || opts.find((o) => has(o, 'A')) || opts[0];
  }, [opts, optId, reports, mpsAll]);

  const key = opt ? opt.A.join() + '|' + opt.B.join() + '|' + (reports || []).map((r) => r.id).join() : '';
  useEffect(() => {
    if (!opt || !reports) return undefined;
    let alive = true;
    const cov = {};
    mpsAll.forEach((mp) => { cov[mp] = { A: coverReports(reports, mp, opt.A[0], opt.A[1]), B: coverReports(reports, mp, opt.B[0], opt.B[1]) }; });
    const ids = [...new Set(Object.values(cov).flatMap((c) => [...c.A.ids, ...c.B.ids]))];
    setLoading(true);
    loadItems(ids).then((byId) => {
      if (!alive) return;
      const byMp = {};
      Object.entries(cov).forEach(([mp, c]) => {
        if (!c.A.ids.length && !c.B.ids.length) return;
        byMp[mp] = { A: sumItems(c.A.ids.map((id) => byId[id])), B: sumItems(c.B.ids.map((id) => byId[id])) };
      });
      setData({ key, byMp, cov });
    }).catch((e) => alive && setErr(String(e && e.message))).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key]);

  const view = useMemo(() => {
    if (!data || data.key !== key) return null;
    // Kıyas dönemi farklı sayıda gün kapsıyorsa günlük ortalamaya ölçekle
    const scaleB = {};
    Object.keys(data.byMp).forEach((mp) => { const c = data.cov[mp]; scaleB[mp] = c.B.days && c.A.days && c.A.days !== c.B.days ? c.A.days / c.B.days : 1; });
    const products = compareProducts(data.byMp, scaleB);
    const mpRows = Object.keys(data.byMp).map((mp) => {
      const t = { a: { q: 0, r: 0 }, b: { q: 0, r: 0 } };
      data.byMp[mp].A.forEach((x) => { t.a.q += x.q || 0; t.a.r += x.r || 0; });
      data.byMp[mp].B.forEach((x) => { t.b.q += (x.q || 0) * scaleB[mp]; t.b.r += (x.r || 0) * scaleB[mp]; });
      return { mp, ...t, cov: data.cov[mp] };
    }).sort((x, z) => z.a.r - x.a.r);
    const tot = mpRows.reduce((s, m) => ({ a: { q: s.a.q + m.a.q, r: s.a.r + m.a.r }, b: { q: s.b.q + m.b.q, r: s.b.r + m.b.r } }), { a: { q: 0, r: 0 }, b: { q: 0, r: 0 } });
    const tyDays = (data.cov.Trendyol && data.cov.Trendyol.A.days) || 1;
    const stock = products.filter((p) => p.mps.Trendyol && p.mps.Trendyol.s != null && p.mps.Trendyol.a.q > 0)
      .map((p) => ({ p, s: p.mps.Trendyol.s, cover: p.mps.Trendyol.s / (p.mps.Trendyol.a.q / tyDays) }))
      .filter((z) => z.cover < 21).sort((x, z) => x.cover - z.cover);
    const noB = new Set(mpRows.filter((m) => !m.cov.B.ids.length).map((m) => m.mp));
    return { products, mpRows, tot, stock, noB, allNoB: noB.size === mpRows.length, scaled: Object.values(scaleB).some((v) => v !== 1) };
  }, [data, key]);

  const list = useMemo(() => {
    if (!view) return [];
    const m = metric;
    const val = (p, side) => (mpF ? (p.mps[mpF] ? p.mps[mpF][side][m] : 0) : p[side][m]);
    let l = view.products.filter((p) => !mpF || p.mps[mpF]);
    if (q.trim()) {
      const words = q.toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean);
      l = l.filter((p) => { const n = (p.n + ' ' + (p.br || '')).toLocaleLowerCase('tr-TR'); return words.every((w) => n.includes(w)); });
    }
    const d = (p) => val(p, 'a') - val(p, 'b');
    if (q.trim() || view.allNoB) l = [...l].sort((x, z) => val(z, 'a') - val(x, 'a'));
    else if (sort === 'down') l = l.filter((p) => d(p) < 0).sort((x, z) => d(x) - d(z));
    else if (sort === 'up') l = l.filter((p) => d(p) > 0).sort((x, z) => d(z) - d(x));
    else l = [...l].sort((x, z) => val(z, 'a') - val(x, 'a'));
    return l.map((p) => ({ p, a: val(p, 'a'), b: val(p, 'b') }));
  }, [view, metric, sort, mpF, q]);
  useEffect(() => { setLimit(20); }, [metric, sort, mpF, q, key]);

  const pick = async (fl) => {
    const arr = [...(fl || [])].slice(0, 62);
    if (!arr.length) return;
    setReading(true); setErr('');
    try {
      const { default: readXlsx } = await import('read-excel-file/browser');
      const files = [];
      for (const f of arr) {
        try {
          const parsed = parseSales(await readXlsx(f), f.name);
          files.push({ name: f.name, parsed, own: fileDate(f.name, now) || parsed.range || null });
        }
        catch (e) { files.push({ name: f.name, error: e && e.message ? e.message : 'Okunamadı' }); }
      }
      setImp(files);
    } catch (e) { setErr(e.message || 'Dosya okunamadı.'); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const toRevenue = async (day, mp, amount, orders) => {
    if (actions && actions.saveRevenue) await actions.saveRevenue(day, [{ marketplace: mp, amount: Math.round(amount * 100) / 100, orders: orders ? Math.round(orders) : null }], { keepOpen: true });
  };
  const setMetricS = (v) => { setMetric(v); try { localStorage.setItem('ajanda-sales-metric', v); } catch { /* yok say */ } };
  const money = metric === 'r';
  const fmtV = (v) => (money ? tlShort(v) : nf(v));

  return (
    <div className="sl">
      <div className="sl-top">
        <div>
          <h2 className="sl-h">Satış raporları</h2>
          <span className="hint">Pazaryeri satış Excel'lerini yükle; ürünlerin hangi pazaryerinde arttığını ya da düştüğünü gör.</span>
        </div>
        <button type="button" className="btn primary" onClick={() => fileRef.current && fileRef.current.click()} disabled={reading}>{reading ? 'Okunuyor…' : '⬆ Excel yükle'}</button>
        <input ref={fileRef} type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => pick(e.target.files)} />
      </div>
      {err ? <div className="card" style={{ padding: 12, color: 'var(--danger)', fontSize: 14 }}>{err}</div> : null}

      {reports && !reports.length ? (
        <div className="card sl-empty">
          <b>Henüz rapor yok</b>
          <span>Panelden satış raporunu Excel olarak indir ve buraya yükle. Birden çok pazaryerinin dosyasını aynı anda seçebilirsin.</span>
          <span>Trendyol (ürün bazlı satış raporu) ve Hepsiburada (satış raporu) doğrudan tanınır; diğer pazaryerlerinde ürün adı, adet ve tutar sütunu olan Excel'ler okunur.</span>
        </div>
      ) : null}

      {reports && reports.length && opt ? (
        <>
          <div className="sl-periods">
            <div className="typechips" role="tablist" aria-label="Dönem">
              {opts.map((o) => <button key={o.id} type="button" role="tab" aria-selected={opt.id === o.id} className={'chip' + (opt.id === o.id ? ' on' : '')} onClick={() => setOptId(o.id)}>{o.label}</button>)}
            </div>
            <span className="hint">{plabel(opt.A[0], opt.A[1])} <b>⇄</b> {plabel(opt.B[0], opt.B[1])}{opt.note ? ' · ' + opt.note : ''}{view && view.scaled ? ' · Gün sayısı farklı dönemler günlük ortalamayla kıyaslandı.' : ''}</span>
          </div>

          {!view ? <p className="hint">{loading ? 'Yükleniyor…' : ''}</p> : !view.mpRows.length ? (
            <div className="card sl-empty"><b>Bu dönem için rapor yok</b><span>{plabel(opt.A[0], opt.A[1])} dönemini kapsayan bir rapor yükle ya da başka bir dönem seç.</span></div>
          ) : (
            <>
              <section className="card sl-card">
                <div className="sl-card-h"><h3>Pazaryerleri</h3><span className="hint">dokun → ürünleri süz</span></div>
                <div className="sl-mprow head"><span /><span>Ciro</span><span>Adet</span></div>
                {view.mpRows.map((m) => {
                  const c = m.cov;
                  const warn = !c.A.ids.length ? 'bu dönem raporu yok' : !c.B.ids.length ? 'kıyas raporu yok' : c.A.days < c.A.total ? c.A.days + '/' + c.A.total + ' gün' : c.A.approx ? 'yakın dönem ' + plabel(c.A.period[0], c.A.period[1]) : '';
                  return (
                    <button key={m.mp} type="button" className={'sl-mprow' + (mpF === m.mp ? ' on' : '')} onClick={() => setMpF(mpF === m.mp ? '' : m.mp)}>
                      <span className="sl-mpn"><span className="dot" style={{ background: mpColor(m.mp) }} />{m.mp}{warn ? <small>{warn}</small> : null}</span>
                      <span><b>{tlShort(m.a.r)}</b><Delta a={m.a.r} b={m.b.r} money none={!c.B.ids.length} /></span>
                      <span><b>{nf(m.a.q)}</b><Delta a={m.a.q} b={m.b.q} none={!c.B.ids.length} /></span>
                    </button>
                  );
                })}
                {view.mpRows.length > 1 ? (
                  <div className="sl-mprow total"><span className="sl-mpn">Toplam</span><span><b>{tlShort(view.tot.a.r)}</b><Delta a={view.tot.a.r} b={view.tot.b.r} money none={view.allNoB} /></span><span><b>{nf(view.tot.a.q)}</b><Delta a={view.tot.a.q} b={view.tot.b.q} none={view.allNoB} /></span></div>
                ) : null}
              </section>

              <section className="card sl-card">
                <div className="sl-card-h">
                  <h3>Ürünler{mpF ? <span className="sl-fil"> · {mpF} <button type="button" className="linkbtn" aria-label="Pazaryeri süzgecini kaldır" onClick={() => setMpF('')}>✕</button></span> : null}</h3>
                  <div className="sl-seg" role="tablist" aria-label="Ölçü">
                    <button type="button" role="tab" aria-selected={metric === 'q'} className={metric === 'q' ? 'on' : ''} onClick={() => setMetricS('q')}>Adet</button>
                    <button type="button" role="tab" aria-selected={metric === 'r'} className={metric === 'r' ? 'on' : ''} onClick={() => setMetricS('r')}>Ciro</button>
                  </div>
                </div>
                <input className="sl-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ürün ara (ör. power block)" aria-label="Ürün ara" />
                {view.allNoB ? <p className="hint" style={{ margin: 0 }}>Kıyas dönemi ({plabel(opt.B[0], opt.B[1])}) için rapor yok; artan/düşen görmek için o dönemin raporunu da yükle.</p> : null}
                {!q.trim() && !view.allNoB ? (
                  <div className="typechips">
                    {[['down', '▼ Düşenler'], ['up', '▲ Artanlar'], ['top', 'En çok satan']].map(([k, l]) => <button key={k} type="button" className={'chip' + (sort === k ? ' on' : '')} onClick={() => setSort(k)}>{l}</button>)}
                  </div>
                ) : null}
                {!list.length ? <p className="hint" style={{ margin: 0 }}>{q.trim() || view.allNoB ? 'Bu aramayla ürün bulunamadı.' : sort === 'down' ? 'Düşen ürün yok.' : sort === 'up' ? 'Artan ürün yok.' : 'Ürün yok.'}</p> : null}
                <div className="sl-plist">
                  {list.slice(0, limit).map(({ p, a, b }) => {
                    const pNoB = Object.keys(p.mps).every((mp) => view.noB.has(mp));
                    const mps = Object.entries(p.mps).filter(([mp]) => !mpF || mp === mpF)
                      .sort((x, z) => z[1].a[metric] + z[1].b[metric] - x[1].a[metric] - x[1].b[metric]);
                    return (
                      <button key={p.id + '|' + p.n} type="button" className="sl-prow" onClick={() => setProd(p)}>
                        <span className="sl-pn">{p.n}</span>
                        <span className="sl-pv"><b>{fmtV(a)}</b>{pNoB ? null : <small>önce {fmtV(b)}</small>}<Delta a={a} b={b} money={money} none={pNoB} /></span>
                        {!mpF ? (
                          <span className="sl-pmps">
                            {mps.map(([mp, m]) => (
                              <span key={mp} className="sl-pmp"><span className="dot" style={{ background: mpColor(mp) }} />{short(mp)} {fmtV(m.a[metric])} {view.noB.has(mp) ? null : <Delta a={m.a[metric]} b={m.b[metric]} money={money} />}</span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {list.length > limit ? <button type="button" className="btn" onClick={() => setLimit((l) => l + 30)}>Daha fazla göster ({list.length - limit})</button> : null}
              </section>

              {view.stock.length ? (
                <details className="card sl-card sl-stock">
                  <summary><b>⚠️ Stok azalıyor · {view.stock.length} ürün</b><span className="hint">Trendyol stoğu bu satış hızıyla 3 haftadan az yetecek</span></summary>
                  {view.stock.slice(0, 30).map((z) => (
                    <div key={z.p.id + '|' + z.p.n} className="sl-row">
                      <span className="sl-n" title={z.p.n}>{z.p.n}</span>
                      <span className={'sl-v' + (z.cover < 7 ? ' hot' : '')}>{z.s <= 0 ? 'Stok bitti' : z.cover < 1 ? '1 günden az' : '~' + Math.round(z.cover) + ' gün'}<small> · stok {nf(z.s)}</small></span>
                    </div>
                  ))}
                </details>
              ) : null}
            </>
          )}

          <details className="card sl-card sl-replist" onToggle={(e) => setShowList(e.currentTarget.open)}>
            <summary><b>Yüklenen raporlar · {reports.length}</b></summary>
            {showList ? reports.slice(0, 120).map((r) => (
              <div key={r.id} className="sl-rrow">
                <span className="dot" style={{ background: mpColor(r.marketplace) }} />
                <span className="sl-rmp">{r.marketplace}</span>
                <span className="sl-rp">{plabel(r.period_start, r.period_end)}</span>
                <span className="sl-rv">{tlShort((r.totals || {}).r || 0)}</span>
                <button type="button" className="linkbtn" style={{ color: 'var(--danger)' }} aria-label={r.marketplace + ' ' + plabel(r.period_start, r.period_end) + ' raporunu sil'} onClick={async () => {
                  if (!window.confirm(r.marketplace + ' ' + plabel(r.period_start, r.period_end) + ' raporu silinsin mi?')) return;
                  try { await deleteReport(r.id); setReports((x) => x.filter((z) => z.id !== r.id)); } catch (e) { setErr(String(e && e.message)); }
                }}>Sil</button>
              </div>
            )) : null}
          </details>
        </>
      ) : !reports && !err ? <p className="hint">Yükleniyor…</p> : null}

      {imp ? (
        <ImportSheet files={imp} reports={reports || []} now={now} onClose={() => setImp(null)} onRevenue={toRevenue}
          onDone={(saved, keepOpen) => {
            const gone = new Set(saved.map((s) => s.replaced).filter(Boolean));
            setReports((r) => [...saved.map((s) => s.row), ...(r || []).filter((x) => !gone.has(x.id))].sort((x, z) => z.period_end.localeCompare(x.period_end)));
            setOptId('son');
            if (!keepOpen) setImp(null);
          }} />
      ) : null}
      {prod && opt ? <ProductSheet noB={view ? view.noB : new Set()} p={prod} A={opt.A} B={opt.B} metric={metric} reports={reports || []} now={now} onClose={() => setProd(null)} /> : null}
    </div>
  );
}
