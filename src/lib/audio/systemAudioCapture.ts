// Stub: system audio capture utility
export async function startSystemAudioCapture(): Promise<MediaStream> {
  const stream = await (navigator.mediaDevices as any).getDisplayMedia({
    audio: true,
    video: false,
  });
  return stream;
}

export function stopSystemAudioCapture(stream: MediaStream | null): void {
  stream?.getTracks().forEach(t => t.stop());
}
