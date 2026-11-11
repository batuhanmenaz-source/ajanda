// İş ve Özel sekmeleri: alt sekmelerle ilgili ekranları bir araya toplar
import { HabitsCard, ListsView, InfluencerView, SpecialDatesSection, HabitHistory } from './life.jsx';
import { CampaignsScreen, MarketplaceNotes, DailyNotes } from './screens.jsx';
import { RevenueScreen } from './revenue.jsx';
import { WalletView } from './wallet.jsx';

export const WORK_TABS = [['kampanya', 'Kampanyalar'], ['ciro', 'Ciro'], ['notlar', 'Pazaryeri notları'], ['influencer', 'Influencer']];
export const PRIVATE_TABS = [['cuzdan', 'Cüzdan'], ['listeler', 'Listeler'], ['aliskanlik', 'Alışkanlıklar'], ['ozelgun', 'Özel günler'], ['gunluk', 'Günlük not']];

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
        : seg === 'notlar' ? <MarketplaceNotes data={data} actions={actions} />
          : seg === 'influencer' ? <InfluencerView data={data} now={now} actions={actions} />
            : <CampaignsScreen data={data} actions={actions} revenue={revenue} now={now} />}
    </div>
  );
}

export function PrivateScreen({ seg, setSeg, data, now, actions, budgets, walletError }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubTabs tabs={PRIVATE_TABS} value={seg} onChange={setSeg} label="Özel bölümler" />
      {seg === 'listeler' ? <ListsView data={data} actions={actions} />
        : seg === 'aliskanlik' ? <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}><HabitsCard data={data} now={now} actions={actions} /><HabitHistory data={data} now={now} /></div>
          : seg === 'ozelgun' ? <div style={{ maxWidth: 760 }}><SpecialDatesSection data={data} now={now} actions={actions} /></div>
            : seg === 'gunluk' ? <DailyNotes data={data} now={now} actions={actions} />
              : <WalletView money={data.money} fixed={data.money_fixed} budgets={budgets} now={now} actions={actions} error={walletError} />}
    </div>
  );
}
