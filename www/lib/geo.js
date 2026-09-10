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
// ranked: output of rankByGps (nearest first). preferredIds: ids favoured when within tieM of the best distance
// (e.g. [nextStop.id, current.id]). Returns { stop, distanceM, reason: 'nearest'|'preferred'|'none' } or null when
// nothing is within maxM.
export function chooseStop(ranked, { preferredIds = [], maxM = 80, tieM = 45 } = {}) {
  if (!ranked.length || ranked[0].distanceM > maxM) return { stop: null, distanceM: null, reason: 'none' };
  const best = ranked[0].distanceM;
  const withinTie = ranked.filter(r => r.distanceM <= best + tieM && r.distanceM <= maxM);
  for (const id of preferredIds) {
    const hit = withinTie.find(r => r.stop.id === id);
    if (hit) return { stop: hit.stop, distanceM: hit.distanceM, reason: 'preferred' };
  }
  return { stop: ranked[0].stop, distanceM: ranked[0].distanceM, reason: 'nearest' };
}
