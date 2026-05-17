/**
 * Vite dev-server plugin: opens a WebSocket hub on port 5175 so that external
 * clients (e.g. the MCP server) can send design commands to the React app.
 *
 * Protocol: simple JSON relay — any message received from one connected client
 * is forwarded to all other connected clients.  The React app handles action
 * messages; external senders receive 'ack' responses from the React app.
 */
import { WebSocketServer } from 'ws';

const CONTROL_PORT = 5175;

export default function controlPlugin() {
  return {
    name: 'vite-control-ws',
    configureServer(server) {
      const wss = new WebSocketServer({ port: CONTROL_PORT });
      const clients = new Set();

      wss.on('connection', (ws, req) => {
        clients.add(ws);
        console.log(`[ControlWS] Client connected from ${req.socket.remoteAddress} (total: ${clients.size})`);

        ws.on('close', () => {
          clients.delete(ws);
          console.log(`[ControlWS] Client disconnected (remaining: ${clients.size})`);
        });

        ws.on('message', (data) => {
          const raw = data.toString();
          const targets = [...clients].filter(c => c !== ws && c.readyState === 1);
          console.log(`[ControlWS] Relaying to ${targets.length} client(s): ${raw.slice(0, 80)}`);
          targets.forEach(c => c.send(raw));
        });

        ws.on('error', () => clients.delete(ws));
      });

      console.log(`[ControlWS] Hub listening on ws://localhost:${CONTROL_PORT}`);

      server.httpServer?.on('close', () => wss.close());
    },
  };
}
