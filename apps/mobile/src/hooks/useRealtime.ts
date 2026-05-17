import { useEffect, useState } from "react";
import { wsUrl } from "../services/api";

export interface RealtimeEvent {
  event: string;
  payload: unknown;
  sentAt?: string;
}

export const useRealtime = () => {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEvent;
        setEvents((current) => [event, ...current].slice(0, 20));
      } catch {
        setEvents((current) => [{ event: "raw", payload: message.data }, ...current].slice(0, 20));
      }
    };
    return () => socket.close();
  }, []);

  return { connected, events };
};
