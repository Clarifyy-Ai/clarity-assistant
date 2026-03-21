import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface ScreenCaptureBlockerProps {
  isActive?: boolean;
  onCaptureDetected?: (type: 'recording' | 'sharing') => void;
  children?: React.ReactNode;
}

export function ScreenCaptureBlocker({
  isActive = true,
  onCaptureDetected,
  children,
}: ScreenCaptureBlockerProps) {
  const notifiedTypes = useRef<Set<string>>(new Set());

  const notify = useCallback((type: 'recording' | 'sharing') => {
    if (notifiedTypes.current.has(type)) return;
    notifiedTypes.current.add(type);
    onCaptureDetected?.(type);
    toast.warning(
      type === 'recording'
        ? 'Screen recording detected — overlay may be visible to capture software.'
        : 'Screen sharing detected — consider enabling Stealth Mode (Ctrl+Shift+S).',
      { duration: 8000 }
    );
  }, [onCaptureDetected]);

  useEffect(() => {
    if (!isActive) {
      notifiedTypes.current.clear();
      return;
    }

    const handleVisChange = () => {
      if (document.visibilityState === 'visible') {
        notifiedTypes.current.clear();
      }
    };
    document.addEventListener('visibilitychange', handleVisChange);

    const checkDevicesForCapture = () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        for (const d of devices) {
          if (d.kind !== 'videoinput' || !d.label) continue;
          const label = d.label.toLowerCase();
          if (/screen|display|monitor|window|tab/.test(label)) {
            if (/share|cast|present/.test(label)) {
              notify('sharing');
            } else {
              notify('recording');
            }
            break;
          }
        }
      }).catch(() => {});
    };

    checkDevicesForCapture();
    const interval = setInterval(checkDevicesForCapture, 15000);

    const onDeviceChange = () => {
      checkDevicesForCapture();
    };
    try {
      navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    } catch (_) {}

    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      clearInterval(interval);
      try {
        navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      } catch (_) {}
    };
  }, [isActive, notify]);

  return <>{children}</>;
}

export default ScreenCaptureBlocker;
