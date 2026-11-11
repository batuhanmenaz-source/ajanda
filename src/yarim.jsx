// Yarim sayfası: Özet · Anılar · Sevdikleri · Hediyeler · Planlar (+ sürpriz hatırlatıcısı)
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Sheet, Section, Check } from './ui.jsx';
import { SubTabs } from './areas.jsx';
import { YarimPanel } from './screens.jsx';
import { LocationField } from './sheets.jsx';
import { tl, parseTL } from './revenue.jsx';
import { mapsLink, mapsTarget } from './location.js';
import { specialUpcoming, specialLabel, SPECIAL_ICON } from './special.js';
import { addDays, startOfDay, toDateInput, fromDateInput, fmtShort, daysBetween, MONTHS } from './dates.js';

export const YARIM_TABS = [['ozet', 'Özet'], ['anilar', 'Anılar'], ['sevdikleri', 'Sevdikleri'], ['hediyeler', 'Hediye fikirleri'], ['planlar', 'Birlikte yapılacaklar']];
export const LIKE_CATS = ['Çiçek', 'Renk', 'Kahve / içecek', 'Yemek', 'Tatlı', 'Restoran', 'Marka', 'Parfüm', 'Beden / numara', 'Yüzük ölçüsü', 'Hobi', 'Müzik / sanatçı', 'Diğer'];
const LIKE_ICON = { 'Çiçek': '🌷', 'Renk': '🎨', 'Kahve / içecek': '☕', 'Yemek': '🍝', 'Tatlı': '🍰', 'Restoran': '🍽️', 'Marka': '🛍️', 'Parfüm': '🌸', 'Beden / numara': '👗', 'Yüzük ölçüsü': '💍', 'Hobi': '🎯', 'Müzik / sanatçı': '🎵', 'Diğer': '✨' };
export const PLAN_CATS = ['Yer', 'Restoran', 'Film / dizi', 'Etkinlik', 'Tatil', 'Diğer'];
const PLAN_ICON = { 'Yer': '📍', 'Restoran': '🍽️', 'Film / dizi': '🎬', 'Etkinlik': '🎟️', 'Tatil': '✈️', 'Diğer': '✨' };

export const DEFAULT_SURPRISE_IDEAS = ['Çiçek al 🌷', 'Sevdiği tatlıdan götür 🍰', 'Küçük bir not bırak 💌', 'Sürpriz akşam yemeği planla 🍽️', 'Sevdiği kahveyi götür ☕', 'Küçük bir hediye al 🎁', 'Birlikte yürüyüşe çık 🌙'];
export const SURPRISE_PREFIX = '🌷 Sürpriz zamanı: ';

// ---------- Yardımcılar ----------
const yearsAgo = (dayKey, now) => {
  const d = fromDateInput(dayKey);
  const n = now.getFullYear() - d.getFullYear();
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && n > 0 ? n : 0;
};
export function memoriesToday(memories, now) {
  return (memories || []).map((m) => ({ m, n: yearsAgo(m.day, now) })).filter((x) => x.n > 0);
}
const ago = (dayKey, now) => {
  const d = fromDateInput(dayKey);
  const days = daysBetween(d, startOfDay(now));
  if (days < 0) return 'ileride';
  if (days === 0) return 'bugün';
  if (days < 31) return days + ' gün önce';
  const months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  if (months < 12) return months + ' ay önce';
  const y = Math.floor(months / 12), r = months % 12;
  return y + ' yıl' + (r ? ' ' + r + ' ay' : '') + ' önce';
};
// Bir sonraki cumartesi 19:00 (planı takvime eklemek için)
export function nextSaturdayEvening(now = new Date()) {
  const d = startOfDay(now);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(19, 0, 0, 0);
  return d;
}
// Sürpriz için rastgele gün: min–max hafta sonra, 10:00–19:30 arası
export function randomSurpriseDate(minW, maxW, now = new Date()) {
  const a = Math.round(minW * 7), b = Math.round(maxW * 7);
  const d = addDays(startOfDay(now), a + Math.floor(Math.random() * (b - a + 1)));
  d.setHours(10 + Math.floor(Math.random() * 10), Math.random() < 0.5 ? 0 : 30, 0, 0);
  return d;
}
export function pickSurpriseIdea(ideas, gifts) {
  const g = (gifts || []).filter((x) => !x.done).map((x) => 'Hediye fikrin: ' + x.title + ' 🎁');
  const pool = [...((ideas && ideas.length) ? ideas : DEFAULT_SURPRISE_IDEAS), ...(Math.random() < 0.35 ? g : [])];
  return pool[Math.floor(Math.random() * pool.length)] || DEFAULT_SURPRISE_IDEAS[0];
}

function Photo({ path, getUrl, className, alt }) {
  const [url, setUrl] = useState(path && path.startsWith('data:') ? path : '');
  useEffect(() => {
    if (!path || path.startsWith('data:')) return undefined;
    let alive = true;
    getUrl(path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => { alive = false; };
  }, [path, getUrl]);
  if (!path) return null;
  return url ? <img className={className} src={url} alt={alt || ''} loading="lazy" /> : <span className={className + ' ph'} aria-hidden="true" />;
}

// ---------- Sayfa ----------
export function YarimPage({ seg, setSeg, data, now, actions, love, prefs, photoUrl }) {
  return (
    <div className="ypage" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubTabs tabs={YARIM_TABS} value={seg} onChange={setSeg} label="Yarim bölümleri" />
      {seg === 'anilar' ? <Memories data={data} now={now} actions={actions} photoUrl={photoUrl} />
        : seg === 'sevdikleri' ? <Likes data={data} actions={actions} />
          : seg === 'hediyeler' ? <Gifts data={data} now={now} actions={actions} />
            : seg === 'planlar' ? <Plans data={data} now={now} actions={actions} />
              : <Overview data={data} now={now} actions={actions} love={love} prefs={prefs} photoUrl={photoUrl} goSeg={setSeg} />}
    </div>
  );
}

function Overview({ data, now, actions, love, prefs, photoUrl, goSeg }) {
  const today = memoriesToday(data.memories, now);
  const gifts = (data.yarim_items || []).filter((x) => x.kind === 'hediye' && !x.done);
  const soon = specialUpcoming((data.special_dates || []).filter((x) => x.for_yarim), now, 21);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      {today.map(({ m, n }) => (
        <button key={m.id} type="button" className="card ymem-today" onClick={() => actions.openMemory(m)}>
          <Photo path={m.photo_path} getUrl={photoUrl} className="ymem-today-img" alt={m.title} />
          <span className="ymem-today-txt"><span className="k">📸 {n} yıl önce bugün</span><b>{m.title}</b>{m.note ? <span>{m.note}</span> : null}</span>
        </button>
      ))}
      {soon.length ? soon.slice(0, 2).map(({ s, date, inDays }) => (
        <div key={s.id} className="card ygift-nudge">
          <span>{SPECIAL_ICON[s.kind] || '⭐'} <b>{specialLabel(s, date)}</b> · {inDays === 0 ? 'bugün' : inDays + ' gün kaldı'}</span>
          <button type="button" className="linkbtn" onClick={() => goSeg('hediyeler')}>{gifts.length ? gifts.length + ' hediye fikrin var →' : 'Hediye fikri ekle →'}</button>
        </div>
      )) : null}
      <YarimPanel data={data} now={now} actions={actions} love={love} />
      <WeekendIdea data={data} now={now} actions={actions} goSeg={goSeg} />
      <SurpriseCard prefs={prefs} data={data} now={now} actions={actions} />
    </div>
  );
}

function WeekendIdea({ data, now, actions, goSeg }) {
  const open = (data.yarim_items || []).filter((x) => x.kind === 'plan' && !x.done);
  const [pick, setPick] = useState(null);
  const roll = () => {
    if (!open.length) return;
    let next = open[Math.floor(Math.random() * open.length)];
    if (open.length > 1 && pick && next.id === pick.id) next = open.find((x) => x.id !== pick.id);
    setPick(next);
  };
  return (
    <section className="card ywk">
      <div className="ywk-head">
        <span className="k">Bu hafta sonu ne yapsak?</span>
        {open.length ? <button type="button" className="btn" onClick={roll}>🎲 {pick ? 'Başka öner' : 'Öner'}</button> : null}
      </div>
      {!open.length ? (
        <p className="hint" style={{ margin: 0 }}>Önce "Birlikte yapılacaklar"a birkaç fikir ekle; buradan rastgele öneri çıkar. <button type="button" className="linkbtn" onClick={() => goSeg('planlar')}>Ekle →</button></p>
      ) : pick ? (
        <div className="ywk-pick">
          <span className="ywk-title">{PLAN_ICON[pick.category] || '✨'} {pick.title}</span>
          {pick.location ? <span className="hint">📍 {pick.location}</span> : null}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={() => actions.planToCalendar(pick)}>Takvime ekle (cumartesi 19:00)</button>
            <button type="button" className="btn" onClick={() => actions.openYarimItem(pick)}>Ayrıntı</button>
          </div>
        </div>
      ) : <p className="hint" style={{ margin: 0 }}>{open.length} fikir arasından seçmek için "Öner"e dokun.</p>}
    </section>
  );
}

function SurpriseCard({ prefs, data, now, actions }) {
  const s = (prefs && prefs.surprise) || {};
  const [edit, setEdit] = useState(false);
  const [ideas, setIdeas] = useState(((s.ideas && s.ideas.length) ? s.ideas : DEFAULT_SURPRISE_IDEAS).join('\n'));
  const rem = s.reminder_id ? (data.reminders || []).find((r) => r.id === s.reminder_id && !r.done) : null;
  const ranges = [[2, 3], [3, 4], [4, 6]];
  const cur = [s.min || 3, s.max || 4];
  return (
    <section className="card ysurprise">
      <div className="ywk-head">
        <span className="k">🌷 Küçük sürpriz hatırlatıcısı</span>
        <label className="switch">
          <input type="checkbox" checked={!!s.on} onChange={(e) => actions.saveSurprise({ ...s, on: e.target.checked })} />
          <span>{s.on ? 'Açık' : 'Kapalı'}</span>
        </label>
      </div>
      <p className="hint" style={{ margin: 0 }}>Seçtiğin aralıkta, her seferinde farklı ve rastgele bir günde "çiçek al", "not bırak" gibi bir hatırlatma gelir. Tamamladığında bir sonraki kendiliğinden kurulur.</p>
      {s.on ? (
        <>
          <div className="typechips" role="group" aria-label="Sıklık">
            {ranges.map(([a, b]) => (
              <button key={a} type="button" className={'chip' + (cur[0] === a && cur[1] === b ? ' on' : '')} aria-pressed={cur[0] === a && cur[1] === b}
                onClick={() => actions.saveSurprise({ ...s, min: a, max: b }, true)}>{a}–{b} haftada bir</button>
            ))}
          </div>
          <span className="hint">{rem ? '✓ Bir sonraki sürpriz hatırlatması kuruldu — günü sürpriz 😉' : 'Hatırlatma kuruluyor…'}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => setEdit(!edit)}>{edit ? 'Kapat' : 'Fikirleri düzenle'}</button>
            <button type="button" className="btn" onClick={() => actions.saveSurprise(s, true)}>Yeniden planla</button>
          </div>
          {edit ? (
            <div className="field">
              <label htmlFor="sp-ideas">Fikirler (her satıra bir tane) — hediye fikirlerinden de seçilir</label>
              <textarea id="sp-ideas" value={ideas} onChange={(e) => setIdeas(e.target.value)} rows={6} />
              <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => { actions.saveSurprise({ ...s, ideas: ideas.split('\n').map((x) => x.trim()).filter(Boolean) }); setEdit(false); }}>Kaydet</button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

// ---------- Anılar ----------
function Memories({ data, now, actions, photoUrl }) {
  const list = [...(data.memories || [])].sort((a, b) => b.day.localeCompare(a.day));
  const years = [];
  list.forEach((m) => { const y = m.day.slice(0, 4); const g = years[years.length - 1]; if (g && g.y === y) g.items.push(m); else years.push({ y, items: [m] }); });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="hint" style={{ margin: 0, flex: '1 1 220px' }}>Özel anlarınızı tarih, not ve fotoğrafla sakla. Yıl dönümlerinde "1 yıl önce bugün" diye karşına çıkar.</p>
        <button type="button" className="btn primary" onClick={() => actions.openMemory({})}>+ Anı ekle</button>
      </div>
      {years.length ? years.map((g) => (
        <Section key={g.y} title={g.y} meta={g.items.length + ' anı'}>
          <div className="ymem-grid">
            {g.items.map((m) => (
              <button key={m.id} type="button" className="card ymem" onClick={() => actions.openMemory(m)}>
                {m.photo_path ? <Photo path={m.photo_path} getUrl={photoUrl} className="ymem-img" alt={m.title} /> : <span className="ymem-img empty" aria-hidden="true">💗</span>}
                <span className="ymem-body">
                  <b>{m.title}</b>
                  <span className="meta">{fmtShort(fromDateInput(m.day))} {m.day.slice(0, 4)} · {ago(m.day, now)}</span>
                  {m.note ? <span className="ymem-note">{m.note}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )) : <div className="card"><p className="empty">Henüz anı yok. İlk buluşmanızla başlayabilirsin 💗</p></div>}
    </div>
  );
}

export function MemorySheet({ initial, onClose, onSave, onDelete, photoUrl }) {
  const isEdit = !!initial.id;
  const [day, setDay] = useState(initial.day || toDateInput(new Date()));
  const [title, setTitle] = useState(initial.title || '');
  const [note, setNote] = useState(initial.note || '');
  const [photo, setPhoto] = useState(null); // { blob, preview }
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const { shrinkImage } = await import('./receipt.js');
    const blob = await shrinkImage(f, 1600);
    setPhoto({ blob, preview: URL.createObjectURL(blob) });
    setRemovePhoto(false);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await onSave({ id: initial.id, day, title: title.trim(), note: note.trim() || null }, { photo, removePhoto, oldPath: initial.photo_path || null }); } finally { setBusy(false); }
  };
  const showOld = initial.photo_path && !photo && !removePhoto;
  return (
    <Sheet title={isEdit ? 'Anı' : 'Yeni anı'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {photo ? <img className="ymem-sheet-img" src={photo.preview} alt="Seçilen fotoğraf" /> : showOld ? <Photo path={initial.photo_path} getUrl={photoUrl} className="ymem-sheet-img" alt={initial.title} /> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className="btn" style={{ cursor: 'pointer' }}>
            📷 {photo || showOld ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={pick} />
          </label>
          {photo || showOld ? <button type="button" className="btn" onClick={() => { setPhoto(null); setRemovePhoto(true); }}>Fotoğrafı kaldır</button> : null}
        </div>
        <div className="field">
          <label htmlFor="m-title">Ne oldu?</label>
          <input id="m-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. İlk buluşma" required />
        </div>
        <div className="field">
          <label htmlFor="m-mday">Tarih</label>
          <input id="m-mday" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="m-mnote">Not</label>
          <textarea id="m-mnote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nerede, ne yaptınız, ne hissettin…" rows={4} />
        </div>
        <p className="hint" style={{ margin: 0 }}>Fotoğraf yalnız senin görebildiğin kapalı bir klasörde saklanır.</p>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim()}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Sevdikleri ----------
function Likes({ data, actions }) {
  const items = (data.yarim_items || []).filter((x) => x.kind === 'sevdigi');
  const by = {};
  items.forEach((x) => { const c = x.category || 'Diğer'; (by[c] = by[c] || []).push(x); });
  const cats = LIKE_CATS.filter((c) => by[c]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="hint" style={{ margin: 0, flex: '1 1 220px' }}>Sevdiği çiçek, kahve siparişi, beden, sevdiği markalar… Hediye alırken ya da sipariş verirken bir bakışta önünde.</p>
        <button type="button" className="btn primary" onClick={() => actions.openYarimItem({ kind: 'sevdigi' })}>+ Ekle</button>
      </div>
      {cats.length ? (
        <div className="ylike-grid">
          {cats.map((c) => (
            <div key={c} className="card ylike">
              <span className="k">{LIKE_ICON[c] || '✨'} {c}</span>
              {by[c].map((x) => (
                <button key={x.id} type="button" className="ylike-item" onClick={() => actions.openYarimItem(x)}>
                  <b>{x.title}</b>{x.detail ? <span>{x.detail}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card ylike-empty">
          <p className="empty" style={{ paddingBottom: 6 }}>Henüz bir şey yok. Hızlı başlamak için bir başlık seç:</p>
          <div className="typechips" style={{ padding: '0 16px 16px' }}>
            {LIKE_CATS.slice(0, 9).map((c) => <button key={c} type="button" className="chip" onClick={() => actions.openYarimItem({ kind: 'sevdigi', category: c })}>{LIKE_ICON[c]} {c}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Hediye fikirleri ----------
function Gifts({ data, now, actions }) {
  const all = (data.yarim_items || []).filter((x) => x.kind === 'hediye');
  const open = all.filter((x) => !x.done).sort((a, b) => (a.sort || 0) - (b.sort || 0) || (b.created_at || '').localeCompare(a.created_at || ''));
  const done = all.filter((x) => x.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const total = open.reduce((s, x) => s + (Number(x.price) || 0), 0);
  const next = specialUpcoming((data.special_dates || []).filter((x) => x.for_yarim), now)[0];
  const [showDone, setShowDone] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="hint" style={{ margin: 0, flex: '1 1 220px' }}>Bir şeyden bahsettiğinde hemen ekle. {next ? 'Sıradaki: ' + specialLabel(next.s, next.date) + ' (' + (next.inDays === 0 ? 'bugün' : next.inDays + ' gün') + ').' : ''} Doğum günü ve yıl dönümünden 2 hafta önce hatırlatılır.</p>
        <button type="button" className="btn primary" onClick={() => actions.openYarimItem({ kind: 'hediye' })}>+ Fikir ekle</button>
      </div>
      <div className="card list">
        {open.length ? open.map((x) => (
          <div key={x.id} className="row ygift">
            <Check on={false} onClick={() => actions.toggleYarimItem(x)} label={x.title + ' alındı olarak işaretle'} />
            <button type="button" className="body" onClick={() => actions.openYarimItem(x)}>
              <span className="title">{x.title}</span>
              <span className="meta">{x.price ? <span>{tl(x.price)}</span> : null}{x.detail ? <span>{x.detail}</span> : null}{x.link ? <span>🔗 link var</span> : null}</span>
            </button>
            {x.link && /^https?:/.test(x.link) ? <a className="missed-btn" href={x.link} target="_blank" rel="noopener noreferrer" aria-label={x.title + ' bağlantısını aç'}>↗</a> : null}
          </div>
        )) : <p className="empty">Hediye fikri yok. Aklına geleni hemen ekle 🎁</p>}
        {open.length && total ? <div className="ygift-total">Toplam ≈ {tl(total)}</div> : null}
      </div>
      {done.length ? (
        <Section title="Alınanlar" action={<button type="button" className="linkbtn" onClick={() => setShowDone(!showDone)}>{showDone ? 'Gizle' : 'Göster (' + done.length + ')'}</button>}>
          {showDone ? (
            <div className="card list">
              {done.map((x) => (
                <div key={x.id} className="row ygift">
                  <Check on onClick={() => actions.toggleYarimItem(x)} label={x.title + ' alınmadı olarak işaretle'} />
                  <button type="button" className="body" onClick={() => actions.openYarimItem(x)}>
                    <span className="title done">{x.title}</span>
                    <span className="meta">{x.done_at ? <span>{fmtShort(fromDateInput(x.done_at))} {x.done_at.slice(0, 4)}</span> : null}{x.price ? <span>{tl(x.price)}</span> : null}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

// ---------- Birlikte yapılacaklar ----------
function Plans({ data, now, actions }) {
  const all = (data.yarim_items || []).filter((x) => x.kind === 'plan');
  const [cat, setCat] = useState('Tümü');
  const used = ['Tümü', ...PLAN_CATS.filter((c) => all.some((x) => (x.category || 'Diğer') === c))];
  const open = all.filter((x) => !x.done && (cat === 'Tümü' || (x.category || 'Diğer') === cat));
  const done = all.filter((x) => x.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const [showDone, setShowDone] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="hint" style={{ margin: 0, flex: '1 1 220px' }}>Gidilecek yerler, denenecek restoranlar, izlenecekler… Yapınca işaretle; Özet'teki "Bu hafta sonu ne yapsak?" buradan önerir.</p>
        <button type="button" className="btn primary" onClick={() => actions.openYarimItem({ kind: 'plan', category: cat !== 'Tümü' ? cat : 'Yer' })}>+ Ekle</button>
      </div>
      {used.length > 2 ? (
        <div className="chips">
          {used.map((c) => <button key={c} type="button" className={'chip' + (cat === c ? ' on' : '')} aria-pressed={cat === c} onClick={() => setCat(c)}>{c !== 'Tümü' ? (PLAN_ICON[c] || '') + ' ' : ''}{c}</button>)}
        </div>
      ) : null}
      <div className="card list">
        {open.length ? open.map((x) => (
          <div key={x.id} className="row ygift">
            <Check on={false} onClick={() => actions.toggleYarimItem(x)} label={x.title + ' yapıldı olarak işaretle'} />
            <button type="button" className="body" onClick={() => actions.openYarimItem(x)}>
              <span className="title">{PLAN_ICON[x.category] || '✨'} {x.title}</span>
              <span className="meta">{x.category ? <span>{x.category}</span> : null}{x.location ? <span>📍 {x.location.split(',')[0]}</span> : null}{x.detail ? <span>{x.detail}</span> : null}</span>
            </button>
            {x.location ? <a className="missed-btn" href={mapsLink(x.location, x.location_geo)} target={mapsTarget()} rel="noopener noreferrer" aria-label={x.title + ' haritada aç'}>📍</a> : null}
          </div>
        )) : <p className="empty">{all.length ? 'Bu başlıkta yapılmamış bir şey yok.' : 'Henüz bir şey yok. İlk fikri ekle ✨'}</p>}
      </div>
      {done.length ? (
        <Section title="Yaptıklarımız" action={<button type="button" className="linkbtn" onClick={() => setShowDone(!showDone)}>{showDone ? 'Gizle' : 'Göster (' + done.length + ')'}</button>}>
          {showDone ? (
            <div className="card list">
              {done.map((x) => (
                <div key={x.id} className="row ygift">
                  <Check on onClick={() => actions.toggleYarimItem(x)} label={x.title + ' yapılmadı olarak işaretle'} />
                  <button type="button" className="body" onClick={() => actions.openYarimItem(x)}>
                    <span className="title done">{PLAN_ICON[x.category] || '✨'} {x.title}</span>
                    <span className="meta">{x.done_at ? <span>{fmtShort(fromDateInput(x.done_at))} {x.done_at.slice(0, 4)}</span> : null}</span>
                  </button>
                  <button type="button" className="missed-btn" aria-label={x.title + ' anılara ekle'} onClick={() => actions.openMemory({ title: x.title, day: x.done_at || toDateInput(now), note: x.location || '' })}>📸</button>
                </div>
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}

export function YarimItemSheet({ initial, onClose, onSave, onDelete, onCalendar }) {
  const kind = initial.kind || 'sevdigi';
  const isEdit = !!initial.id;
  const [title, setTitle] = useState(initial.title || '');
  const [category, setCategory] = useState(initial.category || (kind === 'sevdigi' ? 'Çiçek' : kind === 'plan' ? 'Yer' : ''));
  const [detail, setDetail] = useState(initial.detail || '');
  const [link, setLink] = useState(initial.link || '');
  const [price, setPrice] = useState(initial.price ? Number(initial.price).toLocaleString('tr-TR') : '');
  const [loc, setLoc] = useState({ text: initial.location || '', geo: initial.location_geo || '' });
  const [done, setDone] = useState(!!initial.done);
  const [busy, setBusy] = useState(false);
  const head = { sevdigi: isEdit ? 'Sevdiği şey' : 'Sevdiği bir şey ekle', hediye: isEdit ? 'Hediye fikri' : 'Yeni hediye fikri', plan: isEdit ? 'Birlikte yapılacak' : 'Birlikte yapılacak ekle' }[kind];
  const ph = { sevdigi: { 'Çiçek': 'Örn. Beyaz lale', 'Kahve / içecek': 'Örn. Oat latte, şekersiz', 'Beden / numara': 'Örn. S beden · 38 numara', 'Yüzük ölçüsü': 'Örn. 14' }[category] || 'Ne?', hediye: 'Örn. Seramik atölyesi', plan: 'Örn. Kapadokya balon turu' }[kind];
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onSave({
        id: initial.id, kind, title: title.trim(), category: category || null, detail: detail.trim() || null,
        link: link.trim() || null, price: parseTL(price) || null,
        location: kind === 'plan' ? (loc.text.trim() || null) : null, location_geo: kind === 'plan' && loc.text.trim() ? (loc.geo || null) : null,
        done, done_at: done ? (initial.done_at || toDateInput(new Date())) : null
      });
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={head} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {kind !== 'hediye' ? (
          <div className="field">
            <span className="lbl">{kind === 'sevdigi' ? 'Başlık' : 'Tür'}</span>
            <div className="typechips" role="group">
              {(kind === 'sevdigi' ? LIKE_CATS : PLAN_CATS).map((c) => <button key={c} type="button" className={'chip' + (category === c ? ' on' : '')} aria-pressed={category === c} onClick={() => setCategory(c)}>{(kind === 'sevdigi' ? LIKE_ICON : PLAN_ICON)[c]} {c}</button>)}
            </div>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="y-title">{kind === 'sevdigi' ? 'Ne?' : kind === 'hediye' ? 'Hediye' : 'Ne yapalım?'}</label>
          <input id="y-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ph} required />
        </div>
        {kind === 'hediye' ? (
          <div className="row2">
            <div className="field">
              <label htmlFor="y-price">Yaklaşık fiyat (₺)</label>
              <input id="y-price" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="—" />
            </div>
            <div className="field">
              <label htmlFor="y-link">Link</label>
              <input id="y-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" autoCapitalize="off" />
            </div>
          </div>
        ) : null}
        {kind === 'plan' ? <LocationField id="y-loc" value={loc} onChange={setLoc} /> : null}
        <div className="field">
          <label htmlFor="y-detail">Not</label>
          <input id="y-detail" type="text" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={kind === 'hediye' ? 'Renk, beden, nerede gördü…' : ''} />
        </div>
        {kind !== 'sevdigi' ? (
          <label className="wl-check">
            <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
            <span>{kind === 'hediye' ? 'Alındı / verildi' : 'Yaptık'}</span>
          </label>
        ) : null}
        {kind === 'plan' && isEdit && !done ? <button type="button" className="btn" onClick={() => onCalendar(initial)}>📅 Takvime ekle (cumartesi 19:00, değiştirebilirsin)</button> : null}
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

export { MONTHS };
