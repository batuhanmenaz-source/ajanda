// İş ve Özel alt sekmeleri (App ilk açılışta bunlara ihtiyaç duyar; ekranların kendisi gerektiğinde yüklenir)
export const WORK_TABS = [['ozet', 'Özet'], ['ciro', 'Ciro'], ['kampanya', 'Kampanyalar'], ['mailler', 'Mailler'], ['bekleyenler', 'Bekleyenler'], ['influencer', 'Influencer'], ['notlar', 'Notlar'], ['raporlar', 'Raporlar']];
export const PRIVATE_TABS = [['ozet', 'Özet'], ['cuzdan', 'Cüzdan'], ['yarim', 'Yarim ❤️'], ['listeler', 'Listeler'], ['aliskanlik', 'Alışkanlıklar'], ['saglik', 'Sağlık'], ['ozelgun', 'Özel günler'], ['gunluk', 'Günlük not']];

export function SubTabs({ tabs, value, onChange, label, grid }) {
  return (
    <div className={'subtabs' + (grid ? ' grid3' : '')} role="tablist" aria-label={label}>
      {tabs.map(([id, l]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}
