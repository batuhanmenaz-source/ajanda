// Satış raporu günlük özeti: Bugün ve İş → Özet için küçük kart.
// Veri, Satış raporu sayfası açıldığında hesaplanıp ayarlara kaydedilen birkaç KB'lık özetten gelir; burada indirme yok.
const MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const WD = ['pazara', 'pazartesiye', 'salıya', 'çarşambaya', 'perşembeye', 'cumaya', 'cumartesiye'];
const tlS = (v) => (v >= 1e6 ? '₺' + (v / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' mn' : v >= 1e3 ? '₺' + (v / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' bin' : '₺' + Math.round(v || 0).toLocaleString('tr-TR'));
const pc = (v) => (v == null ? null : Math.abs(v) < 0.005 ? '0' : (v > 0 ? '+' : '−') + '%' + Math.round(Math.abs(v * 100)));
const cls = (v) => (v == null ? '' : v >= 0.03 ? 'up' : v <= -0.03 ? 'down' : 'flat');

export function SalesDigestCard({ digest, now, onOpen }) {
  if (!digest || !digest.day) return null;
  const [y, m, d] = digest.day.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const age = Math.round((t0 - day) / 864e5);
  if (age > 5) return null;
  const when = age === 1 ? 'Dün' : age === 0 ? 'Bugün' : d + ' ' + MON[m - 1];
  const al = (digest.alerts || []).slice(0, 3);
  return (
    <button type="button" className="sdg" onClick={onOpen} aria-label="Satış raporunu aç">
      <span className="sdg-h">
        <span className="sdg-k">🛒 Satış · {when}{age > 1 ? ' (son rapor)' : ''}</span>
        <span className="sdg-v">{tlS(digest.r)}</span>
        <span className="sdg-c">
          {digest.d1 != null ? <span className={cls(digest.d1)}>{pc(digest.d1)} <em>önceki güne</em></span> : null}
          {digest.dw != null ? <span className={cls(digest.dw)}>{pc(digest.dw)} <em>geçen {WD[day.getDay()]}</em></span> : null}
          {digest.ww != null ? <span className={cls(digest.ww)}>{pc(digest.ww)} <em>7 gün</em></span> : null}
        </span>
      </span>
      {al.length ? (
        <span className="sdg-al">
          {al.map((a, i) => <span key={i} className={'t-' + a.t}><i>{a.t === 'stock' ? '📦' : a.t === 'stop' ? '⛔' : '📉'}</i><b>{a.x.charAt(0).toLocaleUpperCase('tr-TR') + a.x.slice(1)}</b> · {a.n}</span>)}
          {(digest.alerts || []).length > 3 ? <span className="sdg-more">+{digest.alerts.length - 3} uyarı daha</span> : null}
        </span>
      ) : <span className="sdg-ok">Hero ürünlerde düşüş ya da stok sorunu yok ✓</span>}
    </button>
  );
}
