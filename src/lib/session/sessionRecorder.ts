// src/lib/session/sessionRecorder.ts
// Encrypted audio recording for mock sessions, chunked upload to Supabase Storage. [file:1][file:3]

import { supabaseBrowserClient } from "@/lib/supabaseBrowserClient";
import { useAudioStore } from "@/store/audioStore";

export interface SessionRecorderOptions {
  encrypted: boolean;
  format: "webm-opus";
}

export class SessionRecorder {
  private mediaRecorder?: MediaRecorder;
  private audioChunks: Blob[] = [];
  private sessionId: string;
  private encryptionKey?: CryptoKey;
  private options: SessionRecorderOptions;

  constructor(sessionId: string, options: SessionRecorderOptions) {
    this.sessionId = sessionId;
    this.options = options;
  }

  async start(): Promise<void> {
    const audioStore = useAudioStore.getState();
    const stream = await audioStore.getCombinedStream();

    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
      audioBitsPerSecond: 16000, // 16 kbps per manual [file:3]
    });

    this.mediaRecorder.ondataavailable = async (event) => {
      const chunk = event.data;
      if (!chunk || chunk.size === 0) return;

      let toStore: Blob = chunk;

      if (this.options.encrypted) {
        toStore = await this.encryptChunk(chunk);
      }

      this.audioChunks.push(toStore);
      void this.uploadChunk(toStore);
    };

    this.mediaRecorder.start(5000); // 5s chunks
  }

  async stop(): Promise<Blob> {
    if (!this.mediaRecorder) {
      return new Blob([], { type: "audio/webm" });
    }

    return new Promise<Blob>((resolve) => {
      this.mediaRecorder!.onstop = async () => {
        const finalBlob = new Blob(this.audioChunks, {
          type: "audio/webm",
        });
        await this.finalizeRecording(finalBlob);
        resolve(finalBlob);
      };
      this.mediaRecorder!.stop();
    });
  }

  /* ──────────────────────────────────────────────────────────── */
  /* Encryption + Upload                                         */
  /* ──────────────────────────────────────────────────────────── */

  private async encryptChunk(chunk: Blob): Promise<Blob> {
    if (!this.encryptionKey) {
      this.encryptionKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    }

    const arrayBuffer = await chunk.arrayBuffer();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      arrayBuffer,
    );

    // Store IV + ciphertext in one blob.
    return new Blob([iv, encrypted], {
      type: "application/octet-stream",
    });
  }

  private async uploadChunk(chunk: Blob): Promise<void> {
    const supabase = supabaseBrowserClient();
    const path = `sessions/${this.sessionId}/chunks/${Date.now()}.webm.enc`;

    const { error } = await supabase.storage
      .from("session-recordings")
      .upload(path, chunk, {
        contentType: chunk.type,
        upsert: false,
      });

    if (error) {
      console.error("[SessionRecorder] upload error:", error.message);
    }
  }

  private async finalizeRecording(finalBlob: Blob): Promise<void> {
    // Optionally upload a final merged blob or metadata.
    const supabase = supabaseBrowserClient();
    const path = `sessions/${this.sessionId}/final.${this.options.format}.enc`;

    const storedBlob = this.options.encrypted
      ? await this.encryptChunk(finalBlob)
      : finalBlob;

    const { error } = await supabase.storage
      .from("session-recordings")
      .upload(path, storedBlob, {
        contentType: storedBlob.type,
        upsert: true,
      });

    if (error) {
      console.error("[SessionRecorder] finalize upload error:", error.message);
    }
  }
}
