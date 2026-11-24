// Renkli özet kutuları: İş → Özet ve sekmelerin üst şeridi
import { useState } from 'react';
const pctTxt = (v) => (v == null ? '' : (v >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(v * 100)) + '%');

export function Tile({ tone, label, value, unit, sub, delta, warn, onClick, children, invert }) {
  return (
    <button type="button" className={'wd-tile' + (warn ? ' warn' : '') + (delta != null ? ' has-d' : '')} style={{ '--tone': tone }} onClick={onClick}>
      <span className="wd-tile-k"><i aria-hidden="true" />{label}</span>
      <span className="wd-tile-v">{value}{unit ? <small> {unit}</small> : null}</span>
      {delta != null ? <span className={'wd-delta ' + ((delta >= 0) !== !!invert ? 'up' : 'down')}>{pctTxt(delta)}</span> : null}
      {sub ? <span className="wd-tile-s">{sub}</span> : null}
      {children}
    </button>
  );
}

// Sekmelerin üstündeki renkli özet şeridi
export function StatStrip({ items }) {
  return (
    <div className="wd-strip">
      {items.filter(Boolean).map((t) => (
        <Tile key={t.label} tone={t.tone} label={t.label} value={t.value} unit={t.unit} sub={t.sub} warn={t.warn} delta={t.delta} onClick={t.onClick || (() => {})} />
      ))}
    </div>
  );
}


// "Dikkat" kutusu: farklı alanlardan, bugün bakılması gereken birkaç şey (Bugün, İş özeti, Özel özeti)
// items: [{ k, tone: 'red'|'amber'|'blue', icon, text, go }]
export function AttentionBox({ items, title = 'Bugün dikkat', narrowMax = 4, max = 6, empty }) {
  const [all, setAll] = useState(false);
  if (!items.length) return empty ? <div className="att att-ok"><span>{empty}</span></div> : null;
  const narrow = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  const lim = all ? 99 : narrow ? narrowMax : max;
  const shown = items.slice(0, lim);
  return (
    <section className="att" aria-label={title}>
      <div className="att-h"><span>{title}</span><em>{items.length}</em></div>
      <div className="att-l">
        {shown.map((x) => (
          <button key={x.k} type="button" className={'att-i t-' + (x.tone || 'amber')} onClick={x.go}>
            <i aria-hidden="true">{x.icon}</i><span>{x.text}</span><b aria-hidden="true">›</b>
          </button>
        ))}
      </div>
      {items.length > shown.length ? <button type="button" className="linkbtn att-more" onClick={() => setAll(true)}>+{items.length - shown.length} madde daha</button> : null}
    </section>
  );
}
