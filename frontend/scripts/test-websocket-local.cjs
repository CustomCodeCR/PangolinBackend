// Prueba de contrato contra websocket-server.cjs local; requiere dependencia ws instalada.
const ws = require('ws');
const WebSocket = ws.WebSocket || ws;
const URL = process.env.WS_TEST_URL || 'ws://127.0.0.1:8081';
const origin = process.env.WS_TEST_ORIGIN || 'http://127.0.0.1:5173';
const a = new WebSocket(URL, { origin });
const b = new WebSocket(URL, { origin });
let aOpen = false, bOpen = false, got = false;
let sent = false;
const timeout = setTimeout(() => finish(1, 'TIMEOUT esperando conexión/mensaje'), 8000);
function finish(code, message) {
  if (got === null) return;
  got = null;
  clearTimeout(timeout);
  console.log(message);
  a.terminate(); b.terminate();
  process.exitCode = code;
}
function maybeSend() {
  if (aOpen && bOpen && !sent) {
    sent = true;
    a.send(JSON.stringify({type:'data-changed',resource:'prueba'}));
  }
}
a.on('open', () => { aOpen = true; maybeSend(); });
b.on('open', () => { bOpen = true; maybeSend(); });
b.on('message', bytes => {
  try {
    const msg = JSON.parse(bytes.toString());
    if (msg.type === 'data-changed' && msg.resource === 'prueba' &&
      typeof msg.eventId === 'string' && typeof msg.timestamp === 'string') {
      got = true; finish(0, 'OK: entrega de evento a segundo cliente');
    }
  } catch { /* ignorar */ }
});
for (const client of [a,b]) client.on('error', e => finish(1, 'ERROR: ' + e.message));
