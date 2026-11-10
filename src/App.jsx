import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { TodayScreen, CalendarScreen, CampaignsScreen, NotesScreen, CallsScreen, YarimPanel, MarketplacePanel, marketplaceCounts } from './screens.jsx';
import { Sheet } from './ui.jsx';
import { QuickAdd, ItemSheet, NoteSheet, CampaignSheet, AccountSheet, YarimSettingsSheet, MissedSetupSheet } from './sheets.jsx';
import { prettyPhone, normalizePhone } from './whatsapp.js';
import { MARKETPLACES, DEFAULT_PREPS } from './constants.js';
import { addDays, startOfDay, weekStart, fmtLong, rangeLabel, toDateInput } from './dates.js';
import { checkGoogle, listEvents, GoogleAuthError, clearGoogleCache, lastGoogleReason } from './google.js';
import { syncReminder, syncCall, syncCampaign, unsyncCampaign } from './sync.js';

const TABS = [
  { id: 'bugun', label: 'Bugün', icon: Icon.Today },
  { id: 'takvim', label: 'Takvim', icon: Icon.Calendar },
  { id: 'kampanya', label: 'Kampanya', icon: Icon.Megaphone },
  { id: 'notlar', label: 'Notlar', icon: Icon.Note },
  { id: 'aramalar', label: 'Aramalar', icon: Icon.Phone }
];

const EMPTY = { reminders: [], calls: [], notes: [], daily_notes: [], campaigns: [], campaign_tasks: [], missed_calls: [] };

export default function App({ store, demo, email, onSignOut, onReconnect, googleSave }) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('ajanda-tab') || 'bugun'; } catch { return 'bugun'; } });
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [google, setGoogle] = useState(demo ? 'off' : 'checking');
  const [events, setEvents] = useState([]);
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [now, setNow] = useState(() => new Date());
  const toastTimer = useRef(null);
  const loadedRange = useRef(null);

  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => { try { sessionStorage.setItem('ajanda-tab', tab); } catch { /* yok say */ } }, [tab]);

  // Saat her dakika güncellensin
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // ---------- Veriyi yükle ----------
  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    try {
      const all = await store.loadAll();
      setData({ ...EMPTY, ...all });
    } catch (e) {
      console.error(e);
      say('Veriler yüklenemedi. İnternet bağlantını kontrol et.');
    } finally {
      setLoading(false);
    }
  }, [store, say]);

  useEffect(() => { load(false); }, [load]);

  // ---------- Yarim: WhatsApp ayarları ve kalp sayacı ----------
  const [love, setLove] = useState({ phone: '', message: '', count: 0, token: '' });

  // Yarim alanı bu cihazda gizli mi? (cihaza özel; telefonda açık, iş bilgisayarında kapalı olabilir)
  const [yarimHidden, setYarimHiddenState] = useState(() => { try { return localStorage.getItem('ajanda-yarim-hidden') === '1'; } catch { return false; } });
  const setYarimHidden = (v) => {
    setYarimHiddenState(v);
    try { if (v) localStorage.setItem('ajanda-yarim-hidden', '1'); else localStorage.removeItem('ajanda-yarim-hidden'); } catch { /* yok say */ }
  };
  // Gizliyken Yarim kayıtları hiçbir listede görünmez
  const viewData = useMemo(() => (yarimHidden
    ? { ...data, reminders: data.reminders.filter((r) => !r.for_yarim), calls: data.calls.filter((c) => !c.for_yarim) }
    : data), [data, yarimHidden]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, c] = await Promise.all([store.getSettings(), store.loveCount()]);
        if (alive) setLove({ phone: s.yarim_phone || '', message: s.love_message || '', count: c, token: s.webhook_token || '' });
      } catch (e) { console.warn('Yarim ayarları yüklenemedi', e); }
    })();
    return () => { alive = false; };
  }, [store]);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') { setNow(new Date()); load(true); loadedRange.current = null; refreshEvents(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  // ---------- Google ----------
  useEffect(() => {
    if (demo) return;
    let alive = true;
    checkGoogle()
      .then(() => { if (alive) { setGoogle('ok'); loadedRange.current = null; } })
      .catch((e) => alive && setGoogle(e instanceof GoogleAuthError ? 'needs_login' : 'error'));
    return () => { alive = false; };
    // googleSave: Google'dan dönüldüğünde anahtarlar kaydedilince yeniden kontrol et
  }, [demo, googleSave]);

  useEffect(() => {
    if (googleSave && !googleSave.ok && googleSave.error && googleSave.error !== 'no_refresh_token_from_google') {
      say('Google bağlantısı kaydedilemedi: ' + googleSave.error);
    }
  }, [googleSave, say]);

  const range = useMemo(() => {
    const today = startOfDay(now);
    const a = weekStart(day) < today ? weekStart(day) : today;
    const ws = addDays(weekStart(day), 7);
    const b = ws > addDays(today, 4) ? ws : addDays(today, 4);
    return [a, b];
  }, [day, now]);

  const refreshEvents = useCallback(async () => {
    if (google !== 'ok') return;
    const key = range[0].toISOString() + range[1].toISOString();
    if (loadedRange.current === key) return;
    loadedRange.current = key;
    try {
      const ev = await listEvents(range[0], range[1]);
      setEvents(ev);
    } catch (e) {
      loadedRange.current = null;
      if (e instanceof GoogleAuthError) setGoogle('needs_login');
      else say('Google Takvim etkinlikleri alınamadı.');
    }
  }, [google, range, say]);

  useEffect(() => { refreshEvents(); }, [refreshEvents]);

  // Google'a yazma: başarısız olursa veri yine kaydedilir, sadece uyarı verilir
  const gsync = useCallback(async (fn) => {
    if (google !== 'ok') return undefined;
    try {
      return await fn();
    } catch (e) {
      console.error(e);
      if (e instanceof GoogleAuthError) setGoogle('needs_login');
      else say('Kaydedildi, ama Google Takvim\'e yazılamadı.');
      return undefined;
    }
  }, [google, say]);

  // Google bağlandığında, bağlantı yokken eklenmiş ileri tarihli kayıtları da takvime yaz
  const pendingDone = useRef(false);
  useEffect(() => {
    if (google !== 'ok' || loading || pendingDone.current) return;
    pendingDone.current = true;
    const t = new Date();
    (async () => {
      for (const r of data.reminders.filter((x) => !x.done && x.due_at && !x.google_event_id && new Date(x.due_at) > t)) {
        const id = await gsync(() => syncReminder(r));
        if (id) { await store.update('reminders', r.id, { google_event_id: id }); patchLocal('reminders', r.id, { google_event_id: id }); }
      }
      for (const c of data.calls.filter((x) => !x.done && x.due_at && !x.google_event_id && new Date(x.due_at) > t)) {
        const id = await gsync(() => syncCall(c));
        if (id) { await store.update('calls', c.id, { google_event_id: id }); patchLocal('calls', c.id, { google_event_id: id }); }
      }
      for (const c of data.campaigns.filter((x) => !x.google_event_id && x.end_date >= toDateInput(t))) {
        const ids = await gsync(() => syncCampaign(c));
        if (ids) { await store.update('campaigns', c.id, ids); patchLocal('campaigns', c.id, ids); }
      }
    })().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google, loading]);

  // ---------- Yerel durum yardımcıları ----------
  const patchLocal = (table, id, patch) => setData((d) => ({ ...d, [table]: d[table].map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addLocal = (table, rows) => setData((d) => ({ ...d, [table]: [...d[table], ...rows] }));
  const removeLocal = (table, id) => setData((d) => ({ ...d, [table]: d[table].filter((r) => r.id !== id), ...(table === 'campaigns' ? { campaign_tasks: d.campaign_tasks.filter((t) => t.campaign_id !== id) } : {}) }));

  const fail = (e) => { console.error(e); say('İşlem yapılamadı. İnternet bağlantını kontrol edip tekrar dene.'); };

  // ---------- Hatırlatma & arama ----------
  const saveItem = async (table, input) => {
    const { missedId, ...fields } = input;
    try {
      const syncFn = table === 'reminders' ? syncReminder : syncCall;
      let row;
      if (fields.id) {
        const prev = data[table].find((x) => x.id === fields.id) || {};
        row = await store.update(table, fields.id, fields);
        patchLocal(table, row.id, row);
        const id = await gsync(() => syncFn({ ...prev, ...row }));
        if (id !== undefined && id !== row.google_event_id) { await store.update(table, row.id, { google_event_id: id }); patchLocal(table, row.id, { google_event_id: id }); }
      } else {
        const { id: _drop, ...rest } = fields;
        row = await store.insert(table, rest);
        addLocal(table, [row]);
        const id = await gsync(() => syncFn(row));
        if (id) { await store.update(table, row.id, { google_event_id: id }); patchLocal(table, row.id, { google_event_id: id }); }
      }
      if (missedId) {
        await store.update('missed_calls', missedId, { handled: true });
        patchLocal('missed_calls', missedId, { handled: true });
      }
      setSheet(null);
      say(table === 'reminders' ? 'Hatırlatma kaydedildi' : 'Arama kaydedildi');
    } catch (e) { fail(e); }
  };

  const deleteItem = async (table, item) => {
    if (!window.confirm('Silinsin mi? Bu işlem geri alınamaz.')) return;
    try {
      if (item.google_event_id) await gsync(() => (table === 'reminders' ? syncReminder({ ...item, done: true }) : syncCall({ ...item, done: true })));
      await store.remove(table, item.id);
      removeLocal(table, item.id);
      setSheet(null);
      say('Silindi');
    } catch (e) { fail(e); }
  };

  const toggle = async (table, item) => {
    const done = !item.done;
    patchLocal(table, item.id, { done });
    try {
      await store.update(table, item.id, { done });
      const id = await gsync(() => (table === 'reminders' ? syncReminder({ ...item, done }) : syncCall({ ...item, done })));
      if (id !== undefined && id !== item.google_event_id) { await store.update(table, item.id, { google_event_id: id }); patchLocal(table, item.id, { google_event_id: id }); }
    } catch (e) { patchLocal(table, item.id, { done: item.done }); fail(e); }
  };

  // ---------- Notlar ----------
  const saveNote = async (fields) => {
    try {
      if (fields.id) { const row = await store.update('notes', fields.id, fields); patchLocal('notes', row.id, row); }
      else { const { id: _drop, ...rest } = fields; const row = await store.insert('notes', rest); addLocal('notes', [row]); }
      setSheet(null);
      say('Not kaydedildi');
    } catch (e) { fail(e); }
  };
  const deleteNote = async (n) => {
    if (!window.confirm('Not silinsin mi?')) return;
    try { await store.remove('notes', n.id); removeLocal('notes', n.id); setSheet(null); say('Not silindi'); } catch (e) { fail(e); }
  };
  const saveDaily = async (date, body) => {
    try {
      const row = await store.upsertDaily(date, body);
      setData((d) => ({ ...d, daily_notes: d.daily_notes.some((x) => x.note_date === date) ? d.daily_notes.map((x) => (x.note_date === date ? row : x)) : [...d.daily_notes, row] }));
      return true;
    } catch (e) { console.error(e); return false; }
  };

  // ---------- Kampanyalar ----------
  const saveCampaign = async (fields, preps) => {
    try {
      let row;
      if (fields.id) {
        row = await store.update('campaigns', fields.id, fields);
        patchLocal('campaigns', row.id, row);
      } else {
        const { id: _drop, ...rest } = fields;
        row = await store.insert('campaigns', rest);
        addLocal('campaigns', [row]);
        if (preps && preps.length) {
          const tasks = await store.insertMany('campaign_tasks', preps.map((label, i) => ({ campaign_id: row.id, label, sort: i, done: false })));
          addLocal('campaign_tasks', tasks);
        }
      }
      const ids = await gsync(() => syncCampaign(row));
      if (ids) { await store.update('campaigns', row.id, ids); patchLocal('campaigns', row.id, ids); }
      setSheet(null);
      say(row.kind === 'etkinlik' ? 'Etkinlik kaydedildi' : 'Kampanya kaydedildi');
    } catch (e) {
      if (/kind/.test((e && e.message) || '')) { console.error(e); say('Kaydedilemedi: Supabase\'de 06 numaralı SQL\'i (etkinlik) çalıştırman gerekiyor.'); }
      else fail(e);
    }
  };
  const deleteCampaign = async (c) => {
    if (!window.confirm('"' + c.name + '" ' + (c.kind === 'etkinlik' ? 'etkinliği' : 'kampanyası ve hazırlık adımları') + ' silinsin mi?')) return;
    try {
      await gsync(() => unsyncCampaign(c));
      await store.remove('campaigns', c.id);
      removeLocal('campaigns', c.id);
      setSheet(null);
      say(c.kind === 'etkinlik' ? 'Etkinlik silindi' : 'Kampanya silindi');
    } catch (e) { fail(e); }
  };
  const toggleTask = async (t) => {
    patchLocal('campaign_tasks', t.id, { done: !t.done });
    try { await store.update('campaign_tasks', t.id, { done: !t.done }); } catch (e) { patchLocal('campaign_tasks', t.id, { done: t.done }); fail(e); }
  };
  const addTask = async (c, label, sort) => {
    try { const row = await store.insert('campaign_tasks', { campaign_id: c.id, label, sort, done: false }); addLocal('campaign_tasks', [row]); } catch (e) { fail(e); }
  };
  const deleteTask = async (t) => {
    try { await store.remove('campaign_tasks', t.id); removeLocal('campaign_tasks', t.id); } catch (e) { fail(e); }
  };

  // ---------- Hızlı ekle ----------
  const quickSave = async (p) => {
    const due = p.date ? p.date.toISOString() : null;
    if (p.type === 'Kampanya' || p.type === 'Etkinlik') {
      const st = p.date ? startOfDay(p.date) : startOfDay(new Date());
      const en = p.endDate ? startOfDay(p.endDate) : st;
      await saveCampaign(
        { name: p.title || (p.type === 'Kampanya' ? 'Kampanya' : 'Etkinlik'), marketplace: p.mp || null, start_date: toDateInput(st), end_date: toDateInput(en), notes: null, kind: p.type === 'Kampanya' ? 'kampanya' : 'etkinlik' },
        p.type === 'Kampanya' ? DEFAULT_PREPS : null
      );
    } else if (p.type === 'Not') {
      await saveNote({ marketplace: p.mp || null, brand: p.brand || null, title: p.title || 'Not', body: '' });
      setTab('notlar');
    } else if (p.type === 'Arama') {
      await saveItem('calls', { who: p.title || 'Arama', topic: null, phone: null, due_at: due, for_yarim: !!p.yarim });
    } else {
      await saveItem('reminders', { title: p.title || 'Hatırlatma', marketplace: p.yarim ? null : (p.mp || null), due_at: due, for_yarim: !!p.yarim });
    }
  };
  const quickDetail = (p) => {
    if (p.type === 'Kampanya' || p.type === 'Etkinlik') {
      const st = p.date ? startOfDay(p.date) : startOfDay(new Date());
      setSheet({ kind: 'campaign', item: { name: p.title, marketplace: p.mp, start_date: toDateInput(st), end_date: toDateInput(p.endDate ? startOfDay(p.endDate) : st), kind: p.type === 'Kampanya' ? 'kampanya' : 'etkinlik' } });
    } else if (p.type === 'Not') setSheet({ kind: 'note', item: { marketplace: p.mp, brand: p.brand, title: p.title } });
    else setSheet({ kind: 'item', item: { kind: p.type === 'Arama' ? 'call' : 'reminder', title: p.title, marketplace: p.mp, due_at: p.date ? p.date.toISOString() : null, for_yarim: !!p.yarim } });
  };

  const actions = {
    toggleReminder: (r) => toggle('reminders', r),
    toggleCall: (c) => toggle('calls', c),
    openReminder: (r) => setSheet({ kind: 'item', item: { ...r, kind: 'reminder' } }),
    openCall: (c) => setSheet({ kind: 'item', item: { ...c, kind: 'call', title: c.who } }),
    newCall: () => setSheet({ kind: 'item', item: { kind: 'call' } }),
    newYarim: () => setSheet({ kind: 'quick', yarim: true }),
    openYarimSettings: () => setSheet({ kind: 'yarimSettings' }),
    openYarim: () => setSheet({ kind: 'yarim' }),
    hideYarim: () => { setYarimHidden(true); setSheet(null); say('Yarim alanı bu cihazda gizlendi. Geri açmak için: sağ üstteki etiket › Hesap'); },
    openMissedSetup: () => setSheet({ kind: 'missedSetup' }),
    missedDone: async (m) => {
      patchLocal('missed_calls', m.id, { handled: true });
      try { await store.update('missed_calls', m.id, { handled: true }); } catch (e) { patchLocal('missed_calls', m.id, { handled: false }); fail(e); }
    },
    missedClearAll: async () => {
      const open = data.missed_calls.filter((m) => !m.handled);
      setData((d) => ({ ...d, missed_calls: d.missed_calls.map((m) => ({ ...m, handled: true })) }));
      try { for (const m of open) await store.update('missed_calls', m.id, { handled: true }); } catch (e) { fail(e); load(true); }
    },
    missedLater: (m) => {
      const due = new Date(Date.now() + 60 * 60000);
      due.setMinutes(due.getMinutes() < 30 ? 30 : 60, 0, 0);
      setSheet({ kind: 'item', item: { kind: 'call', title: m.name || prettyPhone(m.phone) || 'Cevapsız arama', phone: m.phone ? '+' + normalizePhone(m.phone) : '', topic: 'Cevapsız arama', due_at: due.toISOString(), missedId: m.id } });
    },
    loveTapped: (e) => {
      const el = e && e.currentTarget;
      if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      setLove((l) => ({ ...l, count: l.count + 1 }));
      store.addLove().catch((err) => {
        console.error(err);
        setLove((l) => ({ ...l, count: Math.max(0, l.count - 1) }));
        say('Kalp sayacı kaydedilemedi.');
      });
    },
    newItemOn: (d) => { const x = new Date(d); x.setHours(9, 0, 0, 0); setSheet({ kind: 'item', item: { kind: 'reminder', due_at: x.toISOString() } }); },
    openCampaign: (c) => setSheet({ kind: 'campaign', item: c }),
    newEventOn: (d) => setSheet({ kind: 'campaign', item: { start_date: toDateInput(d), end_date: toDateInput(d), kind: 'etkinlik' } }),
    openMarketplace: (name) => setSheet({ kind: 'mp', name }),
    newReminderFor: (name) => setSheet({ kind: 'item', item: { kind: 'reminder', marketplace: name } }),
    openNote: (n) => setSheet({ kind: 'note', item: n }),
    toggleTask, addTask, deleteTask, saveDaily
  };

  const createToken = async () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    try {
      const s = await store.saveSettings({ webhook_token: token });
      setLove((l) => ({ ...l, token: s.webhook_token || token }));
    } catch (e) {
      console.error(e);
      say('Anahtar kaydedilemedi. Supabase\'de 05 numaralı SQL\'i çalıştırdın mı?');
    }
  };
  const testMissed = async () => {
    if (demo) {
      const row = await store.insert('missed_calls', { name: 'Test', phone: '905001112233', missed_at: new Date().toISOString(), handled: false });
      addLocal('missed_calls', [row]);
      return '✓ Test kaydı eklendi (örnek mod).';
    }
    try {
      const r = await fetch('/api/missed-call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: love.token, name: 'Test', number: '905001112233' }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { await load(true); return j.duplicate ? '✓ Bağlantı çalışıyor (son 2 dakikada zaten test kaydı vardı).' : '✓ Bağlantı çalışıyor. Cevapsız çağrılar listesinde "Test" kaydını görebilirsin.'; }
      if (j.error === 'missing_server_config') return '✗ Vercel\'de SUPABASE_SECRET_KEY tanımlı değil ya da tanımlandıktan sonra yeniden yayınlanmadı.';
      if (j.error === 'bad_token') return '✗ Gizli anahtar tanınmadı.';
      return '✗ Hata: ' + (j.message || j.error || r.status);
    } catch {
      return '✗ Sunucuya ulaşılamadı.';
    }
  };

  const saveYarimSettings = async (patch) => {
    try {
      const s = await store.saveSettings(patch);
      setLove((l) => ({ ...l, phone: s.yarim_phone || '', message: s.love_message || '' }));
      setSheet(null);
      say('Kaydedildi ❤️');
    } catch (e) {
      console.error(e);
      say('Kaydedilemedi. Supabase\'de 04 numaralı SQL\'i çalıştırdın mı?');
    }
  };

  const reconnect = () => { clearGoogleCache(); onReconnect && onReconnect(); };

  // ---------- Başlık ----------
  const today = startOfDay(now);
  const openCalls = data.calls.filter((c) => !c.done).length;
  const upcomingCamps = data.campaigns.filter((c) => c.end_date >= toDateInput(today)).length;
  const head = {
    bugun: ['Bugün', fmtLong(today)],
    takvim: ['Takvim', rangeLabel(weekStart(day), addDays(weekStart(day), 6))],
    kampanya: ['Kampanyalar', upcomingCamps + ' aktif / yaklaşan kampanya'],
    notlar: ['Notlar', 'Pazaryeri ve günlük notlar'],
    aramalar: ['Aramalar', openCalls + ' aranacak']
  }[tab];

  const gPill = {
    ok: { text: 'Google senkron', color: '#2B8A3E' },
    checking: { text: 'Bağlanıyor…', color: '#B8B5AD' },
    needs_login: { text: 'Google bağlı değil', color: '#C92A2A' },
    error: { text: 'Google ulaşılamıyor', color: '#E67700' },
    off: { text: 'Örnek mod', color: '#B8B5AD' }
  }[google];

  const mpCounts = marketplaceCounts(viewData, now);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="logo"><Icon.Calendar width="18" height="18" /></span>Ajanda</div>
        <button type="button" className="btn primary big" onClick={() => setSheet({ kind: 'quick' })}>+ Hızlı ekle</button>
        <nav className="sidenav" aria-label="Ana menü">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <t.icon width="20" height="20" />{t.label}
            </button>
          ))}
        </nav>
        <div>
          <div className="side-label">Pazaryerleri</div>
          {MARKETPLACES.map((m) => (
            <button key={m.name} type="button" className="side-mp" onClick={() => setSheet({ kind: 'mp', name: m.name })}>
              <span className="dot" style={{ background: m.color, width: 9, height: 9 }} /><span style={{ flex: '1 1 auto' }}>{m.name}</span>
              {mpCounts[m.name] ? <span className="mp-count">{mpCounts[m.name]}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" className={'pill' + (google === 'needs_login' ? ' warn' : '')} style={{ marginTop: 'auto', justifyContent: 'flex-start' }} onClick={() => setSheet({ kind: 'account' })}>
          <span className="dot" style={{ background: gPill.color }} />{gPill.text}
        </button>
      </aside>

      <div className="main">
        <header className="topbar">
          <div style={{ minWidth: 0 }}>
            <div className="sub">{head[1]}</div>
            <h1>{head[0]}</h1>
          </div>
          <button type="button" className={'pill' + (google === 'needs_login' ? ' warn' : '')} onClick={() => setSheet({ kind: 'account' })} aria-label={'Hesap ve bağlantı: ' + gPill.text}>
            <span className="dot" style={{ background: gPill.color }} />{gPill.text}
          </button>
        </header>

        <main className="content">
          {google === 'needs_login' ? (
            <div className="banner">
              <span>Google Takvim bağlantısı yenilenmeli. Hatırlatmaların takvime gitmesi için bir kez daha giriş yap.{lastGoogleReason ? <><br /><small style={{ opacity: 0.8 }}>Neden: {lastGoogleReason}</small></> : null}</span>
              <button type="button" onClick={reconnect}>Yeniden bağla</button>
            </div>
          ) : null}
          {demo ? <div className="banner" style={{ background: 'var(--accent-soft)', borderColor: '#C9D2F2', color: 'var(--ink)' }}><span>Örnek moddasın: Veriler sadece bu tarayıcıda durur, Google Takvim'e gitmez.</span></div> : null}

          {loading ? <div className="spinner">Yükleniyor…</div> : (
            <>
              {tab === 'bugun' && <TodayScreen data={viewData} events={events} google={google} now={now} actions={actions} goTab={setTab} love={love} yarimHidden={yarimHidden} />}
              {tab === 'takvim' && <CalendarScreen data={viewData} events={events} google={google} now={now} day={day} setDay={setDay} actions={actions} yarimHidden={yarimHidden} />}
              {tab === 'kampanya' && <CampaignsScreen data={data} actions={actions} />}
              {tab === 'notlar' && <NotesScreen data={data} now={now} actions={actions} />}
              {tab === 'aramalar' && <CallsScreen data={viewData} now={now} actions={actions} missedConfigured={!!love.token} />}
            </>
          )}
        </main>
      </div>

      <button type="button" className="fab" aria-label="Hızlı ekle" onClick={() => setSheet({ kind: 'quick' })}><Icon.Plus /></button>

      <nav className="bottomnav" aria-label="Ana menü">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={'navbtn' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <t.icon />{t.label}
          </button>
        ))}
      </nav>

      {sheet && sheet.kind === 'quick' && <QuickAdd onClose={() => setSheet(null)} onSave={quickSave} onDetail={quickDetail} defaultYarim={!!sheet.yarim} yarimHidden={yarimHidden} />}
      {sheet && sheet.kind === 'item' && <ItemSheet initial={sheet.item} onClose={() => setSheet(null)} onSave={saveItem} onDelete={deleteItem} yarimHidden={yarimHidden} />}
      {sheet && sheet.kind === 'note' && <NoteSheet initial={sheet.item} onClose={() => setSheet(null)} onSave={saveNote} onDelete={deleteNote} />}
      {sheet && sheet.kind === 'campaign' && <CampaignSheet initial={sheet.item} onClose={() => setSheet(null)} onSave={saveCampaign} onDelete={deleteCampaign} />}
      {sheet && sheet.kind === 'yarim' && (
        <Sheet title="Yarim" onClose={() => setSheet(null)}>
          <YarimPanel data={data} now={now} actions={actions} love={love} />
        </Sheet>
      )}
      {sheet && sheet.kind === 'mp' && (
        <Sheet title={sheet.name} onClose={() => setSheet(null)}>
          <MarketplacePanel name={sheet.name} data={viewData} now={now} actions={actions} />
        </Sheet>
      )}
      {sheet && sheet.kind === 'missedSetup' && (
        <MissedSetupSheet token={love.token} onClose={() => setSheet(null)} onCreateToken={createToken} onTest={testMissed} />
      )}
      {sheet && sheet.kind === 'yarimSettings' && (
        <YarimSettingsSheet initial={love} count={love.count} onClose={() => setSheet(null)} onSave={saveYarimSettings} />
      )}
      {sheet && sheet.kind === 'account' && (
        <AccountSheet email={email} google={google} demo={demo} onClose={() => setSheet(null)} onReconnect={reconnect} onMissedSetup={() => setSheet({ kind: 'missedSetup' })} yarimHidden={yarimHidden} onToggleYarim={() => { setYarimHidden(!yarimHidden); say(yarimHidden ? 'Yarim alanı gösteriliyor ❤️' : 'Yarim alanı bu cihazda gizlendi'); }}
          onRefresh={() => { setSheet(null); loadedRange.current = null; load(false); refreshEvents(); }} onSignOut={onSignOut} />
      )}

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}
