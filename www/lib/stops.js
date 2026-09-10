// www/lib/stops.js
// Route order and neighbours. `enabledOptionals` = { [id]: true } for optional stops the user switched on.
export function routeOrder(stops, enabledOptionals = {}) {
  return stops.filter(s => !s.optional || enabledOptionals[s.id]).sort((a, b) => a.order - b.order);
}
export function nextStop(stops, currentId, enabledOptionals = {}) {
  const r = routeOrder(stops, enabledOptionals);
  const i = r.findIndex(s => s.id === currentId);
  if (i === -1) { const cur = byId(stops, currentId); return cur ? (r.find(s => s.order > cur.order) ?? null) : null; }
  return r[i + 1] ?? null;
}
export function byId(stops, id) { return stops.find(s => s.id === id); }
export async function loadStops(url = './stops.json') { const r = await fetch(url); if (!r.ok) throw new Error(`stops ${r.status}`); return r.json(); }
