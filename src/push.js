// Ajanda bildirimleri (istemci): bu cihazı aboneliğe ekle/çıkar, deneme bildirimi, VAPID anahtarı üretimi.
import { supabase } from './supabase.js';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

export async function serverKey() {
  try { const r = await fetch('/api/push?action=key', { cache: 'no-store' }); const j = await r.json(); return j.key || null; } catch { return null; }
}

// Sunucuya girilecek anahtar çifti — yalnız bu tarayıcıda üretilir, hiçbir yere gönderilmez
export async function makeVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64u(pub), privateKey: jwk.d };
}

export async function currentSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const deviceName = () => {
  const ua = navigator.userAgent;
  const m = ua.match(/Android [\d.]+; ([^;)]+)/);
  if (m) return m[1].replace(/ Build.*$/, '').trim();
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Windows/.test(ua)) return 'Windows bilgisayar';
  if (/Mac OS/.test(ua)) return 'Mac';
  return 'Bu cihaz';
};

// Bu cihazda bildirimleri aç: izin iste → abone ol → Supabase'e kaydet
export async function enableHere(key) {
  if (!pushSupported()) throw new Error('Bu tarayıcı bildirim desteklemiyor.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Bildirim izni kapalı. Telefon Ayarlar → Uygulamalar → Ajanda → Bildirimler\'den aç.' : 'Bildirim izni verilmedi.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // Sunucu anahtarı değiştiyse eski aboneliği yenile
  if (sub && sub.options && sub.options.applicationServerKey && b64u(sub.options.applicationServerKey) !== key) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
  const j = sub.toJSON();
  // Aynı cihaz yeniden açılırsa eski anahtar korunur (önceden gelen bildirimlerin düğmeleri çalışmaya devam eder)
  const { data: old } = await supabase.from('push_subs').select('token').eq('endpoint', j.endpoint).maybeSingle();
  const token = (old && old.token) || b64u(crypto.getRandomValues(new Uint8Array(24)));
  const { error } = await supabase.from('push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, token, device: deviceName() }, { onConflict: 'endpoint' });
  if (error) throw error;
  return j.endpoint;
}

export async function disableHere() {
  const sub = await currentSub();
  if (!sub) return;
  await supabase.from('push_subs').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function listDevices() {
  const { data, error } = await supabase.from('push_subs').select('id, endpoint, device, created_at, last_ok').order('created_at');
  if (error) throw error;
  return data || [];
}
export async function removeDevice(id) { const { error } = await supabase.from('push_subs').delete().eq('id', id); if (error) throw error; }

export async function sendTest(endpoint) {
  const { data } = await supabase.auth.getSession();
  const tok = data && data.session && data.session.access_token;
  const r = await fetch('/api/push?action=test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ endpoint }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || 'Gönderilemedi');
  return j;
}
