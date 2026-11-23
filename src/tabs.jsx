// İş ve Özel alt sekmeleri (App ilk açılışta bunlara ihtiyaç duyar; ekranların kendisi gerektiğinde yüklenir)
export const WORK_TABS = [['ozet', 'Özet'], ['ciro', 'Ciro'], ['kampanya', 'Kampanyalar'], ['mailler', 'Mailler'], ['bekleyenler', 'Bekleyenler'], ['influencer', 'Influencer'], ['notlar', 'Notlar'], ['raporlar', 'Raporlar']];
export const PRIVATE_TABS = [['ozet', 'Özet'], ['cuzdan', 'Cüzdan'], ['yarim', 'Yarim ❤️'], ['listeler', 'Listeler'], ['aliskanlik', 'Alışkanlıklar'], ['saglik', 'Sağlık'], ['ozelgun', 'Özel günler'], ['gunluk', 'Günlük not']];

import { useState } from 'react';

// Sık kullanılanlar her zaman görünür; geri kalanlar "Diğer" altında
export const WORK_PRIMARY = ['ozet', 'ciro', 'kampanya', 'influencer', 'mailler'];
export const PRIVATE_PRIMARY = ['ozet', 'cuzdan', 'saglik', 'yarim', 'listeler'];

export function SubTabs({ tabs, value, onChange, label, grid, primary }) {
  const [open, setOpen] = useState(false);
  if (primary) {
    const main = tabs.filter(([id]) => primary.includes(id));
    const rest = tabs.filter(([id]) => !primary.includes(id));
    const inRest = rest.find(([id]) => id === value);
    const show = open || !!inRest;
    return (
      <div className="subtabs-wrap">
        <div className={'subtabs' + (grid ? ' grid3' : '')} role="tablist" aria-label={label}>
          {main.map(([id, l]) => (
            <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => { setOpen(false); onChange(id); }}>{l}</button>
          ))}
          {rest.length ? (
            <button type="button" className={'more' + (inRest ? ' on' : '') + (show ? ' open' : '')} aria-expanded={show} onClick={() => setOpen(!show)}>
              {inRest ? inRest[1] : 'Diğer'} <span aria-hidden="true">{show ? '▴' : '▾'}</span>
            </button>
          ) : null}
        </div>
        {show && rest.length ? (
          <div className="subtabs-more" role="tablist" aria-label={label + ' · diğer'}>
            {rest.map(([id, l]) => (
              <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{l}</button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className={'subtabs' + (grid ? ' grid3' : '')} role="tablist" aria-label={label}>
      {tabs.map(([id, l]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}
