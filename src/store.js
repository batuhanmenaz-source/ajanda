// Veri katmanı: Supabase (gerçek) veya tarayıcı içi örnek veri (?demo).
import { supabase } from './supabase.js';
import { addDays, startOfDay, toDateInput } from './dates.js';

export const TABLES = ['reminders', 'calls', 'notes', 'daily_notes', 'campaigns', 'campaign_tasks', 'missed_calls'];
// SQL'i henüz çalıştırılmamış olabilecek tablolar: hata verirse boş sayılır
const OPTIONAL = new Set(['missed_calls']);

const ORDER = {
  reminders: ['due_at', true],
  calls: ['due_at', true],
  notes: ['created_at', false],
  daily_notes: ['note_date', false],
  campaigns: ['start_date', true],
  campaign_tasks: ['sort', true],
  missed_calls: ['missed_at', false]
};

// 03_yarim.sql henüz çalıştırılmadıysa kayıtlar yine de kaydedilsin
const PAGE = 1000;
const missingYarim = (e) => /for_yarim/.test((e && (e.message || '')) + ' ' + (e && (e.details || '')));

export function createSupabaseStore() {
  return {
    async loadAll() {
      const out = {};
      await Promise.all(TABLES.map(async (t) => {
        const [col, asc] = ORDER[t];
        const cap = t === 'daily_notes' ? 120 : t === 'missed_calls' ? 100 : Infinity;
        // Supabase tek seferde en fazla 1000 satır döndürür: kayıtlar çoğaldıkça sayfa sayfa çek
        const rows = [];
        for (let from = 0; rows.length < cap; from += PAGE) {
          const to = Math.min(from + PAGE, cap) - 1;
          const { data, error } = await supabase.from(t).select('*').order(col, { ascending: asc, nullsFirst: false }).order('id').range(from, to);
          if (error && OPTIONAL.has(t)) { out[t] = []; return; }
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < to - from + 1) break;
        }
        out[t] = rows;
      }));
      return out;
    },
    // Yedek için bir tablonun tamamı (sayfalı)
    async dumpTable(t) {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from(t).select('*').order(t === 'app_settings' ? 'user_id' : 'id').range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    // Yedekten geri yükleme: kayıtlar bu hesaba yazılır, aynı kimlikli olanlar güncellenir
    async restoreTable(t, rows) {
      if (!rows || !rows.length) return 0;
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user.id;
      let clean = rows.map((r) => ({ ...r, user_id: uid }));
      let conflict = 'id';
      if (t === 'app_settings') { conflict = 'user_id'; clean = clean.slice(0, 1); }
      if (t === 'revenue') { conflict = 'user_id,day,marketplace'; clean = clean.map(({ id: _i, ...r }) => r); }
      if (t === 'daily_notes') { conflict = 'user_id,note_date'; clean = clean.map(({ id: _i, ...r }) => r); }
      if (t === 'habit_logs') { conflict = 'habit_id,day'; }
      for (let i = 0; i < clean.length; i += 500) {
        const { error } = await supabase.from(t).upsert(clean.slice(i, i + 500), { onConflict: conflict });
        if (error) throw error;
      }
      return clean.length;
    },
    // Ciro: verilen günden itibaren (sayfalı)
    async loadRevenue(fromDay) {
      const rows = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from('revenue').select('*').gte('day', fromDay).order('day', { ascending: false }).order('id').range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
    // Bir günün cirolarını kaydeder: dolu olanlar yazılır, boşaltılanlar silinir
    async saveRevenueDay(day, entries) {
      const { data: u } = await supabase.auth.getUser();
      const keep = entries.filter((e) => e.amount > 0);
      const drop = entries.filter((e) => !(e.amount > 0)).map((e) => e.marketplace);
      if (keep.length) {
        const { error } = await supabase.from('revenue').upsert(
          keep.map((e) => ({ user_id: u.user.id, day, marketplace: e.marketplace, amount: e.amount, orders: e.orders ?? null, updated_at: new Date().toISOString() })),
          { onConflict: 'user_id,day,marketplace' }
        );
        if (error) throw error;
      }
      if (drop.length) {
        const { error } = await supabase.from('revenue').delete().eq('day', day).in('marketplace', drop);
        if (error) throw error;
      }
      return this.loadRevenueDay(day);
    },
    async loadRevenueDay(day) {
      const { data, error } = await supabase.from('revenue').select('*').eq('day', day);
      if (error) throw error;
      return data || [];
    },
    async insert(table, row) {
      let { data, error } = await supabase.from(table).insert(row).select().single();
      if (error && missingYarim(error) && 'for_yarim' in row) {
        const { for_yarim: _x, ...rest } = row;
        ({ data, error } = await supabase.from(table).insert(rest).select().single());
      }
      if (error) throw error;
      return data;
    },
    async insertMany(table, rows) {
      if (!rows.length) return [];
      const { data, error } = await supabase.from(table).insert(rows).select();
      if (error) throw error;
      return data;
    },
    async update(table, id, patch) {
      let { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
      if (error && missingYarim(error) && 'for_yarim' in patch) {
        const { for_yarim: _x, ...rest } = patch;
        ({ data, error } = await supabase.from(table).update(rest).eq('id', id).select().single());
      }
      if (error) throw error;
      return data;
    },
    async remove(table, id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    async upsertDaily(note_date, body) {
      const { data, error } = await supabase
        .from('daily_notes')
        .upsert({ note_date, body, updated_at: new Date().toISOString() }, { onConflict: 'user_id,note_date' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    // Yarim ayarları ve kalp sayacı (04_kalp.sql)
    async getSettings() {
      const { data, error } = await supabase.from('app_settings').select('*').maybeSingle();
      if (error) throw error;
      return data || {};
    },
    async saveSettings(patch) {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('app_settings')
        .upsert({ user_id: u.user.id, ...patch, updated_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    async loveCount() {
      const { count, error } = await supabase.from('love_taps').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
    async addLove() {
      const { error } = await supabase.from('love_taps').insert({});
      if (error) throw error;
    }
  };
}

// ---------- Örnek veri (demo) ----------
const DEMO_KEY = 'ajanda-demo-v4';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

function seed() {
  const t = startOfDay(new Date());
  const at = (d, h, m = 0) => { const x = addDays(t, d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const c1 = uid(), c2 = uid(), c3 = uid();
  return {
    reminders: [
      { id: uid(), title: 'Kampanya fiyat listesini panele yükle', due_at: at(0, 11), marketplace: 'Trendyol', done: false },
      { id: uid(), title: 'Missha stok kontrolü', due_at: at(0, 16), marketplace: 'Hepsiburada', done: false },
      { id: uid(), title: 'Haftalık reklam raporunu hazırla', due_at: at(0, 17, 30), marketplace: 'Amazon', done: false },
      { id: uid(), title: 'Banner görsellerini iste', due_at: at(1, 9, 30), marketplace: 'MCLUB', done: false },
      { id: uid(), title: 'Ürün açıklamalarını güncelle', due_at: null, marketplace: 'N11', done: false },
      { id: uid(), title: 'Haftalık reklam raporu', due_at: at(((8 - t.getDay()) % 7) || 7, 10), marketplace: null, done: false, repeat_rule: 'weekly' },
      { id: uid(), title: 'Akşam yemeği rezervasyonu', due_at: at(0, 18), marketplace: null, done: false, for_yarim: true },
      { id: uid(), title: 'Çiçek siparişi ver', due_at: at(3, 10), marketplace: null, done: false, for_yarim: true }
    ],
    calls: [
      { id: uid(), who: 'Kategori yöneticisi', topic: 'Ek kampanya katılımı', phone: '', due_at: at(0, 15), done: false },
      { id: uid(), who: 'Kargo firması', topic: 'Fiyat güncellemesi', phone: '', due_at: at(1, 10), done: false },
      { id: uid(), who: 'Influencer ajansı', topic: 'İçerik takvimi', phone: '', due_at: at(2, 14), done: false }
    ],
    notes: [
      { id: uid(), marketplace: 'Trendyol', brand: '', title: 'Komisyon kontrolü', body: 'Cilt bakımı kategorisindeki komisyon oranı kontrol edilecek; kâr hesaplayıcı güncellenmeli.', created_at: at(0, 9) },
      { id: uid(), marketplace: 'Hepsiburada', brand: 'DERMA:B', title: 'Varyant birleştirme', body: 'Varyant birleştirme talebi açıldı, dönüş bekleniyor.', created_at: at(-3, 9) },
      { id: uid(), marketplace: 'Amazon', brand: '', title: 'Reklam hedefi', body: 'Sponsorlu ürün kampanyalarında ACOS hedefi gözden geçirilecek.', created_at: at(-4, 9) }
    ],
    daily_notes: [
      { id: uid(), note_date: toDateInput(addDays(t, -1)), body: 'Temsilciyle görüşüldü; kupon kurgusu onaylandı.' }
    ],
    missed_calls: [
      { id: uid(), name: 'Ajans', phone: '905321112233', missed_at: new Date(Date.now() - 25 * 60000).toISOString(), handled: false },
      { id: uid(), name: null, phone: '902124445566', missed_at: at(-1, 17, 40), handled: false }
    ],
    campaigns: [
      { id: c1, name: 'Örnek kampanya', marketplace: 'Trendyol', start_date: toDateInput(addDays(t, 1)), end_date: toDateInput(addDays(t, 3)), prep_event_ids: [] },
      { id: c2, name: 'Kasım indirimleri', marketplace: 'Hepsiburada', start_date: toDateInput(addDays(t, 7)), end_date: toDateInput(addDays(t, 13)), prep_event_ids: [] },
      { id: c3, name: 'Black Friday', marketplace: 'MCLUB', start_date: toDateInput(addDays(t, 18)), end_date: toDateInput(addDays(t, 21)), prep_event_ids: [] }
    ],
    campaign_tasks: [
      { id: uid(), campaign_id: c1, label: 'Fiyat listesi', done: true, sort: 0 },
      { id: uid(), campaign_id: c1, label: 'Ürün görselleri', done: true, sort: 1 },
      { id: uid(), campaign_id: c1, label: 'Stok kontrolü', done: false, sort: 2 },
      { id: uid(), campaign_id: c1, label: 'Reklam bütçesi', done: false, sort: 3 },
      { id: uid(), campaign_id: c2, label: 'Fiyat listesi', done: true, sort: 0 },
      { id: uid(), campaign_id: c2, label: 'Kupon tanımı', done: false, sort: 1 },
      { id: uid(), campaign_id: c3, label: 'Banner görselleri', done: false, sort: 0 },
      { id: uid(), campaign_id: c3, label: 'İndirim kurgusu', done: false, sort: 1 }
    ]
  };
}

export function createDemoStore() {
  let db;
  try { db = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { db = null; }
  if (!db) db = seed();
  if (!db.missed_calls) db.missed_calls = [];
  if (!db.revenue) {
    // Örnek ciro: son 45 gün
    const base = { Trendyol: 180000, Hepsiburada: 95000, MCLUB: 60000, Amazon: 42000, N11: 15000, Boyner: 9000 };
    db.revenue = [];
    const t0 = startOfDay(new Date());
    for (let i = 1; i <= 45; i++) {
      const d = toDateInput(addDays(t0, -i));
      Object.entries(base).forEach(([mp, v], k) => {
        const w = 0.7 + ((i * 7 + k * 13) % 11) / 18;
        db.revenue.push({ id: uid(), day: d, marketplace: mp, amount: Math.round(v * w), orders: Math.round((v * w) / 650) });
      });
    }
  }
  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch { /* yok say */ } };
  save();
  return {
    async loadAll() { return JSON.parse(JSON.stringify(db)); },
    async insert(table, row) { const r = { id: uid(), created_at: new Date().toISOString(), ...row }; db[table].push(r); save(); return r; },
    async insertMany(table, rows) { const out = rows.map((row) => ({ id: uid(), ...row })); db[table].push(...out); save(); return out; },
    async update(table, id, patch) { db[table] = db[table].map((r) => (r.id === id ? { ...r, ...patch } : r)); save(); return db[table].find((r) => r.id === id); },
    async remove(table, id) {
      db[table] = db[table].filter((r) => r.id !== id);
      if (table === 'campaigns') db.campaign_tasks = db.campaign_tasks.filter((r) => r.campaign_id !== id);
      save();
    },
    async upsertDaily(note_date, body) {
      const ex = db.daily_notes.find((r) => r.note_date === note_date);
      if (ex) { ex.body = body; save(); return ex; }
      const r = { id: uid(), note_date, body }; db.daily_notes.push(r); save(); return r;
    },
    async getSettings() { return db.settings || {}; },
    async dumpTable(t) { if (t === 'app_settings') return db.settings ? [db.settings] : []; return JSON.parse(JSON.stringify(db[t] || [])); },
    async restoreTable(t, rows) {
      if (t === 'app_settings') { db.settings = { ...(db.settings || {}), ...(rows[0] || {}) }; save(); return rows.length ? 1 : 0; }
      const cur = db[t] || [];
      const byId = new Map(cur.map((r) => [r.id, r]));
      rows.forEach((r) => byId.set(r.id, { ...byId.get(r.id), ...r }));
      db[t] = [...byId.values()]; save(); return rows.length;
    },
    async loadRevenue(fromDay) { return db.revenue.filter((r) => r.day >= fromDay); },
    async loadRevenueDay(day) { return db.revenue.filter((r) => r.day === day); },
    async saveRevenueDay(day, entries) {
      for (const e of entries) {
        const ex = db.revenue.find((r) => r.day === day && r.marketplace === e.marketplace);
        if (e.amount > 0) { if (ex) { ex.amount = e.amount; ex.orders = e.orders ?? null; } else db.revenue.push({ id: uid(), day, marketplace: e.marketplace, amount: e.amount, orders: e.orders ?? null }); }
        else if (ex) db.revenue = db.revenue.filter((r) => r !== ex);
      }
      save();
      return db.revenue.filter((r) => r.day === day);
    },
    async saveSettings(patch) { db.settings = { ...(db.settings || {}), ...patch }; save(); return db.settings; },
    async loveCount() { return db.love || 0; },
    async addLove() { db.love = (db.love || 0) + 1; save(); }
  };
}
