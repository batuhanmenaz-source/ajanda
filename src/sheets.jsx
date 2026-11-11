import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { RULES, ruleLabel } from './recur.js';
import { Sheet } from './ui.jsx';
import { parseQuick } from './parse.js';
import { parseMoney, catOf } from './money.js';
import { AlertPicker } from './alertpicker.jsx';
import { DEFAULT_ALERTS, ALERT_TYPES, normAlerts } from './alerts.js';
import { MARKETPLACES, BRANDS, DEFAULT_PREPS, mpColor } from './constants.js';
import { toDateInput, toTimeInput, combine, whenLabel, dayLabel, addDays, startOfDay, fromDateInput, rangeLabel } from './dates.js';
import { normalizePhone, prettyPhone, DEFAULT_LOVE_MESSAGE } from './whatsapp.js';
import { currentLocation, searchPlaces, parseGeo, geoText, mapsLink, mapsTarget } from './location.js';
const MapPin = lazy(() => import('./MapPin.jsx'));

const EXAMPLES = ['yarın 10:00 HB fiyat güncelle', 'Cuma 15:00 kargo firmasını ara', 'not: Trendyol komisyon oranını kontrol et', '12-14 kasım Trendyol kampanyası', '250 market kart'];

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

// Sesle ekleme (Chrome / Samsung Internet; Türkçe)
const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
// Konuşma metnini hızlı ekle diline yaklaştır: "artı 45 bin maaş" → "+45000 maaş", "2 bin 500 lira" → "2500 lira"
export function normalizeSpeech(t) {
  let x = (t || '').trim();
  x = x.replace(/(\d+)\s*bin\s*(\d{1,3})?(?!\d)/gi, (_, a, b) => String(Number(a) * 1000 + (b ? Number(b) : 0)));
  x = x.replace(/(^|\s)bin\s+(\d{1,3})(?!\d)/gi, (_, sp, b) => sp + String(1000 + Number(b)));
  x = x.replace(/^artı\s+/i, '+');
  x = x.replace(/(\d+)\s*türk lirası/gi, '$1 lira');
  return x;
}

export function QuickAdd({ onClose, onSave, onDetail, defaultYarim, yarimHidden, shared: sharedProp, autoVoice }) {
  // Paylaşılan ya da panodan yapıştırılan metin
  const [shared, setShared] = useState(sharedProp || '');
  const [clipErr, setClipErr] = useState('');
  const [q, setQ] = useState(() => condense(sharedProp));
  const sharedLong = !!shared && condense(shared) !== (shared || '').trim();
  const [typeOverride, setTypeOverride] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState('');
  const recRef = useRef(null);
  const startVoice = () => {
    if (!SpeechRec) return;
    if (listening && recRef.current) { recRef.current.stop(); return; }
    setVoiceErr('');
    const r = new SpeechRec();
    r.lang = 'tr-TR'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    r.onresult = (e) => { let t = ''; for (const res of e.results) t += res[0].transcript; setQ(normalizeSpeech(t)); };
    r.onerror = (e) => {
      setListening(false);
      setVoiceErr(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Mikrofon izni verilmedi. Tarayıcı ayarlarından Ajanda\'ya mikrofon izni ver.' : e.error === 'no-speech' ? 'Ses duyulmadı, tekrar dene.' : e.error === 'network' ? 'Ses tanıma için internet gerekiyor.' : 'Ses tanınamadı, tekrar dene.');
    };
    r.onend = () => setListening(false);
    recRef.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  };
  useEffect(() => () => { if (recRef.current) try { recRef.current.abort(); } catch { /* yok say */ } }, []);
  // Paylaşımda klavye hemen açılıp metni kapatmasın; sesle açıldıysa dinlemeye başla
  useEffect(() => {
    if (shared) return undefined;
    if (autoVoice && SpeechRec) { startVoice(); return undefined; }
    const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // "250 market", "+45000 maaş" gibi yazılanlar cüzdana gider
  const money = useMemo(() => (shared ? null : parseMoney(q)), [q, shared]);
  const type = typeOverride || (money ? 'Para' : p.type);
  const yarim = yarimHidden ? false : (yarimOverride !== null ? yarimOverride : p.yarim);

  const build = () => ({ ...p, type, yarim, shared: shared || '', money, raw: q.trim() });

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
          <div className="qa-input">
            <input id="quick" ref={inputRef} type="text" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)}
              onPaste={(e) => { const t = (e.clipboardData && e.clipboardData.getData('text')) || ''; if (!shared && (t.length > 90 || /\n/.test(t))) { e.preventDefault(); setShared(t.trim().slice(0, 4000)); setQ(condense(t)); } }} placeholder={listening ? 'Dinliyorum…' : 'ör. yarın 10:00 HB fiyat güncelle'} enterKeyHint="done" />
            {SpeechRec ? (
              <button type="button" className={'mic' + (listening ? ' on' : '')} onClick={startVoice} aria-label={listening ? 'Dinlemeyi durdur' : 'Sesle söyle'} aria-pressed={listening}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              </button>
            ) : null}
          </div>
          {listening ? <span className="hint" aria-live="polite">Dinliyorum… "yarın akşam 8'de Hepsiburada'yı ara" ya da "250 lira market" gibi söyle.</span> : null}
          {voiceErr ? <span className="hint" style={{ color: 'var(--danger)' }}>{voiceErr}</span> : null}
        </div>
        <div className="typechips" role="group" aria-label="Tür">
          {['Hatırlatma', 'Arama', 'Not', 'Kampanya', 'Etkinlik', 'Para'].map((t) => (
            <button key={t} type="button" className={'chip' + (type === t ? ' on' : '')} onClick={() => setTypeOverride(t)} aria-pressed={type === t}>{t === 'Para' ? '💸 Para' : t}</button>
          ))}
          {type !== 'Not' && type !== 'Etkinlik' && type !== 'Kampanya' && type !== 'Para' && !yarimHidden && <YarimToggle on={yarim} onClick={() => setYarimOverride(!yarim)} />}
        </div>
        {q.trim() && type === 'Para' ? (
          <div className="parsed">
            {money ? (
              <>
                <span><b>{money.kind === 'gelir' ? '+ Gelir' : '− Gider'}</b> · {money.amount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺</span>
                <span>{catOf(money.category).emoji} {catOf(money.category).label}</span>
                <span>{dayLabel(fromDateInput(money.day))}</span>
                {money.method ? <span>{money.method === 'kart' ? '💳 Kart' : '💵 Nakit'}</span> : null}
              </>
            ) : <span>Tutar bulunamadı — "Detaylı düzenle" ile gir</span>}
          </div>
        ) : q.trim() ? (
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
export function LocationField({ id, value, onChange }) {
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
export function ItemSheet({ initial, onClose, onSave, onDelete, yarimHidden, contacts = [], alertDefaults = DEFAULT_ALERTS }) {
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
  const [scope, setScope] = useState(initial.scope || '');
  // Hatırlatma seçimi: kayıtlıysa o, eski kayıtsa "tam zamanında", yeniyse türün varsayılanı
  const [alerts, setAlerts] = useState(() => normAlerts(initial.alerts || (isEdit ? { list: ['0'] } : alertDefaults[initial.kind === 'call' ? 'call' : 'reminder'])));
  const [alertsTouched, setAlertsTouched] = useState(false);
  const changeAlerts = (v) => { setAlerts(v); setAlertsTouched(true); };
  const switchKind = (k) => { setKind(k); if (!isEdit && !alertsTouched) setAlerts(normAlerts(alertDefaults[k === 'call' ? 'call' : 'reminder'])); };
  const [busy, setBusy] = useState(false);
  // Sütun henüz yoksa (11 numaralı SQL) kaydı bozmamak için yalnız seçildiyse gönder
  const scopeField = scope || initial.scope ? { scope: yarim ? null : (scope || null) } : {};
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
      const al = { ...alerts, nag: alerts.nag && !(kind === 'reminder' && repeat) };
      if (kind === 'reminder') await onSave('reminders', { id: initial.id, title: title.trim(), marketplace: yarim ? null : (mp || null), due_at: due, for_yarim: yarim, ...scopeField, ...(due ? { alerts: al } : {}), ...(repeat || initial.repeat_rule ? { repeat_rule: due ? (repeat || null) : null } : {}), ...(loc.text.trim() || initial.location ? { location: loc.text.trim() || null, location_geo: loc.text.trim() ? (loc.geo || null) : null } : {}) });
      else await onSave('calls', { id: initial.id, who: title.trim(), topic: topic.trim() || null, phone: phone.trim() || null, due_at: due, for_yarim: yarim, ...scopeField, ...(due ? { alerts: al } : {}), missedId: initial.missedId });
    } finally { setBusy(false); }
  };

  const quickDates = [['Bugün', 0], ['Yarın', 1], ['2 gün sonra', 2], ['1 hafta sonra', 7]];

  return (
    <Sheet title={isEdit ? (kind === 'reminder' ? 'Hatırlatmayı düzenle' : 'Aramayı düzenle') : 'Yeni kayıt'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isEdit && (
          <div className="seg" role="group" aria-label="Tür">
            <button type="button" className={kind === 'reminder' ? 'on' : ''} onClick={() => switchKind('reminder')}>Hatırlatma</button>
            <button type="button" className={kind === 'call' ? 'on' : ''} onClick={() => switchKind('call')}>Arama</button>
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
        {!yarim ? (
          <div className="typechips" role="group" aria-label="Alan">
            <button type="button" className={'chip' + (scope !== 'ozel' ? ' on' : '')} aria-pressed={scope !== 'ozel'} onClick={() => setScope(initial.scope ? 'is' : '')}>💼 İş</button>
            <button type="button" className={'chip' + (scope === 'ozel' ? ' on' : '')} aria-pressed={scope === 'ozel'} onClick={() => { setScope('ozel'); setMp(''); }}>🏡 Özel</button>
            <span className="hint" style={{ alignSelf: 'center' }}>{scope === 'ozel' ? 'Bugün sayfasında "Özel" filtresinde görünür' : 'Bugün sayfasında "İş" filtresinde görünür'}</span>
          </div>
        ) : null}
        {kind === 'reminder' && !yarim && scope !== 'ozel' && (
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
        {date ? <AlertPicker id="f-al" value={alerts} onChange={changeAlerts} mode="timed" allowNag nagDisabled={kind === 'reminder' && !!repeat} /> : null}
        {kind === 'reminder' && <LocationField id="f-loc" value={loc} onChange={setLoc} />}
        <p className="hint" style={{ margin: 0 }}>{date ? 'Google Takvim\'deki "Ajanda" takvimine eklenir; bildirimler seçtiğin zamanlarda telefonuna gelir.' : 'Tarih verirsen Google Takvim\'e eklenir ve ne zaman hatırlatılacağını seçebilirsin.'}</p>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(kind === 'reminder' ? 'reminders' : 'calls', initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Not ----------
export function NoteSheet({ initial, onClose, onSave, onDelete, alertDefaults = DEFAULT_ALERTS }) {
  const isEdit = !!initial.id;
  const [mp, setMp] = useState(initial.marketplace || '');
  const [brand, setBrand] = useState(initial.brand || '');
  const [title, setTitle] = useState(initial.title || '');
  const [body, setBody] = useState(initial.body || '');
  const [busy, setBusy] = useState(false);
  // İsteğe bağlı "Hatırlat" tarihi
  const r0 = initial.remind_at ? new Date(initial.remind_at) : null;
  const [remind, setRemind] = useState(!!r0);
  const [rDate, setRDate] = useState(r0 ? toDateInput(r0) : toDateInput(addDays(startOfDay(new Date()), 1)));
  const [rTime, setRTime] = useState(r0 ? toTimeInput(r0) : '09:00');
  const [alerts, setAlerts] = useState(() => normAlerts(initial.alerts || alertDefaults.note));

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await onSave({
        id: initial.id, marketplace: mp || null, brand: brand || null, title: title.trim(), body: body.trim(), updated_at: new Date().toISOString(),
        // Sütunlar yoksa (14 numaralı SQL) bozmamak için yalnız gerektiğinde gönder
        ...(remind || initial.remind_at ? { remind_at: remind ? combine(rDate, rTime).toISOString() : null, alerts: remind ? alerts : null } : {})
      });
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
        <label className="wl-check">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          <span>Bu notu bana hatırlat (takvime de eklenir)</span>
        </label>
        {remind ? (
          <>
            <div className="row2">
              <div className="field">
                <label htmlFor="n-rdate">Tarih</label>
                <input id="n-rdate" type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="n-rtime">Saat</label>
                <input id="n-rtime" type="time" value={rTime} onChange={(e) => setRTime(e.target.value)} required />
              </div>
            </div>
            <AlertPicker id="n-al" value={alerts} onChange={setAlerts} mode="timed" />
          </>
        ) : null}
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Kampanya ----------
export function CampaignSheet({ initial, onClose, onSave, onDelete, alertDefaults = DEFAULT_ALERTS }) {
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
  // İsteğe bağlı saatler (boşsa tüm gün)
  const [timed, setTimed] = useState(!!(initial.start_time || initial.end_time));
  const [sTime, setSTime] = useState(initial.start_time || '10:00');
  const [eTime, setETime] = useState(initial.end_time || '23:59');
  const badTime = timed && start === end && eTime <= sTime;
  // Hatırlatmalar: kayıtlıysa o; eski kampanyada eski sabit davranış (3 ve 1 gün önce); yeni kayıtta varsayılan
  const legacy = (k) => (k === 'etkinlik' ? { list: [] } : { list: ['3d', '1d'], at: '09:00' });
  const [alerts, setAlerts] = useState(() => normAlerts(initial.alerts || (isEdit ? legacy(initial.kind) : alertDefaults[initial.kind === 'etkinlik' ? 'event' : 'campaign'])));
  const [alertsTouched, setAlertsTouched] = useState(false);
  const changeAlerts = (v) => { setAlerts(v); setAlertsTouched(true); };
  const switchKind = (k) => { setKind(k); if (!isEdit && !alertsTouched) setAlerts(normAlerts(alertDefaults[k === 'etkinlik' ? 'event' : 'campaign'])); };
  const invalid = !name.trim() || !start || !end || end < start || badTime;
  const days = start && end && end >= start ? Math.round((fromDateInput(end) - fromDateInput(start)) / 86400000) + 1 : 0;
  const setLen = (n) => { if (!start) return; setEnd(toDateInput(addDays(fromDateInput(start), n - 1))); };

  const submit = async (e) => {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    try {
      await onSave(
        { id: initial.id, name: name.trim(), marketplace: mp || null, start_date: start, end_date: end, notes: notes.trim() || null, kind,
          // Sütunlar henüz yoksa (13 numaralı SQL) bozmamak için yalnız gerektiğinde gönder
          ...(timed || initial.start_time || initial.end_time ? { start_time: timed ? sTime : null, end_time: timed ? eTime : null } : {}),
          alerts, ...(loc.text.trim() || initial.location ? { location: loc.text.trim() || null, location_geo: loc.text.trim() ? (loc.geo || null) : null } : {}) },
        isEdit || isEvent ? null : preps.split('\n').map((s) => s.trim()).filter(Boolean)
      );
    } finally { setBusy(false); }
  };

  return (
    <Sheet title={isEdit ? (isEvent ? 'Etkinliği düzenle' : 'Kampanyayı düzenle') : (isEvent ? 'Yeni etkinlik' : 'Yeni kampanya')} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!isEdit && (
          <div className="seg" role="group" aria-label="Tür">
            <button type="button" className={!isEvent ? 'on' : ''} onClick={() => switchKind('kampanya')}>Kampanya</button>
            <button type="button" className={isEvent ? 'on' : ''} onClick={() => switchKind('etkinlik')}>Etkinlik</button>
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
          <button type="button" className={'chip' + (timed ? ' on' : '')} aria-pressed={timed} onClick={() => setTimed(!timed)}>🕒 Saat {timed ? 'var' : 'ekle'}</button>
        </div>
        {timed ? (
          <>
            <div className="row2">
              <div className="field">
                <label htmlFor="c-stime">Başlangıç saati</label>
                <input id="c-stime" type="time" value={sTime} onChange={(e) => setSTime(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="c-etime">Bitiş saati</label>
                <input id="c-etime" type="time" value={eTime} onChange={(e) => setETime(e.target.value)} required aria-invalid={badTime} />
              </div>
            </div>
            <div className="typechips" role="group" aria-label="Hazır saatler">
              {[['00:00', '23:59', 'Tüm gün (00:00–23:59)'], ['10:00', '23:59', '10:00 → 23:59'], ['12:00', '23:59', '12:00 → 23:59']].map(([a, b, l]) => (
                <button key={l} type="button" className={'chip' + (sTime === a && eTime === b ? ' on' : '')} onClick={() => { setSTime(a); setETime(b); }}>{l}</button>
              ))}
            </div>
            {badTime ? <span className="hint" style={{ color: 'var(--danger)', marginTop: -6 }}>Aynı gün bitiyorsa bitiş saati başlangıçtan sonra olmalı.</span> : null}
          </>
        ) : null}
        {!isEdit && !isEvent && (
          <div className="field">
            <label htmlFor="c-preps">Hazırlık adımları (her satıra bir tane)</label>
            <textarea id="c-preps" value={preps} onChange={(e) => setPreps(e.target.value)} />
          </div>
        )}
        <AlertPicker id="c-al" value={alerts} onChange={changeAlerts} mode={timed ? 'timed' : 'allday'} allowDaily />
        <LocationField id="c-loc" value={loc} onChange={setLoc} />
        <div className="field">
          <label htmlFor="c-notes">Not (isteğe bağlı)</label>
          <input id="c-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="hint" style={{ margin: 0 }}>{timed ? 'Google Takvim\'e başlangıç ve bitiş saatiyle eklenir.' : 'Google Takvim\'e seçtiğin günleri kaplayan tüm gün etkinliği olarak eklenir.'} Bildirimler yukarıda seçtiğin zamanlarda gelir.</p>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || invalid}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Varsayılan hatırlatmalar ----------
export function AlertDefaultsSheet({ defaults, onClose, onSave }) {
  const [vals, setVals] = useState(() => ({ ...defaults }));
  const [busy, setBusy] = useState(false);
  const mode = (k) => (k === 'campaign' || k === 'event' || k === 'special' || k === 'collab' ? 'allday' : 'timed');
  return (
    <Sheet title="Varsayılan hatırlatmalar" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p className="hint" style={{ margin: 0 }}>Yeni kayıtlar bu ayarlarla açılır; her kayıtta ayrıca değiştirebilirsin. Kayıtlı olanlar etkilenmez. Kampanya ve etkinlikte saat verirsen "tam zamanında / dakika önce" seçenekleri de çıkar.</p>
        {ALERT_TYPES.map(([k, l]) => (
          <div key={k} className="setup-box" style={{ gap: 8 }}>
            <AlertPicker id={'d-' + k} title={l} value={vals[k]} onChange={(v) => setVals({ ...vals, [k]: v })} mode={mode(k)}
              allowDaily={k === 'campaign' || k === 'event'} allowNag={k === 'reminder' || k === 'call'} />
          </div>
        ))}
        <div className="actions">
          <button type="button" className="btn big" onClick={() => setVals({ ...DEFAULT_ALERTS })}>İlk haline döndür</button>
          <button type="button" className="btn big primary" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(vals); } finally { setBusy(false); } }}>Kaydet</button>
        </div>
      </div>
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

// Bildirim çubuğunda kalıcı "Ajanda özeti" (widget yerine)
function SummarySetup({ token }) {
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const url = window.location.origin + '/api/summary?token=' + token;
  const look = async () => {
    setBusy(true);
    try {
      const r = await fetch(url, { cache: 'no-store' });
      setPreview(r.ok ? await r.text() : 'Önizleme alınamadı (' + r.status + ').');
    } catch { setPreview('Önizleme alınamadı. Örnek modda bu özellik çalışmaz.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="setup-box">
      <span className="lbl" style={{ fontSize: 15 }}>Bildirim çubuğunda Ajanda özeti</span>
      <p className="hint" style={{ margin: 0, fontSize: 14 }}>Sıradaki işin, bugünkü iş sayısı, dünkü ciro, süren kampanya ve yaklaşan özel gün; bildirim çubuğunda sürekli duran tek bir bildirimde görünür ve kendiliğinden yenilenir. MacroDroid'de yeni bir makro kur:</p>
      <ol className="steps">
        <li><b>Tetikleyici:</b> Tarih/Saat → <b>Düzenli Aralık</b> → <b>30 dakika</b>. (İstersen ikinci tetikleyici olarak <b>Cihaz Açılışı</b>.)</li>
        <li><b>Eylem 1:</b> Bağlanılabilirlik → <b>HTTP İsteği</b> → Yöntem: <b>GET</b> → URL'ye aşağıdaki satırı yapıştır. Ayarlarda <b>"Yanıtı değişkene kaydet"</b>i aç ve <b>ozet</b> adında yeni bir metin değişkeni seç.</li>
        <li><b>Eylem 2:</b> Bildirim → <b>Bildirim Göster</b> → Başlık: <b>Ajanda</b>, Metin: <b>[lv=ozet]</b>. <b>Kalıcı</b> (kaydırarak kapanmasın) ve <b>önceki bildirimin üzerine yaz</b> seçeneklerini aç; bildirime dokununca Ajanda açılsın diye tıklama eylemi olarak bu sitenin adresini ver.</li>
        <li>Kaydet ve makroyu bir kez elle çalıştır.</li>
      </ol>
      <CopyBox label="URL (tamamını kopyala)" value={url} />
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={look}>{busy ? 'Alınıyor…' : 'Özeti önizle'}</button>
      {preview ? <pre className="sum-preview">{preview}</pre> : null}
      <p className="hint" style={{ margin: 0 }}>Bu adres yalnız bu kısa özeti verir; anahtarı bilen biri özeti görebilir. "Yeni anahtar oluştur" dersen eski adresler çalışmaz olur, MacroDroid'deki URL'leri yenilemen gerekir.</p>
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
          <div className="setup-box">
            <span className="lbl" style={{ fontSize: 15 }}>Arama bitince otomatik "Arandı"</span>
            <p className="hint" style={{ margin: 0, fontSize: 14 }}>Aranacaklar listesindeki birini telefonla aradığında kayıt kendiliğinden "Arandı" olur; o numaradan gelen cevapsız çağrı da kapanır. MacroDroid'de yeni bir makro kur:</p>
            <ol className="steps">
              <li><b>Tetikleyici:</b> Arama → <b>Arama Bitti</b> → <b>Giden</b> → Herhangi bir numara.</li>
              <li><b>Eylem:</b> Bağlanılabilirlik → <b>HTTP İsteği</b> → Yöntem: <b>POST</b>.</li>
              <li><b>URL</b> kutusuna aşağıdaki satırın tamamını yapıştır (anahtar ve numara içinde hazır).</li>
              <li>Kaydet. Bir sonraki aramadan itibaren çalışır.</li>
            </ol>
            <CopyBox label="URL (tamamını kopyala)" value={window.location.origin + '/api/call-done?token=' + token + '&number=[call_number]'} />
            <p className="hint" style={{ margin: 0 }}>Not: Karşı taraf açmasa bile arama bitince işaretlenir; gerekirse kaydın işaretini kaldırabilirsin.</p>
          </div>
          <SummarySetup token={token} />
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
export function AccountSheet({ email, google, demo, onClose, onReconnect, onRefresh, onSignOut, onMissedSetup, onAlertDefaults, yarimHidden, onToggleYarim, backup, onBackupNow, onDownload, onRestore }) {
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
        {onAlertDefaults ? <button type="button" className="btn big" onClick={onAlertDefaults}>🔔 Varsayılan hatırlatmalar</button> : null}
        <button type="button" className="btn big" onClick={onMissedSetup}>Telefon bağlantısı (MacroDroid: cevapsız çağrı, arama, bildirim özeti)</button>
        <button type="button" className="btn big" onClick={onToggleYarim} aria-pressed={!yarimHidden}>{yarimHidden ? 'Yarim alanını göster' : 'Yarim alanını bu cihazda gizle'}</button>
        <button type="button" className="btn big" onClick={onRefresh}>Verileri yenile</button>
        {!demo && <button type="button" className="btn big danger" onClick={onSignOut}>Çıkış yap</button>}
      </div>
    </Sheet>
  );
}
