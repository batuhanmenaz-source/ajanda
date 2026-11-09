import { addDays, startOfDay } from './dates.js';
import { BRANDS } from './constants.js';

const DAY_WORDS = [
  ['pazartesi', 1], ['salı', 2], ['çarşamba', 3], ['perşembe', 4], ['cumartesi', 6], ['cuma', 5], ['pazar', 0]
];
const MONTH_WORDS = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];

const MP_WORDS = [
  ['trendyol', 'Trendyol'], ['ty', 'Trendyol'],
  ['hepsiburada', 'Hepsiburada'], ['hb', 'Hepsiburada'],
  ['amazon', 'Amazon'], ['mclub', 'MCLUB'], ['boyner', 'Boyner'], ['n11', 'N11'],
  ['pazarama', 'Pazarama'], ['beymen', 'Beymen'], ['idefix', 'İdefix'], ['i̇defix', 'İdefix']
];

const lower = (s) => s.toLocaleLowerCase('tr-TR');

function hasWord(s, w) {
  return new RegExp('(^|[\\s,.;:!?(])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "($|[\\s,.;:!?)'’])").test(s);
}

/**
 * Hızlı ekleme metnini çözümler.
 * Örnekler: "yarın 10:00 HB fiyat güncelle", "Cuma 15:00 kargo firmasını ara",
 * "not: Trendyol komisyon oranını kontrol et", "12 kasım saat 14 Missha stok"
 */
export function parseQuick(text, now = new Date()) {
  const raw = (text || '').trim();
  const s = ' ' + lower(raw) + ' ';
  const removals = [];

  // Tür
  let type = 'Hatırlatma';
  const noteMatch = raw.match(/^\s*not\s*[:\-]\s*/i);
  if (noteMatch) { type = 'Not'; removals.push(noteMatch[0]); }
  else if (/\s(ara|arama|aranacak|aransın)[\s.,!]/.test(s) || s.includes('geri ara') || s.includes('telefon et')) type = 'Arama';

  // Tarih
  let day = null;
  const today = startOfDay(now);
  if (hasWord(s, 'bugün')) { day = today; removals.push(/bugün/i); }
  else if (hasWord(s, 'yarından sonra') || hasWord(s, 'öbür gün')) { day = addDays(today, 2); removals.push(/yarından sonra|öbür gün/i); }
  else if (hasWord(s, 'yarın')) { day = addDays(today, 1); removals.push(/yarın/i); }
  else {
    // "12 kasım" veya "12.11" / "12/11"
    const mWord = s.match(new RegExp('\\s(\\d{1,2})\\s+(' + MONTH_WORDS.join('|') + ")[a-zçğıöşü']*"));
    const mNum = s.match(/\s(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=[\s,]|$)/);
    if (mWord) {
      const d = parseInt(mWord[1], 10);
      const mo = MONTH_WORDS.indexOf(mWord[2]);
      day = new Date(today.getFullYear(), mo, d);
      if (day < today) day = new Date(today.getFullYear() + 1, mo, d);
      removals.push(new RegExp(mWord[1] + '\\s+' + mWord[2] + "[a-zçğıöşü']*", 'i'));
    } else if (mNum && !/saat\s*$/.test(s.slice(0, mNum.index + 1))) {
      const d = parseInt(mNum[1], 10);
      const mo = parseInt(mNum[2], 10) - 1;
      if (mo >= 0 && mo < 12 && d >= 1 && d <= 31) {
        let y = mNum[3] ? parseInt(mNum[3], 10) : today.getFullYear();
        if (y < 100) y += 2000;
        day = new Date(y, mo, d);
        if (!mNum[3] && day < today) day = new Date(y + 1, mo, d);
        removals.push(mNum[0].trim());
      }
    } else {
      for (const [w, dow] of DAY_WORDS) {
        if (w === 'pazar' && /pazar(ama|tesi)/.test(s) && !hasWord(s, 'pazar')) continue;
        if (w === 'cuma' && s.includes('cumartesi') && !hasWord(s, 'cuma')) continue;
        if (s.includes(' ' + w)) {
          let diff = (dow - today.getDay() + 7) % 7;
          if (diff === 0) diff = 7;
          if (hasWord(s, 'haftaya')) { diff = diff < 7 ? diff + 7 : diff; removals.push(/haftaya/i); }
          day = addDays(today, diff);
          removals.push(new RegExp(w + "[a-zçğıöşü']*(\\s+günü)?", 'iu'));
          break;
        }
      }
    }
  }

  // Saat
  let hour = null;
  let minute = 0;
  const tColon = s.match(/(\d{1,2}):(\d{2})/);
  const tSaat = s.match(/saat\s*(\d{1,2})(?:[.:](\d{2}))?/);
  if (tSaat) {
    hour = parseInt(tSaat[1], 10); minute = tSaat[2] ? parseInt(tSaat[2], 10) : 0;
    removals.push(/saat\s*\d{1,2}(?:[.:]\d{2})?(?:'?(?:de|da|te|ta))?/i);
  } else if (tColon) {
    hour = parseInt(tColon[1], 10); minute = parseInt(tColon[2], 10);
    removals.push(/\d{1,2}:\d{2}(?:'?(?:de|da|te|ta))?/);
  }
  if (hour !== null && (hour > 23 || minute > 59)) hour = null;

  let date = null;
  const hasTime = hour !== null;
  if (day || hasTime) {
    date = new Date(day || today);
    date.setHours(hasTime ? hour : 9, hasTime ? minute : 0, 0, 0);
  }

  // Pazaryeri
  let mp = '';
  for (const [w, name] of MP_WORDS) {
    if (hasWord(s, w)) { mp = name; break; }
  }

  // Marka
  let brand = '';
  for (const b of BRANDS) {
    const bl = lower(b);
    if (s.includes(bl) || s.includes(bl.replace(/[:\s]/g, ''))) { brand = b; break; }
  }

  // Başlık
  let title = raw;
  for (const r of removals) title = title.replace(r, ' ');
  title = title.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '').trim();
  if (title) title = title.charAt(0).toLocaleUpperCase('tr-TR') + title.slice(1);

  return { type, date, hasTime, mp, brand, title };
}
