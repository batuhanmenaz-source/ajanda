// İş ve Özel sekmeleri: alt sekmelerle ilgili ekranları bir araya toplar
import { HabitsCard, ListsView, SpecialDatesSection, HabitHistory } from './life.jsx';
import { InfluencerScreen } from './codes.jsx';
import { MailView } from './mail.jsx';
import { CampaignsScreen, MarketplaceNotes, DailyNotes } from './screens.jsx';
import { RevenueScreen } from './revenue.jsx';
import { WalletView } from './wallet.jsx';
import { YarimPage } from './yarim.jsx';
import { FollowupsView, ReportsView } from './work.jsx';
import { WorkDashboard } from './workdash.jsx';
import { PersonalDashboard } from './privdash.jsx';
import { HealthPage } from './health.jsx';

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

export function WorkScreen({ seg, setSeg, data, now, actions, revenue, revLoaded, revError, revTarget, revOrder, mail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubTabs tabs={WORK_TABS} value={seg} onChange={setSeg} label="İş bölümleri" grid />
      {seg === 'ozet' ? <WorkDashboard data={data} now={now} actions={actions} revenue={revenue} revTarget={revTarget} mail={mail} setSeg={setSeg} />
        : seg === 'ciro' ? <RevenueScreen revenue={revenue} loaded={revLoaded} error={revError} target={revTarget} now={now} actions={actions} order={revOrder} campaigns={data.campaigns} />
        : seg === 'mailler' ? <MailView mail={mail} followups={data.followups} actions={actions} now={now} />
        : seg === 'bekleyenler' ? <FollowupsView data={data} now={now} actions={actions} />
        : seg === 'raporlar' ? <ReportsView data={data} revenue={revenue} now={now} actions={actions} />
        : seg === 'notlar' ? <MarketplaceNotes data={data} actions={actions} />
          : seg === 'influencer' ? <InfluencerScreen data={data} now={now} actions={actions} />
            : <CampaignsScreen data={data} actions={actions} revenue={revenue} now={now} />}
    </div>
  );
}

export function PrivateScreen({ seg: seg0, setSeg, data, now, actions, budgets, walletError, yarimHidden, yarim, health }) {
  const tabs = yarimHidden ? PRIVATE_TABS.filter(([k]) => k !== 'yarim') : PRIVATE_TABS;
  const seg = yarimHidden && seg0 === 'yarim' ? 'cuzdan' : seg0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SubTabs tabs={tabs} value={seg} onChange={setSeg} label="Özel bölümler" grid />
      {seg === 'ozet' ? <PersonalDashboard data={data} now={now} actions={actions} budgets={budgets} yarimHidden={yarimHidden} setSeg={setSeg} />
        : seg === 'yarim' ? <YarimPage {...yarim} data={data} now={now} actions={actions} />
        : seg === 'listeler' ? <ListsView data={data} actions={actions} />
        : seg === 'saglik' && health ? <HealthPage state={health.state} now={now} hidden={health.hidden} onToggleHidden={health.toggle} onExport={actions.exportHealth} />
        : seg === 'aliskanlik' ? <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760 }}><HabitsCard data={data} now={now} actions={actions} /><HabitHistory data={data} now={now} /></div>
          : seg === 'ozelgun' ? <div style={{ maxWidth: 760 }}><SpecialDatesSection data={data} now={now} actions={actions} /></div>
            : seg === 'gunluk' ? <DailyNotes data={data} now={now} actions={actions} />
              : <WalletView money={data.money} fixed={data.money_fixed} budgets={budgets} now={now} actions={actions} error={walletError} />}
    </div>
  );
}
