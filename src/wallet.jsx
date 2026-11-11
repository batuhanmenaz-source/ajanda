// Cüzdan: kişisel gelir / gider, sabit giderler, bütçe (iş cirosundan tamamen ayrı)
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Sheet, Section } from './ui.jsx';
import { tl, tlShort, parseTL } from './revenue.jsx';
import {
  EXPENSE_CATS, INCOME_CATS, METHODS, catOf, catsFor, periodRange, shiftPeriod, sumBy, budgetStatus, fixedDue, fixedPaid
} from './money.js';
import { addDays, startOfDay, toDateInput, fromDateInput, fmtShort, fmtLong, rangeLabel, daysBetween, MONTHS, WEEKDAYS_SHORT } from './dates.js';

const pct = (x) => (x >= 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + '%';
const methodLabel = { kart: '💳 Kart', nakit: '💵 Nakit' };

export function WalletView({ money, fixed, budgets, now, actions, error }) {
  const today = startOfDay(now);
  const [view, setViewState] = useState(() => { try { return sessionStorage.getItem('ajanda-wallet-view') || 'ay'; } catch { return 'ay'; } });
  const setView = (v) => { setViewState(v); setAnchor(today); setHover(null); try { sessionStorage.setItem('ajanda-wallet-view', v); } catch { /* yok say */ } };
  const [anchor, setAnchor] = useState(today);
  const [hover, setHover] = useState(null);
  const [catFilter, setCatFilter] = useState(null);

  const { start, end } = periodRange(view, anchor);
  const isCurrent = today >= start && today <= end;
  const A = toDateInput(start), B = toDateInput(end);
  const rows = useMemo(() => (money || []).filter((r) => r.day >= A && r.day <= B), [money, A, B]);

  const income = sumBy(rows, start, end, 'gelir');
  const expense = sumBy(rows, start, end, 'gider');
  // Kıyas: önceki dönemin aynı uzunluktaki kısmı (bu dönemse bugüne kadar)
  const prev = periodRange(view, shiftPeriod(view, start, -1));
  const elapsed = isCurrent ? daysBetween(start, today) : daysBetween(start, end);
  const prevEnd = addDays(prev.start, Math.min(elapsed, daysBetween(prev.start, prev.end)));
  const prevExpense = sumBy(money || [], prev.start, prevEnd, 'gider');
  const delta = prevExpense > 0 ? expense / prevExpense - 1 : null;

  const byMethod = { kart: 0, nakit: 0 };
  rows.forEach((r) => { if (r.kind === 'gider' && r.method) byMethod[r.method] += Number(r.amount); });

  // Kategoriler
  const byCat = {};
  rows.filter((r) => r.kind === 'gider').forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + Number(r.amount); });
  const catList = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const catMax = catList.length ? catList[0][1] : 0;
  const lim = budgets || {};

  // Günlük grafik (gider)
  const n = daysBetween(start, end) + 1;
  const days = Array.from({ length: n }, (_, i) => {
    const d = addDays(start, i);
    const key = toDateInput(d);
    const v = rows.filter((r) => r.kind === 'gider' && r.day === key).reduce((s, r) => s + Number(r.amount), 0);
    return { d, key, v, future: d > today };
  });
  const maxV = Math.max(1, ...days.map((x) => x.v));
  const hoverDay = hover ? days.find((x) => x.key === hover) : null;

  // Bütçe (ay görünümünde o ayın, hafta görünümünde haftanın ayının)
  const budget = view === 'ay' ? budgetStatus(money, budgets, start) : [];

  // Sabit giderler (ay görünümü)
  const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
  const fixedRows = (fixed || []).filter((f) => f.active !== false).map((f) => ({ f, due: fixedDue(f, monthStart), paid: fixedPaid(f, money, monthStart) }))
    .sort((a, b) => a.due - b.due);
  const fixedTotal = fixedRows.filter((x) => x.f.kind !== 'gelir').reduce((s, x) => s + Number(x.f.amount), 0);
  const fixedLeft = fixedRows.filter((x) => x.f.kind !== 'gelir' && !x.paid).reduce((s, x) => s + Number(x.f.amount), 0);

  // Hareketler
  const list = rows.filter((r) => !catFilter || r.category === catFilter)
    .sort((a, b) => b.day.localeCompare(a.day) || (b.created_at || '').localeCompare(a.created_at || ''));
  const groups = [];
  list.forEach((r) => { const g = groups[groups.length - 1]; if (g && g.day === r.day) g.items.push(r); else groups.push({ day: r.day, items: [r] }); });

  const label = view === 'ay' ? MONTHS[start.getMonth()] + ' ' + start.getFullYear() : rangeLabel(start, end);
  const go = (k) => { setHover(null); setCatFilter(null); setAnchor(shiftPeriod(view, anchor, k)); };

  if (error) return <div className="card"><p className="empty">{error}</p></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="seg" role="group" aria-label="Dönem" style={{ maxWidth: 320 }}>
        <button type="button" className={view === 'hafta' ? 'on' : ''} onClick={() => setView('hafta')}>Haftalık</button>
        <button type="button" className={view === 'ay' ? 'on' : ''} onClick={() => setView('ay')}>Aylık</button>
      </div>
      <div className="week-nav">
        <button type="button" className="iconbtn" aria-label="Önceki dönem" onClick={() => go(-1)}><Icon.Left /></button>
        <span className="lbl">{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isCurrent ? <button type="button" className="linkbtn" style={{ marginRight: 6 }} onClick={() => { setAnchor(today); setHover(null); }}>{view === 'ay' ? 'Bu ay' : 'Bu hafta'}</button> : null}
          <button type="button" className="iconbtn" aria-label="Sonraki dönem" onClick={() => go(1)} disabled={isCurrent}><Icon.Right /></button>
        </div>
      </div>

      <section className="rv-summary card">
        <div className="wl-top">
          <div><span className="rv-k">Gelir</span><span className="wl-v in">{tl(income)}</span></div>
          <div><span className="rv-k">Gider</span><span className="wl-v">{tl(expense)}</span></div>
          <div><span className="rv-k">Kalan</span><span className={'wl-v' + (income - expense < 0 ? ' neg' : '')}>{(income - expense < 0 ? '−' : '') + tl(Math.abs(income - expense))}</span></div>
        </div>
        <div className="rv-stats">
          <div>
            <span className="rv-k">Önceki döneme göre gider</span>
            <span className="rv-v">{delta != null ? <span className={delta > 0 ? 'wl-up' : 'wl-down'}>{pct(delta)}</span> : '—'}</span>
          </div>
          <div><span className="rv-k">Günlük ortalama</span><span className="rv-v">{tl(expense / Math.max(1, elapsed + 1))}</span></div>
          <div><span className="rv-k">💳 Kart</span><span className="rv-v">{tl(byMethod.kart)}</span></div>
          <div><span className="rv-k">💵 Nakit</span><span className="rv-v">{tl(byMethod.nakit)}</span></div>
        </div>
      </section>

      <div className="wl-add">
        <button type="button" className="btn primary big" onClick={() => actions.openMoney({ kind: 'gider', day: isCurrent ? toDateInput(today) : B })}>− Gider ekle</button>
        <button type="button" className="btn big" onClick={() => actions.openMoney({ kind: 'gelir', day: isCurrent ? toDateInput(today) : B })}>+ Gelir ekle</button>
      </div>
      <div className="wl-tools">
        <p className="hint" style={{ margin: 0, flex: '1 1 220px' }}>İpucu: Hızlı ekle'ye "250 market", "dün 1.200 benzin kart" ya da "+45000 maaş" yazabilir, fişin fotoğrafını çekebilirsin.</p>
        <button type="button" className="btn" onClick={() => actions.scanReceipt()}>📷 Fiş tara</button>
        <button type="button" className="btn" onClick={() => actions.exportWallet({ start, end, label, view })}>⬇ Excel</button>
      </div>

      {budget.length ? (
        <Section title="Bütçe" meta={MONTHS[start.getMonth()]} action={<button type="button" className="linkbtn" onClick={actions.openBudget}>Düzenle</button>}>
          <div className="card list">
            {budget.map((b) => {
              const c = catOf(b.cat);
              const cls = b.ratio >= 1 ? ' over' : b.ratio >= 0.8 ? ' warn' : '';
              return (
                <div key={b.cat} className={'rv-mp wl-budget' + cls}>
                  <div className="rv-mp-top">
                    <span>{c.emoji} {c.label}</span>
                    <span className="rv-mp-v">{tl(b.spent)} <span className="muted">/ {tl(b.limit)}</span></span>
                  </div>
                  <div className="rv-mp-bar"><div style={{ width: Math.min(100, b.ratio * 100) + '%' }} /></div>
                  {b.ratio >= 1 ? <span className="wl-note over">Bütçe {tl(b.spent - b.limit)} aşıldı</span>
                    : b.ratio >= 0.8 ? <span className="wl-note warn">Bütçenin %{Math.round(b.ratio * 100)}'i kullanıldı · kalan {tl(b.limit - b.spent)}</span> : null}
                </div>
              );
            })}
          </div>
        </Section>
      ) : view === 'ay' ? <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start' }} onClick={actions.openBudget}>+ Kategori bütçesi belirle (ör. yemek ayda 5.000 ₺)</button> : null}

      <section className="section">
        <div className="section-head">
          <h2>Günlük harcama</h2>
          <span className="meta" aria-live="polite">{hoverDay ? fmtShort(hoverDay.d) + ' · ' + (hoverDay.v ? tl(hoverDay.v) : 'harcama yok') : 'Bir çubuğa dokun'}</span>
        </div>
        <div className="card rv-chart" onMouseLeave={() => setHover(null)}>
          <div className={'rv-bars' + (view === 'hafta' ? ' wk' : '')} role="list" aria-label="Günlük harcama grafiği">
            {days.map((x) => (
              <button type="button" role="listitem" key={x.key} className={'rv-col' + (hover === x.key ? ' on' : '') + (x.future ? ' future' : '')}
                onMouseEnter={() => setHover(x.key)} onFocus={() => setHover(x.key)} onClick={() => setHover(x.key)}
                aria-label={fmtLong(x.d) + ': ' + (x.v ? tl(x.v) : 'harcama yok')}>
                <span className="rv-bar" style={{ height: x.v ? Math.max(3, (x.v / maxV) * 100) + '%' : 0 }} />
              </button>
            ))}
          </div>
          <div className="rv-axis" aria-hidden="true">
            {view === 'hafta' ? days.map((x) => <span key={x.key}>{WEEKDAYS_SHORT[x.d.getDay()]}</span>) : <><span>1</span><span>{Math.round(n / 2)}</span><span>{n}</span></>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Kategoriler</h2><span className="meta">{catFilter ? <button type="button" className="linkbtn" onClick={() => setCatFilter(null)}>Filtreyi kaldır</button> : 'Dokun, hareketleri süz'}</span></div>
        <div className="card list">
          {catList.length ? catList.map(([id, v]) => {
            const c = catOf(id);
            return (
              <button key={id} type="button" className={'rv-mp rowbtn wl-cat' + (catFilter === id ? ' on' : '')} onClick={() => setCatFilter(catFilter === id ? null : id)} aria-pressed={catFilter === id}>
                <div className="rv-mp-top">
                  <span>{c.emoji} {c.label}</span>
                  <span className="rv-mp-v">{tl(v)} <span className="muted">· %{expense ? Math.round((v / expense) * 100) : 0}{lim[id] ? ' · bütçe ' + tlShort(lim[id]) : ''}</span></span>
                </div>
                <div className="rv-mp-bar"><div style={{ width: (v / catMax) * 100 + '%' }} /></div>
              </button>
            );
          }) : <p className="empty">Bu dönemde gider yok.</p>}
        </div>
      </section>

      {view === 'ay' ? (
        <Section title="Sabit giderler" meta={fixedRows.length ? 'Aylık ' + tl(fixedTotal) + (fixedLeft ? ' · kalan ' + tl(fixedLeft) : ' · hepsi ödendi') : ''}
          action={<button type="button" className="linkbtn" onClick={() => actions.openFixed({})}>+ Ekle</button>}>
          <div className="card list">
            {fixedRows.length ? fixedRows.map(({ f, due, paid }) => {
              const c = catOf(f.category);
              const late = !paid && due < today;
              const soon = !paid && !late && daysBetween(today, due) <= 3;
              return (
                <div key={f.id} className="row wl-fixed">
                  <span className="sp-icon" aria-hidden="true">{c.emoji}</span>
                  <button type="button" className="body" onClick={() => actions.openFixed(f)}>
                    <span className="title">{f.title}{f.kind === 'gelir' ? ' (gelir)' : ''}</span>
                    <span className="meta">
                      <span>{tl(f.amount)}</span>
                      <span className={late ? 'time late' : soon ? 'wl-soon' : ''}>{paid ? fmtShort(fromDateInput(paid.day)) + ' ödendi' : 'Her ayın ' + f.day_of_month + "'i" + (late ? ' · gecikti' : soon ? ' · ' + (daysBetween(today, due) === 0 ? 'bugün' : daysBetween(today, due) + ' gün kaldı') : '')}</span>
                      {f.remind ? <span>🔔</span> : null}
                    </span>
                  </button>
                  {paid ? <span className="cstatus s-odendi">✓ {f.kind === 'gelir' ? 'Geldi' : 'Ödendi'}</span>
                    : <button type="button" className="btn" onClick={() => actions.payFixed(f, due)}>{f.kind === 'gelir' ? 'Geldi' : 'Ödendi'}</button>}
                </div>
              );
            }) : <p className="empty">Kira, aidat, faturalar, abonelikler… Bir kez ekle; her ay "Ödendi" ile işaretle, ödeme gününde hatırlatılsın.</p>}
          </div>
        </Section>
      ) : null}

      <Section title="Hareketler" meta={list.length ? list.length + ' kayıt' + (catFilter ? ' · ' + catOf(catFilter).label : '') : ''}>
        <div className="card list">
          {groups.length ? groups.map((g) => (
            <div key={g.day} className="wl-group">
              <div className="wl-gday"><b>{fmtShort(fromDateInput(g.day))}</b> <span className="muted">{WEEKDAYS_SHORT[fromDateInput(g.day).getDay()]}</span></div>
              {g.items.map((r) => {
                const c = catOf(r.category);
                return (
                  <button key={r.id} type="button" className="rowbtn wl-tx" onClick={() => actions.openMoney(r)}>
                    <span className="sp-icon" aria-hidden="true">{c.emoji}</span>
                    <span className="wl-tx-body">
                      <span className="title">{r.note || c.label}</span>
                      <span className="meta">{r.note ? c.label : ''}{r.method ? (r.note ? ' · ' : '') + methodLabel[r.method] : ''}{r.fixed_id ? ' · sabit' : ''}{r.receipt_path ? ' · 🧾 fiş' : ''}</span>
                    </span>
                    <span className={'wl-amt' + (r.kind === 'gelir' ? ' in' : '')}>{r.kind === 'gelir' ? '+' : '−'}{tl(r.amount, Number(r.amount) % 1 ? 2 : 0)}</span>
                  </button>
                );
              })}
            </div>
          )) : <p className="empty">{catFilter ? 'Bu kategoride kayıt yok.' : 'Bu dönemde kayıt yok.'}</p>}
        </div>
      </Section>
    </div>
  );
}

function CatChips({ kind, value, onChange }) {
  return (
    <div className="wl-cats" role="group" aria-label="Kategori">
      {catsFor(kind).map((c) => (
        <button key={c.id} type="button" className={'wl-catchip' + (value === c.id ? ' on' : '')} aria-pressed={value === c.id} onClick={() => onChange(c.id)}>
          <span aria-hidden="true">{c.emoji}</span>{c.label}
        </button>
      ))}
    </div>
  );
}

function MethodSeg({ value, onChange }) {
  return (
    <div className="seg three" role="group" aria-label="Ödeme şekli">
      {METHODS.map(([v, l]) => <button key={v} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(value === v ? '' : v)}>{l}</button>)}
      <button type="button" className={!value ? 'on' : ''} onClick={() => onChange('')}>Belirtme</button>
    </div>
  );
}

// Fiş görseli: yeni çekilen (önizleme) ya da kayıtlı (imzalı bağlantı)
function ReceiptThumb({ preview, path, getUrl }) {
  const [url, setUrl] = useState(preview || '');
  useEffect(() => {
    if (preview || !path || !getUrl) return undefined;
    let alive = true;
    getUrl(path).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(''));
    return () => { alive = false; };
  }, [preview, path, getUrl]);
  if (!url) return path ? <span className="hint">Fiş görseli yükleniyor…</span> : null;
  return (
    <a className="wl-receipt" href={url} target="_blank" rel="noopener noreferrer" aria-label="Fişi büyük aç">
      <img src={url} alt="Fiş fotoğrafı" />
      <span>Fişi aç ↗</span>
    </a>
  );
}

export function ReceiptScanSheet({ file, onClose, onDone }) {
  const [state, setState] = useState({ step: 'Fotoğraf hazırlanıyor…', p: 0, err: '', preview: '' });
  useEffect(() => {
    let alive = true;
    let blob = null, preview = '';
    (async () => {
      try {
        const { shrinkImage, readText, parseReceipt } = await import('./receipt.js');
        blob = await shrinkImage(file);
        preview = URL.createObjectURL(blob);
        if (!alive) return;
        setState((s) => ({ ...s, preview, step: 'Fiş okunuyor…', p: 0.05 }));
        const text = await readText(blob, (status, p) => {
          if (!alive) return;
          setState((s) => ({ ...s, step: /recogniz/.test(status) ? 'Fiş okunuyor…' : 'Okuyucu hazırlanıyor (ilk seferde biraz sürer)…', p: /recogniz/.test(status) ? 0.3 + p * 0.7 : Math.min(0.3, p * 0.3) }));
        });
        if (!alive) return;
        const r = parseReceipt(text);
        onDone({ kind: 'gider', amount: r.amount || undefined, day: r.day, category: r.category, note: r.merchant || null, method: r.method || '', _receipt: { blob, preview }, _scanned: true, _found: !!r.amount });
      } catch (e) {
        console.error(e);
        if (alive) setState((s) => ({ ...s, err: 'Fiş okunamadı. Tutarı elle girebilirsin; fotoğraf yine kayda eklenir.' }));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  return (
    <Sheet title="Fiş tara" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {state.preview ? <img className="wl-scan-img" src={state.preview} alt="Çekilen fiş" /> : null}
        {state.err ? (
          <>
            <p className="hint" style={{ margin: 0, color: 'var(--danger)' }}>{state.err}</p>
            <button type="button" className="btn big primary" onClick={() => onDone({ kind: 'gider', _receipt: state.preview ? { blob: null, file, preview: state.preview } : null })}>Elle gir</button>
          </>
        ) : (
          <>
            <span className="hint" aria-live="polite">{state.step}</span>
            <div className="progress"><div className="bar"><div style={{ width: Math.round(state.p * 100) + '%' }} /></div><span className="n">%{Math.round(state.p * 100)}</span></div>
            <p className="hint" style={{ margin: 0 }}>Okuma telefonunda yapılır; fotoğraf yalnız kaydettiğinde senin hesabına yüklenir.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function MoneySheet({ initial, onClose, onSave, onDelete, onScan, getReceiptUrl }) {
  const isEdit = !!initial.id;
  const [kind, setKind] = useState(initial.kind || 'gider');
  const [amount, setAmount] = useState(initial.amount ? Number(initial.amount).toLocaleString('tr-TR', Number.isInteger(Number(initial.amount)) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  const [category, setCategory] = useState(initial.category || (initial.kind === 'gelir' ? 'maas' : ''));
  const [day, setDay] = useState(initial.day || toDateInput(new Date()));
  const [method, setMethod] = useState(initial.method || '');
  const [note, setNote] = useState(initial.note || '');
  const [busy, setBusy] = useState(false);
  const val = parseTL(amount);
  const switchKind = (k) => { setKind(k); if (!catsFor(k).some((c) => c.id === category)) setCategory(k === 'gelir' ? 'maas' : ''); };
  const submit = async (e) => {
    e.preventDefault();
    if (!val || busy) return;
    setBusy(true);
    try {
      await onSave({ id: initial.id, kind, amount: val, category: category || (kind === 'gelir' ? 'diger_gelir' : 'diger'), day, method: method || null, note: note.trim() || null, ...(initial.fixed_id ? { fixed_id: initial.fixed_id } : {}), ...(initial._receipt ? { _receipt: initial._receipt } : {}) });
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={isEdit ? (kind === 'gelir' ? 'Gelir' : 'Gider') : kind === 'gelir' ? 'Gelir ekle' : 'Gider ekle'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {initial._receipt || initial.receipt_path ? (
          <div className="wl-receipt-row">
            <ReceiptThumb preview={initial._receipt && initial._receipt.preview} path={initial.receipt_path} getUrl={getReceiptUrl} />
            {initial._scanned ? <span className="hint">{initial._found ? 'Fişten okundu — tutarı, tarihi ve kategoriyi kontrol et.' : 'Toplam tutar okunamadı, elle yaz.'}</span> : null}
          </div>
        ) : null}
        <div className="seg" role="group" aria-label="Tür">
          <button type="button" className={kind === 'gider' ? 'on' : ''} onClick={() => switchKind('gider')}>Gider</button>
          <button type="button" className={kind === 'gelir' ? 'on' : ''} onClick={() => switchKind('gelir')}>Gelir</button>
        </div>
        <div className="field">
          <label htmlFor="m-amount">Tutar (₺)</label>
          <input id="m-amount" className="wl-amount-in" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus={!isEdit && !initial._scanned} required />
          {!isEdit && !initial._receipt && kind === 'gider' && onScan ? <button type="button" className="linkbtn" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={onScan}>📷 Fiş fotoğrafından doldur</button> : null}
        </div>
        <div className="field">
          <span className="lbl">Kategori</span>
          <CatChips kind={kind} value={category} onChange={setCategory} />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="m-day">Tarih</label>
            <input id="m-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="m-note">Açıklama</label>
            <input id="m-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="isteğe bağlı" />
          </div>
        </div>
        {kind === 'gider' ? <div className="field"><span className="lbl">Ödeme şekli</span><MethodSeg value={method} onChange={setMethod} /></div> : null}
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !val}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

export function FixedSheet({ initial, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const [kind, setKind] = useState(initial.kind || 'gider');
  const [title, setTitle] = useState(initial.title || '');
  const [amount, setAmount] = useState(initial.amount ? Number(initial.amount).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '');
  const [category, setCategory] = useState(initial.category || (initial.kind === 'gelir' ? 'maas' : 'fatura'));
  const [dom, setDom] = useState(String(initial.day_of_month || new Date().getDate()));
  const [method, setMethod] = useState(initial.method || '');
  const [remind, setRemind] = useState(initial.remind !== false);
  const [busy, setBusy] = useState(false);
  const val = parseTL(amount);
  const switchKind = (k) => { setKind(k); setCategory(k === 'gelir' ? 'maas' : 'fatura'); };
  const submit = async (e) => {
    e.preventDefault();
    if (!val || !title.trim() || busy) return;
    setBusy(true);
    try { await onSave({ id: initial.id, kind, title: title.trim(), amount: val, category, day_of_month: Number(dom), method: method || null, remind, active: true }); } finally { setBusy(false); }
  };
  const ideas = kind === 'gelir' ? ['Maaş', 'Kira geliri'] : ['Kira', 'Aidat', 'Elektrik', 'İnternet', 'Telefon', 'Netflix', 'Spotify', 'Spor salonu'];
  return (
    <Sheet title={isEdit ? 'Sabit kalem' : 'Yeni sabit kalem'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="seg" role="group" aria-label="Tür">
          <button type="button" className={kind === 'gider' ? 'on' : ''} onClick={() => switchKind('gider')}>Sabit gider</button>
          <button type="button" className={kind === 'gelir' ? 'on' : ''} onClick={() => switchKind('gelir')}>Düzenli gelir</button>
        </div>
        <div className="field">
          <label htmlFor="f-ftitle">Adı</label>
          <input id="f-ftitle" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          {!isEdit ? <div className="typechips" style={{ marginTop: 6 }}>{ideas.map((x) => <button key={x} type="button" className="chip" onClick={() => {
            setTitle(x);
            const l = x.toLocaleLowerCase('tr-TR');
            const hit = catsFor(kind).find((c) => c.words.some((w) => l.startsWith(w)));
            if (hit) setCategory(hit.id);
          }}>{x}</button>)}</div> : null}
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="f-famount">Tutar (₺)</label>
            <input id="f-famount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" required />
          </div>
          <div className="field">
            <label htmlFor="f-dom">Her ayın</label>
            <select id="f-dom" value={dom} onChange={(e) => setDom(e.target.value)}>
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}'i{i + 1 > 28 ? ' (kısa aylarda son gün)' : ''}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <span className="lbl">Kategori</span>
          <CatChips kind={kind} value={category} onChange={setCategory} />
        </div>
        {kind === 'gider' ? <div className="field"><span className="lbl">Ödeme şekli</span><MethodSeg value={method} onChange={setMethod} /></div> : null}
        <label className="wl-check">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
          <span>Ödeme günü saat 10:00'da hatırlat (Google Takvim'e her ay tekrarlayan hatırlatma)</span>
        </label>
        <div className="actions">
          {isEdit && <button type="button" className="btn big danger" onClick={() => onDelete(initial)}>Sil</button>}
          <button type="submit" className="btn big primary" disabled={busy || !val || !title.trim()}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

export function BudgetSheet({ budgets, onClose, onSave }) {
  const [vals, setVals] = useState(() => Object.fromEntries(EXPENSE_CATS.map((c) => [c.id, budgets && budgets[c.id] ? Number(budgets[c.id]).toLocaleString('tr-TR') : ''])));
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const out = {};
    Object.entries(vals).forEach(([k, v]) => { const n = parseTL(v); if (n) out[k] = n; });
    try { await onSave(out); } finally { setBusy(false); }
  };
  const total = Object.values(vals).reduce((s, v) => s + parseTL(v), 0);
  return (
    <Sheet title="Aylık bütçe" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="hint" style={{ margin: 0 }}>Sınır koymak istediğin kategorilere aylık tutar yaz; boş bırakılanlar takip edilmez. %80'e gelince ve aşınca uyarı görürsün.</p>
        {EXPENSE_CATS.filter((c) => c.id !== 'diger').map((c) => (
          <div key={c.id} className="wl-brow">
            <label htmlFor={'b-' + c.id}>{c.emoji} {c.label}</label>
            <input id={'b-' + c.id} type="text" inputMode="decimal" value={vals[c.id]} placeholder="—" onChange={(e) => setVals({ ...vals, [c.id]: e.target.value })} />
          </div>
        ))}
        <span className="hint">Toplam bütçe: {tl(total)}</span>
        <div className="actions">
          <button type="submit" className="btn big primary" disabled={busy}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// Haftalık özet ve Bugün için küçük özet satırı
export function weekSpend(money, now) {
  const t = startOfDay(now);
  const { start } = periodRange('hafta', t);
  const elapsed = daysBetween(start, t);
  const cur = sumBy(money || [], start, t, 'gider');
  const ls = addDays(start, -7);
  const last = sumBy(money || [], ls, addDays(ls, elapsed), 'gider');
  return { cur, last, delta: last > 0 ? cur / last - 1 : null };
}

export { INCOME_CATS };
