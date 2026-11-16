// Bugün sayfası: Dolar, Euro, gram altın ve ons altın (sunucudaki /api/kur üzerinden, 10 dk önbellekli)
import { useCallback, useEffect, useState } from 'react';

const CACHE = 'ajanda-fx-v1';
const read = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* yok say */ } };

const tl2 = (v) => '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tl0 = (v) => '₺' + Math.round(v).toLocaleString('tr-TR');
const ITEMS = [
  { k: 'USD', label: 'Dolar', ic: '$', fmt: tl2 },
  { k: 'EUR', label: 'Euro', ic: '€', fmt: tl2 },
  { k: 'GRA', label: 'Gram altın', ic: 'G', fmt: tl0 },
  { k: 'CEY', label: 'Çeyrek altın', ic: 'Ç', fmt: tl0 },
  { k: 'TAM', label: 'Tam altın', ic: 'T', fmt: tl0 }
];

export function FxStrip() {
  const [fx, setFx] = useState(read);
  const [err, setErr] = useState(false);
  const load = useCallback(async (force) => {
    const c = read();
    if (!force && c && Date.now() - c.got < 10 * 60 * 1000) { setFx(c); return; }
    try {
      const r = await fetch('/api/kur');
      if (!r.ok) throw new Error('kur ' + r.status);
      const j = await r.json();
      if (!j.rates || !j.rates.USD) throw new Error('kur boş');
      const v = { ...j, got: Date.now() };
      write(v); setFx(v); setErr(false);
    } catch (e) {
      console.warn(e);
      setErr(true);
    }
  }, []);
  useEffect(() => { load(false); }, [load]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') load(false); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  if (!fx) return err ? <div className="card fx fx-empty"><span className="hint">Kurlar alınamadı.</span><button type="button" className="linkbtn" onClick={() => load(true)}>Tekrar dene</button></div> : <div className="card fx fx-empty"><span className="hint">Kurlar yükleniyor…</span></div>;
  const t = new Date(fx.got);
  const list = ITEMS.filter((it) => fx.rates[it.k]);
  return (
    <section className="card fx" aria-label="Döviz ve altın">
      <div className="fx-head">
        <span className="fx-title">Piyasa</span>
        <button type="button" className="fx-at" onClick={() => load(true)} aria-label={'Kurlar ' + t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + ' itibarıyla, yenile'}>↻ {t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</button>
      </div>
      <div className="fx-grid">
        {list.map((it) => {
          const r = fx.rates[it.k];
          const ch = r.ch;
          const gold = ['GRA', 'CEY', 'TAM'].includes(it.k);
          return (
            <div key={it.k} className={'fx-i' + (gold ? ' gold' : ' cur')}>
              <span className="fx-k"><i aria-hidden="true">{it.ic}</i>{it.label}</span>
              <span className="fx-v">{r.approx ? '≈' : ''}{it.fmt(r.v)}</span>
              {ch != null ? <span className={'fx-ch ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : '')}>{ch > 0 ? '▲' : ch < 0 ? '▼' : '•'} %{Math.abs(ch).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</span> : <span className="fx-ch">günlük değişim yok</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
