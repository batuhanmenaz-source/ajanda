import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://ppjswmsskurwwumojjkh.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
export const configured = !!key;

export const supabase = configured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
    })
  : null;

// Takvim + yalnız uygulamanın kendi oluşturduğu Drive dosyaları (yedekler için)
export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file';

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: GOOGLE_SCOPES,
      redirectTo: window.location.origin,
      queryParams: { access_type: 'offline', prompt: 'consent' }
    }
  });
}
