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

      wss.on('connection', (ws) => {
        clients.add(ws);

        ws.on('close', () => clients.delete(ws));

        ws.on('message', (data) => {
          const raw = data.toString();
          clients.forEach(c => {
            if (c !== ws && c.readyState === 1) c.send(raw);
          });
        });

        ws.on('error', () => clients.delete(ws));
      });

      console.log(`[ControlWS] Hub listening on ws://localhost:${CONTROL_PORT}`);

      server.httpServer?.on('close', () => wss.close());
    },
  };
}
