import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";

export const registerRealtime = async (app: FastifyInstance) => {
  const clients = new Set<{ send: (message: string) => void; readyState: number }>();
  await app.register(websocket);

  app.decorate("broadcast", (event: string, payload: unknown) => {
    const message = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
    clients.forEach((client) => {
      if (client.readyState === 1) client.send(message);
    });
  });

  app.get("/realtime", { websocket: true }, (connection) => {
    clients.add(connection.socket);
    connection.socket.on("close", () => clients.delete(connection.socket));
    connection.socket.send(JSON.stringify({ event: "connected", payload: { product: "NexPDV Cloud" } }));
  });
};
