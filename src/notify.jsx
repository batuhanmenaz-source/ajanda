// Hesap → 🔔 Ajanda bildirimleri: cihaz aboneliği, sunucu anahtarı kurulumu ve bildirim türleri
import { useEffect, useState } from 'react';
import { Sheet } from './ui.jsx';
import { CopyBox } from './sheets.jsx';
import { notifyOf } from './notifyprefs.js';
import { pushSupported, serverKey, makeVapidKeys, currentSub, enableHere, disableHere, listDevices, removeDevice, sendTest } from './push.js';

function Row({ title, sub, on, onToggle, children }) {
  return (
    <div className={'nf-row' + (on ? '' : ' off')}>
      <label className="nf-main">
        <span className="nf-t"><b>{title}</b>{sub ? <small>{sub}</small> : null}</span>
        <input type="checkbox" role="switch" checked={on} onChange={onToggle} />
      </label>
      {on && children ? <div className="nf-extra">{children}</div> : null}
    </div>
  );
}

export function NotifySheet({ demo, value, onSave, onApplySilent, onClose }) {
  const [n, setN] = useState(() => notifyOf(value));
  const [key, setKey] = useState(undefined); // undefined: bakılıyor, null: sunucuda yok
  const [here, setHere] = useState(null);
  const [devices, setDevices] = useState(null);
  const [gen, setGen] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [dirty, setDirty] = useState(false);
  const ok = pushSupported();

  const refresh = async () => {
    setKey(await serverKey());
    try { const s = await currentSub(); setHere(s ? s.endpoint : null); } catch { setHere(null); }
    if (!demo) { try { setDevices(await listDevices()); setErr(''); } catch (e) { setDevices([]); if (/push_subs/.test(String(e && e.message))) setErr('Supabase\'de 33 numaralı SQL henüz çalıştırılmamış. Hesap → Kurulum durumu ekranından kopyalayıp çalıştırabilirsin.'); } }
  };
  useEffect(() => { refresh(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch) => { setN((x) => ({ ...x, ...patch })); setDirty(true); };
  const sub = (k, patch) => set({ [k]: { ...n[k], ...patch } });
  const run = async (label, fn) => { setBusy(label); setMsg(''); setErr(''); try { await fn(); } catch (e) { setErr(String((e && e.message) || e)); } finally { setBusy(''); } };

  const enable = () => run('on', async () => { await enableHere(key); await refresh(); const j = await sendTest(await currentSub().then((s) => s && s.endpoint)); setMsg(j.ok ? 'Açıldı. Deneme bildirimi gönderildi; birkaç saniye içinde gelmeli.' : 'Açıldı ama deneme bildirimi gönderilemedi.'); });
  const test = () => run('test', async () => { const j = await sendTest(here); setMsg(j.ok ? 'Deneme bildirimi gönderildi.' : (j.message || 'Gönderilemedi.')); });
  const off = () => run('off', async () => { await disableHere(); await refresh(); setMsg('Bu cihazda bildirimler kapatıldı.'); });
  const save = () => run('save', async () => {
    const turnedSilent = n.gcal_silent && !notifyOf(value).gcal_silent;
    await onSave(n);
    setDirty(false);
    if (turnedSilent && onApplySilent && window.confirm('Var olan hatırlatma, arama ve notların Google Takvim bildirimleri de şimdi kapatılsın mı? (Etkinlikler takvimde kalır, sadece bildirimleri susar.)')) await onApplySilent(true);
    else if (!n.gcal_silent && notifyOf(value).gcal_silent && onApplySilent && window.confirm('Var olan kayıtların Google Takvim bildirimleri geri açılsın mı?')) await onApplySilent(false);
    setMsg('Kaydedildi.');
  });
  const anyDevice = devices && devices.length > 0;

  return (
    <Sheet title="Ajanda bildirimleri" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="setup-box nf-dev">
          <span className="lbl" style={{ fontSize: 15 }}>Bu cihaz</span>
          {demo ? <p className="hint" style={{ margin: 0 }}>Örnek modda bildirim açılamaz.</p>
            : !ok ? <p className="hint" style={{ margin: 0 }}>Bu tarayıcı bildirim desteklemiyor. Telefonda Chrome'dan kurduğun Ajanda uygulamasını kullan.</p>
            : key === undefined ? <p className="hint" style={{ margin: 0 }}>Kontrol ediliyor…</p>
            : key === null ? (
              <div className="nf-setup">
                <p className="hint" style={{ margin: 0 }}><b>Tek seferlik kurulum:</b> sunucunun bildirim gönderebilmesi için bir anahtar çifti gerekiyor. Anahtarlar şimdi senin tarayıcında üretilir, kimseye gönderilmez.</p>
                {!gen ? <button type="button" className="btn primary" onClick={async () => setGen(await makeVapidKeys())}>1. Anahtarları üret</button> : (
                  <>
                    <ol className="steps">
                      <li>Vercel → Ajanda projesi → <b>Settings → Environment Variables</b>'a gir.</li>
                      <li>Aşağıdaki iki satırı ayrı ayrı ekle: <b>Key</b> kutusuna adı, <b>Value</b> kutusuna değeri yapıştır, <b>Save</b>.</li>
                      <li><b>Deployments</b> → en üstteki satırın <b>⋯</b> menüsü → <b>Redeploy</b>.</li>
                      <li>1–2 dakika sonra aşağıdaki <b>Kontrol et</b>'e bas.</li>
                    </ol>
                    <CopyBox label="Key: VAPID_PUBLIC_KEY" value={gen.publicKey} />
                    <CopyBox label="Key: VAPID_PRIVATE_KEY (gizli — sadece Vercel'e)" value={gen.privateKey} />
                    <p className="hint" style={{ margin: 0 }}>Bu pencereyi kapatırsan anahtarlar kaybolur; Vercel'e girmeden kapattıysan yeniden üretmen yeterli.</p>
                  </>
                )}
                <button type="button" className="btn" onClick={() => run('chk', refresh)} disabled={busy === 'chk'}>{busy === 'chk' ? 'Bakılıyor…' : 'Kontrol et'}</button>
              </div>
            ) : here ? (
              <div className="nf-on">
                <span className="nf-ok">✓ Bu cihaz Ajanda bildirimlerini alıyor</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={test} disabled={!!busy}>{busy === 'test' ? 'Gönderiliyor…' : 'Deneme bildirimi gönder'}</button>
                  <button type="button" className="btn" onClick={off} disabled={!!busy}>Bu cihazda kapat</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn big primary" onClick={enable} disabled={!!busy}>{busy === 'on' ? 'Açılıyor…' : '🔔 Bu cihazda bildirimleri aç'}</button>
            )}
          {msg ? <p className="hint" style={{ margin: 0, color: 'var(--green)' }}>{msg}</p> : null}
          {err ? <p className="hint" style={{ margin: 0, color: 'var(--danger)' }}>{err}</p> : null}
          {devices && devices.length ? (
            <div className="nf-devs">
              <span className="hint">Bildirim alan cihazlar</span>
              {devices.map((d) => (
                <div key={d.id} className="nf-d">
                  <span>{d.endpoint === here ? '📱 ' + (d.device || 'Bu cihaz') + ' (bu cihaz)' : '📱 ' + (d.device || 'Cihaz')}<small>{d.last_ok ? ' · son bildirim ' + new Date(d.last_ok).toLocaleDateString('tr-TR') : ''}</small></span>
                  <button type="button" className="linkbtn" style={{ color: 'var(--danger)' }} onClick={() => run('rm', async () => { await removeDevice(d.id); if (d.endpoint === here) await disableHere(); await refresh(); })}>Kaldır</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="nf-list">
          <Row title="Hatırlatma, arama ve notlar" sub="Her kaydın kendi hatırlatma zamanında gelir. Bildirimde ✓ Yapıldı ve Yarına ertele düğmeleri olur." on={n.items} onToggle={() => set({ items: !n.items })} />
          <Row title="Sabah özeti" sub="Bugünkü işler, gecikenler, dünkü ciro, süren kampanyalar ve biten kurgular." on={n.morning.on} onToggle={() => sub('morning', { on: !n.morning.on })}>
            <label className="nf-time">Saat <input type="time" value={n.morning.at} onChange={(e) => sub('morning', { at: e.target.value || '08:30' })} /></label>
          </Row>
          <Row title="Satış ve stok uyarıları" sub="Satış raporu yüklenince hero ürünlerde stok bitiyor, satış durdu ya da sert düşüş varsa. Sabah özeti saatinden önce gelmez." on={n.sales} onToggle={() => set({ sales: !n.sales })} />
          <Row title="İndirim kurguları" sub="Kurgu bugün bitiyorsa ve kullanım limitinin %90'ına geldiyse." on={n.promo.on} onToggle={() => sub('promo', { on: !n.promo.on })}>
            <label className="nf-time">Bitiş uyarısı saati <input type="time" value={n.promo.at} onChange={(e) => sub('promo', { at: e.target.value || '10:00' })} /></label>
          </Row>
          <Row title="Dünkü ciro girilmedi" sub="Dünün cirosu girilmemişse hatırlatır; dokununca ciro girişi açılır." on={n.revenue.on} onToggle={() => sub('revenue', { on: !n.revenue.on })}>
            <label className="nf-time">Saat <input type="time" value={n.revenue.at} onChange={(e) => sub('revenue', { at: e.target.value || '11:00' })} /></label>
            <label className="nf-chk"><input type="checkbox" checked={!n.revenue.weekend} onChange={() => sub('revenue', { weekend: !n.revenue.weekend })} /> Cumartesi ve pazar cirosu için sorma</label>
          </Row>
        </div>

        <div className="setup-box">
          <label className="nf-main">
            <span className="nf-t"><b>Google Takvim bildirimlerini sustur</b><small>Hatırlatma, arama ve notlar için çift bildirim gelmesin: takvimde görünmeye devam ederler ama bildirimi sadece Ajanda gönderir. Kampanya, etkinlik ve özel gün bildirimleri takvimden gelmeye devam eder.</small></span>
            <input type="checkbox" role="switch" checked={n.gcal_silent} disabled={!anyDevice && !n.gcal_silent} onChange={() => set({ gcal_silent: !n.gcal_silent })} />
          </label>
          {!anyDevice && !n.gcal_silent ? <span className="hint">Önce bir cihazda Ajanda bildirimlerini aç; yoksa hiç bildirim almazsın.</span> : null}
        </div>

        <button type="button" className="btn big primary" onClick={save} disabled={!!busy || !dirty}>{busy === 'save' ? 'Kaydediliyor…' : dirty ? 'Kaydet' : 'Kaydedildi'}</button>
        <p className="hint" style={{ margin: 0 }}>Bildirimler en fazla 1 dakika gecikmeyle gelir. Hatırlatma zamanlarının varsayılanları "🔔 Varsayılan hatırlatmalar"dadır.</p>
      </div>
    </Sheet>
  );
}
