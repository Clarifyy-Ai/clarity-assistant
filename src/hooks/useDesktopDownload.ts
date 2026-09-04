import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { detectOs, osInstallLabel, type DetectedOs } from "@/lib/platform/detectOs";
import {
  DESKTOP_INSTALL_GUIDE_PATH,
  DESKTOP_INSTALLER_WIN_OBJECT,
  getPlatformDownloadUrlFromEnv,
  resolveAvailableWindowsInstallerHref,
  resolveDesktopDownloadUrl,
  startSameOriginInstallerDownload,
} from "@/lib/constants/desktopDownload";

export interface DesktopDownloadState {
  os: DetectedOs;
  osLabel: string;
  /** Probed, available installer URL — null when unpublished / unreachable. */
  url: string | null;
  loading: boolean;
  hasEnvUrl: boolean;
  installGuidePath: string;
  unavailableReason: string | null;
}

const UNAVAILABLE_COPY = "Desktop app not available yet.";

export function useDesktopDownload(): DesktopDownloadState & {
  download: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const os = detectOs();
  const osLabel = osInstallLabel(os);
  const hasEnvUrl = Boolean(getPlatformDownloadUrlFromEnv(os));

  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setUnavailableReason(null);
    try {
      const resolved = await resolveDesktopDownloadUrl(os);
      if (os === "windows") {
        const available = await resolveAvailableWindowsInstallerHref(resolved);
        if (available) {
          setUrl(available);
          setUnavailableReason(null);
        } else {
          setUrl(null);
          setUnavailableReason("unavailable");
        }
        return;
      }

      if (!resolved) {
        setUrl(null);
        setUnavailableReason("not_configured");
        return;
      }
      // Non-Windows: keep prior resolve without hard probe (DMG/AppImage paths vary).
      setUrl(resolved);
      setUnavailableReason(null);
    } catch {
      setUrl(null);
      setUnavailableReason("network_error");
    } finally {
      setLoading(false);
    }
  }, [os]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = useCallback(async () => {
    setLoading(true);
    try {
      if (os === "windows") {
        const available =
          (url && (await resolveAvailableWindowsInstallerHref(url))) ||
          (await resolveAvailableWindowsInstallerHref(await resolveDesktopDownloadUrl(os)));
        if (!available) {
          setUrl(null);
          setUnavailableReason("unavailable");
          toast.error(UNAVAILABLE_COPY, { duration: 6000 });
          return;
        }
        setUrl(available);
        startSameOriginInstallerDownload(available, DESKTOP_INSTALLER_WIN_OBJECT);
        toast.success(`Download starting — open ${DESKTOP_INSTALLER_WIN_OBJECT} when it finishes.`);
        return;
      }

      let target = url ?? (await resolveDesktopDownloadUrl(os));
      if (!target) {
        toast.error(UNAVAILABLE_COPY, { duration: 6000 });
        setUrl(null);
        return;
      }
      setUrl(target);
      startSameOriginInstallerDownload(target, DESKTOP_INSTALLER_WIN_OBJECT);
      toast.success(`Download starting — open ${DESKTOP_INSTALLER_WIN_OBJECT} when it finishes.`);
    } finally {
      setLoading(false);
    }
  }, [os, url]);

  return {
    os,
    osLabel,
    url,
    loading,
    hasEnvUrl,
    installGuidePath: DESKTOP_INSTALL_GUIDE_PATH,
    unavailableReason,
    download,
    refresh,
  };
}
