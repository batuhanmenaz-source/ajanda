import { Icon } from './Icons.jsx';
import { mpColor } from './constants.js';

export function Mp({ name }) {
  if (!name) return null;
  return (<span className="tag"><span className="dot" style={{ background: mpColor(name) }} />{name}</span>);
}

export function Check({ on, onClick, label, square }) {
  return (
    <button type="button" className={'check' + (on ? ' on' : '') + (square ? ' square' : '')} onClick={onClick} aria-label={label} aria-pressed={on}>
      <span>{on ? <Icon.Check /> : null}</span>
    </button>
  );
}

export function Section({ title, meta, action, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action || (meta ? <span className="meta">{meta}</span> : null)}
      </div>
      {children}
    </section>
  );
}

export function Sheet({ title, onClose, children }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="iconbtn" aria-label="Kapat" onClick={onClose}><Icon.Close /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="progress">
      <div className="bar"><div style={{ width: pct + '%' }} /></div>
      <span className="n">{done}/{total} hazır</span>
    </div>
  );
}
