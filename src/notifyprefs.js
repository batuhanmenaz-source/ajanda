// Ajanda bildirim ayarları (app_settings.notify): istemci ve sunucu (api/push.js) ortak kullanır
export const NOTIFY_DEFAULTS = {
  items: true, // hatırlatma, arama, not: kendi hatırlatma zamanlarında (düğmeli)
  morning: { on: true, at: '08:30' }, // sabah özeti
  sales: true, // satış / stok uyarıları
  promo: { on: true, at: '10:00' }, // kurgu bugün bitiyor / limit doluyor
  revenue: { on: true, at: '11:00', weekend: true }, // dünkü ciro girilmedi (weekend: false → cumartesi/pazar için sorma)
  gcal_silent: false // Google Takvim'deki hatırlatma/arama/not bildirimlerini sustur
};
export const notifyOf = (n) => {
  const x = n && typeof n === 'object' ? n : {};
  const o = (k) => ({ ...NOTIFY_DEFAULTS[k], ...(x[k] && typeof x[k] === 'object' ? x[k] : {}) });
  return { items: x.items !== false, morning: o('morning'), sales: x.sales !== false, promo: o('promo'), revenue: o('revenue'), gcal_silent: !!x.gcal_silent };
};
