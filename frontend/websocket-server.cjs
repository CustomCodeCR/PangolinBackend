const ws = require('ws');
const WebSocketServer = ws.WebSocketServer || ws.Server;
const WebSocket = ws.WebSocket || ws;
const { randomUUID } = require('node:crypto');

const PORT = 8081;

const wss = new WebSocketServer({
  host: '0.0.0.0',
  port: PORT,
  maxPayload: 64 * 1024,
  verifyClient: ({ origin, req }, callback) => {
    try {
      if (!origin || !req.headers.host) {
        return callback(false, 403, 'Origin required');
      }

      const source = new URL(origin);
      const host = new URL(`http://${req.headers.host}`).hostname;

      const allowed =
        source.hostname === host &&
        ['5173', '4173'].includes(source.port) &&
        source.protocol === 'http:';

      callback(allowed, allowed ? 200 : 403);
    } catch {
      callback(false, 403);
    }
  }
});

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.messageCount = 0;
  socket.messageWindow = Date.now();

  console.log('[WS] Cliente conectado');

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('error', (error) => {
    console.error('[WS] Error:', error.message);
  });

  socket.on('close', () => {
    console.log('[WS] Cliente desconectado');
  });

  socket.send(JSON.stringify({
    type: 'connected',
    message: 'Conexion WebSocket establecida'
  }));

  socket.on('message', (raw, isBinary) => {
    if (isBinary || raw.length > 64 * 1024) return;

    const now = Date.now();

    if (now - socket.messageWindow >= 10000) {
      socket.messageWindow = now;
      socket.messageCount = 0;
    }

    socket.messageCount++;

    if (socket.messageCount > 20) return;

    let message;

    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }

    if (
      !message ||
      message.type !== 'data-changed' ||
      typeof message.resource !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,60}$/.test(message.resource)
    ) {
      return;
    }

    const notification = JSON.stringify({
      type: 'data-changed',
      eventId: randomUUID(),
      resource: message.resource,
      timestamp: new Date().toISOString()
    });

    let recipients = 0;

    for (const client of wss.clients) {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(notification);
        recipients++;
      }
    }

    console.log(
      `[WS] Cambio en ${message.resource}; notificados: ${recipients}`
    );
  });
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }

    client.isAlive = false;
    client.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

wss.on('error', (error) => {
  console.error('[WS] Error del servidor:', error.message);
});

console.log(`[WS] Escuchando en puerto ${PORT} (red local)`);
