import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { TodayScreen, CalendarScreen, CallsScreen, YarimPanel, MarketplacePanel, marketplaceCounts } from './screens.jsx';
import { WorkScreen, PrivateScreen, WORK_TABS, PRIVATE_TABS } from './areas.jsx';
import { MoneySheet, FixedSheet, BudgetSheet, ReceiptScanSheet } from './wallet.jsx';
import { nextFixedDue } from './money.js';
import { Sheet } from './ui.jsx';
import { RevenueSheet, TargetSheet, marketplaceOrder, tl } from './revenue.jsx';
import { QuickAdd, ItemSheet, NoteSheet, CampaignSheet, AccountSheet, YarimSettingsSheet, MissedSetupSheet, YarimToggle, AlertDefaultsSheet } from './sheets.jsx';
import { alertDefaults as mergeAlertDefaults } from './alerts.js';
import { MemorySheet, YarimItemSheet, nextSaturdayEvening, randomSurpriseDate, pickSurpriseIdea, SURPRISE_PREFIX } from './yarim.jsx';
import { specialUpcoming, specialLabel } from './special.js';
import { FollowupSheet } from './work.jsx';
import { HabitSheet, ListSheet, ContactSheet, SpecialDateSheet, findContact, nextFriday17, SUMMARY_TITLE } from './life.jsx';
import { prettyPhone, normalizePhone } from './whatsapp.js';
import { MARKETPLACES, DEFAULT_PREPS, YARIM_STARTS } from './constants.js';
import { addDays, startOfDay, weekStart, fmtLong, rangeLabel, toDateInput, fromDateInput, whenLabel } from './dates.js';
import { nextOccurrence } from './recur.js';
import { checkGoogle, listEvents, GoogleAuthError, clearGoogleCache, lastGoogleReason, DriveScopeError, deleteEvent } from './google.js';
import { collectBackup, uploadToDrive, downloadJSON, backupName, parseBackup, summarize, BACKUP_TABLES } from './backup.js';
import { AdSheet } from './ads.jsx';
import { syncReminder, syncCall, syncCampaign, unsyncCampaign, syncSpecialDate, syncCollab, syncNote } from './sync.js';

const TABS = [
  { id: 'bugun', label: 'Bugün', icon: Icon.Today },
  { id: 'takvim', label: 'Takvim', icon: Icon.Calendar },
  { id: 'is', label: 'İş', icon: Icon.Briefcase },
  { id: 'ozel', label: 'Özel', icon: Icon.Home },
  { id: 'aramalar', label: 'Aramalar', icon: Icon.Phone }
];

const EMPTY = { reminders: [], calls: [], notes: [], daily_notes: [], campaigns: [], campaign_tasks: [], missed_calls: [], contacts: [], collabs: [], special_dates: [], lists: [], list_items: [], habits: [], habit_logs: [], money: [], money_fixed: [], yarim_items: [], memories: [], followups: [] };

export default function App({ store, demo, email, onSignOut, onReconnect, googleSave }) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(() => {
    let t = 'bugun';
    try { t = sessionStorage.getItem('ajanda-tab') || 'bugun'; } catch { /* yok say */ }
    return t === 'kampanya' ? 'is' : t === 'notlar' ? 'ozel' : t;
  });
  // İş ve Özel sekmelerinin alt bölümleri
  const ss = (k, d) => { try { return sessionStorage.getItem(k) || d; } catch { return d; } };
  const [isSeg, setIsSegState] = useState(() => (ss('ajanda-sales', '') === 'ciro' ? 'ciro' : ss('ajanda-is-seg', 'kampanya')));
  const [ozelSeg, setOzelSegState] = useState(() => ss('ajanda-ozel-seg', 'cuzdan'));
  const [yarimSeg, setYarimSegState] = useState(() => ss('ajanda-yarim-seg', 'ozet'));
  const setYarimSeg = (v) => { setYarimSegState(v); try { sessionStorage.setItem('ajanda-yarim-seg', v); } catch { /* yok say */ } };
  const [yarimPrefs, setYarimPrefs] = useState({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const setIsSeg = (v) => { setIsSegState(v); try { sessionStorage.setItem('ajanda-is-seg', v); sessionStorage.removeItem('ajanda-sales'); } catch { /* yok say */ } };
  const setOzelSeg = (v) => { setOzelSegState(v); try { sessionStorage.setItem('ajanda-ozel-seg', v); } catch { /* yok say */ } };
  const goTab = (t) => {
    if (t === 'kampanya' || t === 'ciro' || t === 'notlar' || t === 'influencer' || t === 'bekleyenler' || t === 'raporlar') { setSheet(null); setIsSeg(t); setTab('is'); }
    else if (t === 'yarim') { setOzelSeg('yarim'); setTab('ozel'); }
    else if (t === 'cuzdan' || t === 'listeler' || t === 'aliskanlik' || t === 'ozelgun' || t === 'gunluk') { setOzelSeg(t); setTab('ozel'); }
    else setTab(t);
  };
  // Bugün sayfası filtresi: Tümü / İş / Özel (bu cihazda hatırlanır)
  const [scope, setScopeState] = useState(() => { try { return localStorage.getItem('ajanda-scope') || 'tum'; } catch { return 'tum'; } });
  const setScope = (v) => { setScopeState(v); try { localStorage.setItem('ajanda-scope', v); } catch { /* yok say */ } };
  const [budgets, setBudgets] = useState({});
  // Türlere göre varsayılan hatırlatmalar (Hesap → Varsayılan hatırlatmalar)
  const [alertDefs, setAlertDefs] = useState(() => mergeAlertDefaults(null));
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

  // Ana ekran kısayolları: simgeye uzun bas → "Gider ekle", "Sesle ekle"…
  useEffect(() => {
    let k = '';
    try { k = new URLSearchParams(location.search).get('yeni') || ''; } catch { k = ''; }
    if (!k) return;
    try { const u = new URL(location.href); u.searchParams.delete('yeni'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch { /* yok say */ }
    const t = toDateInput(new Date());
    if (k === 'gider') { goTab('cuzdan'); setSheet({ kind: 'money', item: { kind: 'gider', day: t } }); }
    else if (k === 'ses') { setTab('bugun'); setSheet({ kind: 'quick', voice: true }); }
    else if (k === 'hatirlatma') { setSheet({ kind: 'item', item: { kind: 'reminder' } }); }
    else if (k === 'ciro') { goTab('ciro'); setSheet({ kind: 'revenue', day: t }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Paylaş → Ajanda" ile gelen metni hızlı ekle penceresinde aç
  useEffect(() => {
    let text = '';
    try { text = sessionStorage.getItem('ajanda-share') || ''; sessionStorage.removeItem('ajanda-share'); } catch { text = ''; }
    if (text) { setTab('bugun'); setSheet({ kind: 'quick', shared: text }); }
  }, []);

  // ---------- Yarim: WhatsApp ayarları ve kalp sayacı ----------
  const [love, setLove] = useState({ phone: '', message: '', count: 0, token: '' });

  // ---------- Ciro ----------
  const [revenue, setRevenue] = useState([]);
  const [revLoaded, setRevLoaded] = useState(false);
  const [revError, setRevError] = useState('');
  const [revTarget, setRevTarget] = useState(null);
  // ---------- Yedekleme ----------
  const [backup, setBackup] = useState({ last: null, status: 'idle', msg: '', loaded: false });
  const loadRevenue = useCallback(async () => {
    try {
      const rows = await store.loadRevenue(toDateInput(addDays(startOfDay(new Date()), -430)));
      setRevenue(rows); setRevError('');
    } catch (e) {
      console.error(e);
      setRevError(/revenue/.test((e && e.message) || '') ? 'Ciro takibi için Supabase\'de 09 numaralı SQL\'i çalıştırman gerekiyor.' : 'Ciro verileri yüklenemedi. İnternet bağlantını kontrol et.');
    } finally { setRevLoaded(true); }
  }, [store]);
  useEffect(() => { loadRevenue(); }, [loadRevenue]);
  const revOrder = useMemo(() => marketplaceOrder(revenue, now), [revenue, now]);
  const saveRevenue = async (day, entries) => {
    try {
      const rows = await store.saveRevenueDay(day, entries);
      setRevenue((r) => [...r.filter((x) => x.day !== day), ...rows]);
      setSheet(null);
      say('Ciro kaydedildi');
    } catch (e) {
      console.error(e);
      say(/revenue/.test((e && e.message) || '') ? 'Kaydedilemedi: Supabase\'de 09 numaralı SQL\'i çalıştırman gerekiyor.' : 'Ciro kaydedilemedi. İnternet bağlantını kontrol et.');
    }
  };
  const saveTarget = async (v) => {
    try { const s2 = await store.saveSettings({ revenue_target: v }); setRevTarget(s2.revenue_target || null); setSheet(null); say(v ? 'Hedef kaydedildi' : 'Hedef kaldırıldı'); }
    catch (e) { console.error(e); say('Hedef kaydedilemedi. Supabase\'de 09 numaralı SQL\'i çalıştırdın mı?'); }
  };

  // Yarim alanı bu cihazda gizli mi? (cihaza özel; telefonda açık, iş bilgisayarında kapalı olabilir)
  const [yarimHidden, setYarimHiddenState] = useState(() => { try { return localStorage.getItem('ajanda-yarim-hidden') === '1'; } catch { return false; } });
  const setYarimHidden = (v) => {
    setYarimHiddenState(v);
    try { if (v) localStorage.setItem('ajanda-yarim-hidden', '1'); else localStorage.removeItem('ajanda-yarim-hidden'); } catch { /* yok say */ }
  };
  // Gizliyken Yarim kayıtları hiçbir listede görünmez
  const viewData = useMemo(() => (yarimHidden
    ? { ...data, reminders: data.reminders.filter((r) => !r.for_yarim), calls: data.calls.filter((c) => !c.for_yarim), special_dates: data.special_dates.filter((x) => !x.for_yarim) }
    : data), [data, yarimHidden]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, c] = await Promise.all([store.getSettings(), store.loveCount()]);
        if (alive) { setLove({ phone: s.yarim_phone || '', message: s.love_message || '', count: c, token: s.webhook_token || '' }); setRevTarget(s.revenue_target || null); setBudgets(s.budgets || {}); setAlertDefs(mergeAlertDefaults(s.alert_defaults)); setYarimPrefs(s.yarim_prefs || {}); setPrefsLoaded(true); setBackup((b) => ({ ...b, last: s.last_backup_at || b.last, loaded: true })); }
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

  // Bugün sayfasındaki aylık takvimin gösterdiği ay (ayın 1'i)
  const [month, setMonth] = useState(() => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), 1); });

  const range = useMemo(() => {
    const today = startOfDay(now);
    const gridA = weekStart(month);
    const gridB = addDays(gridA, 42);
    const a = [weekStart(day), today, gridA].reduce((x, y) => (y < x ? y : x));
    const b = [addDays(weekStart(day), 7), addDays(today, 4), gridB].reduce((x, y) => (y > x ? y : x));
    return [a, b];
  }, [day, now, month]);

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
      for (const x of data.special_dates.filter((y) => !y.google_event_id)) {
        await applySync('special_dates', x, await gsync(() => syncSpecialDate(x)));
      }
      for (const x of data.collabs.filter((y) => !y.google_event_id && y.status !== 'iptal' && (y.end_at ? new Date(y.end_at) > t : y.publish_date && y.publish_date >= toDateInput(t)))) {
        await applySync('collabs', x, await gsync(() => syncCollab(x, (data.contacts.find((k) => k.id === x.contact_id) || {}).name)));
      }
      for (const n of data.notes.filter((y) => y.remind_at && !y.google_event_id && new Date(y.remind_at) > t)) {
        const id = await gsync(() => syncNote(n));
        if (id) { await store.update('notes', n.id, { google_event_id: id }); patchLocal('notes', n.id, { google_event_id: id }); }
      }
    })().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google, loading]);

  // Telefondan "Arandı" işaretlenen aramaların takvim etkinliğini temizle
  const cleaning = useRef(new Set());
  useEffect(() => {
    if (google !== 'ok' || loading) return;
    const todo = data.calls.filter((c) => c.done && c.google_event_id && !cleaning.current.has(c.id));
    if (!todo.length) return;
    todo.forEach((c) => cleaning.current.add(c.id));
    (async () => {
      for (const c of todo) {
        const id = await gsync(() => syncCall(c));
        if (id === null) { await store.update('calls', c.id, { google_event_id: null }); patchLocal('calls', c.id, { google_event_id: null }); }
      }
    })().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google, loading, data.calls]);

  // ---------- Yerel durum yardımcıları ----------
  const patchLocal = (table, id, patch) => setData((d) => ({ ...d, [table]: d[table].map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addLocal = (table, rows) => setData((d) => ({ ...d, [table]: [...d[table], ...rows] }));
  const removeLocal = (table, id) => setData((d) => ({
    ...d,
    [table]: d[table].filter((r) => r.id !== id),
    ...(table === 'campaigns' ? { campaign_tasks: d.campaign_tasks.filter((t) => t.campaign_id !== id) } : {}),
    ...(table === 'lists' ? { list_items: d.list_items.filter((t) => t.list_id !== id) } : {}),
    ...(table === 'habits' ? { habit_logs: d.habit_logs.filter((t) => t.habit_id !== id) } : {}),
    ...(table === 'contacts' ? { collabs: d.collabs.filter((t) => t.contact_id !== id) } : {})
  }));
  const replaceLocal = (table, id, row) => setData((d) => ({ ...d, [table]: d[table].map((r) => (r.id === id ? row : r)) }));

  const fail = (e) => {
    console.error(e);
    const msg = (e && e.message) || '';
    if (/collabs/.test(msg) && /commission/.test(msg)) say('Kaydedilemedi: Komisyon oranı için Supabase\'de 18 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/collabs/.test(msg) && /start_at|end_at|platform|handle/.test(msg)) say('Kaydedilemedi: Influencer reklamları için Supabase\'de 17 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/followups|nudge_/.test(msg)) say('Kaydedilemedi: Bekleyenler için Supabase\'de 16 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/yarim_items|memories|yarim_prefs|anilar/.test(msg)) say('Kaydedilemedi: Yarim bölümü için Supabase\'de 15 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/alerts|remind_at|aux_event_id|alert_defaults/.test(msg)) say('Kaydedilemedi: Hatırlatma seçimleri için Supabase\'de 14 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/receipt_path|fisler|bucket/i.test(msg)) say('Kaydedilemedi: Fiş fotoğrafı için Supabase\'de 12 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/money|scope|budgets/.test(msg) && /schema cache|does not exist|relation|column/.test(msg)) say('Kaydedilemedi: Bu özellik için Supabase\'de 11 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/contacts|collabs|special_dates|list_items|lists|habits|habit_logs/.test(msg) && /schema cache|does not exist|relation/.test(msg)) say('Kaydedilemedi: Bu özellik için Supabase\'de 10 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/location_geo/.test(msg)) say('Kaydedilemedi: Harita konumu için Supabase\'de 08 numaralı SQL\'i çalıştırman gerekiyor.');
    else if (/location/.test(msg)) say('Kaydedilemedi: Konum için Supabase\'de 07 numaralı SQL\'i çalıştırman gerekiyor.');
    else say('İşlem yapılamadı. İnternet bağlantını kontrol edip tekrar dene.' + (msg ? ' (' + msg.slice(0, 90) + ')' : ''));
  };

  // ---------- Hatırlatma & arama ----------
  const saveItem = async (table, input, quiet) => {
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
      if (!quiet) { setSheet(null); say(table === 'reminders' ? 'Hatırlatma kaydedildi' : 'Arama kaydedildi'); }
      return row;
    } catch (e) { fail(e); return null; }
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
    // Tekrarlayan hatırlatma: tamamlanınca bir sonraki tarihe kayar
    if (table === 'reminders' && item.repeat_rule && item.due_at && !item.done) {
      const due = new Date(item.due_at);
      const next = nextOccurrence(due, item.repeat_rule, due > new Date() ? due : new Date());
      if (next) {
        const patch = { due_at: next.toISOString() };
        patchLocal('reminders', item.id, patch);
        try {
          await store.update('reminders', item.id, patch);
          const id = await gsync(() => syncReminder({ ...item, ...patch }));
          if (id !== undefined && id !== item.google_event_id) { await store.update('reminders', item.id, { google_event_id: id }); patchLocal('reminders', item.id, { google_event_id: id }); }
          say('Tamamlandı ✓ Sonraki: ' + whenLabel(next));
        } catch (e) { patchLocal('reminders', item.id, { due_at: item.due_at }); fail(e); }
        return;
      }
    }
    const done = !item.done;
    if (table === 'calls') cleaning.current.add(item.id);
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
      let row;
      if (fields.id) { row = await store.update('notes', fields.id, fields); patchLocal('notes', row.id, row); }
      else { const { id: _drop, ...rest } = fields; row = await store.insert('notes', rest); addLocal('notes', [row]); }
      // Hatırlat tarihi verildiyse (ya da kaldırıldıysa) takvimi güncelle
      if (row.remind_at || row.google_event_id) {
        const id = await gsync(() => syncNote(row));
        if (id !== undefined && id !== (row.google_event_id || null)) { await store.update('notes', row.id, { google_event_id: id }); patchLocal('notes', row.id, { google_event_id: id }); }
      }
      setSheet(null);
      say(row.remind_at ? 'Not kaydedildi · 🔔 ' + whenLabel(new Date(row.remind_at)) : 'Not kaydedildi');
    } catch (e) { fail(e); }
  };
  const deleteNote = async (n) => {
    if (!window.confirm('Not silinsin mi?')) return;
    try {
      if (n.google_event_id) await gsync(() => deleteEvent(n.google_event_id));
      await store.remove('notes', n.id); removeLocal('notes', n.id); setSheet(null); say('Not silindi');
    } catch (e) { fail(e); }
  };
  const saveAlertDefaults = async (v) => {
    try { const s2 = await store.saveSettings({ alert_defaults: v }); setAlertDefs(mergeAlertDefaults(s2.alert_defaults || v)); setSheet(null); say('Varsayılan hatırlatmalar kaydedildi'); }
    catch (e) { fail(e); }
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
      const m = (e && e.message) || '';
      if (/start_time|end_time/.test(m)) { console.error(e); say('Kaydedilemedi: Kampanya saati için Supabase\'de 13 numaralı SQL\'i çalıştırman gerekiyor.'); }
      else if (/location/.test(m)) fail(e);
      else if (/'kind'|"kind"|\bkind\b/.test(m) && /column|schema cache/.test(m)) { console.error(e); say('Kaydedilemedi: Supabase\'de 13 numaralı SQL\'i çalıştırman gerekiyor.'); }
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

  // ---------- Rehber, iş birlikleri, özel günler, listeler, alışkanlıklar ----------
  const contactName = (id) => (data.contacts.find((k) => k.id === id) || {}).name;
  const saveRow = async (table, fields, okMsg) => {
    try {
      let row;
      if (fields.id) { row = await store.update(table, fields.id, fields); patchLocal(table, row.id, row); }
      else { const { id: _drop, ...rest } = fields; row = await store.insert(table, rest); addLocal(table, [row]); }
      if (table === 'special_dates') await applySync(table, row, await gsync(() => syncSpecialDate(row)));
      if (table === 'collabs') await applySync(table, row, await gsync(() => syncCollab(row, contactName(row.contact_id))));
      setSheet(null);
      if (okMsg) say(okMsg);
      return row;
    } catch (e) { fail(e); return null; }
  };
  // Google'dan dönen kimlikleri (ana ve yardımcı etkinlik) kayda işle
  const applySync = async (table, row, res) => {
    if (!res || typeof res !== 'object') return;
    const patch = {};
    if (res.google_event_id !== undefined && res.google_event_id !== (row.google_event_id || null)) patch.google_event_id = res.google_event_id;
    if (res.aux_event_id !== undefined && res.aux_event_id !== (row.aux_event_id || null)) patch.aux_event_id = res.aux_event_id;
    if (!Object.keys(patch).length) return;
    try { await store.update(table, row.id, patch); patchLocal(table, row.id, patch); } catch (e) { console.error(e); }
  };
  const deleteRow = async (table, row, question) => {
    if (question && !window.confirm(question)) return;
    try {
      if (row.google_event_id) await gsync(() => deleteEvent(row.google_event_id));
      if (row.aux_event_id) await gsync(() => deleteEvent(row.aux_event_id));
      if (table === 'contacts') for (const c of data.collabs.filter((x) => x.contact_id === row.id && x.google_event_id)) await gsync(() => deleteEvent(c.google_event_id));
      await store.remove(table, row.id);
      removeLocal(table, row.id);
      setSheet(null);
      say('Silindi');
    } catch (e) { fail(e); }
  };
  const toggleHabit = async (h, day) => {
    const ex = data.habit_logs.find((l) => l.habit_id === h.id && l.day === day);
    if (ex) {
      removeLocal('habit_logs', ex.id);
      try { await store.remove('habit_logs', ex.id); } catch (e) { addLocal('habit_logs', [ex]); fail(e); }
      return;
    }
    const tmp = { id: 'tmp-' + Date.now(), habit_id: h.id, day };
    addLocal('habit_logs', [tmp]);
    try { const row = await store.insert('habit_logs', { habit_id: h.id, day }); replaceLocal('habit_logs', tmp.id, row); }
    catch (e) { removeLocal('habit_logs', tmp.id); fail(e); }
  };
  const addListItems = async (list, labels, start) => {
    try {
      const rows = await store.insertMany('list_items', labels.map((label, i) => ({ list_id: list.id, label, done: false, sort: start + i })));
      addLocal('list_items', rows);
    } catch (e) { fail(e); }
  };
  const toggleListItem = async (t) => {
    patchLocal('list_items', t.id, { done: !t.done });
    try { await store.update('list_items', t.id, { done: !t.done }); } catch (e) { patchLocal('list_items', t.id, { done: t.done }); fail(e); }
  };
  const deleteListItem = async (t) => {
    removeLocal('list_items', t.id);
    try { await store.remove('list_items', t.id); } catch (e) { addLocal('list_items', [t]); fail(e); }
  };
  const clearListDone = async (list) => {
    const done = data.list_items.filter((t) => t.list_id === list.id && t.done);
    setData((d) => ({ ...d, list_items: d.list_items.filter((t) => !done.includes(t)) }));
    try { for (const t of done) await store.remove('list_items', t.id); } catch (e) { fail(e); load(true); }
  };
  const addWeeklySummaryReminder = () => saveItem('reminders', { title: SUMMARY_TITLE, marketplace: null, due_at: nextFriday17().toISOString(), for_yarim: false, repeat_rule: 'weekly' });

  // ---------- Cüzdan ----------
  const fixedReminder = (f) => ({
    title: (f.kind === 'gelir' ? '💰 ' : '💳 ') + f.title + ' · ' + tl(f.amount), marketplace: null, for_yarim: false, scope: 'ozel',
    due_at: nextFixedDue(f).toISOString(), repeat_rule: 'monthly'
  });
  const removeReminderQuiet = async (id) => {
    const r = data.reminders.find((x) => x.id === id);
    if (!r) return;
    if (r.google_event_id) await gsync(() => syncReminder({ ...r, done: true }));
    await store.remove('reminders', id);
    removeLocal('reminders', id);
  };
  const saveFixed = async (f) => {
    const row = await saveRow('money_fixed', f, 'Sabit kalem kaydedildi');
    if (!row) return;
    try {
      const has = row.reminder_id && data.reminders.some((x) => x.id === row.reminder_id);
      if (row.remind) {
        const rem = await saveItem('reminders', { ...(has ? { id: row.reminder_id } : {}), ...fixedReminder(row) }, true);
        if (rem && rem.id !== row.reminder_id) { await store.update('money_fixed', row.id, { reminder_id: rem.id }); patchLocal('money_fixed', row.id, { reminder_id: rem.id }); }
      } else if (has) {
        await removeReminderQuiet(row.reminder_id);
        await store.update('money_fixed', row.id, { reminder_id: null }); patchLocal('money_fixed', row.id, { reminder_id: null });
      }
    } catch (e) { fail(e); }
  };
  const deleteFixed = async (f) => {
    if (!window.confirm('"' + f.title + '" silinsin mi? Geçmiş ödemeler kayıtlarda kalır.')) return;
    try { if (f.reminder_id) await removeReminderQuiet(f.reminder_id); } catch (e) { console.error(e); }
    await deleteRow('money_fixed', f);
  };
  const payFixed = async (f, due) => {
    const t = startOfDay(new Date());
    const sameMonth = due.getFullYear() === t.getFullYear() && due.getMonth() === t.getMonth();
    const row = await saveRow('money', { kind: f.kind || 'gider', amount: f.amount, category: f.category, note: f.title, method: f.method || null, fixed_id: f.id, day: toDateInput(sameMonth ? t : due) });
    if (row) say(f.title + (f.kind === 'gelir' ? ' geldi olarak işaretlendi' : ' ödendi olarak işaretlendi') + ' ✓');
  };
  const saveBudgets = async (b) => {
    try { const s2 = await store.saveSettings({ budgets: b }); setBudgets(s2.budgets || b); setSheet(null); say('Bütçe kaydedildi'); }
    catch (e) { fail(e); }
  };
  // Fiş fotoğrafı varsa önce yükle; yüklenemezse kayıt fotoğrafsız yapılır
  const saveMoney = async (f) => {
    const { _receipt, ...fields } = f;
    if (_receipt) {
      try {
        let blob = _receipt.blob;
        if (!blob && _receipt.file) blob = await (await import('./receipt.js')).shrinkImage(_receipt.file);
        if (blob) fields.receipt_path = await store.uploadReceipt(blob, fields.day);
      } catch (e) {
        console.error(e);
        say('Fiş fotoğrafı yüklenemedi (Supabase\'de 12 numaralı SQL\'i çalıştırdın mı?). Kayıt fotoğrafsız yapılıyor.');
      }
    }
    return saveRow('money', fields, moneyMsg(fields) + (fields.receipt_path ? ' · 🧾' : ''));
  };
  const deleteMoney = async (m) => {
    if (!window.confirm('Bu kayıt silinsin mi?' + (m.receipt_path ? ' Fiş fotoğrafı da silinir.' : ''))) return;
    if (m.receipt_path) { try { await store.removeReceipt(m.receipt_path); } catch (e) { console.error(e); } }
    await deleteRow('money', m);
  };
  const fileRef = useRef(null);
  const scanReceipt = () => { if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); } };
  const exportWallet = async (opts) => {
    say('Excel hazırlanıyor…');
    try { const { exportWallet: ex } = await import('./excel.js'); await ex({ ...opts, money: data.money, fixed: data.money_fixed, budgets }); say('Excel dosyası indirildi'); }
    catch (e) { console.error(e); say('Excel dosyası oluşturulamadı.'); }
  };
  const exportRevenue = async (month, mode) => {
    say('Excel hazırlanıyor…');
    try { const { exportRevenue: ex } = await import('./excel.js'); await ex({ revenue, month, mode }); say('Excel dosyası indirildi'); }
    catch (e) { console.error(e); say('Excel dosyası oluşturulamadı.'); }
  };
  const moneyMsg = (m) => (m.kind === 'gelir' ? 'Gelir kaydedildi' : 'Gider kaydedildi') + ' · ' + tl(m.amount, Number(m.amount) % 1 ? 2 : 0);

  // ---------- Yarim: anılar, sevdikleri, hediyeler, planlar, sürpriz ----------
  const photoUrl = useCallback((path) => store.photoUrl('anilar', path), [store]);
  const saveMemory = async (fields, { photo, removePhoto, oldPath }) => {
    const f = { ...fields };
    try {
      if (photo && photo.blob) f.photo_path = await store.uploadPhoto('anilar', photo.blob, (f.day || '').slice(0, 7));
      else if (removePhoto) f.photo_path = null;
    } catch (e) {
      console.error(e);
      say('Fotoğraf yüklenemedi (Supabase\'de 15 numaralı SQL\'i çalıştırdın mı?). Anı fotoğrafsız kaydediliyor.');
    }
    const row = await saveRow('memories', f, 'Anı kaydedildi 💗');
    if (row && oldPath && (removePhoto || (photo && photo.blob && f.photo_path)) && oldPath !== row.photo_path) { try { await store.removePhoto('anilar', oldPath); } catch { /* yok say */ } }
  };
  const deleteMemory = async (m) => {
    if (!window.confirm('"' + m.title + '" anısı silinsin mi?' + (m.photo_path ? ' Fotoğrafı da silinir.' : ''))) return;
    if (m.photo_path) { try { await store.removePhoto('anilar', m.photo_path); } catch { /* yok say */ } }
    await deleteRow('memories', m);
  };
  const toggleYarimItem = async (x) => {
    const patch = { done: !x.done, done_at: !x.done ? toDateInput(new Date()) : null };
    patchLocal('yarim_items', x.id, patch);
    try { await store.update('yarim_items', x.id, patch); if (!x.done) say(x.kind === 'hediye' ? 'Alındı olarak işaretlendi 🎁' : 'Yaptınız ✓ İstersen "Yaptıklarımız"dan anılara ekle'); }
    catch (e) { patchLocal('yarim_items', x.id, { done: x.done, done_at: x.done_at }); fail(e); }
  };
  const planToCalendar = (x) => setSheet({ kind: 'item', item: { kind: 'reminder', title: x.title, due_at: nextSaturdayEvening().toISOString(), for_yarim: true, location: x.location || '', location_geo: x.location_geo || '' } });
  const saveYarimPrefs = async (next) => {
    setYarimPrefs(next);
    try { const s2 = await store.saveSettings({ yarim_prefs: next }); setYarimPrefs(s2.yarim_prefs || next); return true; }
    catch (e) { fail(e); return false; }
  };
  // Sürpriz hatırlatması kur (açıksa ve bekleyen yoksa). Kurulumu yalnız aşağıdaki effect tetikler.
  const surpriseBusy = useRef(false);
  const scheduleSurprise = async (prefs) => {
    const sp = (prefs && prefs.surprise) || {};
    if (surpriseBusy.current || !sp.on) return;
    surpriseBusy.current = true;
    try {
      const when = randomSurpriseDate(sp.min || 3, sp.max || 4);
      const idea = pickSurpriseIdea(sp.ideas, data.yarim_items.filter((x) => x.kind === 'hediye'));
      const rem = await saveItem('reminders', { title: SURPRISE_PREFIX + idea, marketplace: null, due_at: when.toISOString(), for_yarim: true, alerts: { list: ['0'], at: '09:00' } }, true);
      if (rem) await saveYarimPrefs({ ...prefs, surprise: { ...sp, reminder_id: rem.id } });
    } catch (e) { console.error(e); } finally { surpriseBusy.current = false; }
  };
  const saveSurprise = async (sp, replan) => {
    const cur = yarimPrefs.surprise || {};
    const pending = cur.reminder_id ? data.reminders.find((r) => r.id === cur.reminder_id && !r.done) : null;
    // Kapatılınca ya da yeniden planlanınca bekleyen hatırlatmayı kaldır; yenisini effect kurar
    const drop = pending && (!sp.on || replan);
    if (drop) { try { await removeReminderQuiet(pending.id); } catch (e) { console.error(e); } }
    const next = { ...yarimPrefs, surprise: { min: 3, max: 4, ...sp, reminder_id: drop ? null : sp.reminder_id } };
    if (await saveYarimPrefs(next)) say(!next.surprise.on ? 'Sürpriz hatırlatıcısı kapatıldı' : replan ? 'Sürpriz yeniden planlandı 🌷' : 'Sürpriz hatırlatıcısı açık 🌷');
  };
  // Tamamlanan sürprizden sonra bir sonrakini kur
  useEffect(() => {
    if (loading || !prefsLoaded) return;
    const sp = yarimPrefs.surprise || {};
    if (!sp.on) return;
    const r = sp.reminder_id && data.reminders.find((x) => x.id === sp.reminder_id);
    if (!r || r.done) scheduleSurprise(yarimPrefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, prefsLoaded, data.reminders, yarimPrefs]);
  // Yarim doğum günü / yıl dönümüne 2 hafta kala "hediye listene bak" hatırlatması (yılda bir kez)
  const giftBusy = useRef(false);
  useEffect(() => {
    if (loading || !prefsLoaded || giftBusy.current || yarimHidden) return;
    const g = yarimPrefs.gifts || {};
    if (g.on === false) return;
    const nudged = g.nudged || {};
    const todo = specialUpcoming(data.special_dates.filter((x) => x.for_yarim), new Date(), 14)
      .filter(({ s, date }) => !nudged[s.id + ':' + date.getFullYear()]);
    if (!todo.length) return;
    giftBusy.current = true;
    (async () => {
      const done = { ...nudged };
      for (const { s, date, inDays } of todo) {
        let due = addDays(date, -14); due.setHours(10, 0, 0, 0);
        if (due < new Date()) due = new Date(Date.now() + 15 * 60000);
        const ideas = data.yarim_items.filter((x) => x.kind === 'hediye' && !x.done).length;
        const rem = await saveItem('reminders', { title: '🎁 ' + specialLabel(s, date) + ' yaklaşıyor (' + inDays + ' gün) — hediye listene bak' + (ideas ? ' (' + ideas + ' fikir)' : ''), marketplace: null, due_at: due.toISOString(), for_yarim: true, alerts: { list: ['0'], at: '09:00' } }, true);
        if (rem) done[s.id + ':' + date.getFullYear()] = true;
      }
      await saveYarimPrefs({ ...yarimPrefs, gifts: { ...g, nudged: done } });
    })().catch(console.error).finally(() => { giftBusy.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, prefsLoaded, data.special_dates]);

  // ---------- Bekleyen talepler ----------
  const nudgeTitle = (f) => '⏳ ' + (f.party ? f.party + ': ' : '') + f.title + ' — ' + f.nudge_days + ' gündür bekliyor, tekrar yaz';
  const syncNudge = async (f) => {
    const has = f.nudge_reminder_id && data.reminders.some((r) => r.id === f.nudge_reminder_id);
    if (!f.done && f.nudge_days) {
      let due = addDays(fromDateInput(f.since), f.nudge_days); due.setHours(10, 0, 0, 0);
      if (due < new Date()) due = new Date(Date.now() + 15 * 60000);
      const rem = await saveItem('reminders', { ...(has ? { id: f.nudge_reminder_id } : {}), title: nudgeTitle(f), marketplace: f.marketplace || null, due_at: due.toISOString(), for_yarim: false, alerts: { list: ['0'], at: '09:00' } }, true);
      if (rem && rem.id !== f.nudge_reminder_id) { await store.update('followups', f.id, { nudge_reminder_id: rem.id }); patchLocal('followups', f.id, { nudge_reminder_id: rem.id }); }
    } else if (has) {
      await removeReminderQuiet(f.nudge_reminder_id);
      await store.update('followups', f.id, { nudge_reminder_id: null }); patchLocal('followups', f.id, { nudge_reminder_id: null });
    }
  };
  const saveFollowup = async (f) => {
    const row = await saveRow('followups', f, 'Bekleyen talep kaydedildi');
    if (row) { try { await syncNudge(row); } catch (e) { console.error(e); } }
  };
  const doneFollowup = async (f) => {
    const patch = { done: !f.done, done_at: !f.done ? toDateInput(new Date()) : null };
    patchLocal('followups', f.id, patch);
    try {
      await store.update('followups', f.id, patch);
      await syncNudge({ ...f, ...patch });
      if (!f.done) { const n = Math.max(0, Math.round((startOfDay(new Date()) - fromDateInput(f.since)) / 86400000)); say('Tamamlandı ✓ ' + n + ' günde döndü'); }
    } catch (e) { patchLocal('followups', f.id, { done: f.done, done_at: f.done_at }); fail(e); }
  };
  const deleteFollowup = async (f) => {
    if (!window.confirm('"' + f.title + '" silinsin mi?')) return;
    try { if (f.nudge_reminder_id) await removeReminderQuiet(f.nudge_reminder_id); } catch (e) { console.error(e); }
    await deleteRow('followups', f);
  };
  const exportReport = async (opts) => {
    say('Excel hazırlanıyor…');
    try { const { exportReport: ex } = await import('./excel.js'); await ex(opts); say('Excel dosyası indirildi'); }
    catch (e) { console.error(e); say('Excel dosyası oluşturulamadı.'); }
  };

  // ---------- Hızlı ekle ----------
  const quickSave = async (p) => {
    const due = p.date ? p.date.toISOString() : null;
    // Bugün sayfasında İş ya da Özel seçiliyse yeni kayıt o alana yazılır
    const sc = scope === 'ozel' && !p.yarim && !p.mp ? { scope: 'ozel' } : {};
    if (p.type === 'Bekleyen') {
      await saveFollowup({ title: p.title || 'Talep', party: p.mp || null, marketplace: p.mp || null, since: toDateInput(new Date()) });
      return;
    }
    if (p.type === 'Para') {
      if (p.money) await saveMoney(p.money);
      else setSheet({ kind: 'money', item: { kind: 'gider', note: p.raw || '' } });
      return;
    }
    if (p.type === 'Kampanya' || p.type === 'Etkinlik') {
      const st = p.date ? startOfDay(p.date) : startOfDay(new Date());
      const en = p.endDate ? startOfDay(p.endDate) : st;
      await saveCampaign(
        { name: p.title || (p.type === 'Kampanya' ? 'Kampanya' : 'Etkinlik'), marketplace: p.mp || null, start_date: toDateInput(st), end_date: toDateInput(en), notes: null, kind: p.type === 'Kampanya' ? 'kampanya' : 'etkinlik', alerts: alertDefs[p.type === 'Kampanya' ? 'campaign' : 'event'] },
        p.type === 'Kampanya' ? DEFAULT_PREPS : null
      );
    } else if (p.type === 'Not') {
      await saveNote({ marketplace: p.mp || null, brand: p.brand || null, title: p.title || 'Not', body: p.shared || '' });
      goTab('notlar');
    } else if (p.type === 'Arama') {
      await saveItem('calls', { who: p.title || 'Arama', topic: null, phone: null, due_at: due, for_yarim: !!p.yarim, ...sc, ...(due ? { alerts: alertDefs.call } : {}) });
    } else {
      await saveItem('reminders', { title: p.title || 'Hatırlatma', marketplace: p.yarim ? null : (p.mp || null), due_at: due, for_yarim: !!p.yarim, ...sc, ...(p.repeat ? { repeat_rule: p.repeat } : {}), ...(due ? { alerts: alertDefs.reminder } : {}) });
    }
  };
  const quickDetail = (p) => {
    if (p.type === 'Para') { setSheet({ kind: 'money', item: p.money || { kind: 'gider', note: p.raw || '' } }); return; }
    if (p.type === 'Bekleyen') { setSheet({ kind: 'followup', item: { title: p.title, party: p.mp || '', marketplace: p.mp || null } }); return; }
    if (p.type === 'Kampanya' || p.type === 'Etkinlik') {
      const st = p.date ? startOfDay(p.date) : startOfDay(new Date());
      setSheet({ kind: 'campaign', item: { name: p.title, marketplace: p.mp, start_date: toDateInput(st), end_date: toDateInput(p.endDate ? startOfDay(p.endDate) : st), kind: p.type === 'Kampanya' ? 'kampanya' : 'etkinlik' } });
    } else if (p.type === 'Not') setSheet({ kind: 'note', item: { marketplace: p.mp, brand: p.brand, title: p.title, body: p.shared || '' } });
    else setSheet({ kind: 'item', item: { kind: p.type === 'Arama' ? 'call' : 'reminder', title: p.title, marketplace: p.mp, due_at: p.date ? p.date.toISOString() : null, for_yarim: !!p.yarim, repeat_rule: p.repeat || '', ...(scope === 'ozel' && !p.yarim && !p.mp ? { scope: 'ozel' } : {}) } });
  };

  const actions = {
    toggleReminder: (r) => toggle('reminders', r),
    toggleCall: (c) => toggle('calls', c),
    openReminder: (r) => setSheet({ kind: 'item', item: { ...r, kind: 'reminder' } }),
    openCall: (c) => setSheet({ kind: 'item', item: { ...c, kind: 'call', title: c.who } }),
    newCall: () => setSheet({ kind: 'item', item: { kind: 'call' } }),
    newYarim: () => setSheet({ kind: 'quick', yarim: true }),
    openYarimSettings: () => setSheet({ kind: 'yarimSettings' }),
    openYarim: () => { setSheet(null); setYarimSeg('ozet'); goTab('yarim'); },
    openMemory: (m) => setSheet({ kind: 'memory', item: m }),
    openFollowup: (f) => setSheet({ kind: 'followup', item: f }),
    doneFollowup, exportReport, goTab,
    openYarimItem: (x) => setSheet({ kind: 'yitem', item: x }),
    toggleYarimItem, planToCalendar, saveSurprise,
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
      const known = !m.name ? findContact(data.contacts, m.phone) : null;
      setSheet({ kind: 'item', item: { kind: 'call', title: m.name || (known && known.name) || prettyPhone(m.phone) || 'Cevapsız arama', phone: m.phone ? '+' + normalizePhone(m.phone) : '', topic: 'Cevapsız arama', due_at: due.toISOString(), missedId: m.id } });
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
    newCampaignOn: (d) => setSheet({ kind: 'campaign', item: { start_date: toDateInput(d), end_date: toDateInput(d), kind: 'kampanya' } }),
    newAdOn: (d) => { const x = new Date(d); x.setHours(10, 0, 0, 0); setSheet({ kind: 'collab', item: { start_at: x.toISOString() } }); },
    openMarketplace: (name) => setSheet({ kind: 'mp', name }),
    openRevenue: (day) => setSheet({ kind: 'revenue', day }),
    openTarget: () => setSheet({ kind: 'target' }),
    newReminderFor: (name) => setSheet({ kind: 'item', item: { kind: 'reminder', marketplace: name } }),
    openNote: (n) => setSheet({ kind: 'note', item: n }),
    openSpecial: (x) => setSheet({ kind: 'special', item: x }),
    openCollab: (x) => setSheet({ kind: 'collab', item: x }),
    openContact: (x) => setSheet({ kind: 'contact', item: x }),
    openHabit: (x) => setSheet({ kind: 'habit', item: x.id ? x : { ...x, sort: data.habits.length } }),
    openList: (x) => setSheet({ kind: 'list', item: x }),
    openMoney: (m) => setSheet({ kind: 'money', item: m }),
    openFixed: (f) => setSheet({ kind: 'fixed', item: f }),
    openBudget: () => setSheet({ kind: 'budget' }),
    payFixed, scanReceipt, exportWallet, exportRevenue,
    toggleHabit, addListItems, toggleListItem, deleteListItem, clearListDone, addWeeklySummaryReminder,
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

  const runDriveBackup = useCallback(async (silent) => {
    setBackup((b) => ({ ...b, status: 'running', msg: '' }));
    try {
      const obj = await collectBackup(store, email);
      await uploadToDrive(obj);
      const at = new Date().toISOString();
      try { await store.saveSettings({ last_backup_at: at }); } catch { /* sütun yoksa sadece bu cihazda */ }
      try { localStorage.setItem('ajanda-last-backup', at); } catch { /* yok say */ }
      setBackup((b) => ({ ...b, last: at, status: 'ok' }));
      if (!silent) say('Google Drive\'a yedeklendi ✓');
    } catch (e) {
      console.error(e);
      const status = e instanceof DriveScopeError ? 'needs_consent' : e.code === 'drive_api_disabled' ? 'api_disabled' : 'error';
      setBackup((b) => ({ ...b, status, msg: e.message || '' }));
      if (!silent) say(status === 'needs_consent' ? 'Drive yedeği için Google\'ı yeniden bağlaman gerekiyor.' : status === 'api_disabled' ? 'Google Cloud\'da Drive API kapalı.' : 'Yedekleme başarısız oldu.');
    }
  }, [store, email, say]);

  // Haftada bir otomatik yedek (Google bağlıyken, uygulama açıldığında)
  const autoTried = useRef(false);
  useEffect(() => {
    if (demo || google !== 'ok' || !backup.loaded || autoTried.current) return;
    autoTried.current = true;
    let last = backup.last;
    try { const l = localStorage.getItem('ajanda-last-backup'); if (l && (!last || l > last)) last = l; } catch { /* yok say */ }
    if (!last || Date.now() - new Date(last).getTime() > 7 * 86400000) runDriveBackup(true);
  }, [demo, google, backup.loaded, backup.last, runDriveBackup]);

  const downloadBackup = async () => {
    try { const obj = await collectBackup(store, email); downloadJSON(obj, backupName()); say('Yedek dosyası indirildi'); }
    catch (e) { console.error(e); say('Yedek dosyası oluşturulamadı.'); }
  };
  const restoreBackup = async (file) => {
    let b;
    try { b = parseBackup(await file.text()); } catch (e) { say(e.message && e.message.includes('Ajanda') ? e.message : 'Dosya okunamadı.'); return; }
    if (!window.confirm('Bu yedek geri yüklensin mi?\n\n' + new Date(b.exported_at).toLocaleString('tr-TR') + ' tarihli yedek\n' + summarize(b) + '\n\nMevcut kayıtların silinmez; yedekteki kayıtlar eklenir, aynı olanlar yedektekiyle güncellenir.')) return;
    setSheet(null);
    say('Geri yükleniyor…');
    let n = 0; const failed = [];
    for (const t of BACKUP_TABLES) {
      if (!b.tables[t]) continue;
      try { n += await store.restoreTable(t, b.tables[t]); } catch (e) { console.error(t, e); failed.push(t); }
    }
    await load(true); await loadRevenue();
    say(failed.length ? n + ' kayıt yüklendi; yüklenemeyen: ' + failed.join(', ') : n + ' kayıt geri yüklendi ✓');
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
    takvim: ['Takvim', fmtLong(now)],
    is: ['İş', isSeg === 'kampanya' ? upcomingCamps + ' aktif / yaklaşan kampanya' : (WORK_TABS.find((x) => x[0] === isSeg) || [, ''])[1]],
    ozel: ozelSeg === 'yarim' && !yarimHidden
      ? ['Yarim ❤️', YARIM_STARTS.map((x) => Math.floor(Math.max(0, now - x.start) / 86400000).toLocaleString('tr-TR')).join(' · ') + ' gündür birlikte']
      : ['Özel', (PRIVATE_TABS.find((x) => x[0] === ozelSeg) || [, ''])[1]],
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
              {tab === 'bugun' && <TodayScreen data={viewData} events={events} google={google} now={now} actions={actions} goTab={goTab} love={love} yarimHidden={yarimHidden} month={month} setMonth={setMonth} revenue={revenue} scope={scope} setScope={setScope} budgets={budgets} revReady={revLoaded && !revError} />}
              {tab === 'takvim' && <CalendarScreen data={viewData} events={events} google={google} now={now} day={day} setDay={setDay} month={month} setMonth={setMonth} actions={actions} yarimHidden={yarimHidden} />}
              {tab === 'is' && <WorkScreen seg={isSeg} setSeg={setIsSeg} data={data} now={now} actions={actions} revenue={revenue} revLoaded={revLoaded} revError={revError} revTarget={revTarget} revOrder={revOrder} />}
              {tab === 'ozel' && <PrivateScreen seg={ozelSeg} setSeg={setOzelSeg} data={viewData} now={now} actions={actions} budgets={budgets} yarimHidden={yarimHidden}
                yarim={{ seg: yarimSeg, setSeg: setYarimSeg, love, prefs: yarimPrefs, photoUrl }} />}
              {tab === 'aramalar' && <CallsScreen data={viewData} now={now} actions={actions} missedConfigured={!!love.token} />}
            </>
          )}
        </main>
      </div>

      <button type="button" className="fab" aria-label="Hızlı ekle" onClick={() => setSheet({ kind: 'quick' })}><Icon.Plus /></button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}
        onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) setSheet({ kind: 'scan', file: f }); }} />

      <nav className="bottomnav" aria-label="Ana menü">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={'navbtn' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
            <t.icon />{t.label}
          </button>
        ))}
      </nav>

      {sheet && sheet.kind === 'quick' && <QuickAdd onClose={() => setSheet(null)} onSave={quickSave} onDetail={quickDetail} defaultYarim={!!sheet.yarim} yarimHidden={yarimHidden} shared={sheet.shared} autoVoice={!!sheet.voice} />}
      {sheet && sheet.kind === 'item' && <ItemSheet initial={sheet.item} onClose={() => setSheet(null)} onSave={saveItem} onDelete={deleteItem} yarimHidden={yarimHidden} contacts={data.contacts} alertDefaults={alertDefs} />}
      {sheet && sheet.kind === 'special' && <SpecialDateSheet initial={sheet.item} yarimHidden={yarimHidden} YarimToggle={YarimToggle} alertDefaults={alertDefs} onClose={() => setSheet(null)}
        onSave={(f) => saveRow('special_dates', f, 'Özel gün kaydedildi')} onDelete={(x) => deleteRow('special_dates', x, '"' + x.title + '" silinsin mi?')} />}
      {sheet && sheet.kind === 'collab' && <AdSheet initial={sheet.item} collabs={data.collabs} contacts={data.contacts} onClose={() => setSheet(null)}
        onSave={(f) => saveRow('collabs', f, 'Reklam kaydedildi')} onDelete={(x) => deleteRow('collabs', x, 'Bu reklam silinsin mi?')} />}
      {sheet && sheet.kind === 'contact' && <ContactSheet initial={sheet.item} onClose={() => setSheet(null)}
        onSave={(f) => saveRow('contacts', f, 'Kişi kaydedildi')}
        onDelete={(x) => deleteRow('contacts', x, '"' + x.name + '" rehberden silinsin mi?' + (data.collabs.some((c) => c.contact_id === x.id) ? ' İş birlikleri de silinir.' : ''))}
        onCall={(k) => setSheet({ kind: 'item', item: { kind: 'call', title: k.name, phone: k.phone ? prettyPhone(k.phone) : '' } })}
        onCollab={(k) => setSheet({ kind: 'collab', item: { contact_id: k.id, handle: k.handle || k.name } })} />}
      {sheet && sheet.kind === 'habit' && <HabitSheet initial={sheet.item} onClose={() => setSheet(null)}
        onSave={(f) => saveRow('habits', f, 'Alışkanlık kaydedildi')} onDelete={(x) => deleteRow('habits', x, '"' + x.name + '" ve tüm geçmişi silinsin mi?')} />}
      {sheet && sheet.kind === 'list' && <ListSheet initial={sheet.item} onClose={() => setSheet(null)}
        onSave={(f) => saveRow('lists', f, 'Liste kaydedildi')} onDelete={(x) => deleteRow('lists', x, '"' + x.title + '" listesi ve içindekiler silinsin mi?')} />}
      {sheet && sheet.kind === 'followup' && <FollowupSheet initial={sheet.item} followups={data.followups} onClose={() => setSheet(null)} onSave={saveFollowup} onDelete={deleteFollowup} />}
      {sheet && sheet.kind === 'memory' && <MemorySheet initial={sheet.item} photoUrl={photoUrl} onClose={() => setSheet(null)} onSave={saveMemory} onDelete={deleteMemory} />}
      {sheet && sheet.kind === 'yitem' && <YarimItemSheet initial={sheet.item} onClose={() => setSheet(null)}
        onSave={(f) => saveRow('yarim_items', f, f.kind === 'hediye' ? 'Hediye fikri kaydedildi 🎁' : f.kind === 'plan' ? 'Kaydedildi ✨' : 'Kaydedildi 💗')}
        onDelete={(x) => deleteRow('yarim_items', x, '"' + x.title + '" silinsin mi?')} onCalendar={planToCalendar} />}
      {sheet && sheet.kind === 'money' && <MoneySheet initial={sheet.item} onClose={() => setSheet(null)}
        onSave={saveMoney} onDelete={deleteMoney} onScan={scanReceipt} getReceiptUrl={store.receiptUrl} />}
      {sheet && sheet.kind === 'scan' && <ReceiptScanSheet file={sheet.file} onClose={() => setSheet(null)} onDone={(item) => setSheet({ kind: 'money', item })} />}
      {sheet && sheet.kind === 'fixed' && <FixedSheet initial={sheet.item} onClose={() => setSheet(null)} onSave={saveFixed} onDelete={deleteFixed} />}
      {sheet && sheet.kind === 'budget' && <BudgetSheet budgets={budgets} onClose={() => setSheet(null)} onSave={saveBudgets} />}
      {sheet && sheet.kind === 'note' && <NoteSheet initial={sheet.item} onClose={() => setSheet(null)} onSave={saveNote} onDelete={deleteNote} alertDefaults={alertDefs} />}
      {sheet && sheet.kind === 'campaign' && <CampaignSheet initial={sheet.item} onClose={() => setSheet(null)} onSave={saveCampaign} onDelete={deleteCampaign} alertDefaults={alertDefs} />}
      {sheet && sheet.kind === 'alertDefaults' && <AlertDefaultsSheet defaults={alertDefs} onClose={() => setSheet(null)} onSave={saveAlertDefaults} />}
      {sheet && sheet.kind === 'yarim' && (
        <Sheet title="Yarim" onClose={() => setSheet(null)}>
          <YarimPanel data={data} now={now} actions={actions} love={love} />
        </Sheet>
      )}
      {sheet && sheet.kind === 'revenue' && (
        <RevenueSheet initialDay={sheet.day} revenue={revenue} order={revOrder} onClose={() => setSheet(null)} onSave={saveRevenue} />
      )}
      {sheet && sheet.kind === 'target' && (
        <TargetSheet value={revTarget} onClose={() => setSheet(null)} onSave={saveTarget} />
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
        <AccountSheet email={email} google={google} demo={demo} onClose={() => setSheet(null)} onReconnect={reconnect} onMissedSetup={() => setSheet({ kind: 'missedSetup' })} onAlertDefaults={() => setSheet({ kind: 'alertDefaults' })} yarimHidden={yarimHidden} onToggleYarim={() => { setYarimHidden(!yarimHidden); say(yarimHidden ? 'Yarim alanı gösteriliyor ❤️' : 'Yarim alanı bu cihazda gizlendi'); }}
          backup={backup} onBackupNow={() => runDriveBackup(false)} onDownload={downloadBackup} onRestore={restoreBackup}
          onRefresh={() => { setSheet(null); loadedRange.current = null; load(false); refreshEvents(); }} onSignOut={onSignOut} />
      )}

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}
