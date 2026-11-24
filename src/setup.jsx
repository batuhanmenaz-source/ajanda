// Hesap → Kurulum durumu: veritabanı güncellemeleri (SQL), bağlantılar ve yedek tek ekranda ✓ / ✗
import { useEffect, useState } from 'react';
import { supabase, DEMO } from './supabase.js';
import { Sheet } from './ui.jsx';

// Her SQL dosyasının eklediği, varlığı kontrol edilebilen bir tablo/sütun
const CHECKS = [
  ['01_tablolar', 'Temel tablolar', 'reminders', 'id'],
  ['02_google', 'Google bağlantısı', 'google_tokens', 'refresh_token'],
  ['03_yarim', 'Yarim işareti', 'reminders', 'for_yarim'],
  ['04_kalp', 'Ayarlar', 'app_settings', 'user_id'],
  ['05_cevapsiz', 'Cevapsız çağrılar', 'missed_calls', 'id'],
  ['06_etkinlik', 'Etkinlikler', 'campaigns', 'kind'],
  ['07_konum', 'Konum', 'campaigns', 'location'],
  ['08_konum_koordinat', 'Konum koordinatı', 'campaigns', 'location_geo'],
  ['09_ciro', 'Ciro', 'revenue', 'id'],
  ['10_hepsi', 'Rehber, influencer, özel günler', 'collabs', 'id'],
  ['11_cuzdan', 'Cüzdan', 'money_fixed', 'id'],
  ['12_fis', 'Fiş fotoğrafı', 'money', 'receipt_path'],
  ['13_kampanya_saat', 'Kampanya saatleri', 'campaigns', 'start_time'],
  ['14_hatirlatmalar', 'Bildirim seçimleri', 'reminders', 'alerts'],
  ['15_yarim', 'Yarim sayfası', 'yarim_items', 'id'],
  ['16_bekleyenler', 'Bekleyenler', 'followups', 'id'],
  ['17_influencer_reklam', 'Influencer reklam saatleri', 'collabs', 'start_at'],
  ['18_komisyon', 'Komisyon', 'collabs', 'commission'],
  ['19_kategoriler', 'Gider kategorileri', 'app_settings', 'money_cats'],
  ['20_reklam_ciro', 'Reklam cirosu', 'collabs', 'ad_revenue'],
  ['21_mail', 'Mail takibi', 'followups', 'mail_id'],
  ['22_mail_sertifika', 'Mail sertifikası', 'app_settings', 'mail_cert_fp'],
  ['23_reklam_tekrar', 'Tekrarlı reklam, dolaylı komisyon', 'collabs', 'runs'],
  ['24_indirim_kodlari', 'İndirim kodları', 'inf_codes', 'id'],
  ['25_saglik', 'Google Health', 'health_tokens', 'user_id'],
  ['26_saglik_hedef', 'Sağlık hedefleri', 'app_settings', 'health_goals'],
  ['27_tekrarli_etkinlik', 'Tekrarlı etkinlik', 'campaigns', 'repeat_rule'],
  ['28_kod_bildirim', 'Kod bitiş bildirimi', 'inf_codes', 'google_event_id'],
  ['29_satis_raporlari', 'Satış raporları (Excel)', 'sales_reports', 'id'],
  ['30_urun_listesi', 'Ürün listesi (barkod–stok kodu)', 'product_catalog', 'user_id']
];
// SQL dosyaları yalnız bu ekran açılınca ve "Kopyala"ya basınca yüklenir
const SQL_FILES = import.meta.glob('../supabase/*.sql', { query: '?raw', import: 'default' });

async function probe([, , table, col]) {
  const { error } = await supabase.from(table).select(col).limit(1);
  if (!error) return 'ok';
  const m = String(error.message || error.code || '');
  return /does not exist|could not find|schema cache|42P01|42703|PGRST204|PGRST205/i.test(m + ' ' + (error.code || '')) ? 'missing' : 'error:' + m.slice(0, 80);
}

function Row({ ok, warn, title, detail, children }) {
  return (
    <div className={'su-row ' + (ok ? 'ok' : warn ? 'warn' : 'bad')}>
      <span className="su-ic" aria-hidden="true">{ok ? '✓' : warn ? '!' : '✗'}</span>
      <span className="su-main"><b>{title}</b>{detail ? <small>{detail}</small> : null}</span>
      {children}
    </div>
  );
}

export function SetupSheet({ onClose, google, backup, mail, health, phoneToken, onBackupNow, onConnectHealth, onMailSetup, onMissedSetup, onReconnect }) {
  const [db, setDb] = useState(null);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    if (DEMO || !supabase) { setDb('demo'); return; }
    let alive = true;
    Promise.all(CHECKS.map((c) => probe(c).catch((e) => 'error:' + e.message))).then((r) => { if (alive) setDb(r); });
    return () => { alive = false; };
  }, []);
  const copySql = async (name) => {
    const key = Object.keys(SQL_FILES).find((k) => k.endsWith('/' + name + '.sql'));
    if (!key) return;
    const txt = await SQL_FILES[key]();
    try { await navigator.clipboard.writeText(txt); setCopied(name); setTimeout(() => setCopied(''), 2500); } catch { setCopied('hata'); }
  };
  const missing = Array.isArray(db) ? CHECKS.filter((_, i) => db[i] !== 'ok') : [];
  const days = backup && backup.last ? Math.floor((Date.now() - new Date(backup.last).getTime()) / 86400000) : null;
  const m = mail && mail.mail;
  const h = health && health.health;

  return (
    <Sheet title="Kurulum durumu" onClose={onClose}>
      <section className="su-sec">
        <h3>Bağlantılar</h3>
        <Row ok={google === 'ok' || google === 'off'} title="Google Takvim" detail={{ ok: 'Bağlı', off: 'Örnek modda kapalı', checking: 'Kontrol ediliyor…', needs_login: 'Yeniden bağlanmalı', error: 'Ulaşılamıyor' }[google] || google}>
          {google === 'needs_login' ? <button type="button" className="btn" onClick={onReconnect}>Bağla</button> : null}
        </Row>
        <Row ok={days != null && days <= 8} warn={days == null || days > 8} title="Google Drive yedeği"
          detail={days == null ? 'Henüz yedek alınmamış' : days === 0 ? 'Son yedek bugün' : 'Son yedek ' + days + ' gün önce' + (days > 8 ? ' · haftalık yedek gecikmiş' : '')}>
          {days == null || days > 8 ? <button type="button" className="btn" onClick={onBackupNow}>Şimdi yedekle</button> : null}
        </Row>
        <Row ok={!!(m && m.configured !== false && !m.error && !m.needTrust)} warn={!m} title="İş maili"
          detail={!m ? 'Kontrol ediliyor…' : m.configured === false ? 'Bağlı değil' : m.needTrust ? 'Sertifika onay bekliyor' : m.error ? m.error : 'Bağlı · ' + (m.account || '')}>
          {m && (m.configured === false || m.error || m.needTrust) ? <button type="button" className="btn" onClick={onMailSetup}>Ayarla</button> : null}
        </Row>
        <Row ok={!!(h && h.connected && !h.expired)} warn={!h || h.connected === false} title="Google Health (Fitbit)"
          detail={!h ? 'Kontrol ediliyor…' : h.connected === false ? 'Bağlı değil' : h.expired ? 'İzin süresi doldu' : h.error ? h.error : 'Bağlı'}>
          {h && (h.connected === false || h.expired) ? <button type="button" className="btn" onClick={onConnectHealth}>Bağla</button> : null}
        </Row>
        <Row ok={!!phoneToken} warn={!phoneToken} title="Telefon (MacroDroid)" detail={phoneToken ? 'Anahtar oluşturulmuş' : 'Kurulmamış'}>
          {!phoneToken ? <button type="button" className="btn" onClick={onMissedSetup}>Kur</button> : null}
        </Row>
      </section>

      <section className="su-sec">
        <h3>Veritabanı güncellemeleri</h3>
        {db === 'demo' ? <p className="hint">Örnek modda kontrol edilmez.</p>
          : !db ? <p className="hint">Kontrol ediliyor…</p>
            : !missing.length ? <Row ok title={'Hepsi tamam · ' + CHECKS.length + ' / ' + CHECKS.length} detail="Supabase'de çalıştırılması gereken SQL kalmadı." />
              : (
                <>
                  <p className="hint" style={{ margin: 0 }}>{missing.length} güncelleme eksik. Sırayla <b>Kopyala</b> → Supabase SQL Editor'e yapıştır → <b>Run</b>. Sonra bu ekranı kapatıp tekrar aç.</p>
                  {CHECKS.map((c, i) => (db[i] === 'ok' ? null : (
                    <Row key={c[0]} title={c[0].slice(0, 2) + ' · ' + c[1]} detail={db[i] === 'missing' ? 'Çalıştırılmamış' : 'Kontrol edilemedi: ' + db[i].slice(6)}>
                      <button type="button" className="btn" onClick={() => copySql(c[0])}>{copied === c[0] ? 'Kopyalandı ✓' : 'Kopyala'}</button>
                    </Row>
                  )))}
                </>
              )}
        {Array.isArray(db) && missing.length ? <p className="hint">{CHECKS.length - missing.length} / {CHECKS.length} güncelleme tamam.</p> : null}
      </section>
    </Sheet>
  );
}
