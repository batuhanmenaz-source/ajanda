// Veri katmanı: Supabase (gerçek) veya tarayıcı içi örnek veri (?demo).
import { supabase } from './supabase.js';
import { addDays, startOfDay, toDateInput } from './dates.js';

export const TABLES = ['reminders', 'calls', 'notes', 'daily_notes', 'campaigns', 'campaign_tasks'];

const ORDER = {
  reminders: ['due_at', true],
  calls: ['due_at', true],
  notes: ['created_at', false],
  daily_notes: ['note_date', false],
  campaigns: ['start_date', true],
  campaign_tasks: ['sort', true]
};

export function createSupabaseStore() {
  return {
    async loadAll() {
      const out = {};
      await Promise.all(TABLES.map(async (t) => {
        const [col, asc] = ORDER[t];
        let q = supabase.from(t).select('*').order(col, { ascending: asc, nullsFirst: false });
        if (t === 'daily_notes') q = q.limit(120);
        const { data, error } = await q;
        if (error) throw error;
        out[t] = data || [];
      }));
      return out;
    },
    async insert(table, row) {
      const { data, error } = await supabase.from(table).insert(row).select().single();
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
      const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
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
    }
  };
}

// ---------- Örnek veri (demo) ----------
const DEMO_KEY = 'ajanda-demo-v1';
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
      { id: uid(), title: 'Ürün açıklamalarını güncelle', due_at: null, marketplace: 'N11', done: false }
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
    }
  };
}
