// scripts/sim/cdp.mjs — minimal Chrome DevTools Protocol client for the Capacitor WebView (Node 24 global WebSocket).
export async function listTargets(port = 9223) {
  return (await fetch(`http://127.0.0.1:${port}/json`)).json();
}

export async function connect(port = 9223) {
  const list = await listTargets(port);
  const page = list.find(t => t.type === 'page' && /localhost/.test(t.url)) || list.find(t => t.type === 'page') || list[0];
  if (!page) throw new Error('no CDP page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error ' + (e?.message || ''))); });
  let id = 0; const pending = new Map(); const events = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id; pending.set(i, resolve);
    try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { pending.delete(i); reject(e); }
  });
  await send('Runtime.enable');
  await send('Log.enable').catch(() => {});

  // Runs `expr` as the body of an async function inside the page; returns the resolved value (by value).
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
    if (r.error) throw new Error(r.error.message);
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const waitFor = async (expr, timeoutMs = 20000, every = 500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await evaluate(expr)) return true;
      await new Promise(r => setTimeout(r, every));
    }
    return false;
  };
  const consoleLines = () => events
    .filter(m => m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown' || m.method === 'Log.entryAdded')
    .map(m => m.method === 'Runtime.consoleAPICalled'
      ? `[${m.params.type}] ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ')}`
      : m.method === 'Log.entryAdded' ? `[log:${m.params.entry.level}] ${m.params.entry.text}`
      : `[exception] ${m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text}`);
  return { send, evaluate, waitFor, events, consoleLines, close: () => ws.close(), url: page.url };
}
