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

// ─── API Client ───────────────────────────────────────────────────────────────
export { apiClient } from "./apiClient";

export type {
  HttpMethod,
  RequestConfig,
  ApiResponse,
  ApiError,
} from "./apiClient";
