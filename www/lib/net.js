// www/lib/net.js — reachability probe.
// `navigator.onLine` is always true inside the Android WebView (it only changes when the host
// calls WebView.setNetworkAvailable()), so we probe a known always-204 endpoint instead.
const PROBE_URL = 'https://www.gstatic.com/generate_204';
const CACHE_MS = 8000;

let lastCheck = 0, lastResult = null, inFlight = null;

export async function isOnline({ timeoutMs = 2500 } = {}) {
  const now = Date.now();
  if (lastResult !== null && now - lastCheck < CACHE_MS) return lastResult;
  if (inFlight) return inFlight;
  inFlight = probe(timeoutMs).then((ok) => { lastCheck = Date.now(); lastResult = ok; inFlight = null; return ok; });
  return inFlight;
}

async function probe(timeoutMs) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { try { ctrl?.abort(); } catch {} }, timeoutMs);
  try {
    await globalThis.fetch(PROBE_URL, { mode: 'no-cors', cache: 'no-store', signal: ctrl?.signal });
    return true;                                  // any response (opaque included) means we reached the network
  } catch { return false; }
  finally { clearTimeout(timer); }
}

// Forget the cached verdict — used by tests and after a deliberate network change.
export function resetNetCache() { lastCheck = 0; lastResult = null; inFlight = null; }

// Poll isOnline() and report only transitions. Returns a stop function.
export function startNetWatch(onChange, everyMs = 15000) {
  let stopped = false, last = null;
  const tick = async () => {
    if (stopped) return;
    let ok;
    try { ok = await isOnline(); } catch { ok = false; }
    if (stopped) return;
    if (ok !== last) { last = ok; try { onChange(ok); } catch {} }
  };
  tick();
  const h = setInterval(tick, everyMs);
  return () => { stopped = true; clearInterval(h); };
}
