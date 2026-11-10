export const MARKETPLACES = [
  { name: 'Trendyol', color: '#C2410C' },
  { name: 'Hepsiburada', color: '#7048E8' },
  { name: 'Amazon', color: '#1971C2' },
  { name: 'MCLUB', color: '#0B7285' },
  { name: 'Boyner', color: '#C2255C' },
  { name: 'N11', color: '#5C940D' },
  { name: 'Pazarama', color: '#B35C00' },
  { name: 'Beymen', color: '#495057' },
  { name: 'İdefix', color: '#A61E4D' }
];

export const BRANDS = ['Missha', 'ATOPALM', 'ZEROID', 'REAL BARRIER', 'DERMA:B', 'DumiDang', 'Orjena', 'Skin79', 'Neoparm'];

// Standart kampanya hazırlık adımları (her yeni kampanyaya otomatik eklenir)
export const DEFAULT_PREPS = ['Fiyat listesi oluştur', 'Ürün kurgularını kur', 'Mağaza reklamlarını kur', 'Influencer reklamlarını kur', 'Mağaza tasarımını güncelle'];

export const SRC_COLORS = {
  Google: '#1971C2',
  Kampanya: '#C2410C',
  'Hatırlatma': '#2F4AC0',
  Arama: '#2B8A3E',
  Yarim: '#D6336C',
  Etkinlik: '#9C36B5',
  'Özel gün': '#D4A000',
  Influencer: '#0C8599'
};

export const YARIM = { name: 'Yarim', heart: '❤️', color: '#D6336C', bg: '#FFE8EF', border: '#F9C6D6', ink: '#A61E4D' };

// İlişkinin başladığı an (Türkiye saati)
export const YARIM_START = new Date('2026-07-10T22:00:00+03:00');

export function mpColor(name) {
  const m = MARKETPLACES.find((x) => x.name === name);
  return m ? m.color : '#868B96';
}
