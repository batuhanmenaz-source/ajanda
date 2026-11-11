// "Ne zaman hatırlatılsın?" seçici: tüm formlarda ortak
import { TIMED_CHOICES, DAY_CHOICES, MAX_ALERTS, normAlerts, toOverrides, alertsLabel } from './alerts.js';

// mode: 'timed' (saatli kayıt) | 'allday' (tüm gün kayıt)
export function AlertPicker({ value, onChange, mode = 'timed', allowDaily, allowNag, nagDisabled, id = 'al', title = 'Hatırlat' }) {
  const a = normAlerts(value);
  const set = (patch) => onChange({ ...a, ...patch });
  const toggle = (k) => set({ list: a.list.includes(k) ? a.list.filter((x) => x !== k) : [...a.list, k] });
  const allDay = mode === 'allday';
  const sameDayKey = '0';
  const hasDay = a.daily || a.list.some((t) => /d$/.test(t)) || (allDay && a.list.includes(sameDayKey));
  // Ne kadar bildirim çıkacağını göster (Google en fazla 5)
  const plan = toOverrides(a, { start: new Date(Date.now() + 30 * 86400000), allDay });
  const count = plan.overrides.length + (plan.sameDayAt ? 1 : 0);
  return (
    <div className="field alertpick">
      <span className="lbl">{title}</span>
      <div className="typechips" role="group" aria-label={title}>
        {allDay
          ? <button type="button" className={'chip' + (a.list.includes(sameDayKey) ? ' on' : '')} aria-pressed={a.list.includes(sameDayKey)} onClick={() => toggle(sameDayKey)}>Başladığı gün</button>
          : TIMED_CHOICES.map(([k, l]) => <button key={k} type="button" className={'chip' + (a.list.includes(k) ? ' on' : '')} aria-pressed={a.list.includes(k)} onClick={() => toggle(k)}>{l}</button>)}
        {DAY_CHOICES.map(([k, l]) => <button key={k} type="button" className={'chip' + (a.list.includes(k) ? ' on' : '')} aria-pressed={a.list.includes(k)} onClick={() => toggle(k)}>{l}</button>)}
      </div>
      {allowDaily ? (
        <label className="wl-check">
          <input type="checkbox" checked={a.daily} onChange={(e) => set({ daily: e.target.checked, list: e.target.checked && !a.list.some((t) => /^[1-9]\d*d$/.test(t)) ? [...a.list, '3d'] : a.list })} />
          <span>Başlayana kadar her gün hatırlat <small>(seçtiğin en uzak günden itibaren)</small></span>
        </label>
      ) : null}
      {allowNag ? (
        <label className="wl-check" style={nagDisabled ? { opacity: 0.5 } : null}>
          <input type="checkbox" checked={a.nag && !nagDisabled} disabled={nagDisabled} onChange={(e) => set({ nag: e.target.checked })} />
          <span>Yapılana kadar her gün aynı saatte tekrar hatırlat{nagDisabled ? ' (tekrarlayan kayıtta kullanılamaz)' : ''}</span>
        </label>
      ) : null}
      {hasDay ? (
        <div className="alert-at">
          <label htmlFor={id + '-at'}>Gün öncesi bildirim saati</label>
          <input id={id + '-at'} type="time" value={a.at} onChange={(e) => set({ at: e.target.value || '09:00' })} />
        </div>
      ) : null}
      <span className="hint">
        {count ? '🔔 ' + alertsLabel(a, { allDay }) : 'Bildirim gelmez (yalnız takvimde görünür).'}
        {plan.dropped ? ' · Google en fazla ' + MAX_ALERTS + ' bildirim gönderdiği için en uzak ' + plan.dropped + ' tanesi atlanır.' : ''}
      </span>
    </div>
  );
}
