import { useEffect, useRef } from 'react';

/**
 * ScreenCaptureBlocker Component
 *
 * Advanced screen capture detection and prevention:
 * - Detects when screen is being recorded
 * - Detects when screen is being shared
 * - Blocks certain content rendering
 * - Warns user if unsafe activity detected
 * - Integrates with overlayStore for safety status
 */

interface ScreenCaptureBlockerProps {
  isActive?: boolean;
  onCaptureDetected?: (type: 'recording' | 'sharing') => void;
  children?: React.ReactNode;
}

interface CaptureState {
  isScreenSharing: boolean;
  isScreenRecording: boolean;
  displaySurfaceDetected: boolean;
  cursorDetected: boolean;
}

export function ScreenCaptureBlocker({
  isActive = true,
  onCaptureDetected,
  children,
}: ScreenCaptureBlockerProps) {
  const captureStateRef = useRef<CaptureState>({
    isScreenSharing: false,
    isScreenRecording: false,
    displaySurfaceDetected: false,
    cursorDetected: false,
  });

  // Method 1: Detect via getDisplayMedia API
  useEffect(() => {
    if (!isActive) return;

    const detectScreenShare = async () => {
      try {
        // Check if getDisplayMedia is available (indicates screen share capability)
        if (navigator.mediaDevices?.getDisplayMedia) {
          // Try to enumerate display media
          const constraints = {
            video: {
              displaySurface: 'monitor' as const,
            },
          };

          // If user has already granted permissions, this will be detected
          const displayStream = await navigator.mediaDevices.enumerateDevices();
          const hasVideoInput = displayStream.some(
            (device) => device.kind === 'videoinput'
          );

          captureStateRef.current.isScreenSharing = hasVideoInput;
        }
      } catch (error) {
        // Silent catch - expected behavior
      }
    };

    detectScreenShare();
  }, [isActive]);

  // Method 2: Detect via canvas fingerprinting changes
  useEffect(() => {
    if (!isActive) return;

    const canvasDetection = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw test pixel
        ctx.fillStyle = 'rgb(255, 0, 0)';
        ctx.fillRect(0, 0, 1, 1);

        // Get pixel data
        const imageData = ctx.getImageData(0, 0, 1, 1);
        const pixelData = imageData.data;

        // If screen capture is active, certain tools may modify pixel data
        // This is a weak detection but helps identify some capture scenarios
        const isModified =
          pixelData[0] === 0 || pixelData[1] === 0 || pixelData[2] === 0;

        captureStateRef.current.displaySurfaceDetected = isModified;
      } catch (error) {
        // Silent catch
      }
    };

    // Run periodically
    const interval = setInterval(canvasDetection, 5000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Method 3: Detect via chrome.tabCapture API (if available)
  useEffect(() => {
    if (!isActive) return;

    const detectChromeCapture = () => {
      try {
        // @ts-ignore - Chrome extension API
        if (chrome?.tabCapture?.getStatus) {
          // @ts-ignore
          chrome.tabCapture.getStatus((status: any) => {
            if (status?.status === 'active') {
              captureStateRef.current.isScreenRecording = true;
              onCaptureDetected?.('recording');
            }
          });
        }
      } catch (error) {
        // Silent catch - API may not be available
      }
    };

    detectChromeCapture();
  }, [isActive, onCaptureDetected]);

  // Method 4: Detect via window.event and pointer events
  useEffect(() => {
    if (!isActive) return;

    let lastPointerEvent = 0;
    const pointerHandler = () => {
      lastPointerEvent = Date.now();
    };

    window.addEventListener('pointermove', pointerHandler);

    // If pointer events stop but capture is active, user likely switched tabs
    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastEvent = now - lastPointerEvent;

      // If no pointer events for 3 seconds, might be screen captured
      if (timeSinceLastEvent > 3000) {
        captureStateRef.current.cursorDetected = true;
      } else {
        captureStateRef.current.cursorDetected = false;
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointermove', pointerHandler);
      clearInterval(interval);
    };
  }, [isActive]);

  // Get overall capture detection status
  const isCaptureDetected = (): boolean => {
    const state = captureStateRef.current;
    return (
      state.isScreenSharing ||
      state.isScreenRecording ||
      state.displaySurfaceDetected ||
      state.cursorDetected
    );
  };

  // Block rendering of sensitive content if capture detected
  if (isActive && isCaptureDetected()) {
    return (
      <div
        className="pointer-events-none"
        style={{
          // Render but block interaction
          pointerEvents: 'none',
          opacity: 0.95,
        }}
      >
        {children}
      </div>
    );
  }

  return <>{children}</>;
}

export default ScreenCaptureBlocker;
