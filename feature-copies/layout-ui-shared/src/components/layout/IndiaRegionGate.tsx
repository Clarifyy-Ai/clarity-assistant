import { Navigate } from "react-router-dom";
import { useIndiaRegion } from "@/hooks/useIndiaRegion";

interface IndiaRegionGateProps {
  children: React.ReactNode;
}

/** Gov exam route gate — India-region users only (profile.region authoritative). */
export function IndiaRegionGate({
  children,
  fallback = "/app/dashboard",
}: IndiaRegionGateProps & { fallback?: string }) {
  const { isIndia } = useIndiaRegion();
  if (!isIndia) {
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
