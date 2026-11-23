// Google Health (Fitbit Air): Bugün sayfasında uyku ve adım özeti
import { useCallback, useEffect, useState } from 'react';
import { supabase, DEMO } from './supabase.js';

const CACHE = 'ajanda-health-v1';
const FRESH = 20 * 60000;
const DAY = 86400000;
export const STEP_GOAL = 10000;

const ymdLocal = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function demoHealth() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const steps = {}, sleep = {};
  const st = [8120, 10450, 6230, 9310, 12040, 7480, 4230];
  const sl = [412, 455, 388, 471, 430, 395, 422];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(t.getTime() - i * DAY);
    const k = ymdLocal(d);
    steps[k] = st[6 - i];
    const asleep = sl[6 - i];
    const end = new Date(d.getTime() + 7 * 3600000 + 10 * 60000);
    const start = new Date(end.getTime() - (asleep + 38) * 60000);
    sleep[k] = { day: k, start: start.toISOString(), end: end.toISOString(), asleep, inBed: asleep + 38, awake: 38, stages: { deep: Math.round(asleep * 0.18), rem: Math.round(asleep * 0.22), light: Math.round(asleep * 0.6), awake: 38 }, main: true, naps: 0 };
  }
  return { connected: true, at: new Date().toISOString(), today: ymdLocal(t), steps, sleep, errors: {} };
}

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
  const v = await call('');
  if (!v.error || v.connected === false) { try { localStorage.setItem(CACHE, JSON.stringify({ got: Date.now(), v })); } catch { /* yok say */ } }
  return v;
}
export function clearHealthCache() { try { localStorage.removeItem(CACHE); } catch { /* yok say */ } }

// Google izin sayfasına git (ayrı izin; Takvim bağlantısını etkilemez)
export async function connectHealth() {
  if (DEMO) return { error: 'Örnek modda bağlanamaz.' };
  const j = await call('?action=url');
  if (j.url) { clearHealthCache(); window.location.href = j.url; return { ok: true }; }
  return j;
}
export async function disconnectHealth() {
  clearHealthCache();
  return call('?action=disconnect', { method: 'POST' });
}

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

const hm = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + ' sa ' + (m ? m + ' dk' : '') : m + ' dk'; };
const clock = (iso) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const WD = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
const STAGES = [['deep', 'Derin', '#3B5BDB'], ['light', 'Hafif', '#74C0FC'], ['rem', 'REM', '#9775FA'], ['awake', 'Uyanık', '#FFA94D']];

export function HealthCard({ state, now }) {
  const { health: h, busy, reload } = state || {};
  if (!h || h.connected === false) return null;
  if (h.expired || (h.error && !h.steps)) {
    return (
      <section className="card hl hl-warn">
        <span>❤️ {h.error || 'Google Health verisi alınamadı.'}</span>
        {h.expired ? <button type="button" className="btn" onClick={() => connectHealth()}>Yeniden bağla</button> : <button type="button" className="linkbtn" onClick={reload}>Tekrar dene</button>}
      </section>
    );
  }
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  const keys = Array.from({ length: 7 }, (_, i) => ymdLocal(new Date(t.getTime() - (6 - i) * DAY)));
  const T = keys[6], Y = keys[5];
  const steps = h.steps || {};
  const sleep = h.sleep || {};
  const night = sleep[T] || sleep[Y];
  const nightLabel = sleep[T] ? 'Dün gece' : sleep[Y] ? 'Önceki gece' : '';
  const sToday = steps[T];
  const stMax = Math.max(STEP_GOAL, ...keys.map((k) => steps[k] || 0));
  const slMax = Math.max(480, ...keys.map((k) => (sleep[k] ? sleep[k].asleep : 0)));
  const avgSleep = (() => { const xs = keys.map((k) => sleep[k]).filter(Boolean); return xs.length ? xs.reduce((a, x) => a + x.asleep, 0) / xs.length : 0; })();
  const avgSteps = (() => { const xs = keys.slice(0, 6).map((k) => steps[k]).filter((v) => v != null); return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : 0; })();
  const stTotal = night ? STAGES.reduce((a, [k]) => a + (night.stages[k] || 0), 0) : 0;
  return (
    <section className="card hl" aria-label="Sağlık: uyku ve adım">
      <div className="hl-half hl-sleep">
        <span className="hl-k">😴 Uyku{nightLabel ? ' · ' + nightLabel.toLocaleLowerCase('tr-TR') : ''}</span>
        {night ? (
          <>
            <span className="hl-big">{hm(night.asleep)}</span>
            <span className="hl-sub">{clock(night.start)} → {clock(night.end)}{avgSleep ? ' · ort. ' + hm(avgSleep) : ''}</span>
            {stTotal ? (
              <span className="hl-stages" role="img" aria-label={STAGES.filter(([k]) => night.stages[k]).map(([k, l]) => l + ' ' + hm(night.stages[k])).join(', ')}>
                {STAGES.map(([k, l, c]) => (night.stages[k] ? <span key={k} title={l + ' ' + hm(night.stages[k])} style={{ flex: night.stages[k], background: c }} /> : null))}
              </span>
            ) : null}
            {stTotal ? <span className="hl-legend">{STAGES.filter(([k]) => k !== 'awake' && night.stages[k]).map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l} {hm(night.stages[k])}</span>)}</span> : null}
          </>
        ) : <span className="hl-sub">{h.errors && h.errors.sleep ? 'Uyku alınamadı: ' + h.errors.sleep : 'Son iki gece için uyku kaydı yok.'}</span>}
        <span className="hl-bars" aria-hidden="true">
          {keys.map((k, i) => <span key={k} className={i === 6 ? 'on' : ''} title={sleep[k] ? hm(sleep[k].asleep) : ''}><b style={{ height: sleep[k] ? Math.max(8, (sleep[k].asleep / slMax) * 100) + '%' : 0, background: '#7048E8' }} /><em>{WD[new Date(k + 'T12:00').getDay()]}</em></span>)}
        </span>
      </div>
      <div className="hl-half hl-steps">
        <span className="hl-k">👟 Adım · bugün</span>
        {sToday != null ? (
          <>
            <span className="hl-big">{sToday.toLocaleString('tr-TR')}</span>
            <span className="hl-sub">{steps[Y] != null ? 'dün ' + steps[Y].toLocaleString('tr-TR') : ''}{avgSteps ? (steps[Y] != null ? ' · ' : '') + 'ort. ' + Math.round(avgSteps).toLocaleString('tr-TR') : ''}</span>
            <span className="hl-goal" aria-label={'Günlük hedef ' + STEP_GOAL.toLocaleString('tr-TR') + ' adım, yüzde ' + Math.round((sToday / STEP_GOAL) * 100)}><span style={{ width: Math.min(100, (sToday / STEP_GOAL) * 100) + '%' }} /></span>
          </>
        ) : <span className="hl-sub">{h.errors && h.errors.steps ? 'Adım alınamadı: ' + h.errors.steps : 'Bugün için adım verisi henüz gelmedi.'}</span>}
        <span className="hl-bars" aria-hidden="true">
          {keys.map((k, i) => <span key={k} className={i === 6 ? 'on' : ''} title={steps[k] != null ? steps[k].toLocaleString('tr-TR') : ''}><b style={{ height: steps[k] ? Math.max(6, (steps[k] / stMax) * 100) + '%' : 0, background: (steps[k] || 0) >= STEP_GOAL ? '#2B8A3E' : '#40C057' }} /><em>{WD[new Date(k + 'T12:00').getDay()]}</em></span>)}
        </span>
      </div>
      <button type="button" className="hl-re" onClick={reload} disabled={busy} aria-label="Sağlık verisini yenile">{busy ? '…' : '↻'}</button>
    </section>
  );
}
