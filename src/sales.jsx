// İş → Satış raporları: ürün karnesi. Her ürün için dün / 7 gün / 30 gün değişimi, pazaryeri kırılımı, stok.
// Hafif kalması için: Excel okuyucu yalnız yükleme anında iner; raporlar yalnız bu sayfa açılınca listelenir;
// ürünler son 60 günün raporlarından bir kez indirilir ve cihazda (IndexedDB) saklanır, sonra yalnız yeni raporlar iner.
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, DEMO } from './supabase.js';
import { MARKETPLACES, mpColor } from './constants.js';
import { tl, tlShort } from './revenue.jsx';
import { Sheet } from './ui.jsx';
import { parseSales, fileDate, readCatalog, buildCatalog, codeKey, str, lenOf, shift, ymd, anchorDay, anchorPeriods, planMatrix, buildMatrix, valOf, deltaOf } from './salesparse.js';

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
// Kalıcı önbellek: rapor ürünleri değişmez; bir kez inen cihazda kalır
let idbP = null;
function idb() {
  if (idbP) return idbP;
  idbP = new Promise((res) => {
    try { const r = indexedDB.open('ajanda-sales', 1); r.onupgradeneeded = () => r.result.createObjectStore('items'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
    catch { res(null); }
  });
  return idbP;
}
async function idbGet(ids) {
  const db = await idb(); if (!db || !ids.length) return {};
  return new Promise((res) => {
    const out = {};
    try {
      const tx = db.transaction('items', 'readonly'); const st = tx.objectStore('items');
      ids.forEach((id) => { const q = st.get(id); q.onsuccess = () => { if (q.result) out[id] = q.result; }; });
      tx.oncomplete = () => res(out); tx.onerror = () => res(out); tx.onabort = () => res(out);
    } catch { res(out); }
  });
}
async function idbPut(pairs) {
  const db = await idb(); if (!db || !pairs.length) return;
  try { const tx = db.transaction('items', 'readwrite'); const st = tx.objectStore('items'); pairs.forEach(([id, v]) => st.put(v, id)); } catch { /* yok say */ }
}
// Artık listede olmayan raporları cihazdan da sil
async function idbPrune(keep) {
  const db = await idb(); if (!db) return;
  try {
    const tx = db.transaction('items', 'readwrite'); const st = tx.objectStore('items'); const q = st.getAllKeys();
    q.onsuccess = () => (q.result || []).forEach((k) => { if (!keep.has(k)) st.delete(k); });
  } catch { /* yok say */ }
}
async function loadItems(ids) {
  let need = ids.filter((id) => !itemCache.has(id));
  if (need.length) {
    if (DEMO) demoAll().filter((x) => need.includes(x.id)).forEach((x) => itemCache.set(x.id, x.items || []));
    else {
      const local = await idbGet(need);
      Object.entries(local).forEach(([id, v]) => itemCache.set(id, v));
      need = need.filter((id) => !itemCache.has(id));
      for (let i = 0; i < need.length; i += 15) {
        const { data, error } = await supabase.from('sales_reports').select('id, items').in('id', need.slice(i, i + 15));
        if (error) throw error;
        (data || []).forEach((x) => itemCache.set(x.id, x.items || []));
        idbPut((data || []).map((x) => [x.id, x.items || []]));
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
  idbPut([[data.id, rep.items]]);
  return data;
}
async function deleteReport(id) {
  itemCache.delete(id);
  idb().then((db) => { try { if (db) db.transaction('items', 'readwrite').objectStore('items').delete(id); } catch { /* yok say */ } });
  if (DEMO) { demoSet(demoAll().filter((x) => x.id !== id)); return; }
  const { error } = await supabase.from('sales_reports').delete().eq('id', id);
  if (error) throw error;
}

// Ürün listesi (barkod → stok kodu): kişi başına tek satır
const CAT_DEMO = 'ajanda-catalog-demo-v1';
const missingCat = (e) => /product_catalog/.test(String(e && e.message));
async function loadCatalog() {
  if (DEMO) { try { return JSON.parse(localStorage.getItem(CAT_DEMO) || 'null'); } catch { return null; } }
  const { data, error } = await supabase.from('product_catalog').select('items, file_name, updated_at').maybeSingle();
  if (error) { if (missingCat(error)) return { missing: true }; throw error; }
  return data;
}
async function saveCatalog(items, fileName) {
  const row = { items, file_name: str(fileName, 120), updated_at: new Date().toISOString() };
  if (DEMO) { try { localStorage.setItem(CAT_DEMO, JSON.stringify(row)); } catch { /* yok say */ } return row; }
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('product_catalog').upsert({ user_id: u.user.id, ...row });
  if (error) throw error;
  return row;
}

// ---------- Yardımcılar ----------
const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dm = (k) => { const [, m, d] = k.split('-').map(Number); return d + ' ' + MON[m - 1]; };
const plabel = (a, b) => (a === b ? dm(a) : dm(a) + ' – ' + dm(b));
const nf = (v) => Math.round(v || 0).toLocaleString('tr-TR');
const SHORT = { Trendyol: 'TY', Hepsiburada: 'HB', Amazon: 'AMZ', MCLUB: 'MC', Boyner: 'BOY', N11: 'N11', Pazarama: 'PZR', Beymen: 'BEY', 'İdefix': 'İDF' };
const short = (mp) => SHORT[mp] || mp.slice(0, 3).toUpperCase();
const missingTable = (e) => /sales_reports/.test(String(e && e.message));

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

// ---------- Ürün listesi penceresi ----------
function CatalogSheet({ catalog, onClose, onSaved }) {
  const [file, setFile] = useState(null); // { name, heads, rows, guess }
  const [bc, setBc] = useState(-1);
  const [code, setCode] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef(null);
  const pickFile = async (f) => {
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const { default: readXlsx } = await import('read-excel-file/browser');
      const c = readCatalog(await readXlsx(f));
      setFile({ name: f.name, ...c }); setBc(c.guess.bc); setCode(c.guess.code);
    } catch (e) { setErr(e.message || 'Dosya okunamadı.'); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  const items = useMemo(() => (file && bc >= 0 && code >= 0 && bc !== code ? buildCatalog(file.rows, bc, code) : []), [file, bc, code]);
  const save = async () => {
    setBusy(true); setErr('');
    try { onSaved(await saveCatalog(items, file.name)); }
    catch (e) { setErr(missingCat(e) ? 'Supabase\'de 30 numaralı SQL çalıştırılmamış (Hesap → Kurulum durumu → Kopyala).' : 'Kaydedilemedi: ' + (e && e.message)); }
    finally { setBusy(false); }
  };
  const sel = (v, set, label) => (
    <label className="sl-cat-sel"><span>{label}</span>
      <select value={v} onChange={(e) => set(Number(e.target.value))}>
        <option value={-1}>Seç…</option>
        {file.heads.map((h, i) => <option key={i} value={i}>{h || 'Sütun ' + (i + 1)}</option>)}
      </select>
    </label>
  );
  const has = catalog && catalog.items && catalog.items.length;
  return (
    <Sheet title="Ürün listesi" onClose={onClose}>
      <p className="hint" style={{ margin: 0 }}>Trendyol satış raporunda stok kodu yok. Barkod ve stok kodu sütunu olan ürün listeni bir kez yükle; Trendyol ürünleri barkoddan stok koduna bağlanır. Hepsiburada'da stok kodu raporun kendisindeki "SaticiSKU" sütunundan alınır.</p>
      {has ? <div className="sl-cat-now"><b>{nf(catalog.items.length)} ürün</b> eşli · {catalog.file_name || 'liste'}{catalog.updated_at ? ' · ' + dm(catalog.updated_at.slice(0, 10)) : ''}<span className="hint">Yeni ürün eklendikçe güncel listeyi tekrar yükle; eskisinin yerine geçer.</span></div> : null}
      {!file ? (
        <button type="button" className="btn big primary" onClick={() => ref.current && ref.current.click()} disabled={busy}>{busy ? 'Okunuyor…' : has ? '⬆ Güncel listeyi yükle' : '⬆ Ürün listesini yükle'}</button>
      ) : (
        <>
          <span className="hint">{file.name} · {nf(file.rows.length)} satır</span>
          <div className="sl-cat-cols">{sel(bc, setBc, 'Barkod sütunu')}{sel(code, setCode, 'Stok kodu sütunu')}</div>
          {items.length ? (
            <div className="sl-cat-prev">
              <div className="sl-cat-pr head"><span>Barkod</span><span>Stok kodu</span></div>
              {items.slice(0, 4).map(([b, c]) => <div key={b} className="sl-cat-pr"><span>{b}</span><b>{c}</b></div>)}
              <span className="hint">{nf(items.length)} barkod–stok kodu eşi bulundu.</span>
            </div>
          ) : <p className="hint" style={{ margin: 0, color: '#B35C00' }}>Barkod ve stok kodu sütunlarını seç.</p>}
          <div className="row2">
            <button type="button" className="btn big" onClick={() => setFile(null)} disabled={busy}>Başka dosya</button>
            <button type="button" className="btn big primary" onClick={save} disabled={busy || !items.length}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
        </>
      )}
      {err ? <p className="hint" style={{ color: 'var(--danger)', margin: 0 }}>{err}</p> : null}
      <input ref={ref} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => pickFile(e.target.files && e.target.files[0])} />
      <p className="hint" style={{ margin: 0 }}>Yalnız barkod ve stok kodu saklanır; dosyadaki diğer sütunlar okunmaz.</p>
    </Sheet>
  );
}

// ---------- Ürün karnesi: ortak hesaplar ----------
const WDAY = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];
const wdayOf = (k) => { const [y, m, d] = k.split('-').map(Number); return WDAY[new Date(y, m - 1, d).getDay()]; };
const WDAT = ['pazara', 'pazartesiye', 'salıya', 'çarşambaya', 'perşembeye', 'cumaya', 'cumartesiye'];
const wdat = (k) => { const [y, m, d] = k.split('-').map(Number); return WDAT[new Date(y, m - 1, d).getDay()]; };
const pctStr = (v) => (v == null ? '' : !Number.isFinite(v) ? 'yeni' : Math.abs(v) < 0.005 ? '0' : (v > 0 ? '+' : '−') + '%' + (Math.abs(v * 100) < 10 ? Math.abs(v * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : Math.round(Math.abs(v * 100))));
const tone = (v, min = 0.03) => (v == null ? '' : !Number.isFinite(v) ? 'up' : v >= min ? 'up' : v <= -min ? 'down' : 'flat');
// Değişim rozeti: ▲ +%12 / ▼ −%8
function Chg({ d, label }) {
  if (!d) return <span className="sr-chg none">{label ? label + ' ' : ''}kıyas yok</span>;
  const t = tone(d.pct);
  return <span className={'sr-chg ' + t}>{label ? <em>{label}</em> : null}<span className="v">{t === 'up' ? '▲' : t === 'down' ? '▼' : '•'} {pctStr(d.pct)}</span></span>;
}
const daysOf = (cov, mps, pid) => Math.max(0, ...mps.map((mp) => (cov[mp] && cov[mp][pid] ? cov[mp][pid].days : 0)));
// Stok: pazaryerlerinin bildirdiği stok (Trendyol raporunda var) ve 30 günlük satış hızıyla kaç gün yeteceği
function stockOf(p, mps, cov) {
  const ms = mps.filter((mp) => p.s[mp] != null);
  if (!ms.length) return null;
  const s = ms.reduce((t, mp) => t + p.s[mp], 0);
  const dM = daysOf(cov, ms, 'M'), dW = daysOf(cov, ms, 'W');
  const rate = dM ? valOf(p, 'M', ms, 'q') / dM : dW ? valOf(p, 'W', ms, 'q') / dW : 0;
  return { s, cover: rate > 0 ? s / rate : null, mps: ms };
}
// Bir ürünün haftalara göre pazaryeri kıyas cümleleri
function mpVerdict(p, mps, cov) {
  const live = mps.filter((mp) => valOf(p, 'M', [mp], 'q') + valOf(p, 'W', [mp], 'q') > 0);
  if (live.length < 2) return [];
  const out = [];
  const tot = valOf(p, 'M', live, 'q') || valOf(p, 'W', live, 'q');
  const sh = live.map((mp) => ({ mp, v: valOf(p, 'M', [mp], 'q') || valOf(p, 'W', [mp], 'q') })).sort((x, y) => y.v - x.v);
  if (tot) out.push(<>Son 30 günde satışın <b>%{Math.round((sh[0].v / tot) * 100)}</b>'i <b>{sh[0].mp}</b>'dan{sh[1] ? <>, %{Math.round((sh[1].v / tot) * 100)}'i {sh[1].mp}'dan</> : null}.</>);
  const w = live.map((mp) => ({ mp, d: deltaOf(p, 'W', 'W1', [mp], cov, 'q') })).filter((x) => x.d && x.d.b > 0);
  const dn = w.filter((x) => x.d.pct <= -0.1), upw = w.filter((x) => x.d.pct >= 0.05);
  if (w.length >= 2) {
    if (dn.length === w.length) out.push(<>Son 7 günde <b>tüm pazaryerlerinde düştü</b> ({w.map((x) => short(x.mp) + ' ' + pctStr(x.d.pct)).join(', ')}): genel talep ya da sezon etkisi olabilir.</>);
    else if (dn.length && upw.length) out.push(<>Son 7 günde düşüş <b>{dn.map((x) => x.mp).join(', ')}'a özel</b> ({dn.map((x) => pctStr(x.d.pct)).join(', ')}); {upw.map((x) => x.mp + ' ' + pctStr(x.d.pct)).join(', ')}. O pazaryerinde fiyat, kampanya, stok ya da listeleme kontrol edilebilir.</>);
    else if (dn.length) out.push(<>Son 7 günde {dn.map((x) => <b key={x.mp}>{x.mp} {pctStr(x.d.pct)}</b>)} düştü; diğerlerinde belirgin değişim yok.</>);
    else if (upw.length === w.length) out.push(<>Son 7 günde tüm pazaryerlerinde arttı ({w.map((x) => short(x.mp) + ' ' + pctStr(x.d.pct)).join(', ')}).</>);
  }
  // Ana pazaryerinin düştüğü haftalarda diğeri ne yaptı?
  const main = sh[0].mp, others = sh.slice(1).map((x) => x.mp);
  let drops = 0, same = 0, opp = 0;
  for (let i = 0; i < 7; i++) {
    const dm1 = deltaOf(p, 'w' + i, 'w' + (i + 1), [main], cov, 'q');
    if (!dm1 || !dm1.b || dm1.pct > -0.1) continue;
    const dO = deltaOf(p, 'w' + i, 'w' + (i + 1), others, cov, 'q');
    if (!dO || !dO.b) continue;
    drops++; if (dO.pct <= -0.05) same++; else if (dO.pct >= 0.05) opp++;
  }
  if (drops) out.push(<>Son 8 haftada {main}'un düştüğü <b>{drops} haftanın</b> {same ? <><b>{same}</b>'{same === 1 ? 'inde' : 'sinde'} {others.join(', ')} de düştü</> : null}{same && opp ? ', ' : ''}{opp ? <><b>{opp}</b>'{opp === 1 ? 'inde' : 'sinde'} arttı</> : null}{!same && !opp ? <>hiçbirinde {others.join(', ')} belirgin değişmedi</> : null}.</>);
  return out;
}

// Günlük özet + hero ürün uyarıları (Bugün ve İş → Özet için; küçük JSON olarak saklanır)
export function buildDigest({ products, mps, cov, A, heroIds }) {
  const T = { v: {} };
  products.forEach((p) => Object.entries(p.v).forEach(([pid, t]) => { const z = (T.v[pid] = T.v[pid] || {}); Object.entries(t).forEach(([mp, x]) => { const y = (z[mp] = z[mp] || { q: 0, r: 0, x: 0 }); y.q += x.q; y.r += x.r; y.x += x.x; }); }));
  const r = valOf(T, 'D', mps, 'r');
  const dd = deltaOf(T, 'D', 'D1', mps, cov, 'r'), dw = deltaOf(T, 'D', 'Dw', mps, cov, 'r'), ww = deltaOf(T, 'W', 'W1', mps, cov, 'r');
  const alerts = [];
  products.filter((p) => heroIds.has(p.id)).forEach((p) => {
    const nm = (p.code ? p.code + ' · ' : '') + p.n.slice(0, 44);
    const st = stockOf(p, mps, cov);
    if (st && st.s <= 0) alerts.push({ id: p.id, t: 'stock', w: 5, n: nm, x: 'stok bitti' + (st.mps.length < mps.length ? ' (' + st.mps.map(short).join(', ') + ')' : '') });
    else if (st && st.cover != null && st.cover < 10) alerts.push({ id: p.id, t: 'stock', w: 3, n: nm, x: 'stok ~' + Math.max(1, Math.round(st.cover)) + ' gün yeter (' + nf(st.s) + ' adet)' });
    const dM = daysOf(cov, mps, 'M');
    const avg = dM ? valOf(p, 'M', mps, 'q') / dM : 0;
    const qD = valOf(p, 'D', mps, 'q');
    if (cov && mps.some((mp) => cov[mp].D.days) && qD === 0 && avg >= 2) alerts.push({ id: p.id, t: 'stop', w: 4, n: nm, x: 'dün hiç satmadı (günde ort. ' + nf(avg) + ')' });
    const w = deltaOf(p, 'W', 'W1', mps, cov, 'q');
    if (w && w.b && w.pct <= -0.15 && (w.b - w.a) * 7 >= 5) {
      const per = mps.map((mp) => ({ mp, d: deltaOf(p, 'W', 'W1', [mp], cov, 'q') })).filter((x) => x.d && x.d.b);
      alerts.push({ id: p.id, t: 'drop', w: 2 + Math.min(1, -w.pct), n: nm, x: '7 günde ' + pctStr(w.pct) + (per.length > 1 ? ' (' + per.map((x) => short(x.mp) + ' ' + pctStr(x.d.pct)).join(', ') + ')' : '') });
    } else {
      const d = deltaOf(p, 'D', 'Dw', mps, cov, 'q');
      if (d && d.b >= 5 && d.pct <= -0.4 && qD > 0) alerts.push({ id: p.id, t: 'drop', w: 1, n: nm, x: 'dün, geçen ' + wdat(A) + ' göre ' + pctStr(d.pct) });
    }
  });
  alerts.sort((x, y) => y.w - x.w);
  return {
    day: A, r: Math.round(r), d1: dd && Number.isFinite(dd.pct) ? Math.round(dd.pct * 1000) / 1000 : null, dw: dw && Number.isFinite(dw.pct) ? Math.round(dw.pct * 1000) / 1000 : null,
    wr: Math.round(valOf(T, 'W', mps, 'r')), ww: ww && Number.isFinite(ww.pct) ? Math.round(ww.pct * 1000) / 1000 : null,
    alerts: alerts.slice(0, 5).map(({ w, ...a }) => a)
  };
}

// ---------- Ürün karnesi penceresi ----------
function ProductCard({ p, mps, cov, P, A, starred, onStar, onClose }) {
  const [hov, setHov] = useState(null);
  const live = mps.filter((mp) => Object.values(p.v).some((t) => t[mp]));
  const st = stockOf(p, mps, cov);
  const tiles = [
    { k: 'D', label: 'Dün · ' + dm(A), sub: [['önceki güne', deltaOf(p, 'D', 'D1', live, cov, 'q')], ['geçen ' + wdat(A) + '', deltaOf(p, 'D', 'Dw', live, cov, 'q')]] },
    { k: 'W', label: 'Son 7 gün', sub: [['önceki 7 güne', deltaOf(p, 'W', 'W1', live, cov, 'q')]] },
    { k: 'M', label: 'Son 30 gün', sub: [['önceki 30 güne', deltaOf(p, 'M', 'M1', live, cov, 'q')]] }
  ];
  const verdict = mpVerdict(p, live, cov);
  // 8 haftalık seri (eskiden yeniye)
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const pid = 'w' + i;
    if (!live.some((mp) => cov[mp][pid] && cov[mp][pid].days)) continue;
    weeks.push({ pid, a: P[pid][0], b: P[pid][1], v: live.map((mp) => ({ mp, q: valOf(p, pid, [mp], 'q'), has: !!(cov[mp][pid] && cov[mp][pid].days) })) });
  }
  const max = Math.max(1, ...weeks.flatMap((w) => w.v.map((x) => x.q)));
  const h = hov != null ? weeks[hov] : null;
  return (
    <Sheet title="Ürün karnesi" onClose={onClose}>
      <div className="sr-pc-head">
        <div>
          <div className="sr-pc-code">{p.code || 'Stok kodu yok'}{p.barcode ? <span> · {p.barcode}</span> : null}</div>
          <div className="sr-pc-name">{p.n}</div>
        </div>
        <button type="button" className={'sr-star' + (starred ? ' on' : '')} onClick={onStar} aria-pressed={starred} title={starred ? 'Hero ürünlerden çıkar' : 'Hero ürün olarak işaretle'}>{starred ? '★' : '☆'}</button>
      </div>

      <div className="sr-pc-tiles">
        {tiles.map((t) => (
          <div key={t.k} className="sr-pc-t">
            <span>{t.label}</span>
            <b>{nf(valOf(p, t.k, live, 'q'))} <small>adet</small></b>
            <small className="sr-pc-r">{tlShort(valOf(p, t.k, live, 'r'))}</small>
            {t.sub.map(([l, d]) => <Chg key={l} d={d} label={l} />)}
          </div>
        ))}
      </div>

      {live.length ? (
        <div className="sr-pc-mp">
          <div className="sr-pc-mpr head"><span>Pazaryeri</span><span>Dün</span><span>7 gün</span><span>30 gün</span></div>
          {live.map((mp) => (
            <div key={mp} className="sr-pc-mpr">
              <span><i className="dot" style={{ background: mpColor(mp) }} />{mp}</span>
              {['D', 'W', 'M'].map((k) => (
                <span key={k}>
                  <b>{cov[mp][k] && cov[mp][k].days ? nf(valOf(p, k, [mp], 'q')) : '—'}</b>
                  {cov[mp][k] && cov[mp][k].days ? <Chg d={deltaOf(p, k, k === 'D' ? 'D1' : k + '1', [mp], cov, 'q')} /> : null}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {verdict.length ? <ul className="sr-pc-v">{verdict.map((v, i) => <li key={i}>{v}</li>)}</ul> : null}

      {weeks.length >= 2 ? (
        <div className="sr-wk">
          <div className="sr-wk-h"><b>Haftalık satış (adet)</b>
            <span className="sr-leg">{live.map((mp) => <span key={mp}><i style={{ background: mpColor(mp) }} />{short(mp)}</span>)}</span>
          </div>
          <div className="sr-wk-tip">{h ? <><b>{plabel(h.a, h.b)}</b> {h.v.map((x) => short(x.mp) + ' ' + (x.has ? nf(x.q) : '—')).join(' · ')}</> : <span className="hint">Bir haftanın üzerine gel ya da dokun</span>}</div>
          <div className="sr-wk-c" style={{ '--n': weeks.length }} onMouseLeave={() => setHov(null)}>
            {weeks.map((w, i) => (
              <div key={w.pid} className={'sr-wk-col' + (hov === i ? ' on' : '')} onMouseEnter={() => setHov(i)} onClick={() => setHov(i)}>
                <div className="sr-wk-bars">
                  {w.v.map((x) => <span key={x.mp} className={x.has ? '' : 'none'} style={{ height: x.has ? Math.max(1, (x.q / max) * 100) + '%' : '100%', background: x.has ? mpColor(x.mp) : null }} />)}
                </div>
                <span className="sr-wk-l">{dm(w.b)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {st ? (
        <p className={'sr-pc-stock' + (st.s <= 0 || (st.cover != null && st.cover < 10) ? ' hot' : '')}>
          Stok {st.mps.map(short).join(', ')}: <b>{nf(st.s)}</b>{st.cover != null ? <> · bu satış hızıyla ~<b>{Math.round(st.cover)} gün</b> yeter</> : null}
        </p>
      ) : null}
      <p className="hint" style={{ margin: 0 }}>Değişimler gün başı ortalamayla hesaplanır; raporu eksik günler kıyası bozmaz. ☆ ile hero ürün olarak işaretlersen Bugün sayfasında düşüş ve stok uyarısı alırsın.</p>
    </Sheet>
  );
}

// ---------- Ana görünüm ----------
const SHOW = [['all', 'Tümü'], ['hero', '★ Hero'], ['down', '7 günde düşen'], ['up', '7 günde artan'], ['stock', 'Stok riski'], ['stop', 'Satışı durdu']];
const SORTS = [['m', '30 günlük satışa göre'], ['wdown', '7 gün: en çok düşen'], ['wup', '7 gün: en çok artan'], ['ddown', 'Dün: en çok düşen'], ['cover', 'Stok: en az kalan']];

export function SalesView({ now, actions, prefs }) {
  const [reports, setReports] = useState(null);
  const [err, setErr] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [catOpen, setCatOpen] = useState(false);
  const [imp, setImp] = useState(null);
  const [reading, setReading] = useState(false);
  const [mx, setMx] = useState(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [mpF, setMpF] = useState('');
  const [show, setShow] = useState('all');
  const [sort, setSort] = useState('m');
  const [metric, setMetric] = useState(() => { try { return localStorage.getItem('ajanda-sales-metric') === 'r' ? 'r' : 'q'; } catch { return 'q'; } });
  const [limit, setLimit] = useState(40);
  const [prod, setProd] = useState(null);
  const [showList, setShowList] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [stars, setStars] = useState(() => (prefs && prefs.heroes) || []);
  useEffect(() => { if (prefs && prefs.heroes) setStars(prefs.heroes); }, [prefs && (prefs.heroes || []).join()]);
  const fileRef = useRef(null);

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => setCatalog(null));
    listReports().then((r) => { setReports(r); if (!DEMO) idbPrune(new Set(r.map((x) => x.id))); })
      .catch((e) => setErr(missingTable(e) ? 'Satış raporları için Supabase\'de 29 numaralı SQL\'i çalıştır (Hesap → Kurulum durumu → Kopyala).' : String(e && e.message)));
  }, []);

  const cat = useMemo(() => {
    const bc = new Map(), byCode = new Map();
    ((catalog && catalog.items) || []).forEach(([b, c]) => { bc.set(String(b), c); if (!byCode.has(codeKey(c))) byCode.set(codeKey(c), String(b)); });
    return { bc, byCode, n: bc.size };
  }, [catalog]);

  const mps = useMemo(() => {
    const t = {}; (reports || []).forEach((r) => { t[r.marketplace] = (t[r.marketplace] || 0) + ((r.totals || {}).r || 0); });
    return Object.keys(t).sort((a, b) => t[b] - t[a]);
  }, [reports]);
  const A = useMemo(() => (reports && reports.length ? anchorDay(reports) : null), [reports]);
  const P = useMemo(() => (A ? anchorPeriods(A) : null), [A]);
  const key = A ? A + '|' + (reports || []).map((r) => r.id).join() + '|' + cat.n : '';

  useEffect(() => {
    if (!A || !reports) return undefined;
    let alive = true;
    const { cov, ids } = planMatrix(reports, mps, P);
    setLoading(true);
    loadItems(ids).then((byId) => {
      if (!alive) return;
      const codeOf = (mp, x) => cat.bc.get(String(x.b || x.k)) || (mp === 'Trendyol' ? '' : x.m) || '';
      const barcodeOf = (c) => cat.byCode.get(codeKey(c)) || '';
      setMx({ key, cov, products: buildMatrix({ cov, byId, mps, periods: P, codeOf, barcodeOf }) });
    }).catch((e) => alive && setErr(String(e && e.message))).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [key]);

  const ready = mx && mx.key === key;
  const cov = ready ? mx.cov : null;
  const sel = mpF ? [mpF] : mps;

  // Hero: ★ ile işaretlenenler + son 30 günün en çok ciro yapan 10 ürünü
  const heroIds = useMemo(() => {
    const s = new Set(stars);
    if (ready) [...mx.products].sort((x, y) => valOf(y, 'M', mps, 'r') - valOf(x, 'M', mps, 'r')).slice(0, 10).forEach((p) => s.add(p.id));
    return s;
  }, [ready, mx, stars, mps]);

  const rows = useMemo(() => {
    if (!ready) return [];
    return mx.products.filter((p) => sel.some((mp) => Object.values(p.v).some((t) => t[mp]))).map((p) => {
      const st = stockOf(p, sel, cov);
      return {
        p, hero: heroIds.has(p.id), st,
        D: valOf(p, 'D', sel, metric), W: valOf(p, 'W', sel, metric), M: valOf(p, 'M', sel, metric),
        dD: deltaOf(p, 'D', 'D1', sel, cov, metric), dW: deltaOf(p, 'W', 'W1', sel, cov, metric), dM: deltaOf(p, 'M', 'M1', sel, cov, metric),
        share: sel.length > 1 ? sel.map((mp) => ({ mp, v: valOf(p, 'W', [mp], 'q') || valOf(p, 'M', [mp], 'q') })) : null
      };
    });
  }, [ready, mx, mpF, metric, heroIds, mps]);

  const FILTER = {
    all: () => true,
    hero: (r) => r.hero,
    down: (r) => r.dW && r.dW.b > 0 && r.dW.pct <= -0.1 && (r.dW.b - r.dW.a) * 7 >= (metric === 'q' ? 3 : 300),
    up: (r) => r.dW && r.dW.pct >= 0.1 && (r.dW.a - r.dW.b) * 7 >= (metric === 'q' ? 3 : 300),
    stock: (r) => r.st && (r.st.s <= 0 || (r.st.cover != null && r.st.cover < 14)) && r.M > 0,
    stop: (r) => r.dW && r.dW.b * 7 >= 3 && r.W === 0
  };
  const counts = useMemo(() => Object.fromEntries(SHOW.map(([k]) => [k, rows.filter(FILTER[k]).length])), [rows]);
  const list = useMemo(() => {
    let l = rows;
    const qq = q.trim().toLocaleLowerCase('tr-TR');
    if (qq) {
      const words = qq.split(/\s+/);
      l = l.filter((r) => {
        const codes = r.p.codes.map((c) => String(c).toLocaleLowerCase('tr-TR'));
        if (words.length === 1 && codes.some((c) => c === qq || c.startsWith(qq))) return true;
        const n = (r.p.n + ' ' + codes.join(' ')).toLocaleLowerCase('tr-TR');
        return words.every((w) => n.includes(w));
      });
    } else l = l.filter(FILTER[show]);
    const pc = (d) => (d && d.b ? (d.a - d.b) * 7 : 0);
    const by = {
      m: (x, y) => y.M - x.M || y.W - x.W,
      wdown: (x, y) => pc(x.dW) - pc(y.dW),
      wup: (x, y) => pc(y.dW) - pc(x.dW),
      ddown: (x, y) => ((x.dD && x.dD.b ? x.dD.a - x.dD.b : 0) - (y.dD && y.dD.b ? y.dD.a - y.dD.b : 0)),
      cover: (x, y) => ((x.st && x.st.cover != null ? x.st.cover : 1e9) - (y.st && y.st.cover != null ? y.st.cover : 1e9))
    };
    return [...l].sort(by[sort] || by.m);
  }, [rows, show, sort, q]);
  useEffect(() => { setLimit(40); }, [show, sort, q, mpF, metric, key]);

  // Genel bakış (toplam) ve günlük özet
  const total = useMemo(() => {
    if (!ready) return null;
    const T = { v: {} };
    mx.products.forEach((p) => Object.entries(p.v).forEach(([pid, t]) => { const z = (T.v[pid] = T.v[pid] || {}); Object.entries(t).forEach(([mp, x]) => { const y = (z[mp] = z[mp] || { q: 0, r: 0, x: 0 }); y.q += x.q; y.r += x.r; y.x += x.x; }); }));
    return T;
  }, [ready, mx]);
  const digest = useMemo(() => (ready ? buildDigest({ products: mx.products, mps, cov, A, heroIds }) : null), [ready, mx, heroIds]);
  // Özet değiştiyse kaydet (Bugün ve İş → Özet bunu okur; uygulama açılışında ek indirme yok)
  useEffect(() => {
    if (!digest || !actions || !actions.saveSalesPrefs) return;
    const old = prefs && prefs.digest;
    const sig = (d) => (d ? JSON.stringify({ ...d, at: undefined }) : '');
    if (sig(old) !== sig(digest)) actions.saveSalesPrefs({ digest: { ...digest, at: new Date().toISOString() } });
  }, [digest && JSON.stringify(digest)]);

  const toggleStar = (id) => {
    const next = stars.includes(id) ? stars.filter((x) => x !== id) : [...stars, id].slice(-60);
    setStars(next);
    if (actions && actions.saveSalesPrefs) actions.saveSalesPrefs({ heroes: next });
  };
  const pick = async (fl) => {
    const arr = [...(fl || [])].slice(0, 62);
    if (!arr.length) return;
    setReading(true); setErr('');
    try {
      const { default: readXlsx } = await import('read-excel-file/browser');
      const files = [];
      for (const f of arr) {
        try { const parsed = parseSales(await readXlsx(f), f.name); files.push({ name: f.name, parsed, own: fileDate(f.name, now) || parsed.range || null }); }
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
  const doExport = async () => {
    setExporting(true);
    try {
      const { exportSalesCard } = await import('./excel.js');
      const P2 = (d) => (d && d.b && Number.isFinite(d.pct) ? d.pct : '');
      const head = ['Stok kodu', 'Barkod', 'Ürün', 'Hero', 'Dün adet', 'Dün değişim', 'Dün ciro', '7 gün adet', '7 gün değişim', '7 gün ciro', '30 gün adet', '30 gün değişim', '30 gün ciro', ...sel.map((mp) => short(mp) + ' 7 gün adet'), ...sel.map((mp) => short(mp) + ' 30 gün adet'), 'Stok', 'Stok günü'];
      const data = list.map((r) => {
        const p = r.p;
        return [p.code, p.barcode, p.n, r.hero ? 'evet' : '',
          valOf(p, 'D', sel, 'q'), P2(deltaOf(p, 'D', 'D1', sel, cov, 'q')), valOf(p, 'D', sel, 'r'),
          valOf(p, 'W', sel, 'q'), P2(deltaOf(p, 'W', 'W1', sel, cov, 'q')), valOf(p, 'W', sel, 'r'),
          valOf(p, 'M', sel, 'q'), P2(deltaOf(p, 'M', 'M1', sel, cov, 'q')), valOf(p, 'M', sel, 'r'),
          ...sel.map((mp) => valOf(p, 'W', [mp], 'q')), ...sel.map((mp) => valOf(p, 'M', [mp], 'q')),
          r.st ? r.st.s : '', r.st && r.st.cover != null ? Math.round(r.st.cover) : ''];
      });
      await exportSalesCard({ head, data, label: dm(A) + (mpF ? ' ' + mpF : ''), day: A, mps: sel });
    } catch (e) { setErr('Excel oluşturulamadı: ' + (e && e.message)); } finally { setExporting(false); }
  };

  const coverage = useMemo(() => {
    if (!reports || !reports.length) return null;
    const end = A || ymd(now);
    const days = Array.from({ length: 35 }, (_, i) => shift(end, i - 34));
    return { days, rows: mps.map((mp) => { const own = reports.filter((r) => r.marketplace === mp); return { mp, on: days.map((d) => own.some((r) => r.period_start <= d && r.period_end >= d)) }; }) };
  }, [reports, A, mps]);

  const part = (pid) => { if (!cov) return ''; const d = daysOf(cov, sel, pid), n = lenOf(P[pid][0], P[pid][1]); return d && d < n ? d + '/' + n + ' gün rapor' : !d ? 'rapor yok' : ''; };
  const fmtV = (v) => (metric === 'r' ? tlShort(v) : nf(v));
  const ov = (pid, pid2, lbl) => {
    const d = total ? deltaOf(total, pid, pid2, sel, cov, 'r') : null;
    return { v: total ? valOf(total, pid, sel, 'r') : 0, q: total ? valOf(total, pid, sel, 'q') : 0, d, lbl };
  };
  const alerts = digest ? digest.alerts : [];
  const openById = (id) => { const p = ready && mx.products.find((x) => x.id === id); if (p) setProd(p); };

  return (
    <div className="sr">
      <div className="sr-top">
        <div>
          <h2 className="sr-h">Satış raporu</h2>
          {A ? <span className="sr-sub">Son rapor günü <b>{dm(A)} {wdayOf(A)}</b> · dün, son 7 gün ve son 30 gün bu güne göre</span> : <span className="sr-sub">Pazaryeri satış Excel'lerini yükle</span>}
        </div>
        <div className="sr-top-b">
          <button type="button" className="btn" onClick={() => setCatOpen(true)}>Ürün listesi{cat.n ? '' : ' ⚠︎'}</button>
          {ready ? <button type="button" className="btn" onClick={doExport} disabled={exporting}>{exporting ? '…' : '⬇ Excel'}</button> : null}
          <button type="button" className="btn primary" onClick={() => fileRef.current && fileRef.current.click()} disabled={reading}>{reading ? 'Okunuyor…' : '⬆ Rapor yükle'}</button>
        </div>
        <input ref={fileRef} type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => pick(e.target.files)} />
      </div>
      {err ? <div className="card" style={{ padding: 12, color: 'var(--danger)', fontSize: 14 }}>{err}</div> : null}

      {reports && !reports.length ? (
        <div className="card sl-empty">
          <b>Henüz rapor yok</b>
          <span>Panelden günlük satış raporunu Excel olarak indir, dosya adına tarihi yaz ("22 Kasım") ve yükle. Birden çok günü ve pazaryerini birlikte seçebilirsin.</span>
        </div>
      ) : null}
      {reports && reports.length && !ready ? <p className="hint">{loading ? 'Raporlar hazırlanıyor…' : ''}</p> : null}

      {ready ? (
        <>
          {/* Genel bakış */}
          <section className="sr-ov">
            {[ov('D', 'D1'), ov('W', 'W1'), ov('M', 'M1')].map((o, i) => {
              const pid = ['D', 'W', 'M'][i];
              const dw = i === 0 && total ? deltaOf(total, 'D', 'Dw', sel, cov, 'r') : null;
              return (
                <div key={pid} className="sr-ov-t">
                  <span className="sr-ov-l">{['Dün · ' + dm(A), 'Son 7 gün', 'Son 30 gün'][i]}{part(pid) ? <em>{part(pid)}</em> : null}</span>
                  <b>{tlShort(o.v)}</b>
                  <small>{nf(o.q)} adet</small>
                  <Chg d={o.d} label={['önceki güne', 'önceki 7 güne', 'önceki 30 güne'][i]} />
                  {i === 0 ? <Chg d={dw} label={'geçen ' + wdat(A) + ''} /> : null}
                </div>
              );
            })}
            {alerts.length ? (
              <div className="sr-ov-al">
                <span className="sr-ov-l">Hero ürünlerde dikkat</span>
                {alerts.map((a, i) => (
                  <button key={i} type="button" className={'sr-al t-' + a.t} onClick={() => openById(a.id)}>
                    <i>{a.t === 'stock' ? '📦' : a.t === 'stop' ? '⛔' : '📉'}</i><span><b>{a.x.charAt(0).toLocaleUpperCase('tr-TR') + a.x.slice(1)}</b> · {a.n}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          {/* Süzgeçler */}
          <section className="card sr-f">
            <input className="sr-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Stok kodu, barkod ya da ürün adı (ör. 4682)" aria-label="Stok kodu, barkod ya da ürün adı ile ara" />
            <div className="sr-f-r">
              {mps.length > 1 ? (
                <div className="sr-seg" role="group" aria-label="Pazaryeri">
                  <button type="button" className={!mpF ? 'on' : ''} onClick={() => setMpF('')}>Tümü</button>
                  {mps.map((mp) => <button key={mp} type="button" className={mpF === mp ? 'on' : ''} onClick={() => setMpF(mp)}><i className="dot" style={{ background: mpColor(mp) }} />{short(mp)}</button>)}
                </div>
              ) : null}
              <div className="sr-seg" role="group" aria-label="Ölçü">
                <button type="button" className={metric === 'q' ? 'on' : ''} onClick={() => setMetricS('q')}>Adet</button>
                <button type="button" className={metric === 'r' ? 'on' : ''} onClick={() => setMetricS('r')}>Ciro</button>
              </div>
              <label className="sr-sort"><span>Sırala</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
            </div>
            {!q.trim() ? (
              <div className="sr-chips">
                {SHOW.map(([k, l]) => (counts[k] || k === 'all' || k === show ? <button key={k} type="button" className={'chip' + (show === k ? ' on' : '')} onClick={() => setShow(k)}>{l} <span>{counts[k]}</span></button> : null))}
              </div>
            ) : null}
            {!cat.n && rows.some((r) => !r.p.code) ? (
              <div className="sl-cat-hint"><span>Trendyol ürünlerinde stok kodu görünmesi için barkod–stok kodu listeni bir kez yükle.</span><button type="button" className="linkbtn" onClick={() => setCatOpen(true)}>Ürün listesi yükle</button></div>
            ) : null}
          </section>

          {/* Ürün listesi */}
          <section className="card sr-list">
            <div className={'sr-row head' + (sel.length > 1 ? '' : ' one')} aria-hidden="true">
              <span className="sr-c-p">Ürün</span>
              <span className="sr-c-n">Dün<small>{dm(A)}</small></span>
              <span className="sr-c-n">7 gün</span>
              <span className="sr-c-n">30 gün</span>
              {sel.length > 1 ? <span className="sr-c-mp">Pazaryeri payı</span> : null}
              <span className="sr-c-s">Stok</span>
            </div>
            {list.slice(0, limit).map((r) => (
              <button key={r.p.id} type="button" className={'sr-row' + (sel.length > 1 ? '' : ' one')} onClick={() => setProd(r.p)}>
                <span className="sr-c-p">
                  <span className="sr-code">{r.hero ? <i className={'sr-hero' + (stars.includes(r.p.id) ? ' on' : '')} title="Hero ürün">★</i> : null}{r.p.code || <em>{r.p.barcode || 'kodsuz'}</em>}</span>
                  <span className="sr-name">{r.p.n}</span>
                </span>
                {[['D', r.D, r.dD, 'Dün'], ['W', r.W, r.dW, '7g'], ['M', r.M, r.dM, '30g']].map(([k, v, d, l]) => (
                  <span key={k} className="sr-c-n"><em className="sr-ml">{l}</em><b>{fmtV(v)}</b><Chg d={d} /></span>
                ))}
                {r.share ? (
                  <span className="sr-c-mp">
                    <span className="sr-share">{r.share.filter((x) => x.v > 0).map((x) => <i key={x.mp} style={{ flexGrow: x.v, background: mpColor(x.mp) }} />)}</span>
                    <small>{r.share.filter((x) => x.v > 0).sort((x, y) => y.v - x.v).slice(0, 2).map((x) => short(x.mp) + ' %' + Math.round((x.v / r.share.reduce((t, z) => t + z.v, 0)) * 100)).join(' · ')}</small>
                  </span>
                ) : null}
                <span className={'sr-c-s' + (r.st && (r.st.s <= 0 || (r.st.cover != null && r.st.cover < 7)) ? ' hot' : r.st && r.st.cover != null && r.st.cover < 14 ? ' warm' : '')}>
                  {r.st ? <><b>{r.st.s <= 0 ? 'bitti' : nf(r.st.s)}</b>{r.st.cover != null && r.st.s > 0 ? <small>~{r.st.cover > 365 ? '1y+' : Math.round(r.st.cover) + 'g'}</small> : null}</> : <small>—</small>}
                </span>
              </button>
            ))}
            {!list.length ? <p className="hint" style={{ margin: '8px 0' }}>{q.trim() ? 'Bu kodla ya da adla ürün bulunamadı.' : 'Bu süzgeçte ürün yok.'}</p> : null}
            {list.length > limit ? <button type="button" className="btn" onClick={() => setLimit((l) => l + 60)}>Daha fazla göster ({list.length - limit})</button> : null}
            <p className="sr-note">Yüzdeler bir önceki eşit dönemle kıyas: dün → önceki gün, 7 gün → önceki 7 gün, 30 gün → önceki 30 gün. Raporu eksik günler gün başı ortalamayla dengelenir. Ürüne dokun → pazaryeri kırılımı ve haftalık grafik.</p>
          </section>
        </>
      ) : null}

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
                  try { await deleteReport(r.id); setReports((x) => x.filter((z) => z.id !== r.id)); } catch (e) { setErr(String(e && e.message)); }
                }}>Sil</button>
              </div>
            )) : null}
          </details>
        </section>
      ) : !reports && !err ? <p className="hint">Yükleniyor…</p> : null}

      {imp ? (
        <ImportSheet files={imp} reports={reports || []} now={now} onClose={() => setImp(null)} onRevenue={toRevenue}
          onDone={(saved, keepOpen) => {
            const gone = new Set(saved.map((s) => s.replaced).filter(Boolean));
            setReports((r) => [...saved.map((s) => s.row), ...(r || []).filter((x) => !gone.has(x.id))].sort((x, z) => z.period_end.localeCompare(x.period_end)));
            if (!keepOpen) setImp(null);
          }} />
      ) : null}
      {catOpen ? <CatalogSheet catalog={catalog} onClose={() => setCatOpen(false)} onSaved={(row) => { setCatalog(row); setCatOpen(false); }} /> : null}
      {prod && ready ? <ProductCard p={prod} mps={mps} cov={cov} P={P} A={A} starred={stars.includes(prod.id)} onStar={() => toggleStar(prod.id)} onClose={() => setProd(null)} /> : null}
    </div>
  );
}
