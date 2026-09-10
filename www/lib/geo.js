// www/lib/geo.js
export function haversineM([lat1, lon1], [lat2, lon2]) {
  const R = 6371e3, r = (x) => x * Math.PI / 180;
  const dφ = r(lat2 - lat1), dλ = r(lon2 - lon1);
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// → [{ stop, distanceM }] nearest first, only stops with gps, at most n.
export function rankByGps(stops, pos, n = 3) {
  return stops.filter(s => Array.isArray(s.gps)).map(s => ({ stop: s, distanceM: haversineM(s.gps, pos) }))
    .sort((a, b) => a.distanceM - b.distanceM).slice(0, n);
}
