/**
 * Custom hook for WebSocket connection to the backend.
 * Receives live telemetry and incident updates.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

// Derive the WebSocket URL from the current page origin so the connection goes
// through the Vite dev proxy on whatever port Vite picked. VITE_WS_URL can
// override this in production (e.g. wss://api.navner.gov.in/ws).
function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.VITE_API_URL) {
    const baseUrl = import.meta.env.VITE_API_URL.replace(/\/$/, '');
    return baseUrl.replace(/^http/, 'ws') + '/ws';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}
const RECONNECT_INTERVAL = 3000;

export function useWebSocket(onMessage) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);

  // Keep callback ref current without triggering reconnect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      console.log('[WS] Connected');
      setIsConnected(true);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current?.(data);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected — reconnecting...');
      setIsConnected(false);
      reconnectTimer.current = setTimeout(connect, RECONNECT_INTERVAL);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected };
}
