// Çerkes (Adıge) bayrağı: yeşil zemin, 12 altın yıldız (9'u yay, 3'ü düz sıra), 3 çapraz ok.
const G = '#00843D', Y = '#F7C82E';
const star = (cx, cy, r) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r;
    p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
};
const STARS = [
  ...Array.from({ length: 9 }, (_, k) => { const t = ((-150 + 15 * k) * Math.PI) / 180; return [150 + 98 * Math.cos(t), 128 + 98 * Math.sin(t)]; }),
  [118, 74], [150, 74], [182, 74],
].map(([x, y]) => star(x, y, 11)).join(' M');
const arrow = (rot) => (
  <g transform={`rotate(${rot} 150 146)`}>
    <line x1="150" y1="188" x2="150" y2="104" />
    <polygon points="150,94 143,110 157,110" />
    <path d="M150 178 l-8 10 M150 178 l8 10 M150 170 l-8 10 M150 170 l8 10" />
  </g>
);

export function CircassianFlag({ height = 18, className = '' }) {
  return (
    <svg className={'cflag ' + className} viewBox="0 0 300 200" height={height} width={height * 1.5} role="img" aria-label="Çerkes bayrağı">
      <rect width="300" height="200" fill={G} />
      <g fill={Y}>{STARS.split(' M').map((p, i) => <polygon key={i} points={p} />)}</g>
      <g stroke={Y} strokeWidth="5" strokeLinecap="round" fill={Y}>{arrow(-34)}{arrow(34)}{arrow(0)}</g>
    </svg>
  );
}
