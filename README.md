# Ajanda

Google Takvim, hatırlatmalar, pazaryeri notları, kampanya takvimi ve aramaları tek yerde toplayan kişisel web uygulaması. Telefona ve bilgisayara uygulama gibi kurulur (PWA); mağaza gerekmez.

## Nasıl çalışır?

- **Veriler:** Supabase'de durur. Telefon ve bilgisayar aynı verileri görür.
- **Giriş:** Google hesabıyla yapılır.
- **Google Takvim:** Takvimdeki etkinlikler uygulamada görünür. Hatırlatma, arama ve kampanyalar Google Takvim'de **"Ajanda"** adlı ayrı bir takvime yazılır; bildirimleri telefondaki Google Takvim gönderir.
- **Kampanyalar:** Tüm gün etkinliği olarak eklenir. Başlangıçtan 3 gün ve 1 gün önce saat 09:00'da hazırlık hatırlatması gelir.
- **Yedekleme:** Haftada bir Google Drive'daki "Ajanda Yedekleri" klasörüne otomatik yedek alınır (son 12 yedek tutulur). Hesap ekranından dosya olarak indirilebilir ve geri yüklenebilir.
- **Tekrarlayan hatırlatmalar:** Her gün / hafta içi / her hafta / her ay / her yıl. Tamamlanınca sonraki tarihe kayar.
- **Ciro ve kampanya sonucu:** Günlük ciro girişi; kampanya kartında kampanya günlerinin cirosu, öncesindeki aynı uzunluktaki döneme göre değişim.
- **Haftalık özet:** Cuma–pazar Bugün sayfasında haftanın cirosu, işler, alışkanlıklar ve gelecek hafta.
- **Rehber ve influencer:** Kişiler (arama eklerken isimden numara gelir, cevapsız çağrıda isim görünür), influencer iş birlikleri (yayın tarihi, ücret, durum).
- **Özel günler, listeler, alışkanlıklar:** Her yıl tekrarlayan özel günler, işaretlenebilir listeler, günlük alışkanlık serileri.
- **Menü:** Bugün · Takvim · İş (kampanyalar, ciro, pazaryeri notları, influencer) · Özel (cüzdan, listeler, alışkanlıklar, özel günler, günlük not) · Aramalar. Bugün sayfasında Tümü / İş / Özel filtresi.
- **Cüzdan:** Kişisel gelir/gider (işten ayrı); haftalık ve aylık görünüm, kategori dağılımı, kart/nakit, aylık kategori bütçesi, sabit giderler ve ödeme günü hatırlatması. Hızlı ekle'ye "250 market" ya da "+45000 maaş" yazılabilir.
- **Telefon:** Sesle ekleme (Hızlı ekle'deki mikrofon), ana ekran kısayolları (simgeye uzun bas), fiş fotoğrafından harcama (okuma telefonda yapılır), MacroDroid ile cevapsız çağrılar ve arama bitince otomatik "Arandı".
- **Hava durumu:** Bugün sayfasında telefonun konumuna göre (Open-Meteo); yağmur/soğuk uyarısı, saatlik tahmin.
- **Bildirim özeti:** MacroDroid `/api/summary` adresini aralıklarla çağırıp kalıcı bildirimde gösterir (sıradaki iş, dünkü ciro, kampanya, özel gün).
- **Hatırlatma seçimi:** Her kayıtta ne zaman hatırlatılacağı seçilir (tam zamanında, dakika/saat önce, 1–7 gün önce, başladığı gün), kampanyalarda "başlayana kadar her gün", hatırlatmalarda "yapılana kadar her gün"; notlara hatırlatma; Hesap'ta türlere göre varsayılanlar. Google Takvim bir kayıt için en fazla 5 bildirim gönderir.
- **Yarim:** Anı defteri (fotoğraflı, "1 yıl önce bugün"), onun sevdikleri, hediye fikirleri (doğum günü / yıl dönümüne 2 hafta kala hatırlatma), birlikte yapılacaklar (rastgele hafta sonu önerisi), rastgele günlerde küçük sürpriz hatırlatıcısı.
- **Bekleyenler:** Tarihsiz takip edilen talepler; kaç gündür beklediği, "N. günde hatırlat", kime göre ortalama dönüş süresi. Hızlı ekle: "bekle: Beymen varyant talebi".
- **Raporlar:** Dönem ve pazaryerine göre kampanya sayısı, kampanyalı gün, kampanya cirosu ve etkisi; pazaryeri karşılaştırması, influencer, bekleyenler; Excel.
- **Excel:** Cüzdan (seçili hafta/ay) ve Ciro (ay ya da yıl) .xlsx olarak indirilir.
- **Hızlı ekle:** "yarın 10:00 HB fiyat güncelle", "Cuma 15:00 kargo firmasını ara", "not: Trendyol komisyon kontrolü" gibi yazılanları tarih, saat, pazaryeri ve türüne göre ayırır.

## Kurulum özeti

1. Supabase > SQL Editor: `supabase/` klasöründeki `01`–`16` numaralı dosyaları sırayla çalıştır.
2. Supabase > Authentication > Providers > Google: Google Cloud'daki istemci kimliği ve gizli anahtarı gir.
3. Vercel'de bu depoyu içe aktar ve şu ortam değişkenlerini tanımla:

| Ad | Nereden |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase proje adresi |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase > Settings > API Keys > Publishable key |
| `GOOGLE_CLIENT_ID` | Google Cloud > Clients |
| `GOOGLE_CLIENT_SECRET` | Google Cloud > Clients (gizli tutulur) |
| `SUPABASE_SECRET_KEY` | Supabase > Settings > API Keys > Secret key (gizli tutulur; cevapsız çağrı kapısı için) |

4. Supabase > Authentication > URL Configuration: **Site URL** alanına Vercel adresini yaz.
5. Telefonda adresi aç: Android'de Chrome menüsü > "Uygulamayı yükle", iPhone'da Safari > Paylaş > "Ana Ekrana Ekle".

**Cevapsız çağrılar (Android):** MacroDroid'de "Cevapsız arama" tetikleyicisi + `POST /api/missed-call` HTTP isteği (token, name, number). Gizli anahtar uygulamada Aramalar > Telefon bağlantısı'ndan alınır.

Örnek verilerle denemek için adresin sonuna `?demo` ekle.

## Geliştirme

```
npm install
npm run dev
```
