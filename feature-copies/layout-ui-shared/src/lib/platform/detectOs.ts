export type DetectedOs = "windows" | "mac" | "linux" | "other";

export function detectOs(): DetectedOs {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "other";
}

export function osInstallLabel(os: DetectedOs): string {
  switch (os) {
    case "windows":
      return "Windows";
    case "mac":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return "your device";
  }
}
