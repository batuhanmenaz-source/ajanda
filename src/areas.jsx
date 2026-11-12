// İş ve Özel sekmeleri: alt sekmelerle ilgili ekranları bir araya toplar
import { HabitsCard, ListsView, SpecialDatesSection, HabitHistory } from './life.jsx';
import { AdsView } from './ads.jsx';
import { CampaignsScreen, MarketplaceNotes, DailyNotes } from './screens.jsx';
import { RevenueScreen } from './revenue.jsx';
import { WalletView } from './wallet.jsx';
import { YarimPage } from './yarim.jsx';
import { FollowupsView, ReportsView } from './work.jsx';

export const WORK_TABS = [['ciro', 'Ciro'], ['kampanya', 'Kampanyalar'], ['bekleyenler', 'Bekleyenler'], ['notlar', 'Pazaryeri notları'], ['influencer', 'Influencer reklamları'], ['raporlar', 'Raporlar']];
export const PRIVATE_TABS = [['cuzdan', 'Cüzdan'], ['yarim', 'Yarim ❤️'], ['listeler', 'Listeler'], ['aliskanlik', 'Alışkanlıklar'], ['ozelgun', 'Özel günler'], ['gunluk', 'Günlük not']];

export function SubTabs({ tabs, value, onChange, label }) {
  return (
    <div className="subtabs" role="tablist" aria-label={label}>
      {tabs.map(([id, l]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}

export function WorkScreen({ seg, setSeg, data, now, actions, revenue, revLoaded, revError, revTarget, revOrder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubTabs tabs={WORK_TABS} value={seg} onChange={setSeg} label="İş bölümleri" />
      {seg === 'ciro' ? <RevenueScreen revenue={revenue} loaded={revLoaded} error={revError} target={revTarget} now={now} actions={actions} order={revOrder} />
        : seg === 'bekleyenler' ? <FollowupsView data={data} now={now} actions={actions} />
        : seg === 'raporlar' ? <ReportsView data={data} revenue={revenue} now={now} actions={actions} />
        : seg === 'notlar' ? <MarketplaceNotes data={data} actions={actions} />
          : seg === 'influencer' ? <AdsView data={data} now={now} actions={actions} />
            : <CampaignsScreen data={data} actions={actions} revenue={revenue} now={now} />}
    </div>
  );
}

export function PrivateScreen({ seg: seg0, setSeg, data, now, actions, budgets, walletError, yarimHidden, yarim }) {
  const tabs = yarimHidden ? PRIVATE_TABS.filter(([k]) => k !== 'yarim') : PRIVATE_TABS;
  const seg = yarimHidden && seg0 === 'yarim' ? 'cuzdan' : seg0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubTabs tabs={tabs} value={seg} onChange={setSeg} label="Özel bölümler" />
      {seg === 'yarim' ? <YarimPage {...yarim} data={data} now={now} actions={actions} />
        : seg === 'listeler' ? <ListsView data={data} actions={actions} />
        : seg === 'aliskanlik' ? <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}><HabitsCard data={data} now={now} actions={actions} /><HabitHistory data={data} now={now} /></div>
          : seg === 'ozelgun' ? <div style={{ maxWidth: 760 }}><SpecialDatesSection data={data} now={now} actions={actions} /></div>
            : seg === 'gunluk' ? <DailyNotes data={data} now={now} actions={actions} />
              : <WalletView money={data.money} fixed={data.money_fixed} budgets={budgets} now={now} actions={actions} error={walletError} />}
    </div>
  );
}
