// ─────────────────────────────────────────────────────────────────────────────
// webSocketManager.ts — Robust WebSocket client with auto-reconnect,
// heartbeat, message queuing, and typed event system.
// Used by Deepgram stream, realtime session sync, and live overlay comms.
// ─────────────────────────────────────────────────────────────────────────────

import { NetworkError, ErrorCode } from "@/lib/errors";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RECONNECT_DELAY_MS  = 1000;
const MAX_RECONNECT_DELAY_MS      = 30000;
const RECONNECT_BACKOFF_FACTOR    = 2;
const MAX_RECONNECT_ATTEMPTS      = 10;
const HEARTBEAT_INTERVAL_MS       = 25000;
const HEARTBEAT_TIMEOUT_MS        = 5000;
const MAX_QUEUE_SIZE              = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

export type WSReadyState = "connecting" | "open" | "closing" | "closed";

export type WSMessageType = "text" | "binary" | "json";

export interface WSMessage<T = unknown> {
  type: WSMessageType;
  data: T;
  timestamp: number;
}

export interface WSManagerConfig {
  url: string;
  protocols?: string | string[];
  reconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
  enableHeartbeat?: boolean;
  heartbeatPayload?: string;
  heartbeatIntervalMs?: number;
  binaryType?: BinaryType;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onMessage?: (message: WSMessage) => void;
  onError?: (error: NetworkError) => void;
  onReconnecting?: (attempt: number, delayMs: number) => void;
  onReconnected?: () => void;
  onMaxRetriesExceeded?: () => void;
}

export interface WSManagerStats {
  totalMessagesSent:     number;
  totalMessagesReceived: number;
  totalBytesReceived:    number;
  totalReconnects:       number;
  connectedAt:           number | null;
  uptimeMs:              number;
  queuedMessages:        number;
}

// ─── WebSocketManager ─────────────────────────────────────────────────────────

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: Required<WSManagerConfig>;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];
  private isIntentionallyClosed = false;
  private connectedAt: number | null = null;

  private stats: WSManagerStats = {
    totalMessagesSent:     0,
    totalMessagesReceived: 0,
    totalBytesReceived:    0,
    totalReconnects:       0,
    connectedAt:           null,
    uptimeMs:              0,
    queuedMessages:        0,
  };

  constructor(config: WSManagerConfig) {
    this.config = {
      protocols:             config.protocols             ?? [],
      reconnect:             config.reconnect             ?? true,
      maxReconnectAttempts:  config.maxReconnectAttempts  ?? MAX_RECONNECT_ATTEMPTS,
      reconnectDelayMs:      config.reconnectDelayMs      ?? DEFAULT_RECONNECT_DELAY_MS,
      enableHeartbeat:       config.enableHeartbeat       ?? true,
      heartbeatPayload:      config.heartbeatPayload      ?? "ping",
      heartbeatIntervalMs:   config.heartbeatIntervalMs   ?? HEARTBEAT_INTERVAL_MS,
      binaryType:            config.binaryType            ?? "arraybuffer",
      onOpen:                config.onOpen                ?? (() => {}),
      onClose:               config.onClose               ?? (() => {}),
      onMessage:             config.onMessage             ?? (() => {}),
      onError:               config.onError               ?? (() => {}),
      onReconnecting:        config.onReconnecting        ?? (() => {}),
      onReconnected:         config.onReconnected         ?? (() => {}),
      onMaxRetriesExceeded:  config.onMaxRetriesExceeded  ?? (() => {}),
      url:                   config.url,
    };
  }

  // ── Connect ────────────────────────────────────────────────────────────────
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.isIntentionallyClosed = false;
    this.createSocket();
  }

  private createSocket(): void {
    try {
      this.ws = new WebSocket(this.config.url, this.config.protocols);
      this.ws.binaryType = this.config.binaryType;

      this.ws.onopen    = this.handleOpen.bind(this);
      this.ws.onclose   = this.handleClose.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror   = this.handleError.bind(this);
    } catch (error) {
      const netErr = new NetworkError(
        `WebSocket failed to connect to ${this.config.url}: ${error}`,
        ErrorCode.NETWORK_WEBSOCKET_CLOSED
      );
      this.config.onError(netErr);
      this.scheduleReconnect();
    }
  }

  // ── Event Handlers ─────────────────────────────────────────────────────────
  private handleOpen(event: Event): void {
    this.reconnectAttempts = 0;
    this.connectedAt = Date.now();
    this.stats.connectedAt = this.connectedAt;

    if (this.stats.totalReconnects > 0) {
      this.config.onReconnected();
    }

    // Flush queued messages
    this.flushQueue();

    // Start heartbeat
    if (this.config.enableHeartbeat) {
      this.startHeartbeat();
    }

    this.config.onOpen(event);
  }

  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();
    this.updateUptime();

    this.config.onClose(event);

    if (!this.isIntentionallyClosed && this.config.reconnect) {
      this.scheduleReconnect();
    }
  }

  private handleMessage(event: MessageEvent): void {
    this.stats.totalMessagesReceived++;

    // Reset heartbeat timeout on any incoming message
    this.resetHeartbeatTimeout();

    const message = this.parseMessage(event);
    this.config.onMessage(message);
  }

  private handleError(_event: Event): void {
    const netErr = new NetworkError(
      "WebSocket encountered an error.",
      ErrorCode.NETWORK_WEBSOCKET_CLOSED,
      { url: this.config.url, readyState: this.ws?.readyState }
    );
    this.config.onError(netErr);
  }

  // ── Message Parsing ────────────────────────────────────────────────────────
  private parseMessage(event: MessageEvent): WSMessage {
    const timestamp = Date.now();

    if (event.data instanceof ArrayBuffer) {
      this.stats.totalBytesReceived += event.data.byteLength;
      return { type: "binary", data: event.data, timestamp };
    }

    if (typeof event.data === "string") {
      try {
        const parsed = JSON.parse(event.data);
        return { type: "json", data: parsed, timestamp };
      } catch {
        return { type: "text", data: event.data, timestamp };
      }
    }

    return { type: "binary", data: event.data, timestamp };
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(data as any);
        this.stats.totalMessagesSent++;
        return true;
      } catch (error) {
        this.config.onError(
          new NetworkError(
            `WebSocket send failed: ${error}`,
            ErrorCode.NETWORK_WEBSOCKET_CLOSED
          )
        );
        return false;
      }
    }

    // Queue message for when connection is restored
    if (this.messageQueue.length < MAX_QUEUE_SIZE) {
      this.messageQueue.push(data);
      this.stats.queuedMessages = this.messageQueue.length;
    }

    return false;
  }

  sendJSON<T>(payload: T): boolean {
    return this.send(JSON.stringify(payload));
  }

  sendBinary(buffer: ArrayBufferLike | ArrayBufferView): boolean {
    return this.send(buffer);
  }

  // ── Queue Flush ────────────────────────────────────────────────────────────
  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()!;
      this.send(msg);
    }
    this.stats.queuedMessages = 0;
  }

  clearQueue(): void {
    this.messageQueue = [];
    this.stats.queuedMessages = 0;
  }

  // ── Reconnect ──────────────────────────────────────────────────────────────
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.config.onMaxRetriesExceeded();
      return;
    }

    const delay = Math.min(
      this.config.reconnectDelayMs *
        Math.pow(RECONNECT_BACKOFF_FACTOR, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );

    this.reconnectAttempts++;
    this.stats.totalReconnects++;
    this.config.onReconnecting(this.reconnectAttempts, delay);

    this.reconnectTimer = setTimeout(() => {
      this.createSocket();
    }, delay);
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(this.config.heartbeatPayload);

        // Set timeout: if no response, treat as dead connection
        this.heartbeatTimeoutTimer = setTimeout(() => {
          this.config.onError(
            new NetworkError(
              "WebSocket heartbeat timed out — reconnecting.",
              ErrorCode.NETWORK_TIMEOUT
            )
          );
          this.ws?.close();
        }, HEARTBEAT_TIMEOUT_MS);
      }
    }, this.config.heartbeatIntervalMs);
  }

  private resetHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.resetHeartbeatTimeout();
  }

  // ── Uptime Tracking ────────────────────────────────────────────────────────
  private updateUptime(): void {
    if (this.connectedAt) {
      this.stats.uptimeMs += Date.now() - this.connectedAt;
      this.connectedAt = null;
    }
  }

  // ── State ──────────────────────────────────────────────────────────────────
  getReadyState(): WSReadyState {
    switch (this.ws?.readyState) {
      case WebSocket.CONNECTING: return "connecting";
      case WebSocket.OPEN:       return "open";
      case WebSocket.CLOSING:    return "closing";
      default:                   return "closed";
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getStats(): Readonly<WSManagerStats> {
    return {
      ...this.stats,
      uptimeMs: this.stats.uptimeMs + (this.connectedAt ? Date.now() - this.connectedAt : 0),
      queuedMessages: this.messageQueue.length,
    };
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────
  disconnect(code = 1000, reason = "Client disconnected"): void {
    this.isIntentionallyClosed = true;
    this.stopHeartbeat();
    this.clearQueue();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(code, reason);
      this.ws = null;
    }

    this.updateUptime();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and immediately connect a WebSocketManager.
 *
 * @example
 * const ws = createWebSocket({
 *   url: "wss://api.deepgram.com/v1/listen",
 *   onMessage: (msg) => handleTranscript(msg.data),
 *   onReconnecting: (attempt) => toast.info(`Reconnecting (${attempt})...`),
 * });
 */
export function createWebSocket(config: WSManagerConfig): WebSocketManager {
  const manager = new WebSocketManager(config);
  manager.connect();
  return manager;
}
