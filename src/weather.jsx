// Hava durumu kartı: telefonun konumu + Open-Meteo (ücretsiz, anahtarsız). 30 dakika önbellek.
import { useCallback, useEffect, useState } from 'react';

const CACHE = 'ajanda-wx-v1';
const LOC = 'ajanda-wx-loc';
const OPEN = 'ajanda-wx-open';
const FALLBACK = { lat: 41.0082, lon: 28.9784, place: 'İstanbul', fallback: true };

// WMO hava kodları → Türkçe ve simge
const WMO = [
  [[0], 'Açık', '☀️', '🌙'], [[1], 'Az bulutlu', '🌤️', '🌙'], [[2], 'Parçalı bulutlu', '⛅', '☁️'], [[3], 'Kapalı', '☁️', '☁️'],
  [[45, 48], 'Sisli', '🌫️', '🌫️'], [[51, 53, 55, 56, 57], 'Çiseleme', '🌦️', '🌧️'], [[61, 63, 66, 80, 81], 'Yağmurlu', '🌧️', '🌧️'],
  [[65, 67, 82], 'Kuvvetli yağmur', '🌧️', '🌧️'], [[71, 73, 75, 77, 85, 86], 'Karlı', '🌨️', '🌨️'], [[95, 96, 99], 'Gök gürültülü', '⛈️', '⛈️']
];
export function wmo(code, day = 1) {
  const m = WMO.find(([cs]) => cs.includes(code)) || WMO[2];
  return { label: m[1], icon: day ? m[2] : m[3] };
}

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* yok say */ } };

function position() {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) { no(new Error('no_geo')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => no(e),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 }
    );
  });
}

async function placeName(lat, lon) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=tr&lat=' + lat + '&lon=' + lon);
    const a = ((await r.json()) || {}).address || {};
    return a.town || a.city_district || a.county || a.suburb || a.city || a.province || '';
  } catch { return ''; }
}

async function fetchForecast(lat, lon) {
  const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(3) + '&longitude=' + lon.toFixed(3)
    + '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,precipitation'
    + '&hourly=temperature_2m,precipitation_probability,weather_code,is_day'
    + '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunset'
    + '&timezone=auto&forecast_days=2&wind_speed_unit=kmh';
  const r = await fetch(u);
  if (!r.ok) throw new Error('weather_' + r.status);
  return r.json();
}

// Bugünün kalan saatleri için tek satırlık öneri
function advice(f, now) {
  const h = f.hourly;
  const today = f.daily.time[0];
  const rest = h.time.map((t, i) => ({ t, i })).filter(({ t }) => t.startsWith(today) && new Date(t) >= new Date(now.getTime() - 3600000));
  const rain = rest.find(({ i }) => h.precipitation_probability[i] >= 50);
  const c = f.current;
  if (rain) {
    const hh = rain.t.slice(11, 13);
    const nowRain = c.precipitation > 0 || [61, 63, 65, 80, 81, 82, 95].includes(c.weather_code);
    return nowRain ? '☂️ Şu an yağışlı; şemsiyeni al.' : '☂️ ' + hh + ':00 civarı yağmur ihtimali %' + h.precipitation_probability[rain.i] + ' — şemsiye al.';
  }
  if (c.apparent_temperature <= 3) return '🧣 Hissedilen ' + Math.round(c.apparent_temperature) + '°, kalın giyin.';
  if (c.wind_speed_10m >= 35) return '💨 Rüzgâr kuvvetli (' + Math.round(c.wind_speed_10m) + ' km/s).';
  if (f.daily.temperature_2m_max[0] >= 32) return '🥵 Bugün ' + Math.round(f.daily.temperature_2m_max[0]) + '° bulacak, bol su iç.';
  const tmr = f.daily.precipitation_probability_max[1];
  if (tmr >= 60) return '🌧️ Yarın yağmur ihtimali %' + tmr + '.';
  return '';
}

export function WeatherCard({ now }) {
  const [wx, setWx] = useState(() => read(CACHE));
  const [err, setErr] = useState('');
  const [open, setOpenState] = useState(() => read(OPEN) === true);
  const setOpen = (v) => { setOpenState(v); write(OPEN, v); };

  const load = useCallback(async (force) => {
    const c = read(CACHE);
    if (!force && c && Date.now() - c.at < 30 * 60 * 1000) { setWx(c); return; }
    let loc = read(LOC);
    try {
      const p = await position();
      const moved = !loc || Math.abs(loc.lat - p.lat) > 0.05 || Math.abs(loc.lon - p.lon) > 0.05;
      loc = { ...p, place: moved ? await placeName(p.lat, p.lon) : loc.place, fallback: false };
      write(LOC, loc);
    } catch (e) {
      // İzin verilmediyse son bilinen konum, o da yoksa İstanbul
      if (!loc) loc = FALLBACK;
      if (e && e.code === 1) loc = { ...loc, denied: true };
    }
    try {
      const f = await fetchForecast(loc.lat, loc.lon);
      const v = { at: Date.now(), loc, f };
      write(CACHE, v); setWx(v); setErr('');
    } catch (e) {
      console.warn(e);
      if (!c) setErr('Hava durumu alınamadı.');
    }
  }, []);

  useEffect(() => { load(false); }, [load]);
  // Uygulamaya geri dönülünce (30 dk geçtiyse) yenile
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  if (!wx) {
    return err ? <div className="card wx wx-empty"><span>{err}</span><button type="button" className="linkbtn" onClick={() => load(true)}>Tekrar dene</button></div>
      : <div className="card wx wx-empty"><span className="hint">Hava durumu yükleniyor…</span></div>;
  }
  const { f, loc } = wx;
  const c = f.current;
  const w = wmo(c.weather_code, c.is_day);
  const tip = advice(f, now);
  const hrs = f.hourly.time.map((t, i) => ({ t, i })).filter(({ t }) => new Date(t) >= new Date(now.getTime() - 1800000)).slice(0, 8);

  return (
    <section className={'card wx' + (open ? ' open' : '')} aria-label="Hava durumu">
      <button type="button" className="wx-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="wx-icon" aria-hidden="true">{w.icon}</span>
        <span className="wx-temp">{Math.round(c.temperature_2m)}°</span>
        <span className="wx-txt">
          <span className="wx-l1">{w.label}{loc.place ? ' · ' + loc.place : ''}</span>
          <span className="wx-l2">↑{Math.round(f.daily.temperature_2m_max[0])}° ↓{Math.round(f.daily.temperature_2m_min[0])}° · yağış %{f.daily.precipitation_probability_max[0] ?? 0} · hissedilen {Math.round(c.apparent_temperature)}°</span>
        </span>
        <span className="wx-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {tip ? <span className="wx-tip">{tip}</span> : null}
      {open ? (
        <>
          <div className="wx-hours" role="list" aria-label="Saatlik tahmin">
            {hrs.map(({ t, i }) => {
              const hw = wmo(f.hourly.weather_code[i], f.hourly.is_day[i]);
              return (
                <span key={t} className="wx-h" role="listitem" aria-label={t.slice(11, 16) + ', ' + hw.label + ', ' + Math.round(f.hourly.temperature_2m[i]) + ' derece, yağış yüzde ' + f.hourly.precipitation_probability[i]}>
                  <span className="t">{t.slice(11, 13)}</span>
                  <span className="i" aria-hidden="true">{hw.icon}</span>
                  <b>{Math.round(f.hourly.temperature_2m[i])}°</b>
                  <span className={'p' + (f.hourly.precipitation_probability[i] >= 50 ? ' hi' : '')}>%{f.hourly.precipitation_probability[i]}</span>
                </span>
              );
            })}
          </div>
          <div className="wx-foot">
            <span>Rüzgâr {Math.round(c.wind_speed_10m)} km/s · yarın {Math.round(f.daily.temperature_2m_min[1])}°/{Math.round(f.daily.temperature_2m_max[1])}° {wmo(f.daily.weather_code[1]).icon}</span>
            <button type="button" className="linkbtn" onClick={() => load(true)}>Yenile</button>
          </div>
          {loc.denied || loc.fallback ? <span className="hint">Konum izni verilmediği için {loc.place || 'İstanbul'} gösteriliyor. Tarayıcı ayarlarından Ajanda'ya konum izni verebilirsin.</span> : null}
        </>
      ) : null}
    </section>
  );
}
