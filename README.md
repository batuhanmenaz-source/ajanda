# Ajanda

Google Takvim, hatırlatmalar, pazaryeri notları, kampanya takvimi ve aramaları tek yerde toplayan kişisel web uygulaması. Telefona ve bilgisayara uygulama gibi kurulur (PWA); mağaza gerekmez.

## Nasıl çalışır?

- **Veriler:** Supabase'de durur. Telefon ve bilgisayar aynı verileri görür.
- **Giriş:** Google hesabıyla yapılır.
- **Google Takvim:** Takvimdeki etkinlikler uygulamada görünür. Hatırlatma, arama ve kampanyalar Google Takvim'de **"Ajanda"** adlı ayrı bir takvime yazılır; bildirimleri telefondaki Google Takvim gönderir.
- **Kampanyalar:** Tüm gün etkinliği olarak eklenir. Başlangıçtan 3 gün ve 1 gün önce saat 09:00'da hazırlık hatırlatması gelir.
- **Hızlı ekle:** "yarın 10:00 HB fiyat güncelle", "Cuma 15:00 kargo firmasını ara", "not: Trendyol komisyon kontrolü" gibi yazılanları tarih, saat, pazaryeri ve türüne göre ayırır.

## Kurulum özeti

1. Supabase > SQL Editor: `supabase/` klasöründeki `01`–`07` numaralı dosyaları sırayla çalıştır.
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
