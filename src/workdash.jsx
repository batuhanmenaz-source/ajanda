// İş → Özet: işin tamamına tek bakış (ciro, kampanya, influencer, bekleyen, mail, geciken)
import { promoTitle } from './promos.jsx';
import { usedTotal } from './codes.jsx';
import { useMemo } from 'react';
import { mpColor, SRC_COLORS } from './constants.js';
import { WEEKDAYS, MONTHS, startOfDay, addDays, toDateInput, fromDateInput, daysBetween, fmtShort, fmtTime } from './dates.js';
import { tl, tlShort, glanceDefaultDay } from './revenue.jsx';
import { campaignStatus, campaignWhen } from './screens.jsx';
import { adStart, adStatus, adWindow, adFee, adRev, adWho, dur } from './ads.jsx';
import { inScope } from './scope.js';
import { Tile, AttentionBox } from './statstrip.jsx';

const pctTxt = (v) => (v == null ? '' : (v >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(v * 100)) + '%');
const dlt = (a, b) => (b > 0 ? a / b - 1 : null);
const sumDays = (byDay, from, to) => { let s = 0; for (const [k, v] of Object.entries(byDay)) if (k >= from && k <= to) s += v.total; return s; };

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

export function WorkDashboard({ data, now, actions, revenue, revTarget, mail, setSeg, salesDigest }) {
  const today = startOfDay(now);
  const todayKey = toDateInput(today);
  const mk = todayKey.slice(0, 7);
  const dim = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // ---- Ciro
  const byDay = useMemo(() => {
    const m = {};
    (revenue || []).forEach((r) => {
      const v = Number(r.amount) || 0;
      if (!m[r.day]) m[r.day] = { total: 0, by: {} };
      m[r.day].total += v;
      m[r.day].by[r.marketplace] = (m[r.day].by[r.marketplace] || 0) + v;
    });
    return m;
  }, [revenue]);
  const monthKeys = Object.keys(byDay).filter((k) => k.startsWith(mk));
  const monthTotal = monthKeys.reduce((a, k) => a + byDay[k].total, 0);
  const lastEntered = monthKeys.sort().slice(-1)[0];
  const daysIn = lastEntered ? Number(lastEntered.slice(8)) : 0;
  const pm = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const pmKey = toDateInput(pm).slice(0, 7);
  const prevSame = daysIn ? sumDays(byDay, pmKey + '-01', pmKey + '-' + String(Math.min(daysIn, new Date(pm.getFullYear(), pm.getMonth() + 1, 0).getDate())).padStart(2, '0')) : 0;
  const target = Number(revTarget) || 0;
  const tPct = target ? monthTotal / target : null;
  const expect = (today.getDate() - 1) / dim;
  const leftDays = dim - daysIn;
  const needPerDay = target && leftDays > 0 ? Math.max(0, (target - monthTotal) / leftDays) : 0;
  const lastDay = glanceDefaultDay(revenue || [], now);
  const ld = byDay[lastDay];
  const ldWk = byDay[toDateInput(addDays(fromDateInput(lastDay), -7))];
  const monthBy = {};
  monthKeys.forEach((k) => Object.entries(byDay[k].by).forEach(([n, v]) => { monthBy[n] = (monthBy[n] || 0) + v; }));
  const shares = Object.entries(monthBy).sort((a, b) => b[1] - a[1]);
  const mpOrder = shares.map(([n]) => n);
  const spark = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i - 14);
    const k = toDateInput(d);
    return { d, k, v: byDay[k] ? byDay[k].total : 0, by: byDay[k] ? byDay[k].by : {} };
  });
  const sparkMax = Math.max(1, ...spark.map((x) => x.v));
  const sparkAvg = (() => { const e = spark.filter((x) => x.v); return e.length ? e.reduce((a, x) => a + x.v, 0) / e.length : 0; })();

  // ---- Kampanyalar
  const camps = (data.campaigns || []).filter((c) => c.kind !== 'etkinlik' || c.marketplace);
  const withSt = camps.map((c) => ({ c, st: campaignStatus(c, now) }));
  const live = withSt.filter((x) => x.st.key === 'live').sort((a, b) => a.c.end_date.localeCompare(b.c.end_date));
  const soon = withSt.filter((x) => x.st.key === 'soon' && daysBetween(today, fromDateInput(x.c.start_date)) <= 21).sort((a, b) => a.c.start_date.localeCompare(b.c.start_date));
  const tasks = data.campaign_tasks || [];
  const prep = (id) => { const ts = tasks.filter((t) => t.campaign_id === id); return { done: ts.filter((t) => t.done).length, all: ts.length, next: ts.filter((t) => !t.done).sort((a, b) => a.sort - b.sort)[0] }; };
  const prepMissing = [...live, ...soon].reduce((a, x) => { const p = prep(x.c.id); return a + (p.all - p.done); }, 0);

  // ---- Influencer
  const ads = (data.collabs || []).filter((c) => c.status !== 'iptal' && adStart(c));
  const adsLive = ads.filter((c) => adStatus(c, now) === 'live').sort((a, b) => adWindow(a, now).e - adWindow(b, now).e);
  const adsSoon = ads.filter((c) => adStatus(c, now) === 'soon' && adStart(c) < addDays(today, 8)).sort((a, b) => adStart(a) - adStart(b));
  const adsMonth = ads.filter((c) => toDateInput(adStart(c)).startsWith(mk));
  const adSpend = adsMonth.reduce((a, c) => a + adFee(c), 0);
  const adRevenue = adsMonth.reduce((a, c) => a + adRev(c), 0);

  // ---- Bekleyenler, mailler, gecikenler, bugün
  const fups = (data.followups || []).filter((f) => !f.done).sort((a, b) => a.since.localeCompare(b.since));
  const oldest = fups.length ? daysBetween(fromDateInput(fups[0].since), today) : 0;
  const m = (mail && mail.mail) || {};
  const flagged = m.flagged || []; const waiting = m.waiting || [];
  const workRem = (data.reminders || []).filter((r) => !r.done && inScope(r, 'is'));
  const late = workRem.filter((r) => r.due_at && new Date(r.due_at) < now).sort((a, b) => a.due_at.localeCompare(b.due_at));

  const go = (t) => () => setSeg(t);

  // ---- Dikkat: bugün bakılması gerekenler (tek liste)
  const att = [];
  late.slice(0, 3).forEach((r) => att.push({ k: 'l' + r.id, tone: 'red', icon: '⏰', text: <><b>{r.title}</b> · {daysBetween(startOfDay(new Date(r.due_at)), today) ? daysBetween(startOfDay(new Date(r.due_at)), today) + ' gün gecikti' : 'bugün ' + fmtTime(new Date(r.due_at)) + ' geçti'}</>, go: () => actions.openReminder(r) }));
  if (late.length > 3) att.push({ k: 'lm', tone: 'red', icon: '⏰', text: <><b>{late.length - 3} geciken iş daha</b></>, go: () => actions.openReminder(late[3]) });
  soon.forEach(({ c }) => {
    const p = prep(c.id); const inD = daysBetween(today, fromDateInput(c.start_date));
    if (inD <= 2 && p.all && p.done < p.all) att.push({ k: 'c' + c.id, tone: 'amber', icon: '📣', text: <><b>{c.name}</b> {inD <= 0 ? 'bugün' : inD === 1 ? 'yarın' : inD + ' gün sonra'} başlıyor · hazırlık <b>{p.done}/{p.all}</b>{p.next ? ' · sıradaki: ' + (p.next.label || '') : ''}</>, go: () => actions.openCampaign(c) });
  });
  live.filter(({ c }) => c.end_date === todayKey).forEach(({ c }) => att.push({ k: 'e' + c.id, tone: 'amber', icon: '🏁', text: <><b>{c.name}</b> bugün bitiyor{c.marketplace ? ' · ' + c.marketplace : ''}</>, go: () => actions.openCampaign(c) }));
  adsLive.filter((c) => { const w = adWindow(c, now); return w.e - now < 86400000; }).forEach((c) => att.push({ k: 'a' + c.id, tone: 'blue', icon: '🎬', text: <><b>{c.handle || c.title || adWho(c, data.contacts)}</b> reklamı {dur(adWindow(c, now).e - now)} sonra bitiyor{adRev(c) ? '' : ' · cirosunu girmeyi unutma'}</>, go: () => actions.openCollab(c) }));
  const codesEnd = (data.inf_codes || []).filter((c) => c.end_at && new Date(c.end_at) >= now && new Date(c.end_at) < addDays(today, 2));
  if (codesEnd.length) att.push({ k: 'codes', tone: 'blue', icon: '🏷️', text: <><b>{codesEnd.length} indirim kodu</b> {codesEnd.every((c) => new Date(c.end_at) < addDays(today, 1)) ? 'bugün' : 'yarın'} bitiyor: {codesEnd.slice(0, 4).map((c) => c.code).join(', ')}{codesEnd.length > 4 ? '…' : ''}</>, go: go('influencer') });
  const promosOpen = (data.promos || []).filter((p) => p.end_at && new Date(p.end_at) >= now);
  const promoEnd = promosOpen.filter((p) => new Date(p.end_at) < addDays(today, 1));
  if (promoEnd.length) att.push({ k: 'pe', tone: 'amber', icon: '🎯', text: <><b>{promoEnd.length} indirim kurgusu</b> bugün bitiyor: {promoEnd.slice(0, 3).map(promoTitle).join(', ')}{promoEnd.length > 3 ? '…' : ''}</>, go: () => { try { sessionStorage.setItem('ajanda-camp-sub', 'kurgu'); } catch { /* yok say */ } setSeg('kampanya'); } });
  promosOpen.filter((p) => p.order_limit && usedTotal(p) / Number(p.order_limit) >= 0.9 && new Date(p.start_at || 0) <= now).slice(0, 2).forEach((p) => att.push({ k: 'pl' + p.id, tone: 'red', icon: '🎯', text: <><b>{promoTitle(p)}</b> kullanım limitine yaklaştı · {usedTotal(p).toLocaleString('tr-TR')} / {Number(p.order_limit).toLocaleString('tr-TR')}{p.marketplace ? ' · ' + p.marketplace : ''}</>, go: () => actions.openPromo(p) }));
  const sd = salesDigest;
  if (sd && sd.day && daysBetween(fromDateInput(sd.day), today) <= 5) (sd.alerts || []).forEach((a, i) => att.push({ k: 's' + i, tone: a.t === 'drop' ? 'amber' : 'red', icon: a.t === 'stock' ? '📦' : a.t === 'stop' ? '⛔' : '📉', text: <><b>{a.x.charAt(0).toLocaleUpperCase('tr-TR') + a.x.slice(1)}</b> · {a.n}</>, go: go('satislar') }));
  fups.filter((f) => daysBetween(fromDateInput(f.since), today) >= 14).slice(0, 2).forEach((f) => att.push({ k: 'f' + f.id, tone: 'amber', icon: '⏳', text: <><b>{f.title}</b> {daysBetween(fromDateInput(f.since), today)} gündür bekliyor{f.party ? ' · ' + f.party : ''}</>, go: () => (actions.openFollowup ? actions.openFollowup(f) : setSeg('bekleyenler')) }));
  const oldMail = waiting.filter((x) => x.days >= 5);
  if (oldMail.length) att.push({ k: 'mail', tone: 'blue', icon: '✉️', text: <><b>{oldMail.length} mail</b> 5+ gündür cevap bekliyor</>, go: go('mailler') });
  const sdOk = sd && sd.day && daysBetween(fromDateInput(sd.day), today) <= 5;

  return (
    <div className="wd">
      {/* Başlık */}
      <div className="wd-hero">
        <div>
          <span className="wd-hero-k">İş özeti</span>
          <h2>{today.getDate()} {MONTHS[today.getMonth()]} {WEEKDAYS[today.getDay()]}</h2>
        </div>
        <div className="wd-hero-pills">
          {live.length ? <span className="wd-pill" style={{ '--tone': SRC_COLORS.Kampanya }}>{live.length} kampanya aktif</span> : null}
          {adsLive.length ? <span className="wd-pill" style={{ '--tone': '#0C8599' }}>{adsLive.length} reklam yayında</span> : null}
          {late.length ? <span className="wd-pill" style={{ '--tone': '#C92A2A' }}>{late.length} geciken iş</span> : <span className="wd-pill" style={{ '--tone': '#2B8A3E' }}>Geciken iş yok</span>}
        </div>
      </div>

      <AttentionBox items={att} title="Dikkat" empty="Bugün işte dikkat gerektiren bir şey yok ✓" />

      {/* Rakamlar */}
      <div className="wd-tiles n4">
        <Tile tone="#2F4AC0" label={MONTHS[today.getMonth()] + ' cirosu'} value={tlShort(monthTotal)} delta={dlt(monthTotal, prevSame)}
          sub={prevSame ? 'geçen ayın ilk ' + daysIn + ' gününe göre' : 'bu ay ' + monthKeys.length + ' gün girildi'} onClick={go('ciro')}>
          {target ? (
            <span className="wd-target">
              <span className="wd-target-bar"><span className={tPct >= expect ? 'ok' : 'behind'} style={{ width: Math.min(100, tPct * 100) + '%' }} /><i style={{ left: Math.min(100, expect * 100) + '%' }} /></span>
              <span className="wd-target-t">Hedefin %{Math.round(tPct * 100)}'i{needPerDay ? ' · günde ' + tlShort(needPerDay) + ' gerekli' : ''}</span>
            </span>
          ) : null}
        </Tile>
        <Tile tone="#7048E8" label={lastDay === toDateInput(addDays(today, -1)) ? 'Dünkü ciro' : 'Son girilen ciro'} value={ld ? tlShort(ld.total) : '—'}
          delta={ld && ldWk ? dlt(ld.total, ldWk.total) : null} sub={ld ? fmtShort(fromDateInput(lastDay)) + ' · geçen haftanın aynı gününe göre' : 'henüz girilmedi'} onClick={go('ciro')} />
        {sdOk ? (
          <Tile tone="#D9480F" label={'Satış raporu · ' + fmtShort(fromDateInput(sd.day))} value={tlShort(sd.r)} delta={sd.d1} warn={(sd.alerts || []).length > 0} onClick={go('satislar')}
            sub={(sd.ww != null ? '7 gün ' + pctTxt(sd.ww) : '') + ((sd.alerts || []).length ? ' · ' + sd.alerts.length + ' hero uyarısı' : ' · hero ürünler yolunda')} />
        ) : <Tile tone="#D9480F" label="Satış raporu" value="—" sub="dünün raporunu yükle" onClick={go('satislar')} />}
        <Tile tone="#0C8599" label={MONTHS[today.getMonth()] + ' reklam getirisi'} value={adSpend && adRevenue ? (adRevenue / adSpend).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'x' : '—'} onClick={go('influencer')}
          sub={adSpend ? tlShort(adSpend) + ' bütçe' + (adRevenue ? ' → ' + tlShort(adRevenue) + ' ciro' : ' · ciro girilmedi') : 'bu ay reklam yok'} />
      </div>

      <div className="wd-grid">
        {/* Ciro */}
        <Card title="Ciro · son 14 gün" tone="#2F4AC0" meta={sparkAvg ? 'günlük ort. ' + tlShort(sparkAvg) + ' · soluk çubuk = ortalamanın altı' : ''} onAll={go('ciro')} className="wd-span">
          <div className="wd-spark" role="img" aria-label="Son 14 günün cirosu">
            {spark.map((x) => (
              <button key={x.k} type="button" className={'wd-sp-col' + ([0, 6].includes(x.d.getDay()) ? ' we' : '')} onClick={() => actions.openRevenue(x.k)} title={fmtShort(x.d) + ': ' + (x.v ? tl(x.v) : 'girilmedi')}>
                <span className="wd-sp-v">{x.v ? tlShort(x.v).replace('₺', '') : ''}</span>
                <span className={'wd-sp-bar' + (sparkAvg && x.v < sparkAvg * 0.85 ? ' low' : '')} style={{ height: Math.max(x.v ? 3 : 0, (x.v / sparkMax) * 100) + '%' }}>
                  {mpOrder.filter((n) => x.by[n]).map((n) => <i key={n} style={{ flexGrow: x.by[n], background: mpColor(n) }} />)}
                </span>
                <span className="wd-sp-d">{x.d.getDate()}</span>
              </button>
            ))}
          </div>
          {shares.length ? (
            <>
              <div className="wd-share" aria-label="Bu ayın pazaryeri payları">
                {shares.map(([n, v]) => <span key={n} style={{ flexGrow: v, background: mpColor(n) }} title={n + ' ' + tl(v)} />)}
              </div>
              <div className="wd-share-list">
                {shares.slice(0, 9).map(([n, v]) => (
                  <span key={n}><i style={{ background: mpColor(n) }} />{n}<b>{tlShort(v)}</b><em>%{Math.round((v / monthTotal) * 100)}</em></span>
                ))}
              </div>
            </>
          ) : <p className="empty">Bu ay için ciro girilmedi.</p>}
        </Card>

        {/* Kampanyalar */}
        <Card title="Kampanyalar" tone={SRC_COLORS.Kampanya} meta={live.length + ' aktif · ' + soon.length + ' yaklaşan'} onAll={go('kampanya')}>
          {[...live, ...soon].length ? (
            <div className="wd-list">
              {[...live, ...soon].slice(0, 6).map(({ c, st }) => {
                const p = prep(c.id);
                const s = fromDateInput(c.start_date), e = fromDateInput(c.end_date);
                const fill = st.key === 'live' ? Math.min(1, (daysBetween(s, today) + 1) / (daysBetween(s, e) + 1)) : 0;
                return (
                  <button key={c.id} type="button" className={'wd-camp ' + st.key} style={{ '--mp': c.marketplace ? mpColor(c.marketplace) : '#5F3DC4' }} onClick={() => actions.openCampaign(c)}>
                    <span className="wd-camp-top">
                      <span className="wd-camp-mp">{c.marketplace || 'Genel'}</span>
                      <span className={'wd-camp-st ' + st.key}>{st.label}</span>
                    </span>
                    <span className="wd-camp-name">{c.name}</span>
                    <span className="wd-camp-when">{campaignWhen(c)}</span>
                    {st.key === 'live' ? <span className="wd-camp-bar"><span style={{ width: fill * 100 + '%' }} /></span> : null}
                    {p.all ? (
                      <span className={'wd-prep' + (p.done === p.all ? ' ok' : '')}>
                        <span className="wd-prep-dots">{Array.from({ length: Math.min(p.all, 8) }, (_, i) => <i key={i} className={i < p.done ? 'on' : ''} />)}</span>
                        {p.done === p.all ? 'Hazırlık tamam' : p.done + '/' + p.all + ' hazır' + (p.next ? ' · sıradaki: ' + (p.next.label || p.next.title || '') : '')}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : <p className="empty">Aktif ya da 3 hafta içinde başlayan kampanya yok.</p>}
        </Card>

        {/* Influencer */}
        <Card title="Influencer" tone="#0C8599" meta={adSpend ? 'bu ay ' + tlShort(adSpend) + ' bütçe' + (adRevenue ? ' · ' + tlShort(adRevenue) + ' ciro' : '') : ''} onAll={go('influencer')}>
          {adsLive.length || adsSoon.length ? (
            <div className="wd-rows">
              {[...adsLive, ...adsSoon].slice(0, 5).map((c) => {
                const st = adStatus(c, now); const w = adWindow(c, now);
                return (
                  <button key={c.id} type="button" className="wd-row" onClick={() => actions.openCollab(c)}>
                    <span className={'wd-dot ' + st} />
                    <span className="wd-row-main"><b>{c.handle || c.title || adWho(c, data.contacts)}</b><small>{[c.platform, c.marketplace, c.brand].filter(Boolean).join(' · ')}</small></span>
                    <span className="wd-row-r">{st === 'live' ? dur(w.e - now) + ' kaldı' : fmtShort(adStart(c)) + ' ' + fmtTime(adStart(c))}</span>
                  </button>
                );
              })}
            </div>
          ) : <p className="empty">Yayında ya da bu hafta başlayan reklam yok.</p>}
          {adSpend && adRevenue ? <div className="wd-roas">Bu ayın reklam getirisi <b>{(adRevenue / adSpend).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}x</b> <small>(ciro ÷ bütçe)</small></div> : null}
        </Card>

        {/* Bekleyenler */}
        <Card title="Bekleyenler" tone="#E67700" meta={fups.length ? fups.length + ' iş · en eskisi ' + oldest + ' gün' : ''} onAll={go('bekleyenler')}>
          {fups.length ? (
            <div className="wd-rows">
              {fups.slice(0, 5).map((f) => {
                const d = daysBetween(fromDateInput(f.since), today);
                return (
                  <button key={f.id} type="button" className="wd-row" onClick={() => (actions.openFollowup ? actions.openFollowup(f) : setSeg('bekleyenler'))}>
                    <span className="wd-age" data-old={d >= 14 ? '2' : d >= 7 ? '1' : '0'}>{d}g</span>
                    <span className="wd-row-main"><b>{f.title}</b><small>{[f.party, f.party !== f.marketplace ? f.marketplace : null].filter(Boolean).join(' · ')}</small></span>
                  </button>
                );
              })}
            </div>
          ) : <p className="empty">Bekleyen iş yok.</p>}
        </Card>

        {/* Mailler */}
        <Card title="Mailler" tone="#1971C2" meta={flagged.length + ' bayraklı · ' + waiting.length + ' cevap bekliyor'} onAll={go('mailler')}>
          {flagged.length || waiting.length ? (
            <div className="wd-rows">
              {flagged.slice(0, 3).map((x) => (
                <button key={'f' + x.uid} type="button" className="wd-row" onClick={go('mailler')}>
                  <span className="wd-ic flag" aria-hidden="true">⚑</span>
                  <span className="wd-row-main"><b>{x.subject}</b><small>{x.fromName || x.from}</small></span>
                </button>
              ))}
              {waiting.slice(0, 3).map((x) => (
                <button key={'w' + x.uid} type="button" className="wd-row" onClick={go('mailler')}>
                  <span className="wd-ic wait" aria-hidden="true">↩</span>
                  <span className="wd-row-main"><b>{x.subject}</b><small>{x.toName || x.to} · {x.days} gündür cevap yok</small></span>
                </button>
              ))}
            </div>
          ) : <p className="empty">{m.configured === false ? 'İş maili bağlı değil.' : 'Bayraklı ya da cevap bekleyen mail yok.'}</p>}
        </Card>

      </div>
    </div>
  );
}
