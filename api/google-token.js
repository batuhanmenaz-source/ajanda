// Vercel sunucu fonksiyonu: Google yenileme anahtarını (refresh token) kullanarak
// yeni bir erişim anahtarı alır. İstemci gizli anahtarı (client secret) yalnızca
// burada, sunucuda kullanılır; tarayıcıya hiç gönderilmez.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'missing_server_config', message: 'GOOGLE_CLIENT_ID veya GOOGLE_CLIENT_SECRET Vercel ayarlarında tanımlı değil.' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const refreshToken = body && body.refresh_token;
  if (!refreshToken || typeof refreshToken !== 'string') {
    res.status(400).json({ error: 'missing_refresh_token' });
    return;
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const data = await r.json();
    if (!r.ok) {
      // invalid_client: Vercel'deki GOOGLE_CLIENT_ID / SECRET hatalı → sunucu ayarı sorunu
      if (data.error === 'invalid_client' || data.error === 'unauthorized_client') {
        res.status(500).json({ error: 'bad_server_config', message: 'Vercel\'deki GOOGLE_CLIENT_ID veya GOOGLE_CLIENT_SECRET hatalı.' });
        return;
      }
      // invalid_grant vb.: kullanıcının bir kez yeniden bağlanması gerekir
      res.status(r.status === 400 || r.status === 401 ? 401 : 502).json({ error: data.error || 'google_error', message: data.error_description || '' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (e) {
    res.status(502).json({ error: 'network_error' });
  }
}
