// Konum yardımcıları: yer arama (öneriler), telefon konumu, harita bağlantısı.
// Arama: Photon (OpenStreetMap verisi, anahtar gerektirmez). Ters adres: Nominatim.

const TR_BBOX = '25.6,35.8,44.8,42.2'; // Türkiye sınırları (önce burada aranır)

// "lat,lng" metnini sayıya çevirir
export function parseGeo(geo) {
  if (!geo) return null;
  const [a, b] = String(geo).split(',').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null;
}
export function geoText(lat, lng) {
  return lat.toFixed(6) + ',' + lng.toFixed(6);
}

const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');

// Koordinat varsa harita tam o noktayı açar; yoksa yazılan metni arar.
// Android'de geo: adresi doğrudan Haritalar uygulamasını açar (tarayıcı sekmesi açılmaz).
export function mapsLink(location, geo) {
  const g = parseGeo(geo);
  const name = (location || '').split(',')[0].replace(/[()]/g, '').trim();
  if (IS_ANDROID) {
    return g
      ? 'geo:' + g.lat + ',' + g.lng + '?q=' + g.lat + ',' + g.lng + (name ? '(' + encodeURIComponent(name) + ')' : '')
      : 'geo:0,0?q=' + encodeURIComponent(location || '');
  }
  const q = g ? g.lat + ',' + g.lng : (location || '');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}

// <a> için hedef: geo: bağlantıları aynı sekmede açılmalı (yoksa boş sekme kalır)
export function mapsTarget() {
  return IS_ANDROID ? {} : { target: '_blank', rel: 'noopener noreferrer' };
}

function label(p) {
  const street = [p.street, p.housenumber].filter(Boolean).join(' No:');
  const area = p.district || p.locality || '';
  const city = p.city || p.county || '';
  const prov = p.state || '';
  const name = p.name || street;
  const detail = [p.name ? street : '', area, city, prov !== city ? prov : '', p.countrycode && p.countrycode !== 'TR' ? p.country : '']
    .filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i && x !== name).join(', ');
  return { name: name || detail, detail: name ? detail : '' };
}

async function photon(q, bbox, signal, bias) {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '7');
  if (bbox) u.searchParams.set('bbox', bbox);
  if (bias) { u.searchParams.set('lat', bias.lat); u.searchParams.set('lon', bias.lng); }
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error('search_failed');
  const j = await r.json();
  return (j.features || []).map((f) => {
    const l = label(f.properties || {});
    const [lng, lat] = f.geometry.coordinates;
    return { name: l.name, detail: l.detail, text: [l.name, l.detail].filter(Boolean).join(', '), lat, lng };
  }).filter((x) => x.name);
}

// Yazdıkça çağrılır: önce Türkiye içinde, sonuç yoksa her yerde arar
export async function searchPlaces(q, signal, bias) {
  const query = (q || '').trim();
  if (query.length < 3) return [];
  let res = await photon(query, TR_BBOX, signal, bias);
  if (!res.length) res = await photon(query, null, signal, bias);
  const seen = new Set();
  return res.filter((x) => { const k = x.text.toLocaleLowerCase('tr-TR'); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
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
export async function reverseGeocode(lat, lon) {
  const coords = lat.toFixed(5) + ', ' + lon.toFixed(5);
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

// Telefonun şu anki konumu: { text, lat, lng }
export async function currentLocation() {
  const pos = await getPosition();
  const { latitude: lat, longitude: lng } = pos.coords;
  return { text: await reverseGeocode(lat, lng), lat, lng };
}
