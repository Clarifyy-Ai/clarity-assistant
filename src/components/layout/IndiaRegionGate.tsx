import { Navigate } from "react-router-dom";
import { useIndiaRegion } from "@/hooks/useIndiaRegion";

interface IndiaRegionGateProps {
  children: React.ReactNode;
}

/** Blocks India-only routes (Gov Exam Mock Tests) for users outside India. */
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
