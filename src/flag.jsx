// Çerkes (Adıge) bayrağı: koyu yeşil zemin, 12 sarı yıldız (9'u geniş yay, 3'ü düz sıra), 3 çapraz ok.
const G = '#2C6A1A', Y = '#FAFE30';
const star = ([cx, cy], r = 17) => {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.382 : r;
    p.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
};
const STARS = [
  [84, 226], [123, 149], [185, 87], [262, 47], [349, 34], [436, 47], [513, 87], [575, 149], [614, 226],
  [262, 102], [349, 102], [436, 102],
];
// Dikey ok (ucu yukarıda, tüyü aşağıda); çapraz oklar bunu (349,235) etrafında döndürür.
const Arrow = ({ rot }) => (
  <g transform={`rotate(${rot} 349 235)`}>
    <line x1="349" y1="172" x2="349" y2="300" stroke={Y} strokeWidth="4" />
    <polygon points="349,140 356,180 349,174 342,180" />
    <polygon points="343,298 349,290 355,298 355,330 349,322 343,330" />
  </g>
);

export function CircassianFlag({ height = 18, className = '' }) {
  return (
    <svg className={'cflag ' + className} viewBox="0 0 700 344" height={height} width={(height * 700) / 344} role="img" aria-label="Çerkes bayrağı">
      <rect width="700" height="344" fill={G} />
      <g fill={Y}>
        {STARS.map((s, i) => <polygon key={i} points={star(s)} />)}
        <Arrow rot={-39.5} /><Arrow rot={39.5} /><Arrow rot={0} />
      </g>
    </svg>
  );
}
