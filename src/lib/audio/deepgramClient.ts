// Stub: Deepgram client
export class DeepgramClient {
  private ws: WebSocket | null = null;
  
  async connect(apiKey: string, onTranscript: (data: any) => void): Promise<void> {
    // Stub implementation
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  send(data: Blob | ArrayBuffer): void {
    this.ws?.send(data);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const deepgramClient = new DeepgramClient();
