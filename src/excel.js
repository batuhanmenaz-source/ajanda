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

// ---------- Rapor (İş → Raporlar) ----------
export async function exportReport({ rep, label }) {
  const camps = [[H('Kampanya'), H('Pazaryeri'), H('Başlangıç'), H('Bitiş'), H('Gün'), H('Kampanya cirosu'), H('Günlük ort.'), H('Öncesine göre'), H('Girilen gün')]];
  rep.camps.forEach(({ c, days, r }) => camps.push([
    S(c.name), S(c.marketplace || 'Genel'), D(c.start_date), D(c.end_date), N(days),
    r ? N(r.cur, TL) : S(''), r ? N(r.avg, TL) : S(''), r && r.delta != null ? N(r.delta, PCT) : S(''), r ? S(r.entered + '/' + r.total) : S('')
  ]));
  camps.push([B(S('Toplam')), S(''), S(''), S(''), B(N(rep.totals.days)), B(N(rep.totals.ciro, TL)), S(''), rep.totals.avgDelta != null ? B(N(rep.totals.avgDelta, PCT)) : S(''), S('')]);
  const mps = [[H('Pazaryeri'), H('Kampanya'), H('Kampanyalı gün'), H('Kampanya cirosu'), H('Ort. etki'), H('Dönem cirosu')]];
  rep.byMp.forEach((x) => mps.push([S(x.name), N(x.count), N(x.days), N(x.ciro, TL), x.avgDelta != null ? N(x.avgDelta, PCT) : S(''), N(x.periodCiro, TL)]));
  const ratio = (r, f) => (r > 0 && f > 0 ? N(r / f, '0.0"x"') : S(''));
  const inf = [[H('Hesap'), H('Reklam'), H('Bütçe (KDV hariç)'), H('Reklam cirosu (KDV dahil)'), H('Ciro / bütçe')]];
  rep.inf.list.forEach((x) => inf.push([S(x.name), N(x.n), N(x.fee, TL), N(x.rev || 0, TL), ratio(x.rev, x.feeR)]));
  inf.push([B(S('Toplam')), B(N(rep.inf.count)), B(N(rep.inf.fee, TL)), B(N(rep.inf.rev || 0, TL)), ratio(rep.inf.rev, rep.inf.feeR)]);
  const com = [[H('Komisyon oranı'), H('Reklam'), H('Bütçe (KDV hariç)'), H('Reklam cirosu (KDV dahil)'), H('Ciro / bütçe')]];
  (rep.inf.byPct || []).forEach((x) => com.push([S(x.label || 'Girilmemiş'), N(x.n), N(x.fee, TL), N(x.rev || 0, TL), ratio(x.rev, x.feeR)]));
  const ads = adRows(rep.inf.ads || [], rep.inf.contacts);
  const c0 = rep.ciro || { all: {}, byMp: [] };
  const ciro = [[H('Pazaryeri'), H('Genel ciro'), H('Kampanyalı ciro'), H('Kampanyasız ciro'), H('Kampanyalı gün'), H('Kampanyasız gün'), H('Kampanyalı günlük ort.'), H('Kampanyasız günlük ort.'), H('Günlük fark')]];
  const crow = (name, x, bold) => { const w = bold ? B : (v) => v; return [w(S(name)), w(N(x.total || 0, TL)), w(N(x.camp || 0, TL)), w(N(x.plain || 0, TL)), w(N(x.campDays || 0)), w(N(x.plainDays || 0)), w(N(x.campAvg || 0, TL)), w(N(x.plainAvg || 0, TL)), x.uplift != null ? w(N(x.uplift, PCT)) : S('')]; };
  c0.byMp.forEach((x) => ciro.push(crow(x.name, x)));
  if (c0.all) ciro.push(crow('Toplam', c0.all, true));
  const fu = [[H('Kimden'), H('Tamamlanan talep'), H('Ortalama dönüş (gün)'), H('En uzun (gün)')]];
  rep.fup.stats.forEach((s) => fu.push([S(s.party), N(s.n), N(Math.round(s.avg * 10) / 10), N(s.max)]));
  fu.push([S('Açık talep'), N(rep.fup.open), S(''), S('')]);
  await save([
    { name: 'Ciro', rows: ciro, widths: [16, 16, 16, 16, 14, 15, 20, 21, 12], sticky: 1 },
    { name: 'Kampanyalar', rows: camps, widths: [28, 14, 12, 12, 7, 16, 14, 13, 11], sticky: 1 },
    { name: 'Pazaryerleri', rows: mps, widths: [16, 11, 14, 16, 11, 16], sticky: 1 },
    { name: 'Influencer', rows: inf, widths: [24, 9, 18, 24, 13], sticky: 1 },
    { name: 'Reklamlar', rows: ads, widths: [22, 28, 11, 12, 13, 8, 17, 17, 11, 11, 18, 24, 13, 11], sticky: 1 },
    { name: 'Komisyon', rows: com, widths: [30, 9, 18, 24, 13], sticky: 1 },
    { name: 'Bekleyenler', rows: fu, widths: [24, 16, 20, 14], sticky: 1 }
  ], 'rapor-' + slug(label) + '.xlsx');
}

// Influencer reklamları: her reklam bir satır (bütçe KDV hariç, ciro KDV dahil)
function adRows(list, contacts) {
  const who = (c) => c.handle || ((contacts || []).find((k) => k.id === c.contact_id) || {}).name || '';
  const when = (iso) => (iso ? new Date(iso) : null);
  // Excel saat dilimi bilmez: yerel saati olduğu gibi yaz
  const xl = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()));
  const rows = [[H('Hesap'), H('Reklam'), H('Platform'), H('Marka'), H('Pazaryeri'), H('Tekrar'), H('Başlangıç'), H('Bitiş'), H('Komisyon'), H('Dolaylı komisyon'), H('Bütçe (KDV hariç)'), H('Reklam cirosu (KDV dahil)'), H('Ciro / bütçe'), H('Durum')]];
  const now = new Date();
  const sorted = [...list].sort((a, b) => String(b.start_at || b.publish_date || '').localeCompare(String(a.start_at || a.publish_date || '')));
  let fee = 0, rev = 0, feeR = 0;
  sorted.forEach((c) => {
    const s0 = when(c.start_at) || (c.publish_date ? new Date(c.publish_date + 'T00:00:00') : null);
    const e0 = when(c.end_at);
    const f = Number(c.fee) || 0, r = Number(c.ad_revenue) || 0;
    fee += f; rev += r; if (r > 0) feeR += f;
    const st = c.status === 'iptal' ? 'İptal' : e0 && e0 < now ? 'Bitti' : s0 && s0 > now ? 'Yaklaşan' : 'Yayında';
    rows.push([S(who(c)), S(c.title || ''), S(c.platform || ''), S(c.brand || ''), S(c.marketplace || ''), S(c.run ? c.run + '/' + c.runCount : ''),
      s0 ? { value: xl(s0), type: Date, format: 'dd.mm.yyyy hh:mm' } : S(''), e0 ? { value: xl(e0), type: Date, format: 'dd.mm.yyyy hh:mm' } : S(''),
      c.commission != null && c.commission !== '' ? N(Number(c.commission) / 100, PCT) : S(''),
      c.commission2 != null && c.commission2 !== '' ? N(Number(c.commission2) / 100, PCT) : S(''),
      f ? N(f, TL) : S(''), r ? N(r, TL) : S(''), r > 0 && f > 0 ? N(r / f, '0.0"x"') : S(''), S(st)]);
  });
  rows.push([B(S('Toplam')), B(S(sorted.length + ' reklam')), S(''), S(''), S(''), S(''), S(''), S(''), S(''), S(''), B(N(fee, TL)), B(N(rev, TL)), rev > 0 && feeR > 0 ? B(N(rev / feeR, '0.0"x"')) : S(''), S('')]);
  return rows;
}

export async function exportAds({ ads, contacts, label }) {
  await save([{ name: 'Reklamlar', rows: adRows(ads, contacts), widths: [22, 28, 11, 12, 13, 8, 17, 17, 11, 11, 18, 24, 13, 11], sticky: 1 }], 'influencer-reklamlari-' + slug(label || 'tum') + '.xlsx');
}

// Influencer indirim kodları: kod listesi + dönem kullanımı
export async function exportCodes({ codes, from, to, label }) {
  const { usedTotal, revTotal, usedIn, codeStatus } = await import('./codes.jsx');
  const head = ['Kod', 'Influencer', 'Pazaryeri', 'Marka', 'İndirim', 'Min. sepet', 'Kullanım limiti', 'Başlangıç', 'Bitiş', 'Durum', 'Toplam kullanım', 'Limit doluluğu', 'Dönem kullanımı (' + label + ')', 'Toplam kodlu satış', 'Dönem kodlu satış'].map(H);
  const rows = [head];
  let tU = 0, tP = 0, tR = 0, tPR = 0;
  codes.forEach((c) => {
    const u = usedTotal(c), r = revTotal(c), p = usedIn(c, from, to);
    tU += u; tP += p.n; tR += r; tPR += p.rv;
    const sd = c.start_at ? toDateInput(new Date(c.start_at)) : null, ed = c.end_at ? toDateInput(new Date(c.end_at)) : null;
    rows.push([B(S(c.code)), S(c.handle), S(c.marketplace), S(c.brand), S(c.disc_value ? (c.disc_type === 'tl' ? c.disc_value + ' ₺' : '%' + c.disc_value) : ''),
      c.min_basket ? N(c.min_basket, TL) : S(''), c.use_limit ? N(c.use_limit) : S(''), sd ? D(sd) : S(''), ed ? D(ed) : S(''), S(codeStatus(c).label),
      N(u), c.use_limit ? N(u / c.use_limit, PCT) : S(''), N(p.n), r ? N(r, TL) : S(''), p.rv ? N(p.rv, TL) : S('')]);
  });
  rows.push([B(S('Toplam')), B(S(codes.length + ' kod')), S(''), S(''), S(''), S(''), S(''), S(''), S(''), S(''), B(N(tU)), S(''), B(N(tP)), B(N(tR, TL)), B(N(tPR, TL))]);
  await save([{ name: 'İndirim kodları', rows, widths: [14, 20, 13, 12, 12, 12, 12, 12, 12, 14, 14, 12, 18, 16, 16], sticky: 1 }], 'influencer-kodlari-' + slug(label || 'tum') + '.xlsx');
}

// ---------- Sağlık: haftalık rapor ----------
export async function exportHealth({ start, wk, c, p, tips, h, label, exName }) {
  const hmx = (m) => (m == null ? '' : Math.floor(m / 60) + ' sa ' + Math.round(m % 60) + ' dk');
  const clk = (m) => { if (m == null) return ''; const x = Math.round(m + 18 * 60) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
  const ch = (a, b) => (a != null && b ? N((a - b) / b, PCT) : S(''));
  const num = (v, f) => (v == null ? S('') : N(v, f));
  const end = addDays(start, 6);
  const title = label + ' · ' + toDateInput(start).split('-').reverse().join('.') + ' – ' + toDateInput(end).split('-').reverse().join('.');
  const sum = [[H('Ölçü'), H(label), H(wk.partial ? 'Geçen hafta (aynı günler)' : 'Önceki hafta'), H('Değişim'), H('Not')]];
  const row = (k, a, b, f, note, isTime) => sum.push([S(k), isTime ? S(a) : num(a, f), isTime ? S(b) : num(b, f), isTime ? S('') : ch(a, b), S(note || '')]);
  row('Ortalama adım / gün', c.steps, p.steps, '#,##0', c.stepsGoalDays + ' gün 10.000 adım üstü');
  row('Aktif dakika (toplam)', c.azm, p.azm, '#,##0', 'Haftalık öneri en az 150 dk');
  row('Ortalama uyku (dk)', c.sleep, p.sleep, '#,##0', hmx(c.sleep));
  row('Ortalama derin uyku (dk)', c.deep, p.deep, '#,##0');
  row('Ortalama REM (dk)', c.rem, p.rem, '#,##0');
  row('Ortalama yatış saati', clk(c.bed), clk(p.bed), null, '', true);
  row('Ortalama kalkış saati', clk(c.wake), clk(p.wake), null, '', true);
  row('Dinlenme nabzı (bpm)', c.rhr, p.rhr, '0.0', 'Düşmesi genelde kondisyonun arttığını gösterir');
  row('Antrenman sayısı', c.exCount, p.exCount, '0');
  row('Antrenman süresi (dk)', c.exMin, p.exMin, '#,##0');
  row('Kalori / gün', c.kcal, p.kcal, '#,##0');
  row('Mesafe (km)', c.km, p.km, '0.0');
  if (c.weightLast != null || p.weightLast != null) row('Kilo (kg, son ölçüm)', c.weightLast, p.weightLast, '0.0');

  const days = [[H('Tarih'), H('Gün'), H('Adım'), H('Mesafe (km)'), H('Aktif dk'), H('Kalori'), H('Uyku (dk)'), H('Yatış'), H('Kalkış'), H('Derin (dk)'), H('REM (dk)'), H('Dinlenme nabzı'), H('Kilo'), H('Antrenman')]];
  wk.all.forEach((k) => {
    const s = h.sleep[k];
    const ex = (h.exercise || []).filter((e) => e.day === k);
    const t = (iso) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    days.push([D(k), S(WEEKDAYS[new Date(k + 'T12:00').getDay()]), num(h.steps[k], '#,##0'), num(h.distance[k], '0.0'), num(h.azm[k], '0'), num(h.kcal[k], '#,##0'),
      num(s && s.asleep, '0'), S(s ? t(s.start) : ''), S(s ? t(s.end) : ''), num(s && s.stages && s.stages.deep, '0'), num(s && s.stages && s.stages.rem, '0'),
      num(h.rhr[k], '0'), num(h.weight[k], '0.0'), S(ex.map((e) => exName(e) + ' ' + e.min + ' dk').join(', '))]);
  });

  const exs = [[H('Tarih'), H('Saat'), H('Antrenman'), H('Süre (dk)'), H('Kalori'), H('Mesafe (km)'), H('Ort. nabız'), H('Aktif dk'), H('Yüzme boyu'), H('Tempo /100 m (sn)')]];
  (h.exercise || []).filter((e) => wk.all.includes(e.day)).forEach((e) => exs.push([D(e.day), S(new Date(e.start).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })), S(exName(e)), num(e.min, '0'), num(e.kcal, '0'), num(e.km, '0.0'), num(e.hr, '0'), num(e.azm, '0'), num(e.laps, '0'), num(e.pace ? e.pace * 100 : null, '0')]));

  const tip = [[H('Konu'), H('Tavsiye')]];
  tips.forEach((x) => tip.push([S(x.icon + ' ' + x.title), S(x.text)]));
  tip.push([S(''), S('Genel bilgilendirmedir, tıbbi tavsiye değildir.')]);

  await save([
    { name: 'Özet', rows: [[B(S('Sağlık raporu'))], [S(title)], [S('')], ...sum], widths: [28, 18, 24, 11, 44] },
    { name: 'Günlük', rows: days, widths: [12, 11, 9, 11, 9, 9, 10, 8, 8, 10, 9, 14, 8, 34], sticky: 1 },
    { name: 'Antrenmanlar', rows: exs, widths: [12, 8, 22, 10, 9, 11, 10, 9, 11, 16], sticky: 1 },
    { name: 'Tavsiyeler', rows: tip, widths: [36, 110] }
  ], 'saglik-raporu-' + toDateInput(start) + '.xlsx');
}

// ---------- Satış raporu (ürün karnesi) ----------
export async function exportSalesCard({ head, data, label, day }) {
  const pctCols = new Set(head.map((h, i) => (/değişim/i.test(h) ? i : -1)).filter((i) => i >= 0));
  const tlCols = new Set(head.map((h, i) => (/ciro/i.test(h) ? i : -1)).filter((i) => i >= 0));
  const rows = [
    head.map(H),
    ...data.map((r) => r.map((v, i) => (typeof v === 'number' ? (pctCols.has(i) ? N(v, PCT) : tlCols.has(i) ? N(Math.round(v * 100) / 100, TL) : N(Math.round(v * 100) / 100)) : S(v))))
  ];
  const info = [
    [H('Ajanda · Satış raporu'), H('')],
    [S('Son rapor günü'), D(day)],
    [S('Dün'), S('son rapor günü; değişim önceki güne göre')],
    [S('7 gün / 30 gün'), S('son rapor gününe kadar; değişim önceki eşit döneme göre (gün başı ortalama)')]
  ];
  await save([
    { name: 'Ürünler', rows, widths: head.map((h, i) => (i === 2 ? 60 : i < 2 ? 15 : 11)), sticky: 1 },
    { name: 'Bilgi', rows: info, widths: [20, 70] }
  ], 'satis-raporu-' + slug(label) + '.xlsx');
}
