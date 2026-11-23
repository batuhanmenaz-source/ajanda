// Özel → Özet: kişisel tarafın tek bakışta görünümü (cüzdan, alışkanlık, özel gün, liste, Yarim)
import { YARIM_START } from './constants.js';
import { WEEKDAYS, MONTHS, startOfDay, addDays, toDateInput, daysBetween, fmtShort } from './dates.js';
import { tl, tlShort } from './revenue.jsx';
import { catOf, budgetStatus, fixedDue, fixedPaid } from './money.js';
import { specialUpcoming, specialLabel, SPECIAL_ICON } from './special.js';
import { Tile } from './statstrip.jsx';
import { HabitsCard } from './life.jsx';

const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#e34948'];
const dlt = (a, b) => (b > 0 ? a / b - 1 : null);
const sumK = (rows, kind, A, B) => rows.filter((r) => r.kind === kind && r.day >= A && r.day <= B).reduce((s, r) => s + Number(r.amount), 0);

function Card({ title, tone, meta, onAll, children, className }) {
  return (
    <section className={'card wd-card ' + (className || '')} style={{ '--tone': tone }}>
      <div className="wd-card-head">
        <h3><i aria-hidden="true" />{title}</h3>
        {meta ? <span className="wd-meta">{meta}</span> : null}
        {onAll ? <button type="button" className="linkbtn" onClick={onAll}>Aç →</button> : null}
      </div>
      {children}
    </section>
  );
}

export function PersonalDashboard({ data, now, actions, budgets, yarimHidden, setSeg }) {
  const t = startOfDay(now);
  const T = toDateInput(t);
  const mk = T.slice(0, 7);
  const money = data.money || [];
  const go = (k) => () => setSeg(k);

  // ---- Cüzdan
  const mStart = new Date(t.getFullYear(), t.getMonth(), 1);
  const A = toDateInput(mStart);
  const spent = sumK(money, 'gider', A, T);
  const inc = sumK(money, 'gelir', A, toDateInput(new Date(t.getFullYear(), t.getMonth() + 1, 0)));
  const pmStart = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const pmSame = new Date(t.getFullYear(), t.getMonth() - 1, Math.min(t.getDate(), new Date(t.getFullYear(), t.getMonth(), 0).getDate()));
  const spentPrev = sumK(money, 'gider', toDateInput(pmStart), toDateInput(pmSame));
  const s7 = sumK(money, 'gider', toDateInput(addDays(t, -6)), T);
  const p7 = sumK(money, 'gider', toDateInput(addDays(t, -13)), toDateInput(addDays(t, -7)));
  const todaySpent = sumK(money, 'gider', T, T);
  const dailyAvg = t.getDate() ? spent / t.getDate() : 0;
  const bs = budgetStatus(money, budgets, now);
  const worst = bs[0];
  const byCat = {};
  money.forEach((r) => { if (r.kind === 'gider' && r.day >= A && r.day <= T) byCat[r.category] = (byCat[r.category] || 0) + Number(r.amount); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const fixed = (data.money_fixed || []).filter((f) => f.active !== false && f.kind !== 'gelir')
    .map((f) => ({ f, d: fixedDue(f, mStart), paid: fixedPaid(f, money, mStart) }))
    .filter((x) => !x.paid).sort((a, b) => a.d - b.d);
  const fixedLeft = fixed.reduce((a, x) => a + Number(x.f.amount), 0);

  // ---- Alışkanlıklar
  const habits = data.habits || [];
  const logs = data.habit_logs || [];
  const doneToday = habits.filter((h) => logs.some((l) => l.habit_id === h.id && l.day === T)).length;
  const last7 = Array.from({ length: 7 }, (_, i) => toDateInput(addDays(t, -i)));
  const weekRate = habits.length ? logs.filter((l) => last7.includes(l.day) && habits.some((h) => h.id === l.habit_id)).length / (habits.length * 7) : 0;

  // ---- Özel günler, listeler, Yarim
  const specials = specialUpcoming(data.special_dates, now, 60);
  const lists = data.lists || [];
  const items = data.list_items || [];
  const openItems = items.filter((i) => !i.done).length;
  const yarimDays = Math.floor((now - YARIM_START) / 86400000);
  const yarimOpen = (data.reminders || []).filter((r) => r.for_yarim && !r.done).length;

  const total = cats.reduce((a, [, v]) => a + v, 0);

  return (
    <div className="wd">
      <div className="wd-hero pd-hero">
        <div>
          <span className="wd-hero-k">Özel · özet</span>
          <h2>{t.getDate()} {MONTHS[t.getMonth()]} {WEEKDAYS[t.getDay()]}</h2>
        </div>
        <div className="wd-hero-pills">
          <span className="wd-pill" style={{ '--tone': '#1baf7a' }}>Bugün {tlShort(todaySpent)} harcandı</span>
          {habits.length ? <span className="wd-pill" style={{ '--tone': '#7048E8' }}>Alışkanlık {doneToday}/{habits.length}</span> : null}
          {specials[0] && specials[0].inDays <= 7 ? <span className="wd-pill" style={{ '--tone': '#D4A000' }}>{specials[0].s.title} · {specials[0].inDays ? specials[0].inDays + ' gün' : 'bugün'}</span> : null}
        </div>
      </div>

      <div className="wd-tiles">
        <Tile tone="#E8590C" label={MONTHS[t.getMonth()] + ' harcaması'} value={tlShort(spent)} delta={dlt(spent, spentPrev)} invert onClick={go('cuzdan')}
          sub={'günde ort. ' + tlShort(dailyAvg) + (spentPrev ? ' · geçen ayın aynı dönemine göre' : '')} />
        <Tile tone={inc - spent >= 0 ? '#2B8A3E' : '#E03131'} label="Bu ay kalan" value={inc ? tlShort(inc - spent) : '—'} onClick={go('cuzdan')}
          sub={inc ? 'gelir ' + tlShort(inc) + (fixedLeft ? ' · ' + tlShort(fixedLeft) + ' sabit gider bekliyor' : '') : 'gelir girilmedi'} />
        <Tile tone="#1971C2" label="Son 7 gün" value={tlShort(s7)} delta={dlt(s7, p7)} invert sub="önceki 7 güne göre" onClick={go('cuzdan')} />
        <Tile tone={worst && worst.ratio >= 1 ? '#E03131' : worst && worst.ratio >= 0.8 ? '#F08C00' : '#0C8599'} warn={worst && worst.ratio >= 1} label="Bütçe" onClick={go('cuzdan')}
          value={worst ? '%' + Math.round(worst.ratio * 100) : '—'} sub={worst ? catOf(worst.cat).emoji + ' ' + catOf(worst.cat).label + ' · ' + tlShort(worst.spent) + ' / ' + tlShort(worst.limit) : 'bütçe belirlenmedi'} />
        <Tile tone="#7048E8" label="Alışkanlıklar" value={habits.length ? doneToday + '/' + habits.length : '—'} unit={habits.length ? 'bugün' : ''} onClick={go('aliskanlik')}
          sub={habits.length ? 'son 7 günde %' + Math.round(weekRate * 100) + ' tamamlandı' : 'alışkanlık eklenmedi'} />
        <Tile tone="#D4A000" label="Özel günler" value={specials[0] ? (specials[0].inDays || 'Bugün') : '—'} unit={specials[0] && specials[0].inDays ? 'gün' : ''} onClick={go('ozelgun')}
          sub={specials[0] ? (SPECIAL_ICON[specials[0].s.kind] || '⭐') + ' ' + specials[0].s.title + (specials.length > 1 ? ' · 60 günde ' + specials.length + ' gün' : '') : '60 gün içinde yok'} />
      </div>

      <div className="wd-grid">
        {/* Harcama dağılımı */}
        <Card title={MONTHS[t.getMonth()] + ' · nereye gitti?'} tone="#E8590C" meta={total ? tl(total) + ' toplam' : ''} onAll={go('cuzdan')}>
          {cats.length ? (
            <>
              <div className="wd-share" aria-hidden="true">
                {cats.map(([c, v], i) => <span key={c} style={{ flexGrow: v, background: PALETTE[i % PALETTE.length] }} />)}
              </div>
              <div className="pd-cats">
                {cats.slice(0, 6).map(([c, v], i) => {
                  const cat = catOf(c); const b = bs.find((x) => x.cat === c);
                  return (
                    <div key={c} className="pd-cat">
                      <span className="pd-cat-e" style={{ background: PALETTE[i % PALETTE.length] + '22' }}>{cat.emoji}</span>
                      <span className="pd-cat-main">
                        <span className="pd-cat-top"><b>{cat.label}</b><span>{tl(v)}</span></span>
                        <span className="pd-cat-bar"><span style={{ width: (v / cats[0][1]) * 100 + '%', background: PALETTE[i % PALETTE.length] }} /></span>
                        <small>%{Math.round((v / total) * 100)}{b ? ' · bütçenin %' + Math.round(b.ratio * 100) + "'i" : ''}</small>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <p className="empty">Bu ay harcama girilmedi.</p>}
        </Card>

        {/* Sabit giderler */}
        <Card title="Ödenecek sabit giderler" tone="#E03131" meta={fixed.length ? tl(fixedLeft) + ' bekliyor' : ''} onAll={go('cuzdan')}>
          {fixed.length ? (
            <div className="wd-rows">
              {fixed.slice(0, 6).map(({ f, d }) => {
                const late = d < t; const n = daysBetween(t, d);
                return (
                  <button key={f.id} type="button" className="wd-row" onClick={() => actions.openFixed(f)}>
                    <span className={'wd-ic ' + (late ? 'late' : 'today')} aria-hidden="true">{catOf(f.category).emoji}</span>
                    <span className="wd-row-main"><b>{f.title || catOf(f.category).label}</b><small>{tl(f.amount)} · her ayın {f.day_of_month}'i</small></span>
                    <span className={'wd-row-r' + (late ? ' late' : '')}>{late ? Math.abs(n) + ' gün gecikti' : n === 0 ? 'bugün' : n + ' gün sonra'}</span>
                  </button>
                );
              })}
            </div>
          ) : <p className="empty">Bu ayın sabit giderlerinin hepsi ödendi ✓</p>}
        </Card>

        {/* Alışkanlıklar: doğrudan işaretlenir */}
        <div className="pd-habits"><HabitsCard data={data} now={now} actions={actions} /></div>

        {/* Özel günler */}
        <Card title="Yaklaşan özel günler" tone="#D4A000" meta="60 gün" onAll={go('ozelgun')}>
          {specials.length ? (
            <div className="wd-rows">
              {specials.slice(0, 5).map(({ s, date, inDays }) => (
                <button key={s.id} type="button" className="wd-row" onClick={() => actions.openSpecial(s)}>
                  <span className="wd-ic sp" aria-hidden="true">{SPECIAL_ICON[s.kind] || '⭐'}</span>
                  <span className="wd-row-main"><b>{specialLabel(s, date)}</b><small>{fmtShort(date)} {WEEKDAYS[date.getDay()]}</small></span>
                  <span className={'pd-count' + (inDays <= 7 ? ' soon' : '')}>{inDays ? inDays + ' gün' : 'Bugün 🎉'}</span>
                </button>
              ))}
            </div>
          ) : <p className="empty">60 gün içinde özel gün yok.</p>}
        </Card>

        {/* Listeler */}
        <Card title="Listeler" tone="#2a78d6" meta={openItems ? openItems + ' madde açık' : ''} onAll={go('listeler')}>
          {lists.length ? (
            <div className="pd-lists">
              {lists.map((l) => {
                const its = items.filter((i) => i.list_id === l.id);
                const open = its.filter((i) => !i.done);
                return (
                  <button key={l.id} type="button" className="pd-list" onClick={go('listeler')}>
                    <span className="pd-list-top"><b>{l.title}</b><span>{open.length ? open.length + ' kaldı' : its.length ? 'tamam ✓' : 'boş'}</span></span>
                    {its.length ? <span className="pd-list-bar"><span style={{ width: ((its.length - open.length) / its.length) * 100 + '%' }} /></span> : null}
                    {open.length ? <small>{open.slice(0, 4).map((i) => i.label).join(' · ')}{open.length > 4 ? ' …' : ''}</small> : null}
                  </button>
                );
              })}
            </div>
          ) : <p className="empty">Henüz liste yok.</p>}
        </Card>

        {/* Yarim */}
        {!yarimHidden ? (
          <button type="button" className="card pd-yarim" onClick={go('yarim')}>
            <span className="pd-yarim-k">Yarim ❤️</span>
            <span className="pd-yarim-v">{yarimDays}<small> gündür birlikte</small></span>
            <span className="pd-yarim-s">{yarimOpen ? yarimOpen + ' açık Yarim hatırlatması' : 'açık hatırlatma yok'} · sayfayı aç →</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
