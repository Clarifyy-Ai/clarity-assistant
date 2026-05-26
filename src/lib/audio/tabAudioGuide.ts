/** User-facing instructions before Chromium tab-audio capture. */
export function confirmTabAudioCapture(): boolean {
  return window.confirm(
    "Capture Interviewer Audio\n\n" +
      "A screen share dialog will appear next.\n\n" +
      "1. Select the tab with your interview call (Meet/Zoom in browser)\n" +
      "2. Check \"Share tab audio\" at the bottom\n" +
      "3. Click Share\n\n" +
      "Desktop Zoom/Teams apps are not supported — use the browser tab.\n" +
      "No video is recorded — only audio is used for transcription."
  );
}
