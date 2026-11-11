// İş / Özel ayrımı. Kayıtta açıkça "Özel" seçilmediyse ya da Yarim değilse İş sayılır.
export const SCOPES = [['tum', 'Tümü'], ['is', 'İş'], ['ozel', 'Özel']];

export function itemScope(x) {
  if (!x) return null;
  if (x.scope === 'is' || x.scope === 'ozel') return x.scope;
  if (x.for_yarim) return 'ozel';
  return 'is';
}
export const inScope = (x, f) => !f || f === 'tum' || itemScope(x) === f;

// Bugün ekranı ve takvim parçaları için veriyi filtreler
export function scopeData(data, f) {
  if (!f || f === 'tum') return data;
  return {
    ...data,
    reminders: data.reminders.filter((x) => inScope(x, f)),
    calls: data.calls.filter((x) => inScope(x, f)),
    campaigns: data.campaigns.filter((c) => (f === 'ozel' ? c.kind === 'etkinlik' && !c.marketplace : true)),
    campaign_tasks: data.campaign_tasks,
    collabs: f === 'ozel' ? [] : data.collabs,
    special_dates: f === 'is' ? [] : data.special_dates
  };
}
