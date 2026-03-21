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

    const checkActiveDisplayCapture = () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const hasActiveCapture = devices.some(
            (d) =>
              d.kind === 'videoinput' &&
              d.label &&
              /screen|display|monitor|window|tab/i.test(d.label)
          );
          if (hasActiveCapture) notify('sharing');
        }).catch(() => {});
      } catch (_) {}
    };

    checkActiveDisplayCapture();
    const interval = setInterval(checkActiveDisplayCapture, 15000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      clearInterval(interval);
    };
  }, [isActive, notify]);

  return <>{children}</>;
}

export default ScreenCaptureBlocker;
