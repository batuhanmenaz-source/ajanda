// Konum yardımcıları: telefonun konumunu alır, adrese çevirir, harita bağlantısı üretir.

export function mapsLink(location) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location || '');
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Bu cihaz konum desteklemiyor.')); return; }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      if (err.code === 1) reject(new Error('Konum izni verilmedi. Tarayıcı ayarlarından bu siteye konum izni ver.'));
      else if (err.code === 3) reject(new Error('Konum zaman aşımına uğradı, tekrar dene.'));
      else reject(new Error('Konum alınamadı. Telefonun konum servisini açık olduğundan emin ol.'));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

// Koordinatı okunabilir adrese çevirir (OpenStreetMap). Olmazsa koordinatları döndürür.
async function reverseGeocode(lat, lon) {
  const coords = lat.toFixed(6) + ',' + lon.toFixed(6);
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=tr&lat=' + lat + '&lon=' + lon);
    if (!r.ok) return coords;
    const j = await r.json();
    const a = j.address || {};
    const place = j.name || a.amenity || a.shop || a.building || a.office || '';
    const street = [a.road, a.house_number].filter(Boolean).join(' No:');
    const area = a.suburb || a.neighbourhood || a.quarter || '';
    const city = a.town || a.city_district || a.county || '';
    const prov = a.province || a.city || a.state || '';
    const parts = [place, street, area, city, prov].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i);
    return parts.length ? parts.join(', ') : (j.display_name || coords);
  } catch {
    return coords;
  }
}

export async function currentLocationText() {
  const pos = await getPosition();
  return reverseGeocode(pos.coords.latitude, pos.coords.longitude);
}
