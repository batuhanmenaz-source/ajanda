// Bugün sayfası panosu: her alan tek bir renkli kutuda özetlenir, dokununca kendi sayfası açılır.
// Uzun listeler (mailler, influencer, bekleyenler, ciro dökümü) Bugün'den çıktı; burada yalnız "durum" görünür.
import { Tile } from './statstrip.jsx';
import { SRC_COLORS } from './constants.js';
import { addDays, startOfDay, toDateInput, fromDateInput, daysBetween, fmtShort } from './dates.js';
import { tlShort } from './revenue.jsx';
import { adStart, adEnd, adStatus, adWindow, dur } from './ads.jsx';
import { codeStatus } from './codes.jsx';
import { catOf, budgetStatus } from './money.js';
import { specialUpcoming, SPECIAL_ICON } from './special.js';
import { goalsOf, sportOf, isSport, isoDay } from './health.jsx';

const sumDay = (rows, k) => rows.filter((r) => r.day === k).reduce((s, r) => s + Number(r.amount), 0);

export function TodayTiles({ scope, data, now, revenue, revReady, mail, health, budgets, campLive = 0, campSoon = [], lateCount, hide, goTab, actions }) {
  const H = (k) => !hide.has(k);
  const t0 = startOfDay(now);
  const T = toDateInput(t0);
  const tiles = [];

  // ---- Dünkü ciro (İş, Tümü)
  if (scope !== 'ozel' && H('ciro') && revReady) {
    const Y = toDateInput(addDays(t0, -1));
    const W = toDateInput(addDays(t0, -8));
    const y = sumDay(revenue, Y), w = sumDay(revenue, W);
    const by = {};
    revenue.filter((r) => r.day === Y).forEach((r) => { by[r.marketplace] = Number(r.amount); });
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    tiles.push(y
      ? <Tile key="ciro" tone="#1971C2" label="Dünkü ciro" value={tlShort(y)} delta={w ? y / w - 1 : null} onClick={() => goTab('ciro')}
          sub={(top ? top[0] + ' ' + tlShort(top[1]) : '') + (Object.keys(by).length > 1 ? ' · ' + Object.keys(by).length + ' pazaryeri' : '') } />
      : <Tile key="ciro" tone="#1971C2" warn label="Dünkü ciro" value="—" sub="Girilmedi · dokun, gir" onClick={() => actions.openRevenue(Y)} />);
  }

  // ---- Kampanyalar (yalnız İş; Tümü'de kartlar aşağıda)
  if (scope === 'is' && H('kampanya')) {
    const soon = campSoon;
    tiles.push(<Tile key="kampanya" tone={SRC_COLORS.Kampanya} label="Kampanyalar" value={campLive} unit="aktif" onClick={() => goTab('kampanya')}
      sub={soon.length ? soon.length + ' yakında · ilki ' + fmtShort(fromDateInput(soon[0].start_date)) : '30 günde yeni yok'} />);
  }

  // ---- Sağlık (Tümü, Özel)
  const h = health && health.health;
  if (scope !== 'is' && H('saglik') && h && h.connected && h.steps) {
    const g = goalsOf(health.goals);
    const night = (h.sleep || {})[T] || (h.sleep || {})[toDateInput(addDays(t0, -1))];
    const st = (h.steps || {})[T];
    const sportDay = g.days && g.days.includes(isoDay(t0));
    const did = (h.exercise || []).some((e) => e.day === T && isSport(g, e));
    const sp = sportOf(g);
    tiles.push(<Tile key="saglik" tone="#7048E8" label="Sağlık" value={night ? Math.floor(night.asleep / 60) + ' sa ' + String(Math.round(night.asleep % 60)).padStart(2, '0') : '—'} unit="uyku" onClick={() => goTab('saglik')}
      warn={night && night.asleep < g.sleep * 60 - 60}
      sub={[st != null ? st.toLocaleString('tr-TR') + ' adım' : '', sportDay ? sp[2] + ' ' + (did ? 'yapıldı ✓' : g.time) : ''].filter(Boolean).join(' · ')} />);
  }

  // ---- Mailler (İş, Tümü)
  const m = mail && mail.mail;
  if (scope !== 'ozel' && H('mail') && m && m.configured !== false && !m.error) {
    const fl = m.flagged || [];
    const wt = (m.waiting || []).filter((x) => x.days >= 2);
    const oldest = wt.length ? Math.max(...wt.map((x) => x.days)) : 0;
    tiles.push(<Tile key="mail" tone="#1864AB" label="Mailler" value={fl.length} unit="bayraklı" onClick={() => goTab('mailler')} warn={oldest >= 7}
      sub={wt.length ? wt.length + ' cevap bekliyor · en eski ' + oldest + ' gün' : fl[0] ? fl[0].subject : 'Cevap bekleyen yok'} />);
  }

  // ---- Influencer (İş, Tümü)
  if (scope !== 'ozel' && H('influencer')) {
    const ads = (data.collabs || []).filter((c) => c.status !== 'iptal' && adStart(c));
    const live = ads.filter((c) => adStatus(c, now) === 'live').sort((a, b) => adWindow(a, now).e - adWindow(b, now).e);
    const todayStart = ads.filter((c) => adStatus(c, now) === 'soon' && adStart(c) < addDays(t0, 1));
    const codes = (data.inf_codes || []).filter((c) => codeStatus(c, now).key === 'live').length;
    if (live.length || todayStart.length || codes) {
      tiles.push(<Tile key="influencer" tone="#0C8599" label="Influencer" value={live.length} unit="yayında" onClick={() => goTab('influencer')}
        sub={[live.length ? 'ilk biten ' + dur(adWindow(live[0], now).e - now) + ' sonra' : todayStart.length ? todayStart.length + ' reklam bugün başlıyor' : '', codes ? codes + ' aktif kod' : ''].filter(Boolean).join(' · ')} />);
    }
  }

  // ---- Bekleyenler (İş, Tümü)
  if (scope !== 'ozel' && H('bekleyen')) {
    const fups = (data.followups || []).filter((f) => !f.done);
    if (fups.length) {
      const ages = fups.map((f) => ({ f, d: daysBetween(fromDateInput(f.since), t0) })).sort((a, b) => b.d - a.d);
      tiles.push(<Tile key="bekleyen" tone="#E67700" label="Bekleyenler" value={fups.length} unit="açık" onClick={() => goTab('bekleyenler')} warn={ages[0].d >= 14}
        sub={'en eski ' + ages[0].d + ' gün' + (ages[0].f.marketplace ? ' · ' + ages[0].f.marketplace : '')} />);
    }
  }

  // ---- Gecikenler (yalnız İş)
  if (scope === 'is') {
    tiles.push(<Tile key="gec" tone="#C92A2A" label="Gecikenler" value={lateCount} unit="iş" warn={lateCount > 0} sub={lateCount ? 'aşağıdan kapat' : 'geciken yok 👏'}
      onClick={() => { const el = document.querySelector('.late-anchor'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />);
  }

  // ---- Cüzdan (Tümü, Özel)
  if (scope !== 'is' && H('cuzdan')) {
    const money = data.money || [];
    const A = T.slice(0, 8) + '01';
    const spentToday = money.filter((r) => r.kind === 'gider' && r.day === T).reduce((s, r) => s + Number(r.amount), 0);
    const spentMonth = money.filter((r) => r.kind === 'gider' && r.day >= A && r.day <= T).reduce((s, r) => s + Number(r.amount), 0);
    const worst = budgetStatus(money, budgets || {}, now)[0];
    tiles.push(<Tile key="cuzdan" tone="#E8590C" label="Cüzdan" value={tlShort(spentToday)} unit="bugün" onClick={() => goTab('cuzdan')} warn={worst && worst.ratio >= 1}
      sub={'bu ay ' + tlShort(spentMonth) + (worst && worst.ratio >= 0.8 ? ' · ' + catOf(worst.cat).label + ' bütçesi %' + Math.round(worst.ratio * 100) : '')} />);
  }

  // ---- Alışkanlıklar ve özel günler (yalnız Özel)
  if (scope === 'ozel') {
    const habits = data.habits || [];
    if (habits.length && H('aliskanlik')) {
      const done = habits.filter((x) => (data.habit_logs || []).some((l) => l.habit_id === x.id && l.day === T)).length;
      tiles.push(<Tile key="aliskanlik" tone="#7048E8" label="Alışkanlıklar" value={done + '/' + habits.length} unit="bugün" onClick={() => goTab('aliskanlik')} sub={done === habits.length ? 'hepsi tamam 🎉' : (habits.length - done) + ' tane kaldı'} />);
    }
    const sp = specialUpcoming(data.special_dates, now, 60)[0];
    if (sp && H('ozelgun')) {
      tiles.push(<Tile key="ozelgun" tone="#D4A000" label="Özel gün" value={sp.inDays || 'Bugün'} unit={sp.inDays ? 'gün' : ''} onClick={() => goTab('ozelgun')} sub={(SPECIAL_ICON[sp.s.kind] || '⭐') + ' ' + sp.s.title} />);
    }
  }

  if (!tiles.length) return null;
  return <div className={'td-tiles n' + tiles.length}>{tiles}</div>;
}
