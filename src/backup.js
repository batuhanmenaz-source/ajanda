// Yedekleme: tüm verileri tek JSON dosyasına toplar; Google Drive'a yükler, indirir ya da geri yükler.
import { googleRaw } from './google.js';

// Geri yüklemede bu sırayla yazılır (bağlı tablolar sonra)
export const BACKUP_TABLES = [
  'app_settings', 'reminders', 'calls', 'notes', 'daily_notes', 'campaigns', 'campaign_tasks', 'missed_calls',
  'revenue', 'love_taps', 'contacts', 'collabs', 'special_dates', 'lists', 'list_items', 'habits', 'habit_logs', 'money_fixed', 'money'
];
const FOLDER = 'Ajanda Yedekleri';
const KEEP = 12; // Drive'da en son 12 yedek tutulur

const pad = (n) => String(n).padStart(2, '0');
export function backupName(d = new Date()) {
  return 'ajanda-yedek-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
}

export async function collectBackup(store, email) {
  const tables = {};
  for (const t of BACKUP_TABLES) {
    try { tables[t] = await store.dumpTable(t); } catch { /* tablo yoksa atla */ }
  }
  return { app: 'Ajanda', version: 1, exported_at: new Date().toISOString(), account: email || '', tables };
}

export function summarize(b) {
  return Object.entries(b.tables || {}).filter(([, v]) => v && v.length).map(([k, v]) => k + ': ' + v.length).join(', ');
}

export function downloadJSON(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function folderId() {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='" + FOLDER + "' and trashed=false");
  const j = await googleRaw('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)&spaces=drive');
  if (j.files && j.files.length) return j.files[0].id;
  const c = await googleRaw('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' })
  });
  return c.id;
}

// Drive'a yükler, eski yedekleri temizler. Döner: { name, size }
export async function uploadToDrive(obj) {
  const parent = await folderId();
  const name = backupName();
  const body = JSON.stringify(obj);
  const boundary = 'ajanda' + Math.random().toString(16).slice(2);
  const multipart =
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify({ name, parents: [parent], mimeType: 'application/json' }) + '\r\n' +
    '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + boundary + '--';
  await googleRaw('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body: multipart
  });
  try {
    const q = encodeURIComponent("'" + parent + "' in parents and trashed=false");
    const list = await googleRaw('https://www.googleapis.com/drive/v3/files?q=' + q + '&orderBy=createdTime desc&fields=files(id,name)&pageSize=100');
    for (const f of (list.files || []).slice(KEEP)) await googleRaw('https://www.googleapis.com/drive/v3/files/' + f.id, { method: 'DELETE' });
  } catch { /* temizlik başarısızsa önemli değil */ }
  return { name, size: body.length };
}

// Dosyadan okunan yedeği doğrular
export function parseBackup(text) {
  const b = JSON.parse(text);
  if (!b || b.app !== 'Ajanda' || !b.tables) throw new Error('Bu dosya bir Ajanda yedeği değil.');
  return b;
}
