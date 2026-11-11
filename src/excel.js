// Excel (.xlsx) çıktısı: Cüzdan ve Ciro. Kütüphane yalnız düğmeye basılınca yüklenir.
import { MARKETPLACES } from './constants.js';
import { catOf, sumBy, fixedDue, fixedPaid } from './money.js';
import { addDays, toDateInput, fromDateInput, daysBetween, MONTHS, WEEKDAYS } from './dates.js';

const TL = '#,##0.00 "₺"';
const PCT = '0.0%';
// Excel tarihi: yerel gün kaymasın diye UTC gece yarısı
const xDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

const H = (v) => ({ value: v, fontWeight: 'bold', backgroundColor: '#EEF1FB' });
const S = (v) => ({ value: v == null ? '' : String(v), type: String });
const N = (v, format) => ({ value: Number(v) || 0, type: Number, ...(format ? { format } : {}) });
const D = (key) => ({ value: xDate(key), type: Date, format: 'dd.mm.yyyy' });
const B = (cell) => ({ ...cell, fontWeight: 'bold' });

async function save(sheets, fileName) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const blob = await writeExcelFile(sheets.map((s) => ({
    data: s.rows, sheet: s.name, columns: s.widths.map((w) => ({ width: w })), stickyRowsCount: s.sticky || 0
  })), { fontFamily: 'Calibri', fontSize: 11 }).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const slug = (s) => s.toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- Cüzdan ----------
export async function exportWallet({ money, fixed, budgets, start, end, label, view }) {
  const A = toDateInput(start), B2 = toDateInput(end);
  const rows = (money || []).filter((r) => r.day >= A && r.day <= B2).sort((a, b) => a.day.localeCompare(b.day));
  const income = sumBy(rows, start, end, 'gelir');
  const expense = sumBy(rows, start, end, 'gider');
  const by = (m) => rows.filter((r) => r.kind === 'gider' && r.method === m).reduce((s, r) => s + Number(r.amount), 0);

  const summary = [
    [H('Ajanda · Cüzdan'), H('')],
    [S('Dönem'), S(label)],
    [S('Gelir'), N(income, TL)],
    [S('Gider'), N(expense, TL)],
    [B(S('Kalan')), B(N(income - expense, TL))],
    [S('Kartla ödenen'), N(by('kart'), TL)],
    [S('Nakit ödenen'), N(by('nakit'), TL)],
    [S('Kayıt sayısı'), N(rows.length)],
    [S('Oluşturulma'), S(new Date().toLocaleString('tr-TR'))]
  ];

  const tx = [[H('Tarih'), H('Gün'), H('Tür'), H('Kategori'), H('Açıklama'), H('Ödeme'), H('Tutar'), H('Sabit kalem')]];
  rows.forEach((r) => tx.push([
    D(r.day), S(WEEKDAYS[fromDateInput(r.day).getDay()]), S(r.kind === 'gelir' ? 'Gelir' : 'Gider'), S(catOf(r.category).label),
    S(r.note || ''), S(r.method === 'kart' ? 'Kart' : r.method === 'nakit' ? 'Nakit' : ''), N(r.kind === 'gelir' ? r.amount : -r.amount, TL), S(r.fixed_id ? 'Evet' : '')
  ]));
  tx.push([S(''), S(''), S(''), S(''), B(S('Toplam (gelir − gider)')), S(''), B(N(income - expense, TL)), S('')]);

  const byCat = {};
  rows.filter((r) => r.kind === 'gider').forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + Number(r.amount); });
  const cats = [[H('Kategori'), H('Tutar'), H('Pay'), H('Aylık bütçe'), H('Bütçeden kalan')]];
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([id, v]) => {
    const lim = Number((budgets || {})[id]) || 0;
    cats.push([S(catOf(id).label), N(v, TL), N(expense ? v / expense : 0, PCT), lim ? N(lim, TL) : S(''), lim && view === 'ay' ? N(lim - v, TL) : S('')]);
  });
  cats.push([B(S('Toplam gider')), B(N(expense, TL)), N(1, PCT), S(''), S('')]);

  const sheets = [
    { name: 'Özet', rows: summary, widths: [22, 26] },
    { name: 'Hareketler', rows: tx, widths: [12, 11, 8, 18, 30, 9, 15, 11], sticky: 1 },
    { name: 'Kategoriler', rows: cats, widths: [20, 15, 9, 14, 15], sticky: 1 }
  ];

  const active = (fixed || []).filter((f) => f.active !== false);
  if (active.length) {
    const ms = new Date(start.getFullYear(), start.getMonth(), 1);
    const fx = [[H('Kalem'), H('Tür'), H('Kategori'), H('Tutar'), H('Ayın günü'), H('Durum (' + MONTHS[ms.getMonth()] + ')')]];
    active.sort((a, b) => a.day_of_month - b.day_of_month).forEach((f) => {
      const paid = fixedPaid(f, money, ms);
      fx.push([S(f.title), S(f.kind === 'gelir' ? 'Gelir' : 'Gider'), S(catOf(f.category).label), N(f.amount, TL), N(fixedDue(f, ms).getDate()),
        S(paid ? (f.kind === 'gelir' ? 'Geldi ' : 'Ödendi ') + fromDateInput(paid.day).toLocaleDateString('tr-TR') : 'Bekliyor')]);
    });
    const tot = active.filter((f) => f.kind !== 'gelir').reduce((s, f) => s + Number(f.amount), 0);
    fx.push([B(S('Aylık sabit gider')), S(''), S(''), B(N(tot, TL)), S(''), S('')]);
    sheets.push({ name: 'Sabit giderler', rows: fx, widths: [22, 8, 18, 14, 10, 22], sticky: 1 });
  }
  await save(sheets, 'cuzdan-' + slug(label) + '.xlsx');
}

// ---------- Ciro ----------
// mode: 'ay' (seçili ay, gün gün) ya da 'yil' (seçili yıl, ay ay)
export async function exportRevenue({ revenue, month, mode }) {
  const y = month.getFullYear();
  const prefix = mode === 'yil' ? String(y) : toDateInput(month).slice(0, 7);
  const rows = (revenue || []).filter((r) => r.day.startsWith(prefix)).sort((a, b) => a.day.localeCompare(b.day) || a.marketplace.localeCompare(b.marketplace));
  const mps = MARKETPLACES.map((m) => m.name).filter((n) => rows.some((r) => r.marketplace === n));
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const orders = rows.reduce((s, r) => s + (Number(r.orders) || 0), 0);
  const label = mode === 'yil' ? String(y) : MONTHS[month.getMonth()] + ' ' + y;

  // Pazaryeri özeti
  const mpSheet = [[H('Pazaryeri'), H('Ciro'), H('Pay'), H('Sipariş'), H('Ortalama sepet')]];
  mps.map((n) => {
    const rs = rows.filter((r) => r.marketplace === n);
    return [n, rs.reduce((s, r) => s + Number(r.amount), 0), rs.reduce((s, r) => s + (Number(r.orders) || 0), 0)];
  }).sort((a, b) => b[1] - a[1]).forEach(([n, v, o]) => mpSheet.push([S(n), N(v, TL), N(total ? v / total : 0, PCT), o ? N(o) : S(''), o ? N(v / o, TL) : S('')]));
  mpSheet.push([B(S('Toplam')), B(N(total, TL)), N(1, PCT), orders ? B(N(orders)) : S(''), orders ? N(total / orders, TL) : S('')]);

  // Zaman tablosu: gün gün (ay) ya da ay ay (yıl)
  const head = [H(mode === 'yil' ? 'Ay' : 'Tarih'), ...(mode === 'yil' ? [] : [H('Gün')]), ...mps.map(H), H('Toplam'), H('Sipariş')];
  const grid = [head];
  const keys = mode === 'yil'
    ? Array.from({ length: 12 }, (_, i) => y + '-' + String(i + 1).padStart(2, '0'))
    : Array.from({ length: daysBetween(month, new Date(y, month.getMonth() + 1, 0)) + 1 }, (_, i) => toDateInput(addDays(month, i)));
  keys.forEach((k) => {
    const rs = rows.filter((r) => r.day.startsWith(k));
    if (!rs.length && mode === 'yil') return;
    const t = rs.reduce((s, r) => s + Number(r.amount), 0);
    const o = rs.reduce((s, r) => s + (Number(r.orders) || 0), 0);
    grid.push([
      mode === 'yil' ? S(MONTHS[Number(k.slice(5)) - 1]) : D(k),
      ...(mode === 'yil' ? [] : [S(WEEKDAYS[fromDateInput(k).getDay()])]),
      ...mps.map((n) => { const v = rs.filter((r) => r.marketplace === n).reduce((s, r) => s + Number(r.amount), 0); return v ? N(v, TL) : S(''); }),
      rs.length ? B(N(t, TL)) : S('girilmedi'), o ? N(o) : S('')
    ]);
  });
  grid.push([B(S('Toplam')), ...(mode === 'yil' ? [] : [S('')]),
    ...mps.map((n) => B(N(rows.filter((r) => r.marketplace === n).reduce((s, r) => s + Number(r.amount), 0), TL))), B(N(total, TL)), orders ? B(N(orders)) : S('')]);

  const raw = [[H('Tarih'), H('Pazaryeri'), H('Ciro'), H('Sipariş')]];
  rows.forEach((r) => raw.push([D(r.day), S(r.marketplace), N(r.amount, TL), r.orders ? N(r.orders) : S('')]));

  await save([
    { name: mode === 'yil' ? 'Aylık' : 'Günlük', rows: grid, widths: [12, ...(mode === 'yil' ? [] : [11]), ...mps.map(() => 14), 16, 10], sticky: 1 },
    { name: 'Pazaryerleri', rows: mpSheet, widths: [16, 16, 9, 10, 15], sticky: 1 },
    { name: 'Kayıtlar', rows: raw, widths: [12, 16, 15, 10], sticky: 1 }
  ], 'ciro-' + slug(label) + '.xlsx');
}
