// Hızlı arama ve komutlar (Ctrl/⌘+K ya da /): kayıtlarda ara, sayfaya git, yeni kayıt başlat.
// Yalnız zaten yüklü verilerde arar; ağ isteği yok.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet } from './ui.jsx';

const fold = (s) => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const fmtD = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) + (iso.length > 10 ? ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''); };

const PAGES = [
  ['bugun', 'Bugün', '☀️'], ['takvim', 'Takvim', '📅'], ['aramalar', 'Aramalar', '📞'],
  ['ozet', 'İş · Özet', '💼'], ['ciro', 'İş · Ciro', '📈'], ['satislar', 'İş · Satış raporu', '📦'], ['kampanya', 'İş · Kampanyalar', '📣'],
  ['influencer', 'İş · Influencer', '🎬'], ['mailler', 'İş · Mailler', '✉️'], ['bekleyenler', 'İş · Bekleyenler', '⏳'], ['notlar', 'İş · Notlar', '📝'], ['raporlar', 'İş · Performans', '📊'],
  ['ozelozet', 'Özel · Özet', '🏠'], ['cuzdan', 'Özel · Cüzdan', '👛'], ['saglik', 'Özel · Sağlık', '❤️'], ['yarim', 'Özel · Yarim', '💗'], ['listeler', 'Özel · Listeler', '🛒'], ['aliskanlik', 'Özel · Alışkanlıklar', '✅'], ['ozelgun', 'Özel · Özel günler', '🎂']
];

export function SearchSheet({ data, actions, onClose }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inp = useRef(null);
  const listRef = useRef(null);
  useEffect(() => { setTimeout(() => inp.current && inp.current.focus(), 30); }, []);
  const run = (fn) => () => { onClose(); setTimeout(fn, 0); };

  const commands = useMemo(() => [
    { g: 'Yeni', icon: '⏰', t: 'Yeni hatırlatma', go: () => actions.quickNew('reminder') },
    { g: 'Yeni', icon: '📞', t: 'Yeni arama', go: () => actions.quickNew('call') },
    { g: 'Yeni', icon: '📣', t: 'Yeni kampanya', go: () => actions.quickNew('campaign') },
    { g: 'Yeni', icon: '🎬', t: 'Yeni influencer reklamı', go: () => actions.quickNew('ad') },
    { g: 'Yeni', icon: '📈', t: 'Ciro gir', go: () => actions.openRevenue() },
    { g: 'Yeni', icon: '👛', t: 'Gider ekle', go: () => actions.openMoney({ kind: 'gider' }) },
    { g: 'Yeni', icon: '📝', t: 'Yeni not', go: () => actions.openNote({}) },
    { g: 'Yeni', icon: '📦', t: 'Satış raporu yükle', go: () => actions.goTab('satislar') },
    ...PAGES.map(([k, t, icon]) => ({ g: 'Git', icon, t, go: () => actions.goTab(k) }))
  ], [actions]);

  const records = useMemo(() => {
    const out = [];
    const add = (g, icon, t, sub, go, extra) => out.push({ g, icon, t, sub, go, k: fold([t, sub, extra].join(' ')) });
    (data.reminders || []).forEach((r) => add('Hatırlatmalar', r.done ? '✓' : '⏰', r.title, [r.marketplace, fmtD(r.due_at), r.done ? 'tamamlandı' : ''].filter(Boolean).join(' · '), () => actions.openReminder(r), r.notes));
    (data.calls || []).forEach((c) => add('Aramalar', '📞', c.who, [c.topic, c.phone, fmtD(c.due_at), c.done ? 'arandı' : ''].filter(Boolean).join(' · '), () => actions.openCall(c)));
    (data.campaigns || []).forEach((c) => add('Kampanyalar', c.kind === 'etkinlik' ? '🎟️' : '📣', c.name, [c.marketplace, c.start_date === c.end_date ? fmtD(c.start_date) : fmtD(c.start_date) + ' – ' + fmtD(c.end_date)].filter(Boolean).join(' · '), () => actions.openCampaign(c), c.notes));
    (data.collabs || []).forEach((c) => add('Influencer', '🎬', c.title || c.handle || 'Reklam', [c.handle, c.platform, c.brand, c.marketplace, fmtD(c.start_at)].filter(Boolean).join(' · '), () => actions.openCollab(c)));
    (data.inf_codes || []).forEach((c) => add('İndirim kodları', '🏷️', c.code, [c.handle, c.marketplace, c.end_at ? 'bitiş ' + fmtD(c.end_at) : ''].filter(Boolean).join(' · '), () => actions.openCode(c)));
    (data.notes || []).forEach((n) => add('Notlar', '📝', n.title || 'Not', [n.marketplace, (n.body || '').slice(0, 60)].filter(Boolean).join(' · '), () => actions.openNote(n), n.body));
    (data.followups || []).forEach((f) => add('Bekleyenler', f.done ? '✓' : '⏳', f.title, [f.party, f.marketplace, f.done ? 'kapandı' : ''].filter(Boolean).join(' · '), () => actions.openFollowup(f)));
    (data.contacts || []).forEach((c) => add('Rehber', '👤', c.name, [c.company, c.role, c.phone].filter(Boolean).join(' · '), () => actions.openContact(c), c.email));
    (data.special_dates || []).forEach((x) => add('Özel günler', '🎂', x.title, fmtD(x.date), () => actions.openSpecial(x)));
    (data.lists || []).forEach((l) => add('Listeler', '🛒', l.title, '', () => actions.openList(l)));
    return out;
  }, [data]);

  const res = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (!words.length) return commands.filter((c) => c.g === 'Yeni').concat(commands.filter((c) => ['Bugün', 'Takvim', 'İş · Satış raporu', 'İş · Ciro', 'Özel · Cüzdan', 'Aramalar'].includes(c.t)));
    const hit = (k) => words.every((w) => k.includes(w));
    const cmd = commands.filter((c) => hit(fold(c.t)));
    const rec = records.filter((r) => hit(r.k));
    // Başlığı sorgu ile başlayanlar önce
    const w0 = words[0];
    rec.sort((a, b) => (fold(b.t).startsWith(w0) ? 1 : 0) - (fold(a.t).startsWith(w0) ? 1 : 0));
    return [...rec.slice(0, 40), ...cmd.slice(0, 8)];
  }, [q, records, commands]);
  useEffect(() => { setI(0); }, [q]);
  useEffect(() => { const el = listRef.current && listRef.current.querySelector('[data-on="1"]'); if (el) el.scrollIntoView({ block: 'nearest' }); }, [i]);

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(res.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter' && res[i]) { e.preventDefault(); run(res[i].go)(); }
    else if (e.key === 'Escape') onClose();
  };
  let lastG = null;
  return (
    <Sheet title="Ara ya da komut ver" onClose={onClose}>
      <input ref={inp} className="sr-search cmd-in" type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
        placeholder="Kampanya, kişi, kod, not… ya da “yeni arama”, “ciro”" aria-label="Ara" />
      <div className="cmd-list" ref={listRef} role="listbox" aria-label="Sonuçlar">
        {res.length ? res.map((r, n) => {
          const head = r.g !== lastG ? (lastG = r.g) : null;
          return (
            <div key={n} role="presentation">
              {head ? <div className="cmd-g">{head}</div> : null}
              <button type="button" role="option" aria-selected={n === i} data-on={n === i ? '1' : '0'} className={'cmd-i' + (n === i ? ' on' : '')} onMouseEnter={() => setI(n)} onClick={run(r.go)}>
                <i aria-hidden="true">{r.icon}</i><span><b>{r.t}</b>{r.sub ? <small>{r.sub}</small> : null}</span>
              </button>
            </div>
          );
        }) : <p className="empty">“{q}” için sonuç yok.</p>}
      </div>
      <p className="hint cmd-tip">İpucu: bilgisayarda her yerden <b>Ctrl+K</b> ya da <b>/</b> ile açılır, <b>N</b> ile hızlı ekle. ↑↓ ile seç, Enter ile aç.</p>
    </Sheet>
  );
}
