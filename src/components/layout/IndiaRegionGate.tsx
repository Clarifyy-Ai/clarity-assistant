import { Navigate } from "react-router-dom";
import { useIndiaRegion } from "@/hooks/useIndiaRegion";

interface IndiaRegionGateProps {
  children: React.ReactNode;
}

/** Gov exam route gate — currently a pass-through while region gating is disabled. */
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
