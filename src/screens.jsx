import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Mp, Check, Section, Progress } from './ui.jsx';
import { MARKETPLACES, SRC_COLORS, mpColor, YARIM_START } from './constants.js';
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
    out.push({ key: 'r' + r.id, time: fmtTime(new Date(r.due_at)), title: r.title + (r.for_yarim ? ' ❤️' : ''), src: r.for_yarim ? 'Yarim' : 'Hatırlatma', color: r.for_yarim ? SRC_COLORS.Yarim : SRC_COLORS['Hatırlatma'], sub: r.marketplace, done: r.done, item: r, kind: 'reminder' })
  );
  data.calls.filter((c) => c.due_at && sameDay(new Date(c.due_at), day)).forEach((c) =>
    out.push({ key: 'c' + c.id, time: fmtTime(new Date(c.due_at)), title: c.who + (c.topic ? ' — ' + c.topic : '') + (c.for_yarim ? ' ❤️' : ''), src: c.for_yarim ? 'Yarim' : 'Arama', color: c.for_yarim ? SRC_COLORS.Yarim : SRC_COLORS.Arama, sub: c.for_yarim ? 'Arama' : '', done: c.done, item: c, kind: 'call' })
  );
  data.campaigns.forEach((c) => {
    const s = fromDateInput(c.start_date);
    const e = fromDateInput(c.end_date);
    if (day >= s && day <= e) out.push({ key: 'k' + c.id, time: 'Tüm gün', title: c.name + (sameDay(day, s) ? ' başlıyor' : sameDay(day, e) ? ' son gün' : ' aktif'), src: 'Kampanya', color: SRC_COLORS.Kampanya, sub: c.marketplace, item: c, kind: 'campaign' });
    const d = daysBetween(day, s);
    if (d === 1 || d === 3) out.push({ key: 'kp' + c.id + d, time: '09:00', title: 'Hazırlık: ' + c.name + (d === 1 ? ' (yarın başlıyor)' : ' (3 gün kaldı)'), src: 'Kampanya', color: SRC_COLORS.Kampanya, sub: c.marketplace, item: c, kind: 'campaign' });
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
        </span>
      </button>
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

function CampaignMini({ c, tasks, onOpen }) {
  const ts = tasksOf(tasks, c.id);
  const st = campaignStatus(c);
  return (
    <div className="card camp">
      <div className="camp-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="tag" style={{ fontSize: 12, color: 'var(--ink-2)' }}><span className="dot" style={{ background: mpColor(c.marketplace) }} />{c.marketplace || 'Genel'} · {rangeLabel(fromDateInput(c.start_date), fromDateInput(c.end_date))}</span>
          <button type="button" className="name" onClick={() => onOpen(c)}>{c.name}</button>
        </div>
        <span className={'badge' + (st.key === 'live' ? ' live' : '')}>{st.label}</span>
      </div>
      {ts.length ? <Progress done={ts.filter((t) => t.done).length} total={ts.length} /> : null}
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

function YarimSection({ data, now, actions }) {
  const today = startOfDay(now);
  const until = addDays(today, 8);
  const items = [
    ...data.reminders.filter((r) => r.for_yarim).map((r) => ({ kind: 'reminder', item: r, due: r.due_at ? new Date(r.due_at) : null })),
    ...data.calls.filter((c) => c.for_yarim).map((c) => ({ kind: 'call', item: c, due: c.due_at ? new Date(c.due_at) : null }))
  ]
    .filter((x) => (x.item.done ? x.due && sameDay(x.due, today) : !x.due || x.due < until))
    .sort((a, b) => (a.due ? a.due.getTime() : 9e15) - (b.due ? b.due.getTime() : 9e15));
  const openCount = items.filter((x) => !x.item.done).length;
  return (
    <section className="yarim">
      <div className="yarim-head">
        <h2>Yarim <span aria-hidden="true">❤️</span></h2>
        <button type="button" className="yarim-add" onClick={actions.newYarim}>+ Ekle</button>
      </div>
      <YarimCounter now={now} />
      {items.length ? (
        <div className="list yarim-list">
          {items.map((x) => (x.kind === 'reminder'
            ? <ReminderRow key={'r' + x.item.id} r={x.item} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} showDay />
            : <CallRow key={'c' + x.item.id} c={x.item} now={now} onToggle={actions.toggleCall} onOpen={actions.openCall} showDay />))}
        </div>
      ) : <p className="yarim-empty">Önümüzdeki günlerde onunla ilgili bir şey yok. Özel günleri, sürprizleri, aranacakları buraya ekleyebilirsin.</p>}
      {openCount ? <span className="yarim-foot">{openCount} açık · önümüzdeki 7 gün</span> : null}
    </section>
  );
}

// ---------- BUGÜN ----------
export function TodayScreen({ data: allData, events, google, now, actions, goTab }) {
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
  const camps = data.campaigns.filter((c) => { const s = campaignStatus(c, now); return s.key === 'live' || (s.key === 'soon' && daysBetween(today, fromDateInput(c.start_date)) <= 14); }).slice(0, 4);

  const upcoming = [
    ...open(rem).map((r) => ({ t: new Date(r.due_at), title: r.title, meta: r.marketplace })),
    ...open(calls).map((c) => ({ t: new Date(c.due_at), title: c.who + ' aranacak', meta: c.topic })),
    ...gToday.filter((e) => !e.allDay).map((e) => ({ t: e.start, title: e.title, meta: e.calendar })),
    ...yarimToday.map((x) => ({ t: new Date(x.due_at), title: (x.title || x.who + ' aranacak') + ' ❤️', meta: 'Yarim' }))
  ].filter((x) => x.t >= now).sort((a, b) => a.t - b.t);
  const next = upcoming[0];
  const lateCount = lateR.length + lateC.length;

  return (
    <div className="grid-2">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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

        <YarimSection data={allData} now={now} actions={actions} />

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

        {undated.length ? (
          <Section title="Tarihsiz işler" meta={undated.length + ' iş'}>
            <div className="card list">
              {undated.map((r) => <ReminderRow key={r.id} r={r} now={now} onToggle={actions.toggleReminder} onOpen={actions.openReminder} />)}
            </div>
          </Section>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
  );
}

// ---------- TAKVİM ----------
export function CalendarScreen({ data, events, google, now, day, setDay, actions }) {
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
        {Object.entries(SRC_COLORS).map(([k, c]) => <span key={k} className="tag"><span className="dot" style={{ background: c }} />{k}</span>)}
      </div>
      <Section title={dayLabel(day, now) === fmtShort(day) ? fmtLong(day) : dayLabel(day, now) + ' · ' + fmtShort(day)} action={<button type="button" className="linkbtn" onClick={() => actions.newItemOn(day)}>+ Bu güne ekle</button>}>
        <div className="card list">
          {google === 'checking' ? <p className="empty">Google Takvim yükleniyor…</p> : null}
          {items.length ? items.map((e) => (
            <button type="button" key={e.key} className="rowbtn row timeline"
              onClick={() => (e.kind === 'reminder' ? actions.openReminder(e.item) : e.kind === 'call' ? actions.openCall(e.item) : e.kind === 'campaign' ? actions.openCampaign(e.item) : null)}>
              <span className="tcol">{e.time}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 15, textDecoration: e.done ? 'line-through' : 'none', color: e.done ? 'var(--muted)' : 'inherit' }}>{e.title}</span>
                <span className="tag" style={{ fontSize: 12, color: 'var(--ink-2)' }}><span className="dot" style={{ background: e.color }} />{e.src}{e.sub ? ' · ' + e.sub : ''}</span>
              </span>
            </button>
          )) : google !== 'checking' ? <p className="empty">Bu gün için kayıt yok.</p> : null}
        </div>
      </Section>
    </div>
  );
}

// ---------- KAMPANYALAR ----------
function CampaignCard({ c, tasks, actions }) {
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
        </div>
        <span className={'badge' + (st.key === 'live' ? ' live' : '')}>{st.label}</span>
      </div>
      {ts.length ? <Progress done={ts.filter((t) => t.done).length} total={ts.length} /> : null}
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

export function CampaignsScreen({ data, actions }) {
  const [showPast, setShowPast] = useState(false);
  const withSt = data.campaigns.map((c) => ({ c, st: campaignStatus(c) }));
  const current = withSt.filter((x) => x.st.key !== 'past').sort((a, b) => a.c.start_date.localeCompare(b.c.start_date));
  const past = withSt.filter((x) => x.st.key === 'past').sort((a, b) => b.c.end_date.localeCompare(a.c.end_date));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, flex: '1 1 260px' }}>Başlangıçtan 3 gün ve 1 gün önce Google Takvim üzerinden hazırlık hatırlatması gelir.</p>
        <button type="button" className="btn primary" onClick={() => actions.openCampaign({})}>+ Yeni kampanya</button>
      </div>
      <div className="notes-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {current.length ? current.map(({ c }) => <CampaignCard key={c.id} c={c} tasks={data.campaign_tasks} actions={actions} />) : <div className="card"><p className="empty">Yaklaşan kampanya yok.</p></div>}
      </div>
      {past.length ? (
        <Section title="Biten kampanyalar" action={<button type="button" className="linkbtn" onClick={() => setShowPast(!showPast)}>{showPast ? 'Gizle' : 'Göster (' + past.length + ')'}</button>}>
          {showPast ? <div className="notes-grid">{past.map(({ c }) => <CampaignMini key={c.id} c={c} tasks={data.campaign_tasks} onOpen={actions.openCampaign} />)}</div> : null}
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
  const [seg, setSeg] = useState('pazaryeri');
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
      <div className="seg" role="group" aria-label="Not türü" style={{ maxWidth: 420 }}>
        <button type="button" className={seg === 'pazaryeri' ? 'on' : ''} onClick={() => setSeg('pazaryeri')}>Pazaryeri</button>
        <button type="button" className={seg === 'gunluk' ? 'on' : ''} onClick={() => setSeg('gunluk')}>Günlük</button>
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
      ) : <DailyNotes data={data} now={now} actions={actions} />}
    </div>
  );
}

// ---------- ARAMALAR ----------
export function CallsScreen({ data, now, actions }) {
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
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn primary" onClick={() => actions.newCall()}>+ Arama ekle</button>
      </div>
      <div className="notes-grid">
        {open.length ? open.map(card) : <div className="card"><p className="empty">Aranacak kimse yok.</p></div>}
      </div>
      {done.length ? <Section title="Arananlar"><div className="notes-grid">{done.map(card)}</div></Section> : null}
    </div>
  );
}

export { relDays };
