// Satış raporu Excel okuyucu ve karşılaştırma yardımcıları. Saf fonksiyonlar (React yok), Node'da test edilebilir.
// Desteklenen: Trendyol "Ürün bazlı satış raporu", Hepsiburada "Satış raporu" ve ürün adı + adet + tutar sütunu olan
// diğer pazaryeri Excel'leri (sipariş listeleri dahil; satırlar ürün bazında toplanır, müşteri bilgisi hiç okunmaz).

// ---------- Metin / sayı ----------
const TRMAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const ascii = (s) => String(s == null ? '' : s).toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[çğıöşüâîû]/g, (c) => TRMAP[c] || c);
export const head = (s) => ascii(s).replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
export const flat = (s) => ascii(s).replace(/[^a-z0-9]/g, '');
export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let t = String(v == null ? '' : v).replace(/[\s₺%TL]/g, '');
  const c = t.lastIndexOf(','), d = t.lastIndexOf('.');
  if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (c >= 0) t = (t.match(/,/g).length > 1 ? t.replace(/,/g, '') : t.replace(',', '.'));
  else if (d >= 0 && (t.match(/\./g).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(t))) t = t.replace(/\./g, '');
  const n = parseFloat(t); return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round(v * 100) / 100;
export const str = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);
const isBarcode = (k) => /^\d{8,14}$/.test(String(k || ''));
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// ---------- Bilinen formatlar ----------
const FORMATS = [
  {
    mp: 'Trendyol', need: ['barkod', 'netciro', 'netsatisadedi'],
    row: (g) => ({
      k: str(g('barkod'), 40), m: str(g('saticistokkodu') || g('stokkodu'), 40), n: str(g('urunadi')), br: str(g('marka'), 40), c: str(g('kategori'), 50),
      o: num(g('brutsiparisadedi')), q: num(g('netsatisadedi')), x: num(g('iptaladedi')), i: num(g('iadeadedi')),
      g: num(g('brutciro')), d: num(g('indirimtutari')), r: num(g('netciro')), f: num(g('toplamkomisyontutari')),
      s: g('guncelstok') === '' || g('guncelstok') == null ? null : num(g('guncelstok'))
    })
  },
  {
    mp: 'Hepsiburada', need: ['toplamsatistutari', 'toplamsatisadedi', 'sku'],
    row: (g) => ({
      k: str(g('sku'), 40), m: str(g('saticisku'), 40), n: str(g('urunadi')), br: str(g('marka'), 40), c: str(g('altkategori') || g('kategori'), 50),
      q: num(g('toplamsatisadedi')), r: num(g('toplamsatistutari')), f: num(g('komisyontutari'))
    })
  }
];

// ---------- Genel okuyucu (diğer pazaryerleri) ----------
const SYN = {
  name: ['urunadi', 'urunismi', 'urunbasligi', 'productname', 'itemname', 'baslik', 'title', 'urun', 'product', 'aciklama'],
  qty: ['netsatisadedi', 'satisadedi', 'satilanadet', 'toplamadet', 'adet', 'miktar', 'quantity', 'qty', 'urunadedi', 'unitsordered', 'unitssold'],
  amount: ['netciro', 'ciro', 'toplamsatistutari', 'satistutari', 'urunsatistutari', 'toplamtutar', 'faturatutari', 'tutar', 'toplam', 'total', 'gelir', 'revenue', 'orderedproductsales', 'itemtotal'],
  price: ['birimfiyat', 'birimsatisfiyati', 'satisfiyati', 'fiyat', 'unitprice', 'itemprice', 'price'],
  barcode: ['barkod', 'barcode', 'urunbarkodu', 'ean', 'gtin'],
  sku: ['saticisku', 'saticistokkodu', 'stokkodu', 'merchantsku', 'sellersku', 'sku', 'urunkodu', 'asin'],
  brand: ['marka', 'brand'],
  cat: ['kategori', 'category', 'altkategori'],
  status: ['siparisdurumu', 'durum', 'status', 'orderstatus', 'kalemdurumu'],
  date: ['siparistarihi', 'tarih', 'orderdate', 'date', 'satistarihi', 'olusturmatarihi']
};
const findCol = (heads, keys) => {
  for (const k of keys) { const i = heads.indexOf(k); if (i >= 0) return i; }
  for (const k of keys) { if (k.length < 5) continue; const i = heads.findIndex((h) => h.startsWith(k)); if (i >= 0) return i; }
  return -1;
};
const MP_HINTS = [['Trendyol', /trendyol/i], ['Hepsiburada', /hepsiburada|hepsi/i], ['Amazon', /amazon/i], ['N11', /n11/i], ['Pazarama', /pazarama/i], ['Boyner', /boyner/i], ['Beymen', /beymen/i], ['İdefix', /idefix/i], ['MCLUB', /mclub|missha/i]];
export const guessMp = (fileName) => { const f = String(fileName || ''); const m = MP_HINTS.find(([, re]) => re.test(f)); return m ? m[0] : null; };
const toDate = (v) => {
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number' && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5));
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
};
function parseGeneric(sh) {
  const rows = sh.data || [];
  for (let hi = 0; hi < Math.min(rows.length, 10); hi++) {
    const heads = rows[hi].map(head);
    const c = Object.fromEntries(Object.entries(SYN).map(([k, v]) => [k, findCol(heads, v)]));
    if (c.name < 0 || c.qty < 0 || (c.amount < 0 && c.price < 0)) continue;
    const by = new Map();
    let dmin = null, dmax = null;
    for (const r of rows.slice(hi + 1)) {
      const name = str(r[c.name]); if (!name) continue;
      const bc = c.barcode >= 0 ? str(r[c.barcode], 40) : '';
      const sku = c.sku >= 0 ? str(r[c.sku], 40) : '';
      const k = bc || sku || flat(name).slice(0, 60);
      const q = num(r[c.qty]);
      const amt = c.amount >= 0 ? num(r[c.amount]) : num(r[c.price]) * q;
      const st = c.status >= 0 ? ascii(r[c.status]) : '';
      const cancel = /iptal|cancel/.test(st), ret = /iade|return|refund/.test(st);
      if (c.date >= 0) { const d = toDate(r[c.date]); if (d) { if (!dmin || d < dmin) dmin = d; if (!dmax || d > dmax) dmax = d; } }
      const it = by.get(k) || { k, m: bc && sku ? sku : (bc ? '' : sku), n: name, br: c.brand >= 0 ? str(r[c.brand], 40) : '', c: c.cat >= 0 ? str(r[c.cat], 50) : '', b: bc || undefined, q: 0, r: 0, x: 0, i: 0 };
      if (cancel) it.x += q; else if (ret) it.i += q; else { it.q += q; it.r += amt; }
      by.set(k, it);
    }
    const items = [...by.values()];
    if (!items.length) continue;
    return { items, range: dmin ? [ymd(dmin), ymd(dmax)] : null };
  }
  return null;
}

// sheets: [{ sheet, data }] → { mp (null = bilinmiyor), items, totals, range }
export function parseSales(sheets, fileName) {
  for (const f of FORMATS) {
    for (const sh of sheets) {
      const rows = sh.data || [];
      const hi = rows.findIndex((r, i) => i < 5 && f.need.every((k) => r.map(head).includes(k)));
      if (hi < 0) continue;
      const hd = rows[hi].map(head);
      const items = rows.slice(hi + 1).map((r) => f.row((k) => { const i = hd.indexOf(k); return i < 0 ? null : r[i]; }))
        .filter((x) => x.k || x.n).filter((x) => x.q || x.r || x.o || x.x || x.i);
      return finish(f.mp, items, null);
    }
  }
  for (const sh of sheets) {
    const g = parseGeneric(sh);
    if (g) return finish(guessMp(fileName), g.items, g.range);
  }
  throw new Error('Tanınmadı: ürün adı, adet ve tutar sütunu bulunamadı.');
}
function finish(mp, items, range) {
  const totals = totalsOf(items);
  return { mp, items: items.map(compact), totals, range };
}
// Saklanan ürün satırı: yalnız gerekli alanlar, sıfırlar atılır (veri küçük kalsın)
function compact(x) {
  const o = { k: x.k, n: x.n, q: Math.round(x.q * 100) / 100, r: r2(x.r) };
  if (x.m && x.m !== x.k) o.m = x.m;
  if (x.br) o.br = x.br; if (x.c) o.c = x.c; if (x.b && x.b !== x.k) o.b = x.b;
  for (const f of ['o', 'x', 'i']) if (x[f]) o[f] = Math.round(x[f]);
  if (x.s != null) o.s = Math.round(x.s);
  return o;
}
export function totalsOf(items) {
  const s = (k) => r2(items.reduce((t, x) => t + (Number(x[k]) || 0), 0));
  const hasO = items.some((x) => x.o != null && x.o !== 0);
  return { n: items.length, r: s('r'), g: s('g'), d: s('d'), q: s('q'), o: hasO ? s('o') : null, x: s('x'), i: s('i'), f: s('f') };
}

// ---------- Dönemler ----------
const D = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const dayDiff = (a, b) => Math.round((D(b) - D(a)) / 864e5);
export const lenOf = (a, b) => dayDiff(a, b) + 1;
export const shift = (k, n) => { const d = D(k); d.setDate(d.getDate() + n); return ymd(d); };
export { ymd };

// Bir pazaryeri için [a,b] dönemini kapsayan raporlar: içerdekiler (çakışmasız, uzun olan önce);
// hiç yoksa dönemle büyük ölçüde örtüşen tek rapor (ör. 16–22 Kas raporu "Son 7 gün" için) yaklaşık kabul edilir.
export function coverReports(reports, mp, a, b) {
  const own = reports.filter((r) => r.marketplace === mp);
  const total = lenOf(a, b);
  const inside = own.filter((r) => r.period_start >= a && r.period_end <= b)
    .sort((x, y) => lenOf(y.period_start, y.period_end) - lenOf(x.period_start, x.period_end) || String(y.created_at).localeCompare(String(x.created_at)));
  const chosen = [];
  for (const r of inside) if (!chosen.some((c) => !(r.period_end < c.period_start || r.period_start > c.period_end))) chosen.push(r);
  if (chosen.length) return { ids: chosen.map((r) => r.id), days: chosen.reduce((t, r) => t + lenOf(r.period_start, r.period_end), 0), total, approx: false };
  let best = null, bestOv = 0;
  for (const r of own) {
    const s = r.period_start > a ? r.period_start : a, e = r.period_end < b ? r.period_end : b;
    if (s > e) continue;
    const ov = lenOf(s, e), len = lenOf(r.period_start, r.period_end);
    const score = Math.min(ov / total, ov / len);
    if (score >= 0.7 && score > bestOv) { best = r; bestOv = score; }
  }
  if (best) return { ids: [best.id], days: lenOf(best.period_start, best.period_end), total, approx: true, period: [best.period_start, best.period_end] };
  return { ids: [], days: 0, total, approx: false };
}

// Birden çok raporun ürünlerini ürün anahtarına göre topla (stok: en son raporunki)
export function sumItems(lists) {
  const m = new Map();
  lists.forEach((items) => (items || []).forEach((x) => {
    const e = m.get(x.k);
    if (!e) { m.set(x.k, { ...x }); return; }
    e.q += x.q || 0; e.r += x.r || 0; e.o = (e.o || 0) + (x.o || 0); e.x = (e.x || 0) + (x.x || 0); e.i = (e.i || 0) + (x.i || 0);
    if (x.s != null) e.s = x.s;
    if ((x.n || '').length > (e.n || '').length) e.n = x.n;
  }));
  return m;
}

// ---------- Ürünleri pazaryerleri arasında eşleştir ----------
// 1) aynı barkod  2) ad (marka öneki atılmış) biri diğerinin başı ise ve o pazaryerinde tek aday varsa.
// HB adları kısaltılmış geldiği için "baş" eşleşmesi kullanılır; aynı başa sahip birden çok varyant varsa eşleştirilmez.
export const nameKey = (n, br) => { let t = flat(n); const b = flat(br); if (b && t.startsWith(b)) t = t.slice(b.length); return t; };
export const codeKey = (c) => String(c).trim().toLocaleUpperCase('tr-TR');
export function groupProducts(entries) {
  // entries: [{ mp, k, n, br, b }]
  const parent = entries.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const bc = new Map();
  entries.forEach((e, i) => {
    const code = e.b || (isBarcode(e.k) ? e.k : null);
    if (!code) return;
    if (bc.has(code)) union(bc.get(code), i); else bc.set(code, i);
  });
  // Stok kodu (ürün listesinden ya da HB SaticiSKU): aynı kod = aynı ürün
  const codes = new Map();
  entries.forEach((e, i) => { if (!e.m) return; const c = codeKey(e.m); if (codes.has(c)) union(codes.get(c), i); else codes.set(c, i); });
  const named = entries.map((e, i) => ({ i, mp: e.mp, s: nameKey(e.n, e.br) })).filter((x) => x.s.length >= 25).sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  for (let p = 0; p < named.length; p++) {
    const cur = named[p];
    const per = new Map();
    for (let q = p + 1; q < named.length && named[q].s.startsWith(cur.s); q++) {
      const o = named[q]; if (o.mp === cur.mp) continue;
      const ca = entries[cur.i].m, cb = entries[o.i].m;
      if (ca && cb && codeKey(ca) !== codeKey(cb)) continue;
      const set = per.get(o.mp) || new Set(); set.add(find(o.i)); per.set(o.mp, set);
      if (set.size === 1) set.first = o.i;
    }
    per.forEach((set) => { if (set.size === 1) union(cur.i, set.first); });
  }
  return entries.map((_, i) => find(i));
}

// A ve B dönemlerinin pazaryeri bazında toplanmış ürünlerinden ürün listesi:
// [{ id, n, br, c, mps: { [mp]: { a:{q,r}, b:{q,r}, s } }, a:{q,r}, b:{q,r} }]
export function compareProducts(byMp, scaleB = {}, codeOf = (mp, x) => x.m || '', barcodeOf = () => '') {
  // byMp: { [mp]: { A: Map, B: Map } }
  const entries = [];
  const idx = new Map();
  Object.entries(byMp).forEach(([mp, { A, B }]) => {
    [A, B].forEach((m) => m && m.forEach((x) => {
      const key = mp + '|' + x.k;
      if (idx.has(key)) { const e = entries[idx.get(key)]; if ((x.n || '').length > (e.n || '').length) e.n = x.n; return; }
      idx.set(key, entries.length); entries.push({ mp, k: x.k, m: codeOf(mp, x), n: x.n, br: x.br, b: x.b, c: x.c });
    }));
  });
  const g = groupProducts(entries);
  const out = new Map();
  entries.forEach((e, i) => {
    const gid = g[i];
    const p = out.get(gid) || { id: e.k, n: e.n, br: e.br, c: e.c, code: '', barcode: '', codes: [], keys: {}, mps: {}, a: { q: 0, r: 0 }, b: { q: 0, r: 0 } };
    (p.keys[e.mp] = p.keys[e.mp] || []).push(e.k);
    if (e.m && !p.code) p.code = e.m;
    const bcd = e.b || (isBarcode(e.k) ? e.k : null) || (e.m ? barcodeOf(e.m) : ''); if (bcd && !p.barcode) p.barcode = bcd;
    p.codes.push(e.k); if (e.m) p.codes.push(e.m);
    if ((e.n || '').length > (p.n || '').length && !/\($/.test(e.n)) p.n = e.n;
    const { A, B } = byMp[e.mp];
    const xa = A && A.get(e.k), xb = B && B.get(e.k);
    const sc = scaleB[e.mp] == null ? 1 : scaleB[e.mp];
    const m = p.mps[e.mp] || { a: { q: 0, r: 0, x: 0 }, b: { q: 0, r: 0, x: 0 }, s: null };
    if (xa) { m.a.q += xa.q || 0; m.a.r += xa.r || 0; m.a.x += xa.x || 0; if (xa.s != null) m.s = (m.s || 0) + xa.s; }
    if (xb) { m.b.q += (xb.q || 0) * sc; m.b.r += (xb.r || 0) * sc; m.b.x += (xb.x || 0) * sc; }
    p.mps[e.mp] = m;
    out.set(gid, p);
  });
  const list = [...out.values()];
  list.forEach((p) => {
    p.a.x = 0; p.b.x = 0; p.s = null;
    Object.values(p.mps).forEach((m) => { p.a.q += m.a.q; p.a.r += m.a.r; p.a.x += m.a.x; p.b.q += m.b.q; p.b.r += m.b.r; p.b.x += m.b.x; if (m.s != null) p.s = (p.s || 0) + m.s; });
  });
  return list;
}

// ---------- Dosya adından dönem ----------
// "1 Kasım", "01 Kas 2026", "1-7 Kasım", "01.11.2026", "2026-11-01" → ['2026-11-01','2026-11-01']
// Panelin indirme zaman damgası ("…2026.11.23-18.45.36") dönem sayılmaz.
const AYLAR = ['oca', 'sub', 'mar', 'nis', 'may', 'haz', 'tem', 'agu', 'eyl', 'eki', 'kas', 'ara'];
export function fileDate(name, today = new Date()) {
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '');
  const t = ascii(base);
  const yearFor = (m, y) => (y ? +y : (m - 1 > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear()));
  const mk = (y, m, d) => { const dt = new Date(y, m - 1, d); return dt.getMonth() === m - 1 && dt.getDate() === d ? ymd(dt) : null; };
  let m = t.match(/(?:^|[^0-9])(\d{1,2})\s*(?:-|–|ile)\s*(\d{1,2})\s*\.?\s*(oca|sub|mar|nis|may|haz|tem|agu|eyl|eki|kas|ara)[a-z]*\.?(?:\s*(\d{4}))?/);
  if (m) { const mo = AYLAR.indexOf(m[3]) + 1, y = yearFor(mo, m[4]); const a = mk(y, mo, +m[1]), b = mk(y, mo, +m[2]); if (a && b && a <= b) return [a, b]; }
  m = t.match(/(?:^|[^0-9])(\d{1,2})\s*\.?\s*(oca|sub|mar|nis|may|haz|tem|agu|eyl|eki|kas|ara)[a-z]*\.?(?:\s*(\d{4}))?/);
  if (m) { const mo = AYLAR.indexOf(m[2]) + 1, y = yearFor(mo, m[3]); const a = mk(y, mo, +m[1]); if (a) return [a, a]; }
  m = t.match(/(?:^|[^0-9])(\d{1,2})[./](\d{1,2})[./](\d{4})(?![0-9]|[-_ ]\d{1,2}[.:]\d{2})/);
  if (m) { const a = mk(+m[3], +m[2], +m[1]); if (a) return [a, a]; }
  m = t.match(/(?:^|[^0-9])(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?![0-9]|[-_ ]\d{1,2}[.:]\d{2})/);
  if (m) { const a = mk(+m[1], +m[2], +m[3]); if (a) return [a, a]; }
  return null;
}

// ---------- Ürün listesi (barkod → stok kodu) ----------
const BC_SYN = ['barkod', 'barcode', 'urunbarkodu', 'ean', 'gtin', 'barkodno'];
const CODE_SYN = ['stokkodu', 'saticistokkodu', 'saticisku', 'urunstokkodu', 'stokkod', 'malzemekodu', 'urunkodu', 'sku', 'merchantsku', 'sellersku', 'kod', 'stokno'];
const NAME_SYN = ['urunadi', 'urunismi', 'urun', 'aciklama', 'productname', 'malzemeadi', 'stokadi'];
// sheets → { sheet, heads: [başlıklar], rows: [[...]], guess: { bc, code, name } } (ilk uygun sayfa)
export function readCatalog(sheets) {
  for (const sh of sheets) {
    const rows = sh.data || [];
    for (let hi = 0; hi < Math.min(rows.length, 10); hi++) {
      const raw = rows[hi].map((x) => String(x == null ? '' : x).trim());
      if (raw.filter(Boolean).length < 2) continue;
      const hd = raw.map(head);
      const body = rows.slice(hi + 1).filter((r) => r.some((x) => x != null && String(x).trim() !== ''));
      if (!body.length) continue;
      let bc = findCol(hd, BC_SYN), code = findCol(hd, CODE_SYN), name = findCol(hd, NAME_SYN);
      // Barkod sütunu adıyla bulunamazsa: değerlerinin çoğu 8–14 haneli sayı olan sütun
      if (bc < 0) {
        let best = -1, bestN = 0;
        raw.forEach((_, i) => { const n = body.slice(0, 200).filter((r) => isBarcode(String(r[i] == null ? '' : r[i]).trim())).length; if (n > bestN) { best = i; bestN = n; } });
        if (bestN >= Math.min(5, body.length)) bc = best;
      }
      if (code === bc) code = -1;
      return { sheet: sh.sheet, heads: raw, rows: body, guess: { bc, code, name } };
    }
  }
  throw new Error('Dosyada başlık satırı bulunamadı.');
}
const cell = (v) => {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
};
// Seçilen sütunlardan eşleme: [[barkod, stokKodu], ...] (tekrarsız, boşlar atılır)
export function buildCatalog(rows, bc, code) {
  const m = new Map();
  rows.forEach((r) => { const b = cell(r[bc]).replace(/\s/g, ''), c = cell(r[code]); if (b && c) m.set(b, c.slice(0, 40)); });
  return [...m.entries()];
}

// ---------- Ürün karnesi matrisi ----------
// Bir "son gün" (çapa) etrafında sabit dönemler: dün/önceki gün/geçen hafta aynı gün, 7 gün/önceki 7, 30 gün/önceki 30, 8 hafta
export function anchorPeriods(A) {
  const P = {
    D: [A, A], D1: [shift(A, -1), shift(A, -1)], Dw: [shift(A, -7), shift(A, -7)],
    W: [shift(A, -6), A], W1: [shift(A, -13), shift(A, -7)],
    M: [shift(A, -29), A], M1: [shift(A, -59), shift(A, -30)]
  };
  for (let i = 0; i < 8; i++) P['w' + i] = [shift(A, -7 * i - 6), shift(A, -7 * i)];
  return P;
}
// Son gün: tek günlük raporların en yenisi (yoksa herhangi bir raporun en son günü)
export function anchorDay(reports) {
  const one = reports.filter((r) => r.period_start === r.period_end).map((r) => r.period_end).sort();
  if (one.length) return one[one.length - 1];
  const all = reports.map((r) => r.period_end).sort();
  return all.length ? all[all.length - 1] : null;
}
// Gereken rapor kimlikleri ve kapsama
export function planMatrix(reports, mps, periods) {
  const cov = {};
  mps.forEach((mp) => { cov[mp] = {}; Object.entries(periods).forEach(([pid, [a, b]]) => { cov[mp][pid] = coverReports(reports, mp, a, b); }); });
  const ids = [...new Set(mps.flatMap((mp) => Object.values(cov[mp]).flatMap((c) => c.ids)))];
  return { cov, ids };
}
// Ürünler × dönemler × pazaryerleri. codeOf(mp, item) stok kodunu verir (ürün listesi / SaticiSKU).
export function buildMatrix({ cov, byId, mps, periods, codeOf, barcodeOf }) {
  const maps = {};
  mps.forEach((mp) => { maps[mp] = {}; Object.keys(periods).forEach((pid) => { const c = cov[mp][pid]; maps[mp][pid] = c.ids.length ? sumItems(c.ids.map((id) => byId[id])) : null; }); });
  const entries = [], idx = new Map();
  mps.forEach((mp) => Object.values(maps[mp]).forEach((m) => m && m.forEach((x) => {
    const key = mp + '|' + x.k;
    if (idx.has(key)) { const e = entries[idx.get(key)]; if ((x.n || '').length > (e.n || '').length) e.n = x.n; if (!e.c && x.c) e.c = x.c; return; }
    idx.set(key, entries.length); entries.push({ mp, k: x.k, m: codeOf(mp, x), n: x.n, br: x.br, b: x.b, c: x.c });
  })));
  const g = groupProducts(entries);
  const out = new Map();
  const stockOrder = ['D', 'W', 'M'];
  entries.forEach((e, i) => {
    const p = out.get(g[i]) || { id: '', n: e.n, code: '', barcode: '', c: e.c, keys: {}, codes: [], v: {}, s: {} };
    if ((e.n || '').length > (p.n || '').length && !/\($/.test(e.n)) p.n = e.n;
    if (!p.c && e.c) p.c = e.c;
    (p.keys[e.mp] = p.keys[e.mp] || []).push(e.k);
    if (e.m && !p.code) p.code = e.m;
    const bcd = e.b || (isBarcode(e.k) ? e.k : null) || (e.m ? barcodeOf(e.m) : '');
    if (bcd && !p.barcode) p.barcode = bcd;
    p.codes.push(e.k); if (e.m) p.codes.push(e.m); if (bcd) p.codes.push(bcd);
    Object.keys(periods).forEach((pid) => {
      const m = maps[e.mp][pid]; const x = m && m.get(e.k); if (!x) return;
      const t = (p.v[pid] = p.v[pid] || {}); const z = (t[e.mp] = t[e.mp] || { q: 0, r: 0, x: 0 });
      z.q += x.q || 0; z.r += x.r || 0; z.x += x.x || 0;
    });
    for (const pid of stockOrder) { const m = maps[e.mp][pid]; const x = m && m.get(e.k); if (x && x.s != null) { p.s[e.mp] = (p.s[e.mp] || 0) + x.s; break; } }
    out.set(g[i], p);
  });
  const list = [...out.values()];
  list.forEach((p) => { p.id = p.code ? 'c:' + codeKey(p.code) : p.barcode ? 'b:' + p.barcode : 'k:' + p.keys[Object.keys(p.keys)[0]][0]; });
  return list;
}
// Bir ürünün (ya da toplamın) dönem değeri; mpF verilirse yalnız o pazaryeri
export const valOf = (p, pid, mps, metric) => { const t = p.v[pid]; if (!t) return 0; let s = 0; mps.forEach((mp) => { if (t[mp]) s += t[mp][metric] || 0; }); return s; };
// İki dönem kıyası: yalnız iki dönemde de raporu olan pazaryerleri, gün başı ortalamayla
export function deltaOf(p, P, P2, mps, cov, metric) {
  let a = 0, b = 0, ok = false;
  mps.forEach((mp) => {
    const ca = cov[mp] && cov[mp][P], cb = cov[mp] && cov[mp][P2];
    if (!ca || !cb || !ca.days || !cb.days) return;
    ok = true;
    const t = p.v[P] && p.v[P][mp], u = p.v[P2] && p.v[P2][mp];
    a += (t ? t[metric] : 0) / ca.days; b += (u ? u[metric] : 0) / cb.days;
  });
  if (!ok) return null;
  return { a, b, pct: b ? a / b - 1 : (a ? Infinity : 0) };
}
