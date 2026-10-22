// 用 CDP 直接驱动 Edge，读页面真实内容（截图之外的证据）
// 用法：node tools/cdp_probe.mjs <url> [outPng]
const [, , url, outPng] = process.argv;
const PORT = 9333;

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);

let id = 0;
const pending = new Map();
const events = [];

function send(method, params = {}, sessionId) {
  const msgId = ++id;
  const payload = { id: msgId, method, params };
  if (sessionId) payload.sessionId = sessionId;
  ws.send(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    pending.set(msgId, { resolve, reject });
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 20000);
  });
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    events.push(`console.${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? '?').join(' ')}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    events.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
  }
  if (msg.method === 'Log.entryAdded') {
    events.push(`log.${msg.params.entry.level}: ${msg.params.entry.text}`);
  }
  if (msg.method === 'Network.loadingFailed') {
    events.push(`netfail: ${msg.params.errorText} (${msg.params.type ?? ''})`);
  }
  if (msg.method === 'Network.responseReceived') {
    const r = msg.params.response;
    if (new URL(r.url).origin === 'http://localhost:4174') {
      events.push(`net ${r.status} ${new URL(r.url).pathname} ${r.fromDiskCache ? '(disk)' : ''}${r.fromServiceWorker ? '(sw)' : ''}`);
    }
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);

const navigate = await send('Page.navigate', { url }, sessionId);
console.log('NAVIGATE =', JSON.stringify(navigate));

// 给 Service Worker + React 一点时间
await new Promise((resolve) => setTimeout(resolve, 6000));

const evaluate = async (expression) => {
  const result = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (result.exceptionDetails) return `EXCEPTION: ${result.exceptionDetails.text}`;
  return result.result.value;
};

const probe = await evaluate(`(async () => {
  const report = {
    url: location.href,
    title: document.title,
    rootChildren: document.getElementById('root')?.children.length ?? -1,
    text: (document.body?.innerText ?? '').slice(0, 160).replace(/\\s+/g, ' '),
    controller: Boolean(navigator.serviceWorker?.controller),
    secure: window.isSecureContext,
    caches: await caches.keys(),
  };
  report.coreEntries = report.caches.length
    ? (await (await caches.open(report.caches.find((k) => k.startsWith('vocab-core')) ?? report.caches[0])).keys()).map((r) => new URL(r.url).pathname)
    : [];
  return JSON.stringify(report, null, 1);
})()`);

console.log('PROBE =', probe);
console.log('EVENTS =', events.length ? `\n  ${events.join('\n  ')}` : '(none)');

if (outPng) {
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(outPng, Buffer.from(shot.data, 'base64'));
  console.log('SCREENSHOT =', outPng);
}

await send('Target.closeTarget', { targetId });
ws.close();
