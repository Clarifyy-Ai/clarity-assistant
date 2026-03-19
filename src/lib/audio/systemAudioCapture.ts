// System audio capture (Chrome / Edge only)
// NOTE: User MUST choose "Share audio" in the share picker.
export async function startSystemAudioCapture(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("System audio capture not supported in this browser.");
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      // A video track is REQUIRED in Chrome/Edge for system audio
      video: {
        width: { ideal: 1 },
        height: { ideal: 1 },
      },
    });

    // Stop video track immediately – we only want audio
    stream.getVideoTracks().forEach((t) => t.stop());

    if (stream.getAudioTracks().length === 0) {
      throw new Error(
        "No system audio track detected. Make sure you selected ‘Share audio’ in the screen share dialog."
      );
    }

    return stream;
  } catch (err: any) {
    if (err?.name === "NotAllowedError") {
      throw new Error("Permission denied. Please allow system audio capture.");
    }
    throw new Error("System audio capture failed: " + (err?.message ?? err));
  }
}

export function stopSystemAudioCapture(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
