// Renkli özet kutuları: İş → Özet ve sekmelerin üst şeridi
const pctTxt = (v) => (v == null ? '' : (v >= 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(v * 100)) + '%');

export function Tile({ tone, label, value, unit, sub, delta, warn, onClick, children }) {
  return (
    <button type="button" className={'wd-tile' + (warn ? ' warn' : '')} style={{ '--tone': tone }} onClick={onClick}>
      <span className="wd-tile-k"><i aria-hidden="true" />{label}</span>
      <span className="wd-tile-v">{value}{unit ? <small> {unit}</small> : null}</span>
      {delta != null ? <span className={'wd-delta ' + (delta >= 0 ? 'up' : 'down')}>{pctTxt(delta)}</span> : null}
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

