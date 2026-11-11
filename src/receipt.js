// Fiş fotoğrafı: küçült, Türkçe metin tanıma (cihazda çalışır, fotoğraf bir yere gönderilmez), toplam / tarih / mağaza çıkar
import { guessCategory } from './money.js';
import { startOfDay, toDateInput, addDays } from './dates.js';

// Telefon fotoğrafları 3–8 MB olur: en uzun kenar 1600 px, JPEG
export async function shrinkImage(file, max = 1600) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w, h, draw;
  if (bmp) { w = bmp.width; h = bmp.height; draw = (ctx, W, H) => ctx.drawImage(bmp, 0, 0, W, H); }
  else {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    w = img.naturalWidth; h = img.naturalHeight; draw = (ctx, W, H) => ctx.drawImage(img, 0, 0, W, H);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const k = Math.min(1, max / Math.max(w, h));
  const W = Math.round(w * k), H = Math.round(h * k);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  draw(ctx, W, H);
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', 0.82));
}

export async function readText(blob, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const base = location.origin + '/ocr';
  const worker = await createWorker('tur', 1, {
    workerPath: base + '/worker.min.js',
    corePath: base,
    langPath: base,
    logger: (m) => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.status, m.progress); }
  });
  try {
    const { data } = await worker.recognize(blob);
    return data.text || '';
  } finally {
    worker.terminate();
  }
}

// "1.234,56" / "1234.56" / "125,50" → sayı
function num(s) {
  let t = s.replace(/\s/g, '');
  const m = /^(.*)[.,](\d{2})$/.exec(t);
  if (m) t = m[1].replace(/[.,]/g, '') + '.' + m[2];
  else t = t.replace(/[.,]/g, '');
  const v = Number(t);
  return Number.isFinite(v) ? v : 0;
}
const AMT = /\*?\s*(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2})\b/g;
const amountsIn = (line) => [...line.matchAll(AMT)].map((m) => num(m[1])).filter((v) => v > 0 && v < 1e7);
const up = (s) => s.toLocaleUpperCase('tr-TR');

export function parseReceipt(text, now = new Date()) {
  const lines = (text || '').split(/\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const U = lines.map(up);

  // Toplam: önce GENEL TOPLAM, sonra TOPLAM (KDV satırları hariç), ÖDENECEK, KART/NAKİT; olmazsa en büyük tutar
  const pick = (re, not) => {
    for (let i = U.length - 1; i >= 0; i--) {
      if (re.test(U[i]) && !(not && not.test(U[i]))) {
        const a = amountsIn(lines[i]);
        if (a.length) return a[a.length - 1];
        const b = i + 1 < lines.length ? amountsIn(lines[i + 1]) : [];
        if (b.length) return b[0];
      }
    }
    return 0;
  };
  let amount = pick(/GENEL\s*TOP/) || pick(/TOPLAM|TOP\b|TUTAR/, /KDV|ARA\s*TOP|İNDİRİM|INDIRIM|MATRAH/) || pick(/ÖDENECEK|ODENECEK/) || pick(/KRED[İI]|KART|NAK[İI]T/);
  if (!amount) {
    const all = lines.flatMap(amountsIn);
    amount = all.length ? Math.max(...all) : 0;
  }

  // Tarih: 12.11.2026, 12/11/26, 12-11-2026
  let day = toDateInput(startOfDay(now));
  const dm = /\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/.exec(text || '');
  if (dm) {
    let y = Number(dm[3]); if (y < 100) y += 2000;
    const d = new Date(y, Number(dm[2]) - 1, Number(dm[1]));
    if (d.getMonth() === Number(dm[2]) - 1 && d <= now && d >= addDays(startOfDay(now), -90)) day = toDateInput(d);
  }

  // Mağaza: üstteki ilk anlamlı satır
  let merchant = '';
  for (const l of lines.slice(0, 6)) {
    const letters = (l.match(/\p{L}/gu) || []).length;
    if (letters >= 3 && letters / l.length > 0.5 && !/F[İI]Ş|TAR[İI]H|SAAT|VERG[İI]|V\.D|TEL|ADRES|MERS[İI]S/.test(up(l))) { merchant = l; break; }
  }
  merchant = merchant.replace(/[^\p{L}\p{N}&.' -]/gu, '').trim().slice(0, 40);
  // TAMAMI BÜYÜK harfse düzelt; I/İ ayrımı fişlerde güvenilmez, "i" kabul edilir
  if (merchant === up(merchant)) merchant = merchant.replace(/[Iİ]/g, 'i').toLocaleLowerCase('tr-TR').replace(/(^|\s)\p{L}/gu, (c) => c.toLocaleUpperCase('tr-TR'));

  const method = /KRED[İI]\s*KART|KART|POS|TEMASSIZ/.test(up(text || '')) ? 'kart' : /NAK[İI]T/.test(up(text || '')) ? 'nakit' : null;
  return { amount: Math.round(amount * 100) / 100, day, merchant, category: guessCategory(merchant + ' ' + (text || '')), method };
}
