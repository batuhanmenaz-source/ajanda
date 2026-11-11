// Cüzdan: kategoriler, hızlı giriş çözümleyici ve dönem hesapları (iş cirosundan tamamen ayrı)
import { addDays, startOfDay, weekStart, toDateInput } from './dates.js';

export const EXPENSE_CATS = [
  { id: 'market', label: 'Market', emoji: '🛒', words: ['market', 'migros', 'macrocenter', 'carrefoursa', 'hakmar', 'gross', 'a101', 'bim', 'şok', 'sok', 'carrefour', 'file', 'manav', 'kasap', 'fırın', 'ekmek', 'bakkal', 'getir', 'istegelsin'] },
  { id: 'yemek', label: 'Yemek & kahve', emoji: '🍽️', words: ['yemek', 'restoran', 'restaurant', 'kahve', 'cafe', 'kafe', 'starbucks', 'yemeksepeti', 'trendyol yemek', 'öğle', 'akşam yemeği', 'kahvaltı', 'döner', 'pizza', 'burger', 'tatlı'] },
  { id: 'ulasim', label: 'Yakıt & ulaşım', emoji: '⛽', words: ['benzin', 'yakıt', 'akaryakıt', 'shell', 'opet', 'petrol', 'aytemiz', 'kurşunsuz', 'motorin', 'mazot', 'dizel', 'otopark', 'taksi', 'uber', 'bitaksi', 'metro', 'otobüs', 'istanbulkart', 'ulaşım', 'köprü', 'otoyol', 'hgs', 'ogs', 'servis', 'oto yıkama', 'yıkama', 'lastik'] },
  { id: 'fatura', label: 'Faturalar', emoji: '💡', words: ['fatura', 'elektrik', 'doğalgaz', 'dogalgaz', 'su faturası', 'internet', 'telefon faturası', 'gsm', 'turkcell', 'vodafone', 'türk telekom', 'igdaş', 'enerjisa'] },
  { id: 'ev', label: 'Kira & ev', emoji: '🏠', words: ['kira', 'aidat', 'ev', 'mobilya', 'ikea', 'temizlik', 'tamir', 'tadilat', 'koçtaş'] },
  { id: 'abonelik', label: 'Abonelikler', emoji: '📺', words: ['abonelik', 'netflix', 'spotify', 'youtube', 'disney', 'amazon prime', 'prime', 'icloud', 'exxen', 'blutv', 'gain', 'chatgpt', 'claude', 'spor salonu', 'gym'] },
  { id: 'giyim', label: 'Giyim & bakım', emoji: '👕', words: ['giyim', 'kıyafet', 'ayakkabı', 'zara', 'mavi', 'lcw', 'kuaför', 'berber', 'kozmetik', 'parfüm'] },
  { id: 'saglik', label: 'Sağlık', emoji: '💊', words: ['eczane', 'ilaç', 'doktor', 'hastane', 'muayene', 'diş', 'sağlık', 'gözlük'] },
  { id: 'eglence', label: 'Eğlence & tatil', emoji: '🎉', words: ['sinema', 'konser', 'tiyatro', 'eğlence', 'bar', 'tatil', 'otel', 'uçak', 'bilet', 'maç', 'oyun', 'kitap'] },
  { id: 'hediye', label: 'Hediye', emoji: '🎁', words: ['hediye', 'çiçek', 'doğum günü'] },
  { id: 'yarim', label: 'Yarim', emoji: '❤️', words: ['yarim', 'yarimle', 'yarim ile', 'sevgilim'] },
  { id: 'kredi', label: 'Kredi & borç', emoji: '🏦', words: ['kredi', 'taksit', 'borç', 'kart borcu', 'ekstre'] },
  { id: 'diger', label: 'Diğer', emoji: '📦', words: [] }
];
export const INCOME_CATS = [
  { id: 'maas', label: 'Maaş', emoji: '💼', words: ['maaş', 'maas', 'ücret'] },
  { id: 'prim', label: 'Prim & ikramiye', emoji: '⭐', words: ['prim', 'ikramiye', 'bonus'] },
  { id: 'ek', label: 'Ek gelir', emoji: '💸', words: ['ek gelir', 'satış', 'kira geliri', 'freelance', 'faiz', 'iade'] },
  { id: 'diger_gelir', label: 'Diğer gelir', emoji: '➕', words: ['gelir'] }
];
const ALL = [...EXPENSE_CATS, ...INCOME_CATS];
const BY_ID = Object.fromEntries(ALL.map((c) => [c.id, c]));
export const catOf = (id) => BY_ID[id] || BY_ID.diger;
export const catsFor = (kind) => (kind === 'gelir' ? INCOME_CATS : EXPENSE_CATS);

export const METHODS = [['kart', 'Kart'], ['nakit', 'Nakit']];

// Serbest metinden gider kategorisi tahmini (fiş okuma için)
export function guessCategory(text) { return findCat(text, EXPENSE_CATS) || 'diger'; }

const low = (s) => (s || '').toLocaleLowerCase('tr-TR');

// Fişlerde büyük harf I/İ karışık gelir: karşılaştırmada ı ile i aynı sayılır
const fold = (x) => low(x).replace(/ı/g, 'i').replace(/i̇/g, 'i');
function findCat(text, cats) {
  const t = ' ' + fold(text).replace(/[.,!?]/g, ' ') + ' ';
  let best = null;
  for (const c of cats) {
    for (const w of c.words) {
      // kelime başında eşleşme ("marketten", "benzinciye" de olur)
      const i = t.indexOf(' ' + fold(w));
      if (i >= 0 && (!best || w.length > best.len)) best = { id: c.id, len: w.length };
    }
  }
  return best && best.id;
}

// "250 market", "dün 1.250 tl benzin kart", "+45000 maaş", "market 320,50" → kayıt; değilse null
export function parseMoney(input, now = new Date()) {
  let s = (input || '').trim();
  if (!s) return null;
  let day = startOfDay(now);
  const dayWords = [[/^(dün|dun)\s+|\s+(dün|dun)$/i, -1], [/^(evvelsi gün|önceki gün)\s+|\s+(evvelsi gün|önceki gün)$/i, -2], [/^bugün\s+|\s+bugün$/i, 0]];
  for (const [re, n] of dayWords) if (re.test(s)) { s = s.replace(re, ' ').trim(); day = addDays(day, n); break; }

  const NUM = '(\\d{1,3}(?:[.\\s]\\d{3})+|\\d+)(?:,(\\d{1,2}))?';
  const CUR = '(?:\\s*(tl|₺|lira))?';
  let m = new RegExp('^([+])?\\s*(₺)?\\s*' + NUM + CUR + '\\s+(.+)$', 'i').exec(s);
  let sign, cur, intPart, dec, rest;
  if (m) { [, sign, cur, intPart, dec] = m; cur = cur || m[5]; rest = m[6]; }
  else {
    m = new RegExp('^(.+?)\\s+([+])?\\s*(₺)?\\s*' + NUM + CUR + '$', 'i').exec(s);
    if (!m) return null;
    rest = m[1]; sign = m[2]; cur = m[3] || m[6]; intPart = m[4]; dec = m[5];
  }
  const amount = Number(intPart.replace(/[.\s]/g, '') + (dec ? '.' + dec : ''));
  if (!amount || amount <= 0) return null;

  let method = null;
  const r0 = rest;
  // Türkçe harflerde \b çalışmadığı için boşlukla sınırlandırıyoruz
  const W = (alt) => new RegExp('(^|\\s)(' + alt + ')(?=\\s|$)', 'gi');
  rest = rest.replace(W('kredi kartıyla|kredi kartından|kredi kartı|kartıyla|kartla|kart'), () => { method = 'kart'; return ' '; })
    .replace(W('nakit'), () => { method = 'nakit'; return ' '; }).replace(/\s+/g, ' ').trim();

  const incomeCat = findCat(r0, INCOME_CATS);
  const expenseCat = findCat(r0, EXPENSE_CATS);
  const explicit = W('harcama|harcadım|ödedim|gider|aldım').test(r0);
  const isIncome = sign === '+' || (!!incomeCat && !expenseCat);
  // Para kaydı olduğuna dair yeterli işaret yoksa (ör. "3 kargo ara") dokunma
  if (!sign && !cur && !incomeCat && !expenseCat && !explicit && !method) return null;

  const kind = isIncome ? 'gelir' : 'gider';
  const category = kind === 'gelir' ? (incomeCat || 'diger_gelir') : (expenseCat || 'diger');
  const note = rest.replace(W('harcama|harcadım|ödedim|gider|aldım|gelir'), ' ').replace(/\s+/g, ' ').trim();
  return { kind, amount: Math.round(amount * 100) / 100, category, note: note || null, method, day: toDateInput(day) };
}

// ---------- Dönemler ----------
export function periodRange(view, anchor) {
  const a = startOfDay(anchor);
  if (view === 'hafta') { const s = weekStart(a); return { start: s, end: addDays(s, 6) }; }
  const s = new Date(a.getFullYear(), a.getMonth(), 1);
  return { start: s, end: new Date(a.getFullYear(), a.getMonth() + 1, 0) };
}
export function shiftPeriod(view, anchor, n) {
  return view === 'hafta' ? addDays(anchor, 7 * n) : new Date(anchor.getFullYear(), anchor.getMonth() + n, 1);
}

export function sumBy(rows, from, to, kind) {
  const A = toDateInput(from), B = toDateInput(to);
  return rows.filter((r) => r.kind === kind && r.day >= A && r.day <= B).reduce((s, r) => s + Number(r.amount), 0);
}

// Bu ay kategori bazında harcama ve bütçe durumu
export function budgetStatus(money, budgets, now = new Date()) {
  const { start, end } = periodRange('ay', now);
  const A = toDateInput(start), B = toDateInput(end);
  const spent = {};
  (money || []).forEach((r) => { if (r.kind === 'gider' && r.day >= A && r.day <= B) spent[r.category] = (spent[r.category] || 0) + Number(r.amount); });
  return Object.entries(budgets || {})
    .filter(([, lim]) => Number(lim) > 0)
    .map(([cat, lim]) => ({ cat, limit: Number(lim), spent: spent[cat] || 0, ratio: (spent[cat] || 0) / Number(lim) }))
    .sort((a, b) => b.ratio - a.ratio);
}

// Sabit giderin bu aydaki ödeme günü (ay kısa ise son gün)
export function fixedDue(f, monthStart) {
  const last = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(Number(f.day_of_month) || 1, last));
}
export function fixedPaid(f, money, monthStart) {
  const mk = toDateInput(monthStart).slice(0, 7);
  return (money || []).find((r) => r.fixed_id === f.id && r.day.startsWith(mk)) || null;
}
// Bir sonraki ödeme günü, saat 10:00 (hatırlatma için)
export function nextFixedDue(f, now = new Date()) {
  const t = startOfDay(now);
  let d = fixedDue(f, new Date(t.getFullYear(), t.getMonth(), 1));
  if (d < t) d = fixedDue(f, new Date(t.getFullYear(), t.getMonth() + 1, 1));
  d.setHours(10, 0, 0, 0);
  return d;
}
