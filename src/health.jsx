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

export function periodStats(h, keys) {
  const ex = (h.exercise || []).filter((e) => keys.includes(e.day));
  const nights = keys.map((k) => h.sleep && h.sleep[k]).filter(Boolean);
  const w = keys.map((k) => h.weight && h.weight[k]).filter((x) => x != null);
  return {
    days: keys.length,
    steps: avg(keys.map((k) => h.steps && h.steps[k])),
    stepsGoalDays: keys.filter((k) => h.steps && h.steps[k] >= STEP_GOAL).length,
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

// ---------- Tavsiyeler (genel bilgi, kişisel tıbbi öneri değil) ----------
export function healthTips(c, p, partial, onlyToday) {
  const t = [];
  if (c.sleep != null) {
    if (c.sleep < SLEEP_GOAL) t.push({ tone: 'warn', icon: '😴', title: 'Uyku süren hedefin altında', text: 'Bu hafta gecelik ortalama ' + hm(c.sleep) + ' uyudun. Yetişkinler için genelde 7–9 saat öneriliyor; antrenmandan sonra toparlanma da büyük ölçüde uykuda oluyor. Yatış saatini 20–30 dakika öne çekmeyi dene.' });
    else t.push({ tone: 'good', icon: '😴', title: 'Uyku süren iyi', text: 'Gecelik ortalama ' + hm(c.sleep) + '. Bu süreyi korumak antrenmanlardan toparlanmanı kolaylaştırır.' });
    if (c.bedSd != null && c.bedSd > 60) t.push({ tone: 'warn', icon: '🕰️', title: 'Yatış saatin düzensiz', text: 'Yatış saatin günden güne ortalama ' + Math.round(c.bedSd) + ' dakika oynuyor. Hafta sonu dahil her gün aynı saatlerde yatıp kalkmak uyku kalitesini artırır.' });
    if (c.shortNights >= 2) t.push({ tone: 'warn', icon: '⚠️', title: c.shortNights + ' gece 6 saatin altında', text: 'Kısa uyunan gecelerin ertesinde ağır antrenman yerine hafif tempolu bir gün planlamak daha güvenli.' });
  }
  if (c.azm != null) {
    const goal = Math.round(AZM_GOAL * (c.days / 7));
    if (c.azm < goal) {
      const left = AZM_GOAL - c.azm;
      t.push({ tone: 'info', icon: '⚡', title: 'Aktif dakika: ' + nf(c.azm) + ' / ' + AZM_GOAL, text: 'Dünya Sağlık Örgütü haftada en az 150 dakika orta yoğunlukta hareket öneriyor.' + (partial && left > 0 ? ' Hafta bitene kadar ' + left + ' dakika kaldı; günde yaklaşık ' + Math.ceil(left / Math.max(1, 7 - c.days + 1)) + ' dakika tempolu yürüyüş yeterli.' : '') });
    } else t.push({ tone: 'good', icon: '⚡', title: 'Aktif dakika hedefi tamam', text: 'Bu hafta ' + nf(c.azm) + ' aktif dakika topladın; haftalık 150 dakika önerisini karşıladın.' });
    if (!onlyToday && p.azm && c.azm > p.azm * 1.3 && p.azm >= 30) t.push({ tone: 'warn', icon: '📈', title: 'Yük hızlı arttı', text: 'Aktif dakikaların geçen haftaya göre %' + Math.round((c.azm / p.azm - 1) * 100) + ' arttı. Spora yeni başlarken yükü haftadan haftaya kademeli artırmak sakatlık riskini azaltır.' });
  }
  if (!onlyToday && c.steps != null && c.steps < 7000) t.push({ tone: 'info', icon: '👟', title: 'Gün içi hareket az', text: 'Günlük ortalaman ' + nf(c.steps) + ' adım. Antrenman dışında da gün içinde kısa yürüyüşler (öğle arası, telefon görüşmeleri) toplam hareketi artırır.' });
  if (c.rhr != null && p.rhr != null) {
    const d = c.rhr - p.rhr;
    if (d >= 4) t.push({ tone: 'warn', icon: '❤️', title: 'Dinlenme nabzın yükseldi', text: 'Geçen haftaya göre ' + Math.round(d) + ' atım yüksek (' + Math.round(c.rhr) + ' bpm). Yorgunluk, az uyku, stres ya da başlayan bir hastalık bunu yapabilir; bir iki gün hafif antrenman yap. Yüksek seyir sürerse bir doktora danış.' });
    else if (d <= -2) t.push({ tone: 'good', icon: '❤️', title: 'Dinlenme nabzın düşüyor', text: 'Geçen haftaya göre ' + Math.round(-d) + ' atım düştü (' + Math.round(c.rhr) + ' bpm). Düzenli antrenmanla kondisyon geliştikçe genelde böyle olur.' });
  }
  if (c.exDays >= 6) t.push({ tone: 'warn', icon: '🛌', title: 'Dinlenme günü ver', text: 'Bu hafta ' + c.exDays + ' gün antrenman yaptın. Kaslar dinlenme günlerinde güçlenir; haftada en az bir tam dinlenme günü planla.' });
  else if (c.exCount === 0 && !partial) t.push({ tone: 'info', icon: '🏋️', title: 'Bu hafta antrenman kaydı yok', text: 'Saat antrenman kaydetmediyse Google Health uygulamasından antrenmanı başlatabilir ya da elle ekleyebilirsin.' });
  if (c.weightLast != null && p.weightLast != null) {
    const d = c.weightLast - p.weightLast;
    if (Math.abs(d) >= 1) t.push({ tone: 'info', icon: '⚖️', title: 'Kilo ' + (d > 0 ? 'arttı' : 'azaldı') + ': ' + (d > 0 ? '+' : '') + nf(d, 1) + ' kg', text: 'Haftalık 0,5–1 kg civarı değişim genelde sürdürülebilir kabul edilir. Daha hızlı değişimlerde beslenme ve su tüketimine dikkat et.' });
  }
  return t;
}

// ---------- Bugün: küçük şerit ----------
export function HealthMini({ state, now, onOpen }) {
  const { health: h } = state || {};
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
        <span className="hm-bar" aria-hidden="true"><span style={{ width: Math.min(100, ((st || 0) / STEP_GOAL) * 100) + '%' }} /></span>
      </span>
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

// ---------- Özel → Sağlık ----------
const EX_TR = { WALKING: 'Yürüyüş', RUNNING: 'Koşu', BIKING: 'Bisiklet', WEIGHTLIFTING: 'Ağırlık', STRENGTH_TRAINING: 'Kuvvet antrenmanı', SWIMMING: 'Yüzme', YOGA: 'Yoga', AEROBIC_WORKOUT: 'Aerobik', HIKING: 'Doğa yürüyüşü', ELLIPTICAL: 'Eliptik', TREADMILL: 'Koşu bandı', HIIT: 'HIIT', OTHER: 'Antrenman' };
export const exName = (e) => e.name || EX_TR[e.type] || String(e.type || 'Antrenman').toLocaleLowerCase('tr-TR').replace(/_/g, ' ');
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

export function HealthPage({ state, now, hidden, onToggleHidden, onExport }) {
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
  const c = useMemo(() => (ok ? mix(periodStats(h, wk.cur), periodStats(h, actKeys)) : null), [h, ok, wk.cur.join()]);
  const p = useMemo(() => {
    if (!ok) return null;
    const full = periodStats(h, Array.from({ length: 7 }, (_, i) => ymdLocal(addD(start, i - 7))));
    return { ...mix(periodStats(h, wk.prev), periodStats(h, wk.prev.slice(0, actKeys.length))), weightLast: full.weightLast };
  }, [h, ok, wk.prev.join()]);
  const tips = useMemo(() => (c && p ? healthTips(c, p, wk.partial, onlyToday) : []), [c, p, wk.partial, onlyToday]);

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
  const maxSteps = Math.max(STEP_GOAL, ...wk.all.map((k) => h.steps[k] || 0));
  const maxSleep = Math.max(9 * 60, ...wk.all.map((k) => (h.sleep[k] ? h.sleep[k].asleep : 0)));
  const weekEx = (h.exercise || []).filter((e) => wk.all.includes(e.day));
  const needScope = h.errors && Object.values(h.errors).some((e) => /^403|permission|scope/i.test(e));
  const oldest = h.from || Object.keys(h.steps || {}).sort()[0] || wk.all[0];
  const canBack = ymdLocal(addD(start, -1)) >= oldest;
  const tiles = [
    { k: '👟 Adım', v: nf(c.steps), u: onlyToday ? 'bugün' : '/gün', sub: c.stepsGoalDays + ' gün 10 bin üstü', tr: <Trend c={c.steps} p={pa.steps} /> },
    { k: '⚡ Aktif dakika', v: nf(c.azm), u: 'dk', sub: <span className="hp-goal"><span style={{ width: Math.min(100, ((c.azm || 0) / AZM_GOAL) * 100) + '%' }} /></span>, tr: <Trend c={c.azm} p={pa.azm} /> },
    { k: '😴 Uyku', v: hm(c.sleep), u: '/gece', sub: c.bed != null ? 'yatış ' + minClock(c.bed) + ' · kalkış ' + minClock(c.wake) : '', tr: <Trend c={c.sleep} p={p.sleep} /> },
    { k: '❤️ Dinlenme nabzı', v: c.rhr != null ? nf(c.rhr) : '—', u: 'bpm', sub: 'düşük olması iyi', tr: <Trend c={c.rhr} p={p.rhr} better="down" /> },
    { k: '🏋️ Antrenman', v: String(c.exCount), u: 'kez', sub: c.exMin ? hm(c.exMin) + ' toplam' : 'kayıt yok', tr: <Trend c={c.exMin || null} p={p.exMin || null} /> },
    { k: '🔥 Kalori', v: nf(c.kcal), u: 'kcal/gün', sub: c.km ? nf(c.km, 1) + ' km yol' : '', tr: <Trend c={c.kcal} p={pa.kcal} better="none" /> }
  ];
  if (c.weightLast != null || p.weightLast != null) tiles.push({ k: '⚖️ Kilo', v: c.weightLast != null ? nf(c.weightLast, 1) : '—', u: 'kg', sub: 'haftanın son ölçümü', tr: <Trend c={c.weightLast} p={p.weightLast} better="none" /> });

  return (
    <div className="hp">
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
          <div key={x.k} className="hp-tile">
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
              <span className="hp-barc">{h.steps[k] != null ? <><span className="hp-bar st" style={{ width: (h.steps[k] / maxSteps) * 100 + '%', background: h.steps[k] >= STEP_GOAL ? '#2B8A3E' : '#69DB7C' }} /><em>{nf(h.steps[k])}</em></> : <em className="muted">—</em>}</span>
              <span className="hp-barc">{s ? <><span className="hp-bar" style={{ width: (s.asleep / maxSleep) * 100 + '%', background: s.asleep >= SLEEP_GOAL ? '#7048E8' : '#B197FC' }} /><em>{Math.floor(s.asleep / 60)}:{String(Math.round(s.asleep % 60)).padStart(2, '0')}</em></> : <em className="muted">—</em>}</span>
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
                <span className="hp-exs">{[e.kcal ? e.kcal + ' kcal' : '', e.km ? nf(e.km, 1) + ' km' : '', e.hr ? 'ort. ' + e.hr + ' bpm' : '', e.azm ? e.azm + ' aktif dk' : ''].filter(Boolean).join(' · ')}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head"><h2>Tavsiyeler</h2></div>
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
