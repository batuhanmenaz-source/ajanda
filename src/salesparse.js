// Satış raporu Excel okuyucu (Trendyol ürün bazlı / Hepsiburada satış raporu). Saf fonksiyonlar, test edilebilir.
// ---------- Okuma ----------
const norm = (s) => String(s == null ? '' : s).toLocaleLowerCase('tr-TR')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/i̇/g, 'i')
  .replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
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
export const str = (v, n = 90) => String(v == null ? '' : v).trim().slice(0, n);

const FORMATS = [
  {
    mp: 'Trendyol', need: ['barkod', 'netciro', 'netsatisadedi'],
    row: (g) => ({
      k: str(g('barkod'), 40), n: str(g('urunadi')), m: str(g('modelkodu'), 40), br: str(g('marka'), 40), c: str(g('kategori'), 50),
      o: num(g('brutsiparisadedi')), q: num(g('netsatisadedi')), x: num(g('iptaladedi')), i: num(g('iadeadedi')),
      g: r2(num(g('brutciro'))), d: r2(num(g('indirimtutari'))), r: r2(num(g('netciro'))), f: r2(num(g('toplamkomisyontutari'))),
      s: g('guncelstok') === '' || g('guncelstok') == null ? null : num(g('guncelstok')), p: r2(num(g('guncelsatisfiyati')))
    })
  },
  {
    mp: 'Hepsiburada', need: ['toplamsatistutari', 'toplamsatisadedi', 'sku'],
    row: (g) => ({
      k: str(g('sku'), 40), m: str(g('saticisku'), 40), n: str(g('urunadi')), br: str(g('marka'), 40), c: str(g('altkategori') || g('kategori'), 50),
      q: num(g('toplamsatisadedi')), r: r2(num(g('toplamsatistutari'))), f: r2(num(g('komisyontutari'))), p: r2(num(g('ortalamasatisfiyati')))
    })
  }
];

// sheets: [{ sheet, data: [[...], ...] }] → { mp, items, totals }
export function parseSales(sheets) {
  for (const f of FORMATS) {
    for (const sh of sheets) {
      const rows = sh.data || [];
      const hi = rows.findIndex((r, i) => i < 5 && f.need.every((k) => r.map(norm).includes(k)));
      if (hi < 0) continue;
      const head = rows[hi].map(norm);
      const items = rows.slice(hi + 1).map((r) => {
        const g = (k) => { const i = head.indexOf(k); return i < 0 ? null : r[i]; };
        return f.row(g);
      }).filter((x) => x.k || x.n).filter((x) => x.q || x.r || x.o || x.x || x.i);
      return { mp: f.mp, items, totals: totalsOf(items), sheet: sh.sheet };
    }
  }
  throw new Error('Bu dosyayı tanıyamadım. Trendyol "Ürün bazlı satış raporu" ya da Hepsiburada "Satış raporu" Excel\'i olmalı.');
}
export function totalsOf(items) {
  const s = (k) => r2(items.reduce((t, x) => t + (Number(x[k]) || 0), 0));
  const hasO = items.some((x) => x.o != null);
  return { n: items.length, r: s('r'), g: s('g'), d: s('d'), q: s('q'), o: hasO ? s('o') : null, x: s('x'), i: s('i'), f: s('f') };
}

