// Google Health (Fitbit Air): uyku, adım, aktif dakika, nabız, antrenmanlar
// Bugün sayfasında küçük şerit + Özel → Sağlık sayfası (haftalık kıyas, tavsiyeler, Excel raporu)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, DEMO } from './supabase.js';

const CACHE = 'ajanda-health-v2';
const FRESH = 20 * 60000;
const DAY = 86400000;
export const STEP_GOAL = 10000;
export const AZM_GOAL = 150; // DSÖ: haftada en az 150 dk orta yoğunlukta hareket
export const SLEEP_GOAL = 7 * 60;
// Kişisel hedefler (Ayarlar'da saklanır, cihazlar arası aynı)
export const SPORTS = [['yuzme', 'Yüzme', '🏊', ['SWIMMING']], ['kosu', 'Koşu', '🏃', ['RUNNING', 'TREADMILL']], ['agirlik', 'Ağırlık / kuvvet', '🏋️', ['WEIGHTLIFTING', 'STRENGTH_TRAINING']], ['yuruyus', 'Yürüyüş', '🚶', ['WALKING', 'HIKING']], ['bisiklet', 'Bisiklet', '🚴', ['BIKING']], ['karisik', 'Karışık', '💪', null]];
export const AIMS = [['kondisyon', 'Kondisyon'], ['kilo', 'Kilo vermek'], ['kas', 'Kas / güç'], ['genel', 'Genel sağlık']];
export const DEFAULT_GOALS = { sport: 'yuzme', perWeek: 3, minutes: 45, aim: 'kondisyon', steps: 8000, sleep: 7.5, targetWeight: null, height: null, age: null, notes: '', days: [], time: '19:00', gcal: true };
// Haftanın günü: 1 = Pazartesi … 7 = Pazar
export const isoDay = (d) => ((d.getDay() + 6) % 7) + 1;
export const DAY_SHORT = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
export const goalsOf = (g) => ({ ...DEFAULT_GOALS, ...(g || {}) });
export const sportOf = (g) => SPORTS.find((x) => x[0] === g.sport) || SPORTS[SPORTS.length - 1];
export const isSport = (g, e) => { const t = sportOf(g)[3]; return !t || t.includes(e.type); };

export const ymdLocal = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const weekStartOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addD(x, -((x.getDay() + 6) % 7)); };

// ---------- Örnek veri ----------
function demoHealth() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const out = { connected: true, at: new Date().toISOString(), today: ymdLocal(t), from: ymdLocal(addD(t, -27)), steps: {}, sleep: {}, distance: {}, azm: {}, kcal: {}, weight: {}, rhr: {}, exercise: [], errors: {}, keys: {} };
  for (let i = 27; i >= 0; i--) {
    const d = addD(t, -i), k = ymdLocal(d);
    const wk = Math.floor((27 - i) / 7); // 0..3: spora başlayınca artan hareket
    const r = (n) => Math.abs(Math.sin(i * 12.9898 + n) * 43758.5453) % 1;
    out.steps[k] = i === 0 ? 4230 : Math.round(5200 + wk * 1100 + r(1) * 4200);
    out.distance[k] = out.steps[k] * 0.00072;
    out.azm[k] = i === 0 ? 12 : Math.round(4 + wk * 7 + r(2) * 18);
    out.kcal[k] = Math.round(2050 + out.steps[k] * 0.04 + r(3) * 150);
    out.rhr[k] = Math.round(66 - wk * 1.3 + r(4) * 2);
    if (i % 3 === 0) out.weight[k] = +(84.6 - (27 - i) * 0.05 + r(5) * 0.3).toFixed(1);
    const asleep = Math.round(380 + r(6) * 95 + wk * 6);
    const endT = new Date(d.getTime() + (6 * 60 + 50 + r(7) * 40) * 60000);
    const start = new Date(endT.getTime() - (asleep + 35) * 60000);
    out.sleep[k] = { day: k, start: start.toISOString(), end: endT.toISOString(), asleep, inBed: asleep + 35, awake: 35, stages: { deep: Math.round(asleep * 0.17), rem: Math.round(asleep * 0.22), light: Math.round(asleep * 0.61), awake: 35 }, main: true, naps: 0 };
    if (wk >= 2 && d.getDay() === 6 && i > 0) {
      const s = new Date(d.getTime() + 10 * 3600000);
      out.exercise.push({ day: k, start: s.toISOString(), end: new Date(s.getTime() + 35 * 60000).toISOString(), type: 'SWIMMING', name: '', min: 35, kcal: 280, km: 1.1, hr: null, azm: 20, steps: null, laps: 44, pace: 1.62 });
    }
    if (wk >= 2 && [1, 3, 5].includes(d.getDay()) && i > 0) {
      const s = new Date(d.getTime() + 19 * 3600000);
      out.exercise.push({ day: k, start: s.toISOString(), end: new Date(s.getTime() + 50 * 60000).toISOString(), type: d.getDay() === 3 ? 'RUNNING' : 'WEIGHTLIFTING', name: '', min: d.getDay() === 3 ? 32 : 48, kcal: d.getDay() === 3 ? 340 : 290, km: d.getDay() === 3 ? 4.6 : null, hr: d.getDay() === 3 ? 148 : 121, azm: d.getDay() === 3 ? 30 : 18, steps: null });
    }
  }
  return out;
}

// ---------- Sunucu ----------
async function call(path, opts = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data && data.session && data.session.access_token;
  const r = await fetch('/api/health' + path, { ...opts, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  const j = await r.json().catch(() => ({ error: 'Beklenmeyen yanıt (' + r.status + ')' }));
  if (!r.ok && !j.error) j.error = 'Hata ' + r.status;
  return j;
}
export async function fetchHealth(force) {
  if (DEMO) return demoHealth();
  if (!force) {
    try { const c = JSON.parse(localStorage.getItem(CACHE)); if (c && Date.now() - c.got < FRESH) return c.v; } catch { /* yok say */ }
  }
  const v = await call('?days=35');
  if (!v.error || v.connected === false) { try { localStorage.setItem(CACHE, JSON.stringify({ got: Date.now(), v })); } catch { /* yok say */ } }
  return v;
}
export function clearHealthCache() { try { localStorage.removeItem(CACHE); localStorage.removeItem('ajanda-health-v1'); } catch { /* yok say */ } }
export async function connectHealth() {
  if (DEMO) return { error: 'Örnek modda bağlanamaz.' };
  const j = await call('?action=url');
  if (j.url) { clearHealthCache(); window.location.href = j.url; return { ok: true }; }
  return j;
}
export async function disconnectHealth() { clearHealthCache(); return call('?action=disconnect', { method: 'POST' }); }

export function useHealth(enabled) {
  const [h, setH] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback((force) => {
    setBusy(true);
    fetchHealth(force).then(setH).catch((e) => setH({ error: e.message })).finally(() => setBusy(false));
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    load(false);
    const onVis = () => { if (document.visibilityState === 'visible') load(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled, load]);
  return { health: h, busy, reload: () => load(true) };
}

// ---------- Hesaplar ----------
export const hm = (min) => { if (min == null) return '—'; const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + ' sa' + (m ? ' ' + m + ' dk' : '') : m + ' dk'; };
const clock = (iso) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const nf = (n, d = 0) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: d, minimumFractionDigits: d }));
const avg = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const sum = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
// Yatış saati: 18:00'den itibaren dakika (gece yarısını düzgün ortalamak için)
const bedMin = (iso) => { const d = new Date(iso); let m = d.getHours() * 60 + d.getMinutes() - 18 * 60; if (m < 0) m += 1440; return m; };
const minClock = (m) => { if (m == null) return '—'; let x = Math.round(m + 18 * 60) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };
const sd = (xs) => { const v = xs.filter((x) => x != null); if (v.length < 3) return null; const a = v.reduce((p, c) => p + c, 0) / v.length; return Math.sqrt(v.reduce((p, c) => p + (c - a) ** 2, 0) / v.length); };

export function periodStats(h, keys, goals) {
  const g = goalsOf(goals);
  const sp = (h.exercise || []).filter((e) => keys.includes(e.day) && isSport(g, e));
  const swims = sp.filter((e) => e.type === 'SWIMMING');
  const ex = (h.exercise || []).filter((e) => keys.includes(e.day));
  const nights = keys.map((k) => h.sleep && h.sleep[k]).filter(Boolean);
  const w = keys.map((k) => h.weight && h.weight[k]).filter((x) => x != null);
  return {
    days: keys.length,
    steps: avg(keys.map((k) => h.steps && h.steps[k])),
    stepsGoalDays: keys.filter((k) => h.steps && h.steps[k] >= g.steps).length,
    km: sum(keys.map((k) => h.distance && h.distance[k])),
    azm: sum(keys.map((k) => h.azm && h.azm[k])),
    kcal: avg(keys.map((k) => h.kcal && h.kcal[k])),
    rhr: avg(keys.map((k) => h.rhr && h.rhr[k])),
    sleep: avg(nights.map((n) => n.asleep)),
    deep: avg(nights.map((n) => n.stages && n.stages.deep)),
    rem: avg(nights.map((n) => n.stages && n.stages.rem)),
    bed: avg(nights.map((n) => bedMin(n.start))),
    wake: avg(nights.map((n) => bedMin(n.end))),
    bedSd: sd(nights.map((n) => bedMin(n.start))),
    shortNights: nights.filter((n) => n.asleep < 6 * 60).length,
    nights: nights.length,
    exCount: ex.length,
    exMin: sum(ex.map((e) => e.min)) || 0,
    exDays: new Set(ex.map((e) => e.day)).size,
    sportCount: sp.length,
    sportMin: sum(sp.map((e) => e.min)) || 0,
    sportDays: [...new Set(sp.map((e) => e.day))].sort(),
    swimM: swims.length ? Math.round((sum(swims.map((e) => e.km)) || 0) * 1000) : null,
    swimPace: avg(swims.map((e) => e.pace)),
    weightFirst: w.length ? w[0] : null,
    weightLast: w.length ? w[w.length - 1] : null
  };
}

// Seçili hafta ve kıyas için önceki hafta (bu hafta yarımsa geçen haftanın aynı günleri)
export function weekKeys(start, today) {
  const all = Array.from({ length: 7 }, (_, i) => ymdLocal(addD(start, i)));
  const T = ymdLocal(today);
  const cur = all.filter((k) => k <= T);
  const prev = Array.from({ length: cur.length }, (_, i) => ymdLocal(addD(start, i - 7)));
  return { all, cur, prev, partial: cur.length < 7 };
}

const pctCh = (a, b) => (a != null && b ? (a - b) / b : null);

// ---------- Tavsiyeler (kurala dayalı, hedefe göre; genel bilgi, tıbbi tavsiye değil) ----------
const WDN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const NUTRI = {
  yuzme: [
    'Yüzerken terlediğini fark etmezsin ama sıvı kaybedersin: yüzmeden önce ve sonra birer büyük bardak su iç.',
    'Yüzmeden 1,5–2 saat önce hafif ve karbonhidratlı bir şey ye (yulaf, muz, tam buğday ekmekli peynirli tost); ağır yemekten hemen sonra yüzme.',
    'Yüzmeden sonraki 1–2 saat içinde protein ve karbonhidratı birlikte al: yoğurt + meyve, yumurtalı tost, ayran + simit gibi.',
    'Havuz sonrası açlık sık görülür; hazırda sağlıklı bir atıştırmalık (kuruyemiş, meyve, yoğurt) olursa abur cubura yönelmezsin.'
  ],
  kilo: ['Kilo verirken kas kaybetmemek için her ana öğüne bir avuç içi kadar protein (et, tavuk, balık, yumurta, baklagil) koy.', 'Akşamları büyük porsiyon yerine tabağın yarısını sebzeyle doldurmak toplam kaloriyi kendiliğinden düşürür.'],
  kas: ['Kas için gün boyunca proteini öğünlere dağıt; antrenman sonrası öğünü atlama.', 'Antrenman günlerinde karbonhidratı kesme: pirinç, bulgur, makarna enerjini ve toparlanmanı destekler.'],
  kondisyon: ['Antrenman günlerinde öğün atlama; enerji düşükse performans da düşer.', 'Günlük su ihtiyacını idrar rengiyle takip edebilirsin: açık sarı yeterli demektir.'],
  genel: ['Tabağının yarısı sebze, çeyreği protein, çeyreği tam tahıl olacak şekilde düzenlemek dengeli beslenmenin kolay bir yolu.']
};
export function healthTips(c, p, ctx) {
  const { partial, onlyToday, goals, today, weekIndex = 0 } = ctx || {};
  const g = goalsOf(goals);
  const [, spName, spIcon] = sportOf(g);
  const sleepGoal = g.sleep * 60;
  const t = [];
  // 1) Antrenman hedefi (en önemli)
  const done = c.sportCount;
  const target = g.perWeek;
  if (partial && today) {
    const todayIdx = (today.getDay() + 6) % 7; // 0 = Pazartesi
    const daysLeft = 6 - todayIdx + (c.sportDays.includes(ymdLocal(today)) ? 0 : 1); // bugün henüz yapılmadıysa bugün de sayılır
    const left = Math.max(0, target - done);
    if (left === 0) t.push({ tone: 'good', icon: spIcon, title: 'Haftalık ' + spName.toLocaleLowerCase('tr-TR') + ' hedefi tamam: ' + done + '/' + target, text: 'Bu haftanın planını bitirdin. Kalan günlerde hafif yürüyüş ya da esneme toparlanmaya iyi gelir.' });
    else {
      // Kalan seansları arada bir gün boşluk bırakacak şekilde öner
      const cand = [];
      for (let i = c.sportDays.includes(ymdLocal(today)) ? 1 : 0; (today.getDay() + 6) % 7 + i <= 6; i++) cand.push(addD(today, i));
      const lastDone = c.sportDays.length ? fromKey(c.sportDays[c.sportDays.length - 1]) : null;
      const sugg = [];
      cand.forEach((d) => { const prev = sugg.length ? sugg[sugg.length - 1] : lastDone; if (sugg.length < left && (!prev || Math.round((d - prev) / DAY) >= 2)) sugg.push(d); });
      cand.forEach((d) => { if (sugg.length < left && !sugg.includes(d)) sugg.push(d); });
      sugg.sort((x, y) => x - y);
      const tight = left > daysLeft;
      t.push({
        tone: tight ? 'warn' : 'info', icon: spIcon, title: spName + ': ' + done + '/' + target + ' bu hafta',
        text: tight ? 'Hafta bitene kadar ' + daysLeft + ' gün var, ' + left + ' seans kaldı. Hepsini sıkıştırmak yerine kalanları kısa tut ya da bu haftayı ' + (done + daysLeft) + ' seansla kapat; art arda günlerde yoğunluğu düşük tut.'
          : left + ' seans kaldı. Öneri: ' + sugg.map((d) => WDN[d.getDay()]).join(', ') + '. Seanslar arasında bir gün ara bırakmak kasların toparlanması için iyi olur.'
      });
    }
  } else if (!partial) {
    if (done >= target) t.push({ tone: 'good', icon: spIcon, title: spName + ' hedefi tamam: ' + done + '/' + target, text: 'Planladığın kadar antrenman yaptın. İstikrar, tek seferlik yoğun antrenmandan daha çok işe yarar.' });
    else t.push({ tone: 'warn', icon: spIcon, title: spName + ': ' + done + '/' + target, text: (target - done) + ' seans eksik kaldı. Gelecek haftanın seans günlerini şimdiden takvime ekle; sabit günler alışkanlığı kolaylaştırır.' });
  }
  // Art arda günler
  const consec = c.sportDays.some((d, i) => i && Math.round((fromKey(d) - fromKey(c.sportDays[i - 1])) / DAY) === 1);
  if (consec && target <= 4) t.push({ tone: 'info', icon: '📅', title: 'Art arda antrenman günleri', text: 'Haftada ' + target + ' seans için aralarına birer gün dinlenme koymak hem performansı hem toparlanmayı iyileştirir.' });
  // Seans süresi
  if (done && c.sportMin / done < g.minutes * 0.7) t.push({ tone: 'info', icon: '⏱️', title: 'Seanslar hedeften kısa', text: 'Ortalama seans ' + Math.round(c.sportMin / done) + ' dakika, hedefin ' + g.minutes + ' dakika. Süreyi her hafta 5 dakika artırarak hedefe ulaşabilirsin.' });
  // Yüzmeye özel: mesafe ve tempo
  if (c.swimM != null && p.swimM) {
    const ch = (c.swimM - p.swimM) / p.swimM;
    if (!partial && ch > 0.3) t.push({ tone: 'warn', icon: '🏊', title: 'Mesafe hızlı arttı (+%' + Math.round(ch * 100) + ')', text: 'Haftalık yüzme mesafesini kademeli artırmak (haftada %10–20) omuz zorlanmasını önler.' });
  }
  if (c.swimPace && p.swimPace && c.swimPace < p.swimPace * 0.97) t.push({ tone: 'good', icon: '🏊', title: 'Tempon gelişiyor', text: '100 metre temposu geçen haftaya göre ' + Math.round((p.swimPace - c.swimPace) * 100) + ' saniye hızlandı.' });
  // 2) Uyku
  if (c.sleep != null) {
    if (c.sleep < sleepGoal - 15) t.push({ tone: 'warn', icon: '😴', title: 'Uyku hedefin altında: ' + hm(c.sleep), text: 'Hedefin ' + hm(sleepGoal) + '. Antrenmandan sonraki toparlanma büyük ölçüde uykuda olur; yatış saatini 20–30 dakika öne çek.' });
    else if (!c.shortNights) t.push({ tone: 'good', icon: '😴', title: 'Uyku hedefine uygun: ' + hm(c.sleep), text: 'Bu düzeni korumak antrenmanlardan toparlanmanı kolaylaştırır.' });
    if (c.bedSd != null && c.bedSd > 60) t.push({ tone: 'warn', icon: '🕰️', title: 'Yatış saatin düzensiz', text: 'Yatış saatin günden güne ortalama ' + Math.round(c.bedSd) + ' dakika oynuyor. Her gün benzer saatte yatıp kalkmak uyku kalitesini artırır.' });
    if (c.shortNights >= 2) t.push({ tone: 'warn', icon: '⚠️', title: c.shortNights + ' gece 6 saatin altında', text: 'Kısa uyunan gecelerin ertesinde ağır antrenman yerine hafif tempolu bir seans daha güvenli.' });
  }
  // 3) Nabız
  if (c.rhr != null && p.rhr != null) {
    const d = c.rhr - p.rhr;
    if (d >= 4) t.push({ tone: 'warn', icon: '❤️', title: 'Dinlenme nabzın yükseldi (+' + Math.round(d) + ')', text: 'Yorgunluk, az uyku, stres ya da başlayan bir hastalık bunu yapabilir; bir iki gün hafif antrenman yap. Yüksek seyir sürerse bir doktora danış.' });
    else if (d <= -2) t.push({ tone: 'good', icon: '❤️', title: 'Dinlenme nabzın düşüyor (' + Math.round(c.rhr) + ' bpm)', text: 'Düzenli antrenmanla kondisyon geliştikçe genelde böyle olur.' });
  }
  // 4) Gün içi hareket
  if (!onlyToday && c.steps != null && c.steps < g.steps * 0.75) t.push({ tone: 'info', icon: '👟', title: 'Gün içi adım hedefin gerisinde', text: 'Ortalama ' + nf(c.steps) + ' adım, hedefin ' + nf(g.steps) + '. Antrenman olmayan günlerde 20–30 dakikalık yürüyüş hem adımı hem toparlanmayı destekler.' });
  // 5) Kilo hedefi
  if (g.targetWeight && c.weightLast != null) {
    const diff = c.weightLast - g.targetWeight;
    const ch = p.weightLast != null ? c.weightLast - p.weightLast : null;
    if (Math.abs(diff) < 0.5) t.push({ tone: 'good', icon: '⚖️', title: 'Hedef kilodasın', text: 'Şimdi amaç korumak: antrenman düzenini ve öğün düzenini sürdür.' });
    else if (ch != null && Math.abs(ch) > 1) t.push({ tone: 'warn', icon: '⚖️', title: 'Kilo hızlı değişti (' + (ch > 0 ? '+' : '') + nf(ch, 1) + ' kg)', text: 'Haftada 0,5–1 kg civarı değişim sürdürülebilir kabul edilir. Hedefe ' + nf(Math.abs(diff), 1) + ' kg var; acele etmeden ilerle.' });
    else t.push({ tone: 'info', icon: '⚖️', title: 'Hedefe ' + nf(Math.abs(diff), 1) + ' kg', text: ch != null ? 'Bu hafta ' + (ch > 0 ? '+' : '') + nf(ch, 1) + ' kg. Haftada 0,5 kg civarı sağlıklı bir hız.' : 'Kilo ölçümlerini haftada en az bir kez aynı saatte yap; karşılaştırma daha doğru olur.' });
  }
  // 6) Dinlenme
  if (c.exDays >= 6) t.push({ tone: 'warn', icon: '🛌', title: 'Dinlenme günü ver', text: 'Bu hafta ' + c.exDays + ' gün antrenman yaptın; haftada en az bir tam dinlenme günü planla.' });
  // 7) Beslenme: her hafta sıradaki bir öneri (yüzme + hedef)
  const pool = [...(g.sport === 'yuzme' ? NUTRI.yuzme : []), ...(NUTRI[g.aim] || NUTRI.genel)];
  if (pool.length) t.push({ tone: 'info', icon: '🥗', title: 'Beslenme', text: pool[Math.abs(weekIndex) % pool.length] });
  const order = { warn: 0, info: 1, good: 2 };
  return t.sort((x, y) => order[x.tone] - order[y.tone]);
}

// ---------- Bugün: küçük şerit ----------
export function HealthMini({ state, now, onOpen }) {
  const { health: h, goals: gRaw } = state || {};
  const g = goalsOf(gRaw);
  if (!h || h.connected === false) return null;
  if (h.expired || (h.error && !h.steps)) {
    return (
      <section className="card hm-strip warn">
        <span>❤️ {h.error || 'Sağlık verisi alınamadı.'}</span>
        {h.expired ? <button type="button" className="linkbtn" onClick={() => connectHealth()}>Yeniden bağla</button> : null}
      </section>
    );
  }
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  const T = ymdLocal(t), Y = ymdLocal(addD(t, -1));
  const night = (h.sleep || {})[T] || (h.sleep || {})[Y];
  const st = (h.steps || {})[T];
  const wk = weekKeys(weekStartOf(t), t);
  const azmW = sum(wk.cur.map((k) => h.azm && h.azm[k]));
  return (
    <button type="button" className="card hm-strip" onClick={onOpen} aria-label="Sağlık sayfasını aç">
      <span className="hm-i"><span aria-hidden="true">😴</span><b>{night ? hm(night.asleep) : '—'}</b></span>
      <span className="hm-i hm-steps">
        <span aria-hidden="true">👟</span><b>{st != null ? nf(st) : '—'}</b>
        <span className="hm-bar" aria-hidden="true"><span style={{ width: Math.min(100, ((st || 0) / g.steps) * 100) + '%' }} /></span>
      </span>
      {g.days && g.days.includes(isoDay(t)) ? (
        (h.exercise || []).some((e) => e.day === T && isSport(g, e))
          ? <span className="hm-i hm-sport done"><span aria-hidden="true">{sportOf(g)[2]}</span><b>✓</b></span>
          : <span className="hm-i hm-sport"><span aria-hidden="true">{sportOf(g)[2]}</span><b>{g.time}</b></span>
      ) : null}
      {azmW != null ? <span className="hm-i"><span aria-hidden="true">⚡</span><b>{nf(azmW)}</b><small>/{AZM_GOAL} dk</small></span> : null}
      <span className="hm-go" aria-hidden="true">›</span>
    </button>
  );
}

function ConnectBtn() {
  const [err, setErr] = useState('');
  return (
    <>
      <button type="button" className="btn primary" onClick={async () => { setErr(''); const r = await connectHealth(); if (r && r.error) setErr(r.error); }}>Google Health'e bağlan</button>
      {err ? <p className="hint" style={{ color: 'var(--danger)' }}>{err}</p> : null}
    </>
  );
}

// ---------- Hedeflerim ----------
function GoalsCard({ goals, saved, onSave }) {
  const [open, setOpen] = useState(!saved);
  const [f, setF] = useState(goals);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(goals); }, [JSON.stringify(goals)]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const numIn = (k, v, min, max, step = 1) => {
    const n = v === '' ? null : Number(String(v).replace(',', '.'));
    set(k, n == null || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, Math.round(n / step) * step)));
  };
  const sp = sportOf(goals);
  if (!open) {
    return (
      <button type="button" className="card hp-goals-sum" onClick={() => setOpen(true)}>
        <span aria-hidden="true">🎯</span>
        <span><b>Hedefim:</b> {sp[1]} · {goals.days && goals.days.length ? goals.days.map((d) => DAY_SHORT[d - 1]).join(' ') + ' ' + goals.time : 'haftada ' + goals.perWeek} × {goals.minutes} dk · {AIMS.find((a) => a[0] === goals.aim)[1].toLocaleLowerCase('tr-TR')} · {nf(goals.steps)} adım · {String(goals.sleep).replace('.', ',')} sa uyku{goals.targetWeight ? ' · hedef ' + String(goals.targetWeight).replace('.', ',') + ' kg' : ''}</span>
        <span className="hp-goals-edit">Düzenle</span>
      </button>
    );
  }
  return (
    <section className="card hp-goals">
      <div className="hp-goals-hd"><b>🎯 Hedeflerim</b>{saved ? <button type="button" className="linkbtn" onClick={() => { setF(goals); setOpen(false); }}>Kapat</button> : null}</div>
      {!saved ? <p className="hint" style={{ margin: 0 }}>Tavsiyeler bu hedeflere göre hazırlanır. Sonra istediğin zaman değiştirebilirsin.</p> : null}
      <div className="field"><label>Ana spor</label>
        <div className="typechips">{SPORTS.map(([k, l, ic]) => <button key={k} type="button" className={'chip' + (f.sport === k ? ' on' : '')} aria-pressed={f.sport === k} onClick={() => set('sport', k)}>{ic} {l}</button>)}</div>
      </div>
      <div className="field"><label>Amacın</label>
        <div className="typechips">{AIMS.map(([k, l]) => <button key={k} type="button" className={'chip' + (f.aim === k ? ' on' : '')} aria-pressed={f.aim === k} onClick={() => set('aim', k)}>{l}</button>)}</div>
      </div>
      <div className="field"><label>Spor günlerin <small className="muted">(takvimde görünür)</small></label>
        <div className="typechips" role="group" aria-label="Spor günleri">{DAY_SHORT.map((l, i) => {
          const on = (f.days || []).includes(i + 1);
          return <button key={l} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setF((x) => { const ds = new Set(x.days || []); if (on) ds.delete(i + 1); else ds.add(i + 1); const days = [...ds].sort(); return { ...x, days, perWeek: days.length || x.perWeek }; })}>{l}</button>;
        })}</div>
      </div>
      {(f.days || []).length ? (
        <div className="hp-goals-grid">
          <div className="field"><label htmlFor="hg-time">Saat</label><input id="hg-time" type="time" value={f.time || '19:00'} onChange={(e) => set('time', e.target.value)} /></div>
          <label className="wl-check" style={{ alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" checked={f.gcal !== false} onChange={(e) => set('gcal', e.target.checked)} /><span>Google Takvim'e ekle (1 saat önce bildirim)</span></label>
        </div>
      ) : null}
      <div className="hp-goals-grid">
        <div className="field"><label htmlFor="hg-pw">Haftada kaç gün</label><input id="hg-pw" type="number" inputMode="numeric" min="1" max="7" value={f.perWeek ?? ''} onChange={(e) => numIn('perWeek', e.target.value, 1, 7)} /></div>
        <div className="field"><label htmlFor="hg-min">Seans süresi (dk)</label><input id="hg-min" type="number" inputMode="numeric" min="10" max="240" step="5" value={f.minutes ?? ''} onChange={(e) => numIn('minutes', e.target.value, 10, 240)} /></div>
        <div className="field"><label htmlFor="hg-st">Günlük adım</label><input id="hg-st" type="number" inputMode="numeric" min="1000" max="30000" step="500" value={f.steps ?? ''} onChange={(e) => numIn('steps', e.target.value, 1000, 30000, 500)} /></div>
        <div className="field"><label htmlFor="hg-sl">Uyku (saat)</label><input id="hg-sl" type="number" inputMode="decimal" min="5" max="10" step="0.5" value={f.sleep ?? ''} onChange={(e) => numIn('sleep', e.target.value, 5, 10, 0.5)} /></div>
        <div className="field"><label htmlFor="hg-tw">Hedef kilo (kg, isteğe bağlı)</label><input id="hg-tw" type="number" inputMode="decimal" min="35" max="200" step="0.5" value={f.targetWeight ?? ''} onChange={(e) => numIn('targetWeight', e.target.value, 35, 200, 0.5)} /></div>
        <div className="field"><label htmlFor="hg-h">Boy (cm, isteğe bağlı)</label><input id="hg-h" type="number" inputMode="numeric" min="120" max="230" value={f.height ?? ''} onChange={(e) => numIn('height', e.target.value, 120, 230)} /></div>
        <div className="field"><label htmlFor="hg-age">Yaş (isteğe bağlı)</label><input id="hg-age" type="number" inputMode="numeric" min="16" max="100" value={f.age ?? ''} onChange={(e) => numIn('age', e.target.value, 16, 100)} /></div>
      </div>
      <div className="field"><label htmlFor="hg-notes">Koç için not (isteğe bağlı)</label>
        <textarea id="hg-notes" rows={2} maxLength={300} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Örn. akşamları geç yiyorum, laktozu sevmem, omzumda eski bir sakatlık var" />
      </div>
      <button type="button" className="btn primary" disabled={busy} onClick={async () => { setBusy(true); const ok = await onSave(f); setBusy(false); if (ok !== false) setOpen(false); }}>{busy ? 'Kaydediliyor…' : 'Hedefleri kaydet'}</button>
    </section>
  );
}

// ---------- Önümüzdeki 7 gün: kurala dayalı antrenman planı (yerel, ücretsiz) ----------
const r50 = (m) => Math.max(50, Math.round(m / 50) * 50);
// Bir seansın yüzme mesafesi: geçen haftanın seans ortalaması +%8 (en fazla +200 m); veri yoksa süreden
function swimBase(h, goals, today) {
  const from = ymdLocal(addD(today, -14));
  const sw = (h.exercise || []).filter((e) => e.type === 'SWIMMING' && e.day >= from && e.km);
  if (sw.length) { const a = sw.reduce((t, e) => t + e.km * 1000, 0) / sw.length; return Math.min(3000, r50(Math.min(a * 1.08, a + 200))); }
  return Math.min(1600, r50(goals.minutes * 18)); // yeni başlayan: dakikada ~18 m (dinlenmeler dahil)
}
const SWIM_SETS = [
  ['Teknik', (D) => 'Isınma 200 m serbest · 6×50 m teknik (kol çekişi, nefes) 20 sn ara · ' + r50(Math.max(100, D - 600)) + ' m sakin · Soğuma 100 m'],
  ['Aralık', (D) => 'Isınma 200 m · ' + Math.max(4, Math.round((D - 400) / 100)) + '×100 m orta-hızlı, 30 sn ara · Soğuma 200 m'],
  ['Uzun sakin', (D) => 'Isınma 100 m · ' + r50(Math.max(200, D - 200)) + ' m sakin tempo (yorulunca 25 m\'de kısa mola) · Soğuma 100 m']
];
const OTHER_SETS = {
  kosu: [['Kolay', (m) => m + ' dk konuşabileceğin tempoda koşu']], agirlik: [['Tüm vücut A', (m) => m + ' dk: squat, şınav, kürek çekiş, plank (3 set)'], ['Tüm vücut B', (m) => m + ' dk: deadlift, omuz pres, lunge, mekik (3 set)']],
  yuruyus: [['Tempolu', (m) => m + ' dk tempolu yürüyüş']], bisiklet: [['Sakin', (m) => m + ' dk sakin pedal']], karisik: [['Antrenman', (m) => m + ' dk tercih ettiğin spor']]
};
export function buildPlan(h, goalsIn, today) {
  const g = goalsOf(goalsIn);
  const [, spName, spIcon] = sportOf(g);
  const T = ymdLocal(today);
  const done = ((h && h.exercise) || []).filter((e) => isSport(g, e));
  const doneDays = new Set(done.map((e) => e.day));
  const D = g.sport === 'yuzme' ? swimBase(h || {}, g, today) : null;
  const days = Array.from({ length: 7 }, (_, i) => addD(today, i));
  // Haftalara göre kalan seans: bu hafta (bugüne kadar yapılanlar düşülür) ve gelecek hafta
  const ws = weekStartOf(today);
  const doneThisWeek = done.filter((e) => e.day >= ymdLocal(ws) && e.day < T).length;
  let last = [...doneDays].filter((d) => d < T).sort().pop();
  let lastDate = last ? fromKey(last) : null;
  const plan = [];
  let idx = doneThisWeek;
  days.forEach((d, i) => {
    const k = ymdLocal(d);
    const weekNo = d < addD(ws, 7) ? 0 : 1;
    const target = g.perWeek;
    const countThisWeek = plan.filter((x) => x.session && x.week === weekNo).length + (weekNo === 0 ? doneThisWeek : 0);
    const dayIdx = (d.getDay() + 6) % 7;
    const daysLeftInWeek = 7 - dayIdx;
    const need = target - countThisWeek;
    const gap = lastDate ? Math.round((d - lastDate) / DAY) : 9;
    if (i === 0 && doneDays.has(k)) { plan.push({ d, week: weekNo, session: true, done: true, title: spIcon + ' ' + spName + ' yapıldı ✓', text: 'Bugünkü seansın kaydedildi. Akşam hafif esneme ve bol su.' }); lastDate = d; idx++; return; }
    // Bugün dinlenirsek kalan günlere aralıklı en fazla ceil((kalan-1)/2) seans sığar; ihtiyaç bundan fazlaysa art arda gün kabul
    const must = need > Math.ceil((daysLeftInWeek - 1) / 2);
    const fixed = g.days && g.days.length;
    if (fixed ? g.days.includes(isoDay(d)) : need > 0 && (gap >= 2 || must)) {
      let title, text;
      if (g.sport === 'yuzme') { const [nm, f] = SWIM_SETS[idx % SWIM_SETS.length]; title = spIcon + ' Yüzme · ' + nm + ' · ~' + nf(D) + ' m'; text = f(D); }
      else { const list = OTHER_SETS[g.sport] || OTHER_SETS.karisik; const [nm, f] = list[idx % list.length]; title = spIcon + ' ' + spName + ' · ' + nm; text = f(g.minutes); }
      plan.push({ d, week: weekNo, session: true, at: fixed ? g.time : null, title: (fixed ? g.time + ' · ' : '') + title, text, food: 'Önce (1,5–2 sa): hafif karbonhidrat · Sonra (1–2 sa içinde): protein + karbonhidrat · bol su' });
      lastDate = d; idx++;
    } else {
      const restAfter = lastDate && Math.round((d - lastDate) / DAY) === 1;
      plan.push({ d, week: weekNo, session: false, title: restAfter ? '🧘 Toparlanma' : '🚶 Aktif dinlenme', text: restAfter ? '10 dk omuz ve sırt esnemesi, 20 dk sakin yürüyüş' : '20–30 dk yürüyüş; günlük adım hedefine katkı' });
    }
  });
  return plan;
}

function PlanCard({ h, goals, today }) {
  const plan = useMemo(() => buildPlan(h, goals, today), [h, JSON.stringify(goals), ymdLocal(today)]);
  const T = ymdLocal(today);
  // Kapalıyken yalnız sıradaki seans görünür; tercih bu cihazda hatırlanır
  const [open, setOpenRaw] = useState(() => { try { return localStorage.getItem('ajanda-plan-open') === '1'; } catch { return false; } });
  const setOpen = (v) => { setOpenRaw(v); try { localStorage.setItem('ajanda-plan-open', v ? '1' : '0'); } catch { /* yok say */ } };
  const nextS = plan.find((x) => x.session && !x.done);
  const sessions = plan.filter((x) => x.session).length;
  if (!open) {
    return (
      <button type="button" className="card hp-plan-mini" onClick={() => setOpen(true)} aria-expanded={false}>
        <span className="hp-plan-mini-k">📋 Önümüzdeki 7 gün · {sessions} seans</span>
        <span className="hp-plan-mini-v">{nextS ? <><b>{ymdLocal(nextS.d) === T ? 'Bugün' : WD[nextS.d.getDay()]}</b> {nextS.title}</> : 'Bu hafta planlı seans yok'}</span>
        <span className="hp-plan-mini-go" aria-hidden="true">▾</span>
      </button>
    );
  }
  return (
    <section className="card hp-coach" aria-label="Önümüzdeki 7 gün">
      <button type="button" className="hp-coach-hd hp-plan-toggle" onClick={() => setOpen(false)} aria-expanded><b>📋 Önümüzdeki 7 gün</b><span className="hint">kapat ▴</span></button>
      <div className="hp-plan">
        {plan.map((x) => (
          <div key={ymdLocal(x.d)} className={'hp-plan-r' + (x.session ? ' on' : '') + (x.done ? ' done' : '') + (ymdLocal(x.d) === T ? ' today' : '')}>
            <b>{ymdLocal(x.d) === T ? 'Bugün' : WD[x.d.getDay()]}</b>
            <span><span className="hp-plan-t">{x.title}</span>{x.session ? <span className="hp-plan-steps">{String(x.text).split(' · ').map((t, i) => <span key={i}>{t}</span>)}</span> : <><br />{x.text}</>}{x.food ? <small className="hp-plan-f">🍽 {x.food}</small> : null}</span>
          </div>
        ))}
      </div>
      <span className="hint">Seanslar arasına bir gün dinlenme koyar; yüzme mesafesini geçen haftana göre en fazla %8 artırır. Kendini yorgun hissedersen seansı kısalt.</span>
    </section>
  );
}

// Takvimdeki spor kaydına dokununca: o günün seansı adım adım
export function SportSheet({ item, onClose, onOpenHealth }) {
  const p = item.plan || {};
  const steps = String(p.text || '').split(' · ').filter(Boolean);
  const food = String(p.food || '').split(' · ').filter(Boolean);
  const d = fromKey(item.day);
  const label = (x) => (/^ısınma/i.test(x) ? '🔥' : /^soğuma/i.test(x) ? '🧊' : /teknik/i.test(x) ? '🎯' : '🏊');
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Antrenman planı">
        <div className="sheet-head"><h2>{p.title || 'Antrenman'}</h2><button type="button" className="iconbtn" aria-label="Kapat" onClick={onClose}>✕</button></div>
        <p className="hint" style={{ margin: 0 }}>{WD[d.getDay()]} {d.getDate()} {MON[d.getMonth()]}{item.time ? ' · ' + item.time : ''}{item.goals ? ' · hedef ' + item.goals.minutes + ' dk' : ''}</p>
        {steps.length ? (
          <ol className="sp-steps">
            {steps.map((x, i) => <li key={i}><span aria-hidden="true">{label(x)}</span><span>{x}</span></li>)}
          </ol>
        ) : <p>Bu gün için plan yok.</p>}
        {food.length ? (
          <div className="sp-food"><b>🍽 Beslenme</b>{food.map((x, i) => <span key={i}>{x}</span>)}</div>
        ) : null}
        <p className="hint" style={{ margin: 0 }}>Plan, Fitbit'in kaydettiği son yüzmelerine göre her hafta kendini ayarlar. Yorgunsan seansı kısalt; ağrı olursa dur.</p>
        <button type="button" className="btn big" onClick={onOpenHealth}>Sağlık sayfasını aç</button>
      </div>
    </div>
  );
}

// ---------- Özel → Sağlık ----------
const EX_TR = { WALKING: 'Yürüyüş', RUNNING: 'Koşu', BIKING: 'Bisiklet', WEIGHTLIFTING: 'Ağırlık', STRENGTH_TRAINING: 'Kuvvet antrenmanı', SWIMMING: 'Yüzme', YOGA: 'Yoga', AEROBIC_WORKOUT: 'Aerobik', HIKING: 'Doğa yürüyüşü', ELLIPTICAL: 'Eliptik', TREADMILL: 'Koşu bandı', HIIT: 'HIIT', OTHER: 'Antrenman' };
export const exName = (e) => e.name || EX_TR[e.type] || String(e.type || 'Antrenman').toLocaleLowerCase('tr-TR').replace(/_/g, ' ');
// Yüzme: 100 metre için tempo (dk:sn)
const pace100 = (spm) => { if (!spm) return ''; const t = Math.round(spm * 100); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + ' /100 m'; };
const exDetail = (e) => (e.type === 'SWIMMING'
  ? [e.km ? nf(e.km * 1000) + ' m' : '', e.laps ? e.laps + ' boy' : '', pace100(e.pace), e.kcal ? e.kcal + ' kcal' : '', e.azm ? e.azm + ' aktif dk' : '']
  : [e.kcal ? e.kcal + ' kcal' : '', e.km ? nf(e.km, 1) + ' km' : '', e.hr ? 'ort. ' + e.hr + ' bpm' : '', e.azm ? e.azm + ' aktif dk' : '']).filter(Boolean).join(' · ');
const EX_ICON = { WALKING: '🚶', RUNNING: '🏃', BIKING: '🚴', WEIGHTLIFTING: '🏋️', STRENGTH_TRAINING: '🏋️', SWIMMING: '🏊', YOGA: '🧘', HIKING: '🥾' };
const WD = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const WDS = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const dm = (d) => d.getDate() + ' ' + MON[d.getMonth()];

function Trend({ c, p, better = 'up', fmt }) {
  if (c == null || p == null || !p) return <span className="hp-d muted">{p == null ? 'kıyas yok' : ''}</span>;
  const ch = (c - p) / p;
  if (Math.abs(ch) < 0.01) return <span className="hp-d muted">aynı</span>;
  const up = ch > 0;
  const good = better === 'none' ? null : (better === 'up') === up;
  return <span className={'hp-d ' + (good == null ? '' : good ? 'good' : 'bad')}>{up ? '▲' : '▼'} %{Math.abs(Math.round(ch * 100))}{fmt ? <small> ({fmt(p)})</small> : null}</span>;
}

export function HealthPage({ state, now, hidden, onToggleHidden, onExport, goals: goalsRaw, onSaveGoals }) {
  const goals = goalsOf(goalsRaw);
  const { health: h, busy, reload } = state || {};
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const thisWeek = weekStartOf(today);
  // Pazartesi günü bu hafta yalnız bugünden ibaret: açılışta biten haftayı göster
  const [off, setOff] = useState(() => ((today.getDay() + 6) % 7 === 0 ? 1 : 0));
  const start = addD(thisWeek, -7 * off);
  const wk = weekKeys(start, today);
  const ok = h && h.connected && !(h.error && !h.steps);
  // Bugün henüz bitmediği için adım / aktif dakika / kalori bitmiş günlerden; uyku ve antrenmanlar tüm günlerden
  const onlyToday = wk.partial && wk.cur.length === 1;
  const actKeys = wk.partial && !onlyToday ? wk.cur.slice(0, -1) : wk.cur;
  const mix = (all, act) => (all && act ? { ...all, steps: act.steps, stepsGoalDays: act.stepsGoalDays, km: act.km, azm: all.azm, kcal: act.kcal } : all);
  const gk = JSON.stringify(goals);
  const c = useMemo(() => (ok ? mix(periodStats(h, wk.cur, goals), periodStats(h, actKeys, goals)) : null), [h, ok, wk.cur.join(), gk]);
  const p = useMemo(() => {
    if (!ok) return null;
    const full = periodStats(h, Array.from({ length: 7 }, (_, i) => ymdLocal(addD(start, i - 7))), goals);
    return { ...mix(periodStats(h, wk.prev, goals), periodStats(h, wk.prev.slice(0, actKeys.length), goals)), weightLast: full.weightLast };
  }, [h, ok, wk.prev.join(), gk]);
  const weekIndex = Math.round(start.getTime() / (7 * DAY));
  const tips = useMemo(() => (c && p ? healthTips(c, p, { partial: wk.partial, onlyToday, goals, today, weekIndex }) : []), [c, p, wk.partial, onlyToday, gk, weekIndex]);

  if (!h) return <div className="card"><p className="empty">{busy ? 'Sağlık verisi yükleniyor…' : 'Yükleniyor…'}</p></div>;
  if (h.connected === false) {
    return (
      <div className="card hp-connect">
        <span className="hp-connect-ic" aria-hidden="true">❤️</span>
        <h3>Google Health'i bağla</h3>
        <p>Fitbit Air'in uyku, adım, aktif dakika, nabız ve antrenman verileri burada haftalık olarak karşılaştırılır.</p>
        {h.error ? <p className="hint" style={{ color: 'var(--danger)' }}>{h.error}</p> : null}
        <ConnectBtn />
      </div>
    );
  }
  if (!ok) {
    return (
      <div className="card hp-connect">
        <p>{h.error || 'Sağlık verisi alınamadı.'}</p>
        {h.expired ? <button type="button" className="btn primary" onClick={() => connectHealth()}>Yeniden bağla</button> : <button type="button" className="btn" onClick={reload}>Tekrar dene</button>}
      </div>
    );
  }

  const label = off === 0 ? 'Bu hafta' : off === 1 ? 'Geçen hafta' : off + ' hafta önce';
  const cmpLabel = onlyToday ? 'geçen pazartesiye göre; adım ve kalori için gün bitince kıyaslanır' : wk.partial ? 'geçen haftanın aynı günlerine göre; adım ve kalori bitmiş günlerden' : 'önceki haftaya göre';
  const pa = onlyToday ? {} : p;
  const maxSteps = Math.max(goals.steps, ...wk.all.map((k) => h.steps[k] || 0));
  const maxSleep = Math.max(9 * 60, ...wk.all.map((k) => (h.sleep[k] ? h.sleep[k].asleep : 0)));
  const weekEx = (h.exercise || []).filter((e) => wk.all.includes(e.day));
  const needScope = h.errors && Object.values(h.errors).some((e) => /^403|permission|scope/i.test(e));
  const oldest = h.from || Object.keys(h.steps || {}).sort()[0] || wk.all[0];
  const canBack = ymdLocal(addD(start, -1)) >= oldest;
  const [, spName, spIcon] = sportOf(goals);
  const tiles = [
    { k: spIcon + ' ' + spName, v: c.sportCount + '/' + goals.perWeek, u: 'seans', sub: c.swimM ? nf(c.swimM) + ' m' + (c.swimPace ? ' · ' + pace100(c.swimPace) : '') : c.sportMin ? hm(c.sportMin) + ' toplam' : 'bu hafta henüz yok', tr: <Trend c={c.sportMin || null} p={p.sportMin || null} />, hi: true },
    { k: '👟 Adım', v: nf(c.steps), u: onlyToday ? 'bugün' : '/gün', sub: c.stepsGoalDays + ' gün hedef (' + nf(goals.steps) + ') üstü', tr: <Trend c={c.steps} p={pa.steps} /> },
    { k: '⚡ Aktif dakika', v: nf(c.azm), u: 'dk', sub: <span className="hp-goal"><span style={{ width: Math.min(100, ((c.azm || 0) / AZM_GOAL) * 100) + '%' }} /></span>, tr: <Trend c={c.azm} p={pa.azm} /> },
    { k: '😴 Uyku', v: hm(c.sleep), u: '/gece', sub: c.bed != null ? 'yatış ' + minClock(c.bed) + ' · kalkış ' + minClock(c.wake) : '', tr: <Trend c={c.sleep} p={p.sleep} /> },
    { k: '❤️ Dinlenme nabzı', v: c.rhr != null ? nf(c.rhr) : '—', u: 'bpm', sub: 'düşük olması iyi', tr: <Trend c={c.rhr} p={p.rhr} better="down" /> },
    { k: '🏋️ Antrenman', v: String(c.exCount), u: 'kez', sub: c.exMin ? hm(c.exMin) + ' toplam' : 'kayıt yok', tr: <Trend c={c.exMin || null} p={p.exMin || null} /> },
    { k: '🔥 Kalori', v: nf(c.kcal), u: 'kcal/gün', sub: c.km ? nf(c.km, 1) + ' km yol' : '', tr: <Trend c={c.kcal} p={pa.kcal} better="none" /> }
  ];
  if (c.weightLast != null || p.weightLast != null) tiles.push({ k: '⚖️ Kilo', v: c.weightLast != null ? nf(c.weightLast, 1) : '—', u: 'kg', sub: 'haftanın son ölçümü', tr: <Trend c={c.weightLast} p={p.weightLast} better="none" /> });

  return (
    <div className="hp">
      <GoalsCard goals={goals} saved={!!goalsRaw} onSave={onSaveGoals} />
      <PlanCard h={h} goals={goals} today={today} />
      <div className="hp-top">
        <div className="week-nav hp-nav">
          <button type="button" className="iconbtn" aria-label="Önceki hafta" onClick={() => setOff(off + 1)} disabled={!canBack}>‹</button>
          <span className="lbl">{label}<small>{dm(start)} – {dm(addD(start, 6))}</small></span>
          <button type="button" className="iconbtn" aria-label="Sonraki hafta" onClick={() => setOff(Math.max(0, off - 1))} disabled={off === 0}>›</button>
        </div>
        <div className="hp-acts">
          <button type="button" className="btn" onClick={() => onExport({ start, wk, c, p, tips, h, label })}>⬇ Haftalık rapor</button>
          <button type="button" className="btn" onClick={reload} disabled={busy}>{busy ? 'Yenileniyor…' : '↻'}</button>
        </div>
      </div>
      <p className="hint" style={{ margin: '-6px 0 0' }}>Yüzdeler {cmpLabel}.</p>

      <div className="hp-tiles">
        {tiles.map((x) => (
          <div key={x.k} className={'hp-tile' + (x.hi ? ' hi' : '')}>
            <span className="hp-k">{x.k}</span>
            <span className="hp-v">{x.v}<small> {x.u}</small></span>
            {x.tr}
            {x.sub ? <span className="hp-sub">{x.sub}</span> : null}
          </div>
        ))}
      </div>

      <section className="card hp-days" aria-label="Günlük döküm">
        <div className="hp-row hp-head"><span>Gün</span><span>Adım</span><span>Uyku</span><span className="hp-num">Aktif</span><span className="hp-num">Nabız</span></div>
        {wk.all.map((k) => {
          const d = fromKey(k);
          const fut = k > ymdLocal(today);
          const s = h.sleep[k];
          const ex = weekEx.filter((e) => e.day === k);
          return (
            <div key={k} className={'hp-row' + (k === ymdLocal(today) ? ' today' : '') + (fut ? ' fut' : '')}>
              <span className="hp-day"><b>{WDS[d.getDay()]}</b> {d.getDate()}{ex.length ? <span className="hp-ex" title={ex.map(exName).join(', ')}>{ex.map((e) => EX_ICON[e.type] || '💪').join('')}</span> : null}</span>
              <span className="hp-barc">{h.steps[k] != null ? <><span className="hp-bar st" style={{ width: (h.steps[k] / maxSteps) * 100 + '%', background: h.steps[k] >= goals.steps ? '#2B8A3E' : '#69DB7C' }} /><em>{nf(h.steps[k])}</em></> : <em className="muted">—</em>}</span>
              <span className="hp-barc">{s ? <><span className="hp-bar" style={{ width: (s.asleep / maxSleep) * 100 + '%', background: s.asleep >= goals.sleep * 60 - 15 ? '#7048E8' : '#B197FC' }} /><em>{Math.floor(s.asleep / 60)}:{String(Math.round(s.asleep % 60)).padStart(2, '0')}</em></> : <em className="muted">—</em>}</span>
              <span className="hp-num">{h.azm[k] != null ? nf(h.azm[k]) : '—'}</span>
              <span className="hp-num">{h.rhr[k] != null ? nf(h.rhr[k]) : '—'}</span>
            </div>
          );
        })}
      </section>

      {weekEx.length ? (
        <section className="section">
          <div className="section-head"><h2>Antrenmanlar</h2><span className="meta">{weekEx.length} kayıt</span></div>
          <div className="card list">
            {weekEx.map((e, i) => (
              <div key={i} className="row hp-exrow">
                <span className="hp-exic" aria-hidden="true">{EX_ICON[e.type] || '💪'}</span>
                <span className="hp-exm"><b>{exName(e)}</b><small>{WD[fromKey(e.day).getDay()]} {clock(e.start)} · {hm(e.min)}</small></span>
                <span className="hp-exs">{exDetail(e)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}


      <section className="section">
        <div className="section-head"><h2>Tavsiyeler</h2><span className="meta">{spName.toLocaleLowerCase('tr-TR')} · haftada {goals.perWeek} · {AIMS.find((a) => a[0] === goals.aim)[1].toLocaleLowerCase('tr-TR')}</span></div>
        <div className="hp-tips">
          {tips.length ? tips.map((x, i) => (
            <div key={i} className={'hp-tip ' + x.tone}>
              <span className="hp-tip-ic" aria-hidden="true">{x.icon}</span>
              <span><b>{x.title}</b><br />{x.text}</span>
            </div>
          )) : <p className="empty">Tavsiye için bu haftanın verisi henüz yeterli değil.</p>}
        </div>
        <p className="hint">Bunlar verine göre üretilen genel bilgiler, tıbbi tavsiye değil. Bir şikayetin varsa ya da yeni bir antrenman programına başlarken doktoruna danış.</p>
      </section>

      <div className="hp-foot">
        <button type="button" className="btn" onClick={onToggleHidden} aria-pressed={!hidden}>{hidden ? "Bugün sayfasında göster" : "Bugün sayfasında gizle"}</button>
        {needScope ? <button type="button" className="btn" onClick={() => connectHealth()}>Nabız ve kilo için yeniden bağlan</button> : null}
        <span className="hint">Son güncelleme {new Date(h.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {h.errors && Object.keys(h.errors).length ? (
        <details className="hp-tech"><summary>Alınamayan veriler</summary>{Object.entries(h.errors).map(([k, v]) => <div key={k}><b>{k}</b>: {v}</div>)}{h.keys ? Object.entries(h.keys).map(([k, v]) => <div key={k} className="muted">{k}: {v}</div>) : null}</details>
      ) : null}
    </div>
  );
}
