import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { analyticsDB } from "@/lib/supabase/database";

/**
 * Legacy /app/guide route — redirects to /help and logs migration analytics.
 */
export default function Guide() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user?.id) return;
    void analyticsDB.track({
      event_type: "guide_redirect",
      user_id: user.id,
      properties: { from: "/app/guide", to: "/help" },
    });
  }, [user?.id]);

  return <Navigate to="/help" replace />;
}
