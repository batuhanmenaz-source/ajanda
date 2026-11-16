// Bugün sayfası için döviz ve altın: Dolar, Euro, gram altın (TL) ve ons altın (USD).
// Kaynak: Truncgil Finans (ücretsiz, anahtarsız). Ulaşılamazsa Frankfurter (ECB kuru) + gold-api yedek olarak kullanılır.
// Sonuç Vercel'de 10 dakika önbelleğe alınır; herkese açık veridir, kişisel bilgi içermez.

const TIMEOUT = 6000;

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Ajanda/1.0', accept: 'application/json' } });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// "1.234,56" / "34,12" / "%0,45" / 34.12 → sayı
export function num(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (x == null) return null;
  let s = String(x).replace(/[%$€₺\s]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

const KEYS = {
  USD: ['USD', 'ABD DOLARI', 'usd'],
  EUR: ['EUR', 'EURO', 'eur'],
  GRA: ['GRA', 'gram-altin', 'Gram Altın', 'GAU', 'gram altın'],
  ONS: ['ONS', 'Ons', 'ons', 'XAU'],
  CEY: ['CEYREKALTIN', 'ceyrek-altin', 'Çeyrek Altın', 'CEYREK', 'YENICEYREK', 'yeni-ceyrek-altin'],
  TAM: ['TAMALTIN', 'tam-altin', 'Tam Altın', 'TAM', 'YENITAM', 'yeni-tam-altin']
};
const pick = (data, k) => { for (const c of KEYS[k]) if (data && data[c]) return data[c]; return null; };
const field = (o, names) => { for (const n of names) if (o && o[n] != null) return o[n]; return null; };

export function fromTruncgil(data) {
  const out = {};
  for (const k of Object.keys(KEYS)) {
    const o = pick(data, k);
    if (!o) continue;
    const v = num(field(o, ['Selling', 'Satış', 'satis', 'selling']));
    const b = num(field(o, ['Buying', 'Alış', 'alis', 'buying']));
    const ch = num(field(o, ['Change', 'Değişim', 'degisim', 'change']));
    if (v || b) out[k] = { v: v || b, ch };
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  let rates = {};
  let source = '';
  let updated = null;
  for (const url of ['https://finans.truncgil.com/v4/today.json', 'https://finans.truncgil.com/today.json']) {
    try {
      const d = await getJson(url);
      rates = fromTruncgil(d);
      updated = d.Update_Date || d.update_date || null;
      if (rates.USD && rates.GRA) { source = 'Truncgil'; break; }
    } catch (e) { console.warn(String(e)); }
  }
  // Yedek: ECB kuru (gün sonu) + ons altın; gram altın = ons(USD) × USD/TRY ÷ 31,1035
  if (!rates.USD || !rates.EUR) {
    try {
      const f = await getJson('https://api.frankfurter.app/latest?from=USD&to=TRY,EUR');
      const usd = f.rates && f.rates.TRY;
      if (usd) {
        rates.USD = rates.USD || { v: usd, ch: null };
        if (f.rates.EUR) rates.EUR = rates.EUR || { v: usd / f.rates.EUR, ch: null };
        source = source ? source + ' + ECB' : 'ECB';
      }
    } catch (e) { console.warn(String(e)); }
  }
  if (!rates.ONS || !rates.GRA) {
    try {
      const g = await getJson('https://api.gold-api.com/price/XAU');
      const ons = num(g.price);
      if (ons) {
        rates.ONS = rates.ONS || { v: ons, ch: null };
        if (!rates.GRA && rates.USD) rates.GRA = { v: (ons * rates.USD.v) / 31.1035, ch: null };
        source = source ? source + ' + gold-api' : 'gold-api';
      }
    } catch (e) { console.warn(String(e)); }
  }
  // Çeyrek / tam bulunamazsa gram altından yaklaşık hesap (22 ayar has: çeyrek ≈1,6 gr, tam ≈6,4 gr)
  if (rates.GRA && !rates.CEY) rates.CEY = { v: rates.GRA.v * 1.6038, ch: rates.GRA.ch, approx: true };
  if (rates.GRA && !rates.TAM) rates.TAM = { v: rates.GRA.v * 6.4152, ch: rates.GRA.ch, approx: true };
  if (!rates.USD) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Kurlar şu an alınamadı.' });
    return;
  }
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
  res.status(200).json({ at: new Date().toISOString(), updated, source, rates });
}
