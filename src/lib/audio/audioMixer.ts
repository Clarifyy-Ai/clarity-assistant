// Stub: audio mixer utility
export function mixStreams(
  micStream: MediaStream | null,
  systemStream: MediaStream | null
): MediaStream | null {
  if (!micStream && !systemStream) return null;
  if (!micStream) return systemStream;
  if (!systemStream) return micStream;

  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();

  const micSource = ctx.createMediaStreamSource(micStream);
  micSource.connect(dest);

  const sysSource = ctx.createMediaStreamSource(systemStream);
  sysSource.connect(dest);

  return dest.stream;
}
