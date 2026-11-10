import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { Icon } from './Icons.jsx';
import { supabase, configured, DEMO, signInWithGoogle } from './supabase.js';
import { createSupabaseStore, createDemoStore } from './store.js';
import { captureGoogleTokens, clearGoogleCache } from './google.js';
import './styles.css';

registerSW({ immediate: true });

// Başka bir uygulamadan "Paylaş → Ajanda" ile gelindiyse metni sakla (giriş gerekirse kaybolmasın)
(function captureShare() {
  try {
    if (window.location.pathname !== '/share') return;
    const sp = new URLSearchParams(window.location.search);
    const parts = [sp.get('title'), sp.get('text'), sp.get('url')].map((x) => (x || '').trim()).filter(Boolean);
    const uniq = parts.filter((x, i) => !parts.slice(0, i).some((y) => y.includes(x) || x.includes(y)));
    const text = uniq.join('\n').slice(0, 4000);
    if (text) sessionStorage.setItem('ajanda-share', text);
    window.history.replaceState({}, '', '/');
  } catch { /* yok say */ }
})();

function Login({ error }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="box">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon.Calendar width="32" height="32" />
          </span>
        </div>
        <h1>Ajanda</h1>
        <p>Takvim, hatırlatmalar, pazaryeri notları, kampanyalar ve aramalar tek yerde.</p>
        <button type="button" className="gbtn" disabled={busy} onClick={async () => { setBusy(true); const { error: e } = await signInWithGoogle(); if (e) setBusy(false); }}>
          <Icon.Google />{busy ? 'Google\'a yönlendiriliyor…' : 'Google ile giriş yap'}
        </button>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>Giriş sırasında Google takvimine erişim izni ister; hatırlatmalar "Ajanda" adlı ayrı bir takvime yazılır.</p>
        {error ? <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p> : null}
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="login">
      <div className="box">
        <h1>Ajanda</h1>
        <p>Uygulama henüz ayarlanmadı: <b>VITE_SUPABASE_PUBLISHABLE_KEY</b> değeri Vercel'de tanımlı değil.</p>
        <p><a href="/?demo">Örnek verilerle göz at</a></p>
      </div>
    </div>
  );
}

function Root() {
  const [session, setSession] = useState(undefined);
  const [authError, setAuthError] = useState('');
  const [googleSave, setGoogleSave] = useState(null);

  useEffect(() => {
    if (DEMO || !configured) return;
    const params = new URLSearchParams(window.location.search + window.location.hash.replace('#', '&'));
    if (params.get('error_description')) setAuthError('Giriş yapılamadı: ' + params.get('error_description'));

    // Google'dan dönüldüğünde oturum Google anahtarlarını taşır. Olay adı (SIGNED_IN /
    // INITIAL_SESSION) zamanlamaya göre değişebildiği için hangisi gelirse gelsin yakalıyoruz.
    const captured = new Set();
    const capture = (s) => {
      if (!s || !s.provider_token || captured.has(s.provider_token)) return;
      captured.add(s.provider_token);
      captureGoogleTokens(s)
        .then((res) => setGoogleSave({ n: Date.now(), ok: res.ok, error: res.error || '' }))
        .catch((e) => setGoogleSave({ n: Date.now(), ok: false, error: String(e && e.message || e) }));
      if (window.location.search || window.location.hash) window.history.replaceState({}, '', '/');
    };

    supabase.auth.getSession().then(({ data }) => { setSession(data.session || null); capture(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s || null);
      capture(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const demoStore = useMemo(() => (DEMO ? createDemoStore() : null), []);
  const realStore = useMemo(() => (configured && !DEMO ? createSupabaseStore() : null), []);

  if (DEMO) return <App store={demoStore} demo email="" onSignOut={() => {}} onReconnect={() => {}} />;
  if (!configured) return <NotConfigured />;
  if (session === undefined) return <div className="spinner">Yükleniyor…</div>;
  if (!session) return <Login error={authError} />;

  return (
    <App
      key={session.user.id}
      store={realStore}
      demo={false}
      email={session.user.email}
      googleSave={googleSave}
      onReconnect={() => signInWithGoogle()}
      onSignOut={async () => { clearGoogleCache(); await supabase.auth.signOut(); }}
    />
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>);
