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

    const onDisplayCapture = (e: Event) => {
      const track = (e as any).track;
      if (track?.kind === 'video') {
        notify('recording');
      }
    };

    try {
      navigator.mediaDevices?.addEventListener?.('devicechange', onDisplayCapture);
    } catch (_) {}

    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      try {
        navigator.mediaDevices?.removeEventListener?.('devicechange', onDisplayCapture);
      } catch (_) {}
    };
  }, [isActive, notify]);

  return <>{children}</>;
}

export default ScreenCaptureBlocker;
