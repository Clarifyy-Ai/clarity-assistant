import { useCallback, useEffect, useState } from "react";

/** Tracks browser online/offline state via navigator.onLine and window events. */
export function useIsOffline() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }

    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const retry = useCallback(() => {
    if (navigator.onLine) {
      setIsOffline(false);
    } else {
      window.location.reload();
    }
  }, []);

  return { isOffline, retry };
}
