// Yarim → Duygu durumu: ikimizin her gün sabah/akşam 1–10 puanı. Akvaryum temalı sayfa, son 7 gün, analiz, tüm günler.
// r = Yarim (Excel'de ilk kişi), b = ben. İsimler/profil resimleri/balıklar yarim_prefs.mood içinde.
import { useMemo, useRef, useState } from 'react';
import { Sheet } from './ui.jsx';
import { Photo } from './yarim.jsx';
import { toDateInput, fromDateInput, addDays, startOfDay, daysBetween, MONTHS } from './dates.js';

const WD = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const WD_S = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const C = { r: '#E64980', b: '#1C7ED6' }; // Yarim pembe, ben mavi (Dory)
const nf1 = (v) => (v == null || Number.isNaN(v) ? '—' : v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const sgn = (v) => (v > 0.05 ? '+' + nf1(v) : v < -0.05 ? '−' + nf1(-v) : '±0');
const dm = (k) => { const d = fromDateInput(k); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); };
const mean = (a) => { const x = a.filter((v) => v != null && !Number.isNaN(v)); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };
export const face = (v) => (v == null ? '·' : v >= 9 ? '🤩' : v >= 8 ? '😄' : v >= 7 ? '😊' : v >= 6 ? '🙂' : v >= 5 ? '😐' : v >= 4 ? '😕' : '😢');
const lvl = (v) => (v == null ? 'n' : v >= 9 ? 's5' : v >= 8 ? 's4' : v >= 7 ? 's3' : v >= 6 ? 's2' : v >= 5 ? 's1' : 's0');
const val = (x, k) => (x[k] == null || x[k] === '' ? null : Number(x[k]));
export const dayAvg = (x, p) => mean([val(x, p + '_am'), val(x, p + '_pm')]);
const firstName = (s, fb) => { const w = String(s || '').trim().split(/\s+/)[0]; return w ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR') : fb; };
export const moodNames = (prefs) => { const m = (prefs && prefs.mood) || {}; return { r: (m.names && m.names.r) || 'Yarim', b: (m.names && m.names.b) || 'Ben' }; };

// ---------- Excel'den içe aktarma (Duygu_Durum.xlsx düzeni) ----------
export async function parseMoodExcel(file) {
  const { default: readXlsx } = await import('read-excel-file/browser');
  const sheets = await readXlsx(file); // [{ sheet, data }]
  const sh = (Array.isArray(sheets) && sheets[0] && sheets[0].data ? sheets : [{ data: sheets }]).find((x) => (x.data || []).some((r) => String(r[0] || '').trim().toLocaleLowerCase('tr-TR') === 'tarih'));
  const rows = sh ? sh.data : [];
  const h = rows.findIndex((r) => String(r[0] || '').trim().toLocaleLowerCase('tr-TR') === 'tarih');
  if (h < 0) throw new Error('"Tarih" başlığı bulunamadı. Duygu durumu Excel\'ini seç.');
  const hdr = rows[h];
  const e = hdr.findIndex((v, i) => i > 0 && String(v || '').trim().toLocaleLowerCase('tr-TR') === 'tarih');
  const ev = e > 0 ? e : 4;
  const key = (d) => (d instanceof Date ? d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') : null);
  const num = (v) => { if (v == null || String(v).trim() === '') return null; const n = Math.round(Number(String(v).replace(',', '.'))); return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null; };
  const out = new Map();
  let blank = 0;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i];
    const k = key(r[0]) || key(r[ev]);
    if (!k) { if (r.every((v) => v == null || String(v).trim() === '')) { if (++blank > 3) break; continue; } break; }
    blank = 0;
    const note = String(r[ev + 3] == null ? '' : r[ev + 3]).trim();
    out.set(k, { day: k, r_am: num(r[1]), b_am: num(r[2]), r_pm: num(r[ev + 1]), b_pm: num(r[ev + 2]), note: note || null });
  }
  if (!out.size) throw new Error('Excel\'de gün bulunamadı.');
  return { rows: [...out.values()], names: { r: firstName(hdr[1], 'Yarim'), b: firstName(hdr[2], 'Ben') }, images: await moodImages(file) };
}

// Excel'deki resimler: yan yana iki resim → profil resimleri; 3B modellerin (balıklar) resimleri → akvaryum
async function moodImages(file) {
  try {
    const { unzipSync, strFromU8 } = await import('fflate');
    const buf = new Uint8Array(await file.arrayBuffer());
    const z = unzipSync(buf, { filter: (f) => /^xl\/(media\/image|drawings\/)/.test(f.name) });
    const dName = Object.keys(z).find((n) => /^xl\/drawings\/drawing\d+\.xml$/.test(n));
    if (!dName) return { avatars: [], fish: [] };
    const xml = strFromU8(z[dName]);
    const relsXml = z[dName.replace('drawings/', 'drawings/_rels/') + '.rels'] ? strFromU8(z[dName.replace('drawings/', 'drawings/_rels/') + '.rels']) : '';
    const rel = {};
    relsXml.replace(/<Relationship\b([^>]*)\/?>/g, (_, a) => { const id = (a.match(/Id="([^"]+)"/) || [])[1]; const t = (a.match(/Target="([^"]+)"/) || [])[1]; if (id && t) rel[id] = 'xl/' + t.replace(/^\.\.\//, ''); return ''; });
    const pics = [];
    xml.replace(/<xdr:(twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/xdr:\1>/g, (_, __, body) => {
      const col = Number((body.match(/<xdr:from>\s*<xdr:col>(\d+)<\/xdr:col>/) || [])[1] || 0);
      const row = Number((body.match(/<xdr:row>(\d+)<\/xdr:row>/) || [])[1] || 0);
      const emb = (body.match(/r:embed="([^"]+)"/) || [])[1];
      const path = emb && rel[emb];
      if (path && z[path] && /\.(png|jpe?g)$/i.test(path)) pics.push({ col, row, path, model: /model3d|am3d/i.test(body), ext: /\.png$/i.test(path) ? 'png' : 'jpg' });
      return '';
    });
    const blob = (p) => ({ blob: new Blob([z[p.path]], { type: p.ext === 'png' ? 'image/png' : 'image/jpeg' }), ext: p.ext });
    const flat = pics.filter((p) => !p.model);
    const byRow = {};
    flat.forEach((p) => { (byRow[p.row] = byRow[p.row] || []).push(p); });
    const pair = Object.values(byRow).find((g) => g.length === 2);
    const avatars = pair ? pair.sort((a, b) => a.col - b.col).map(blob) : [];
    const seen = new Set();
    const fish = pics.filter((p) => p.model && !seen.has(p.path) && seen.add(p.path)).map(blob);
    return { avatars, fish };
  } catch (e) { console.warn('mood images', e); return { avatars: [], fish: [] }; }
}

// ---------- Hesaplar ----------
function useStats(moods, now) {
  return useMemo(() => {
    const asc = [...(moods || [])].sort((a, b) => a.day.localeCompare(b.day));
    const desc = [...asc].reverse();
    const todayK = toDateInput(now);
    const since = (n) => { const k = toDateInput(addDays(startOfDay(now), -n)); return asc.filter((x) => x.day > k); };
    const per = (p) => {
      const all = asc.map((x) => dayAvg(x, p));
      const last7 = desc.slice(0, 7).map((x) => dayAvg(x, p)), prev7 = desc.slice(7, 14).map((x) => dayAvg(x, p));
      const wd = Array.from({ length: 7 }, (_, i) => { const v = asc.filter((x) => fromDateInput(x.day).getDay() === i).map((x) => dayAvg(x, p)).filter((v) => v != null); return v.length >= 2 ? mean(v) : null; });
      const ranked = wd.map((v, i) => ({ v, i })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
      return {
        all: mean(all), d30: mean(since(30).map((x) => dayAvg(x, p))), w: mean(last7), pw: mean(prev7),
        am: mean(asc.map((x) => val(x, p + '_am'))), pm: mean(asc.map((x) => val(x, p + '_pm'))),
        shift: mean(asc.map((x) => (val(x, p + '_am') != null && val(x, p + '_pm') != null ? val(x, p + '_pm') - val(x, p + '_am') : null))),
        wd, best: ranked[0], worst: ranked[ranked.length - 1], tens: asc.filter((x) => val(x, p + '_am') === 10 || val(x, p + '_pm') === 10).length
      };
    };
    const both = asc.filter((x) => dayAvg(x, 'r') != null && dayAvg(x, 'b') != null);
    const sum = (x) => (dayAvg(x, 'r') || 0) + (dayAvg(x, 'b') || 0);
    const happiest = both.length ? [...both].sort((a, b) => sum(b) - sum(a) || b.day.localeCompare(a.day))[0] : null;
    const months = {};
    asc.forEach((x) => { const k = x.day.slice(0, 7); (months[k] = months[k] || []).push(x); });
    const monthList = Object.entries(months).map(([k, l]) => ({ k, n: l.length, r: mean(l.map((x) => dayAvg(x, 'r'))), b: mean(l.map((x) => dayAvg(x, 'b'))), list: l }));
    return {
      asc, desc, today: asc.find((x) => x.day === todayK) || null, last: desc[0] || null,
      first: asc[0] || null, r: per('r'), b: per('b'), monthList,
      sync: both.length ? both.filter((x) => Math.abs(dayAvg(x, 'r') - dayAvg(x, 'b')) <= 1).length / both.length : null,
      bothHigh: both.filter((x) => dayAvg(x, 'r') >= 9 && dayAvg(x, 'b') >= 9).length, happiest
    };
  }, [moods, now]);
}

// ---------- Küçük parçalar ----------
function Avatar({ path, getUrl, who, name, size = 64, onPick }) {
  const inp = useRef(null);
  const body = path ? <Photo path={path} getUrl={getUrl} className="md-av-img" alt={name} /> : <span className="md-av-ph" aria-hidden="true" style={{ fontSize: Math.round(size * 0.55) }}>{who === 'r' ? '👸' : '🐱'}</span>;
  return (
    <span className={'md-av ' + who} style={{ width: size, height: size }}>
      {onPick ? (
        <>
          <button type="button" className="md-av-btn" onClick={() => inp.current && inp.current.click()} aria-label={name + ' profil resmini değiştir'} title="Resmi değiştir">{body}</button>
          <input ref={inp} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onPick(f); }} />
        </>
      ) : body}
    </span>
  );
}
function Score({ v, big }) {
  return <span className={'md-sc ' + lvl(v) + (big ? ' big' : '')}>{v == null ? '–' : v}</span>;
}

function DayTable({ rows, names, onOpen, prefs, getUrl, compact }) {
  const m = (prefs && prefs.mood) || {};
  return (
    <div className={'md-tbl' + (compact ? ' compact' : '')} role="table" aria-label="Günlük puanlar">
      <div className="md-tr head" role="row">
        <span role="columnheader">Gün</span>
        <span role="columnheader" className="md-th r"><Avatar path={m.avatars && m.avatars.r} getUrl={getUrl} who="r" name={names.r} size={22} />{names.r}</span>
        <span role="columnheader" className="md-th b"><Avatar path={m.avatars && m.avatars.b} getUrl={getUrl} who="b" name={names.b} size={22} />{names.b}</span>
        <span role="columnheader" className="md-note-h">Not</span>
      </div>
      <div className="md-tr sub" role="row"><span /><span className="md-ap"><i>☀️ Sabah</i><i>🌙 Akşam</i></span><span className="md-ap"><i>☀️ Sabah</i><i>🌙 Akşam</i></span><span className="md-note-h" /></div>
      {rows.map((x) => {
        const d = fromDateInput(x.day);
        return (
          <button key={x.id || x.day} type="button" className="md-tr" role="row" onClick={() => onOpen(x)}>
            <span className="md-day"><b>{d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}</b><small>{WD_S[d.getDay()]}</small></span>
            <span className="md-ap"><Score v={val(x, 'r_am')} /><Score v={val(x, 'r_pm')} /></span>
            <span className="md-ap"><Score v={val(x, 'b_am')} /><Score v={val(x, 'b_pm')} /></span>
            <span className="md-note">{x.note || ''}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Trend grafiği (günlük ortalama + 7 kayıt ortalaması, üzerine gelince detay) ----------
function Trend({ asc, names }) {
  const [range, setRange] = useState(() => { try { return localStorage.getItem('ajanda-md-range') || '60'; } catch { return '60'; } });
  const [hov, setHov] = useState(null);
  const box = useRef(null);
  const list = range === 'all' ? asc : asc.slice(-Number(range));
  const n = list.length;
  const W = 1000, H = 240, P = 8;
  const X = (i) => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1));
  const Y = (v) => H - (v / 10) * H;
  const line = (arr) => { let d = ''; arr.forEach((v, i) => { if (v == null) return; d += (d && arr[i - 1] != null ? ' L' : ' M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }); return d.trim(); };
  const ma = (p) => list.map((_, i) => mean(list.slice(Math.max(0, i - 6), i + 1).map((x) => dayAvg(x, p))));
  const raw = (p) => list.map((x) => dayAvg(x, p));
  const ticks = n ? [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i) : [];
  const onMove = (e) => {
    const r = box.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setHov(Math.max(0, Math.min(n - 1, Math.round(((x - P) / (W - 2 * P)) * (n - 1)))));
  };
  const hx = hov != null ? list[hov] : null;
  const set = (v) => { setRange(v); setHov(null); try { localStorage.setItem('ajanda-md-range', v); } catch { /* yok say */ } };
  return (
    <div className="card md-card">
      <div className="md-card-h">
        <b>Gidişat</b>
        <div className="seg md-seg" role="group" aria-label="Dönem">
          {[['30', '30 gün'], ['60', '60 gün'], ['all', 'Tümü']].map(([k, l]) => <button key={k} type="button" className={range === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}
        </div>
      </div>
      <div className="md-legend"><span><i style={{ background: C.r }} />{names.r}</span><span><i style={{ background: C.b }} />{names.b}</span><span className="muted">Kalın çizgi: son 7 kaydın ortalaması · noktalar: günlük ortalama</span></div>
      {n ? (
        <div className="md-chart" ref={box} onPointerMove={onMove} onPointerLeave={() => setHov(null)}>
          {[10, 8, 6, 4, 2].map((g) => <span key={g} className="md-grid" style={{ bottom: (g / 10) * 100 + '%' }}><em>{g}</em></span>)}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {['r', 'b'].map((p) => <path key={p + 'm'} d={line(ma(p))} stroke={C[p]} strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
            {hov != null ? <line x1={X(hov)} x2={X(hov)} y1="0" y2={H} stroke="rgba(0,0,0,.25)" strokeWidth="1" vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {['r', 'b'].map((p) => raw(p).map((v, i) => (v == null ? null : <i key={p + i} className={'md-dot ' + p + (hov === i ? ' on' : '')} style={{ left: (X(i) / W) * 100 + '%', bottom: (v / 10) * 100 + '%' }} />)))}
          {hx ? (
            <div className={'md-tip' + (hov > n * 0.6 ? ' left' : '')} style={{ left: (X(hov) / W) * 100 + '%' }}>
              <b>{dm(hx.day)} · {WD[fromDateInput(hx.day).getDay()]}</b>
              <span><i style={{ background: C.r }} />{names.r}: {val(hx, 'r_am') ?? '–'} → {val(hx, 'r_pm') ?? '–'}</span>
              <span><i style={{ background: C.b }} />{names.b}: {val(hx, 'b_am') ?? '–'} → {val(hx, 'b_pm') ?? '–'}</span>
              {hx.note ? <em>📝 {hx.note}</em> : null}
            </div>
          ) : null}
          <div className="md-x">{ticks.map((i) => <span key={i} style={{ left: (X(i) / W) * 100 + '%' }}>{dm(list[i].day)}</span>)}</div>
        </div>
      ) : <p className="empty">Henüz kayıt yok.</p>}
    </div>
  );
}

function Months({ monthList, names }) {
  const list = monthList.slice(-8);
  return (
    <div className="card md-card">
      <div className="md-card-h"><b>Aylara göre ortalama</b></div>
      <div className="md-months">
        {list.map((m) => {
          const [y, mo] = m.k.split('-').map(Number);
          return (
            <div key={m.k} className="md-month" title={MONTHS[mo - 1] + ' ' + y + ' · ' + m.n + ' gün'}>
              <div className="md-bars">
                {['r', 'b'].map((p) => <span key={p} className="md-bar" style={{ height: ((m[p] || 0) / 10) * 100 + '%', background: C[p] }}><em>{nf1(m[p])}</em></span>)}
              </div>
              <small>{MONTHS[mo - 1].slice(0, 3)}{mo === 1 || m === list[0] ? ' ' + String(y).slice(2) : ''}</small>
            </div>
          );
        })}
      </div>
      <div className="md-legend"><span><i style={{ background: C.r }} />{names.r}</span><span><i style={{ background: C.b }} />{names.b}</span></div>
    </div>
  );
}

function Weekdays({ s, names }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="card md-card">
      <div className="md-card-h"><b>Haftanın günleri</b></div>
      <div className="md-wd">
        <span /><span className="md-wd-h" style={{ color: C.r }}>{names.r}</span><span className="md-wd-h" style={{ color: C.b }}>{names.b}</span>
        {order.map((i) => (
          <span key={i} className="md-wd-row">
            <span className="md-wd-d">{WD[i]}</span>
            {['r', 'b'].map((p) => <span key={p} className={'md-wd-v ' + lvl(s[p].wd[i])}>{s[p].wd[i] == null ? '—' : nf1(s[p].wd[i])}</span>)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- Sayfa ----------
export function MoodView({ data, now, actions, prefs, photoUrl }) {
  const s = useStats(data.moods, now);
  const names = moodNames(prefs);
  const m = (prefs && prefs.mood) || {};
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef(null);
  const todayK = toDateInput(now);
  const ref = s.today || s.last;
  const todayFull = s.today && ['r_am', 'r_pm', 'b_am', 'b_pm'].every((k) => val(s.today, k) != null);
  const fish = (m.fish || []);
  const school = fish.find((f) => f.wide);
  const small = fish.filter((f) => !f.wide);
  const days = s.first ? daysBetween(fromDateInput(s.first.day), startOfDay(now)) + 1 : 0;

  const person = (p) => {
    const st = s[p];
    const trend = st.w != null && st.pw != null ? st.w - st.pw : null;
    return (
      <div className={'md-p ' + p}>
        <Avatar path={m.avatars && m.avatars[p]} getUrl={photoUrl} who={p} name={names[p]} size={72} onPick={(f) => actions.setMoodAvatar(p, f)} />
        <div className="md-p-txt">
          <b className="md-p-n">{names[p]}</b>
          {ref ? (
            <span className="md-p-now">
              <span title="Sabah">☀️ <Score v={val(ref, p + '_am')} big /></span>
              <span title="Akşam">🌙 <Score v={val(ref, p + '_pm')} big /></span>
              <span className="md-face" aria-hidden="true">{face(dayAvg(ref, p))}</span>
            </span>
          ) : null}
          <small>{st.w != null ? 'Bu hafta ort. ' + nf1(st.w) : ''}{trend != null && Math.abs(trend) >= 0.1 ? ' · ' + (trend > 0 ? '▲ ' : '▼ ') + nf1(Math.abs(trend)) + ' önceki haftaya göre' : ''}</small>
        </div>
      </div>
    );
  };

  return (
    <div className="md">
      <div className="md-hero">
        <span className="md-bubbles" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
        {school ? <Photo path={school.path} getUrl={photoUrl} className="md-school" alt="" /> : null}
        {small.length ? small.slice(0, 3).map((f, i) => <Photo key={f.path} path={f.path} getUrl={photoUrl} className={'md-fish f' + i} alt="" />)
          : <><span className="md-fish e f0" aria-hidden="true">🐠</span><span className="md-fish e f1" aria-hidden="true">🐟</span></>}
        <div className="md-hero-top">
          <div>
            <h2>Duygu durumu</h2>
            <p>{s.asc.length ? days + ' gündür birlikte takip · ' + s.asc.length + ' kayıt · ' + (s.today ? 'bugün girildi' : 'son kayıt ' + dm(s.last.day)) : 'Her gün sabah ve akşam 1–10 arası puan verin.'}</p>
          </div>
          <button type="button" className="btn md-add" onClick={() => actions.openMood(s.today || { day: todayK })}>{todayFull ? 'Bugünü düzenle' : s.today ? '🌙 Akşamı gir' : '+ Bugünü gir'}</button>
        </div>
        {s.asc.length ? <div className="md-people">{person('r')}{person('b')}</div> : null}
        {ref && ref.note ? <p className="md-hero-note">📝 {ref.note}</p> : null}
      </div>

      {!s.asc.length ? (
        <div className="card md-empty">
          <p><b>Excel'deki tüm günleri tek seferde aktar.</b> Duygu_Durum.xlsx dosyasını seç; tarihler, puanlar, notlar, profil resimleri ve balıklar gelir.</p>
          <button type="button" className="btn primary big" onClick={() => fileRef.current && fileRef.current.click()}>📥 Excel'den içe aktar</button>
        </div>
      ) : (
        <>
          <section className="md-sec">
            <h3>Son 7 gün</h3>
            <DayTable rows={s.desc.slice(0, 7)} names={names} onOpen={actions.openMood} prefs={prefs} getUrl={photoUrl} />
          </section>

          <section className="md-sec">
            <h3>Analiz</h3>
            <div className="md-facts">
              {['r', 'b'].map((p) => (
                <div key={p} className={'md-fact ' + p}>
                  <span>{names[p]} · son 30 gün</span>
                  <b>{nf1(s[p].d30)} <em>{face(s[p].d30)}</em></b>
                  <small>Tüm zamanlar {nf1(s[p].all)} · sabah {nf1(s[p].am)}, akşam {nf1(s[p].pm)}</small>
                  <small>Gün içinde {s[p].shift == null ? '—' : sgn(s[p].shift)}{s[p].best ? ' · en iyi gün ' + WD[s[p].best.i] : ''}{s[p].tens ? ' · ' + s[p].tens + ' kez 10 🔟' : ''}</small>
                </div>
              ))}
              <div className="md-fact both">
                <span>Birlikte</span>
                <b>{s.sync == null ? '—' : '%' + Math.round(s.sync * 100)} <em>💞</em></b>
                <small>Günlerin bu kadarında puanlarınız arasında en fazla 1 fark var.</small>
                <small>{s.bothHigh ? 'İkinizin de 9+ olduğu ' + s.bothHigh + ' gün' : ''}{s.happiest ? (s.bothHigh ? ' · ' : '') + 'en mutlu gün ' + dm(s.happiest.day) + (s.happiest.note ? ' (' + s.happiest.note + ')' : '') : ''}</small>
              </div>
            </div>
            <Trend asc={s.asc} names={names} />
            <div className="md-two">
              <Months monthList={s.monthList} names={names} />
              <Weekdays s={s} names={names} />
            </div>
          </section>

          <section className="md-sec">
            <div className="md-sec-h">
              <h3>Tüm günler · {s.asc.length}</h3>
              <button type="button" className="linkbtn" onClick={() => setShowAll(!showAll)}>{showAll ? 'Gizle' : 'Göster'}</button>
            </div>
            {showAll ? [...s.monthList].reverse().map((mo, i) => {
              const [y, mm] = mo.k.split('-').map(Number);
              return (
                <details key={mo.k} className="md-mo" open={i === 0}>
                  <summary>
                    <b>{MONTHS[mm - 1]} {y}</b><small>{mo.n} gün</small>
                    <span className="md-mo-avg"><i style={{ background: C.r }} />{nf1(mo.r)}<i style={{ background: C.b }} />{nf1(mo.b)}</span>
                  </summary>
                  <DayTable rows={[...mo.list].reverse()} names={names} onOpen={actions.openMood} prefs={prefs} getUrl={photoUrl} compact />
                </details>
              );
            }) : null}
          </section>

          <div className="md-foot">
            <button type="button" className="btn" onClick={() => fileRef.current && fileRef.current.click()}>📥 Excel'den içe aktar</button>
            <button type="button" className="btn" onClick={() => actions.exportMoods()}>⬇ Excel'e aktar</button>
            <span className="hint">İçe aktarmada aynı günler güncellenir, yeni günler eklenir. Profil resmini değiştirmek için resme dokun.</span>
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) actions.importMoods(f); }} />
    </div>
  );
}

// Yarim özetinde küçük kart
export function MoodMini({ data, now, prefs, photoUrl, onOpen, onGo }) {
  const s = useStats(data.moods, now);
  const names = moodNames(prefs);
  const m = (prefs && prefs.mood) || {};
  const ref = s.today || s.last;
  return (
    <div className="card md-mini">
      <button type="button" className="md-mini-main" onClick={onGo}>
        <span className="md-mini-t">🐠 Duygu durumu{ref ? <small>{s.today ? 'bugün' : dm(ref.day)}</small> : null}</span>
        {ref ? (
          <span className="md-mini-p">
            {['r', 'b'].map((p) => (
              <span key={p}><Avatar path={m.avatars && m.avatars[p]} getUrl={photoUrl} who={p} name={names[p]} size={28} /><Score v={val(ref, p + '_am')} /><Score v={val(ref, p + '_pm')} /></span>
            ))}
          </span>
        ) : <span className="muted">Henüz kayıt yok</span>}
      </button>
      <button type="button" className="btn" onClick={() => onOpen(s.today || { day: toDateInput(now) })}>{s.today ? 'Düzenle' : '+ Bugün'}</button>
    </div>
  );
}

// ---------- Gün girişi ----------
function Picker({ value, onChange, label }) {
  return (
    <div className="md-pick" role="radiogroup" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} className={'md-pk ' + (value === n ? 'on ' + lvl(n) : '')} onClick={() => onChange(value === n ? null : n)}>{n}</button>
      ))}
    </div>
  );
}
export function MoodSheet({ initial, moods, prefs, onClose, onSave, onDelete }) {
  const names = moodNames(prefs);
  const [day, setDay] = useState(initial.day || toDateInput(new Date()));
  const existing = (moods || []).find((x) => x.day === day);
  const base = initial.id ? initial : existing || {};
  const [v, setV] = useState(() => ({ r_am: val(base, 'r_am'), r_pm: val(base, 'r_pm'), b_am: val(base, 'b_am'), b_pm: val(base, 'b_pm'), note: base.note || '' }));
  const [busy, setBusy] = useState(false);
  const changeDay = (d) => {
    setDay(d);
    const ex = (moods || []).find((x) => x.day === d);
    if (ex) setV({ r_am: val(ex, 'r_am'), r_pm: val(ex, 'r_pm'), b_am: val(ex, 'b_am'), b_pm: val(ex, 'b_pm'), note: ex.note || '' });
  };
  const rec = initial.id || existing ? (initial.id ? initial : existing) : null;
  const empty = ['r_am', 'r_pm', 'b_am', 'b_pm'].every((k) => v[k] == null) && !v.note.trim();
  const submit = async (e) => {
    e.preventDefault();
    if (busy || empty) return;
    setBusy(true);
    try { await onSave({ ...(rec && rec.day === day ? { id: rec.id } : {}), day, r_am: v.r_am, r_pm: v.r_pm, b_am: v.b_am, b_pm: v.b_pm, note: v.note.trim() || null }); }
    finally { setBusy(false); }
  };
  const block = (p) => (
    <div className={'md-blk ' + p}>
      <b className="md-blk-n">{names[p]}</b>
      <span className="md-blk-l">☀️ Sabah {v[p + '_am'] != null ? face(v[p + '_am']) : ''}</span>
      <Picker value={v[p + '_am']} onChange={(n) => setV({ ...v, [p + '_am']: n })} label={names[p] + ' sabah'} />
      <span className="md-blk-l">🌙 Akşam {v[p + '_pm'] != null ? face(v[p + '_pm']) : ''}</span>
      <Picker value={v[p + '_pm']} onChange={(n) => setV({ ...v, [p + '_pm']: n })} label={names[p] + ' akşam'} />
    </div>
  );
  return (
    <Sheet title={rec && rec.day === day ? 'Günü düzenle' : 'Bugün nasılsınız?'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field"><label htmlFor="md-day">Gün</label><input id="md-day" type="date" value={day} onChange={(e) => changeDay(e.target.value)} required /></div>
        {block('r')}
        {block('b')}
        <div className="field"><label htmlFor="md-note">Not (isteğe bağlı)</label><input id="md-note" type="text" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="Ör. 200. gün 💖" /></div>
        <p className="hint" style={{ margin: 0 }}>Sabahı şimdi, akşamı sonra girebilirsin; boş kalanlar sonra doldurulur. Seçili puana tekrar dokunmak siler.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          {rec && rec.day === day ? <button type="button" className="linkbtn" style={{ color: 'var(--danger)' }} onClick={() => onDelete(rec)}>Günü sil</button> : <span />}
          <button type="submit" className="btn big primary" disabled={busy || empty}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// Profil resmi: telefondan seçilen fotoğrafı küçült (kare, 480 px JPEG)
export async function shrinkSquare(file, max = 480) {
  const bm = await createImageBitmap(file);
  const s = Math.min(bm.width, bm.height);
  const c = document.createElement('canvas');
  c.width = c.height = Math.min(max, s);
  c.getContext('2d').drawImage(bm, (bm.width - s) / 2, (bm.height - s) / 2, s, s, 0, 0, c.width, c.height);
  if (bm.close) bm.close();
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', 0.88));
}
