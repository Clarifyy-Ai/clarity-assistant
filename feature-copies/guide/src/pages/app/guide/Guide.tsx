import { Navigate } from "react-router-dom";

/** Legacy /app/guide — authenticated setup lives under practice-coach. */
export default function Guide() {
  return <Navigate to="/app/guide/practice-coach" replace />;
}
