// Küçük harita: seçilen yeri pinle gösterir; pin sürüklenebilir ya da haritaya dokunarak taşınabilir.
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export default function MapPin({ lat, lng, onMove }) {
  const box = useRef(null);
  const st = useRef({});
  const moveRef = useRef(onMove);
  moveRef.current = onMove;

  useEffect(() => {
    let alive = true;
    import('leaflet').then((mod) => {
      const L = mod.default || mod;
      if (!alive || !box.current) return;
      const map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 16);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(map);
      map.attributionControl.setPrefix('Leaflet');
      const icon = L.divIcon({ className: 'pin-icon', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 28] });
      const marker = L.marker([lat, lng], { draggable: true, icon, keyboard: true, title: 'Konum pini' }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); moveRef.current(p.lat, p.lng); });
      map.on('click', (e) => { marker.setLatLng(e.latlng); moveRef.current(e.latlng.lat, e.latlng.lng); });
      st.current = { map, marker };
      setTimeout(() => map.invalidateSize(), 60);
    });
    return () => { alive = false; if (st.current.map) st.current.map.remove(); st.current = {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dışarıdan yeni yer seçilince haritayı oraya taşı
  useEffect(() => {
    const { map, marker } = st.current;
    if (!map) return;
    const cur = marker.getLatLng();
    if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) {
      marker.setLatLng([lat, lng]);
      map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }
  }, [lat, lng]);

  return <div ref={box} className="mappin" role="application" aria-label="Konum haritası. Pini sürükleyerek ya da haritaya dokunarak konumu düzeltebilirsin." />;
}
