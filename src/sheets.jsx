import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { RULES, ruleLabel } from './recur.js';
import { Sheet } from './ui.jsx';
import { parseQuick } from './parse.js';
import { MARKETPLACES, BRANDS, DEFAULT_PREPS, mpColor } from './constants.js';
import { toDateInput, toTimeInput, combine, whenLabel, addDays, startOfDay, fromDateInput, rangeLabel } from './dates.js';
import { normalizePhone, prettyPhone, DEFAULT_LOVE_MESSAGE } from './whatsapp.js';
import { currentLocation, searchPlaces, parseGeo, geoText, mapsLink, mapsTarget } from './location.js';
const MapPin = lazy(() => import('./MapPin.jsx'));

const EXAMPLES = ['yarın 10:00 HB fiyat güncelle', 'Cuma 15:00 kargo firmasını ara', 'not: Trendyol komisyon oranını kontrol et', '12-14 kasım Trendyol kampanyası'];

function MpSelect({ value, onChange, id, emptyLabel = 'Yok' }) {
  return (
    <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {MARKETPLACES.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
    </select>
  );
}

// ---------- Hızlı ekle ----------
export function YarimToggle({ on, onClick }) {
  return (
    <button type="button" className={'chip yarim-chip' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on}>
      {on ? '❤️' : '🤍'} Yarim
    </button>
  );
}

// Paylaşılan uzun metni tek satırlık başlığa indirger
function condense(t) {
  const clean = (t || '').replace(/[*_~]/g, '').trim();
  // İlk satır, o da uzunsa ilk cümle; en fazla ~90 karakter
  let first = clean.split(/\n+/)[0].trim();
  if (first.length > 90) {
    const m = first.match(/^.{20,90}?[.!?](\s|$)/);
    first = m ? m[0].trim() : first.slice(0, 90).replace(/\s+\S*$/, '') + '…';
  }
  return first.replace(/\s+/g, ' ');
}

export function QuickAdd({ onClose, onSave, onDetail, defaultYarim, yarimHidden, shared: sharedProp }) {
  // Paylaşılan ya da panodan yapıştırılan metin
  const [shared, setShared] = useState(sharedProp || '');
  const [clipErr, setClipErr] = useState('');
  const [q, setQ] = useState(() => condense(sharedProp));
  const sharedLong = !!shared && condense(shared) !== (shared || '').trim();
  const [typeOverride, setTypeOverride] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  // Paylaşımda klavye hemen açılıp metni kapatmasın
  useEffect(() => { if (shared) return undefined; const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 50); return () => clearTimeout(t); }, []);

  const [yarimOverride, setYarimOverride] = useState(defaultYarim ? true : null);
  const p = useMemo(() => {
    const own = parseQuick(q);
    if (!shared) return own;
    // Başlıkta tarih/pazaryeri yoksa paylaşılan metnin tamamından al
    const all = parseQuick(shared);
    return {
      ...own,
      date: own.date || all.date, hasTime: own.date ? own.hasTime : all.hasTime, endDate: own.endDate || (own.date ? null : all.endDate),
      mp: own.mp || all.mp, brand: own.brand || all.brand,
      type: own.type !== 'Hatırlatma' ? own.type : (all.type === 'Not' ? 'Hatırlatma' : all.type)
    };
  }, [q, shared]);
  const type = typeOverride || p.type;
  const yarim = yarimHidden ? false : (yarimOverride !== null ? yarimOverride : p.yarim);

  const build = () => ({ ...p, type, yarim, shared: shared || '' });

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    try { await onSave(build()); } finally { setBusy(false); }
  };

  return (
    <Sheet title="Hızlı ekle" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {shared ? (
          <div className="shared-box">
            <span className="lbl">Paylaşılan metin</span>
            <p>{shared.length > 400 ? shared.slice(0, 400) + '…' : shared}</p>
            {sharedLong ? <span className="hint">Not olarak kaydedersen metnin tamamı nota eklenir.</span> : null}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="quick">{shared ? 'Başlığı düzenle, türünü seç; tarih ve saati metinden kendisi anlar.' : 'Yaz; tarih, saat, pazaryeri ve türü kendisi anlar.'}</label>
          <input id="quick" ref={inputRef} type="text" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)}
            onPaste={(e) => { const t = (e.clipboardData && e.clipboardData.getData('text')) || ''; if (!shared && (t.length > 90 || /\n/.test(t))) { e.preventDefault(); setShared(t.trim().slice(0, 4000)); setQ(condense(t)); } }} placeholder="ör. yarın 10:00 HB fiyat güncelle" enterKeyHint="done" />
        </div>
        <div className="typechips" role="group" aria-label="Tür">
          {['Hatırlatma', 'Arama', 'Not', 'Kampanya', 'Etkinlik'].map((t) => (
            <button key={t} type="button" className={'chip' + (type === t ? ' on' : '')} onClick={() => setTypeOverride(t)} aria-pressed={type === t}>{t}</button>
          ))}
          {type !== 'Not' && type !== 'Etkinlik' && type !== 'Kampanya' && !yarimHidden && <YarimToggle on={yarim} onClick={() => setYarimOverride(!yarim)} />}
        </div>
        {q.trim() ? (
          <div className="parsed">
            <span>Zaman: {type === 'Not' ? '—' : (type === 'Etkinlik' || type === 'Kampanya') ? (p.date ? (p.endDate ? rangeLabel(p.date, p.endDate) : rangeLabel(p.date, p.date)) + (p.endDate ? ' · ' + (Math.round((p.endDate - startOfDay(p.date)) / 86400000) + 1) + ' gün' : '') : 'Bugün') : p.date ? whenLabel(p.date) + (p.hasTime ? '' : ' (varsayılan saat)') : 'Tarihsiz'}</span>
            {p.repeat && type === 'Hatırlatma' ? <span>↻ {ruleLabel(p.repeat, p.date)}</span> : null}
            {!yarim || type === 'Not' ? <span><span className="dot" style={{ background: p.mp ? mpColor(p.mp) : '#C9C6BE' }} />{p.mp || 'Pazaryeri yok'}</span> : null}
            {p.brand ? <span>Marka: {p.brand}</span> : null}
          </div>
        ) : (
          <div className="examples">
            <button type="button" className="paste-btn" onClick={async () => {
              setClipErr('');
              try {
                const t = ((await navigator.clipboard.readText()) || '').trim();
                if (!t) { setClipErr('Panoda metin yok. Önce mesajı kopyala.'); return; }
                setShared(t.slice(0, 4000)); setQ(condense(t));
              } catch {
                setClipErr('Panoya erişilemedi. Yazı kutusuna uzun basıp "Yapıştır" diyebilirsin.');
              }
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /></svg>
              Kopyaladığım mesajı yapıştır
            </button>
            {clipErr ? <span className="hint" style={{ color: 'var(--danger)' }}>{clipErr}</span> : null}
            <span className="hint">Örnekler</span>
            {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setQ(x)}>{x}</button>)}
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn big" disabled={!q.trim()} onClick={() => onDetail(build())}>Detaylı düzenle</button>
          <button type="submit" className="btn big primary" disabled={!q.trim() || busy}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Konum alanı ----------
// loc = { text, geo }  (geo = "lat,lng" ya da '')
function LocationField({ id, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sugs, setSugs] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);
  const ctrl = useRef(null);
  const bias = useRef(null);
  const geo = parseGeo(value.geo);

  useEffect(() => () => { clearTimeout(timer.current); if (ctrl.current) ctrl.current.abort(); }, []);

  const onType = (text) => {
    onChange({ text, geo: '' });
    setErr('');
    clearTimeout(timer.current);
    if (ctrl.current) ctrl.current.abort();
    if (text.trim().length < 3) { setSugs([]); setOpen(false); setSearching(false); return; }
    setSearching(true); setOpen(true);
    timer.current = setTimeout(async () => {
      const c = new AbortController(); ctrl.current = c;
      try {
        const res = await searchPlaces(text, c.signal, bias.current);
        if (!c.signal.aborted) { setSugs(res); setSearching(false); }
      } catch (e) {
        if (!c.signal.aborted) { setSugs([]); setSearching(false); }
      }
    }, 350);
  };

  const pick = (sg) => {
    onChange({ text: sg.text, geo: geoText(sg.lat, sg.lng) });
    setSugs([]); setOpen(false);
  };

  const useMine = async () => {
    setBusy(true); setErr(''); setOpen(false);
    try {
      const r = await currentLocation();
      bias.current = { lat: r.lat, lng: r.lng };
      onChange({ text: r.text, geo: geoText(r.lat, r.lng) });
    } catch (e) { setErr(e.message || 'Konum alınamadı.'); } finally { setBusy(false); }
  };

  return (
    <div className="field">
      <label htmlFor={id}>Konum (isteğe bağlı)</label>
      <div className="locrow">
        <input id={id} type="text" autoComplete="off" placeholder="Yer ara: ör. İstanbul Fuar Merkezi" value={value.text}
          onChange={(e) => onType(e.target.value)} onFocus={() => { if (sugs.length) setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && open && sugs[0]) { e.preventDefault(); pick(sugs[0]); } }}
          aria-autocomplete="list" aria-expanded={open} aria-controls={id + '-list'} />
        <button type="button" className="btn locbtn" onClick={useMine} disabled={busy} aria-label="Şu anki konumumu kullan">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          <span>{busy ? 'Bulunuyor…' : 'Konumum'}</span>
        </button>
      </div>
      {open ? (
        <div className="locsugs" id={id + '-list'} role="listbox" aria-label="Yer önerileri">
          {searching && !sugs.length ? <span className="locsug-empty">Aranıyor…</span> : null}
          {!searching && !sugs.length ? <span className="locsug-empty">Sonuç bulunamadı. Adresi elle yazabilir ya da "Konumum"u kullanabilirsin.</span> : null}
          {sugs.map((sg, k) => (
            <button key={k} type="button" role="option" aria-selected="false" className="locsug" onClick={() => pick(sg)}>
              <span className="n">{sg.name}</span>
              {sg.detail ? <span className="d">{sg.detail}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {err ? <span className="hint" style={{ color: 'var(--danger)' }}>{err}</span> : null}
      {geo ? (
        <>
          <Suspense fallback={<div className="mappin" />}>
            <MapPin lat={geo.lat} lng={geo.lng} onMove={(la, ln) => onChange({ text: value.text, geo: geoText(la, ln) })} />
          </Suspense>
          <span className="hint">Pin yanlış yerdeyse sürükle ya da haritada doğru yere dokun. <a href={mapsLink(value.text, value.geo)} {...mapsTarget()}>Haritalar'da aç ↗</a></span>
        </>
      ) : value.text && !open ? <span className="hint">Listeden bir yer seçersen haritada tam konumu işaretlenir.</span> : null}
    </div>
  );
}

// ---------- Hatırlatma / Arama ----------
export function ItemSheet({ initial, onClose, onSave, onDelete, yarimHidden, contacts = [] }) {
  const isEdit = !!(initial && initial.id);
  const [kind, setKind] = useState(initial.kind || 'reminder');
  const d0 = initial.due_at ? new Date(initial.due_at) : null;
  const [title, setTitle] = useState(initial.title || initial.who || '');
  const [topic, setTopic] = useState(initial.topic || '');
  const [phone, setPhone] = useState(initial.phone || '');
  const [mp, setMp] = useState(initial.marketplace || '');
  const [date, setDate] = useState(d0 ? toDateInput(d0) : '');
  const [time, setTime] = useState(d0 ? toTimeInput(d0) : '09:00');
  const [yarim, setYarim] = useState(!!initial.for_yarim);
  const [loc, setLoc] = useState({ text: initial.location || '', geo: initial.location_geo || '' });
  const [repeat, setRepeat] = useState(initial.repeat_rule || '');
  const [busy, setBusy] = useState(false);
  // Arama eklerken rehberden öneriler (yazdıkça)
  const tq = title.trim().toLocaleLowerCase('tr-TR');
  const suggestions = kind === 'call' && tq.length >= 1
    ? contacts.filter((c) => c.name.toLocaleLowerCase('tr-TR').includes(tq) && c.name.toLocaleLowerCase('tr-TR') !== tq).slice(0, 4)
    : [];

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const due = date ? combine(date, time).toISOString() : null;
    try {
      if (kind === 'reminder') await onSave('reminders', { id: initial.id, title: title.trim(), marketplace: yarim ? null : (mp || null), due_at: due, for_yarim: yarim, ...(repeat || initial.repeat_rule ? { repeat_rule: due ? (repeat || null) : null } : {}), ...(loc.text.trim() || initial.location ? { location: loc.text.trim() || null, location_geo: loc.text.trim() ? (loc.geo || null) : null } : {}) });
      else await onSave('calls', { id: initial.id, who: title.trim(), topic: topic.trim() || null, phone: phone.trim() || null, due_at: due, for_yarim: yarim, missedId: initial.missedId });
    } finally { setBusy(false); }
  };

  const quickDates = [['Bugün', 0], ['Yarın', 1], ['2 gün sonra', 2], ['1 hafta sonra', 7]];

  return (
    <Sheet title={isEdit ? (kind === 'reminder' ? 'Hatırlatmayı düzenle' : 'Aramayı düzenle') : 'Yeni kayıt'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isEdit && (
          <div className="seg" role="group" aria-label="Tür">
            <button type="button" className={kind === 'reminder' ? 'on' : ''} onClick={() => setKind('reminder')}>Hatırlatma</button>
            <button type="button" className={kind === 'call' ? 'on' : ''} onClick={() => setKind('call')}>Arama</button>
          </div>
        )}
        <div className="field">
          <label htmlFor="f-title">{kind === 'reminder' ? 'Ne hatırlatılsın?' : 'Kim aranacak?'}</label>
          <input id="f-title" type="text" value={title} required autoComplete="off"
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
              // Rehberdeki bir isim seçilince numara otomatik gelir
              if (kind === 'call') {
                const k = contacts.find((c) => c.name.toLocaleLowerCase('tr-TR') === v.trim().toLocaleLowerCase('tr-TR'));
                if (k && k.phone && !phone.trim()) setPhone(prettyPhone(k.phone));
              }
            }} />
          {kind === 'call' && suggestions.length ? (
            <div className="typechips" aria-label="Rehberden">
              {suggestions.map((c) => (
                <button key={c.id} type="button" className="chip" onClick={() => { setTitle(c.name); if (c.phone) setPhone(prettyPhone(c.phone)); }}>
                  👤 {c.name}{c.phone ? '' : ' (numara yok)'}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {kind === 'call' && (
          <>
            <div className="field">
              <label htmlFor="f-topic">Konu</label>
              <input id="f-topic" type="text" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-phone">Telefon (isteğe bağlı)</label>
              <input id="f-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </>
        )}
        <div className="row2">
          <div className="field">
            <label htmlFor="f-date">Tarih</label>
            <input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-time">Saat</label>
            <input id="f-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
          </div>
        </div>
        <div className="typechips">
          {quickDates.map(([l, n]) => (
            <button key={l} type="button" className="chip" onClick={() => setDate(toDateInput(addDays(startOfDay(new Date()), n)))}>{l}</button>
          ))}
          <button type="button" className="chip" onClick={() => setDate('')}>Tarihsiz</button>
        </div>
        {yarimHidden && !yarim ? null : (
        <div className="typechips">
          <YarimToggle on={yarim} onClick={() => setYarim(!yarim)} />
          <span className="hint" style={{ alignSelf: 'center' }}>{yarim ? 'Yarim alanında görünür, bildirimin sonunda ❤️ olur' : 'Yarim ile ilgiliyse işaretle'}</span>
        </div>
        )}
        {kind === 'reminder' && !yarim && (
          <div className="field">
            <label htmlFor="f-mp">Pazaryeri</label>
            <MpSelect id="f-mp" value={mp} onChange={setMp} />
          </div>
        )}
        {kind === 'reminder' && date ? (
          <div className="field">
            <label htmlFor="f-rep">Tekrar</label>
            <select id="f-rep" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              {RULES.map(([v, l]) => <option key={v} value={v}>{v ? ruleLabel(v, combine(date, time)) : l}</option>)}
            </select>
            {repeat ? <span className="hint">Tamamladığında bir sonraki tarihe kayar; Google Takvim'de her tekrarda bildirim gelir.</span> : null}
          </div>
        ) : null}
        {kind === 'reminder' && <LocationField id="f-loc" value={loc} onChange={setLoc} />}
        <p className="hint" style={{ margin: 0 }}>Tarih ve saat verilirse Google Takvim'deki "Ajanda" takvimine eklenir; bildirim telefonuna o saatte gelir.</p>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(kind === 'reminder' ? 'reminders' : 'calls', initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Not ----------
export function NoteSheet({ initial, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const [mp, setMp] = useState(initial.marketplace || '');
  const [brand, setBrand] = useState(initial.brand || '');
  const [title, setTitle] = useState(initial.title || '');
  const [body, setBody] = useState(initial.body || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onSave({ id: initial.id, marketplace: mp || null, brand: brand || null, title: title.trim(), body: body.trim(), updated_at: new Date().toISOString() });
    } finally { setBusy(false); }
  };

  return (
    <Sheet title={isEdit ? 'Notu düzenle' : 'Yeni not'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row2">
          <div className="field">
            <label htmlFor="n-mp">Pazaryeri</label>
            <MpSelect id="n-mp" value={mp} onChange={setMp} emptyLabel="Genel" />
          </div>
          <div className="field">
            <label htmlFor="n-brand">Marka</label>
            <select id="n-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Yok</option>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="n-title">Başlık</label>
          <input id="n-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="n-body">Not</label>
          <textarea id="n-body" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Kampanya ----------
export function CampaignSheet({ initial, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const today = toDateInput(new Date());
  const [name, setName] = useState(initial.name || '');
  const [mp, setMp] = useState(initial.marketplace || '');
  const [start, setStart] = useState(initial.start_date || today);
  const [end, setEnd] = useState(initial.end_date || today);
  const [notes, setNotes] = useState(initial.notes || '');
  const [preps, setPreps] = useState(DEFAULT_PREPS.join('\n'));
  const [kind, setKind] = useState(initial.kind === 'etkinlik' ? 'etkinlik' : 'kampanya');
  const [loc, setLoc] = useState({ text: initial.location || '', geo: initial.location_geo || '' });
  const isEvent = kind === 'etkinlik';
  const [busy, setBusy] = useState(false);
  const invalid = !name.trim() || !start || !end || end < start;
  const days = start && end && end >= start ? Math.round((fromDateInput(end) - fromDateInput(start)) / 86400000) + 1 : 0;
  const setLen = (n) => { if (!start) return; setEnd(toDateInput(addDays(fromDateInput(start), n - 1))); };

  const submit = async (e) => {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    try {
      await onSave(
        { id: initial.id, name: name.trim(), marketplace: mp || null, start_date: start, end_date: end, notes: notes.trim() || null, kind, ...(loc.text.trim() || initial.location ? { location: loc.text.trim() || null, location_geo: loc.text.trim() ? (loc.geo || null) : null } : {}) },
        isEdit || isEvent ? null : preps.split('\n').map((s) => s.trim()).filter(Boolean)
      );
    } finally { setBusy(false); }
  };

  return (
    <Sheet title={isEdit ? (isEvent ? 'Etkinliği düzenle' : 'Kampanyayı düzenle') : (isEvent ? 'Yeni etkinlik' : 'Yeni kampanya')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isEdit && (
          <div className="seg" role="group" aria-label="Tür">
            <button type="button" className={!isEvent ? 'on' : ''} onClick={() => setKind('kampanya')}>Kampanya</button>
            <button type="button" className={isEvent ? 'on' : ''} onClick={() => setKind('etkinlik')}>Etkinlik</button>
          </div>
        )}
        <div className="field">
          <label htmlFor="c-name">{isEvent ? 'Etkinlik adı' : 'Kampanya adı'}</label>
          <input id="c-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="c-mp">Pazaryeri</label>
          <MpSelect id="c-mp" value={mp} onChange={setMp} />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="c-start">Başlangıç</label>
            <input id="c-start" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} required />
          </div>
          <div className="field">
            <label htmlFor="c-end">Bitiş</label>
            <input id="c-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>
        <div className="typechips" role="group" aria-label="Süre">
          {[1, 2, 3, 5, 7].map((n) => (
            <button key={n} type="button" className={'chip' + (days === n ? ' on' : '')} onClick={() => setLen(n)} aria-pressed={days === n}>{n === 1 ? '1 gün' : n + ' gün'}</button>
          ))}
          {days > 0 && ![1, 2, 3, 5, 7].includes(days) ? <span className="hint" style={{ alignSelf: 'center' }}>{days} gün</span> : null}
        </div>
        {!isEdit && !isEvent && (
          <div className="field">
            <label htmlFor="c-preps">Hazırlık adımları (her satıra bir tane)</label>
            <textarea id="c-preps" value={preps} onChange={(e) => setPreps(e.target.value)} />
          </div>
        )}
        <LocationField id="c-loc" value={loc} onChange={setLoc} />
        <div className="field">
          <label htmlFor="c-notes">Not (isteğe bağlı)</label>
          <input id="c-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="hint" style={{ margin: 0 }}>{isEvent
          ? 'Etkinlik Google Takvim\'e seçtiğin günleri kaplayan tüm gün etkinliği olarak eklenir.'
          : 'Kampanya Google Takvim\'e seçtiğin günleri kaplayan tüm gün etkinliği olarak eklenir. Başlangıçtan 3 gün ve 1 gün önce saat 09:00\'da hazırlık hatırlatması gelir.'}</p>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || invalid}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Yarim ayarları ----------
export function YarimSettingsSheet({ initial, count, onClose, onSave }) {
  const [phone, setPhone] = useState(initial.phone || '');
  const [message, setMessage] = useState(initial.message || DEFAULT_LOVE_MESSAGE);
  const [busy, setBusy] = useState(false);
  const norm = normalizePhone(phone);
  const valid = norm.length >= 11;
  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try { await onSave({ yarim_phone: norm, love_message: message.trim() || DEFAULT_LOVE_MESSAGE }); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Yarim ❤️" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="hint" style={{ margin: 0, fontSize: 14 }}>Kalbe dokunduğunda WhatsApp bu numarayla ve aşağıdaki mesajla açılır; göndermek için WhatsApp'ta gönder'e basman yeterli.</p>
        <div className="field">
          <label htmlFor="y-phone">WhatsApp numarası</label>
          <input id="y-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="0532 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {phone && !valid ? <span className="hint" style={{ color: 'var(--danger)' }}>Numarayı başında 0 ile, 11 hane olarak yaz.</span> : null}
          {valid ? <span className="hint">{prettyPhone(phone)}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="y-msg">Mesaj</label>
          <input id="y-msg" type="text" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <p className="hint" style={{ margin: 0 }}>Şimdiye kadar {count} kez kalp gönderdin.</p>
        <button type="submit" className="btn big primary" style={{ background: '#D6336C', borderColor: '#D6336C' }} disabled={!valid || busy}>Kaydet</button>
      </form>
    </Sheet>
  );
}

// ---------- Cevapsız çağrı bağlantısı ----------
function CopyBox({ label, value }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* yok say */ }
  };
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      <div className="copybox"><code>{value}</code><button type="button" className="btn" onClick={copy}>{ok ? 'Kopyalandı' : 'Kopyala'}</button></div>
    </div>
  );
}

export function MissedSetupSheet({ token, onClose, onCreateToken, onTest }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const endpoint = window.location.origin + '/api/missed-call';
  const test = async () => {
    setBusy(true); setResult('');
    try { setResult(await onTest()); } finally { setBusy(false); }
  };
  return (
    <Sheet title="Telefon bağlantısı" onClose={onClose}>
      <p className="hint" style={{ margin: 0, fontSize: 14 }}>Telefondaki MacroDroid, cevapsız bir çağrı olduğunda arayanın adını ve numarasını buraya gönderir. Bu kapıdan sadece kayıt eklenebilir, verilerin okunamaz.</p>
      {token ? (
        <>
          <CopyBox label="Adres (URL)" value={endpoint} />
          <CopyBox label="Gizli anahtar (token)" value={token} />
          <button type="button" className="btn big" disabled={busy} onClick={test}>{busy ? 'Deneniyor…' : 'Test kaydı gönder'}</button>
          {result ? <p className="hint" style={{ margin: 0, fontSize: 14, color: result.startsWith('✓') ? 'var(--green)' : 'var(--danger)' }}>{result}</p> : null}
          <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => { if (window.confirm('Yeni anahtar oluşturulursa MacroDroid\'deki eski anahtar çalışmaz. Devam edilsin mi?')) onCreateToken(); }}>Yeni anahtar oluştur</button>
        </>
      ) : (
        <button type="button" className="btn big primary" onClick={onCreateToken}>Gizli anahtar oluştur</button>
      )}
    </Sheet>
  );
}

// ---------- Yedekleme ----------
function BackupSection({ demo, backup, onBackupNow, onDownload, onRestore, onReconnect }) {
  const fileRef = useRef(null);
  const last = backup.last ? new Date(backup.last) : null;
  const msg = {
    running: 'Yedekleniyor…',
    ok: 'Yedeklendi ✓',
    needs_consent: 'Drive izni yok. Aşağıdaki "Google\'ı yeniden bağla" ile bir kez izin ver.',
    api_disabled: 'Google Cloud\'da "Google Drive API" kapalı. Açılınca otomatik yedek başlar.',
    error: 'Yedekleme başarısız: ' + (backup.msg || '')
  }[backup.status];
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <b style={{ fontSize: 15 }}>Yedekleme</b>
        <span className="hint">{last ? 'Son: ' + whenLabel(last) : 'Henüz yedek yok'}</span>
      </div>
      <p className="hint" style={{ margin: 0 }}>{demo ? 'Örnek modda Drive yedeği kapalı; dosya olarak indirebilirsin.' : 'Tüm verilerin haftada bir kendiliğinden Google Drive\'ındaki "Ajanda Yedekleri" klasörüne kaydedilir (son 12 yedek tutulur).'}</p>
      {msg ? <p className="hint" style={{ margin: 0, color: backup.status === 'ok' ? 'var(--green)' : backup.status === 'running' ? 'var(--ink-2)' : 'var(--danger)' }}>{msg}</p> : null}
      <div className="typechips">
        {!demo && <button type="button" className="btn" disabled={backup.status === 'running'} onClick={backup.status === 'needs_consent' ? onReconnect : onBackupNow}>{backup.status === 'needs_consent' ? 'Google\'ı yeniden bağla' : 'Şimdi Drive\'a yedekle'}</button>}
        <button type="button" className="btn" onClick={onDownload}>Dosya olarak indir</button>
        <button type="button" className="btn" onClick={() => fileRef.current && fileRef.current.click()}>Yedekten geri yükle</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) onRestore(f); }} />
      </div>
    </div>
  );
}

// ---------- Hesap ----------
export function AccountSheet({ email, google, demo, onClose, onReconnect, onRefresh, onSignOut, onMissedSetup, yarimHidden, onToggleYarim, backup, onBackupNow, onDownload, onRestore }) {
  const gText = { ok: 'Bağlı', checking: 'Kontrol ediliyor…', needs_login: 'Yeniden bağlanmalı', error: 'Ulaşılamıyor', off: 'Örnek modda kapalı' }[google] || google;
  return (
    <Sheet title="Hesap" onClose={onClose}>
      <div className="card list">
        <div className="row timeline"><span className="tcol">Hesap</span><span>{demo ? 'Örnek veri (demo)' : email}</span></div>
        <div className="row timeline"><span className="tcol">Google</span><span>{gText}</span></div>
      </div>
      <BackupSection demo={demo} backup={backup} onBackupNow={onBackupNow} onDownload={onDownload} onRestore={onRestore} onReconnect={onReconnect} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!demo && <button type="button" className="btn big" onClick={onReconnect}>Google Takvim'i yeniden bağla</button>}
        <button type="button" className="btn big" onClick={onMissedSetup}>Telefon bağlantısı (cevapsız çağrılar)</button>
        <button type="button" className="btn big" onClick={onToggleYarim} aria-pressed={!yarimHidden}>{yarimHidden ? 'Yarim alanını göster' : 'Yarim alanını bu cihazda gizle'}</button>
        <button type="button" className="btn big" onClick={onRefresh}>Verileri yenile</button>
        {!demo && <button type="button" className="btn big danger" onClick={onSignOut}>Çıkış yap</button>}
      </div>
    </Sheet>
  );
}
