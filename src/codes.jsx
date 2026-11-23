// Influencer → İndirim kodları: reklamlardan ayrı takip, kullanım adedine göre rapor
import { useMemo, useState } from 'react';
import { MARKETPLACES, mpColor } from './constants.js';
import { addDays, startOfDay, toDateInput, fromDateInput, fmtShort, daysBetween, MONTHS } from './dates.js';
import { Section, Sheet } from './ui.jsx';
import { tl, tlShort, parseTL } from './revenue.jsx';
import { StatStrip } from './statstrip.jsx';
import { AdsView } from './ads.jsx';

export const SCOPES_C = [['tum', 'Tüm ürünler'], ['marka', 'Marka / kategori'], ['urun', 'Belirli ürünler']];
const scopeLbl = (k) => (SCOPES_C.find((x) => x[0] === k) || SCOPES_C[0])[1];
const pad = (n) => String(n).padStart(2, '0');
const hm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());

// ---- Hesaplar
const usesOf = (c) => (Array.isArray(c.uses) ? [...c.uses] : []).filter((u) => u && u.d).sort((a, b) => a.d.localeCompare(b.d));
export const usedTotal = (c) => { const u = usesOf(c); return u.length ? Number(u[u.length - 1].n) || 0 : 0; };
export const revTotal = (c) => { const u = usesOf(c).filter((x) => x.rev != null && x.rev !== ''); return u.length ? Number(u[u.length - 1].rev) || 0 : 0; };
// Belirli günde (dahil) o güne kadarki toplam kullanım
function usedAt(c, day) {
  let n = 0; let rv = 0;
  usesOf(c).forEach((u) => { if (u.d <= day) { n = Number(u.n) || 0; if (u.rev != null && u.rev !== '') rv = Number(u.rev) || 0; } });
  return { n, rv };
}
// Dönemde gerçekleşen kullanım = dönem sonundaki toplam − dönem başından önceki toplam
export function usedIn(c, from, to) {
  const a = usedAt(c, toDateInput(addDays(fromDateInput(from), -1)));
  const b = usedAt(c, to);
  return { n: Math.max(0, b.n - a.n), rv: Math.max(0, b.rv - a.rv) };
}
export function codeStatus(c, now = new Date()) {
  const s = c.start_at ? new Date(c.start_at) : null, e = c.end_at ? new Date(c.end_at) : null;
  if (c.use_limit && usedTotal(c) >= Number(c.use_limit)) return { key: 'full', label: 'Limit doldu' };
  if (e && now > e) return { key: 'past', label: 'Bitti' };
  if (s && now < s) { const n = daysBetween(startOfDay(now), startOfDay(s)); return { key: 'soon', label: n ? n + ' gün sonra' : 'Bugün ' + hm(s) }; }
  if (e) { const n = daysBetween(startOfDay(now), startOfDay(e)); return { key: 'live', label: n ? 'Aktif · ' + n + ' gün kaldı' : 'Son gün · ' + hm(e) }; }
  return { key: 'live', label: 'Aktif' };
}
const discTxt = (c) => (c.disc_value ? (c.disc_type === 'tl' ? tl(c.disc_value) : '%' + Number(c.disc_value).toLocaleString('tr-TR')) + ' indirim' : 'indirim girilmedi');

// ---- Influencer sekmesi: Reklamlar | İndirim kodları
export function InfluencerScreen({ data, now, actions }) {
  const [sub, setSubS] = useState(() => { try { return sessionStorage.getItem('ajanda-inf-sub') || 'reklam'; } catch { return 'reklam'; } });
  const setSub = (v) => { setSubS(v); try { sessionStorage.setItem('ajanda-inf-sub', v); } catch { /* yok say */ } };
  const live = (data.inf_codes || []).filter((c) => codeStatus(c, now).key === 'live').length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="rch-mode ic-switch" role="tablist" aria-label="Influencer bölümleri">
        <button type="button" role="tab" aria-selected={sub === 'reklam'} className={sub === 'reklam' ? 'on' : ''} onClick={() => setSub('reklam')}>📣 Reklamlar</button>
        <button type="button" role="tab" aria-selected={sub === 'kod'} className={sub === 'kod' ? 'on' : ''} onClick={() => setSub('kod')}>🏷️ İndirim kodları{live ? <span className="ic-badge">{live}</span> : null}</button>
      </div>
      {sub === 'kod' ? <CodesView data={data} now={now} actions={actions} /> : <AdsView data={data} now={now} actions={actions} />}
    </div>
  );
}

const PERIODS = [['30', 'Son 30 gün'], ['ay', 'Bu ay'], ['gecen', 'Geçen ay'], ['tumu', 'Tümü']];
function periodOf(p, now) {
  const t = startOfDay(now);
  if (p === '30') return [toDateInput(addDays(t, -29)), toDateInput(t)];
  if (p === 'ay') return [toDateInput(new Date(t.getFullYear(), t.getMonth(), 1)), toDateInput(t)];
  if (p === 'gecen') return [toDateInput(new Date(t.getFullYear(), t.getMonth() - 1, 1)), toDateInput(new Date(t.getFullYear(), t.getMonth(), 0))];
  return ['2000-01-01', toDateInput(t)];
}

export function CodesView({ data, now, actions }) {
  const all = useMemo(() => [...(data.inf_codes || [])].sort((a, b) => (b.start_at || '').localeCompare(a.start_at || '')), [data.inf_codes]);
  const [fMp, setFMp] = useState('');
  const [fWho, setFWho] = useState('');
  const [per, setPer] = useState('30');
  const [showPast, setShowPast] = useState(false);
  const list = all.filter((c) => (!fMp || c.marketplace === fMp) && (!fWho || c.handle === fWho));
  const withSt = list.map((c) => ({ c, st: codeStatus(c, now) }));
  const live = withSt.filter((x) => x.st.key === 'live');
  const soon = withSt.filter((x) => x.st.key === 'soon');
  const past = withSt.filter((x) => x.st.key === 'past' || x.st.key === 'full');
  const mps = MARKETPLACES.map((m) => m.name).filter((n) => all.some((c) => c.marketplace === n));
  const whos = [...new Set(all.map((c) => c.handle).filter(Boolean))];

  const [from, to] = periodOf(per, now);
  const inP = list.map((c) => ({ c, ...usedIn(c, from, to) }));
  const pUses = inP.reduce((a, x) => a + x.n, 0);
  const pRev = inP.reduce((a, x) => a + x.rv, 0);
  const totUses = list.reduce((a, c) => a + usedTotal(c), 0);
  const stale = live.filter((x) => { const u = usesOf(x.c); return !u.length || daysBetween(fromDateInput(u[u.length - 1].d), startOfDay(now)) >= 3; });

  // Rapor: influencer ve pazaryeri bazında
  const group = (keyFn) => {
    const m = {};
    inP.forEach((x) => {
      const k = keyFn(x.c) || '—';
      if (!m[k]) m[k] = { k, codes: 0, n: 0, rv: 0, lim: 0, used: 0 };
      m[k].codes++; m[k].n += x.n; m[k].rv += x.rv;
      if (x.c.use_limit) { m[k].lim += Number(x.c.use_limit); m[k].used += Math.min(usedTotal(x.c), Number(x.c.use_limit)); }
    });
    return Object.values(m).sort((a, b) => b.n - a.n);
  };
  const byWho = group((c) => c.handle);
  const byMp = group((c) => c.marketplace);
  const ranking = inP.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
  const rankMax = ranking.length ? ranking[0].n : 1;

  const card = ({ c, st }) => <CodeCard key={c.id} c={c} st={st} now={now} actions={actions} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StatStrip items={[
        { label: 'Aktif kod', value: live.length, unit: 'kod', tone: '#0C8599', sub: soon.length ? soon.length + ' kod yakında başlıyor' : 'yaklaşan kod yok' },
        { label: PERIODS.find((p) => p[0] === per)[1] + ' kullanım', value: pUses.toLocaleString('tr-TR'), unit: 'adet', tone: '#7048E8', sub: pRev ? tlShort(pRev) + ' kodlu satış' : 'toplam ' + totUses.toLocaleString('tr-TR') + ' kullanım' },
        { label: 'En çok kullanılan', value: ranking[0] ? ranking[0].c.code : '—', tone: '#E8590C', sub: ranking[0] ? ranking[0].n.toLocaleString('tr-TR') + ' kullanım · ' + (ranking[0].c.handle || '') : 'bu dönemde kullanım yok' },
        { label: 'Güncellenmeli', value: stale.length, unit: 'kod', tone: stale.length ? '#E03131' : '#2B8A3E', warn: stale.length > 0, sub: stale.length ? '3+ gündür kullanım girilmedi' : 'aktif kodların kullanımı güncel' }
      ]} />

      {mps.length > 1 || whos.length > 1 ? (
        <div className="ad-filters">
          {mps.length > 1 ? (
            <div className="typechips" role="group" aria-label="Pazaryerine göre">
              <span className="ad-flabel">Pazaryeri</span>
              <button type="button" className={'chip' + (!fMp ? ' on' : '')} onClick={() => setFMp('')}>Tümü</button>
              {mps.map((n) => <button key={n} type="button" className={'chip' + (fMp === n ? ' on' : '')} onClick={() => setFMp(n)}><span className="dot" style={{ background: mpColor(n) }} />{n}</button>)}
            </div>
          ) : null}
          {whos.length > 1 ? (
            <div className="typechips" role="group" aria-label="Influencer'a göre">
              <span className="ad-flabel">Influencer</span>
              <button type="button" className={'chip' + (!fWho ? ' on' : '')} onClick={() => setFWho('')}>Tümü</button>
              {whos.map((n) => <button key={n} type="button" className={'chip' + (fWho === n ? ' on' : '')} onClick={() => setFWho(n)}>{n}</button>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ad-actions">
        <button type="button" className="btn primary big" onClick={() => actions.openCode({})}>+ İndirim kodu ekle</button>
        <button type="button" className="btn big" onClick={() => actions.exportCodes({ codes: list, from, to, label: PERIODS.find((p) => p[0] === per)[1] })}>⬇ Excel</button>
      </div>

      <Section title={'Aktif · ' + live.length} tone="#0C8599">
        {live.length ? <div className="ic-grid">{live.map(card)}</div> : <div className="card"><p className="empty">Aktif indirim kodu yok.</p></div>}
      </Section>
      {soon.length ? <Section title={'Yaklaşan · ' + soon.length} tone="#C2410C"><div className="ic-grid">{soon.map(card)}</div></Section> : null}

      {/* Rapor */}
      <Section title="Kullanım raporu" tone="#7048E8" action={
        <div className="typechips" role="group" aria-label="Dönem">
          {PERIODS.map(([k, l]) => <button key={k} type="button" className={'chip' + (per === k ? ' on' : '')} onClick={() => setPer(k)}>{l}</button>)}
        </div>}>
        <div className="card ic-report">
          <div className="ic-rhead">
            <div><span>Kullanım</span><b>{pUses.toLocaleString('tr-TR')}</b></div>
            <div><span>Kodlu satış</span><b>{pRev ? tlShort(pRev) : '—'}</b></div>
            <div><span>Kullanım başına satış</span><b>{pRev && pUses ? tl(pRev / pUses) : '—'}</b></div>
            <div><span>Kullanılan kod</span><b>{inP.filter((x) => x.n > 0).length} / {list.length}</b></div>
          </div>
          {ranking.length ? (
            <div className="ic-rank">
              {ranking.map(({ c, n, rv }) => (
                <button key={c.id} type="button" className="ic-rank-row" onClick={() => actions.openCode(c)} style={{ '--mp': c.marketplace ? mpColor(c.marketplace) : '#7048E8' }}>
                  <span className="ic-rank-code">{c.code}</span>
                  <span className="ic-rank-who">{c.handle || '—'}{c.marketplace ? ' · ' + c.marketplace : ''}</span>
                  <span className="ic-rank-bar"><span style={{ width: (n / rankMax) * 100 + '%' }} /></span>
                  <span className="ic-rank-n"><b>{n.toLocaleString('tr-TR')}</b>{rv ? <small>{tlShort(rv)}</small> : null}</span>
                </button>
              ))}
            </div>
          ) : <p className="empty">Bu dönemde kullanım girilmedi.</p>}
          {byWho.length ? (
            <div className="ic-tables">
              {[['Influencer', byWho], ['Pazaryeri', byMp]].map(([title, rows]) => (
                <table key={title} className="ic-table">
                  <thead><tr><th>{title}</th><th>Kod</th><th>Kullanım</th><th>Satış</th><th>Limit doluluğu</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.k}>
                        <td>{title === 'Pazaryeri' && r.k !== '—' ? <span className="dot" style={{ background: mpColor(r.k) }} /> : null}{r.k}</td>
                        <td>{r.codes}</td>
                        <td><b>{r.n.toLocaleString('tr-TR')}</b></td>
                        <td>{r.rv ? tlShort(r.rv) : '—'}</td>
                        <td>{r.lim ? <span className="ic-fill"><span><i style={{ width: Math.min(100, (r.used / r.lim) * 100) + '%' }} /></span>%{Math.round((r.used / r.lim) * 100)}</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          ) : null}
          <p className="hint" style={{ margin: 0 }}>Dönem kullanımı, girdiğin toplam kullanım adetlerinin farkından hesaplanır (dönem sonu − dönem başı).</p>
        </div>
      </Section>

      {past.length ? (
        <Section title="Biten kodlar" action={<button type="button" className="linkbtn" onClick={() => setShowPast(!showPast)}>{showPast ? 'Gizle' : 'Göster (' + past.length + ')'}</button>}>
          {showPast ? <div className="ic-grid">{past.map(card)}</div> : null}
        </Section>
      ) : null}
      {!all.length ? <p className="hint">Supabase'de 24 numaralı SQL'i çalıştırdıysan ilk kodunu ekleyebilirsin.</p> : null}
    </div>
  );
}

function CodeCard({ c, st, now, actions }) {
  const used = usedTotal(c);
  const lim = Number(c.use_limit) || 0;
  const fill = lim ? Math.min(1, used / lim) : 0;
  const u = usesOf(c);
  const last = u[u.length - 1];
  const prev = u[u.length - 2];
  const s = c.start_at ? new Date(c.start_at) : null, e = c.end_at ? new Date(c.end_at) : null;
  const [copied, setCopied] = useState(false);
  const copy = () => { try { navigator.clipboard.writeText(c.code); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* yok say */ } };
  return (
    <div className={'card ic-card ' + st.key} style={{ '--mp': c.marketplace ? mpColor(c.marketplace) : '#0C8599' }}>
      <div className="ic-top">
        <button type="button" className="ic-code" onClick={copy} title="Kopyala">🏷️ {c.code}<small>{copied ? 'kopyalandı ✓' : 'kopyala'}</small></button>
        <span className={'ic-st ' + st.key}>{st.label}</span>
      </div>
      <button type="button" className="ic-body" onClick={() => actions.openCode(c)}>
        <span className="ic-who">{c.handle || 'Influencer girilmedi'}</span>
        <span className="ic-tags">
          {c.marketplace ? <span className="ic-mp">{c.marketplace}</span> : null}
          <span className="ic-disc">{discTxt(c)}</span>
          {c.min_basket ? <span>min. sepet {tlShort(c.min_basket)}</span> : null}
          {c.brand ? <span>{c.brand}</span> : null}
          <span>{scopeLbl(c.scope)}{c.scope_note ? ': ' + c.scope_note : ''}</span>
        </span>
        <span className="ic-when">{s ? fmtShort(s) + ' ' + hm(s) : '—'} → {e ? fmtShort(e) + ' ' + hm(e) : '—'}</span>
      </button>
      <div className="ic-use">
        <div className="ic-use-top">
          <span><b>{used.toLocaleString('tr-TR')}</b>{lim ? ' / ' + lim.toLocaleString('tr-TR') : ''} kullanım</span>
          {lim ? <em>%{Math.round(fill * 100)}</em> : null}
        </div>
        {lim ? <span className="ic-bar"><span className={fill >= 0.9 ? 'hot' : ''} style={{ width: fill * 100 + '%' }} /></span> : null}
        <span className="ic-use-s">
          {last ? 'son giriş ' + fmtShort(fromDateInput(last.d)) + (prev ? ' · +' + Math.max(0, Number(last.n) - Number(prev.n)).toLocaleString('tr-TR') + ' önceki girişten beri' : '') : 'henüz kullanım girilmedi'}
          {revTotal(c) ? ' · ' + tlShort(revTotal(c)) + ' satış' : ''}
        </span>
      </div>
      <button type="button" className="btn ic-add" onClick={() => actions.openCodeUsage(c)}>+ Kullanım gir</button>
    </div>
  );
}

// ---- Kod formu (Trendyol "Kod İndirimleri Oluştur" alanlarıyla)
export function CodeSheet({ initial, codes, collabs, onClose, onSave, onDelete }) {
  const isEdit = !!initial.id;
  const now = new Date();
  const s0 = initial.start_at ? new Date(initial.start_at) : (() => { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
  const e0 = initial.end_at ? new Date(initial.end_at) : (() => { const d = addDays(s0, 30); d.setHours(23, 0, 0, 0); return d; })();
  const [code, setCode] = useState(initial.code || '');
  const [handle, setHandle] = useState(initial.handle || '');
  const [mp, setMp] = useState(initial.marketplace || 'Trendyol');
  const [brand, setBrand] = useState(initial.brand || '');
  const [dtype, setDtype] = useState(initial.disc_type || 'yuzde');
  const [dval, setDval] = useState(initial.disc_value != null ? String(initial.disc_value).replace('.', ',') : '');
  const [minB, setMinB] = useState(initial.min_basket ? String(initial.min_basket).replace('.', ',') : '');
  const [lim, setLim] = useState(initial.use_limit ? String(initial.use_limit) : '');
  const [scope, setScope] = useState(initial.scope || 'tum');
  const [scopeNote, setScopeNote] = useState(initial.scope_note || '');
  const [sDate, setSDate] = useState(toDateInput(s0)); const [sTime, setSTime] = useState(hm(s0));
  const [eDate, setEDate] = useState(toDateInput(e0)); const [eTime, setETime] = useState(hm(e0));
  const [note, setNote] = useState(initial.note || '');
  const [busy, setBusy] = useState(false);
  const handles = useMemo(() => [...new Set([...(codes || []).map((c) => c.handle), ...(collabs || []).map((c) => c.handle)].filter(Boolean))].slice(0, 8), [codes, collabs]);
  const dup = (codes || []).some((c) => c.id !== initial.id && c.code && c.code.toLocaleUpperCase('tr-TR') === code.trim().toLocaleUpperCase('tr-TR'));
  const submit = async (ev) => {
    ev.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    const iso = (d, t) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = (t || '00:00').split(':').map(Number); return new Date(y, m - 1, dd, h, mi).toISOString(); };
    const num = (v) => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
    try {
      await onSave({ id: initial.id, code: code.trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, ''), handle: handle.trim() || null, marketplace: mp || null, brand: brand.trim() || null,
        disc_type: dtype, disc_value: num(dval), min_basket: minB ? parseTL(minB) || null : null, use_limit: lim ? parseInt(lim, 10) || null : null,
        scope, scope_note: scope === 'tum' ? null : scopeNote.trim() || null, start_at: iso(sDate, sTime), end_at: iso(eDate, eTime), note: note.trim() || null, ...(isEdit ? {} : { uses: [] }) });
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={isEdit ? 'İndirim kodu' : 'Yeni indirim kodu'} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="ic-code">İndirim kodu</label>
          <input id="ic-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ELIF15" required style={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.04em' }} />
          {dup ? <span className="hint" style={{ color: 'var(--danger)' }}>Bu kod zaten kayıtlı.</span> : null}
        </div>
        <div className="field">
          <label htmlFor="ic-who">Influencer</label>
          <input id="ic-who" type="text" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@hesap" />
          {handles.length ? <div className="typechips" style={{ marginTop: 6 }}>{handles.map((h) => <button key={h} type="button" className={'chip' + (handle === h ? ' on' : '')} onClick={() => setHandle(h)}>{h}</button>)}</div> : null}
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="ic-mp">Pazaryeri</label>
            <select id="ic-mp" value={mp} onChange={(e) => setMp(e.target.value)}>
              <option value="">Yok</option>
              {MARKETPLACES.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ic-brand">Marka</label>
            <input id="ic-brand" type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Örn. Missha" />
          </div>
        </div>
        <div className="field">
          <span className="lbl">İndirim tipi</span>
          <div className="seg" role="group" aria-label="İndirim tipi">
            <button type="button" className={dtype === 'yuzde' ? 'on' : ''} onClick={() => setDtype('yuzde')}>% indirim</button>
            <button type="button" className={dtype === 'tl' ? 'on' : ''} onClick={() => setDtype('tl')}>₺ indirim</button>
          </div>
        </div>
        <div className="row3 ic-row3">
          <div className="field">
            <label htmlFor="ic-val">{dtype === 'tl' ? 'İndirim (₺)' : 'İndirim yüzdesi'}</label>
            <input id="ic-val" type="text" inputMode="decimal" value={dval} onChange={(e) => setDval(e.target.value)} placeholder={dtype === 'tl' ? '100' : '15'} />
          </div>
          <div className="field">
            <label htmlFor="ic-min">Minimum sepet (₺)</label>
            <input id="ic-min" type="text" inputMode="decimal" value={minB} onChange={(e) => setMinB(e.target.value)} placeholder="500" />
          </div>
          <div className="field">
            <label htmlFor="ic-lim">Kullanım adedi</label>
            <input id="ic-lim" type="number" min="1" value={lim} onChange={(e) => setLim(e.target.value)} placeholder="300" />
          </div>
        </div>
        <div className="field">
          <span className="lbl">Uygulanacak ürünler</span>
          <div className="typechips">{SCOPES_C.map(([k, l]) => <button key={k} type="button" className={'chip' + (scope === k ? ' on' : '')} onClick={() => setScope(k)}>{l}</button>)}</div>
          {scope !== 'tum' ? <input type="text" value={scopeNote} onChange={(e) => setScopeNote(e.target.value)} placeholder={scope === 'marka' ? 'Marka / kategori adı' : 'Ürünler (kısa not)'} style={{ marginTop: 8 }} aria-label="Kapsam notu" /> : null}
        </div>
        <div className="ic-dates">
          <div className="field"><label htmlFor="ic-sd">Başlangıç</label><div className="row2" style={{ gap: 6 }}><input id="ic-sd" type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} required /><input type="time" value={sTime} onChange={(e) => setSTime(e.target.value)} aria-label="Başlangıç saati" /></div></div>
          <div className="field"><label htmlFor="ic-ed">Bitiş</label><div className="row2" style={{ gap: 6 }}><input id="ic-ed" type="date" value={eDate} min={sDate} onChange={(e) => setEDate(e.target.value)} required /><input type="time" value={eTime} onChange={(e) => setETime(e.target.value)} aria-label="Bitiş saati" /></div></div>
        </div>
        <div className="field">
          <label htmlFor="ic-note">Not</label>
          <textarea id="ic-note" rows="2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="İsteğe bağlı" />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          {isEdit ? <button type="button" className="linkbtn" style={{ color: 'var(--danger)' }} onClick={() => onDelete(initial)}>Sil</button> : <span />}
          <button type="submit" className="btn big primary" disabled={busy || !code.trim() || dup}>Kaydet</button>
        </div>
      </form>
    </Sheet>
  );
}

// ---- Kullanım girişi: paneldeki güncel toplam kullanım adedi (ve isteğe bağlı kodlu satış)
export function CodeUsageSheet({ code: c, onClose, onSave }) {
  const u = usesOf(c);
  const last = u[u.length - 1];
  const [day, setDay] = useState(toDateInput(new Date()));
  const [n, setN] = useState('');
  const [rev, setRev] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(u);
  const nNum = parseInt(n, 10);
  const prevBefore = [...list].filter((x) => x.d < day).pop();
  const diff = Number.isFinite(nNum) && prevBefore ? nNum - Number(prevBefore.n) : null;
  const add = () => {
    if (!Number.isFinite(nNum) || nNum < 0) return;
    const r = rev ? parseTL(rev) : null;
    setList([...list.filter((x) => x.d !== day), { d: day, n: nNum, ...(r ? { rev: r } : {}) }].sort((a, b) => a.d.localeCompare(b.d)));
    setN(''); setRev('');
  };
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    let final = list;
    if (Number.isFinite(nNum) && nNum >= 0) { const r = rev ? parseTL(rev) : null; final = [...list.filter((x) => x.d !== day), { d: day, n: nNum, ...(r ? { rev: r } : {}) }].sort((a, b) => a.d.localeCompare(b.d)); }
    setBusy(true);
    try { await onSave(c, final); } finally { setBusy(false); }
  };
  return (
    <Sheet title={'Kullanım · ' + c.code} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="hint" style={{ margin: 0 }}>Pazaryeri panelinde görünen <b>toplam</b> kullanım adedini yaz. Günlük artış ve dönem raporu bu toplamların farkından hesaplanır.{last ? ' Son giriş: ' + fmtShort(fromDateInput(last.d)) + ' · ' + Number(last.n).toLocaleString('tr-TR') + ' kullanım.' : ''}</p>
        <div className="row3 ic-row3">
          <div className="field"><label htmlFor="cu-d">Tarih</label><input id="cu-d" type="date" value={day} max={toDateInput(new Date())} onChange={(e) => setDay(e.target.value)} /></div>
          <div className="field"><label htmlFor="cu-n">Toplam kullanım</label><input id="cu-n" type="number" min="0" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} placeholder={last ? String(last.n) : '0'} autoFocus /></div>
          <div className="field"><label htmlFor="cu-r">Kodlu satış (₺)</label><input id="cu-r" type="text" inputMode="decimal" value={rev} onChange={(e) => setRev(e.target.value)} placeholder="isteğe bağlı" /></div>
        </div>
        {diff != null ? <span className={'hint'} style={{ marginTop: -6, color: diff < 0 ? 'var(--danger)' : 'var(--green)', fontWeight: 700 }}>{diff < 0 ? 'Önceki girişten az: kontrol et' : '+' + diff.toLocaleString('tr-TR') + ' kullanım (' + fmtShort(fromDateInput(prevBefore.d)) + "'den beri)"}</span> : null}
        <button type="button" className="btn" onClick={add} disabled={!Number.isFinite(nNum)}>Listeye ekle ve başka gün gir</button>
        {list.length ? (
          <div className="card list">
            {[...list].reverse().map((x, i, arr) => {
              const p = arr[i + 1];
              return (
                <div key={x.d} className="row ic-urow">
                  <span className="title">{fmtShort(fromDateInput(x.d))}</span>
                  <span className="meta"><b>{Number(x.n).toLocaleString('tr-TR')}</b> toplam{p ? ' · +' + Math.max(0, x.n - p.n).toLocaleString('tr-TR') : ''}{x.rev ? ' · ' + tlShort(x.rev) : ''}</span>
                  <button type="button" className="linkbtn" style={{ color: 'var(--danger)' }} onClick={() => setList(list.filter((y) => y.d !== x.d))}>Sil</button>
                </div>
              );
            })}
          </div>
        ) : null}
        <button type="submit" className="btn big primary" disabled={busy}>Kaydet</button>
      </form>
    </Sheet>
  );
}
