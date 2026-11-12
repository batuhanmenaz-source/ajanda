import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Mp, Check, Section, Progress } from './ui.jsx';
import { MARKETPLACES, SRC_COLORS, mpColor, YARIM_START, YARIM_STARTS } from './constants.js';
import { whatsappLink, DEFAULT_LOVE_MESSAGE, prettyPhone, normalizePhone } from './whatsapp.js';
import { mapsLink, mapsTarget } from './location.js';
import { occursOn, ruleLabel } from './recur.js';
import { prepDays } from './alerts.js';
import { specialOn, specialLabel, specialUpcoming, SPECIAL_ICON } from './special.js';
import {
  findContact, CampaignResult, WeeklySummary, weeklySummaryVisible, HabitsCard, ContactsView
} from './life.jsx';
import { SCOPES, scopeData } from './scope.js';
import { RevenueMini } from './revenue.jsx';
import { WeatherCard } from './weather.jsx';
import { FollowupsMini } from './work.jsx';
import { AdsTodayCard, adWho, adStart, adEnd, dur } from './ads.jsx';

const HERO_KIND = { rem: 'Sıradaki hatırlatma', call: 'Sıradaki arama', google: 'Google Takvim', yarim: 'Yarim için' };

const PinIcon = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>);

// Konuma dokununca Google Haritalar açılır
function LocLink({ location, geo, small }) {
  if (!location) return null;
  return (
    <a className={'loclink' + (small ? ' small' : '')} href={mapsLink(location, geo)} {...mapsTarget()} aria-label={location + ' haritada aç'}>
      <PinIcon /><span>{location}</span>
    </a>
  );
}
import {
  addDays, startOfDay, sameDay, fmtTime, fmtShort, fmtLong, whenLabel, rangeLabel, relDays, weekStart,
  WEEKDAYS_SHORT, fromDateInput, toDateInput, daysBetween, dayLabel
} from './dates.js';

// ---------- Yardımcılar ----------
// Saatli kampanya: "27 – 28 Kasım · 10:00–23:59" / "27 Kas 10:00 – 28 Kas 23:59"
export function campaignWhen(c) {
  const s = fromDateInput(c.start_date), e = fromDateInput(c.end_date);
  if (!c.start_time && !c.end_time) return rangeLabel(s, e);
  const a = c.start_time || '00:00', b = c.end_time || '23:59';
  return sameDay(s, e) ? fmtShort(s) + ' · ' + a + '–' + b : fmtShort(s) + ' ' + a + ' – ' + fmtShort(e) + ' ' + b;
}

export function campaignStatus(c, now = new Date()) {
  const s = fromDateInput(c.start_date);
  const e = fromDateInput(c.end_date);
  const t = startOfDay(now);
  if (t > e) return { key: 'past', label: 'Bitti' };
  const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  if (sameDay(t, e) && c.end_time && hm >= c.end_time) return { key: 'past', label: 'Bitti' };
  if (sameDay(t, s) && c.start_time && hm < c.start_time) return { key: 'soon', label: 'Bugün ' + c.start_time + '\'da başlıyor' };
  if (t >= s) {
    const left = daysBetween(t, e);
    return { key: 'live', label: left === 0 ? 'Son gün' + (c.end_time ? ' · ' + c.end_time + '\'e kadar' : '') : 'Aktif · ' + (left + 1) + ' gün' };
  }
  const n = daysBetween(t, s);
  return { key: 'soon', label: n === 1 ? 'Yarın başlıyor' : n + ' gün sonra' };
}

function tasksOf(tasks, id) {
  return tasks.filter((t) => t.campaign_id === id).sort((a, b) => a.sort - b.sort);
}

function isLate(it, now) {
  return !it.done && it.due_at && new Date(it.due_at) < now;
}

// Bir gün için tüm kayıtlar (Google, hatırlatma, arama, kampanya)
export function dayItems(day, { data, events }) {
  const out = [];
  (events || []).filter((e) => (e.allDay ? day >= startOfDay(e.start) && day <= startOfDay(e.end) : sameDay(e.start, day))).forEach((e) =>
    out.push({ key: 'g' + e.id + day.getDate(), time: e.allDay ? 'Tüm gün' : fmtTime(e.start), title: e.title, src: 'Google', color: SRC_COLORS.Google, sub: e.calendar, kind: 'google', item: e })
  );
  data.reminders.filter((r) => r.due_at && sameDay(new Date(r.due_at), day)).forEach((r) =>
    out.push({ key: 'r' + r.id, time: fmtTime(new Date(r.due_at)), title: r.title + (r.for_yarim ? ' ❤️' : ''), src: r.for_yarim ? 'Yarim' : 'Hatırlatma', color: r.for_yarim ? SRC_COLORS.Yarim : SRC_COLORS['Hatırlatma'], sub: r.marketplace, loc: r.location, geo: r.location_geo, done: r.done, item: r, kind: 'reminder' })
  );
  // Tekrarlayan hatırlatmaların ileriki tekrarları (yalnız görüntü)
  data.reminders.filter((r) => r.repeat_rule && r.due_at && !r.done).forEach((r) => {
    const due = new Date(r.due_at);
    if (day > startOfDay(due) && occursOn(due, r.repeat_rule, day)) {
      out.push({ key: 'rr' + r.id + day.getTime(), time: fmtTime(due), title: r.title + (r.for_yarim ? ' ❤️' : ''), src: r.for_yarim ? 'Yarim' : 'Hatırlatma', color: r.for_yarim ? SRC_COLORS.Yarim : SRC_COLORS['Hatırlatma'], sub: ['↻ ' + ruleLabel(r.repeat_rule, r.due_at), r.marketplace].filter(Boolean).join(' · '), loc: r.location, geo: r.location_geo, item: r, kind: 'reminder' });
    }
  });
  data.calls.filter((c) => c.due_at && sameDay(new Date(c.due_at), day)).forEach((c) =>
    out.push({ key: 'c' + c.id, time: fmtTime(new Date(c.due_at)), title: c.who + (c.topic ? ' — ' + c.topic : '') + (c.for_yarim ? ' ❤️' : ''), src: c.for_yarim ? 'Yarim' : 'Arama', color: c.for_yarim ? SRC_COLORS.Yarim : SRC_COLORS.Arama, sub: c.for_yarim ? 'Arama' : '', done: c.done, item: c, kind: 'call' })
  );
  data.campaigns.forEach((c) => {
    const s = fromDateInput(c.start_date);
    const e = fromDateInput(c.end_date);
    const isEvent = c.kind === 'etkinlik';
    const multi = !sameDay(s, e);
    const total = daysBetween(s, e) + 1;
    const nth = daysBetween(s, day) + 1;
    if (day >= s && day <= e) out.push({
      key: 'k' + c.id, time: sameDay(day, s) && c.start_time && c.start_time !== '00:00' ? c.start_time : !multi && c.start_time ? c.start_time : sameDay(day, e) && c.end_time && multi ? '–' + c.end_time : 'Tüm gün',
      title: c.name + (!multi ? '' : sameDay(day, s) ? ' başlıyor' : sameDay(day, e) ? ' son gün' : isEvent ? ' (' + nth + '/' + total + '. gün)' : ' aktif'),
      src: isEvent ? 'Etkinlik' : 'Kampanya', color: isEvent ? SRC_COLORS.Etkinlik : SRC_COLORS.Kampanya, sub: [c.marketplace, multi ? rangeLabel(s, e) : ''].filter(Boolean).join(' · '), loc: c.location, geo: c.location_geo, item: c, kind: 'campaign'
    });
    // Hatırlatma günleri (seçilen ya da eski sabit 3 ve 1 gün önce)
    const pd = c.alerts ? prepDays(c.alerts) : isEvent ? [] : [1, 3];
    const at = (c.alerts && c.alerts.at) || '09:00';
    const d = daysBetween(day, s);
    if (pd.includes(d)) out.push({ key: 'kp' + c.id + d, time: at, title: (isEvent ? 'Hatırlatma: ' : 'Hazırlık: ') + c.name + (d === 1 ? ' (yarın başlıyor)' : ' (' + d + ' gün kaldı)'), src: isEvent ? 'Etkinlik' : 'Kampanya', color: isEvent ? SRC_COLORS.Etkinlik : SRC_COLORS.Kampanya, sub: c.marketplace, item: c, kind: 'campaign' });
  });
  (data.notes || []).filter((n) => n.remind_at && sameDay(new Date(n.remind_at), day)).forEach((n) =>
    out.push({ key: 'n' + n.id, time: fmtTime(new Date(n.remind_at)), title: '📝 ' + n.title, src: 'Not', color: SRC_COLORS.Not || '#868E96', sub: n.marketplace || '', item: n, kind: 'note' })
  );
  (data.special_dates || []).filter((x) => specialOn(x, day)).forEach((x) =>
    out.push({ key: 's' + x.id + day.getFullYear(), time: 'Tüm gün', title: (SPECIAL_ICON[x.kind] || '⭐') + ' ' + specialLabel(x, day) + (x.for_yarim ? ' ❤️' : ''), src: 'Özel gün', color: x.for_yarim ? SRC_COLORS.Yarim : SRC_COLORS['Özel gün'], sub: x.for_yarim ? 'Yarim' : '', item: x, kind: 'special' })
  );
  const dk = toDateInput(day);
  (data.collabs || []).filter((c) => c.status !== 'iptal').forEach((c) => {
    const who = adWho(c, data.contacts);
    const sub = [c.platform, c.brand, c.marketplace].filter(Boolean).join(' · ');
    const base = { src: 'Influencer', color: SRC_COLORS.Influencer, item: c, kind: 'collab' };
    if (c.start_at) {
      const s = adStart(c), e = adEnd(c);
      if (sameDay(s, day)) out.push({ ...base, key: 'i' + c.id, time: fmtTime(s), title: '🎬 ' + who + (c.title ? ' — ' + c.title : '') + ' · yayına giriyor', sub: sub + (sub ? ' · ' : '') + 'bitiş ' + whenLabel(e, s), done: e < new Date() });
      if (sameDay(e, day) && !sameDay(s, day)) out.push({ ...base, key: 'ie' + c.id, time: fmtTime(e), title: '🏁 ' + who + (c.title ? ' — ' + c.title : '') + ' · bitiyor', sub, done: e < new Date() });
    } else if (c.publish_date === dk) {
      out.push({ ...base, key: 'i' + c.id, time: 'Tüm gün', title: '🎬 ' + who + (c.title ? ' — ' + c.title : ''), sub, done: c.status === 'yayinlandi' || c.status === 'odendi' });
    }
  });
  return out.sort((a, b) => {
    if (a.time === 'Tüm gün' && b.time !== 'Tüm gün') return -1;
    if (b.time === 'Tüm gün' && a.time !== 'Tüm gün') return 1;
    return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
  });
}

function ReminderRow({ r, now, onToggle, onOpen, showDay }) {
  const d = r.due_at ? new Date(r.due_at) : null;
  const late = isLate(r, now);
  return (
    <div className="row">
      <Check on={r.done} onClick={() => onToggle(r)} label={r.done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'} />
      <button type="button" className="body" onClick={() => onOpen(r)}>
        <span className={'title' + (r.done ? ' done' : '')}>{r.title}{r.for_yarim ? ' ❤️' : ''}</span>
        <span className="meta">
          {d ? <span className={'time' + (late ? ' late' : '')}>{showDay || late ? whenLabel(d, now) : fmtTime(d)}</span> : null}
          <Mp name={r.marketplace} />
          {r.repeat_rule ? <span className="tag" title="Tekrarlayan">↻ {ruleLabel(r.repeat_rule, r.due_at)}</span> : null}
          {r.location ? <span className="tag"><PinIcon />{r.location.length > 28 ? r.location.slice(0, 28) + '…' : r.location}</span> : null}
        </span>
      </button>
      {r.location ? <a className="missed-btn" href={mapsLink(r.location, r.location_geo)} {...mapsTarget()} aria-label={r.location + ' haritada aç'}><PinIcon /></a> : null}
    </div>
  );
}

function CallRow({ c, now, onToggle, onOpen, showDay }) {
  const d = c.due_at ? new Date(c.due_at) : null;
  const late = isLate(c, now);
  return (
    <div className="row">
      <Check on={c.done} onClick={() => onToggle(c)} label={c.done ? 'Aranmadı olarak işaretle' : 'Arandı olarak işaretle'} />
      <button type="button" className="body" onClick={() => onOpen(c)}>
        <span className={'title' + (c.done ? ' done' : '')}>{c.for_yarim ? c.who + ' ❤️' : c.who}</span>
        <span className="meta">
          {d ? <span className={'time' + (late ? ' late' : '')}>{showDay || late ? whenLabel(d, now) : fmtTime(d)}</span> : null}
          {c.topic ? <span>{c.topic}</span> : null}
        </span>
      </button>
      {c.phone ? <a className="callicon" href={'tel:' + c.phone.replace(/\s/g, '')} aria-label={c.who + ' ara'}><Icon.Phone width="18" height="18" /></a> : null}
    </div>
  );
}

function CampaignMini({ c, tasks, onOpen, result }) {
  const isEvent = c.kind === 'etkinlik';
  const ts = tasksOf(tasks, c.id);
  const st = campaignStatus(c);
  return (
    <div className="card camp">
      <div className="camp-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="tag" style={{ fontSize: 12, color: 'var(--ink-2)' }}><span className="dot" style={{ background: mpColor(c.marketplace) }} />{isEvent ? 'Etkinlik · ' : ''}{c.marketplace || (isEvent ? '' : 'Genel')}{c.marketplace || !isEvent ? ' · ' : ''}{campaignWhen(c)}</span>
          <button type="button" className="name" onClick={() => onOpen(c)}>{c.name}</button>
          <LocLink location={c.location} geo={c.location_geo} small />
        </div>
        <span className={'badge' + (st.key === 'live' ? ' live' : '')}>{st.label}</span>
      </div>
      {ts.length ? <Progress done={ts.filter((t) => t.done).length} total={ts.length} /> : null}
      {result || null}
    </div>
  );
}

// ---------- YARİM ----------
function nextMonthiversary(start, now) {
  for (let k = 1; k < 1200; k++) {
    const d = new Date(start);
    d.setMonth(start.getMonth() + k);
    if (d > now) return { date: d, months: k };
  }
  return null;
}

function OneCounter({ start, label, now }) {
  const diff = Math.max(0, now - start);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const next = nextMonthiversary(start, now);
  let nextText = '';
  if (next) {
    const n = daysBetween(now, next.date);
    const what = next.months % 12 === 0 ? (next.months / 12) + '. yıl dönümünüz' : next.months + '. ay dönümünüz';
    nextText = (n === 0 ? 'Bugün ' : n === 1 ? 'Yarın ' : n + ' gün sonra ') + what + (n <= 1 ? ' 💐' : '');
  }
  return (
    <div className="yc-one" aria-label={label + ' tarihinden beri: ' + days + ' gün ' + hours + ' saat'}>
      <div className="yc-num">
        <span className="yc-big">{days.toLocaleString('tr-TR')}</span><span className="yc-unit">gün</span>
        <span className="yc-big">{hours}</span><span className="yc-unit">saat</span>
      </div>
      <div className="yc-since">{label}'dan beri birlikte</div>
      {nextText ? <div className="yc-next">{nextText}</div> : null}
    </div>
  );
}

function YarimCounter({ now }) {
  return (
    <div className="yarim-counter">
      {YARIM_STARTS.map((x) => <OneCounter key={x.label} start={x.start} label={x.label} now={now} />)}
    </div>
  );
}

function LoveButton({ love, actions }) {
  const count = love.count || 0;
  const inner = (
    <>
      <span className="love-heart" aria-hidden="true">❤️</span>
      <span className="love-count" aria-hidden="true">{count}</span>
    </>
  );
  if (!love.phone) {
    return (
      <button type="button" className="love-btn" onClick={actions.openYarimSettings} aria-label="WhatsApp numarasını ayarla">
        {inner}
      </button>
    );
  }
  return (
    <a className="love-btn" href={whatsappLink(love.phone, love.message)} target="_blank" rel="noopener noreferrer"
      onClick={actions.loveTapped} aria-label={'WhatsApp ile "' + (love.message || DEFAULT_LOVE_MESSAGE) + '" gönder. Şimdiye kadar ' + count + ' kez gönderildi'}>
      {inner}
    </a>
  );
}

function yarimItems(data, now) {
  const today = startOfDay(now);
  const until = addDays(today, 8);
  return [
    ...data.reminders.filter((r) => r.for_yarim).map((r) => ({ kind: 'reminder', item: r, due: r.due_at ? new Date(r.due_at) : null })),
    ...data.calls.filter((c) => c.for_yarim).map((c) => ({ kind: 'call', item: c, due: c.due_at ? new Date(c.due_at) : null }))
  ]
    .filter((x) => (x.item.done ? x.due && sameDay(x.due, today) : !x.due || x.due < until))
    .sort((a, b) => (a.due ? a.due.getTime() : 9e15) - (b.due ? b.due.getTime() : 9e15));
}

const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);

// Kareye dokununca açılan ayrıntılı Yarim paneli
export function YarimPanel({ data, now, actions, love }) {
  const items = yarimItems(data, now);
  const openCount = items.filter((x) => !x.item.done).length;
  return (
    <div className="yarim yarim-panel">
      <div className="yarim-head">
        <LoveButton love={love} actions={actions} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className="iconbtn yarim-gear" aria-label="Yarim ayarları" onClick={actions.openYarimSettings}><GearIcon /></button>
          <button type="button" className="yarim-add" onClick={actions.newYarim}>+ Ekle</button>
        </div>
      </div>
      <YarimCounter now={now} />
      <YarimSpecials data={data} now={now} actions={actions} />
      {items.length ? (
        <div className="list yarim-list">
          {items.map((x) => (x.kind === 'reminder'
            ? <ReminderRow key={'r' + x.item.id} r={x.item} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} showDay />
            : <CallRow key={'c' + x.item.id} c={x.item} now={now} onToggle={actions.toggleCall} onOpen={actions.openCall} showDay />))}
        </div>
      ) : <p className="yarim-empty">Önümüzdeki günlerde onunla ilgili bir şey yok. Özel günleri, sürprizleri, aranacakları buraya ekleyebilirsin.</p>}
      {openCount ? <span className="yarim-foot">{openCount} açık · önümüzdeki 7 gün</span> : null}
      <button type="button" className="linkbtn yarim-hide" onClick={actions.hideYarim}>Bu cihazda gizle</button>
    </div>
  );
}

function YarimSpecials({ data, now, actions }) {
  const ups = specialUpcoming((data.special_dates || []).filter((x) => x.for_yarim), now);
  return (
    <div className="yarim-specials">
      {ups.map(({ s, date, inDays }) => (
        <button key={s.id} type="button" className="ysp" onClick={() => actions.openSpecial(s)}>
          <span>{SPECIAL_ICON[s.kind] || '⭐'} {specialLabel(s, date)}</span>
          <span className="w">{inDays === 0 ? 'Bugün' : inDays === 1 ? 'Yarın' : fmtShort(date) + ' · ' + inDays + ' gün'}</span>
        </button>
      ))}
      <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => actions.openSpecial({ for_yarim: true })}>+ Özel gün (doğum günü, yıl dönümü…)</button>
    </div>
  );
}

// Ana sayfanın sağ üstündeki kare
function YarimTile({ data, now, actions, love }) {
  const counts = YARIM_STARTS.map((x) => { const diff = Math.max(0, now - x.start); return { days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000) }; });
  const { days, hours } = counts[0];
  const today = startOfDay(now);
  // Yaklaşan Yarim kayıtları (gecikenler dahil, tarihsizler en sonda)
  const items = yarimItems(data, now).filter((x) => !x.item.done);
  const annivs = YARIM_STARTS.map((x, i) => {
    const next = nextMonthiversary(x.start, now);
    const nd = next ? daysBetween(now, next.date) : 99;
    return next && nd <= 7
      ? { key: 'anniv' + i, title: (next.months % 12 === 0 ? (next.months / 12) + '. yıl dönümü' : next.months + '. ay dönümü') + ' 💐', when: nd === 0 ? 'Bugün' : nd === 1 ? 'Yarın' : nd + ' gün sonra' }
      : null;
  }).filter(Boolean);
  const rows = items.map((x) => ({
    key: x.kind + x.item.id,
    title: x.kind === 'call' ? x.item.who + ' ara' : x.item.title,
    when: x.due ? dayLabel(x.due, now) + ' ' + fmtTime(x.due) + (x.due < today ? ' · gecikti' : '') : 'Tarihsiz',
    late: x.due && x.due < now
  }));
  const specials = specialUpcoming((data.special_dates || []).filter((x) => x.for_yarim), now, 7).map(({ s, date, inDays }) => ({
    key: 'sp' + s.id, title: specialLabel(s, date) + ' ' + (SPECIAL_ICON[s.kind] || '⭐'), when: inDays === 0 ? 'Bugün' : inDays === 1 ? 'Yarın' : inDays + ' gün sonra'
  }));
  // "1 yıl önce bugün" anıları
  const mems = (data.memories || []).filter((m) => { const d = fromDateInput(m.day); return d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear(); })
    .map((m) => ({ key: 'm' + m.id, title: '📸 ' + m.title, when: (now.getFullYear() - Number(m.day.slice(0, 4))) + ' yıl önce bugün' }));
  const list = [...mems, ...annivs, ...specials, ...rows];
  const shown = list.slice(0, 3);
  const more = list.length - shown.length;
  return (
    <div className="ytile">
      <button type="button" className="ytile-open" onClick={actions.openYarim} aria-label={'Yarim alanını aç. ' + days + ' gün ' + hours + ' saattir birlikte. ' + (rows.length ? rows.length + ' yaklaşan kayıt' : 'Yaklaşan kayıt yok')} />
      <div className="ytile-top">
        <span className="ytile-name">Yarim</span>
        <LoveButton love={love} actions={actions} />
      </div>
      {counts.map((c, i) => <div key={i} className="ytile-count" aria-hidden="true"><b>{c.days.toLocaleString('tr-TR')}</b> gün <b>{c.hours}</b> <span className="u-long">saat</span><span className="u-short">sa</span></div>)}
      <div className="ytile-list" aria-hidden="true">
        {shown.length ? shown.map((r) => (
          <div key={r.key} className="ytile-item">
            <span className="t">{r.title}</span>
            <span className={'w' + (r.late ? ' late' : '')}>{r.when}</span>
          </div>
        )) : <span className="ytile-empty">Yaklaşan bir şey yok. Eklemek için dokun.</span>}
        {list.length > 2 ? <span className="ytile-more m-more">+{list.length - 2} daha</span> : null}
        {more > 0 ? <span className="ytile-more d-more">+{more} daha</span> : null}
      </div>
    </div>
  );
}

// ---------- CEVAPSIZ ÇAĞRILAR ----------
const MissedIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /><path d="M16 3l5 5M21 3l-5 5" /></svg>
);

export function MissedCallsSection({ missed, now, actions, showEmpty, configured, contacts }) {
  const open = (missed || []).filter((m) => !m.handled).sort((a, b) => b.missed_at.localeCompare(a.missed_at));
  if (!open.length && !showEmpty) return null;
  return (
    <Section title="Cevapsız çağrılar" tone="#E03131" tint="#FFF5F5" action={open.length > 1
      ? <button type="button" className="linkbtn" onClick={actions.missedClearAll}>Tümünü kapat</button>
      : <span className="meta">{open.length ? open.length + ' çağrı' : ''}</span>}>
      <div className="card list missed-list">
        {open.length ? open.map((m) => {
          const t = new Date(m.missed_at);
          const num = prettyPhone(m.phone);
          const known = !m.name ? findContact(contacts, m.phone) : null;
          if (known) m = { ...m, name: known.name };
          return (
            <div key={m.id} className="row missed-row">
              <span className="missed-icon"><MissedIcon /></span>
              <div className="body" style={{ padding: '10px 0' }}>
                <span className="title" style={{ fontWeight: 600 }}>{m.name || num || 'Bilinmeyen numara'}</span>
                <span className="meta"><span className="time">{whenLabel(t, now)}</span>{m.name && num ? <span>{num}</span> : null}</span>
              </div>
              {m.phone ? <a className="missed-btn call" href={'tel:+' + normalizePhone(m.phone)} aria-label={(m.name || num) + ' geri ara'}><Icon.Phone width="18" height="18" /></a> : null}
              <button type="button" className="missed-btn" aria-label={(m.name || num) + ' için arama hatırlatması kur'} onClick={() => actions.missedLater(m)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M5 3L2 6M22 6l-3-3" /></svg>
              </button>
              <button type="button" className="missed-btn" aria-label={(m.name || num) + ' kapat'} onClick={() => actions.missedDone(m)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </button>
            </div>
          );
        }) : (
          <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <span>{configured ? 'Cevapsız çağrı yok.' : 'Telefon bağlantısı henüz kurulmadı.'}</span>
            {!configured ? <button type="button" className="btn" onClick={actions.openMissedSetup}>Bağlantıyı kur</button> : null}
          </div>
        )}
      </div>
    </Section>
  );
}

// ---------- PAZARYERİ ----------
export function marketplaceCounts(data, now) {
  const today = toDateInput(startOfDay(now));
  const out = {};
  for (const m of MARKETPLACES) out[m.name] = 0;
  data.reminders.forEach((r) => { if (!r.done && r.marketplace && out[r.marketplace] !== undefined) out[r.marketplace]++; });
  data.campaigns.forEach((c) => { if (c.end_date >= today && c.marketplace && out[c.marketplace] !== undefined) out[c.marketplace]++; });
  return out;
}

export function MarketplaceStrip({ data, now, actions }) {
  const counts = marketplaceCounts(data, now);
  return (
    <section className="section mp-strip">
      <div className="section-head"><h2>Pazaryerleri</h2></div>
      <div className="chips" style={{ flexWrap: 'wrap' }}>
        {MARKETPLACES.map((m) => (
          <button key={m.name} type="button" className="chip" onClick={() => actions.openMarketplace(m.name)}>
            <span className="dot" style={{ background: m.color }} />{m.name}{counts[m.name] ? <span className="mp-count">{counts[m.name]}</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MarketplacePanel({ name, data, now, actions }) {
  const today = toDateInput(startOfDay(now));
  const camps = data.campaigns.filter((c) => c.marketplace === name && c.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const rems = data.reminders.filter((r) => r.marketplace === name && !r.done).sort((a, b) => (a.due_at || '9').localeCompare(b.due_at || '9'));
  const notes = data.notes.filter((n) => n.marketplace === name).sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')).slice(0, 6);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="typechips">
        <button type="button" className="chip" onClick={() => actions.newReminderFor(name)}>+ Hatırlatma</button>
        <button type="button" className="chip" onClick={() => actions.openCampaign({ marketplace: name })}>+ Kampanya / etkinlik</button>
        <button type="button" className="chip" onClick={() => actions.openNote({ marketplace: name })}>+ Not</button>
      </div>
      <Section title="Kampanya ve etkinlikler" meta={camps.length ? camps.length + ' adet' : ''}>
        {camps.length ? camps.map((c) => <CampaignMini key={c.id} c={c} tasks={data.campaign_tasks} onOpen={actions.openCampaign} />)
          : <div className="card"><p className="empty">Yaklaşan kampanya ya da etkinlik yok.</p></div>}
      </Section>
      <FollowupsMini data={data} now={now} actions={actions} mp={name} limit={5} />
      <Section title="Hatırlatmalar" meta={rems.length ? rems.length + ' açık' : ''}>
        <div className="card list">
          {rems.length ? rems.map((r) => <ReminderRow key={r.id} r={r} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} showDay />)
            : <p className="empty">Açık hatırlatma yok.</p>}
        </div>
      </Section>
      <Section title="Notlar" meta={notes.length ? 'son ' + notes.length : ''}>
        {notes.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notes.map((n) => (
              <button type="button" key={n.id} className="note" onClick={() => actions.openNote(n)}>
                <span className="top"><span>{n.brand || ''}</span><span>{fmtShort(new Date(n.updated_at || n.created_at))}</span></span>
                <span className="h">{n.title}</span>
                {n.body ? <span className="b">{n.body.length > 180 ? n.body.slice(0, 180) + '…' : n.body}</span> : null}
              </button>
            ))}
          </div>
        ) : <div className="card"><p className="empty">Bu pazaryeri için not yok.</p></div>}
      </Section>
    </div>
  );
}

// Tamamlananlar listenin sonunda tek satıra katlanır
function DoneFold({ items, render }) {
  const [show, setShow] = useState(false);
  const open = items.filter((x) => !x.done), done = items.filter((x) => x.done);
  return (
    <>
      {open.map(render)}
      {done.length ? (
        <button type="button" className="done-fold" aria-expanded={show} onClick={() => setShow(!show)}>
          <span className="done-ic" aria-hidden="true">✓</span>{done.length} tamamlandı<span className="done-chev" aria-hidden="true">{show ? '▴' : '▾'}</span>
        </button>
      ) : null}
      {show ? done.map(render) : null}
    </>
  );
}

// ---------- BUGÜN ----------
export function TodayScreen({ data: rawData, events, google, now, actions, goTab, love, yarimHidden, month, setMonth, revenue, scope = 'tum', setScope, budgets, revReady, revTarget }) {
  const allData = scopeData(rawData, scope);
  const missedEl = <MissedCallsSection missed={allData.missed_calls} now={now} actions={actions} contacts={allData.contacts} />;
  const [sumHidden, setSumHidden] = useState(false);
  const showSummary = !sumHidden && weeklySummaryVisible(now);
  const hideSummary = () => { try { localStorage.setItem('ajanda-ozet-gizli', toDateInput(weekStart(now))); } catch { /* yok say */ } setSumHidden(true); };
  const today = startOfDay(now);
  const open = (arr) => arr.filter((x) => !x.done);
  // Yarim kayıtları kendi alanında takip edilir; iş listelerinde görünmez
  const data = { ...allData, reminders: allData.reminders.filter((r) => !r.for_yarim), calls: allData.calls.filter((c) => !c.for_yarim) };
  const rem = data.reminders.filter((r) => r.due_at && sameDay(new Date(r.due_at), today)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const calls = data.calls.filter((c) => c.due_at && sameDay(new Date(c.due_at), today)).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const lateR = open(data.reminders).filter((r) => r.due_at && new Date(r.due_at) < today);
  const lateC = open(data.calls).filter((c) => c.due_at && new Date(c.due_at) < today);
  const undated = open(data.reminders).filter((r) => !r.due_at);
  const yarimToday = [...allData.reminders, ...allData.calls].filter((x) => x.for_yarim && !x.done && x.due_at && sameDay(new Date(x.due_at), today));
  const gToday = (events || []).filter((e) => (e.allDay ? today >= startOfDay(e.start) && today <= startOfDay(e.end) : sameDay(e.start, today)));
  // Yayındakiler önce (en erken biten), sonra 30 gün içinde başlayacaklar
  const campsAll = data.campaigns.filter((c) => c.kind !== 'etkinlik')
    .map((c) => ({ c, st: campaignStatus(c, now) }))
    .filter(({ c, st }) => st.key === 'live' || (st.key === 'soon' && daysBetween(today, fromDateInput(c.start_date)) <= 30))
    .sort((a, b) => (a.st.key === 'live' ? 0 : 1) - (b.st.key === 'live' ? 0 : 1) || (a.st.key === 'live' ? a.c.end_date.localeCompare(b.c.end_date) : a.c.start_date.localeCompare(b.c.start_date)))
    .map((x) => x.c);
  const camps = campsAll.slice(0, 6);
  const liveCamps = campsAll.filter((c) => campaignStatus(c, now).key === 'live').length;

  const upcoming = [
    ...open(rem).map((r) => ({ t: new Date(r.due_at), title: r.title, meta: r.marketplace, kind: 'rem' })),
    ...open(calls).map((c) => ({ t: new Date(c.due_at), title: c.who + ' aranacak', meta: c.topic, kind: 'call' })),
    ...gToday.filter((e) => !e.allDay).map((e) => ({ t: e.start, title: e.title, meta: e.calendar, kind: 'google' })),
    ...yarimToday.map((x) => ({ t: new Date(x.due_at), title: (x.title || x.who + ' aranacak') + ' ❤️', meta: 'Yarim', kind: 'yarim' }))
  ].filter((x) => x.t >= now).sort((a, b) => a.t - b.t);
  const next = upcoming[0];
  const lateCount = lateR.length + lateC.length;
  // Bugün saatli iş kalmadıysa: sonraki günlerin ilk işi (saatliler önce)
  const later = useMemo(() => {
    if (next) return null;
    for (let i = 1; i <= 21; i++) {
      const d = addDays(today, i);
      const items = dayItems(d, { data: allData, events }).filter((e) => !e.done);
      const timed = items.find((e) => e.time !== 'Tüm gün');
      const pick = timed || items[0];
      if (pick) return { d, e: pick };
    }
    return null;
  }, [next, allData, events, today.getTime()]);
  const LATER_KIND = { 'Hatırlatma': 'rem', Not: 'rem', Arama: 'call', Google: 'google', Yarim: 'yarim', Kampanya: 'camp', Influencer: 'inf', Etkinlik: 'event', 'Özel gün': 'special' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    {setScope ? (
      <div className="scopebar" role="group" aria-label="Göster">
        {SCOPES.map(([v, l]) => <button key={v} type="button" className={scope === v ? 'on' : ''} aria-pressed={scope === v} onClick={() => setScope(v)}>{l}</button>)}
      </div>
    ) : null}
    <WeatherCard now={now} />
    <div className={'today-top' + (yarimHidden || scope === 'is' ? ' solo' : '')}>
        <section className={'hero hero-' + (next ? next.kind : lateCount ? 'late' : later ? (LATER_KIND[later.e.src] || 'free') : 'free')}>
          {next ? (
            <>
              <span className="k">{HERO_KIND[next.kind]} · {next.t - now < 60000 ? 'şimdi' : dur(next.t - now) + ' sonra'}</span>
              <span className="hero-main">
                <span className="hero-time">{fmtTime(next.t)}</span>
                <span className="hero-txt">
                  <span className="t">{next.title}</span>
                  {next.meta ? <span className="m">{next.meta}</span> : null}
                </span>
              </span>
              {upcoming.length > 1 ? (
                <span className="hero-after">
                  {upcoming.slice(1, 3).map((x, i) => <span key={i} className={'ha ha-' + x.kind}><b>{fmtTime(x.t)}</b>{x.title}</span>)}
                </span>
              ) : null}
            </>
          ) : lateCount ? (
            <>
              <span className="k">Bugünlük saatli iş kalmadı</span>
              <span className="t">{lateCount} geciken iş seni bekliyor</span>
              <span className="m">Aşağıdaki Gecikenler listesinden kapatabilirsin.</span>
            </>
          ) : later ? (
            <>
              <span className="k">Bugünlük iş kalmadı · sıradaki {dayLabel(later.d, now).toLocaleLowerCase('tr-TR')}</span>
              <span className="hero-main">
                {later.e.time !== 'Tüm gün' ? <span className="hero-time">{later.e.time}</span> : null}
                <span className="hero-txt">
                  <span className="t">{later.e.title}</span>
                  <span className="m">{later.e.src}{later.e.item && later.e.item.marketplace ? ' · ' + later.e.item.marketplace : ''}</span>
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="t">Önümüzdeki 3 haftada kayıt yok</span>
              <span className="m">Yeni bir şey eklemek için + düğmesini kullan</span>
            </>
          )}
        </section>
        {yarimHidden || scope === 'is' ? null : <YarimTile data={allData} now={now} actions={actions} love={love} />}
    </div>
    {revReady && scope !== 'ozel' ? <RevenueMini revenue={revenue} now={now} actions={actions} onOpen={() => goTab('ciro')} target={revTarget} /> : null}
    {showSummary ? <WeeklySummary data={rawData} revenue={revenue} now={now} actions={actions} onHide={hideSummary} budgets={budgets} scope={scope} /> : null}
    <div className="grid-2 today-grid">
      <div className="today-col">

        <div className="tslot" style={{ order: 1 }}>
        {lateCount ? (
          <Section title="Gecikenler" meta={lateCount + ' iş'} tone="#C92A2A" tint="#FFF5F5">
            <div className="card list">
              {lateR.map((r) => <ReminderRow key={r.id} r={r} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} showDay />)}
              {lateC.map((c) => <CallRow key={c.id} c={c} now={now} onToggle={actions.toggleCall} onOpen={actions.openCall} showDay />)}
            </div>
          </Section>
        ) : null}
        </div>

        <div className="tslot" style={{ order: 3 }}>
        <Section title="Hatırlatmalar" meta={open(rem).length ? open(rem).length + ' açık' : rem.length ? 'hepsi tamam' : ''} tone={SRC_COLORS['Hatırlatma']}>
          <div className="card list">
            {rem.length ? <DoneFold items={rem} render={(r) => <ReminderRow key={r.id} r={r} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} />} /> : <p className="empty">Bugün için hatırlatma yok.</p>}
          </div>
        </Section>
        </div>

        <div className="tslot" style={{ order: 6 }}>
        {scope !== 'ozel' ? <AdsTodayCard data={rawData} now={now} actions={actions} onAll={() => goTab('influencer')} /> : null}
        </div>
        <div className="tslot" style={{ order: 7 }}>
        {scope !== 'ozel' ? <FollowupsMini data={rawData} now={now} actions={actions} onAll={() => goTab('bekleyenler')} /> : null}
        </div>
        <div className="tslot" style={{ order: 9 }}>
        {scope !== 'is' ? <HabitsCard data={allData} now={now} actions={actions} /> : null}
        </div>

        <div className="tslot" style={{ order: 10 }}>
        {undated.length ? (
          <Section title="Tarihsiz işler" meta={undated.length + ' iş'} tone="#868E96">
            <div className="card list">
              {undated.map((r) => <ReminderRow key={r.id} r={r} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} />)}
            </div>
          </Section>
        ) : null}
        </div>
      </div>

      <div className="today-col">
        <div className="tslot" style={{ order: 2 }}>
        {missedEl}
        </div>
        <div className="tslot" style={{ order: 8 }}>
        <Section title="Takvim" meta="Google Takvim" tone={SRC_COLORS.Google}>
          <div className="card list">
            {google !== 'ok' && google !== 'off' ? <p className="empty">{google === 'checking' ? 'Google Takvim yükleniyor…' : 'Google Takvim bağlı değil.'}</p>
              : gToday.length ? gToday.map((e) => (
                <button type="button" key={e.id} className="rowbtn row timeline" onClick={() => actions.openGoogleEvent(e)}>
                  <span className="tcol">{e.allDay ? 'Tüm gün' : fmtTime(e.start)}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 15 }}>{e.title}</span>
                    <span className="tag" style={{ fontSize: 12, color: 'var(--ink-2)' }}><span className="dot" style={{ background: e.color }} />{e.calendar}</span>
                  </span>
                </button>
              )) : <p className="empty">{google === 'off' ? 'Örnek modda Google Takvim kapalı.' : 'Bugün takviminde etkinlik yok.'}</p>}
          </div>
        </Section>
        </div>

        <div className="tslot" style={{ order: 4 }}>
        <Section title="Aranacaklar" meta={open(calls).length ? open(calls).length + ' açık' : calls.length ? 'hepsi tamam' : ''} tone={SRC_COLORS.Arama}>
          <div className="card list">
            {calls.length ? <DoneFold items={calls} render={(c) => <CallRow key={c.id} c={c} now={now} onToggle={actions.toggleCall} onOpen={actions.openCall} />} /> : <p className="empty">Bugün aranacak kimse yok.</p>}
          </div>
        </Section>
        </div>

        <div className="tslot" style={{ order: 5 }}>
        {scope !== 'ozel' ? (
          <Section title={'Kampanyalar' + (campsAll.length ? ' · ' + (liveCamps ? liveCamps + ' aktif' : '') + (liveCamps && campsAll.length > liveCamps ? ', ' : '') + (campsAll.length > liveCamps ? (campsAll.length - liveCamps) + ' yakında' : '') : '')} tone={SRC_COLORS.Kampanya} action={<button type="button" className="linkbtn" onClick={() => goTab('kampanya')}>Tümü</button>}>
            {camps.length ? <div className="camp-grid">{camps.map((c) => <CampaignMini key={c.id} c={c} tasks={data.campaign_tasks} onOpen={actions.openCampaign} />)}</div> : <div className="card"><p className="empty">Önümüzdeki 30 günde kampanya yok.</p></div>}
            {campsAll.length > camps.length ? <button type="button" className="linkbtn" style={{ alignSelf: 'center', padding: '4px 0' }} onClick={() => goTab('kampanya')}>+{campsAll.length - camps.length} kampanya daha</button> : null}
          </Section>
        ) : null}
        </div>
      </div>
    </div>
    <UpcomingDays data={allData} events={events} google={google} now={now} actions={actions} onAll={() => goTab('takvim')} />
    {scope !== 'ozel' ? <MarketplaceStrip data={allData} now={now} actions={actions} /> : null}
    </div>
  );
}

// Takvimdeki tek satır (Takvim ekranı ve Yaklaşan günler ortak kullanır)
function DayItemRow({ e, actions, compact }) {
  return (
    <div className={'ditem' + (compact ? ' compact' : '')}>
      <button type="button" className={'rowbtn row timeline' + (compact ? ' compact' : '')}
        onClick={() => (e.kind === 'reminder' ? actions.openReminder(e.item) : e.kind === 'call' ? actions.openCall(e.item) : e.kind === 'campaign' ? actions.openCampaign(e.item) : e.kind === 'special' ? actions.openSpecial(e.item) : e.kind === 'collab' ? actions.openCollab(e.item) : e.kind === 'note' ? actions.openNote(e.item) : e.kind === 'google' ? actions.openGoogleEvent(e.item) : null)}>
        <span className="tcol">{e.time}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="ditem-title" style={{ textDecoration: e.done ? 'line-through' : 'none', color: e.done ? 'var(--muted)' : 'inherit' }}>{e.title}</span>
          <span className="tag" style={{ fontSize: 12, color: 'var(--ink-2)' }}><span className="dot" style={{ background: e.color }} />{e.src}{e.sub ? ' · ' + e.sub : ''}</span>
        </span>
      </button>
      {/* Konuma dokununca doğrudan Haritalar açılır */}
      {e.loc ? <LocLink location={e.loc} geo={e.geo} small /> : null}
    </div>
  );
}

// Bugün sayfasının altındaki "Yaklaşan günler"
function UpcomingDays({ data, events, google, now, actions, count = 3, onAll }) {
  const today = startOfDay(now);
  const days = Array.from({ length: count }, (_, i) => addDays(today, i + 1));
  return (
    <Section title={'Yaklaşan ' + count + ' gün'} action={onAll ? <button type="button" className="linkbtn" onClick={onAll}>Takvimi aç</button> : null}>
      <div className="upcoming">
        {days.map((d) => {
          const items = dayItems(d, { data, events });
          return (
            <div key={d.toISOString()} className="card upday">
              <div className="upday-head">
                <span className="upday-name">{dayLabel(d, now)}</span>
                <span className="upday-date">{WEEKDAYS_SHORT[d.getDay()]} · {fmtShort(d)}</span>
                <button type="button" className="iconbtn upday-add" aria-label={fmtLong(d) + ' gününe ekle'} onClick={() => actions.newItemOn(d)}><Icon.Plus width="18" height="18" /></button>
              </div>
              <div className="list">
                {items.length ? items.map((e) => <DayItemRow key={e.key} e={e} actions={actions} compact />)
                  : <p className="empty">{google === 'checking' ? 'Yükleniyor…' : 'Boş gün'}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ---------- TAKVİM ----------
const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
// Filtre grupları (not → hatırlatma, Yarim ayrı)
const CAL_GROUPS = [['Kampanya', 'Kampanya'], ['Etkinlik', 'Etkinlik'], ['Influencer', 'Influencer'], ['Hatırlatma', 'Hatırlatma'], ['Arama', 'Arama'], ['Özel gün', 'Özel gün'], ['Yarim', 'Yarim'], ['Google', 'Google']];
const calGroup = (e) => (e.src === 'Not' ? 'Hatırlatma' : e.src);
const CAL_VIEWS = [['ay', 'Ay'], ['hafta', 'Hafta'], ['liste', 'Liste']];
const loadHidden = () => { try { return JSON.parse(localStorage.getItem('ajanda-cal-hide') || '[]'); } catch { return []; } };

// Bir günün eklenecek-kayıt düğmeleri
function DayAdd({ d, actions }) {
  return (
    <span className="cal-add">
      <button type="button" className="chip" onClick={() => actions.newItemOn(d)}>+ Hatırlatma</button>
      <button type="button" className="chip" onClick={() => actions.newCampaignOn(d)}>+ Kampanya</button>
      <button type="button" className="chip" onClick={() => actions.newEventOn(d)}>+ Etkinlik</button>
      <button type="button" className="chip" onClick={() => actions.newAdOn(d)}>+ Reklam</button>
    </span>
  );
}

// Gün kartı: başlık + kayıtlar (Hafta ve Liste görünümü, seçili gün)
function DayCard({ d, items, now, actions, google, emptyText, onAdd }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className={'card upday' + (sameDay(d, now) ? ' is-today' : '')}>
      <div className="upday-head">
        <span className="upday-name">{dayLabel(d, now)}</span>
        <span className="upday-date">{dayLabel(d, now) === fmtShort(d) ? WEEKDAYS_SHORT[d.getDay()] : WEEKDAYS_SHORT[d.getDay()] + ' · ' + fmtShort(d)}</span>
        <button type="button" className="iconbtn upday-add" aria-label={fmtLong(d) + ' gününe ekle'} aria-expanded={adding} onClick={() => (onAdd ? onAdd(d) : setAdding(!adding))}><Icon.Plus width="18" height="18" /></button>
      </div>
      {adding ? <div className="cal-addrow"><DayAdd d={d} actions={actions} /></div> : null}
      <div className="list">
        {items.length ? items.map((e) => <DayItemRow key={e.key} e={e} actions={actions} compact />)
          : <p className="empty">{google === 'checking' ? 'Yükleniyor…' : emptyText || 'Boş gün'}</p>}
      </div>
    </div>
  );
}

function MonthView({ data, events, google, now, actions, month, setMonth, sel, setSel, pass }) {
  const today = startOfDay(now);
  const gridStart = weekStart(month);
  const ads = (data.collabs || []).filter((c) => c.status !== 'iptal' && c.start_at);
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const d = addDays(gridStart, i);
    const items = dayItems(d, { data, events }).filter(pass);
    // Çok günlü kampanya/etkinlik ve yayındaki reklamlar şerit, diğerleri nokta/etiket
    const bars = items.filter((e) => e.kind === 'campaign' && e.time === 'Tüm gün').map((e) => ({ key: e.key, color: e.item && e.item.marketplace ? mpColor(e.item.marketplace) : e.color }));
    if (pass({ src: 'Influencer' })) {
      const d1 = addDays(d, 1);
      ads.filter((c) => new Date(c.start_at) < d1 && adEnd(c) > d).forEach((c) => bars.push({ key: 'ab' + c.id, color: c.marketplace ? mpColor(c.marketplace) : SRC_COLORS.Influencer, ad: true }));
    }
    const rest = items.filter((e) => !(e.kind === 'campaign' && e.time === 'Tüm gün') && e.kind !== 'collab');
    return { d, items, bars, rest };
  }), [data, events, gridStart.getTime(), pass]);
  const rows = cells[35].d.getMonth() !== month.getMonth() ? 5 : 6;
  const shown = cells.slice(0, rows * 7);
  const selCell = sel ? shown.find((c) => sameDay(c.d, sel)) : null;
  const go = (n) => {
    const m = new Date(month.getFullYear(), month.getMonth() + n, 1);
    setMonth(m);
    setSel(m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth() ? today : m);
  };
  const isThisMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  return (
    <>
      <div className="week-nav">
        <button type="button" className="iconbtn" aria-label="Önceki ay" onClick={() => go(-1)}><Icon.Left /></button>
        <span className="lbl">{MONTH_NAMES[month.getMonth()]} {month.getFullYear()}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {!isThisMonth ? <button type="button" className="btn" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSel(today); }}>Bugün</button> : null}
          <button type="button" className="iconbtn" aria-label="Sonraki ay" onClick={() => go(1)}><Icon.Right /></button>
        </div>
      </div>
      <div className="card mcal">
        <div className="mcal-head" aria-hidden="true">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="mcal-grid">
          {shown.map(({ d, items, bars, rest }) => {
            const out = d.getMonth() !== month.getMonth();
            const past = d < today;
            const isToday = sameDay(d, today);
            const isSel = sel && sameDay(d, sel);
            const colors = [...new Set(rest.map((e) => e.color))].slice(0, 4);
            return (
              <button type="button" key={d.toISOString()}
                className={'mcal-day' + (out ? ' out' : '') + (past ? ' past' : '') + (isToday ? ' today' : '') + (isSel ? ' sel' : '')}
                onClick={() => setSel(d)} aria-pressed={!!isSel}
                aria-label={fmtLong(d) + (items.length ? ', ' + items.length + ' kayıt' : ', boş')}>
                <span className="mcal-num">{d.getDate()}</span>
                <span className="mcal-bars">
                  {bars.slice(0, 3).map((b) => <span key={b.key} className={'mcal-bar' + (b.ad ? ' ad' : '')} style={{ background: b.color }} />)}
                  {bars.length > 3 ? <span className="mcal-barmore">+{bars.length - 3}</span> : null}
                </span>
                <span className="mcal-dots">{colors.map((c) => <span key={c} className="dot" style={{ background: c, width: 6, height: 6 }} />)}</span>
                <span className="mcal-labels">
                  {items.slice(0, 3).map((e) => (
                    <span key={e.key} className="mcal-label"><span className="dot" style={{ background: e.item && e.item.marketplace && (e.kind === 'campaign' || e.kind === 'collab') ? mpColor(e.item.marketplace) : e.color, width: 6, height: 6 }} />{e.title}</span>
                  ))}
                  {items.length > 3 ? <span className="mcal-more">+{items.length - 3}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="hint" style={{ margin: '-6px 0 0' }}>Kalın şerit kampanya/etkinlik, ince şerit yayındaki influencer reklamı; renk pazaryerini gösterir.</p>
      {selCell ? <SelectedDay d={selCell.d} items={selCell.items} now={now} actions={actions} google={google} /> : null}
    </>
  );
}

function SelectedDay({ d, items, now, actions, google }) {
  return (
    <div className="card list cal-sel">
      <div className="upday-head">
        <span className="upday-name">{dayLabel(d, now)}</span>
        <span className="upday-date">{fmtLong(d)}</span>
      </div>
      <div className="cal-addrow"><DayAdd d={d} actions={actions} /></div>
      {items.length ? items.map((e) => <DayItemRow key={e.key} e={e} actions={actions} />)
        : <p className="empty">{google === 'checking' ? 'Google Takvim yükleniyor…' : 'Bu gün için kayıt yok.'}</p>}
    </div>
  );
}

function WeekView({ data, events, google, now, actions, day, setDay, pass }) {
  const ws = weekStart(day);
  const today = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
    const items = dayItems(d, { data, events }).filter(pass);
    const bars = [...new Map(items.filter((e) => e.kind === 'campaign' && e.time === 'Tüm gün').map((e) => [e.item.id, e.item && e.item.marketplace ? mpColor(e.item.marketplace) : e.color])).values()];
    return { d, items, open: items.filter((e) => !e.done).length, bars };
  });
  const sel = days.find((x) => sameDay(x.d, day)) || days[0];
  const later = days.filter((x) => x.d > sel.d);
  const isThisWeek = sameDay(ws, weekStart(now));
  return (
    <>
      <div className="week-nav">
        <button type="button" className="iconbtn" aria-label="Önceki hafta" onClick={() => setDay(addDays(day, -7))}><Icon.Left /></button>
        <span className="lbl">{rangeLabel(days[0].d, days[6].d)}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {!sameDay(day, today) ? <button type="button" className="btn" onClick={() => setDay(today)}>Bugün</button> : null}
          <button type="button" className="iconbtn" aria-label="Sonraki hafta" onClick={() => setDay(addDays(day, 7))}><Icon.Right /></button>
        </div>
      </div>
      <div className="wk-strip" role="tablist" aria-label="Haftanın günleri">
        {days.map(({ d, open, items, bars }) => {
          const on = sameDay(d, sel.d), isToday = sameDay(d, today), past = d < today;
          return (
            <button key={d.toISOString()} type="button" role="tab" aria-selected={on} onClick={() => setDay(d)}
              className={'wk-day' + (on ? ' sel' : '') + (isToday ? ' today' : '') + (past ? ' past' : '')}
              aria-label={fmtLong(d) + ', ' + (open ? open + ' açık kayıt' : 'açık kayıt yok')}>
              <span className="wk-wd">{isToday ? 'Bugün' : WEEKDAYS_SHORT[d.getDay()]}</span>
              <span className="wk-num">{d.getDate()}</span>
              <span className="wk-bars">{bars.slice(0, 3).map((c, i) => <span key={i} style={{ background: c }} />)}</span>
              <span className={'wk-count' + (open ? '' : ' zero')}>{open ? open : items.length ? '✓' : '·'}</span>
            </button>
          );
        })}
      </div>
      <SelectedDay d={sel.d} items={sel.items} now={now} actions={actions} google={google} />
      {later.length ? (
        <Section title={isThisWeek && sameDay(sel.d, today) ? 'Haftanın kalanı' : 'Sonraki günler'}>
          <div className="cal-days">
            {later.map(({ d, items }) => <DayCard key={d.toISOString()} d={d} items={items} now={now} actions={actions} google={google} />)}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function ListView({ data, events, google, now, actions, pass }) {
  const [span, setSpan] = useState(30);
  const today = startOfDay(now);
  const days = Array.from({ length: span }, (_, i) => addDays(today, i))
    .map((d) => ({ d, items: dayItems(d, { data, events }).filter(pass) }))
    .filter((x, i) => i === 0 || x.items.length);
  const end = addDays(today, span - 1);
  return (
    <>
      <div className="week-nav"><span className="lbl">Önümüzdeki {span} gün</span><span className="hint" style={{ margin: 0 }}>{rangeLabel(today, end)}</span></div>
      <div className="cal-days">
        {days.map(({ d, items }) => <DayCard key={d.toISOString()} d={d} items={items} now={now} actions={actions} google={google} emptyText="Bugün için kayıt yok." />)}
        {days.length === 1 && !days[0].items.length ? <div className="card"><p className="empty">Bu filtrede önümüzdeki {span} günde kayıt yok.</p></div> : null}
      </div>
      {span < 180 ? <button type="button" className="btn" onClick={() => setSpan(span + 30)}>30 gün daha göster</button> : null}
    </>
  );
}

export function CalendarScreen({ data, events, google, now, day, setDay, month, setMonth, actions, yarimHidden }) {
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('ajanda-cal-view') || 'ay'; } catch { return 'ay'; } });
  const setView = (v) => { setViewState(v); try { localStorage.setItem('ajanda-cal-view', v); } catch { /* yok say */ } };
  const [hidden, setHiddenState] = useState(loadHidden);
  const setHidden = (h) => { setHiddenState(h); try { localStorage.setItem('ajanda-cal-hide', JSON.stringify(h)); } catch { /* yok say */ } };
  const groups = CAL_GROUPS.filter(([k]) => !(yarimHidden && k === 'Yarim') && !(k === 'Google' && google === 'off'));
  const pass = useMemo(() => (e) => !hidden.includes(calGroup(e)), [hidden]);
  const toggle = (k) => setHidden(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]);
  // Ay görünümünde seçili gün ile gösterilen ay uyumlu kalsın
  const selectDay = (d) => { setDay(d); if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); };
  const props = { data, events, google, now, actions, pass };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 980 }}>
      <div className="seg three" role="tablist" aria-label="Takvim görünümü">
        {CAL_VIEWS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
      </div>
      <div className="cal-filters" role="group" aria-label="Gösterilecek kayıtlar">
        {groups.map(([k, l]) => {
          const on = !hidden.includes(k);
          return <button key={k} type="button" className={'chip cal-f' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(k)}><span className="dot" style={{ background: SRC_COLORS[k] }} />{l}</button>;
        })}
        {hidden.length ? <button type="button" className="linkbtn" onClick={() => setHidden([])}>Hepsini göster</button> : null}
      </div>
      {view === 'hafta' ? <WeekView {...props} day={day} setDay={setDay} />
        : view === 'liste' ? <ListView {...props} />
          : <MonthView {...props} month={month} setMonth={setMonth} sel={day} setSel={selectDay} />}
    </div>
  );
}

// ---------- KAMPANYALAR ----------
function CampaignCard({ c, tasks, actions, revenue, now }) {
  const [newTask, setNewTask] = useState('');
  const ts = tasksOf(tasks, c.id);
  const st = campaignStatus(c);
  const add = (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    actions.addTask(c, newTask.trim(), ts.length);
    setNewTask('');
  };
  return (
    <div className="card camp" style={{ padding: 16, gap: 12 }}>
      <div className="camp-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <Mp name={c.marketplace || 'Genel'} />
          <button type="button" className="name big" onClick={() => actions.openCampaign(c)}>{c.name}</button>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{campaignWhen(c)}{c.notes ? ' · ' + c.notes : ''}</span>
          <LocLink location={c.location} geo={c.location_geo} />
        </div>
        <span className={'badge' + (st.key === 'live' ? ' live' : '')}>{st.label}</span>
      </div>
      {ts.length ? <Progress done={ts.filter((t) => t.done).length} total={ts.length} /> : null}
      {st.key === 'live' ? <CampaignResult c={c} revenue={revenue} now={now} actions={actions} /> : null}
      <div className="list" style={{ gap: 0 }}>
        {ts.map((t) => (
          <div key={t.id} className="task">
            <Check square on={t.done} onClick={() => actions.toggleTask(t)} label={t.label + (t.done ? ' tamamlanmadı' : ' tamamlandı')} />
            <span className={'label' + (t.done ? ' done' : '')}>{t.label}</span>
            <button type="button" className="iconbtn" aria-label={t.label + ' adımını sil'} onClick={() => actions.deleteTask(t)}><Icon.Close width="16" height="16" /></button>
          </div>
        ))}
      </div>
      <form className="addtask" onSubmit={add}>
        <label htmlFor={'t-' + c.id} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Hazırlık adımı ekle</label>
        <input id={'t-' + c.id} type="text" placeholder="Hazırlık adımı ekle" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
        <button type="submit" className="btn" disabled={!newTask.trim()}>Ekle</button>
      </form>
    </div>
  );
}

export function CampaignsScreen({ data, actions, revenue, now = new Date() }) {
  const [showPast, setShowPast] = useState(false);
  const withSt = data.campaigns.filter((c) => c.kind !== 'etkinlik').map((c) => ({ c, st: campaignStatus(c) }));
  const current = withSt.filter((x) => x.st.key !== 'past').sort((a, b) => a.c.start_date.localeCompare(b.c.start_date));
  const past = withSt.filter((x) => x.st.key === 'past').sort((a, b) => b.c.end_date.localeCompare(a.c.end_date));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, flex: '1 1 260px' }}>Başlangıçtan 3 gün ve 1 gün önce Google Takvim üzerinden hazırlık hatırlatması gelir.</p>
        <button type="button" className="btn primary" onClick={() => actions.openCampaign({})}>+ Yeni kampanya</button>
      </div>
      <div className="notes-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {current.length ? current.map(({ c }) => <CampaignCard key={c.id} c={c} tasks={data.campaign_tasks} actions={actions} revenue={revenue} now={now} />) : <div className="card"><p className="empty">Yaklaşan kampanya yok.</p></div>}
      </div>
      {past.length ? (
        <Section title="Biten kampanyalar" action={<button type="button" className="linkbtn" onClick={() => setShowPast(!showPast)}>{showPast ? 'Gizle' : 'Göster (' + past.length + ')'}</button>}>
          {showPast ? <div className="notes-grid">{past.map(({ c }) => <CampaignMini key={c.id} c={c} tasks={data.campaign_tasks} onOpen={actions.openCampaign} result={<CampaignResult c={c} revenue={revenue} now={now} actions={actions} />} />)}</div> : null}
        </Section>
      ) : null}
    </div>
  );
}

// ---------- NOTLAR ----------
export function DailyNotes({ data, now, actions }) {
  const [date, setDate] = useState(toDateInput(now));
  const existing = data.daily_notes.find((d) => d.note_date === date);
  const [text, setText] = useState(existing ? existing.body : '');
  const [status, setStatus] = useState('');
  const timer = useRef(null);
  const lastSaved = useRef(existing ? existing.body : '');

  useEffect(() => {
    const ex = data.daily_notes.find((d) => d.note_date === date);
    setText(ex ? ex.body : '');
    lastSaved.current = ex ? ex.body : '';
    setStatus('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const onChange = (v) => {
    setText(v);
    setStatus('Yazılıyor…');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (v === lastSaved.current) { setStatus(''); return; }
      const ok = await actions.saveDaily(date, v);
      if (ok) { lastSaved.current = v; setStatus('Kaydedildi'); } else setStatus('Kaydedilemedi');
    }, 800);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const d = fromDateInput(date);
  const others = data.daily_notes.filter((x) => x.note_date !== date && x.body.trim()).sort((a, b) => b.note_date.localeCompare(a.note_date)).slice(0, 30);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="week-nav">
        <button type="button" className="iconbtn" aria-label="Önceki gün" onClick={() => setDate(toDateInput(addDays(d, -1)))}><Icon.Left /></button>
        <span className="lbl">{dayLabel(d, now) === fmtShort(d) ? fmtLong(d) : dayLabel(d, now) + ' · ' + fmtShort(d)}</span>
        <button type="button" className="iconbtn" aria-label="Sonraki gün" onClick={() => setDate(toDateInput(addDays(d, 1)))}><Icon.Right /></button>
      </div>
      <div className="daily">
        <label htmlFor="daily" style={{ fontSize: 13, color: 'var(--ink-2)' }}>Günün notu — yazdıkça kaydedilir</label>
        <textarea id="daily" value={text} onChange={(e) => onChange(e.target.value)} placeholder="Bugün neler oldu, neye dikkat etmek lazım?" />
        <span className="status" aria-live="polite">{status}</span>
      </div>
      {others.length ? (
        <Section title="Önceki günler">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {others.map((x) => (
              <button type="button" key={x.id} className="note" onClick={() => setDate(x.note_date)}>
                <span className="top"><span>{fmtLong(fromDateInput(x.note_date))}</span></span>
                <span className="b">{x.body.length > 220 ? x.body.slice(0, 220) + '…' : x.body}</span>
              </button>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

export function MarketplaceNotes({ data, actions }) {
  const [mp, setMp] = useState('Tümü');
  const [q, setQ] = useState('');
  const used = useMemo(() => {
    const st = new Set(data.notes.map((n) => n.marketplace || 'Genel'));
    return ['Tümü', ...MARKETPLACES.map((m) => m.name).filter((n) => st.has(n)), ...(st.has('Genel') ? ['Genel'] : [])];
  }, [data.notes]);
  const ql = q.trim().toLocaleLowerCase('tr-TR');
  const notes = data.notes
    .filter((n) => mp === 'Tümü' || (n.marketplace || 'Genel') === mp)
    .filter((n) => !ql || (n.title + ' ' + (n.body || '') + ' ' + (n.brand || '')).toLocaleLowerCase('tr-TR').includes(ql))
    .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <label htmlFor="nsearch" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Notlarda ara</label>
        <input id="nsearch" className="search" type="search" placeholder="Notlarda ara" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn primary" style={{ flex: '0 0 auto', minHeight: 46 }} onClick={() => actions.openNote({})}>+ Not</button>
      </div>
      <div className="chips">
        {used.map((m) => (
          <button key={m} type="button" className={'chip' + (mp === m ? ' on' : '')} onClick={() => setMp(m)} aria-pressed={mp === m}>
            {m !== 'Tümü' ? <span className="dot" style={{ background: mpColor(m === 'Genel' ? '' : m) }} /> : null}{m}
          </button>
        ))}
      </div>
      <div className="notes-grid">
        {notes.length ? notes.map((n) => (
          <button type="button" key={n.id} className="note" onClick={() => actions.openNote(n)}>
            <span className="top"><Mp name={n.marketplace || 'Genel'} /><span>{n.brand ? n.brand + ' · ' : ''}{fmtShort(new Date(n.updated_at || n.created_at))}</span></span>
            <span className="h">{n.title}</span>
            {n.body ? <span className="b">{n.body}</span> : null}
          </button>
        )) : <div className="card"><p className="empty">{q ? 'Aramaya uyan not yok.' : 'Henüz not yok.'}</p></div>}
      </div>
    </div>
  );
}

// ---------- ARAMALAR ----------
export function CallsScreen(props) {
  const [seg, setSegState] = useState(() => { try { return sessionStorage.getItem('ajanda-calls-seg') || 'arama'; } catch { return 'arama'; } });
  const setSeg = (v) => { setSegState(v); try { sessionStorage.setItem('ajanda-calls-seg', v); } catch { /* yok say */ } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="seg" role="group" aria-label="Görünüm" style={{ maxWidth: 360 }}>
        <button type="button" className={seg !== 'rehber' ? 'on' : ''} onClick={() => setSeg('arama')}>Aramalar</button>
        <button type="button" className={seg === 'rehber' ? 'on' : ''} onClick={() => setSeg('rehber')}>Rehber</button>
      </div>
      {seg === 'rehber' ? <ContactsView data={props.data} actions={props.actions} /> : <CallsList {...props} />}
    </div>
  );
}

function CallsList({ data, now, actions, missedConfigured }) {
  const open = data.calls.filter((c) => !c.done).sort((a, b) => (a.due_at || '9').localeCompare(b.due_at || '9'));
  const done = data.calls.filter((c) => c.done).sort((a, b) => (b.due_at || '').localeCompare(a.due_at || '')).slice(0, 20);
  const card = (c) => {
    const d = c.due_at ? new Date(c.due_at) : null;
    const late = isLate(c, now);
    return (
      <div key={c.id} className="card callcard">
        <div className="who">
          {c.phone ? <a className="callicon" href={'tel:' + c.phone.replace(/\s/g, '')} aria-label={c.who + ' ara'} style={{ width: 40, height: 40, borderRadius: 20 }}><Icon.Phone width="18" height="18" /></a>
            : <span className="callicon" style={{ width: 40, height: 40, borderRadius: 20 }}><Icon.Phone width="18" height="18" /></span>}
          <button type="button" style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' }} onClick={() => actions.openCall(c)}>
            <span style={{ fontSize: 15, fontWeight: 600, textDecoration: c.done ? 'line-through' : 'none', color: c.done ? 'var(--muted)' : 'inherit' }}>{c.who}{c.for_yarim ? ' ❤️' : ''}</span>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.topic || 'Konu yok'}{c.phone ? ' · ' + c.phone : ''}</span>
          </button>
        </div>
        <div className="foot">
          <span style={{ fontSize: 13, fontWeight: 600, color: late ? 'var(--danger)' : 'var(--ink-2)' }}>{d ? whenLabel(d, now) + (late ? ' · gecikti' : '') : 'Tarihsiz'}</span>
          <button type="button" className={'btn' + (c.done ? ' ok' : '')} onClick={() => actions.toggleCall(c)}>{c.done ? 'Arandı ✓' : 'Arandı olarak işaretle'}</button>
        </div>
      </div>
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MissedCallsSection missed={data.missed_calls} now={now} actions={actions} showEmpty configured={missedConfigured} contacts={data.contacts} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Aranacaklar</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={actions.openMissedSetup}>Telefon bağlantısı</button>
          <button type="button" className="btn primary" onClick={() => actions.newCall()}>+ Arama ekle</button>
        </div>
      </div>
      <div className="notes-grid">
        {open.length ? open.map(card) : <div className="card"><p className="empty">Aranacak kimse yok.</p></div>}
      </div>
      {done.length ? <Section title="Arananlar"><div className="notes-grid">{done.map(card)}</div></Section> : null}
    </div>
  );
}

export { relDays };
