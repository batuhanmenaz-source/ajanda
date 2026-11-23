// İş → Satış raporları: Trendyol "ürün bazlı satış raporu" ve Hepsiburada "satış raporu" Excel'leri.
// Dosya telefonda okunur; yalnız ürün özetleri (ürün, adet, ciro, iptal, iade, komisyon, stok) kaydedilir.
// Raporlar uygulama açılışında yüklenmez; yalnız bu sayfa açılınca listelenir, ürünler seçilen rapor için çekilir.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, DEMO } from './supabase.js';
import { mpColor } from './constants.js';
import { addDays, startOfDay, toDateInput, fromDateInput, daysBetween } from './dates.js';
import { tl, tlShort } from './revenue.jsx';
import { Sheet } from './ui.jsx';

import { parseSales, totalsOf, str } from './salesparse.js';

// ---------- Saklama (Supabase ya da örnek modda tarayıcı) ----------
const DEMO_KEY = 'ajanda-sales-demo-v1';
const demoAll = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch { return []; } };
const demoSet = (v) => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(v)); } catch { /* yok say */ } };
const META = 'id, marketplace, period_start, period_end, file_name, totals, created_at';

async function listReports() {
  if (DEMO) return demoAll().map(({ items, ...m }) => m);
  const { data, error } = await supabase.from('sales_reports').select(META).order('period_end', { ascending: false }).limit(200);
  if (error) throw error;
  return data || [];
}
async function getItems(id) {
  if (DEMO) return (demoAll().find((x) => x.id === id) || {}).items || [];
  const { data, error } = await supabase.from('sales_reports').select('items').eq('id', id).single();
  if (error) throw error;
  return data.items || [];
}
async function saveReport(rep, replaceId) {
  if (DEMO) {
    const all = demoAll().filter((x) => x.id !== replaceId);
    const row = { id: 'd' + Date.now(), created_at: new Date().toISOString(), ...rep };
    demoSet([row, ...all]);
    const { items, ...m } = row; return m;
  }
  if (replaceId) { const { error } = await supabase.from('sales_reports').delete().eq('id', replaceId); if (error) throw error; }
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('sales_reports').insert({ user_id: u.user.id, ...rep }).select(META).single();
  if (error) throw error;
  return data;
}
async function deleteReport(id) {
  if (DEMO) { demoSet(demoAll().filter((x) => x.id !== id)); return; }
  const { error } = await supabase.from('sales_reports').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Yardımcılar ----------
const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dm = (k) => { const d = fromDateInput(k); return d.getDate() + ' ' + MON[d.getMonth()]; };
const periodLabel = (a, b) => (a === b ? dm(a) : dm(a) + ' – ' + dm(b));
const pct = (a, b) => (b ? ((a / b) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '0');
const nf = (v) => Math.round(v || 0).toLocaleString('tr-TR');
const ch = (a, b) => (b ? a / b - 1 : null);
function Delta({ v, invert }) {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < 0.005) return null;
  const up = v >= 0;
  return <span className={'sl-d ' + (up !== !!invert ? 'up' : 'down')}>{up ? '▲' : '▼'} %{Math.abs(Math.round(v * 100))}</span>;
}

function presets(now) {
  const t = startOfDay(now);
  const y = addDays(t, -1);
  const m1 = new Date(t.getFullYear(), t.getMonth(), 1);
  const pm1 = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const pm2 = new Date(t.getFullYear(), t.getMonth(), 0);
  return [
    ['Dün', toDateInput(y), toDateInput(y)],
    ['Son 7 gün', toDateInput(addDays(t, -7)), toDateInput(y)],
    ['Bu ay', toDateInput(m1), toDateInput(t)],
    ['Geçen ay', toDateInput(pm1), toDateInput(pm2)]
  ];
}

// ---------- İçe aktarma penceresi ----------
function ImportSheet({ parsed, fileName, reports, now, onClose, onSaved, onRevenue }) {
  const ps = presets(now);
  const [a, setA] = useState(ps[2][1]);
  const [b, setB] = useState(ps[2][2]);
  const [toRev, setToRev] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const same = reports.find((x) => x.marketplace === parsed.mp && x.period_start === a && x.period_end === b);
  const oneDay = a && a === b;
  const t = parsed.totals;
  const bad = !a || !b || b < a;
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const row = await saveReport({ marketplace: parsed.mp, period_start: a, period_end: b, file_name: str(fileName, 120), totals: t, items: parsed.items }, same && same.id);
      if (oneDay && toRev && onRevenue) await onRevenue(a, parsed.mp, t.r, t.o);
      onSaved(row);
    } catch (e) {
      setErr(/sales_reports/.test(String(e && e.message)) ? 'Supabase\'de 29 numaralı SQL çalıştırılmamış (Hesap → Kurulum durumu).' : 'Kaydedilemedi: ' + (e && e.message));
    } finally { setBusy(false); }
  };
  return (
    <Sheet title="Satış raporu ekle" onClose={onClose}>
      <div className="sl-imp-head">
        <span className="tag"><span className="dot" style={{ background: mpColor(parsed.mp) }} />{parsed.mp}</span>
        <span className="hint">{fileName}</span>
      </div>
      <div className="sl-imp-sum">
        <div><span>Net ciro</span><b>{tl(t.r)}</b></div>
        <div><span>Satış adedi</span><b>{nf(t.q)}</b></div>
        <div><span>Ürün</span><b>{t.n}</b></div>
        {t.x ? <div><span>İptal</span><b>{nf(t.x)}</b></div> : null}
      </div>
      <div className="field">
        <label>Bu rapor hangi dönemin?</label>
        <div className="typechips">{ps.map(([l, x, y]) => <button key={l} type="button" className={'chip' + (a === x && b === y ? ' on' : '')} onClick={() => { setA(x); setB(y); }}>{l}</button>)}</div>
        <div className="row2" style={{ marginTop: 8 }}>
          <input type="date" value={a} max={b || undefined} onChange={(e) => setA(e.target.value)} aria-label="Dönem başı" />
          <input type="date" value={b} min={a || undefined} onChange={(e) => setB(e.target.value)} aria-label="Dönem sonu" />
        </div>
        <span className="hint">Panelden raporu indirirken seçtiğin tarih aralığını seç.</span>
      </div>
      {oneDay ? (
        <label className="wl-check"><input type="checkbox" checked={toRev} onChange={(e) => setToRev(e.target.checked)} />
          <span>Bu günün cirosuna da işle: <b>{parsed.mp} {tl(t.r)}</b>{t.o ? ' · ' + nf(t.o) + ' sipariş' : ''}</span></label>
      ) : null}
      {same ? <p className="hint" style={{ color: '#B35C00', margin: 0 }}>Bu dönem için {parsed.mp} raporu zaten var; kaydedince yenisiyle değiştirilir.</p> : null}
      {err ? <p className="hint" style={{ color: 'var(--danger)', margin: 0 }}>{err}</p> : null}
      <button type="button" className="btn big primary" disabled={busy || bad} onClick={save}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
    </Sheet>
  );
}

// ---------- Ana görünüm ----------
export function SalesView({ now, actions }) {
  const [reports, setReports] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);
  const [items, setItems] = useState(null);
  const [prevItems, setPrevItems] = useState(null);
  const [imp, setImp] = useState(null);
  const [reading, setReading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    listReports().then((r) => { setReports(r); if (r.length) setSel(r[0].id); })
      .catch((e) => setErr(/sales_reports/.test(String(e && e.message)) ? 'Satış raporları için Supabase\'de 29 numaralı SQL\'i çalıştır (Hesap → Kurulum durumu → Kopyala).' : String(e && e.message)));
  }, []);
  const cur = reports && reports.find((x) => x.id === sel);
  // Aynı pazaryerinin bir önceki raporu (kıyas için)
  const prev = cur && reports.filter((x) => x.marketplace === cur.marketplace && x.period_end < cur.period_start).sort((x, y) => y.period_end.localeCompare(x.period_end))[0];
  useEffect(() => {
    if (!sel) { setItems(null); return; }
    setItems(null); setPrevItems(null);
    getItems(sel).then(setItems).catch(() => setItems([]));
    if (prev) getItems(prev.id).then(setPrevItems).catch(() => setPrevItems(null));
  }, [sel, prev && prev.id]);

  const pick = async (f) => {
    if (!f) return;
    setReading(true); setErr('');
    try {
      const { default: readXlsx } = await import('read-excel-file/browser');
      const sheets = await readXlsx(f);
      setImp({ parsed: parseSales(sheets), fileName: f.name });
    } catch (e) { setErr(e.message || 'Dosya okunamadı.'); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const toRevenue = async (day, mp, amount, orders) => {
    if (actions && actions.saveRevenue) await actions.saveRevenue(day, [{ marketplace: mp, amount: Math.round(amount * 100) / 100, orders: orders ? Math.round(orders) : null }], { keepOpen: true });
  };

  const view = useMemo(() => {
    if (!cur || !items) return null;
    const t = cur.totals || totalsOf(items);
    const days = daysBetween(fromDateInput(cur.period_start), fromDateInput(cur.period_end)) + 1;
    const top = [...items].sort((x, y) => y.r - x.r).slice(0, 10);
    const group = (key) => {
      const m = new Map();
      items.forEach((x) => { const k = (x[key] || 'Diğer').toLocaleUpperCase('tr-TR'); const v = m.get(k) || { k: x[key] || 'Diğer', r: 0, q: 0 }; v.r += x.r; v.q += x.q; m.set(k, v); });
      return [...m.values()].sort((x, y) => y.r - x.r);
    };
    const brands = group('br').slice(0, 8);
    const cats = group('c').slice(0, 8);
    let movers = null;
    if (prevItems && prevItems.length) {
      const pm = new Map(prevItems.map((x) => [x.k, x]));
      const pdays = prev ? daysBetween(fromDateInput(prev.period_start), fromDateInput(prev.period_end)) + 1 : days;
      const scale = days / pdays; // farklı uzunlukta dönemleri günlük ortalamayla kıyasla
      const diffs = items.map((x) => { const p = pm.get(x.k); return { x, pr: p ? p.r * scale : 0, d: x.r - (p ? p.r * scale : 0) }; });
      prevItems.forEach((p) => { if (!items.some((x) => x.k === p.k)) diffs.push({ x: { ...p, r: 0, q: 0 }, pr: p.r * scale, d: -p.r * scale }); });
      movers = { up: diffs.filter((z) => z.d > 0).sort((a, b) => b.d - a.d).slice(0, 5), down: diffs.filter((z) => z.d < 0).sort((a, b) => a.d - b.d).slice(0, 5), scale };
    }
    // Stok: satış hızına göre kaç günlük stok kaldı (yalnız Trendyol raporunda stok var)
    const stock = items.filter((x) => x.s != null && x.q > 0).map((x) => ({ x, cover: x.s / (x.q / days) })).filter((z) => z.cover < 21).sort((a, b) => a.cover - b.cover).slice(0, 8);
    return { t, days, top, brands, cats, movers, stock };
  }, [cur, items, prevItems]);

  const pt = prev && prev.totals;
  const sc = cur && prev ? (daysBetween(fromDateInput(cur.period_start), fromDateInput(cur.period_end)) + 1) / (daysBetween(fromDateInput(prev.period_start), fromDateInput(prev.period_end)) + 1) : 1;

  return (
    <div className="sl">
      <div className="sl-top">
        <div>
          <h2 className="sl-h">Satış raporları</h2>
          <span className="hint">Trendyol "Ürün bazlı satış raporu" ve Hepsiburada "Satış raporu" Excel'leri. Dosya telefonunda okunur; yalnız ürün özetleri kaydedilir.</span>
        </div>
        <button type="button" className="btn primary" onClick={() => fileRef.current && fileRef.current.click()} disabled={reading}>{reading ? 'Okunuyor…' : '⬆ Excel yükle'}</button>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => pick(e.target.files && e.target.files[0])} />
      </div>
      {err ? <div className="card" style={{ padding: 12, color: 'var(--danger)', fontSize: 14 }}>{err}</div> : null}

      {reports && reports.length ? (
        <div className="sl-reps" role="tablist" aria-label="Raporlar">
          {reports.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={sel === x.id} className={'sl-rep' + (sel === x.id ? ' on' : '')} style={{ '--mp': mpColor(x.marketplace) }} onClick={() => setSel(x.id)}>
              <span className="sl-rep-mp"><span className="dot" style={{ background: mpColor(x.marketplace) }} />{x.marketplace}</span>
              <span className="sl-rep-p">{periodLabel(x.period_start, x.period_end)}</span>
              <b>{tlShort((x.totals || {}).r || 0)}</b>
            </button>
          ))}
        </div>
      ) : reports ? (
        <div className="card sl-empty">
          <b>Henüz rapor yok</b>
          <span>Panelden satış raporunu Excel olarak indir, buraya yükle. Hangi dönemin raporu olduğunu seçmen yeterli.</span>
        </div>
      ) : !err ? <p className="hint">Yükleniyor…</p> : null}

      {cur ? (
        <>
          <div className="sl-kpis">
            <div className="sl-kpi"><span>Net ciro</span><b>{tl(cur.totals.r)}</b>{pt ? <Delta v={ch(cur.totals.r, pt.r * sc)} /> : null}<small>günde ort. {tlShort(cur.totals.r / ((view && view.days) || 1))}</small></div>
            <div className="sl-kpi"><span>Satış adedi</span><b>{nf(cur.totals.q)}</b>{pt ? <Delta v={ch(cur.totals.q, pt.q * sc)} /> : null}<small>{cur.totals.o ? nf(cur.totals.o) + ' sipariş' : cur.totals.n + ' ürün'}</small></div>
            {cur.totals.o != null ? <div className="sl-kpi"><span>İptal oranı</span><b>%{pct(cur.totals.x, cur.totals.q + cur.totals.x)}</b>{pt && pt.q ? <Delta v={ch(cur.totals.x / (cur.totals.q + cur.totals.x || 1), pt.x / (pt.q + pt.x || 1))} invert /> : null}<small>{nf(cur.totals.x)} adet · iade {nf(cur.totals.i)}</small></div> : null}
            <div className="sl-kpi"><span>Komisyon</span><b>{tlShort(cur.totals.f)}</b><small>ciroya oranı %{pct(cur.totals.f, cur.totals.r)}</small></div>
            {cur.totals.d ? <div className="sl-kpi"><span>İndirim</span><b>{tlShort(cur.totals.d)}</b><small>brüt ciro {tlShort(cur.totals.g)}</small></div> : null}
          </div>
          {pt ? <p className="hint" style={{ margin: '-4px 0 0' }}>Yüzdeler {prev.marketplace} {periodLabel(prev.period_start, prev.period_end)} raporuna göre{sc !== 1 ? ' (günlük ortalamayla)' : ''}.</p> : null}

          {!view ? <p className="hint">Ürünler yükleniyor…</p> : (
            <div className="sl-grid">
              <section className="card sl-card">
                <h3>En çok satanlar</h3>
                {view.top.map((x) => (
                  <div key={x.k} className="sl-row">
                    <span className="sl-n" title={x.n}>{x.n}</span>
                    <span className="sl-v">{tlShort(x.r)}<small> · {nf(x.q)} ad.</small></span>
                    <span className="sl-bar"><span style={{ width: (x.r / (view.top[0].r || 1)) * 100 + '%', background: mpColor(cur.marketplace) }} /></span>
                  </div>
                ))}
              </section>

              {view.movers ? (
                <section className="card sl-card">
                  <h3>Önceki rapora göre</h3>
                  <div className="sl-mv">
                    <div><h4 className="up">▲ Yükselenler</h4>{view.movers.up.length ? view.movers.up.map((z) => <div key={z.x.k} className="sl-mvr"><span title={z.x.n}>{z.x.n}</span><b className="up">+{tlShort(z.d)}</b></div>) : <span className="hint">yok</span>}</div>
                    <div><h4 className="down">▼ Düşenler</h4>{view.movers.down.length ? view.movers.down.map((z) => <div key={z.x.k} className="sl-mvr"><span title={z.x.n}>{z.x.n}</span><b className="down">−{tlShort(-z.d)}</b></div>) : <span className="hint">yok</span>}</div>
                  </div>
                </section>
              ) : null}

              {view.stock.length ? (
                <section className="card sl-card sl-stock">
                  <h3>⚠️ Stok azalıyor</h3>
                  <span className="hint">Bu dönemin satış hızıyla 3 haftadan az yetecek ürünler</span>
                  {view.stock.map((z) => (
                    <div key={z.x.k} className="sl-row">
                      <span className="sl-n" title={z.x.n}>{z.x.n}</span>
                      <span className={'sl-v' + (z.cover < 7 ? ' hot' : '')}>{z.x.s <= 0 ? 'Stok bitti' : z.cover < 1 ? '1 günden az' : '~' + Math.round(z.cover) + ' gün'}<small> · stok {nf(z.x.s)}</small></span>
                    </div>
                  ))}
                </section>
              ) : null}

              <section className="card sl-card">
                <h3>Markalar</h3>
                {view.brands.map((x) => (
                  <div key={x.k} className="sl-row">
                    <span className="sl-n">{x.k}</span>
                    <span className="sl-v">{tlShort(x.r)}<small> · %{pct(x.r, view.t.r)}</small></span>
                    <span className="sl-bar"><span style={{ width: (x.r / (view.brands[0].r || 1)) * 100 + '%' }} /></span>
                  </div>
                ))}
              </section>

              <section className="card sl-card">
                <h3>Kategoriler</h3>
                {view.cats.map((x) => (
                  <div key={x.k} className="sl-row">
                    <span className="sl-n">{x.k}</span>
                    <span className="sl-v">{tlShort(x.r)}<small> · {nf(x.q)} ad.</small></span>
                    <span className="sl-bar"><span style={{ width: (x.r / (view.cats[0].r || 1)) * 100 + '%', background: '#7048E8' }} /></span>
                  </div>
                ))}
              </section>
            </div>
          )}
          <div className="sl-foot">
            <span className="hint">{cur.file_name}</span>
            <button type="button" className="linkbtn" style={{ color: 'var(--danger)' }} onClick={async () => {
              if (!window.confirm(cur.marketplace + ' ' + periodLabel(cur.period_start, cur.period_end) + ' raporu silinsin mi?')) return;
              await deleteReport(cur.id); const r = reports.filter((x) => x.id !== cur.id); setReports(r); setSel(r[0] ? r[0].id : null);
            }}>Raporu sil</button>
          </div>
        </>
      ) : null}

      {imp ? (
        <ImportSheet parsed={imp.parsed} fileName={imp.fileName} reports={reports || []} now={now} onClose={() => setImp(null)} onRevenue={toRevenue}
          onSaved={(row) => { setImp(null); setReports((r) => [row, ...(r || []).filter((x) => !(x.marketplace === row.marketplace && x.period_start === row.period_start && x.period_end === row.period_end))].sort((x, y) => y.period_end.localeCompare(x.period_end) || x.marketplace.localeCompare(y.marketplace))); setSel(row.id); }} />
      ) : null}
    </div>
  );
}
