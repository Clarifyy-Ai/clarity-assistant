import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { detectOs, osInstallLabel, type DetectedOs } from "@/lib/platform/detectOs";
import {
  DESKTOP_INSTALL_GUIDE_PATH,
  getPlatformDownloadUrlFromEnv,
  resolveDesktopDownloadUrl,
} from "@/lib/constants/desktopDownload";

export interface DesktopDownloadState {
  os: DetectedOs;
  osLabel: string;
  url: string | null;
  loading: boolean;
  hasEnvUrl: boolean;
  installGuidePath: string;
}

export function useDesktopDownload(): DesktopDownloadState & {
  download: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const os = detectOs();
  const osLabel = osInstallLabel(os);
  const hasEnvUrl = Boolean(getPlatformDownloadUrlFromEnv(os));

  const [url, setUrl] = useState<string | null>(() =>
    hasEnvUrl ? getPlatformDownloadUrlFromEnv(os) : null,
  );
  const [loading, setLoading] = useState(!hasEnvUrl);

  const refresh = useCallback(async () => {
    if (hasEnvUrl) {
      setUrl(getPlatformDownloadUrlFromEnv(os));
      return;
    }

    setLoading(true);
    try {
      const resolved = await resolveDesktopDownloadUrl(os);
      setUrl(resolved);
    } catch {
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }, [hasEnvUrl, os]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const download = useCallback(async () => {
    let target = url;
    if (!target) {
      setLoading(true);
      try {
        target = await resolveDesktopDownloadUrl(os);
        setUrl(target);
      } finally {
        setLoading(false);
      }
    }

    if (target) {
      window.open(target, "_blank", "noopener,noreferrer");
      toast.success(`Download started — open the ${osLabel} installer when it finishes.`);
      return;
    }

    toast.error(
      "Installer not published yet. Ask your admin to set VITE_DESKTOP_DOWNLOAD_URL_WIN or publish a GitHub Release.",
      { duration: 6000 },
    );
  }, [os, osLabel, url]);

  return {
    os,
    osLabel,
    url,
    loading,
    hasEnvUrl,
    installGuidePath: DESKTOP_INSTALL_GUIDE_PATH,
    download,
    refresh,
  };
}
