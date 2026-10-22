// 在已开的 Edge（CDP 9333）里求值任意表达式
// 用法：node tools/cdp_eval.mjs <url> <expressionFile>
const [, , url, exprFile] = process.argv;
const { readFile } = await import('node:fs/promises');
const expression = await readFile(exprFile, 'utf8');
const PORT = 9333;

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

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
if (url && url !== '-') await send('Page.navigate', { url }, sessionId);
await new Promise((resolve) => setTimeout(resolve, 4000));

const result = await send(
  'Runtime.evaluate',
  { expression, returnByValue: true, awaitPromise: true },
  sessionId,
);
if (result.exceptionDetails) {
  console.log('EXCEPTION =', result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
} else {
  console.log(typeof result.result.value === 'string' ? result.result.value : JSON.stringify(result.result.value, null, 1));
}

await send('Target.closeTarget', { targetId });
ws.close();
