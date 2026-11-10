import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Mp, Check, Section, Progress } from './ui.jsx';
import { MARKETPLACES, SRC_COLORS, mpColor, YARIM_START } from './constants.js';
import { whatsappLink, DEFAULT_LOVE_MESSAGE, prettyPhone, normalizePhone } from './whatsapp.js';
import { mapsLink, mapsTarget } from './location.js';
import { occursOn, ruleLabel } from './recur.js';
import { specialOn, specialLabel, specialUpcoming, SPECIAL_ICON } from './special.js';
import {
  findContact, CampaignResult, WeeklySummary, weeklySummaryVisible, HabitsCard, ListsView, ContactsView, InfluencerView, SpecialDatesSection
} from './life.jsx';

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
export function campaignStatus(c, now = new Date()) {
  const s = fromDateInput(c.start_date);
  const e = fromDateInput(c.end_date);
  const t = startOfDay(now);
  if (t > e) return { key: 'past', label: 'Bitti' };
  if (t >= s) {
    const left = daysBetween(t, e);
    return { key: 'live', label: left === 0 ? 'Son gün' : 'Aktif · ' + (left + 1) + ' gün' };
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
    out.push({ key: 'g' + e.id + day.getDate(), time: e.allDay ? 'Tüm gün' : fmtTime(e.start), title: e.title, src: 'Google', color: SRC_COLORS.Google, sub: e.calendar })
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
      key: 'k' + c.id, time: 'Tüm gün',
      title: c.name + (!multi ? '' : sameDay(day, s) ? ' başlıyor' : sameDay(day, e) ? ' son gün' : isEvent ? ' (' + nth + '/' + total + '. gün)' : ' aktif'),
      src: isEvent ? 'Etkinlik' : 'Kampanya', color: isEvent ? SRC_COLORS.Etkinlik : SRC_COLORS.Kampanya, sub: [c.marketplace, multi ? rangeLabel(s, e) : ''].filter(Boolean).join(' · '), loc: c.location, geo: c.location_geo, item: c, kind: 'campaign'
    });
    if (isEvent) return;
    const d = daysBetween(day, s);
    if (d === 1 || d === 3) out.push({ key: 'kp' + c.id + d, time: '09:00', title: 'Hazırlık: ' + c.name + (d === 1 ? ' (yarın başlıyor)' : ' (3 gün kaldı)'), src: 'Kampanya', color: SRC_COLORS.Kampanya, sub: c.marketplace, item: c, kind: 'campaign' });
  });
  (data.special_dates || []).filter((x) => specialOn(x, day)).forEach((x) =>
    out.push({ key: 's' + x.id + day.getFullYear(), time: 'Tüm gün', title: (SPECIAL_ICON[x.kind] || '⭐') + ' ' + specialLabel(x, day) + (x.for_yarim ? ' ❤️' : ''), src: 'Özel gün', color: x.for_yarim ? SRC_COLORS.Yarim : SRC_COLORS['Özel gün'], sub: x.for_yarim ? 'Yarim' : '', item: x, kind: 'special' })
  );
  const dk = toDateInput(day);
  (data.collabs || []).filter((c) => c.publish_date === dk && c.status !== 'iptal').forEach((c) => {
    const who = ((data.contacts || []).find((k) => k.id === c.contact_id) || {}).name || 'Influencer';
    out.push({ key: 'i' + c.id, time: 'Tüm gün', title: '🎬 ' + who + (c.title ? ' — ' + c.title : ''), src: 'Influencer', color: SRC_COLORS.Influencer, sub: [c.brand, c.marketplace].filter(Boolean).join(' · '), done: c.status === 'yayinlandi' || c.status === 'odendi', item: c, kind: 'collab' });
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
          <span className="tag" style={{ fontSize: 12, color: 'var(--ink-2)' }}><span className="dot" style={{ background: mpColor(c.marketplace) }} />{isEvent ? 'Etkinlik · ' : ''}{c.marketplace || (isEvent ? '' : 'Genel')}{c.marketplace || !isEvent ? ' · ' : ''}{rangeLabel(fromDateInput(c.start_date), fromDateInput(c.end_date))}</span>
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

function YarimCounter({ now }) {
  const start = YARIM_START;
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
    <div className="yarim-counter" aria-label={'Birlikte geçen süre: ' + days + ' gün ' + hours + ' saat'}>
      <div className="yc-num">
        <span className="yc-big">{days.toLocaleString('tr-TR')}</span><span className="yc-unit">gün</span>
        <span className="yc-big">{hours}</span><span className="yc-unit">saat</span>
      </div>
      <div className="yc-since">10 Temmuz 2026'dan beri birlikte</div>
      {nextText ? <div className="yc-next">{nextText}</div> : null}
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
  const diff = Math.max(0, now - YARIM_START);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const today = startOfDay(now);
  // Yaklaşan Yarim kayıtları (gecikenler dahil, tarihsizler en sonda)
  const items = yarimItems(data, now).filter((x) => !x.item.done);
  const next = nextMonthiversary(YARIM_START, now);
  const nd = next ? daysBetween(now, next.date) : 99;
  const anniv = next && nd <= 7
    ? { key: 'anniv', title: (next.months % 12 === 0 ? (next.months / 12) + '. yıl dönümü' : next.months + '. ay dönümü') + ' 💐', when: nd === 0 ? 'Bugün' : nd === 1 ? 'Yarın' : nd + ' gün sonra' }
    : null;
  const rows = items.map((x) => ({
    key: x.kind + x.item.id,
    title: x.kind === 'call' ? x.item.who + ' ara' : x.item.title,
    when: x.due ? dayLabel(x.due, now) + ' ' + fmtTime(x.due) + (x.due < today ? ' · gecikti' : '') : 'Tarihsiz',
    late: x.due && x.due < now
  }));
  const specials = specialUpcoming((data.special_dates || []).filter((x) => x.for_yarim), now, 7).map(({ s, date, inDays }) => ({
    key: 'sp' + s.id, title: specialLabel(s, date) + ' ' + (SPECIAL_ICON[s.kind] || '⭐'), when: inDays === 0 ? 'Bugün' : inDays === 1 ? 'Yarın' : inDays + ' gün sonra'
  }));
  const list = [...(anniv ? [anniv] : []), ...specials, ...rows];
  const shown = list.slice(0, 3);
  const more = list.length - shown.length;
  return (
    <div className="ytile">
      <button type="button" className="ytile-open" onClick={actions.openYarim} aria-label={'Yarim alanını aç. ' + days + ' gün ' + hours + ' saattir birlikte. ' + (rows.length ? rows.length + ' yaklaşan kayıt' : 'Yaklaşan kayıt yok')} />
      <div className="ytile-top">
        <span className="ytile-name">Yarim</span>
        <LoveButton love={love} actions={actions} />
      </div>
      <div className="ytile-count" aria-hidden="true"><b>{days.toLocaleString('tr-TR')}</b> gün <b>{hours}</b> saat</div>
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
    <Section title="Cevapsız çağrılar" action={open.length > 1
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

// ---------- BUGÜN ----------
export function TodayScreen({ data: allData, events, google, now, actions, goTab, love, yarimHidden, month, setMonth, revenue }) {
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
  const camps = data.campaigns.filter((c) => c.kind !== 'etkinlik').filter((c) => { const s = campaignStatus(c, now); return s.key === 'live' || (s.key === 'soon' && daysBetween(today, fromDateInput(c.start_date)) <= 14); }).slice(0, 4);

  const upcoming = [
    ...open(rem).map((r) => ({ t: new Date(r.due_at), title: r.title, meta: r.marketplace })),
    ...open(calls).map((c) => ({ t: new Date(c.due_at), title: c.who + ' aranacak', meta: c.topic })),
    ...gToday.filter((e) => !e.allDay).map((e) => ({ t: e.start, title: e.title, meta: e.calendar })),
    ...yarimToday.map((x) => ({ t: new Date(x.due_at), title: (x.title || x.who + ' aranacak') + ' ❤️', meta: 'Yarim' }))
  ].filter((x) => x.t >= now).sort((a, b) => a.t - b.t);
  const next = upcoming[0];
  const lateCount = lateR.length + lateC.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div className={'today-top' + (yarimHidden ? ' solo' : '')}>
        <section className="hero">
          <span className="k">Sıradaki</span>
          {next ? (
            <>
              <span className="t">{next.title}</span>
              <span className="m">{fmtTime(next.t)}{next.meta ? ' · ' + next.meta : ''}</span>
            </>
          ) : (
            <>
              <span className="t">Bugün için sırada bir şey yok</span>
              <span className="m">{lateCount ? lateCount + ' geciken iş var' : 'Yeni bir şey eklemek için + butonunu kullan'}</span>
            </>
          )}
        </section>
        {yarimHidden ? null : <YarimTile data={allData} now={now} actions={actions} love={love} />}
    </div>
    {showSummary ? <WeeklySummary data={allData} revenue={revenue} now={now} actions={actions} onHide={hideSummary} /> : null}
    <div className="grid-2">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {lateCount ? (
          <Section title="Gecikenler" meta={lateCount + ' iş'}>
            <div className="card list">
              {lateR.map((r) => <ReminderRow key={r.id} r={r} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} showDay />)}
              {lateC.map((c) => <CallRow key={c.id} c={c} now={now} onToggle={actions.toggleCall} onOpen={actions.openCall} showDay />)}
            </div>
          </Section>
        ) : null}

        <Section title="Hatırlatmalar" meta={open(rem).length + ' açık'}>
          <div className="card list">
            {rem.length ? rem.map((r) => <ReminderRow key={r.id} r={r} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} />) : <p className="empty">Bugün için hatırlatma yok.</p>}
          </div>
        </Section>

        <HabitsCard data={allData} now={now} actions={actions} />

        {undated.length ? (
          <Section title="Tarihsiz işler" meta={undated.length + ' iş'}>
            <div className="card list">
              {undated.map((r) => <ReminderRow key={r.id} r={r} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} />)}
            </div>
          </Section>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {missedEl}
        <Section title="Takvim" meta="Google Takvim">
          <div className="card list">
            {google !== 'ok' && google !== 'off' ? <p className="empty">{google === 'checking' ? 'Google Takvim yükleniyor…' : 'Google Takvim bağlı değil.'}</p>
              : gToday.length ? gToday.map((e) => (
                <div key={e.id} className="row timeline">
                  <span className="tcol">{e.allDay ? 'Tüm gün' : fmtTime(e.start)}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 15 }}>{e.title}</span>
                    <span className="tag" style={{ fontSize: 12, color: 'var(--ink-2)' }}><span className="dot" style={{ background: e.color }} />{e.calendar}</span>
                  </div>
                </div>
              )) : <p className="empty">{google === 'off' ? 'Örnek modda Google Takvim kapalı.' : 'Bugün takviminde etkinlik yok.'}</p>}
          </div>
        </Section>

        <Section title="Aranacaklar" meta={open(calls).length + ' açık'}>
          <div className="card list">
            {calls.length ? calls.map((c) => <CallRow key={c.id} c={c} now={now} onToggle={actions.toggleCall} onOpen={actions.openCall} />) : <p className="empty">Bugün aranacak kimse yok.</p>}
          </div>
        </Section>

        <Section title="Kampanyalar" action={<button type="button" className="linkbtn" onClick={() => goTab('kampanya')}>Tümü</button>}>
          {camps.length ? camps.map((c) => <CampaignMini key={c.id} c={c} tasks={data.campaign_tasks} onOpen={actions.openCampaign} />) : <div className="card"><p className="empty">Önümüzdeki 2 haftada kampanya yok.</p></div>}
        </Section>
      </div>
    </div>
    <UpcomingDays data={allData} events={events} google={google} now={now} actions={actions} />
    <MonthCalendar data={allData} events={events} google={google} now={now} actions={actions} month={month} setMonth={setMonth} />
    <MarketplaceStrip data={allData} now={now} actions={actions} />
    </div>
  );
}

// Takvimdeki tek satır (Takvim ekranı ve Yaklaşan günler ortak kullanır)
function DayItemRow({ e, actions, compact }) {
  return (
    <div className={'ditem' + (compact ? ' compact' : '')}>
      <button type="button" className={'rowbtn row timeline' + (compact ? ' compact' : '')}
        onClick={() => (e.kind === 'reminder' ? actions.openReminder(e.item) : e.kind === 'call' ? actions.openCall(e.item) : e.kind === 'campaign' ? actions.openCampaign(e.item) : e.kind === 'special' ? actions.openSpecial(e.item) : e.kind === 'collab' ? actions.openCollab(e.item) : null)}>
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
function UpcomingDays({ data, events, google, now, actions, count = 3 }) {
  const today = startOfDay(now);
  const days = Array.from({ length: count }, (_, i) => addDays(today, i + 1));
  return (
    <Section title={'Yaklaşan ' + count + ' gün'} meta={rangeLabel(days[0], days[days.length - 1])}>
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

// Bugün sayfasının altındaki aylık takvim
const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function MonthCalendar({ data, events, google, now, actions, month, setMonth }) {
  const [sel, setSel] = useState(null);
  const today = startOfDay(now);
  const gridStart = weekStart(month);
  const cells = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const d = addDays(gridStart, i);
    const items = dayItems(d, { data, events });
    // Çok günlü kampanya/etkinlikler şerit, diğerleri nokta/etiket olarak
    const bars = items.filter((e) => e.kind === 'campaign' && e.time === 'Tüm gün');
    const rest = items.filter((e) => !(e.kind === 'campaign' && e.time === 'Tüm gün'));
    return { d, items, bars, rest };
  }), [data, events, gridStart.getTime()]);
  // Son satır tamamen sonraki aya aitse gösterme
  const rows = cells[35].d.getMonth() !== month.getMonth() ? 5 : 6;
  const shown = cells.slice(0, rows * 7);
  const selCell = sel ? shown.find((c) => sameDay(c.d, sel)) : null;
  const go = (n) => { setSel(null); setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };
  const isThisMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  return (
    <section className="section">
      <div className="section-head">
        <h2>{MONTH_NAMES[month.getMonth()]} {month.getFullYear()}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isThisMonth ? <button type="button" className="linkbtn" style={{ marginRight: 6 }} onClick={() => { setSel(null); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }}>Bu ay</button> : null}
          <button type="button" className="iconbtn" aria-label="Önceki ay" onClick={() => go(-1)}><Icon.Left /></button>
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
                onClick={() => setSel(isSel ? null : d)} aria-pressed={!!isSel}
                aria-label={fmtLong(d) + (items.length ? ', ' + items.length + ' kayıt' : ', boş')}>
                <span className="mcal-num">{d.getDate()}</span>
                <span className="mcal-bars">
                  {bars.slice(0, 2).map((b) => <span key={b.key} className="mcal-bar" style={{ background: b.item && b.item.marketplace ? mpColor(b.item.marketplace) : b.color }} />)}
                </span>
                {/* Telefonda noktalar, geniş ekranda kısa etiketler */}
                <span className="mcal-dots">{colors.map((c) => <span key={c} className="dot" style={{ background: c, width: 6, height: 6 }} />)}</span>
                <span className="mcal-labels">
                  {items.slice(0, 3).map((e) => (
                    <span key={e.key} className="mcal-label"><span className="dot" style={{ background: e.item && e.item.marketplace && e.kind === 'campaign' ? mpColor(e.item.marketplace) : e.color, width: 6, height: 6 }} />{e.title}</span>
                  ))}
                  {items.length > 3 ? <span className="mcal-more">+{items.length - 3}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {selCell ? (
        <div className="card list">
          <div className="upday-head">
            <span className="upday-name">{dayLabel(selCell.d, now)}</span>
            <span className="upday-date">{fmtLong(selCell.d)}</span>
            <button type="button" className="iconbtn upday-add" aria-label={fmtLong(selCell.d) + ' gününe ekle'} onClick={() => actions.newItemOn(selCell.d)}><Icon.Plus width="18" height="18" /></button>
          </div>
          {selCell.items.length ? selCell.items.map((e) => <DayItemRow key={e.key} e={e} actions={actions} compact />)
            : <p className="empty">{google === 'checking' ? 'Yükleniyor…' : 'Bu gün boş.'}</p>}
        </div>
      ) : <p className="hint" style={{ margin: 0 }}>Ayrıntı için bir güne dokun. Renkli şeritler kampanya ve etkinlikleri gösterir.</p>}
    </section>
  );
}

// ---------- TAKVİM ----------
export function CalendarScreen({ data, events, google, now, day, setDay, actions, yarimHidden }) {
  const ws = weekStart(day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const items = dayItems(day, { data, events });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <div className="week-nav">
        <button type="button" className="iconbtn" aria-label="Önceki hafta" onClick={() => setDay(addDays(day, -7))}><Icon.Left /></button>
        <span className="lbl">{rangeLabel(days[0], days[6])}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {!sameDay(day, now) ? <button type="button" className="btn" onClick={() => setDay(startOfDay(now))}>Bugün</button> : null}
          <button type="button" className="iconbtn" aria-label="Sonraki hafta" onClick={() => setDay(addDays(day, 7))}><Icon.Right /></button>
        </div>
      </div>
      <div className="week">
        {days.map((d) => {
          const sel = sameDay(d, day);
          const has = dayItems(d, { data, events }).length > 0;
          return (
            <button type="button" key={d.toISOString()} className={'wday' + (sel ? ' sel' : '') + (sameDay(d, now) ? ' today' : '')} onClick={() => setDay(d)} aria-label={fmtLong(d)} aria-pressed={sel}>
              <span className="wd">{WEEKDAYS_SHORT[d.getDay()]}</span>
              <span className="d">{d.getDate()}</span>
              <span className="dt" style={{ background: has ? (sel ? '#fff' : 'var(--accent)') : 'transparent' }} />
            </button>
          );
        })}
      </div>
      <div className="legend">
        {Object.entries(SRC_COLORS).filter(([k]) => !(yarimHidden && k === 'Yarim')).map(([k, c]) => <span key={k} className="tag"><span className="dot" style={{ background: c }} />{k}</span>)}
      </div>
      <Section title={dayLabel(day, now) === fmtShort(day) ? fmtLong(day) : dayLabel(day, now) + ' · ' + fmtShort(day)} action={<span style={{ display: 'flex', gap: 14 }}><button type="button" className="linkbtn" onClick={() => actions.newEventOn(day)}>+ Etkinlik</button><button type="button" className="linkbtn" onClick={() => actions.newItemOn(day)}>+ Hatırlatma</button></span>}>
        <div className="card list">
          {google === 'checking' ? <p className="empty">Google Takvim yükleniyor…</p> : null}
          {items.length ? items.map((e) => <DayItemRow key={e.key} e={e} actions={actions} />) : google !== 'checking' ? <p className="empty">Bu gün için kayıt yok.</p> : null}
        </div>
      </Section>
      <SpecialDatesSection data={data} now={now} actions={actions} />
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
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{rangeLabel(fromDateInput(c.start_date), fromDateInput(c.end_date))}{c.notes ? ' · ' + c.notes : ''}</span>
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
function DailyNotes({ data, now, actions }) {
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

export function NotesScreen({ data, now, actions }) {
  const [seg, setSegState] = useState(() => { try { return sessionStorage.getItem('ajanda-notes-seg') || 'pazaryeri'; } catch { return 'pazaryeri'; } });
  const setSeg = (v) => { setSegState(v); try { sessionStorage.setItem('ajanda-notes-seg', v); } catch { /* yok say */ } };
  const [mp, setMp] = useState('Tümü');
  const [q, setQ] = useState('');
  const used = useMemo(() => {
    const s = new Set(data.notes.map((n) => n.marketplace || 'Genel'));
    return ['Tümü', ...MARKETPLACES.map((m) => m.name).filter((n) => s.has(n)), ...(s.has('Genel') ? ['Genel'] : [])];
  }, [data.notes]);
  const ql = q.trim().toLocaleLowerCase('tr-TR');
  const notes = data.notes
    .filter((n) => mp === 'Tümü' || (n.marketplace || 'Genel') === mp)
    .filter((n) => !ql || (n.title + ' ' + (n.body || '') + ' ' + (n.brand || '')).toLocaleLowerCase('tr-TR').includes(ql))
    .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="seg three" role="group" aria-label="Not türü" style={{ maxWidth: 480 }}>
        <button type="button" className={seg === 'pazaryeri' ? 'on' : ''} onClick={() => setSeg('pazaryeri')}>Pazaryeri</button>
        <button type="button" className={seg === 'gunluk' ? 'on' : ''} onClick={() => setSeg('gunluk')}>Günlük</button>
        <button type="button" className={seg === 'liste' ? 'on' : ''} onClick={() => setSeg('liste')}>Listeler</button>
      </div>
      {seg === 'pazaryeri' ? (
        <>
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
        </>
      ) : seg === 'liste' ? <ListsView data={data} actions={actions} /> : <DailyNotes data={data} now={now} actions={actions} />}
    </div>
  );
}

// ---------- ARAMALAR ----------
export function CallsScreen(props) {
  const [seg, setSegState] = useState(() => { try { return sessionStorage.getItem('ajanda-calls-seg') || 'arama'; } catch { return 'arama'; } });
  const setSeg = (v) => { setSegState(v); try { sessionStorage.setItem('ajanda-calls-seg', v); } catch { /* yok say */ } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="seg three" role="group" aria-label="Görünüm" style={{ maxWidth: 480 }}>
        <button type="button" className={seg === 'arama' ? 'on' : ''} onClick={() => setSeg('arama')}>Aramalar</button>
        <button type="button" className={seg === 'rehber' ? 'on' : ''} onClick={() => setSeg('rehber')}>Rehber</button>
        <button type="button" className={seg === 'infl' ? 'on' : ''} onClick={() => setSeg('infl')}>Influencer</button>
      </div>
      {seg === 'rehber' ? <ContactsView data={props.data} actions={props.actions} />
        : seg === 'infl' ? <InfluencerView data={props.data} now={props.now} actions={props.actions} />
          : <CallsList {...props} />}
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
