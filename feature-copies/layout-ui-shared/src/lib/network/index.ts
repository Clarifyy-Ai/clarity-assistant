// ─── Network Monitor ─────────────────────────────────────────────────────────
export {
  NetworkMonitor,
  networkMonitor,
  startNetworkMonitoring,
  getConnectionQualityLabel,
  getConnectionQualityColor,
  shouldWarnAboutLatency,
} from "./networkMonitor";

// ─── WebSocket Manager ────────────────────────────────────────────────────────
export {
  WebSocketManager,
  createWebSocket,
} from "./webSocketManager";

export type {
  WSReadyState,
  WSMessage,
  WSMessageType,
  WSManagerConfig,
  WSManagerStats,
} from "./webSocketManager";

// ─── API Client (deprecated shim — prefer fetchEdge / @/lib/api/apiClient) ────
/** @deprecated Use `@/lib/api/apiClient` or `@/lib/network/fetchEdge`. */
export { ApiClientError } from "./apiClient";
/** @deprecated Use `@/lib/api/apiClient`. */
export type { HttpMethod } from "./apiClient";
