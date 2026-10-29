// 通过 CDP 操作无头 Edge：node tools/cdp.mjs "<js expression>" [screenshot.png]
import fs from 'node:fs';

const expression = process.argv[2] || '1';
const shot = process.argv[3];
const reload = process.argv[4] === 'reload';
const size = process.argv[5];

const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = targets.find((t) => t.type === 'page' && t.url.includes('5173')) || targets.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const events = [];
let seq = 0;

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  } else if (msg.method) {
    events.push(msg);
  }
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send('Runtime.enable');
await send('Page.enable');

if (size === 'auto') {
  await send('Emulation.clearDeviceMetricsOverride');
} else if (size) {
  const [w, h] = size.split('x').map(Number);
  await send('Emulation.setDeviceMetricsOverride', {
    width: w, height: h, deviceScaleFactor: 1, mobile: false,
  });
}

if (reload) {
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2200));
}

const res = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
  userGesture: true,
});

if (res.exceptionDetails) {
  console.log('EXCEPTION:', JSON.stringify(res.exceptionDetails, null, 2));
} else {
  console.log(JSON.stringify(res.result?.value ?? res.result, null, 2));
}

for (const e of events) {
  if (e.method === 'Runtime.exceptionThrown') {
    console.log('PAGE EXCEPTION:', e.params.exceptionDetails?.text, e.params.exceptionDetails?.exception?.description);
  }
}

if (shot) {
  const img = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(shot, Buffer.from(img.data, 'base64'));
  console.log('screenshot ->', shot);
}

ws.close();
