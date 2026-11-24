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
  const opts = [];
  // En son tarihli rapor (yükleme sırası değil, dönem sonu)
  const last = [...reports].sort((x, z) => z.period_end.localeCompare(x.period_end) || lenOf(x.period_start, x.period_end) - lenOf(z.period_start, z.period_end))[0];
  if (last) {
    const a = last.period_start, b = last.period_end;
    opts.push({ id: 'son', label: 'Son rapor', A: [a, b] });
  }
  opts.push(
    { id: 'bugun', label: 'Bugün', A: [t, t], note: 'Gün henüz bitmedi.' },
    { id: 'dun', label: 'Dün', A: [y, y] },
    { id: '7', label: 'Son 7 gün', A: [shift(t, -7), y] },
    { id: '30', label: 'Son 30 gün', A: [shift(t, -30), y] },
    { id: 'ay', label: 'Geçen ay', A: [pm1, pm2] }
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
      <div className="sl-ps-codes">{p.code ? <span>Stok kodu <b>{p.code}</b></span> : null}{p.barcode ? <span>Barkod <b>{p.barcode}</b></span> : null}{(p.keys.Hepsiburada || []).length ? <span>HB SKU <b>{p.keys.Hepsiburada[0]}</b></span> : null}</div>
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

// ---------- Ana görünüm: rapor ----------
const CMP = [['prev', 'Önceki dönem'], ['week', 'Geçen hafta'], ['month', 'Geçen ay']];
const shiftMonth = (k, n) => { const [y, m, d] = k.split('-').map(Number); const last = new Date(y, m - 1 + n + 1, 0).getDate(); return ymd(new Date(y, m - 1 + n, Math.min(d, last))); };
function compareRange(opt, mode) {
  const [a, b] = opt.A; const n = lenOf(a, b);
  if (mode === 'week' && n <= 7) return [shift(a, -7), shift(b, -7)];
  if (mode === 'month') return opt.id === 'ay' ? [shiftMonth(a, -1), ymd(new Date(+a.slice(0, 4), +a.slice(5, 7) - 1, 0))] : [shiftMonth(a, -1), shiftMonth(b, -1)];
  if (opt.id === 'ay') return [shiftMonth(a, -1), shift(a, -1)];
  return [shift(a, -n), shift(a, -1)];
}
const DATIVE = { 'Önceki dönem': 'önceki döneme', 'Geçen hafta': 'geçen haftaya', 'Geçen ay': 'geçen aya' };
const QUICK = [
  ['all', 'Tümü'], ['down', '▼ Düşenler'], ['up', '▲ Artanlar'], ['stopped', 'Satışı duranlar'], ['new', 'Yeni satanlar'], ['stock', 'Stok riski'], ['cancel', 'İptali yüksek']
];
const COLS = [
  ['code', 'Stok kodu'], ['name', 'Ürün'], ['mp', 'Pzr'], ['aq', 'Adet'], ['bq', 'Önceki adet'], ['dq', 'Adet farkı'], ['dp', 'Değişim'], ['ar', 'Ciro'], ['dr', 'Ciro farkı'], ['s', 'Stok']
];
const pctTxt = (a, b) => (b ? (a / b - 1) : null);
const fmtPct = (v) => (v == null ? '' : Math.abs(v) < 0.005 ? '0' : (v > 0 ? '+' : '−') + '%' + (Math.abs(v * 100) < 10 ? Math.abs(v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : Math.round(Math.abs(v * 100))));
const sign = (v, f) => (Math.abs(v) < 0.5 ? '0' : (v > 0 ? '+' : '−') + f(Math.abs(v)));

export function SalesView({ now, actions }) {
  const [reports, setReports] = useState(null);
  const [err, setErr] = useState('');
  const [optId, setOptId] = useState(null);
  const [cmp, setCmp] = useState(() => { try { return localStorage.getItem('ajanda-sales-cmp') || 'prev'; } catch { return 'prev'; } });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quick, setQuick] = useState('all');
  const [sortBy, setSortBy] = useState(null); // { k, dir }
  const [mpF, setMpF] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const [prod, setProd] = useState(null);
  const [imp, setImp] = useState(null);
  const [reading, setReading] = useState(false);
  const [showList, setShowList] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    listReports().then(setReports).catch((e) => setErr(missingTable(e) ? 'Satış raporları için Supabase\'de 29 numaralı SQL\'i çalıştır (Hesap → Kurulum durumu → Kopyala).' : String(e && e.message)));
  }, []);

  const dayKey = now ? now.toDateString() : '';
  const opts = useMemo(() => periodOptions(now, reports || []), [reports, dayKey]);
  const mpsAll = useMemo(() => [...new Set((reports || []).map((r) => r.marketplace))], [reports]);
  const opt0 = useMemo(() => {
    if (!reports) return null;
    const chosen = opts.find((o) => o.id === optId);
    if (chosen) return chosen;
    const has = (r) => mpsAll.some((mp) => coverReports(reports, mp, r[0], r[1]).ids.length);
    return opts.find((o) => o.id !== 'bugun' && has(o.A) && has(compareRange(o, cmp))) || opts.find((o) => o.id !== 'bugun' && has(o.A)) || opts[0];
  }, [opts, optId, reports, mpsAll, cmp]);
  const opt = opt0 ? { ...opt0, B: compareRange(opt0, cmp) } : null;
  const weekOk = opt && lenOf(opt.A[0], opt.A[1]) <= 7;
  const cmpLabel = (CMP.find(([k]) => k === (cmp === 'week' && !weekOk ? 'prev' : cmp)) || CMP[0])[1];

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
    const scaleB = {};
    Object.keys(data.byMp).forEach((mp) => { const c = data.cov[mp]; scaleB[mp] = c.B.days && c.A.days && c.A.days !== c.B.days ? c.A.days / c.B.days : 1; });
    const products = compareProducts(data.byMp, scaleB);
    const mpRows = Object.keys(data.byMp).map((mp) => {
      const t = { a: { q: 0, r: 0, o: 0, x: 0 }, b: { q: 0, r: 0, o: 0, x: 0 } };
      data.byMp[mp].A.forEach((x) => { t.a.q += x.q || 0; t.a.r += x.r || 0; t.a.o += x.o || 0; t.a.x += x.x || 0; });
      data.byMp[mp].B.forEach((x) => { const s = scaleB[mp]; t.b.q += (x.q || 0) * s; t.b.r += (x.r || 0) * s; t.b.o += (x.o || 0) * s; t.b.x += (x.x || 0) * s; });
      return { mp, ...t, cov: data.cov[mp] };
    }).sort((x, z) => z.a.r - x.a.r);
    const add = (s, m) => ({ q: s.q + m.q, r: s.r + m.r, o: s.o + m.o, x: s.x + m.x });
    const z = { q: 0, r: 0, o: 0, x: 0 };
    const tot = { a: mpRows.reduce((s, m) => add(s, m.a), z), b: mpRows.reduce((s, m) => add(s, m.b), z) };
    const noB = new Set(mpRows.filter((m) => !m.cov.B.ids.length).map((m) => m.mp));
    const daysA = Math.max(1, ...mpRows.map((m) => m.cov.A.days || 0));
    products.forEach((p) => {
      p.hasB = Object.keys(p.mps).some((mp) => !noB.has(mp));
      p.cover = p.s != null && p.a.q > 0 ? p.s / (p.a.q / daysA) : null;
    });
    return { products, mpRows, tot, noB, allNoB: noB.size === mpRows.length, scaled: Object.values(scaleB).some((v) => v !== 1) };
  }, [data, key]);

  // Satır değerleri (pazaryeri süzgeci uygulanmış)
  const rowsAll = useMemo(() => {
    if (!view) return [];
    return view.products.filter((p) => !mpF || p.mps[mpF]).map((p) => {
      const src = mpF ? p.mps[mpF] : p;
      const a = src.a, b = src.b;
      const s = mpF ? p.mps[mpF].s : p.s;
      return { p, aq: a.q, bq: b.q, ar: a.r, br: b.r, ax: a.x || 0, dq: a.q - b.q, dr: a.r - b.r, dp: b.q ? a.q / b.q - 1 : (a.q ? Infinity : 0), s, cover: s != null && a.q > 0 ? s / (a.q / Math.max(1, ...view.mpRows.map((m) => m.cov.A.days || 0))) : null, hasB: mpF ? !view.noB.has(mpF) : p.hasB };
    });
  }, [view, mpF]);

  const QF = {
    all: () => true,
    down: (r) => r.hasB && r.dq < 0,
    up: (r) => r.hasB && r.dq > 0,
    stopped: (r) => r.hasB && r.bq >= 2 && r.aq === 0,
    new: (r) => r.hasB && r.bq === 0 && r.aq > 0,
    stock: (r) => r.cover != null && r.cover < 14,
    cancel: (r) => r.ax >= 3 && r.ax / (r.aq + r.ax) >= 0.15
  };
  const DEF_SORT = { all: ['ar', -1], down: ['dq', 1], up: ['dq', -1], stopped: ['bq', -1], new: ['aq', -1], stock: ['cover', 1], cancel: ['ax', -1] };
  const counts = useMemo(() => Object.fromEntries(QUICK.map(([k]) => [k, rowsAll.filter(QF[k]).length])), [rowsAll]);

  const insights = useMemo(() => {
    if (!view) return [];
    const out = [];
    const T = view.tot;
    const rp = pctTxt(T.a.r, T.b.r);
    if (!view.allNoB && rp != null) {
      const qp = pctTxt(T.a.q, T.b.q);
      out.push({ tone: rp >= 0 ? 'up' : 'down', text: <>Ciro <b>{tl(T.a.r)}</b>, {DATIVE[cmpLabel] || 'kıyasa'} göre <b>{fmtPct(rp)}</b> ({sign(T.a.r - T.b.r, tlShort)}). Satış adedi {nf(T.a.q)} ({fmtPct(qp)}).</> });
    }
    if (view.mpRows.length > 1 && !view.allNoB) {
      const ch = view.mpRows.filter((m) => m.b.r > 0 && m.a.r > 0).map((m) => ({ mp: m.mp, v: m.a.r / m.b.r - 1 }));
      if (ch.length > 1) {
        const best = ch.reduce((x, y) => (y.v > x.v ? y : x)), worst = ch.reduce((x, y) => (y.v < x.v ? y : x));
        out.push({ tone: 'info', text: <>En iyi giden pazaryeri <b>{best.mp}</b> ({fmtPct(best.v)}){worst.mp !== best.mp ? <>, en çok düşen <b>{worst.mp}</b> ({fmtPct(worst.v)})</> : null}.</>, mp: worst.v < 0 ? worst.mp : best.mp });
      }
    }
    const nm = (r) => (r.p.code ? r.p.code + ' · ' : '') + r.p.n.slice(0, 48);
    const down = rowsAll.filter(QF.down).sort((x, y) => x.dq - y.dq).slice(0, 3);
    if (down.length) out.push({ tone: 'down', text: <>En çok düşenler: {down.map((r, i) => <span key={r.p.id + i}>{i ? ', ' : ''}<b>{nm(r)}</b> ({sign(r.dq, nf)} adet)</span>)}</>, quick: 'down' });
    const up = rowsAll.filter(QF.up).sort((x, y) => y.dq - x.dq).slice(0, 3);
    if (up.length) out.push({ tone: 'up', text: <>En çok artanlar: {up.map((r, i) => <span key={r.p.id + i}>{i ? ', ' : ''}<b>{nm(r)}</b> ({sign(r.dq, nf)} adet)</span>)}</>, quick: 'up' });
    if (counts.stopped) out.push({ tone: 'down', text: <><b>{counts.stopped} ürün</b> önceki dönemde satıp bu dönem hiç satmadı.</>, quick: 'stopped' });
    if (counts.stock) out.push({ tone: 'warn', text: <><b>{counts.stock} ürünün</b> stoğu bu satış hızıyla 2 haftadan az yetiyor.</>, quick: 'stock' });
    if (counts.cancel) out.push({ tone: 'warn', text: <><b>{counts.cancel} üründe</b> iptal oranı %15'in üstünde.</>, quick: 'cancel' });
    if (counts.new) out.push({ tone: 'info', text: <><b>{counts.new} ürün</b> önceki dönemde satmazken bu dönem sattı.</>, quick: 'new' });
    return out;
  }, [view, rowsAll, counts, cmpLabel]);

  const list = useMemo(() => {
    let l = rowsAll;
    const qq = q.trim().toLocaleLowerCase('tr-TR');
    if (qq) {
      const words = qq.split(/\s+/);
      l = l.filter((r) => {
        const codes = r.p.codes.map((c) => String(c).toLocaleLowerCase('tr-TR'));
        if (words.length === 1 && codes.some((c) => c === qq || c.startsWith(qq))) return true;
        const n = (r.p.n + ' ' + (r.p.br || '') + ' ' + codes.join(' ')).toLocaleLowerCase('tr-TR');
        return words.every((w) => n.includes(w));
      });
    } else l = l.filter(QF[quick]);
    const [k, dir] = sortBy ? [sortBy.k, sortBy.dir] : DEF_SORT[qq ? 'all' : quick];
    const val = (r) => (k === 'code' ? String(r.p.code || r.p.barcode || '') : k === 'name' ? r.p.n : k === 'mp' ? Object.keys(r.p.mps).length : k === 'dp' ? (Number.isFinite(r.dp) ? r.dp : 1e9) : (r[k] == null ? (dir > 0 ? 1e12 : -1e12) : r[k]));
    return [...l].sort((x, y) => { const a = val(x), b = val(y); return (typeof a === 'string' ? a.localeCompare(b, 'tr', { numeric: true }) : a - b) * dir; });
  }, [rowsAll, quick, sortBy, q]);
  useEffect(() => { setLimit(50); }, [quick, sortBy, mpF, q, key]);

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
        } catch (e) { files.push({ name: f.name, error: e && e.message ? e.message : 'Okunamadı' }); }
      }
      setImp(files);
    } catch (e) { setErr(e.message || 'Dosya okunamadı.'); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const toRevenue = async (day, mp, amount, orders) => {
    if (actions && actions.saveRevenue) await actions.saveRevenue(day, [{ marketplace: mp, amount: Math.round(amount * 100) / 100, orders: orders ? Math.round(orders) : null }], { keepOpen: true });
  };
  const setCmpS = (v) => { setCmp(v); try { localStorage.setItem('ajanda-sales-cmp', v); } catch { /* yok say */ } };
  const clickSort = (k) => setSortBy((s) => {
    const [dk, dd] = DEF_SORT[quick];
    const cur = s || { k: dk, dir: dd };
    return cur.k === k ? { k, dir: -cur.dir } : { k, dir: k === 'code' || k === 'name' || k === 'cover' ? 1 : -1 };
  });
  const sortCur = sortBy || { k: DEF_SORT[q.trim() ? 'all' : quick][0], dir: DEF_SORT[q.trim() ? 'all' : quick][1] };
  const doExport = async () => {
    if (!view) return;
    setExporting(true);
    try {
      const { exportSales } = await import('./excel.js');
      await exportSales({ A: opt.A, B: opt.B, cmpLabel, tot: view.tot, mpRows: view.mpRows, rows: rowsAll, mps: view.mpRows.map((m) => m.mp), label: plabel(opt.A[0], opt.A[1]) });
    } catch (e) { setErr('Excel oluşturulamadı: ' + (e && e.message)); } finally { setExporting(false); }
  };

  // Rapor takvimi: son 35 günde hangi günlerin raporu var
  const coverage = useMemo(() => {
    if (!reports || !reports.length) return null;
    const t = ymd(now);
    const days = Array.from({ length: 35 }, (_, i) => shift(t, i - 35));
    return { days, rows: mpsAll.map((mp) => { const own = reports.filter((r) => r.marketplace === mp); return { mp, on: days.map((d) => own.some((r) => r.period_start <= d && r.period_end >= d)) }; }) };
  }, [reports, dayKey, mpsAll]);

  const T = view && view.tot;
  const showB = view && !view.allNoB;
  const kpi = (label, a, b, f, extra) => (
    <div className="sl-kpi">
      <span>{label}</span><b>{f(a)}</b>
      {showB ? <small>önce {f(b)} <Delta a={a} b={b} money={f === tlShort} invert={extra === 'invert'} /></small> : null}
    </div>
  );

  return (
    <div className="sl">
      <div className="sl-top">
        <div>
          <h2 className="sl-h">Satış raporu</h2>
          <span className="hint">Pazaryeri satış Excel'lerinden dönem kıyası: ne arttı, ne düştü, nerede.</span>
        </div>
        <div className="sl-top-b">
          {view && view.mpRows.length ? <button type="button" className="btn" onClick={doExport} disabled={exporting}>{exporting ? 'Hazırlanıyor…' : '⬇ Excel'}</button> : null}
          <button type="button" className="btn primary" onClick={() => fileRef.current && fileRef.current.click()} disabled={reading}>{reading ? 'Okunuyor…' : '⬆ Excel yükle'}</button>
        </div>
        <input ref={fileRef} type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => pick(e.target.files)} />
      </div>
      {err ? <div className="card" style={{ padding: 12, color: 'var(--danger)', fontSize: 14 }}>{err}</div> : null}

      {reports && !reports.length ? (
        <div className="card sl-empty">
          <b>Henüz rapor yok</b>
          <span>Panelden satış raporunu Excel olarak indir ve yükle. Gün gün indirdiysen dosya adına tarihi yaz ("1 Kasım"), hepsini birlikte seç.</span>
          <span>Trendyol (ürün bazlı satış raporu) ve Hepsiburada (satış raporu) doğrudan tanınır; diğer pazaryerlerinde ürün adı, adet ve tutar sütunu olan Excel'ler okunur.</span>
        </div>
      ) : null}

      {reports && reports.length && opt ? (
        <>
          <div className="card sl-ctrl">
            <div className="sl-ctrl-r">
              <span className="sl-ctrl-l">Dönem</span>
              <div className="typechips" role="tablist" aria-label="Dönem">
                {opts.map((o) => <button key={o.id} type="button" role="tab" aria-selected={opt.id === o.id} className={'chip' + (opt.id === o.id ? ' on' : '')} onClick={() => { setOptId(o.id); setSortBy(null); }}>{o.label}</button>)}
              </div>
            </div>
            <div className="sl-ctrl-r">
              <span className="sl-ctrl-l">Kıyas</span>
              <div className="typechips" role="tablist" aria-label="Kıyas">
                {CMP.filter(([k]) => k !== 'week' || weekOk).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={(cmp === 'week' && !weekOk ? 'prev' : cmp) === k} className={'chip' + ((cmp === 'week' && !weekOk ? 'prev' : cmp) === k ? ' on' : '')} onClick={() => setCmpS(k)}>{l}</button>)}
              </div>
            </div>
            {mpsAll.length > 1 ? (
              <div className="sl-ctrl-r">
                <span className="sl-ctrl-l">Pazaryeri</span>
                <div className="typechips">
                  <button type="button" className={'chip' + (!mpF ? ' on' : '')} onClick={() => setMpF('')}>Tümü</button>
                  {mpsAll.map((mp) => <button key={mp} type="button" className={'chip' + (mpF === mp ? ' on' : '')} onClick={() => setMpF(mp)}><span className="dot" style={{ background: mpColor(mp) }} /> {mp}</button>)}
                </div>
              </div>
            ) : null}
            <span className="hint sl-ctrl-h"><b>{plabel(opt.A[0], opt.A[1])}</b> ile <b>{plabel(opt.B[0], opt.B[1])}</b> kıyaslanıyor{opt.note ? ' · ' + opt.note : ''}{view && view.scaled ? ' · gün sayısı farklı dönemler günlük ortalamayla kıyaslandı' : ''}</span>
          </div>

          {!view ? <p className="hint">{loading ? 'Yükleniyor…' : ''}</p> : !view.mpRows.length ? (
            <div className="card sl-empty"><b>Bu dönemin raporu yok</b><span>{plabel(opt.A[0], opt.A[1])} için rapor yükle ya da başka dönem seç. Aşağıdaki rapor takviminde hangi günlerin yüklü olduğunu görebilirsin.</span></div>
          ) : (
            <>
              <div className="sl-kpis">
                {kpi('Ciro', T.a.r, T.b.r, tlShort)}
                {kpi('Satış adedi', T.a.q, T.b.q, nf)}
                {T.a.o ? kpi('Sipariş', T.a.o, T.b.o, nf) : null}
                {T.a.o ? kpi('Sepet ortalaması', T.a.r / T.a.o, T.b.o ? T.b.r / T.b.o : 0, tlShort) : null}
                {T.a.x ? (
                  <div className="sl-kpi"><span>İptal oranı</span><b>%{((T.a.x / (T.a.q + T.a.x || 1)) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</b>
                    {showB && T.b.q ? <small>önce %{((T.b.x / (T.b.q + T.b.x || 1)) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</small> : <small>{nf(T.a.x)} adet</small>}</div>
                ) : null}
              </div>

              {view.allNoB ? <div className="card sl-note">Kıyas dönemi ({plabel(opt.B[0], opt.B[1])}) için rapor yok. Artış ve düşüşleri görmek için o dönemin raporunu da yükle ya da başka bir kıyas seç.</div> : null}

              {insights.length ? (
                <section className="card sl-card sl-ins">
                  <h3>Özet</h3>
                  <ul>
                    {insights.map((x, i) => (
                      <li key={i} className={'t-' + x.tone}>
                        <span>{x.text}</span>
                        {x.quick ? <button type="button" className="linkbtn" onClick={() => { setQ(''); setQuick(x.quick); setSortBy(null); document.getElementById('sl-table') && document.getElementById('sl-table').scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Listele</button> : null}
                        {x.mp ? <button type="button" className="linkbtn" onClick={() => setMpF(x.mp)}>Süz</button> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {view.mpRows.length > 1 && !mpF ? (
                <section className="card sl-card">
                  <h3>Pazaryerleri</h3>
                  <div className="sl-mpt">
                    <div className="sl-mpt-r head"><span>Pazaryeri</span><span>Ciro</span><span>Fark</span><span>Adet</span><span>Fark</span><span>Pay</span></div>
                    {view.mpRows.map((m) => {
                      const c = m.cov; const nb = !c.B.ids.length;
                      const warn = !c.A.ids.length ? 'bu dönem raporu yok' : nb ? 'kıyas raporu yok' : c.A.days < c.A.total ? c.A.days + '/' + c.A.total + ' gün' : c.A.approx ? 'yakın dönem' : '';
                      return (
                        <button key={m.mp} type="button" className="sl-mpt-r" onClick={() => setMpF(m.mp)}>
                          <span className="sl-mpn"><span className="dot" style={{ background: mpColor(m.mp) }} />{m.mp}{warn ? <small>{warn}</small> : null}</span>
                          <span>{tlShort(m.a.r)}</span>
                          <span><Delta a={m.a.r} b={m.b.r} money none={nb} /></span>
                          <span>{nf(m.a.q)}</span>
                          <span><Delta a={m.a.q} b={m.b.q} none={nb} /></span>
                          <span className="sl-share"><i style={{ width: (T.a.r ? (m.a.r / T.a.r) * 100 : 0) + '%', background: mpColor(m.mp) }} />%{T.a.r ? Math.round((m.a.r / T.a.r) * 100) : 0}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="card sl-card" id="sl-table">
                <div className="sl-card-h">
                  <h3>Ürünler{mpF ? <span className="sl-fil"> · {mpF} <button type="button" className="linkbtn" aria-label="Pazaryeri süzgecini kaldır" onClick={() => setMpF('')}>✕</button></span> : null}</h3>
                  <span className="hint">{q.trim() ? list.length + ' sonuç' : counts[quick] + ' ürün'}</span>
                </div>
                <p className="sl-legend"><b>Adet</b> ve <b>Ciro</b>: {plabel(opt.A[0], opt.A[1])} · <b>Önceki adet</b>: {plabel(opt.B[0], opt.B[1])}{view.scaled ? ' (gün sayısı farklı, günlük ortalamaya çevrildi)' : ''} · <b>Adet farkı</b> = Adet − Önceki adet · <b>Değişim</b> = farkın önceki adede oranı</p>
                <input className="sl-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stok kodu, barkod ya da ürün adı" aria-label="Stok kodu, barkod ya da ürün adı ile ara" />
                {!q.trim() ? (
                  <div className="typechips sl-quick">
                    {QUICK.map(([k, l]) => (counts[k] || k === 'all' || k === quick ? <button key={k} type="button" className={'chip' + (quick === k ? ' on' : '')} onClick={() => { setQuick(k); setSortBy(null); }}>{l} <span className="sl-cnt">{counts[k]}</span></button> : null))}
                  </div>
                ) : null}
                <div className="sl-tbl" role="table" aria-label="Ürün raporu">
                  <div className="sl-tr head" role="row">
                    {COLS.map(([k, l]) => (
                      <button key={k} type="button" role="columnheader" className={'c-' + k + (sortCur.k === k ? ' on' : '')} aria-sort={sortCur.k === k ? (sortCur.dir > 0 ? 'ascending' : 'descending') : 'none'} onClick={() => clickSort(k)}>
                        {l}{sortCur.k === k ? (sortCur.dir > 0 ? ' ↑' : ' ↓') : ''}
                      </button>
                    ))}
                  </div>
                  {list.slice(0, limit).map((r) => (
                    <button key={r.p.id + '|' + r.p.n} type="button" role="row" className="sl-tr" onClick={() => setProd(r.p)}>
                      <span className="c-code">{r.p.code || r.p.barcode || '—'}</span>
                      <span className="c-name" title={r.p.n}>{r.p.n}</span>
                      <span className="c-mp">{Object.keys(r.p.mps).filter((mp) => !mpF || mp === mpF).map((mp) => <span key={mp} className="dot" title={mp} style={{ background: mpColor(mp) }} />)}</span>
                      <span className="c-aq"><b>{nf(r.aq)}</b></span>
                      <span className="c-bq">{r.hasB ? nf(r.bq) : '—'}</span>
                      <span className={'c-dq ' + (r.hasB && Math.abs(r.dq) >= 0.5 ? (r.dq > 0 ? 'up' : 'down') : '')}>{r.hasB ? sign(r.dq, nf) : ''}</span>
                      <span className={'c-dp ' + (r.hasB && Math.abs(r.dq) >= 0.5 ? (r.dq > 0 ? 'up' : 'down') : '')}>{!r.hasB ? '' : !r.bq ? (r.aq ? 'yeni' : '') : !r.aq ? '−%100' : fmtPct(r.aq / r.bq - 1)}</span>
                      <span className="c-ar">{tlShort(r.ar)}</span>
                      <span className={'c-dr ' + (r.hasB && Math.abs(r.dr) >= 1 ? (r.dr > 0 ? 'up' : 'down') : '')}>{r.hasB ? sign(r.dr, tlShort) : ''}</span>
                      <span className={'c-s' + (r.cover != null && r.cover < 7 ? ' hot' : '')}>{r.s == null ? '' : nf(r.s)}</span>
                    </button>
                  ))}
                </div>
                {!list.length ? <p className="hint" style={{ margin: 0 }}>{q.trim() ? 'Bu kodla ya da adla ürün bulunamadı.' : 'Bu listede ürün yok.'}</p> : null}
                {list.length > limit ? <button type="button" className="btn" onClick={() => setLimit((l) => l + 100)}>Daha fazla göster ({list.length - limit})</button> : null}
              </section>
            </>
          )}

          {coverage ? (
            <section className="card sl-card">
              <div className="sl-card-h"><h3>Rapor takvimi</h3><span className="hint">son 35 gün · dolu = rapor var</span></div>
              <div className="sl-cov">
                {coverage.rows.map((r) => (
                  <div key={r.mp} className="sl-cov-r">
                    <span className="sl-cov-mp">{short(r.mp)}</span>
                    <span className="sl-cov-days">{r.on.map((on, i) => <i key={i} className={on ? 'on' : ''} style={on ? { background: mpColor(r.mp) } : null} title={dm(coverage.days[i]) + (on ? '' : ' · rapor yok')} />)}</span>
                  </div>
                ))}
                <div className="sl-cov-r foot"><span /><span className="sl-cov-days lbl"><em>{dm(coverage.days[0])}</em><em>{dm(coverage.days[coverage.days.length - 1])}</em></span></div>
              </div>
              <details className="sl-replist" onToggle={(e) => setShowList(e.currentTarget.open)}>
                <summary>Yüklenen raporlar ({reports.length})</summary>
                {showList ? reports.slice(0, 200).map((r) => (
                  <div key={r.id} className="sl-rrow">
                    <span className="dot" style={{ background: mpColor(r.marketplace) }} />
                    <span className="sl-rmp">{r.marketplace}</span>
                    <span className="sl-rp">{plabel(r.period_start, r.period_end)}</span>
                    <span className="sl-rv">{tlShort((r.totals || {}).r || 0)}</span>
                    <button type="button" className="linkbtn" style={{ color: 'var(--danger)' }} aria-label={r.marketplace + ' ' + plabel(r.period_start, r.period_end) + ' raporunu sil'} onClick={async () => {
                      if (!window.confirm(r.marketplace + ' ' + plabel(r.period_start, r.period_end) + ' raporu silinsin mi?')) return;
                      try { await deleteReport(r.id); setReports((x) => x.filter((z2) => z2.id !== r.id)); } catch (e) { setErr(String(e && e.message)); }
                    }}>Sil</button>
                  </div>
                )) : null}
              </details>
            </section>
          ) : null}
        </>
      ) : !reports && !err ? <p className="hint">Yükleniyor…</p> : null}

      {imp ? (
        <ImportSheet files={imp} reports={reports || []} now={now} onClose={() => setImp(null)} onRevenue={toRevenue}
          onDone={(saved, keepOpen) => {
            const gone = new Set(saved.map((s) => s.replaced).filter(Boolean));
            setReports((r) => [...saved.map((s) => s.row), ...(r || []).filter((x) => !gone.has(x.id))].sort((x, z2) => z2.period_end.localeCompare(x.period_end)));
            setOptId('son');
            if (!keepOpen) setImp(null);
          }} />
      ) : null}
      {prod && opt ? <ProductSheet noB={view ? view.noB : new Set()} p={prod} A={opt.A} B={opt.B} metric="q" reports={reports || []} now={now} onClose={() => setProd(null)} /> : null}
    </div>
  );
}
