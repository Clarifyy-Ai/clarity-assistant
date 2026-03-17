// Stub: mic capture utility
export async function startMicCapture(deviceId?: string | null): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  };
  return navigator.mediaDevices.getUserMedia(constraints);
}

export function stopMicCapture(stream: MediaStream | null): void {
  stream?.getTracks().forEach(t => t.stop());
}
