import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './ui.jsx';
import { parseQuick } from './parse.js';
import { MARKETPLACES, BRANDS, DEFAULT_PREPS, mpColor } from './constants.js';
import { toDateInput, toTimeInput, combine, whenLabel, addDays, startOfDay } from './dates.js';

const EXAMPLES = ['yarın 10:00 HB fiyat güncelle', 'Cuma 15:00 kargo firmasını ara', 'not: Trendyol komisyon oranını kontrol et'];

function MpSelect({ value, onChange, id, emptyLabel = 'Yok' }) {
  return (
    <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {MARKETPLACES.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
    </select>
  );
}

// ---------- Hızlı ekle ----------
function YarimToggle({ on, onClick }) {
  return (
    <button type="button" className={'chip yarim-chip' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on}>
      {on ? '❤️' : '🤍'} Yarim
    </button>
  );
}

export function QuickAdd({ onClose, onSave, onDetail, defaultYarim }) {
  const [q, setQ] = useState('');
  const [typeOverride, setTypeOverride] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => inputRef.current && inputRef.current.focus(), 50); return () => clearTimeout(t); }, []);

  const [yarimOverride, setYarimOverride] = useState(defaultYarim ? true : null);
  const p = useMemo(() => parseQuick(q), [q]);
  const type = typeOverride || p.type;
  const yarim = yarimOverride !== null ? yarimOverride : p.yarim;

  const build = () => ({ ...p, type, yarim });

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    try { await onSave(build()); } finally { setBusy(false); }
  };

  return (
    <Sheet title="Hızlı ekle" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="quick">Yaz; tarih, saat, pazaryeri ve türü kendisi anlar.</label>
          <input id="quick" ref={inputRef} type="text" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ör. yarın 10:00 HB fiyat güncelle" enterKeyHint="done" />
        </div>
        <div className="typechips" role="group" aria-label="Tür">
          {['Hatırlatma', 'Arama', 'Not'].map((t) => (
            <button key={t} type="button" className={'chip' + (type === t ? ' on' : '')} onClick={() => setTypeOverride(t)} aria-pressed={type === t}>{t}</button>
          ))}
          {type !== 'Not' && <YarimToggle on={yarim} onClick={() => setYarimOverride(!yarim)} />}
        </div>
        {q.trim() ? (
          <div className="parsed">
            <span>Zaman: {type === 'Not' ? '—' : p.date ? whenLabel(p.date) + (p.hasTime ? '' : ' (varsayılan saat)') : 'Tarihsiz'}</span>
            {!yarim || type === 'Not' ? <span><span className="dot" style={{ background: p.mp ? mpColor(p.mp) : '#C9C6BE' }} />{p.mp || 'Pazaryeri yok'}</span> : null}
            {p.brand ? <span>Marka: {p.brand}</span> : null}
          </div>
        ) : (
          <div className="examples">
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

// ---------- Hatırlatma / Arama ----------
export function ItemSheet({ initial, onClose, onSave, onDelete }) {
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
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    const due = date ? combine(date, time).toISOString() : null;
    try {
      if (kind === 'reminder') await onSave('reminders', { id: initial.id, title: title.trim(), marketplace: yarim ? null : (mp || null), due_at: due, for_yarim: yarim });
      else await onSave('calls', { id: initial.id, who: title.trim(), topic: topic.trim() || null, phone: phone.trim() || null, due_at: due, for_yarim: yarim });
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
          <input id="f-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
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
        <div className="typechips">
          <YarimToggle on={yarim} onClick={() => setYarim(!yarim)} />
          <span className="hint" style={{ alignSelf: 'center' }}>{yarim ? 'Yarim alanında görünür, bildirimin sonunda ❤️ olur' : 'Yarim ile ilgiliyse işaretle'}</span>
        </div>
        {kind === 'reminder' && !yarim && (
          <div className="field">
            <label htmlFor="f-mp">Pazaryeri</label>
            <MpSelect id="f-mp" value={mp} onChange={setMp} />
          </div>
        )}
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
  const [busy, setBusy] = useState(false);
  const invalid = !name.trim() || !start || !end || end < start;

  const submit = async (e) => {
    e.preventDefault();
    if (invalid || busy) return;
    setBusy(true);
    try {
      await onSave(
        { id: initial.id, name: name.trim(), marketplace: mp || null, start_date: start, end_date: end, notes: notes.trim() || null },
        isEdit ? null : preps.split('\n').map((s) => s.trim()).filter(Boolean)
      );
    } finally { setBusy(false); }
  };

  return (
    <Sheet title={isEdit ? 'Kampanyayı düzenle' : 'Yeni kampanya'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="c-name">Kampanya adı</label>
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
        {!isEdit && (
          <div className="field">
            <label htmlFor="c-preps">Hazırlık adımları (her satıra bir tane)</label>
            <textarea id="c-preps" value={preps} onChange={(e) => setPreps(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="c-notes">Not (isteğe bağlı)</label>
          <input id="c-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="hint" style={{ margin: 0 }}>Kampanya Google Takvim'e tüm gün etkinliği olarak eklenir. Başlangıçtan 3 gün ve 1 gün önce saat 09:00'da hazırlık hatırlatması gelir.</p>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || invalid}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Hesap ----------
export function AccountSheet({ email, google, demo, onClose, onReconnect, onRefresh, onSignOut }) {
  const gText = { ok: 'Bağlı', checking: 'Kontrol ediliyor…', needs_login: 'Yeniden bağlanmalı', error: 'Ulaşılamıyor', off: 'Örnek modda kapalı' }[google] || google;
  return (
    <Sheet title="Hesap" onClose={onClose}>
      <div className="card list">
        <div className="row timeline"><span className="tcol">Hesap</span><span>{demo ? 'Örnek veri (demo)' : email}</span></div>
        <div className="row timeline"><span className="tcol">Google</span><span>{gText}</span></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!demo && <button type="button" className="btn big" onClick={onReconnect}>Google Takvim'i yeniden bağla</button>}
        <button type="button" className="btn big" onClick={onRefresh}>Verileri yenile</button>
        {!demo && <button type="button" className="btn big danger" onClick={onSignOut}>Çıkış yap</button>}
      </div>
    </Sheet>
  );
}
