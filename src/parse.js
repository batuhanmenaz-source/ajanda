import { addDays, startOfDay } from './dates.js';
import { BRANDS } from './constants.js';
import { parseRepeat, nextOccurrence } from './recur.js';

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

  // Tekrar: "her pazartesi", "her gün", "hafta içi", "her ayın 1'i", "her yıl"
  const rep = parseRepeat(s);
  removals.push(...rep.removals);

  // Tarih
  let day = null;
  let endDay = null;
  const today = startOfDay(now);
  const MW = '(' + MONTH_WORDS.join('|') + ")[a-zçğıöşü']*";
  // Aralık: "10-12 kasım", "10 kasım - 2 aralık", "10.11-12.11"
  const rSame = s.match(new RegExp('\\s(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\s+' + MW));
  const rTwo = s.match(new RegExp('\\s(\\d{1,2})\\s+' + MW + '\\s*[-–]\\s*(\\d{1,2})\\s+' + MW));
  const rNum = s.match(/\s(\d{1,2})[./](\d{1,2})\s*[-–]\s*(\d{1,2})[./](\d{1,2})(?=[\s,]|$)/);
  const mk = (d, mo) => { let x = new Date(today.getFullYear(), mo, d); if (x < addDays(today, -30)) x = new Date(today.getFullYear() + 1, mo, d); return x; };
  if (rTwo) {
    day = mk(+rTwo[1], MONTH_WORDS.indexOf(rTwo[2])); endDay = mk(+rTwo[3], MONTH_WORDS.indexOf(rTwo[4]));
    removals.push(rTwo[0].trim());
  } else if (rSame) {
    const mo = MONTH_WORDS.indexOf(rSame[3]);
    day = mk(+rSame[1], mo); endDay = mk(+rSame[2], mo);
    removals.push(rSame[0].trim());
  } else if (rNum) {
    day = mk(+rNum[1], +rNum[2] - 1); endDay = mk(+rNum[3], +rNum[4] - 1);
    removals.push(rNum[0].trim());
  }
  if (endDay && endDay < day) endDay = new Date(endDay.getFullYear() + 1, endDay.getMonth(), endDay.getDate());
  if (day) { /* aralık bulundu */ }
  else if (hasWord(s, 'bugün')) { day = today; removals.push(/bugün/i); }
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

  // Aylık tekrar "her ayın 5'i": bir sonraki ayın o günü
  if (rep.rule === 'monthly' && rep.monthDay && !day) {
    const t = startOfDay(now);
    let x = new Date(t.getFullYear(), t.getMonth(), rep.monthDay);
    if (x < t || (sameDayLocal(x, t) && hour !== null && (hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes())))) x = new Date(t.getFullYear(), t.getMonth() + 1, rep.monthDay);
    day = x;
  }
  if (rep.rule && !day) day = startOfDay(now);
  let date = null;
  const hasTime = hour !== null;
  if (day || hasTime) {
    date = new Date(day || today);
    date.setHours(hasTime ? hour : 9, hasTime ? minute : 0, 0, 0);
  }

  // Süre: "3 gün", "3 günlük"
  const dur = s.match(/\s(\d{1,2})\s*gün(lük)?(?=[\s,.]|$)/);
  if (dur && !endDay && +dur[1] >= 2) {
    const st = day || addDays(today, 0);
    day = st; endDay = addDays(st, +dur[1] - 1);
    removals.push(new RegExp(dur[1] + '\\s*gün(lük)?', 'i'));
  }
  if (endDay) {
    type = /kampanya/.test(s) ? 'Kampanya' : 'Etkinlik';
    date = new Date(day); date.setHours(9, 0, 0, 0);
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

  // Yarim ile ilgili mi? ("yarım saat" gibi ı'lı kullanım eşleşmez)
  const yarim = /(^|\s)(yarim|sevgilim)[a-zçğıöşü']*/.test(s);
  const yarimPrefix = raw.match(/^\s*(yarim|sevgilim)\s*(için)?\s*[:\-]\s*/i);
  if (yarimPrefix) removals.push(yarimPrefix[0]);

  // Başlık
  let title = raw;
  for (const r of removals) title = title.replace(r, ' ');
  title = title.replace(/\s+/g, ' ').replace(/^[\s,.;:-]+|[\s,;:-]+$/g, '').trim();
  if (title) title = title.charAt(0).toLocaleUpperCase('tr-TR') + title.slice(1);

  if (rep.rule && type !== 'Not') {
    // Tekrarlayanlar hatırlatma olarak kaydedilir; geçmişte kalan ilk tarih bir sonrakine kayar
    type = 'Hatırlatma'; endDay = null;
    if (date && date <= now) date = nextOccurrence(date, rep.rule, now) || date;
  }
  return { type, date, hasTime, mp, brand, title, yarim, endDate: endDay, repeat: rep.rule };
}

function sameDayLocal(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
