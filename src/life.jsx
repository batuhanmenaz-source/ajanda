// Ajanda'nın "hayat" tarafı: haftalık özet, kampanya sonucu, alışkanlıklar, listeler,
// rehber ve influencer iş birlikleri, özel günler.
import { useMemo, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Sheet, Check, Section } from './ui.jsx';
import { MARKETPLACES, BRANDS, mpColor } from './constants.js';
import { normalizePhone, prettyPhone } from './whatsapp.js';
import { tl, tlShort, parseTL } from './revenue.jsx';
import { SPECIAL_KINDS, SPECIAL_ICON, specialNext, specialLabel, specialUpcoming } from './special.js';
import { budgetStatus, catOf, sumBy } from './money.js';
import { inScope } from './scope.js';
import { AlertPicker } from './alertpicker.jsx';
import { DEFAULT_ALERTS, normAlerts, alertsLabel } from './alerts.js';
import {
  addDays, startOfDay, sameDay, weekStart, daysBetween, toDateInput, fromDateInput, fmtShort, fmtLong, rangeLabel, MONTHS, WEEKDAYS
} from './dates.js';

const pct = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(Math.round(x * 100)) + '%';
const srOnly = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };

// ---------- Rehber yardımcıları ----------
const phoneKey = (p) => normalizePhone(p).slice(-10);
export function findContact(contacts, phone) {
  const k = phoneKey(phone);
  if (k.length < 7) return null;
  return (contacts || []).find((c) => c.phone && phoneKey(c.phone) === k) || null;
}
const waLink = (phone) => 'https://wa.me/' + normalizePhone(phone);

export const COLLAB_STATUS = [
  ['planlandi', 'Planlandı'],
  ['anlasildi', 'Anlaşıldı'],
  ['yayinlandi', 'Yayınlandı'],
  ['odendi', 'Ödendi'],
  ['iptal', 'İptal']
];
const STATUS_LABEL = Object.fromEntries(COLLAB_STATUS);

// ---------- Kampanya sonucu (ciro verisinden) ----------
export function campaignResult(c, revenue, now = new Date()) {
  if (!revenue || !revenue.length) return null;
  const s = fromDateInput(c.start_date);
  const e = fromDateInput(c.end_date);
  const t = startOfDay(now);
  const last = e < t ? e : t;
  if (last < s) return null;
  const n = daysBetween(s, last) + 1;
  const ps = addDays(s, -n);
  const inMp = (r) => !c.marketplace || r.marketplace === c.marketplace;
  const A = toDateInput(s), B = toDateInput(last), PA = toDateInput(ps), PB = toDateInput(addDays(s, -1));
  let cur = 0, prev = 0, orders = 0;
  const curDays = new Set(), prevDays = new Set();
  revenue.forEach((r) => {
    if (!inMp(r)) return;
    if (r.day >= A && r.day <= B) { cur += Number(r.amount); orders += Number(r.orders) || 0; curDays.add(r.day); }
    else if (r.day >= PA && r.day <= PB) { prev += Number(r.amount); prevDays.add(r.day); }
  });
  // Bugünün cirosu henüz girilmediyse bugünü saymayalım
  const total = last.getTime() === t.getTime() && !curDays.has(B) ? n - 1 : n;
  if (!curDays.size) return { empty: true, total };
  const avg = cur / curDays.size;
  const prevAvg = prevDays.size ? prev / prevDays.size : 0;
  return {
    cur, orders, avg, prevAvg, n, total,
    entered: curDays.size,
    delta: prevAvg ? avg / prevAvg - 1 : null,
    live: e >= t
  };
}

export function CampaignResult({ c, revenue, now, actions }) {
  const r = campaignResult(c, revenue, now);
  if (!r) return null;
  if (r.empty) {
    return (
      <div className="cres empty">
        <span>Kampanya günlerinin cirosu henüz girilmedi.</span>
        <button type="button" className="linkbtn" onClick={() => actions.openRevenue(c.start_date)}>Ciro gir</button>
      </div>
    );
  }
  const up = r.delta != null && r.delta >= 0;
  return (
    <div className="cres">
      <div className="cres-top">
        <span className="cres-k">{r.live ? 'Şimdiye kadar' : 'Sonuç'}{c.marketplace ? ' · ' + c.marketplace : ' · tüm pazaryerleri'}</span>
        {r.delta != null ? <span className={'cres-delta ' + (up ? 'up' : 'down')}>{up ? '▲' : '▼'} {pct(r.delta)}</span> : null}
      </div>
      <div className="cres-num">{tl(r.cur)}</div>
      <div className="cres-sub">
        Günlük ort. {tlShort(r.avg)}
        {r.delta != null ? ' · öncesindeki ' + r.n + ' güne göre' : ' · önceki dönemin cirosu girilmemiş'}
        {r.orders ? ' · ' + r.orders.toLocaleString('tr-TR') + ' sipariş' : ''}
      </div>
      {r.entered < r.total ? <div className="cres-note">{r.entered}/{r.total} günün cirosu girildi</div> : null}
    </div>
  );
}

// ---------- Haftalık özet (cuma–pazar) ----------
const SUMMARY_TITLE = 'Haftalık özeti gözden geçir';

export function weeklySummaryVisible(now) {
  const d = now.getDay();
  if (!(d === 5 || d === 6 || d === 0)) return false;
  try { return localStorage.getItem('ajanda-ozet-gizli') !== toDateInput(weekStart(now)); } catch { return true; }
}

export function WeeklySummary({ data, revenue, now, actions, onHide, budgets, scope = 'tum' }) {
  const today = startOfDay(now);
  const ws = weekStart(today);
  const we = addDays(ws, 7);
  const elapsed = daysBetween(ws, today) + 1;
  const A = toDateInput(ws), T = toDateInput(today);
  const LA = toDateInput(addDays(ws, -7)), LT = toDateInput(addDays(today, -7));

  let cur = 0, last = 0;
  const byMp = {};
  (revenue || []).forEach((r) => {
    if (r.day >= A && r.day <= T) { cur += Number(r.amount); byMp[r.marketplace] = (byMp[r.marketplace] || 0) + Number(r.amount); }
    else if (r.day >= LA && r.day <= LT) last += Number(r.amount);
  });
  const top = Object.entries(byMp).sort((a, b) => b[1] - a[1])[0];

  const inWeek = (x) => x.due_at && new Date(x.due_at) >= ws && new Date(x.due_at) < we;
  const items = [...data.reminders, ...data.calls].filter((x) => inScope(x, scope));
  const done = items.filter((x) => x.done && inWeek(x)).length;
  const open = items.filter((x) => !x.done && x.due_at && new Date(x.due_at) < we).length;

  const habits = data.habits || [];
  const hDone = (data.habit_logs || []).filter((l) => l.day >= A && l.day <= T).length;
  const hRate = habits.length ? hDone / (habits.length * elapsed) : null;

  // Gelecek hafta
  const ns = we, ne = addDays(we, 6);
  const NS = toDateInput(ns), NE = toDateInput(ne);
  const nextItems = [
    ...data.campaigns.filter((c) => c.start_date <= NE && c.end_date >= NS && (scope !== 'ozel' || (c.kind === 'etkinlik' && !c.marketplace))).map((c) => ({
      key: 'k' + c.id, d: fromDateInput(c.start_date < NS ? NS : c.start_date),
      text: (c.kind === 'etkinlik' ? '📅 ' : '📣 ') + c.name + (c.marketplace ? ' · ' + c.marketplace : ''),
      when: c.start_date < NS ? 'devam ediyor' : rangeLabel(fromDateInput(c.start_date), fromDateInput(c.end_date)) + (c.start_time ? ' · ' + c.start_time : '')
    })),
    ...(scope === 'ozel' ? [] : data.collabs || []).filter((c) => c.publish_date >= NS && c.publish_date <= NE && c.status !== 'iptal').map((c) => {
      const who = ((data.contacts || []).find((k) => k.id === c.contact_id) || {}).name || 'Influencer';
      return { key: 'i' + c.id, d: fromDateInput(c.publish_date), text: '🎬 ' + who + (c.brand ? ' · ' + c.brand : ''), when: fmtShort(fromDateInput(c.publish_date)) };
    }),
    ...specialUpcoming(scope === 'is' ? [] : data.special_dates, ns, 6).map(({ s, date }) => ({ key: 's' + s.id, d: date, text: (SPECIAL_ICON[s.kind] || '⭐') + ' ' + specialLabel(s, date), when: fmtShort(date) }))
  ].sort((a, b) => a.d - b.d);

  // Kişisel harcama (cüzdan)
  const money = data.money || [];
  const spend = sumBy(money, ws, today, 'gider');
  const lastSpend = sumBy(money, addDays(ws, -7), addDays(today, -7), 'gider');
  const spendDelta = lastSpend > 0 ? spend / lastSpend - 1 : null;
  const warn = budgetStatus(money, budgets, now).filter((b) => b.ratio >= 0.8);
  const showWork = scope !== 'ozel';
  const showPrivate = scope !== 'is';

  const hasRepeat = data.reminders.some((r) => r.repeat_rule === 'weekly' && r.title === SUMMARY_TITLE && !r.done);
  const delta = last ? cur / last - 1 : null;

  return (
    <section className="card wsum" aria-label="Haftalık özet">
      <div className="wsum-head">
        <div>
          <span className="wsum-k">Haftanın özeti</span>
          <h2 className="wsum-h">{rangeLabel(ws, addDays(ws, 6))}</h2>
        </div>
        <button type="button" className="linkbtn" onClick={onHide}>Gizle</button>
      </div>
      <div className="wsum-grid">
        {showWork ? <div className="wsum-cell">
          <span className="l">Ciro</span>
          {cur ? (
            <>
              <span className="v">{tlShort(cur)}</span>
              <span className="s">{delta != null ? <b className={delta >= 0 ? 'up' : 'down'}>{pct(delta)}</b> : null}{delta != null ? ' geçen haftaya göre' : 'geçen hafta girilmemiş'}</span>
              {top ? <span className="s">En çok: {top[0]}</span> : null}
            </>
          ) : (
            <>
              <span className="v muted">—</span>
              <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => actions.openRevenue(T)}>Ciro gir</button>
            </>
          )}
        </div> : null}
        {showPrivate && (money.length || spend) ? (
          <div className="wsum-cell">
            <span className="l">Harcama</span>
            <span className="v">{tlShort(spend)}</span>
            <span className="s">{spendDelta != null ? <b className={spendDelta <= 0 ? 'up' : 'down'}>{pct(spendDelta)}</b> : null}{spendDelta != null ? ' geçen haftaya göre' : 'geçen hafta kayıt yok'}</span>
          </div>
        ) : null}
        <div className="wsum-cell">
          <span className="l">İşler</span>
          <span className="v">{done} <small>bitti</small></span>
          <span className="s">{open ? open + ' açık iş kaldı' : 'Açık iş kalmadı 👏'}</span>
        </div>
        {hRate != null && showPrivate ? (
          <div className="wsum-cell">
            <span className="l">Alışkanlıklar</span>
            <span className="v">%{Math.round(hRate * 100)}</span>
            <span className="s">{hDone} işaret · {elapsed} gün</span>
          </div>
        ) : null}
      </div>
      {showPrivate && warn.length ? (
        <div className="wsum-warn">
          {warn.map((b) => <span key={b.cat}>{catOf(b.cat).emoji} {catOf(b.cat).label}: bütçenin %{Math.round(b.ratio * 100)}'i{b.ratio >= 1 ? ' — aşıldı' : ''}</span>)}
        </div>
      ) : null}
      <div className="wsum-next">
        <span className="l">Gelecek hafta</span>
        {nextItems.length ? nextItems.slice(0, 6).map((x) => (
          <div key={x.key} className="wsum-row"><span className="t">{x.text}</span><span className="w">{x.when}</span></div>
        )) : <span className="s">Planlanmış kampanya, iş birliği ya da özel gün yok.</span>}
        {nextItems.length > 6 ? <span className="s">+{nextItems.length - 6} daha</span> : null}
      </div>
      {!hasRepeat ? (
        <button type="button" className="btn" onClick={actions.addWeeklySummaryReminder}>🔔 Her cuma 17:00'de hatırlat</button>
      ) : null}
    </section>
  );
}

export function nextFriday17(now = new Date()) {
  const d = startOfDay(now);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  d.setHours(17, 0, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}
export { SUMMARY_TITLE };

// ---------- Alışkanlıklar ----------
function streak(logs, habitId, today) {
  const set = new Set(logs.filter((l) => l.habit_id === habitId).map((l) => l.day));
  let d = set.has(toDateInput(today)) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(toDateInput(d))) { n++; d = addDays(d, -1); }
  return { n, set };
}

export function HabitsCard({ data, now, actions }) {
  const habits = [...(data.habits || [])].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const today = startOfDay(now);
  const T = toDateInput(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const doneToday = habits.filter((h) => (data.habit_logs || []).some((l) => l.habit_id === h.id && l.day === T)).length;
  return (
    <Section title="Alışkanlıklar" tone="#7048E8" action={<span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{habits.length ? <span className="meta">{doneToday}/{habits.length}</span> : null}<button type="button" className="linkbtn" onClick={() => actions.openHabit({})}>+ Ekle</button></span>}>
      <div className="card list">
        {habits.length ? habits.map((h) => {
          const { n, set } = streak(data.habit_logs || [], h.id, today);
          const on = set.has(T);
          return (
            <div key={h.id} className="row habit">
              <Check on={on} onClick={() => actions.toggleHabit(h, T)} label={h.name + (on ? ' bugün yapılmadı olarak işaretle' : ' bugün yapıldı olarak işaretle')} />
              <button type="button" className="body" onClick={() => actions.openHabit(h)}>
                <span className="title">{h.emoji ? h.emoji + ' ' : ''}{h.name}</span>
                <span className="meta">{n ? <span className="streak">🔥 {n} gün</span> : <span>Seriye bugün başla</span>}</span>
              </button>
              <span className="hweek" aria-label={'Son 7 gün: ' + week.filter((d) => set.has(toDateInput(d))).length + ' gün'}>
                {week.map((d) => <span key={d.getTime()} className={'hd' + (set.has(toDateInput(d)) ? ' on' : '') + (sameDay(d, today) ? ' today' : '')} title={WEEKDAYS[d.getDay()]} />)}
              </span>
            </div>
          );
        }) : <p className="empty">Her gün yapmak istediğin şeyleri ekle: su içmek, yürüyüş, kitap… Her gün işaretle, seriyi takip et.</p>}
      </div>
    </Section>
  );
}

// Son 30 gün: her alışkanlık için günlük kareler ve tamamlanma oranı
export function HabitHistory({ data, now }) {
  const habits = [...(data.habits || [])].sort((a, b) => (a.sort || 0) - (b.sort || 0));
  if (!habits.length) return null;
  const today = startOfDay(now);
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  return (
    <Section title="Son 30 gün">
      <div className="card list">
        {habits.map((h) => {
          const set = new Set((data.habit_logs || []).filter((l) => l.habit_id === h.id).map((l) => l.day));
          const done = days.filter((d) => set.has(toDateInput(d))).length;
          const { n } = streak(data.habit_logs || [], h.id, today);
          let best = 0, run = 0;
          [...set].sort().forEach((d, i, arr) => { run = i && daysBetween(fromDateInput(arr[i - 1]), fromDateInput(d)) === 1 ? run + 1 : 1; best = Math.max(best, run); });
          return (
            <div key={h.id} className="hh">
              <div className="hh-top"><span className="title">{h.emoji ? h.emoji + ' ' : ''}{h.name}</span><span className="meta">%{Math.round((done / 30) * 100)} · şimdiki seri {n} · en uzun {best}</span></div>
              <div className="hh-grid" aria-label={'Son 30 günde ' + done + ' gün'}>
                {days.map((d) => <span key={d.getTime()} className={'hh-c' + (set.has(toDateInput(d)) ? ' on' : '') + (sameDay(d, today) ? ' today' : '')} title={fmtShort(d)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const HABIT_EMOJI = ['💧', '🚶', '📚', '🏋️', '🧘', '🥗', '😴', '💊', '✍️', '🙏'];
export function HabitSheet({ initial, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || '');
  const [emoji, setEmoji] = useState(initial.emoji || '');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await onSave({ id: initial.id, name: name.trim(), emoji: emoji || null, ...(isEdit ? {} : { sort: initial.sort || 0 }) }); } finally { setBusy(false); }
  };
  return (
    <Sheet title={isEdit ? 'Alışkanlığı düzenle' : 'Yeni alışkanlık'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="h-name">Alışkanlık</label>
          <input id="h-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. 2 litre su iç" required />
        </div>
        <div className="field">
          <span className="lbl">Simge</span>
          <div className="typechips">
            {HABIT_EMOJI.map((x) => <button key={x} type="button" className={'chip emoji' + (emoji === x ? ' on' : '')} aria-pressed={emoji === x} onClick={() => setEmoji(emoji === x ? '' : x)}>{x}</button>)}
          </div>
        </div>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !name.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Listeler ----------
function ListCard({ list, items, actions }) {
  const [text, setText] = useState('');
  const its = items.filter((i) => i.list_id === list.id).sort((a, b) => (a.done - b.done) || (a.sort || 0) - (b.sort || 0));
  const doneN = its.filter((i) => i.done).length;
  const add = (e) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    // Virgülle ya da satırla ayrılmış birden fazla madde tek seferde eklenebilir
    const parts = v.split(/\n|,(?=\s*\S)/).map((s) => s.trim()).filter(Boolean);
    actions.addListItems(list, parts, its.length);
    setText('');
  };
  return (
    <div className="card camp" style={{ padding: 16, gap: 10 }}>
      <div className="camp-head">
        <button type="button" className="name big" onClick={() => actions.openList(list)}>{list.title}</button>
        <span className="badge">{its.length ? (its.length - doneN) + ' kaldı' : 'Boş'}</span>
      </div>
      <div className="list" style={{ gap: 0 }}>
        {its.map((t) => (
          <div key={t.id} className="task">
            <Check square on={t.done} onClick={() => actions.toggleListItem(t)} label={t.label + (t.done ? ' alınmadı' : ' tamam')} />
            <span className={'label' + (t.done ? ' done' : '')}>{t.label}</span>
            <button type="button" className="iconbtn" aria-label={t.label + ' sil'} onClick={() => actions.deleteListItem(t)}><Icon.Close width="16" height="16" /></button>
          </div>
        ))}
      </div>
      <form className="addtask" onSubmit={add}>
        <label htmlFor={'li-' + list.id} style={srOnly}>Listeye ekle</label>
        <input id={'li-' + list.id} type="text" placeholder="Ekle (virgülle birden fazla)" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn" disabled={!text.trim()}>Ekle</button>
      </form>
      {doneN ? <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={() => actions.clearListDone(list)}>İşaretlileri temizle ({doneN})</button> : null}
    </div>
  );
}

export function ListsView({ data, actions }) {
  const lists = [...(data.lists || [])].sort((a, b) => (a.sort || 0) - (b.sort || 0) || (a.created_at || '').localeCompare(b.created_at || ''));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <p className="hint" style={{ margin: 0, flex: '1 1 220px' }}>Market, bavul, okunacaklar, hediye fikirleri… İşaretleyip temizleyebilirsin.</p>
        <button type="button" className="btn primary" onClick={() => actions.openList({ sort: lists.length })}>+ Yeni liste</button>
      </div>
      <div className="notes-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {lists.length ? lists.map((l) => <ListCard key={l.id} list={l} items={data.list_items || []} actions={actions} />)
          : <div className="card"><p className="empty">Henüz liste yok.</p></div>}
      </div>
    </div>
  );
}

const LIST_IDEAS = ['Market', 'Bavul', 'Okunacaklar', 'Hediye fikirleri', 'Ev işleri'];
export function ListSheet({ initial, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const [title, setTitle] = useState(initial.title || '');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try { await onSave({ id: initial.id, title: title.trim(), ...(isEdit ? {} : { sort: initial.sort || 0 }) }); } finally { setBusy(false); }
  };
  return (
    <Sheet title={isEdit ? 'Listeyi düzenle' : 'Yeni liste'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="l-title">Liste adı</label>
          <input id="l-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        {!isEdit ? <div className="typechips">{LIST_IDEAS.map((x) => <button key={x} type="button" className="chip" onClick={() => setTitle(x)}>{x}</button>)}</div> : null}
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Rehber ----------
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr-TR');

export function ContactsView({ data, actions }) {
  const [q, setQ] = useState('');
  const ql = q.trim().toLocaleLowerCase('tr-TR');
  const qd = q.replace(/\D/g, '');
  const list = [...(data.contacts || [])]
    .filter((c) => !ql || (c.name + ' ' + (c.company || '') + ' ' + (c.handle || '')).toLocaleLowerCase('tr-TR').includes(ql) || (qd.length >= 3 && normalizePhone(c.phone).includes(qd)))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <label htmlFor="csearch" style={srOnly}>Rehberde ara</label>
        <input id="csearch" className="search" type="search" placeholder="İsim, firma ya da numara" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn primary" style={{ flex: '0 0 auto', minHeight: 46 }} onClick={() => actions.openContact({})}>+ Kişi</button>
      </div>
      <div className="card list">
        {list.length ? list.map((c) => (
          <div key={c.id} className="row contact">
            <span className={'avatar' + (c.is_influencer ? ' infl' : '')} aria-hidden="true">{initials(c.name)}</span>
            <button type="button" className="body" onClick={() => actions.openContact(c)}>
              <span className="title" style={{ fontWeight: 600 }}>{c.name}</span>
              <span className="meta">
                {c.is_influencer ? <span className="tag infl-tag">Influencer{c.handle ? ' · ' + c.handle : ''}</span> : null}
                {c.company ? <span>{c.company}</span> : null}
                {c.phone ? <span>{prettyPhone(c.phone)}</span> : null}
              </span>
            </button>
            {c.phone ? <a className="missed-btn" href={waLink(c.phone)} target="_blank" rel="noopener noreferrer" aria-label={c.name + ' WhatsApp'}><WaIcon /></a> : null}
            {c.phone ? <a className="missed-btn call" href={'tel:+' + normalizePhone(c.phone)} aria-label={c.name + ' ara'}><Icon.Phone width="18" height="18" /></a> : null}
          </div>
        )) : <p className="empty">{q ? 'Aramaya uyan kişi yok.' : 'Rehber boş. Sık aradığın kişileri ekle; arama eklerken isimden numara otomatik gelir, cevapsız çağrılarda isim görünür.'}</p>}
      </div>
    </div>
  );
}

const WaIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4z" /><path d="M9 9.5c.3 1.6 1.9 3.8 4.4 4.8l1.1-1.1 1.8.8c-.2 1-1 1.7-2 1.6C10.9 15.3 8.4 12.6 8 10.2c-.1-1 .6-1.8 1.6-2l.8 1.8z" /></svg>
);

export function ContactSheet({ initial, onClose, onSave, onDelete, onCall, onCollab }) {
  const isEdit = !!initial.id;
  const [name, setName] = useState(initial.name || '');
  const [phone, setPhone] = useState(initial.phone || '');
  const [company, setCompany] = useState(initial.company || '');
  const [infl, setInfl] = useState(!!initial.is_influencer);
  const [handle, setHandle] = useState(initial.handle || '');
  const [notes, setNotes] = useState(initial.notes || '');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const p = phone.trim() ? '+' + normalizePhone(phone) : null;
    let h = handle.trim();
    if (h && !h.startsWith('@') && !/^https?:/.test(h)) h = '@' + h;
    try { await onSave({ id: initial.id, name: name.trim(), phone: p, company: company.trim() || null, is_influencer: infl, handle: infl ? (h || null) : null, notes: notes.trim() || null }); } finally { setBusy(false); }
  };
  return (
    <Sheet title={isEdit ? name || 'Kişi' : 'Yeni kişi'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="seg" role="group" aria-label="Tür">
          <button type="button" className={!infl ? 'on' : ''} onClick={() => setInfl(false)}>Kişi</button>
          <button type="button" className={infl ? 'on' : ''} onClick={() => setInfl(true)}>Influencer</button>
        </div>
        <div className="field">
          <label htmlFor="k-name">İsim</label>
          <input id="k-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="k-phone">Telefon</label>
          <input id="k-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0532 123 45 67" />
        </div>
        {infl ? (
          <div className="field">
            <label htmlFor="k-handle">Instagram / TikTok hesabı</label>
            <input id="k-handle" type="text" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@kullaniciadi" autoCapitalize="off" />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="k-company">{infl ? 'Ajans (isteğe bağlı)' : 'Firma / görev (isteğe bağlı)'}</label>
          <input id="k-company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="k-notes">Not</label>
          <input id="k-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={infl ? 'Fiyat, kategori, takipçi…' : ''} />
        </div>
        {isEdit ? (
          <div className="typechips">
            <button type="button" className="chip" onClick={() => onCall(initial)}>📞 Arama hatırlatması</button>
            {initial.is_influencer ? <button type="button" className="chip" onClick={() => onCollab(initial)}>🎬 Reklam ekle</button> : null}
          </div>
        ) : null}
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !name.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Influencer iş birlikleri ----------
function CollabRow({ c, who, now, onOpen }) {
  const d = c.publish_date ? fromDateInput(c.publish_date) : null;
  const late = d && d < startOfDay(now) && (c.status === 'planlandi' || c.status === 'anlasildi');
  return (
    <button type="button" className="row rowbtn collab" onClick={() => onOpen(c)}>
      <span className="cdate">{d ? <><b>{d.getDate()}</b><small>{MONTHS[d.getMonth()].slice(0, 3)}</small></> : <small>Tarih yok</small>}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' }}>
        <span className="title" style={{ fontWeight: 600 }}>{who}{c.title ? ' — ' + c.title : ''}</span>
        <span className="meta">
          {c.brand ? <span>{c.brand}</span> : null}
          {c.marketplace ? <span className="tag"><span className="dot" style={{ background: mpColor(c.marketplace) }} />{c.marketplace}</span> : null}
          {c.fee ? <span>{tl(c.fee)}</span> : null}
          {late ? <span className="time late">yayın tarihi geçti</span> : null}
        </span>
      </span>
      <span className={'cstatus s-' + c.status}>{STATUS_LABEL[c.status] || c.status}</span>
    </button>
  );
}

export function InfluencerView({ data, now, actions }) {
  const today = toDateInput(startOfDay(now));
  const people = (data.contacts || []).filter((c) => c.is_influencer).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const nameOf = (id) => ((data.contacts || []).find((c) => c.id === id) || {}).name || 'Influencer';
  const collabs = data.collabs || [];
  const active = collabs.filter((c) => c.status !== 'iptal' && c.status !== 'odendi' && !(c.status === 'yayinlandi' && c.publish_date && c.publish_date < today && !c.fee))
    .sort((a, b) => (a.publish_date || '9').localeCompare(b.publish_date || '9'));
  const closed = collabs.filter((c) => !active.includes(c)).sort((a, b) => (b.publish_date || '').localeCompare(a.publish_date || ''));
  const [showClosed, setShowClosed] = useState(false);
  const mk = today.slice(0, 7);
  const monthFee = collabs.filter((c) => c.status !== 'iptal' && (c.publish_date || '').startsWith(mk)).reduce((s, c) => s + (Number(c.fee) || 0), 0);
  const unpaid = collabs.filter((c) => c.status === 'yayinlandi').reduce((s, c) => s + (Number(c.fee) || 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="infl-stats">
        <div className="card wsum-cell"><span className="l">Bu ay iş birliği</span><span className="v">{tlShort(monthFee)}</span></div>
        <div className="card wsum-cell"><span className="l">Ödenecek</span><span className="v">{tlShort(unpaid)}</span><span className="s">yayınlanmış, ödenmemiş</span></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={() => actions.openContact({ is_influencer: true })}>+ Influencer</button>
        <button type="button" className="btn primary" onClick={() => actions.openCollab({})} disabled={!people.length}>+ İş birliği</button>
      </div>
      <Section title="Planlanan iş birlikleri" meta={active.length ? active.length + ' adet' : ''}>
        <div className="card list">
          {active.length ? active.map((c) => <CollabRow key={c.id} c={c} who={nameOf(c.contact_id)} now={now} onOpen={actions.openCollab} />)
            : <p className="empty">{people.length ? 'Planlanmış iş birliği yok.' : 'Önce bir influencer ekle, sonra iş birliklerini (yayın tarihi, ücret, durum) takip et.'}</p>}
        </div>
      </Section>
      {closed.length ? (
        <Section title="Tamamlananlar" action={<button type="button" className="linkbtn" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Gizle' : 'Göster (' + closed.length + ')'}</button>}>
          {showClosed ? <div className="card list">{closed.map((c) => <CollabRow key={c.id} c={c} who={nameOf(c.contact_id)} now={now} onOpen={actions.openCollab} />)}</div> : null}
        </Section>
      ) : null}
      {people.length ? (
        <Section title="Influencer'lar" meta={people.length + ' kişi'}>
          <div className="card list">
            {people.map((p) => {
              const mine = collabs.filter((c) => c.contact_id === p.id && c.status !== 'iptal');
              const total = mine.reduce((s, c) => s + (Number(c.fee) || 0), 0);
              return (
                <div key={p.id} className="row contact">
                  <span className="avatar infl" aria-hidden="true">{initials(p.name)}</span>
                  <button type="button" className="body" onClick={() => actions.openContact(p)}>
                    <span className="title" style={{ fontWeight: 600 }}>{p.name}</span>
                    <span className="meta">{p.handle ? <span>{p.handle}</span> : null}<span>{mine.length} iş birliği{total ? ' · ' + tlShort(total) : ''}</span></span>
                  </button>
                  <button type="button" className="missed-btn" aria-label={p.name + ' için iş birliği ekle'} onClick={() => actions.openCollab({ contact_id: p.id })}><Icon.Plus width="18" height="18" /></button>
                </div>
              );
            })}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

export function CollabSheet({ initial, contacts, onClose, onSave, onDelete, alertDefaults = DEFAULT_ALERTS }) {
  const isEdit = !!initial.id;
  const people = (contacts || []).filter((c) => c.is_influencer).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const [who, setWho] = useState(initial.contact_id || (people[0] && people[0].id) || '');
  const [title, setTitle] = useState(initial.title || '');
  const [brand, setBrand] = useState(initial.brand || '');
  const [mp, setMp] = useState(initial.marketplace || '');
  const [date, setDate] = useState(initial.publish_date || '');
  const [fee, setFee] = useState(initial.fee ? Number(initial.fee).toLocaleString('tr-TR') : '');
  const [status, setStatus] = useState(initial.status || 'planlandi');
  const [link, setLink] = useState(initial.link || '');
  const [notes, setNotes] = useState(initial.notes || '');
  // Eski kayıtta eski davranış (bir gün önce 09:00), yeni kayıtta varsayılan
  const [alerts, setAlerts] = useState(() => normAlerts(initial.alerts || (initial.id ? { list: ['1d'], at: '09:00' } : alertDefaults.collab)));
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!who || busy) return;
    setBusy(true);
    try {
      await onSave({ id: initial.id, contact_id: who, title: title.trim() || null, brand: brand || null, marketplace: mp || null, publish_date: date || null, fee: parseTL(fee) || null, status, link: link.trim() || null, notes: notes.trim() || null, ...(date ? { alerts } : {}) });
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={isEdit ? 'İş birliği' : 'Yeni iş birliği'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="b-who">Influencer</label>
          <select id="b-who" value={who} onChange={(e) => setWho(e.target.value)} required>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.handle ? ' (' + p.handle + ')' : ''}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="b-title">İçerik</label>
          <input id="b-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Reels, 3 story, YouTube videosu" />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="b-brand">Marka</label>
            <select id="b-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Yok</option>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="b-mp">Pazaryeri</label>
            <select id="b-mp" value={mp} onChange={(e) => setMp(e.target.value)}>
              <option value="">Yok</option>
              {MARKETPLACES.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="b-date">Yayın tarihi</label>
            <input id="b-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="b-fee">Ücret (₺)</label>
            <input id="b-fee" type="text" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="field">
          <span className="lbl">Durum</span>
          <div className="typechips" role="group" aria-label="Durum">
            {COLLAB_STATUS.map(([v, l]) => <button key={v} type="button" className={'chip' + (status === v ? ' on' : '')} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>)}
          </div>
        </div>
        <div className="field">
          <label htmlFor="b-link">Paylaşım linki</label>
          <input id="b-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" autoCapitalize="off" />
          {link && /^https?:\/\//.test(link) ? <a className="linkbtn" href={link} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start' }}>Paylaşımı aç ↗</a> : null}
        </div>
        <div className="field">
          <label htmlFor="b-notes">Not</label>
          <input id="b-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kod, kupon, brief…" />
        </div>
        {date ? <AlertPicker id="b-al" value={alerts} onChange={setAlerts} mode="allday" title="Yayın gününü hatırlat" /> : <p className="hint" style={{ margin: 0 }}>Yayın tarihi verirsen Google Takvim'e eklenir ve ne zaman hatırlatılacağını seçebilirsin.</p>}
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !who}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---------- Özel günler ----------
export function SpecialDatesSection({ data, now, actions }) {
  const ups = specialUpcoming(data.special_dates, now);
  return (
    <Section title="Özel günler" action={<button type="button" className="linkbtn" onClick={() => actions.openSpecial({})}>+ Ekle</button>}>
      <div className="card list">
        {ups.length ? ups.map(({ s, date, inDays }) => (
          <button key={s.id} type="button" className="row rowbtn special" onClick={() => actions.openSpecial(s)}>
            <span className="sp-icon" aria-hidden="true">{SPECIAL_ICON[s.kind] || '⭐'}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' }}>
              <span className="title">{specialLabel(s, date)}{s.for_yarim ? ' ❤️' : ''}</span>
              <span className="meta"><span>{fmtShort(date)}</span><span>🔔 {alertsLabel(s.alerts || { list: [Math.max(1, Number(s.remind_days) || 1) + 'd'], at: '09:00' }, { allDay: true })}</span></span>
            </span>
            <span className={'badge' + (inDays <= 7 ? ' live' : '')}>{inDays === 0 ? 'Bugün' : inDays === 1 ? 'Yarın' : inDays + ' gün'}</span>
          </button>
        )) : <p className="empty">Doğum günleri, yıl dönümleri… Bir kez ekle, her yıl hatırlatılsın.</p>}
      </div>
    </Section>
  );
}

export function SpecialDateSheet({ initial, onClose, onSave, onDelete, yarimHidden, YarimToggle, alertDefaults = DEFAULT_ALERTS }) {
  const isEdit = !!initial.id;
  const t = new Date();
  const [title, setTitle] = useState(initial.title || '');
  const [kind, setKind] = useState(initial.kind || 'dogum');
  const [month, setMonth] = useState(String(initial.month || t.getMonth() + 1));
  const [day, setDay] = useState(String(initial.day || t.getDate()));
  const [year, setYear] = useState(initial.year ? String(initial.year) : '');
  const [alerts, setAlerts] = useState(() => normAlerts(initial.alerts || (initial.id ? { list: [Math.max(1, Number(initial.remind_days) || 1) + 'd'], at: '09:00' } : alertDefaults.special)));
  const [yarim, setYarim] = useState(!!initial.for_yarim);
  const [busy, setBusy] = useState(false);
  const maxDay = new Date(2024, Number(month), 0).getDate();
  const yNum = Number(year);
  const validYear = !year || (yNum > 1900 && yNum <= t.getFullYear());
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || busy || !validYear) return;
    setBusy(true);
    try {
      await onSave({ id: initial.id, title: title.trim(), kind, month: Number(month), day: Math.min(Number(day), maxDay), year: year ? yNum : null, remind_days: Math.max(1, ...normAlerts(alerts).list.map((t) => (/^(\d+)d$/.exec(t) || [])[1]).filter(Boolean).map(Number), 1), alerts, for_yarim: yarim });
    } finally { setBusy(false); }
  };
  const preview = useMemo(() => {
    const s = { month: Number(month), day: Math.min(Number(day), maxDay), year: year ? yNum : null, kind, title: title || 'Özel gün' };
    const d = specialNext(s, t);
    const n = daysBetween(startOfDay(t), d);
    return fmtLong(d) + ' · ' + (n === 0 ? 'bugün' : n === 1 ? 'yarın' : n + ' gün sonra');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day, year, kind, title, maxDay]);
  return (
    <Sheet title={isEdit ? 'Özel günü düzenle' : 'Yeni özel gün'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="seg three" role="group" aria-label="Tür">
          {SPECIAL_KINDS.map(([v, l]) => <button key={v} type="button" className={kind === v ? 'on' : ''} onClick={() => setKind(v)}>{SPECIAL_ICON[v]} {l}</button>)}
        </div>
        <div className="field">
          <label htmlFor="s-title">Ne?</label>
          <input id="s-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'dogum' ? 'Örn. Annemin doğum günü' : kind === 'yildonumu' ? 'Örn. Evlilik yıl dönümü' : 'Örn. Anneler günü'} required />
        </div>
        <div className="row3">
          <div className="field">
            <label htmlFor="s-day">Gün</label>
            <select id="s-day" value={Math.min(Number(day), maxDay)} onChange={(e) => setDay(e.target.value)}>
              {Array.from({ length: maxDay }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-month">Ay</label>
            <select id="s-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-year">Yıl (isteğe bağlı)</label>
            <input id="s-year" type="text" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="—" aria-invalid={!validYear} />
          </div>
        </div>
        <span className="hint" style={{ marginTop: -6 }}>Sıradaki: {preview}{year && validYear ? ' · yıl girildiği için yaş/yıl sayısı görünür' : ''}</span>
        <AlertPicker id="s-al" value={alerts} onChange={setAlerts} mode="allday" />
        {yarimHidden && !yarim ? null : (
          <div className="typechips">
            <YarimToggle on={yarim} onClick={() => setYarim(!yarim)} />
            <span className="hint" style={{ alignSelf: 'center' }}>{yarim ? 'Yarim alanında görünür' : 'Yarim ile ilgiliyse işaretle'}</span>
          </div>
        )}
        <p className="hint" style={{ margin: 0 }}>Google Takvim'e her yıl tekrarlayan etkinlik olarak eklenir.</p>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !title.trim() || !validYear}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}
